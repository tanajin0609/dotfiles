'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { setupFixture, startViewerServer } = require('./helpers');

function rawRequest(baseUrl, { method = 'GET', pathname = '/api/files', headers = {}, body } = {}) {
  const { hostname, port } = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname, port, method, path: pathname, headers }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const json = (body) => ({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });

// AC-SEC-SRV-1
test('ループバック以外のアドレスでは待ち受けない', async (t) => {
  const external = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
  if (!external) return t.skip('外向きの IPv4 アドレスが無い環境');
  const fixture = setupFixture();
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    const { port } = new URL(server.baseUrl);
    await assert.rejects(fetch(`http://${external.address}:${port}/api/files`));
  } finally {
    await server.stop();
  }
});

// AC-SEC-SRV-2
test('他サイトの Host・Origin と JSON 以外の POST を拒否する', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  const { port } = new URL(server.baseUrl);
  const body = JSON.stringify({ text: 'メモ' });
  try {
    assert.equal((await rawRequest(server.baseUrl, { headers: { Host: `evil.example:${port}` } })).status, 403);
    assert.equal((await rawRequest(server.baseUrl, { headers: { Host: `localhost:${port}` } })).status, 200);

    const evil = await rawRequest(server.baseUrl, {
      method: 'POST', pathname: '/api/inbox', body, headers: { ...json(body), Origin: 'https://evil.example' },
    });
    assert.equal(evil.status, 403);

    const own = await rawRequest(server.baseUrl, {
      method: 'POST', pathname: '/api/inbox', body, headers: { ...json(body), Origin: `http://localhost:${port}` },
    });
    assert.equal(own.status, 200);

    const plain = await rawRequest(server.baseUrl, {
      method: 'POST', pathname: '/api/inbox', body, headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(body) },
    });
    assert.equal(plain.status, 415);
  } finally {
    await server.stop();
  }
});

// AC-SEC-SRV-3
test('壊れた本文・大きすぎる本文でも落ちずにエラーを返す', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  const post = (pathname, body) => rawRequest(server.baseUrl, { method: 'POST', pathname, body, headers: json(body) });
  try {
    assert.equal((await post('/api/session/launch', 'null')).status, 400);
    assert.equal((await post('/api/session/launch', '[1]')).status, 400);
    assert.equal((await post('/api/inbox', JSON.stringify({ text: 'x'.repeat(1024 * 1024 + 10) }))).status, 413);
    assert.equal((await rawRequest(server.baseUrl)).status, 200);
  } finally {
    await server.stop();
  }
});

// AC-SEC-SRV-4
test('列名や見出しに .. を入れてもプロジェクト置き場の外で起動しない', async () => {
  const fixture = setupFixture();
  const outside = path.join(path.dirname(path.resolve(fixture.todoDir, '..')), `outside-${process.pid}`);
  fs.mkdirSync(outside, { recursive: true });
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  const launch = (overrides) => {
    const body = JSON.stringify({ file: fixture.todoFile, groupId: 'group-a', columnName: 'demo-project', groupTitle: 'demo-project', text: '続けて', ...overrides });
    return rawRequest(server.baseUrl, { method: 'POST', pathname: '/api/session/launch', body, headers: json(body) });
  };
  try {
    const byColumn = await launch({ columnName: `../${path.basename(outside)}` });
    assert.equal(byColumn.status, 400);
    assert.match(byColumn.text, /no matching project directory/);
    assert.equal((await launch({ columnName: '..' })).status, 400);
  } finally {
    await server.stop();
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

// AC-SEC-SRV-5
test('index.html と costs.html 以外のファイルは配信しない', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    assert.equal((await fetch(`${server.baseUrl}/`)).status, 200);
    assert.equal((await fetch(`${server.baseUrl}/costs`)).status, 200);
    assert.equal((await fetch(`${server.baseUrl}/server.js`)).status, 404);
    assert.equal((await fetch(`${server.baseUrl}/tests/helpers.js`)).status, 404);
  } finally {
    await server.stop();
  }
});
