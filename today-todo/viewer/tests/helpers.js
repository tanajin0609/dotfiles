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
    env: { ...process.env, VIEWER_PORT: String(port), ...env },
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
  countLines,
};
