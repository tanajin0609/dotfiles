'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer, writeFakeClaude } = require('./helpers');

function writeGlobalSettings(root, settings) {
  const settingsPath = path.join(root, 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
  return settingsPath;
}

async function postSettings(baseUrl, body) {
  const res = await fetch(`${baseUrl}/api/claude-settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function launch(baseUrl) {
  const res = await fetch(`${baseUrl}/api/session/launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file: 'todo-2026-01-01.md', groupId: 'group-a', columnName: 'demo-project',
      groupTitle: 'demo-project', text: '実行してください',
    }),
  });
  return res.status;
}

// AC-MS-SRV-1
test('GETはグローバル設定と未設定のoverrideを返し、settings.jsonを書き換えない', async () => {
  const fixture = setupFixture();
  const global = { model: 'opus', effortLevel: 'high', modelSettings: { 'claude-opus-5-5': { effortLevel: 'low' } }, theme: 'dark' };
  const settingsPath = writeGlobalSettings(fixture.root, global);
  const before = fs.readFileSync(settingsPath, 'utf-8');
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir, VIEWER_CLAUDE_SETTINGS: settingsPath,
  });
  try {
    const res = await fetch(`${server.baseUrl}/api/claude-settings`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      global: { model: 'opus', effortLevel: 'high', modelSettings: { 'claude-opus-5-5': { effortLevel: 'low' } } },
      override: { model: '', effort: '' },
    });
    await postSettings(server.baseUrl, { model: 'sonnet', effort: 'low' });
    assert.equal(fs.readFileSync(settingsPath, 'utf-8'), before);
  } finally {
    await server.stop();
  }
});

// AC-MS-SRV-1
test('settings.jsonが無ければglobalはnull', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir,
    VIEWER_CLAUDE_SETTINGS: path.join(fixture.root, 'missing.json'),
  });
  try {
    const body = await (await fetch(`${server.baseUrl}/api/claude-settings`)).json();
    assert.equal(body.global, null);
  } finally {
    await server.stop();
  }
});

// AC-MS-SRV-2
test('POSTは保存して再取得でき、不正値は400', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir,
    VIEWER_CLAUDE_SETTINGS: path.join(fixture.root, 'missing.json'),
  });
  try {
    const ok = await postSettings(server.baseUrl, { model: 'claude-sonnet-5[1m]', effort: 'xhigh' });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.override, { model: 'claude-sonnet-5[1m]', effort: 'xhigh' });
    const got = await (await fetch(`${server.baseUrl}/api/claude-settings`)).json();
    assert.deepEqual(got.override, { model: 'claude-sonnet-5[1m]', effort: 'xhigh' });

    assert.equal((await postSettings(server.baseUrl, { model: 'opus; rm -rf', effort: '' })).status, 400);
    assert.equal((await postSettings(server.baseUrl, { model: '', effort: 'ultra' })).status, 400);
    assert.equal((await postSettings(server.baseUrl, { model: '--dangerous', effort: '' })).status, 400);
  } finally {
    await server.stop();
  }
});

// AC-MS-SRV-3
test('launchはoverrideの設定済み項目だけを--model/--effortで渡す', async () => {
  const fixture = setupFixture();
  const callLog = path.join(fixture.root, 'claude-calls.log');
  writeFakeClaude(path.join(fixture.root, 'bin'), { callLogPath: callLog, delayMs: 0 });
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir,
    VIEWER_CLAUDE_SETTINGS: path.join(fixture.root, 'missing.json'),
    PATH: `${path.join(fixture.root, 'bin')}:${process.env.PATH}`,
  });
  try {
    assert.equal(await launch(server.baseUrl), 200);
    let lines = fs.readFileSync(callLog, 'utf-8').split('\n').filter(Boolean);
    assert.doesNotMatch(lines.at(-1), /--model|--effort/);

    fs.rmSync(path.join(fixture.dataDir, 'sessions-todo-2026-01-01.json'));
    await postSettings(server.baseUrl, { model: '', effort: 'max' });
    assert.equal(await launch(server.baseUrl), 200);
    lines = fs.readFileSync(callLog, 'utf-8').split('\n').filter(Boolean);
    assert.match(lines.at(-1), /^--bg --effort max /);
    assert.doesNotMatch(lines.at(-1), /--model/);

    fs.rmSync(path.join(fixture.dataDir, 'sessions-todo-2026-01-01.json'));
    await postSettings(server.baseUrl, { model: 'sonnet', effort: 'low' });
    assert.equal(await launch(server.baseUrl), 200);
    lines = fs.readFileSync(callLog, 'utf-8').split('\n').filter(Boolean);
    assert.match(lines.at(-1), /^--bg --model sonnet --effort low /);
  } finally {
    await server.stop();
  }
});
