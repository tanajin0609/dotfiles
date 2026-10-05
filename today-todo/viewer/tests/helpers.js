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

async function waitUntilReady(baseUrl, child, stderrChunks, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`viewer server exited early: ${stderrChunks.join('')}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/files`);
      if (res.ok) return;
    } catch {
      // まだ起動していない。リトライする。
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`viewer server did not become ready: ${stderrChunks.join('')}`);
}

// server.jsを子プロセスで起動し、`/api/files`が応答するまで待って返す。
async function startViewerServer(env) {
  const port = await findFreePort();
  const child = spawn(process.execPath, [SERVER_PATH], {
    env: { ...process.env, VIEWER_PORT: String(port), ...env },
  });
  const stderrChunks = [];
  child.stderr.on('data', (chunk) => stderrChunks.push(chunk.toString()));
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitUntilReady(baseUrl, child, stderrChunks, 5000);
  return {
    baseUrl,
    child,
    async stop() {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
    },
  };
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
