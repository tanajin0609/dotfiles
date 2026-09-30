'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer, writeFakeClaude, SERVER_PATH } = require('./helpers');

// AC-SRV-CFG-1
test('VIEWER_TODO_DIR/VIEWER_DATA_DIRで指定したディレクトリを使う', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
  });
  try {
    const files = await (await fetch(`${server.baseUrl}/api/files`)).json();
    assert.deepEqual(files, [fixture.todoFile]);

    await fetch(`${server.baseUrl}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: fixture.todoFile, groupId: 'group-a', text: 'メモ' }),
    });
    const savedPath = path.join(fixture.dataDir, `comments-${fixture.todoFile.replace(/\.md$/, '')}.json`);
    assert.ok(fs.existsSync(savedPath));
  } finally {
    await server.stop();
  }
});

// AC-SRV-CFG-1（PROJECTS_ROOTはTODO_DIRの親ディレクトリ）
test('PROJECTS_ROOTはVIEWER_TODO_DIRの親ディレクトリとして解決される', async () => {
  const fixture = setupFixture();
  const callLogDir = path.join(fixture.root, 'bin');
  const callLog = path.join(fixture.root, 'claude-calls.log');
  writeFakeClaude(callLogDir, { callLogPath: callLog, delayMs: 50 });
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
    PATH: `${callLogDir}:${process.env.PATH}`,
  });
  try {
    // fixture.projectDir（= fixture.root/demo-project）を起動先として解決できることが、
    // PROJECTS_ROOT = VIEWER_TODO_DIR の親ディレクトリになっている証拠になる。
    const res = await fetch(`${server.baseUrl}/api/session/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: fixture.todoFile,
        groupId: 'group-a',
        columnName: 'demo-project',
        groupTitle: 'demo-project',
        text: '実行してください',
      }),
    });
    assert.equal(res.status, 200);
  } finally {
    await server.stop();
  }
});

// AC-SRV-CFG-1（既定値。実サーバーはポート3131で稼働中のため、既定値のまま起動して確認することはせずソースで確認する）
test('環境変数未指定時の既定値はソース上3131 / VIEWER_TODO_DIRの親 / viewer/dataのままである', () => {
  const src = fs.readFileSync(SERVER_PATH, 'utf-8');
  assert.match(src, /const PORT = process\.env\.VIEWER_PORT \? Number\(process\.env\.VIEWER_PORT\) : 3131;/);
  assert.match(src, /: path\.resolve\(__dirname, '\.\.'\);/);
  assert.match(src, /: path\.join\(__dirname, 'data'\);/);
});
