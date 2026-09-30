'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer } = require('./helpers');

// AC-F6-SRV-1
test('GET /api/board/version は存在するtodoファイルのmtimeMsを200で返す', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
  });
  try {
    const expected = fs.statSync(path.join(fixture.todoDir, fixture.todoFile)).mtimeMs;
    const res = await fetch(`${server.baseUrl}/api/board/version?file=${fixture.todoFile}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.mtimeMs, expected);
  } finally {
    await server.stop();
  }
});

// AC-F6-SRV-1
test('GET /api/board/version は不正なファイル名に400を返す', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
  });
  try {
    const res = await fetch(`${server.baseUrl}/api/board/version?file=../secret.md`);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'invalid file name' });
  } finally {
    await server.stop();
  }
});

// AC-F6-SRV-1
test('GET /api/board/version は存在しないファイルに404を返す', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
  });
  try {
    const res = await fetch(`${server.baseUrl}/api/board/version?file=todo-2099-12-31.md`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'not found' });
  } finally {
    await server.stop();
  }
});

// AC-F6-SRV-2
test('GET /api/board の応答にtodoファイルのmtimeMsが含まれる', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
  });
  try {
    const expected = fs.statSync(path.join(fixture.todoDir, fixture.todoFile)).mtimeMs;
    const res = await fetch(`${server.baseUrl}/api/board?file=${fixture.todoFile}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.mtimeMs, expected);
  } finally {
    await server.stop();
  }
});
