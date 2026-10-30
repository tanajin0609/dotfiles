'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer } = require('./helpers');

async function withServer(fixture, fn) {
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    await fn(server);
  } finally {
    await server.stop();
  }
}

function post(server, pathname, body) {
  return fetch(`${server.baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function writeBacklog(dir, content) {
  const p = path.join(dir, 'docs', 'tasks', 'backlog.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

// AC-IB-SRV-1・2・3
test('Inboxのメモを作成・更新・一覧・削除でき、todoファイルに依存せずdata/inbox.jsonに残る', async () => {
  const fixture = setupFixture();
  await withServer(fixture, async (server) => {
    assert.deepEqual(await (await fetch(`${server.baseUrl}/api/inbox`)).json(), { memos: [] });

    const first = await (await post(server, '/api/inbox', { text: '1つ目\n2行目' })).json();
    assert.match(first.memo.id, /^[\w-]+$/);
    assert.equal(first.memo.text, '1つ目\n2行目');
    await new Promise((r) => setTimeout(r, 5));
    const second = await (await post(server, '/api/inbox', { id: 'client-id_1', text: '2つ目' })).json();
    assert.equal(second.memo.id, 'client-id_1');

    const updated = await post(server, '/api/inbox', { id: first.memo.id, text: '1つ目（改）' });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).memo.createdAt, first.memo.createdAt);

    const list = await (await fetch(`${server.baseUrl}/api/inbox`)).json();
    assert.deepEqual(list.memos.map((m) => m.text), ['2つ目', '1つ目（改）']);
    assert.ok(fs.existsSync(path.join(fixture.dataDir, 'inbox.json')));

    assert.equal((await post(server, '/api/inbox', { text: '  \n ' })).status, 400);
    assert.equal((await post(server, '/api/inbox', { id: '../x', text: 'a' })).status, 400);

    fs.mkdirSync(path.join(fixture.dataDir, 'attachments', 'inbox', 'client-id_1'), { recursive: true });
    assert.equal((await post(server, '/api/inbox/delete', { id: 'client-id_1' })).status, 200);
    assert.ok(!fs.existsSync(path.join(fixture.dataDir, 'attachments', 'inbox', 'client-id_1')));
    assert.equal((await post(server, '/api/inbox/delete', { id: 'client-id_1' })).status, 404);
    assert.deepEqual((await (await fetch(`${server.baseUrl}/api/inbox`)).json()).memos.map((m) => m.text), ['1つ目（改）']);
  });
});

// AC-IB-SRV-1
test('data/inbox.jsonが壊れていれば空の一覧を返す', async () => {
  const fixture = setupFixture();
  fs.writeFileSync(path.join(fixture.dataDir, 'inbox.json'), '{broken');
  await withServer(fixture, async (server) => {
    assert.deepEqual(await (await fetch(`${server.baseUrl}/api/inbox`)).json(), { memos: [] });
  });
});

// AC-IB-SRV-4
test('POST /api/inbox/attachmentsはdata/attachments/inbox/<id>/に保存し、不正なidと空本文は400', async () => {
  const fixture = setupFixture();
  await withServer(fixture, async (server) => {
    const up = (q, body) => fetch(`${server.baseUrl}/api/inbox/attachments?${new URLSearchParams(q)}`, { method: 'POST', body });
    const res = await up({ id: 'm1', name: '../スクショ.png' }, Buffer.from([1, 2, 3]));
    assert.equal(res.status, 200);
    const { path: saved } = await res.json();
    assert.equal(path.dirname(saved), path.join(fixture.dataDir, 'attachments', 'inbox', 'm1'));
    assert.match(path.basename(saved), /^\d+-.*スクショ\.png$/);
    assert.equal((await up({ id: '../m1', name: 'a.png' }, Buffer.from([1]))).status, 400);
    assert.equal((await up({ id: 'm1', name: 'a.png' }, Buffer.alloc(0))).status, 400);
  });
});

// AC-IB-SRV-5
test('移すとmemo.mdと添付をbacklog.mdの隣のinbox/へ書き、backlog.mdに採番して1行追記し、Inboxから消す', async () => {
  const fixture = setupFixture();
  const backlog = writeBacklog(fixture.projectDir, '- [ ] #4 既存\n');
  const todoBefore = fs.readFileSync(path.join(fixture.todoDir, fixture.todoFile), 'utf-8');
  await withServer(fixture, async (server) => {
    const attachRes = await fetch(`${server.baseUrl}/api/inbox/attachments?id=m1&name=shot.png`, { method: 'POST', body: Buffer.from([9, 8]) });
    const { path: attached } = await attachRes.json();
    const outside = path.join(fixture.root, 'secret.txt');
    fs.writeFileSync(outside, 'secret');
    const traversal = path.join(path.dirname(attached), '..', '..', '..', '..', 'secret.txt');
    await post(server, '/api/inbox', { id: 'm1', text: `\nログイン画面 直す\n詳細の説明\n[添付] ${attached}\n[添付] ${traversal}` });

    assert.equal((await post(server, '/api/inbox/move', { id: 'm1', column: 'demo-project', title: '  ' })).status, 400);
    assert.equal((await post(server, '/api/inbox/move', { id: 'nope', column: 'demo-project', title: 'x' })).status, 404);

    const res = await post(server, '/api/inbox/move', { id: 'm1', column: 'demo-project', title: 'ログイン画面\n直す' });
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.equal(out.backlogPath, backlog);
    assert.equal(out.number, 5);

    const memoDir = path.dirname(out.memoPath);
    assert.equal(path.dirname(memoDir), path.join(path.dirname(backlog), 'inbox'));
    assert.match(path.basename(memoDir), /^\d{8}-\d{4}-ログイン画面-直す$/);
    const rel = path.relative(path.dirname(backlog), out.memoPath);
    assert.equal(fs.readFileSync(backlog, 'utf-8'), `- [ ] #4 既存\n- [ ] #5 ログイン画面 直す → [memo.md](${rel})\n`);

    const copied = path.join(memoDir, path.basename(attached));
    assert.deepEqual(fs.readFileSync(copied), Buffer.from([9, 8]));
    assert.ok(!fs.existsSync(path.join(memoDir, 'secret.txt')));
    const memoMd = fs.readFileSync(out.memoPath, 'utf-8');
    assert.match(memoMd, /^# ログイン画面 直す\n/);
    assert.ok(memoMd.includes('詳細の説明'));
    assert.ok(!memoMd.includes(attached));
    assert.ok(memoMd.includes(`[${path.basename(attached)}](${path.basename(attached)})`));

    assert.deepEqual((await (await fetch(`${server.baseUrl}/api/inbox`)).json()).memos, []);
    assert.ok(!fs.existsSync(path.join(fixture.dataDir, 'attachments', 'inbox', 'm1')));

    await post(server, '/api/inbox', { id: 'm2', text: '同名' });
    await post(server, '/api/inbox', { id: 'm3', text: '同名' });
    const a = await (await post(server, '/api/inbox/move', { id: 'm2', column: 'demo-project', title: '同名' })).json();
    const b = await (await post(server, '/api/inbox/move', { id: 'm3', column: 'demo-project', title: '同名' })).json();
    assert.notEqual(path.dirname(a.memoPath), path.dirname(b.memoPath));
    assert.ok(fs.existsSync(a.memoPath) && fs.existsSync(b.memoPath));
  });
  assert.equal(fs.readFileSync(path.join(fixture.todoDir, fixture.todoFile), 'utf-8'), todoBefore);
});

// AC-IB-SRV-5
test('書き込み先が複数ならbacklogPathが必須で、候補外・未指定は400。候補0件・列が無ければ400', async () => {
  const fixture = setupFixture();
  await withServer(fixture, async (server) => {
    await post(server, '/api/inbox', { id: 'm1', text: 'x' });
    assert.equal((await post(server, '/api/inbox/move', { id: 'm1', column: 'demo-project', title: 'x' })).status, 400);
    assert.equal((await post(server, '/api/inbox/move', { id: 'm1', column: 'no-such', title: 'x' })).status, 400);

    const a = writeBacklog(path.join(fixture.projectDir, 'a'), '');
    const b = writeBacklog(path.join(fixture.projectDir, 'b'), '');
    assert.equal((await post(server, '/api/inbox/move', { id: 'm1', column: 'demo-project', title: 'x' })).status, 400);
    assert.equal((await post(server, '/api/inbox/move', { id: 'm1', column: 'demo-project', title: 'x', backlogPath: '/etc/passwd' })).status, 400);
    const ok = await post(server, '/api/inbox/move', { id: 'm1', column: 'demo-project', title: 'x', backlogPath: b });
    assert.equal(ok.status, 200);
    assert.equal(fs.readFileSync(a, 'utf-8'), '');
    assert.match(fs.readFileSync(b, 'utf-8'), /^- \[ \] x → \[memo\.md\]\(inbox\/\d{8}-\d{4}-x\/memo\.md\)\n$/);
  });
});
