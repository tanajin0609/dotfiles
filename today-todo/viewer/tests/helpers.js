'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const SERVER_PATH = path.join(__dirname, '..', 'server.js');

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// テストで使う固定形状のフィクスチャ（todoファイル1本・PROJECTS_ROOT配下のプロジェクトディレクトリ1つ）を用意する。
function setupFixture() {
  const root = makeTempDir('viewer-fixture-');
  const todoDir = path.join(root, 'today-todo');
  const dataDir = path.join(root, 'data');
  const projectDir = path.join(root, 'demo-project');
  fs.mkdirSync(todoDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(projectDir, { recursive: true });
  const todoFile = 'todo-2026-01-01.md';
  fs.writeFileSync(path.join(todoDir, todoFile), [
    '# 2026-01-01',
    '',
    '## demo-project',
    '',
    '### group-a',
    '- [ ] タスクA',
    '',
  ].join('\n'));
  return { root, todoDir, dataDir, projectDir, todoFile };
}

// findFreePortで空きを確認してから子プロセスがlistenするまでの間に、並列実行中の別テストファイルが
// 同じポートを取ることがある。その場合/api/filesのポーリングは別テストのサーバーに当たって成功してしまうため、
// 自分の子プロセスがlisten成功時に出す1行で起動を判定し、EADDRINUSEで落ちたら別ポートで起動し直す。
function spawnAndWaitListening(port, env, timeoutMs) {
  const child = spawn(process.execPath, [SERVER_PATH], {
    // stop の後の待ち（既定3秒）はテストを遅くするだけなので、明示しないテストでは短くする。
    env: { ...process.env, VIEWER_STOP_SETTLE_MS: '50', VIEWER_PORT: String(port), ...env },
  });
  const stderrChunks = [];
  child.stderr.on('data', (chunk) => stderrChunks.push(chunk.toString()));
  return new Promise((resolve, reject) => {
    let stdout = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`viewer server did not become ready: ${stderrChunks.join('')}`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.includes(`todo viewer: http://localhost:${port}`)) {
        clearTimeout(timer);
        resolve({ child, addrInUse: false });
      }
    });
    child.once('exit', () => {
      clearTimeout(timer);
      const stderr = stderrChunks.join('');
      if (stderr.includes('EADDRINUSE')) return resolve({ child, addrInUse: true });
      reject(new Error(`viewer server exited early: ${stderr}`));
    });
  });
}

// server.jsを子プロセスで起動し、listenが成功するまで待って返す。
async function startViewerServer(env) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const port = await findFreePort();
    const { child, addrInUse } = await spawnAndWaitListening(port, env, 5000);
    if (addrInUse) continue;
    return {
      baseUrl: `http://127.0.0.1:${port}`,
      child,
      async stop() {
        if (child.exitCode !== null) return;
        child.kill();
        await new Promise((resolve) => child.once('exit', resolve));
      },
    };
  }
  throw new Error('viewer server could not find a free port after 5 attempts');
}

// `claude --bg`互換の1行（`backgrounded · <id> · <name>`）を返す偽実行ファイルを作る。
// 呼ばれるたびにcallLogPathへ引数付きで1行追記するので、呼び出し回数・引数をテスト側で検証できる。
// `stop <id>`引数で呼ばれた場合は呼び出しを記録するだけで終了コード0を返す。
function writeFakeClaude(binDir, { jobId = 'a1b2c3', delayMs = 200, callLogPath }) {
  fs.mkdirSync(binDir, { recursive: true });
  const scriptPath = path.join(binDir, 'claude');
  const script = `#!/bin/sh
echo "$@" | tr '\\n' ' ' >> "${callLogPath}"
echo >> "${callLogPath}"
if [ "$1" = "stop" ] || [ "$1" = "rm" ]; then
  exit 0
fi
sleep ${(delayMs / 1000).toFixed(3)}
echo "backgrounded · ${jobId} · fake-session"
`;
  fs.writeFileSync(scriptPath, script);
  fs.chmodSync(scriptPath, 0o755);
  return scriptPath;
}

// CLI 2.1.291 の実測（docs/changes/v0.26.1-…/claude-integration-audit.md §5）に合わせて、jobsDir の state.json を読み書きする偽の claude。
// - 登録済みセッションの `--resume` にプロンプト以外の引数があると own-options のコピーになる
// - copyNote: false でコピー時の note を出さない（実機で note 無しのままコピーになった事例の再現）
// - stop していないジョブ、または stop 済みでも最初の runningResumesAfterStop 回の resume は running のコピーになる（stop 直後の判定の再現）
// - stop は state.json を変えない（印は jobsDir/<id>/.fake-stopped）
// - 未登録の UUID（分岐・rm 済み）の resume は UUID の先頭8文字を jobId にして起動する
// hangMs を指定すると `--bg` はジョブを作った後に hangMs 眠る（timeout の再現）。
function writeStatefulFakeClaude(binDir, {
  jobsDir, callLogPath, runningResumesAfterStop = 0, newJobId = null, delayMs = 20, hangMs = 0, newState = 'working', copyNote = true,
}) {
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(jobsDir, { recursive: true });
  const scriptPath = path.join(binDir, 'claude');
  const script = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jobsDir = ${JSON.stringify(jobsDir)};
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(callLogPath)}, args.join(' ').replace(/\\n/g, ' ') + '\\n');
const statePath = (id) => path.join(jobsDir, id, 'state.json');
const readState = (id) => JSON.parse(fs.readFileSync(statePath(id), 'utf-8'));
function writeJob(id, state, meta) {
  fs.mkdirSync(path.join(jobsDir, id), { recursive: true });
  fs.writeFileSync(statePath(id), JSON.stringify(state));
  fs.writeFileSync(path.join(jobsDir, id, '.fake-meta'), JSON.stringify(meta));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runningLeftPath = path.join(jobsDir, '.fake-running-left');
function consumeRunningAfterStop() {
  const left = fs.existsSync(runningLeftPath) ? Number(fs.readFileSync(runningLeftPath, 'utf-8')) : ${Number(runningResumesAfterStop)};
  if (left <= 0) return false;
  fs.writeFileSync(runningLeftPath, String(left - 1));
  return true;
}
(async () => {
  if (args[0] === 'stop') {
    if (fs.existsSync(path.join(jobsDir, args[1]))) fs.writeFileSync(path.join(jobsDir, args[1], '.fake-stopped'), String(Date.now()));
    console.log('stopped ' + args[1]);
    return;
  }
  if (args[0] === 'rm') {
    fs.rmSync(path.join(jobsDir, args[1]), { recursive: true, force: true });
    return;
  }
  if (args[0] === 'agents') {
    const list = fs.readdirSync(jobsDir).filter((id) => !id.startsWith('.') && fs.existsSync(path.join(jobsDir, id, '.fake-meta')))
      .map((id) => ({ id, kind: 'background', ...JSON.parse(fs.readFileSync(path.join(jobsDir, id, '.fake-meta'), 'utf-8')), state: 'working' }));
    console.log(JSON.stringify(list));
    return;
  }
  await sleep(${Number(delayMs)});
  const rest = args.filter((a) => a !== '--bg' && a !== '--');
  const resumeAt = rest.indexOf('--resume');
  const prompt = rest[rest.length - 1];
  const nameAt = rest.indexOf('-n');
  const meta = { name: nameAt >= 0 ? rest[nameAt + 1] : null, cwd: process.cwd(), startedAt: Date.now() };
  let id;
  if (resumeAt >= 0) {
    const sid = rest[resumeAt + 1];
    const extra = rest.filter((a, i) => i !== resumeAt && i !== resumeAt + 1 && i !== rest.length - 1);
    const owner = fs.readdirSync(jobsDir).find((d) => {
      try {
        const st = readState(d);
        return st.sessionId === sid || (!!st.linkScanPath && path.basename(st.linkScanPath) === sid + '.jsonl');
      } catch { return false; }
    });
    if (owner) {
      const stoppedFile = path.join(jobsDir, owner, '.fake-stopped');
      const running = !fs.existsSync(stoppedFile) || consumeRunningAfterStop();
      if (extra.length > 0 || running) {
        id = ${JSON.stringify(newJobId)} || crypto.randomBytes(4).toString('hex');
        const reason = running ? 'is already running in the background, so this started a copy' : 'keeps its own saved options, so the flags you passed started a copy';
        if (${JSON.stringify(copyNote)}) console.log('note: session ' + owner + ' ' + reason + ' as ' + id);
        meta.copy = true;
        writeJob(id, { state: ${JSON.stringify(newState)}, sessionId: crypto.randomUUID() }, meta);
      } else {
        id = owner;
        fs.rmSync(stoppedFile, { force: true });
        const prev = readState(owner);
        fs.writeFileSync(statePath(owner), JSON.stringify({ ...prev, state: ${JSON.stringify(newState)}, tempo: 'active', needs: undefined }));
        console.log('note: woke session ' + owner + ' with its saved options (-n, --model).');
      }
    } else {
      id = sid.slice(0, 8);
      writeJob(id, { state: ${JSON.stringify(newState)}, sessionId: sid }, meta);
    }
  } else {
    id = ${JSON.stringify(newJobId)} || crypto.randomBytes(4).toString('hex');
    writeJob(id, { state: ${JSON.stringify(newState)}, sessionId: crypto.randomUUID() }, meta);
  }
  fs.appendFileSync(${JSON.stringify(callLogPath)}, '# prompt: ' + prompt.replace(/\\n/g, '\\\\n') + '\\n');
  if (${Number(hangMs)} > 0) await sleep(${Number(hangMs)});
  // 実機のCLIはコピーを起動したとき名前を付けない。
  console.log(meta.copy ? 'backgrounded · ' + id : 'backgrounded · ' + id + ' · ' + (meta.name || 'fake'));
})();
`;
  fs.writeFileSync(scriptPath, script);
  fs.chmodSync(scriptPath, 0o755);
  return scriptPath;
}

// 偽の claude の呼び出しログから、引数の行だけを返す（`# prompt:` の行を除く）。
function readCalls(callLogPath) {
  if (!fs.existsSync(callLogPath)) return [];
  return fs.readFileSync(callLogPath, 'utf-8').split('\n').filter((l) => l && !l.startsWith('# prompt: '));
}

function readPrompts(callLogPath) {
  if (!fs.existsSync(callLogPath)) return [];
  return fs.readFileSync(callLogPath, 'utf-8').split('\n').filter((l) => l.startsWith('# prompt: ')).map((l) => l.slice(10));
}

function countLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  return fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean).length;
}

module.exports = {
  SERVER_PATH,
  findFreePort,
  makeTempDir,
  setupFixture,
  startViewerServer,
  writeFakeClaude,
  writeStatefulFakeClaude,
  readCalls,
  readPrompts,
  countLines,
};
