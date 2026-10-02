'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer } = require('./helpers');

// AC-CB-SRV-1
test('ボードのチェックを、行末に埋め込まれた元のbacklog.mdへ書き戻す', async () => {
  const fixture = setupFixture();
  const backlog = path.join(fixture.projectDir, 'docs', 'tasks', 'backlog.md');
  fs.mkdirSync(path.dirname(backlog), { recursive: true });
  fs.writeFileSync(backlog, '## 進行中\n\n- [ ] 対象タスク <!-- notion:p1 -->\n- [ ] 別タスク\n');
  fs.writeFileSync(path.join(fixture.todoDir, fixture.todoFile), [
    '# 2026-01-01', '', '## demo-project', '', '### demo-project ▸ 進行中',
    `- [ ] #1 対象タスク → ${backlog} <!-- notion:p1 -->`, '',
  ].join('\n'));
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    const board = await (await fetch(`${server.baseUrl}/api/board?file=${fixture.todoFile}`)).json();
    const taskId = board.columns[0].groups[0].tasks[0].id;
    const res = await fetch(`${server.baseUrl}/api/checkbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: fixture.todoFile, taskId }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, done: true, sourceUpdated: true });
  } finally {
    await server.stop();
  }
  assert.equal(fs.readFileSync(backlog, 'utf-8'), '## 進行中\n\n- [x] 対象タスク <!-- notion:p1 -->\n- [ ] 別タスク\n');
});
