'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer } = require('./helpers');

function writeThreeColumnTodo(fixture) {
  fs.writeFileSync(path.join(fixture.todoDir, fixture.todoFile), [
    '# 2026-01-01', '',
    '## alpha', '- [ ] a', '',
    '## beta', '- [ ] b', '',
    '## gamma', '- [ ] c', '',
  ].join('\n'));
}

async function readColumnNames(server, fixture) {
  const body = await (await fetch(`${server.baseUrl}/api/board?file=${fixture.todoFile}`)).json();
  return body.columns.map((c) => c.name);
}

async function postOrder(server, body) {
  const res = await fetch(`${server.baseUrl}/api/column-order`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

// AC-CR-SRV-1・AC-CR-SRV-2
test('保存した列の並び順でボードを返し、記録に無い列は元の順で後ろに並べる', async () => {
  const fixture = setupFixture();
  writeThreeColumnTodo(fixture);
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    assert.deepEqual(await readColumnNames(server, fixture), ['alpha', 'beta', 'gamma']);
    assert.deepEqual(await postOrder(server, { order: ['gamma', 'zzz-removed'] }), { status: 200, body: { order: ['gamma', 'zzz-removed'] } });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture.dataDir, 'column-order.json'), 'utf-8')), ['gamma', 'zzz-removed']);
    assert.deepEqual(await readColumnNames(server, fixture), ['gamma', 'alpha', 'beta']);
  } finally {
    await server.stop();
  }
});

// AC-CR-SRV-1
test('並び順のファイルが壊れていれば元の順', async () => {
  const fixture = setupFixture();
  writeThreeColumnTodo(fixture);
  fs.writeFileSync(path.join(fixture.dataDir, 'column-order.json'), '{broken');
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    assert.deepEqual(await readColumnNames(server, fixture), ['alpha', 'beta', 'gamma']);
  } finally {
    await server.stop();
  }
});

// AC-CR-SRV-2
test('文字列の配列以外は400', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    for (const body of [{}, { order: 'alpha' }, { order: ['alpha', 1] }]) {
      assert.equal((await postOrder(server, body)).status, 400);
    }
  } finally {
    await server.stop();
  }
});
