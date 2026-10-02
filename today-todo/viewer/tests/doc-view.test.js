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
