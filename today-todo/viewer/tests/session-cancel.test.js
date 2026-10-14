'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer, writeFakeClaude, readCalls } = require('./helpers');

const FILE = 'todo-2026-01-01.md';

function writeData(dataDir, kind, map) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, `${kind}-todo-2026-01-01.json`), JSON.stringify(map));
}

function readComments(dataDir) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, 'comments-todo-2026-01-01.json'), 'utf-8'));
}

async function withServer(fn) {
  const fixture = setupFixture();
  const callLog = path.join(fixture.root, 'claude-calls.log');
  writeFakeClaude(path.join(fixture.root, 'bin'), { callLogPath: callLog });
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
    PATH: `${path.join(fixture.root, 'bin')}:${process.env.PATH}`,
  });
  try {
    await fn({ fixture, callLog, baseUrl: server.baseUrl });
  } finally {
    await server.stop();
  }
}

async function postCancel(baseUrl, payload) {
  const res = await fetch(`${baseUrl}/api/session/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json() };
}

const COMMENTS = {
  'group-a': [{ text: '前の依頼', at: '2026-01-01T00:00:00.000Z' }, { text: '誤送信', at: '2026-01-01T00:01:00.000Z' }],
};

// AC-UN-SRV-1
test('現在のセッションのjobIdを渡すとclaude stopし、atが一致するコメントだけ削除する', async () => {
  await withServer(async ({ fixture, callLog, baseUrl }) => {
    writeData(fixture.dataDir, 'comments', COMMENTS);
    writeData(fixture.dataDir, 'sessions', { 'group-a': { jobId: 'job111' } });
    const { status, body } = await postCancel(baseUrl, { file: FILE, groupId: 'group-a', at: '2026-01-01T00:01:00.000Z', jobId: 'job111' });
    assert.equal(status, 200);
    assert.equal(body.stopped, true);
    assert.deepEqual(body.comments.map((c) => c.text), ['前の依頼']);
    assert.deepEqual(readComments(fixture.dataDir)['group-a'].map((c) => c.text), ['前の依頼']);
    assert.deepEqual(readCalls(callLog).map((l) => l.trim()), ['stop job111']);
  });
});

test('jobIdが現在のセッションと違えば409で、停止もコメント削除もしない', async () => {
  await withServer(async ({ fixture, callLog, baseUrl }) => {
    writeData(fixture.dataDir, 'comments', COMMENTS);
    writeData(fixture.dataDir, 'sessions', { 'group-a': { jobId: 'job222' } });
    const { status, body } = await postCancel(baseUrl, { file: FILE, groupId: 'group-a', at: '2026-01-01T00:01:00.000Z', jobId: 'job111' });
    assert.equal(status, 409);
    assert.deepEqual(body, { error: 'session changed' });
    assert.equal(readComments(fixture.dataDir)['group-a'].length, 2);
    assert.deepEqual(readCalls(callLog), []);
  });
});

test('jobIdなしならclaudeを呼ばずコメントだけ削除する', async () => {
  await withServer(async ({ fixture, callLog, baseUrl }) => {
    writeData(fixture.dataDir, 'comments', COMMENTS);
    const { status, body } = await postCancel(baseUrl, { file: FILE, groupId: 'group-a', at: '2026-01-01T00:01:00.000Z' });
    assert.equal(status, 200);
    assert.equal(body.stopped, false);
    assert.equal(body.comments.length, 1);
    assert.deepEqual(readCalls(callLog), []);
  });
});

test('atが文字列でなければ400', async () => {
  await withServer(async ({ baseUrl }) => {
    const { status } = await postCancel(baseUrl, { file: FILE, groupId: 'group-a' });
    assert.equal(status, 400);
  });
});
