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

async function readColumns(server, fixture) {
  const body = await (await fetch(`${server.baseUrl}/api/board?file=${fixture.todoFile}`)).json();
  return body.columns.map((c) => [c.name, c.favorite]);
}

async function postFavorite(server, body) {
  const res = await fetch(`${server.baseUrl}/api/column-favorites`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

// AC-CF-SRV-1・AC-CF-SRV-2
test('お気に入りの列を先頭に寄せ、外すと列の並び順どおりに戻る', async () => {
  const fixture = setupFixture();
  writeThreeColumnTodo(fixture);
  fs.writeFileSync(path.join(fixture.dataDir, 'column-order.json'), JSON.stringify(['beta', 'alpha', 'gamma']));
  fs.writeFileSync(path.join(fixture.dataDir, 'column-favorites.json'), JSON.stringify(['not-today']));
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    assert.deepEqual(await readColumns(server, fixture), [['beta', false], ['alpha', false], ['gamma', false]]);

    assert.deepEqual(await postFavorite(server, { name: 'gamma', favorite: true }), { status: 200, body: { favorites: ['not-today', 'gamma'] } });
    assert.deepEqual(await postFavorite(server, { name: 'alpha', favorite: true }), { status: 200, body: { favorites: ['not-today', 'gamma', 'alpha'] } });
    assert.deepEqual(await readColumns(server, fixture), [['alpha', true], ['gamma', true], ['beta', false]]);

    assert.deepEqual(await postFavorite(server, { name: 'gamma', favorite: false }), { status: 200, body: { favorites: ['not-today', 'alpha'] } });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture.dataDir, 'column-favorites.json'), 'utf-8')), ['not-today', 'alpha']);
    assert.deepEqual(await readColumns(server, fixture), [['alpha', true], ['beta', false], ['gamma', false]]);
  } finally {
    await server.stop();
  }
});

// AC-CF-SRV-1
test('お気に入りのファイルが壊れていればお気に入り無し', async () => {
  const fixture = setupFixture();
  writeThreeColumnTodo(fixture);
  fs.writeFileSync(path.join(fixture.dataDir, 'column-favorites.json'), '{broken');
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    assert.deepEqual(await readColumns(server, fixture), [['alpha', false], ['beta', false], ['gamma', false]]);
    assert.deepEqual(await postFavorite(server, { name: 'beta', favorite: true }), { status: 200, body: { favorites: ['beta'] } });
  } finally {
    await server.stop();
  }
});

// AC-CF-SRV-2
test('型が違えば400', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    for (const body of [{}, { name: 'alpha' }, { name: 1, favorite: true }, { name: 'alpha', favorite: 'yes' }]) {
      assert.equal((await postFavorite(server, body)).status, 400);
    }
  } finally {
    await server.stop();
  }
});
