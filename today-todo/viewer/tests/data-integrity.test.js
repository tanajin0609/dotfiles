'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer } = require('./helpers');

// AC-DI-SRV-1
test('壊れた sessions/comments の記録は空として扱い、退避して /api/board の dataWarnings に出す', async () => {
  const fixture = setupFixture();
  const sessionsPath = path.join(fixture.dataDir, 'sessions-todo-2026-01-01.json');
  const commentsPath = path.join(fixture.dataDir, 'comments-todo-2026-01-01.json');
  fs.writeFileSync(sessionsPath, '{"group-a": {"jobId": "abc"');
  fs.writeFileSync(commentsPath, 'not json');
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    const res = await fetch(`${server.baseUrl}/api/board?file=${fixture.todoFile}`);
    assert.equal(res.status, 200);
    const board = await res.json();
    const files = board.dataWarnings.map((w) => w.file).sort();
    assert.deepEqual(files, ['comments-todo-2026-01-01.json', 'sessions-todo-2026-01-01.json']);
    for (const w of board.dataWarnings) {
      assert.ok(fs.existsSync(w.movedTo), `退避先 ${w.movedTo} が残っている`);
    }
    assert.equal(fs.readFileSync(board.dataWarnings.find((w) => w.file.startsWith('comments')).movedTo, 'utf-8'), 'not json');
    assert.equal(fs.existsSync(sessionsPath), false);
  } finally {
    await server.stop();
  }
});

// AC-DI-SRV-2
test('記録の書き込みは一時ファイルを残さず、書いた内容がそのまま読める', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    const body = JSON.stringify({ file: fixture.todoFile, groupId: 'group-a', text: 'メモ' });
    const res = await fetch(`${server.baseUrl}/api/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(res.status, 200);
    const left = fs.readdirSync(fixture.dataDir).filter((n) => n.endsWith('.tmp'));
    assert.deepEqual(left, []);
    const saved = JSON.parse(fs.readFileSync(path.join(fixture.dataDir, 'comments-todo-2026-01-01.json'), 'utf-8'));
    assert.equal(saved['group-a'][0].text, 'メモ');
  } finally {
    await server.stop();
  }
});

// AC-DI-SRV-3
test('/api/board は Claude CLI の確認済みの版を返す', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    const board = await (await fetch(`${server.baseUrl}/api/board?file=${fixture.todoFile}`)).json();
    assert.equal(board.claudeCli.tested, '2.1.291');
    assert.equal(board.claudeCli.version, null);
  } finally {
    await server.stop();
  }
});
