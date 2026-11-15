'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer } = require('./helpers');

const DAY1 = 'todo-2026-01-01.md';
const DAY2 = 'todo-2026-01-02.md';

function writeTodo(fixture, file, heading) {
  fs.writeFileSync(path.join(fixture.todoDir, file), ['# x', '', '## demo-project', '', `### ${heading}`, '- [ ] #7 タスクA', ''].join('\n'));
}

async function getBoard(server, file) {
  const res = await fetch(`${server.baseUrl}/api/board?file=${file}`);
  assert.equal(res.status, 200);
  return res.json();
}

const post = (server, url, body) => fetch(`${server.baseUrl}${url}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

// AC-CO-SRV-1
test('翌日の todo を初めて開くと、前日のカードのコメントとセッションの記録を引き継ぐ', async () => {
  const fixture = setupFixture();
  writeTodo(fixture, DAY1, 'group-a');
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    const day1 = await getBoard(server, DAY1);
    const groupId = day1.columns[0].groups[0].id;
    assert.equal((await post(server, '/api/comments', { file: DAY1, groupId, text: '昨日のメモ' })).status, 200);
    fs.writeFileSync(path.join(fixture.dataDir, 'sessions-todo-2026-01-01.json'), JSON.stringify({ [groupId]: { jobId: 'job-1' } }));

    writeTodo(fixture, DAY2, 'group-a');
    const day2 = await getBoard(server, DAY2);
    const card = day2.columns[0].groups[0];
    assert.equal(card.id, groupId);
    assert.equal(card.comments[0].text, '昨日のメモ');
    const sessions = JSON.parse(fs.readFileSync(path.join(fixture.dataDir, 'sessions-todo-2026-01-02.json'), 'utf-8'));
    assert.equal(sessions[groupId].jobId, 'job-1');

    // その日に消した記録を、前日の分で戻さない
    fs.writeFileSync(path.join(fixture.dataDir, 'comments-todo-2026-01-02.json'), '{}');
    const again = await getBoard(server, DAY2);
    assert.deepEqual(again.columns[0].groups[0].comments, []);
  } finally {
    await server.stop();
  }
});

// AC-CO-SRV-2
test('見出しを直してカードIDが変わっても、#N が同じなら記録と印を新しいカードへ付け替える', async () => {
  const fixture = setupFixture();
  writeTodo(fixture, DAY1, '古い見出し');
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    const before = await getBoard(server, DAY1);
    const oldId = before.columns[0].groups[0].id;
    await post(server, '/api/comments', { file: DAY1, groupId: oldId, text: 'メモ' });
    await post(server, '/api/card-marks', { groupId: oldId, status: 'today', starred: true });

    writeTodo(fixture, DAY1, '新しい見出し');
    const after = await getBoard(server, DAY1);
    const card = after.columns[0].groups[0];
    assert.notEqual(card.id, oldId);
    assert.equal(card.comments[0].text, 'メモ');
    assert.equal(after.cardMarks[card.id].status, 'today');
    assert.equal(after.cardMarks[card.id].starred, true);
  } finally {
    await server.stop();
  }
});

// AC-CO-SRV-3
test('POST /api/card-marks は印を保存し、外すと記録を消す。不正な値は400', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    const board = await getBoard(server, fixture.todoFile);
    const groupId = board.columns[0].groups[0].id;
    assert.equal((await post(server, '/api/card-marks', { groupId, status: 'hold' })).status, 200);
    assert.equal((await getBoard(server, fixture.todoFile)).cardMarks[groupId].status, 'hold');
    assert.equal((await post(server, '/api/card-marks', { groupId, status: '' })).status, 200);
    assert.equal((await getBoard(server, fixture.todoFile)).cardMarks[groupId], undefined);
    assert.equal((await post(server, '/api/card-marks', { groupId, status: 'done' })).status, 400);
    assert.equal((await post(server, '/api/card-marks', { groupId: '../x', starred: true })).status, 400);
    assert.equal((await post(server, '/api/card-marks', { groupId, starred: 'yes' })).status, 400);
  } finally {
    await server.stop();
  }
});
