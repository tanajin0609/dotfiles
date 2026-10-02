'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer } = require('./helpers');

function writeBacklog(root, rel, body) {
  const p = path.join(root, rel, 'docs', 'tasks', 'backlog.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  return p;
}

async function withServer(fixture, fn) {
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    await fn(server.baseUrl);
  } finally {
    await server.stop();
  }
}

function sync(baseUrl, body) {
  return fetch(`${baseUrl}/api/board/sync-column`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// AC-CS-SRV-1
test('列の節だけをbacklog.mdから作り直し、他の列は変えない', async () => {
  const fixture = setupFixture();
  const todoPath = path.join(fixture.todoDir, fixture.todoFile);
  fs.writeFileSync(todoPath, '# 2026-01-01\n\n## grp\n\n### old\n\n## other\n\n### x\n- [ ] そのまま\n');
  const backlog = writeBacklog(fixture.root, 'grp/inbox', '# Todo\n\n## 進行中\n\n- [ ] 新タスク <!-- notion:abc -->\n      継続行\n');
  await withServer(fixture, async (baseUrl) => {
    const res = await sync(baseUrl, { file: fixture.todoFile, column: 'grp' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { items: 1 });
  });
  assert.equal(fs.readFileSync(todoPath, 'utf-8'), [
    '# 2026-01-01', '', '## grp', '', '### inbox ▸ 進行中',
    `- [ ] #1 新タスク 継続行 → ${backlog} <!-- notion:abc -->`, '',
    '## other', '', '### x', '- [ ] そのまま', '',
  ].join('\n'));
});

// AC-CS-SRV-2・AC-CS-SRV-3
test('既存行の番号を引き継いで見出しの移動・完了を反映し、ボードで完了済みの行は戻さず、新規は最大値+1を振る', async () => {
  const fixture = setupFixture();
  const todoPath = path.join(fixture.todoDir, fixture.todoFile);
  const backlog = path.join(fixture.root, 'grp', 'inbox', 'docs', 'tasks', 'backlog.md');
  fs.writeFileSync(todoPath, [
    '# 2026-01-01', '', '## grp', '', '### inbox ▸ A',
    `- [ ] #3 移動するタスク 古い状態 → ${backlog} <!-- notion:p1 -->`,
    `- [ ] #4 完了するタスク → ${backlog}`,
    `- [x] #5 backlogから消えた完了済み → ${backlog}`,
    `- [x] #7 ボードで完了済み → ${backlog}`,
    '',
  ].join('\n'));
  writeBacklog(fixture.root, 'grp/inbox', [
    '## A', '', '- [x] 完了するタスク', '- [ ] 追加タスク', '- [ ] ボードで完了済み', '',
    '## B', '', '- [ ] 移動するタスク <!-- notion:p1 -->', '      新しい状態', '',
  ].join('\n'));
  await withServer(fixture, async (baseUrl) => {
    const res = await sync(baseUrl, { file: fixture.todoFile, column: 'grp' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { items: 2 });
  });
  assert.equal(fs.readFileSync(todoPath, 'utf-8'), [
    '# 2026-01-01', '', '## grp', '', '### inbox ▸ A',
    `- [ ] #8 追加タスク → ${backlog}`,
    `- [x] #4 完了するタスク → ${backlog}`,
    `- [x] #5 backlogから消えた完了済み → ${backlog}`,
    `- [x] #7 ボードで完了済み → ${backlog}`, '',
    '### inbox ▸ B',
    `- [ ] #3 移動するタスク 新しい状態 → ${backlog} <!-- notion:p1 -->`, '',
  ].join('\n'));
});

// AC-CS-SRV-1
test('列の節が無ければ末尾に追加する', async () => {
  const fixture = setupFixture();
  const backlog = writeBacklog(fixture.root, 'grp', '- [ ] 単独\n');
  await withServer(fixture, async (baseUrl) => {
    assert.equal((await sync(baseUrl, { file: fixture.todoFile, column: 'grp' })).status, 200);
  });
  const md = fs.readFileSync(path.join(fixture.todoDir, fixture.todoFile), 'utf-8');
  assert.ok(md.startsWith('# 2026-01-01\n\n## demo-project\n\n### group-a\n- [ ] タスクA\n'));
  assert.ok(md.endsWith(`## grp\n\n### grp\n- [ ] #1 単独 → ${backlog}\n`));
});

// AC-CS-SRV-4
test('入力不正は400、todoファイル・列ディレクトリが無ければ404', async () => {
  const fixture = setupFixture();
  await withServer(fixture, async (baseUrl) => {
    assert.equal((await sync(baseUrl, { file: '../x.md', column: 'demo-project' })).status, 400);
    assert.equal((await sync(baseUrl, { file: fixture.todoFile, column: '../etc' })).status, 400);
    assert.equal((await sync(baseUrl, { file: fixture.todoFile, column: 'a/b' })).status, 400);
    assert.equal((await sync(baseUrl, { file: 'todo-2026-01-02.md', column: 'demo-project' })).status, 404);
    assert.equal((await sync(baseUrl, { file: fixture.todoFile, column: 'missing' })).status, 404);
  });
});
