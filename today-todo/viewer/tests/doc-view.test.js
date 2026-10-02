'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer } = require('./helpers');

// AC-DV-SRV-1
test('GET /api/docはPROJECTS_ROOT配下の.mdだけを返し、それ以外は403・存在しなければ404', async () => {
  const fixture = setupFixture();
  const projectsRoot = path.resolve(fixture.todoDir, '..');
  const docDir = path.join(projectsRoot, 'demo-project', 'docs');
  fs.mkdirSync(docDir, { recursive: true });
  const mdPath = path.join(docDir, 'proposal.md');
  fs.writeFileSync(mdPath, '# 提案\n本文');
  fs.writeFileSync(path.join(docDir, 'secret.txt'), 'x');
  const outside = path.join(path.dirname(projectsRoot), `outside-${process.pid}.md`);
  fs.writeFileSync(outside, '# outside');
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  const get = (p) => fetch(`${server.baseUrl}/api/doc?path=${encodeURIComponent(p)}`);
  try {
    const ok = await get(mdPath);
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('content-type'), /^text\/markdown/);
    assert.equal(await ok.text(), '# 提案\n本文');
    assert.equal((await get(path.join(docDir, 'secret.txt'))).status, 403);
    assert.equal((await get(outside)).status, 403);
    assert.equal((await get(path.join(docDir, '..', '..', '..', path.basename(outside)))).status, 403);
    assert.equal((await get(path.join(docDir, 'missing.md'))).status, 404);
  } finally {
    await server.stop();
    fs.rmSync(outside, { force: true });
  }
});

// AC-DV-SRV-2
test('GET /api/doc/resolveは出典のディレクトリから上へさかのぼってrefを解決し、配下の.mdを返す', async () => {
  const fixture = setupFixture();
  const projectsRoot = path.resolve(fixture.todoDir, '..');
  const orderDir = path.join(projectsRoot, 'ops', 'inbox', 'order-1');
  fs.mkdirSync(path.join(orderDir, 'src', 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(orderDir, 'instruction.md'), '# i');
  fs.writeFileSync(path.join(orderDir, 'plan.md'), '# p');
  fs.writeFileSync(path.join(orderDir, '.snapshot.md'), '# s');
  fs.writeFileSync(path.join(orderDir, 'src', 'node_modules', 'x.md'), '# x');
  const backlog = path.join(projectsRoot, 'ops', 'inbox', 'docs', 'tasks', 'backlog.md');
  fs.mkdirSync(path.dirname(backlog), { recursive: true });
  fs.writeFileSync(backlog, '');
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  const resolve = (ref) => fetch(`${server.baseUrl}/api/doc/resolve?ref=${encodeURIComponent(ref)}&base=${encodeURIComponent(backlog)}`);
  try {
    for (const ref of ['ops/inbox/order-1', 'inbox/order-1']) {
      const res = await resolve(ref);
      assert.equal(res.status, 200, ref);
      const body = await res.json();
      assert.equal(body.kind, 'dir');
      assert.equal(body.path, orderDir);
      assert.deepEqual(body.docs, [path.join(orderDir, 'instruction.md'), path.join(orderDir, 'plan.md')]);
    }
    const file = await (await resolve('ops/inbox/order-1/plan.md')).json();
    assert.deepEqual([file.kind, file.docs], ['file', [path.join(orderDir, 'plan.md')]]);
    assert.equal((await resolve('nope/missing')).status, 404);
    assert.equal((await resolve('../../../../../../etc')).status, 404);
  } finally {
    await server.stop();
  }
});
