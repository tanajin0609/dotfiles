'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer } = require('./helpers');

// AC-F4-SRV-1
// parseBoardはmarkdownを正規表現で走査するだけで、文字列入力そのものから例外を投げる経路が無い。
// 例外は読み込み側（fs.readFileSync）でも同じcatchに入るため、todoファイル名のパスをディレクトリに
// して読み込みエラー（EISDIR）を起こし、「解析中の例外」と同じ500応答経路を検証する。
test('todoファイルが読み込めない場合はプロセスを落とさず500 parse failedを返す', async () => {
  const fixture = setupFixture();
  const brokenFile = 'todo-2026-02-02.md';
  fs.mkdirSync(path.join(fixture.todoDir, brokenFile));
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
  });
  try {
    const res = await fetch(`${server.baseUrl}/api/board?file=${brokenFile}`);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, 'parse failed');
    assert.equal(typeof body.detail, 'string');

    const stillAlive = await fetch(`${server.baseUrl}/api/files`);
    assert.equal(stillAlive.status, 200);
  } finally {
    await server.stop();
  }
});

// 400/404は従来どおり（AC-F4-SRV-1で追加した500応答と混同しないための回帰確認）
test('GET /api/board は不正なファイル名に400、存在しないファイルに404を返す', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
  });
  try {
    const invalid = await fetch(`${server.baseUrl}/api/board?file=../secret.md`);
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: 'invalid file name' });

    const missing = await fetch(`${server.baseUrl}/api/board?file=todo-2099-12-31.md`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'not found' });
  } finally {
    await server.stop();
  }
});
