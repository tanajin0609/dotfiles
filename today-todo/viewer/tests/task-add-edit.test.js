'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer } = require('./helpers');

function post(server, url, body) {
  return fetch(`${server.baseUrl}${url}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

function writeBacklog(dir, md) {
  const p = path.join(dir, 'docs', 'tasks', 'backlog.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, md);
  return p;
}

async function withServer(fixture, fn) {
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    return await fn(server);
  } finally {
    await server.stop();
  }
}

// AC-CB-SRV-2
test('列直下にbacklog.mdが無く配下に1件だけあれば、カード追加はそこへ書く', async () => {
  const fixture = setupFixture();
  const backlog = writeBacklog(path.join(fixture.projectDir, 'sub'), '- [ ] #3 既存\n');
  await withServer(fixture, async (server) => {
    const res = await post(server, '/api/cards', { file: fixture.todoFile, columnName: 'demo-project', text: '新カード' });
    assert.equal(res.status, 200);
  });
  assert.equal(fs.readFileSync(backlog, 'utf-8'), '- [ ] #3 既存\n- [ ] #4 新カード\n');
});

// AC-CB-SRV-2
test('配下にbacklog.mdが複数あれば、backlogPathで選んだ先へ書き、未指定は400で候補を返す', async () => {
  const fixture = setupFixture();
  const a = writeBacklog(path.join(fixture.projectDir, 'a'), '');
  const b = writeBacklog(path.join(fixture.projectDir, 'b'), '');
  await withServer(fixture, async (server) => {
    const targets = await (await fetch(`${server.baseUrl}/api/backlog-targets?column=demo-project`)).json();
    assert.deepEqual(targets, { targets: [a, b] });
    const missing = await post(server, '/api/cards', { file: fixture.todoFile, columnName: 'demo-project', text: 'x' });
    assert.equal(missing.status, 400);
    assert.deepEqual((await missing.json()).targets, [a, b]);
    const ok = await post(server, '/api/cards', { file: fixture.todoFile, columnName: 'demo-project', text: 'x', backlogPath: b });
    assert.equal(ok.status, 200);
  });
  assert.equal(fs.readFileSync(a, 'utf-8'), '');
  assert.equal(fs.readFileSync(b, 'utf-8'), '\n- [ ] x\n');
});

// AC-CB-SRV-3
test('改行を含むタスク追加は1行にまとめて書き、ボードにも表示される', async () => {
  const fixture = setupFixture();
  const backlog = writeBacklog(fixture.projectDir, '- [ ] #1 既存\n');
  await withServer(fixture, async (server) => {
    const res = await post(server, '/api/tasks', {
      file: fixture.todoFile, columnName: 'demo-project', groupTitle: 'group-a', text: '1行目\n  2行目\r\n\n3行目',
    });
    assert.equal(res.status, 200);
    const board = await (await fetch(`${server.baseUrl}/api/board?file=${fixture.todoFile}`)).json();
    assert.ok(board.columns[0].groups[0].tasks.some((t) => t.number === 2 && t.text.startsWith('1行目 2行目 3行目 → ')));
  });
  assert.equal(fs.readFileSync(backlog, 'utf-8'), '- [ ] #1 既存\n- [ ] #2 1行目 2行目 3行目\n');
});

function setupEditFixture() {
  const fixture = setupFixture();
  const backlog = writeBacklog(fixture.projectDir,
    '## 進行中\n\n- [ ] #5 旧本文 <!-- notion:p1 -->\n  継続行\n- [ ] #6 別タスク\n');
  fs.writeFileSync(path.join(fixture.todoDir, fixture.todoFile), [
    '# 2026-01-01', '', '## demo-project', '', '### group-a',
    `- [ ] #5 旧本文 継続行 → ${backlog} <!-- notion:p1 -->`,
    `- [ ] #6 別タスク → ${backlog}`, '',
  ].join('\n'));
  return { fixture, backlog };
}

// AC-CB-SRV-4
test('タスク本文を編集すると、連番・出典パス・notionを保ってtodoとbacklog.mdの両方を書き換える', async () => {
  const { fixture, backlog } = setupEditFixture();
  await withServer(fixture, async (server) => {
    const board = await (await fetch(`${server.baseUrl}/api/board?file=${fixture.todoFile}`)).json();
    const taskId = board.columns[0].groups[0].tasks[0].id;
    const res = await post(server, '/api/tasks/edit', { file: fixture.todoFile, taskId, text: '新本文\n続き' });
    assert.deepEqual(await res.json(), { ok: true, sourceUpdated: true });
  });
  assert.equal(fs.readFileSync(backlog, 'utf-8'),
    '## 進行中\n\n- [ ] #5 新本文 続き <!-- notion:p1 -->\n- [ ] #6 別タスク\n');
  assert.match(fs.readFileSync(path.join(fixture.todoDir, fixture.todoFile), 'utf-8'),
    new RegExp(`^- \\[ \\] #5 新本文 続き → ${backlog} <!-- notion:p1 -->$`, 'm'));
});

// AC-CB-SRV-4
test('タスクを削除すると、todoとbacklog.mdの両方から（継続行ごと）消える', async () => {
  const { fixture, backlog } = setupEditFixture();
  await withServer(fixture, async (server) => {
    const board = await (await fetch(`${server.baseUrl}/api/board?file=${fixture.todoFile}`)).json();
    const taskId = board.columns[0].groups[0].tasks[0].id;
    const res = await post(server, '/api/tasks/edit', { file: fixture.todoFile, taskId, remove: true });
    assert.deepEqual(await res.json(), { ok: true, sourceUpdated: true });
    const empty = await post(server, '/api/tasks/edit', { file: fixture.todoFile, taskId, text: '  ' });
    assert.equal(empty.status, 400);
  });
  assert.equal(fs.readFileSync(backlog, 'utf-8'), '## 進行中\n\n- [ ] #6 別タスク\n');
  assert.doesNotMatch(fs.readFileSync(path.join(fixture.todoDir, fixture.todoFile), 'utf-8'), /旧本文/);
});

function writeSddTemplate(root) {
  const dev = path.join(root, '_templates', 'dev');
  writeBacklog(dev, '# Todo\n\n## 進行中\n\n## 完了\n');
  fs.mkdirSync(path.join(dev, 'docs', 'specs'), { recursive: true });
  fs.mkdirSync(path.join(dev, 'docs', 'changes', '<change-name>'), { recursive: true });
  fs.writeFileSync(path.join(dev, 'docs', 'changes', '<change-name>', 'proposal.md'), '# Proposal\n');
  fs.mkdirSync(path.join(dev, 'src'), { recursive: true });
}

// AC-CB-SRV-5
test('createProject付きのカード追加は、テンプレートからSDD構成を作ってそのbacklog.mdとtodoファイルに書く', async () => {
  const fixture = setupFixture();
  writeSddTemplate(fixture.root);
  await withServer(fixture, async (server) => {
    const res = await post(server, '/api/cards', {
      file: fixture.todoFile, columnName: 'new-col', text: '最初の要件定義', createProject: { subName: 'app' },
    });
    assert.equal(res.status, 200);
    const dir = path.join(fixture.root, 'new-col', 'app');
    assert.match(fs.readFileSync(path.join(dir, 'docs', 'tasks', 'backlog.md'), 'utf-8'), /^## 進行中\n\n- \[ \] #1 最初の要件定義\n\n## 完了\n$/m);
    assert.ok(fs.existsSync(path.join(dir, 'docs', 'specs')));
    assert.ok(fs.existsSync(path.join(dir, 'src')));
    assert.deepEqual(fs.readdirSync(path.join(dir, 'docs', 'changes')), []);
    assert.match(fs.readFileSync(path.join(fixture.todoDir, fixture.todoFile), 'utf-8'), /^## new-col\n- \[ \] #1 最初の要件定義 → /m);
  });
});

// AC-CB-SRV-5
test('createProjectは不正な名前を400、既存のbacklog.mdがあれば409にして何も書かない', async () => {
  const fixture = setupFixture();
  writeSddTemplate(fixture.root);
  const existing = writeBacklog(fixture.projectDir, '- [ ] #1 既存\n');
  await withServer(fixture, async (server) => {
    for (const [columnName, subName] of [['../x', undefined], ['ok', '_bad'], ['ok', 'a/b']]) {
      const res = await post(server, '/api/cards', { file: fixture.todoFile, columnName, text: 'x', createProject: { subName } });
      assert.equal(res.status, 400, `${columnName}/${subName}`);
    }
    const res = await post(server, '/api/cards', { file: fixture.todoFile, columnName: 'demo-project', text: 'x', createProject: {} });
    assert.equal(res.status, 409);
    assert.equal(fs.readFileSync(existing, 'utf-8'), '- [ ] #1 既存\n');
  });
  assert.ok(!fs.existsSync(path.join(fixture.root, 'ok')));
});
