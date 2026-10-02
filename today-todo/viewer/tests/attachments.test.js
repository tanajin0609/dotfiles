'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer } = require('./helpers');

// AC-AT-SRV-1
test('POST /api/attachmentsはdata/attachments配下に保存して絶対パスを返し、不正な入力は400・過大は413', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  const post = (query, body) => fetch(`${server.baseUrl}/api/attachments?${new URLSearchParams(query)}`, { method: 'POST', body });
  try {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]);
    const res = await post({ file: fixture.todoFile, groupId: 'g-1', name: '../../スクショ 1.png' }, png);
    assert.equal(res.status, 200);
    const { path: saved } = await res.json();
    const dir = path.join(fixture.dataDir, 'attachments', fixture.todoFile.replace(/\.md$/, ''), 'g-1');
    assert.equal(path.dirname(saved), dir);
    assert.match(path.basename(saved), /^\d+-.*スクショ 1\.png$/);
    assert.doesNotMatch(path.basename(saved), /\//);
    assert.deepEqual(fs.readFileSync(saved), png);

    assert.equal((await post({ file: 'bad.txt', groupId: 'g-1', name: 'a.png' }, png)).status, 400);
    assert.equal((await post({ file: fixture.todoFile, groupId: '../x', name: 'a.png' }, png)).status, 400);
    assert.equal((await post({ file: fixture.todoFile, groupId: 'g-1', name: 'a.png' }, Buffer.alloc(0))).status, 400);
    const big = await post({ file: fixture.todoFile, groupId: 'g-1', name: 'big.bin' }, Buffer.alloc(20 * 1024 * 1024 + 1));
    assert.equal(big.status, 413);
  } finally {
    await server.stop();
  }
});
