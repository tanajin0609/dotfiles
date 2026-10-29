'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer, writeFakeClaude } = require('./helpers');

async function postJson(baseUrl, pathname, body) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function startWithFakeClaude(fixture) {
  const callLog = path.join(fixture.root, 'claude-calls.log');
  writeFakeClaude(path.join(fixture.root, 'bin'), { callLogPath: callLog, jobId: 'c3d4e5', delayMs: 0 });
  const jobsDir = path.join(fixture.root, 'jobs');
  fs.mkdirSync(jobsDir, { recursive: true });
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir,
    VIEWER_CLAUDE_SETTINGS: path.join(fixture.root, 'missing.json'),
    VIEWER_CLAUDE_JOBS_DIR: jobsDir,
    PATH: `${path.join(fixture.root, 'bin')}:${process.env.PATH}`,
  });
  return { server, callLog, jobsDir };
}

function writeJobState(jobsDir, jobId, state) {
  fs.mkdirSync(path.join(jobsDir, jobId), { recursive: true });
  fs.writeFileSync(path.join(jobsDir, jobId, 'state.json'), JSON.stringify(state));
}

// AC-TI-SRV-1・AC-TI-SRV-3
test('/todo-importを起動して記録し、GETで状態つきで返す。記録が無ければnull', async () => {
  const fixture = setupFixture();
  const { server, callLog, jobsDir } = await startWithFakeClaude(fixture);
  try {
    assert.deepEqual(await (await fetch(`${server.baseUrl}/api/todo-import`)).json(), { session: null });

    const launched = await postJson(server.baseUrl, '/api/todo-import', {});
    assert.equal(launched.status, 200);
    assert.deepEqual(launched.body, { launched: true, jobId: 'c3d4e5' });
    const lastCall = fs.readFileSync(callLog, 'utf-8').split('\n').filter(Boolean).at(-1);
    assert.equal(lastCall.trim(), '--bg -n todo-import -- /todo-import');

    writeJobState(jobsDir, 'c3d4e5', { state: 'stopped' });
    const { session } = await (await fetch(`${server.baseUrl}/api/todo-import`)).json();
    assert.equal(session.jobId, 'c3d4e5');
    assert.equal(session.state, 'done');
    assert.ok(session.launchedAt);
  } finally {
    await server.stop();
  }
});

// AC-TI-SRV-2
test('記録済みのジョブがworking・blockedの間は起動しない', async () => {
  const fixture = setupFixture();
  const { server, callLog, jobsDir } = await startWithFakeClaude(fixture);
  try {
    fs.mkdirSync(fixture.dataDir, { recursive: true });
    fs.writeFileSync(path.join(fixture.dataDir, 'todo-import-session.json'), JSON.stringify({ jobId: 'aaaa1111', launchedAt: '2026-10-29T00:00:00Z' }));
    for (const state of [{ state: 'running' }, { state: 'working', tempo: 'blocked' }]) {
      writeJobState(jobsDir, 'aaaa1111', state);
      const res = await postJson(server.baseUrl, '/api/todo-import', {});
      assert.deepEqual(res.body, { launched: false, reason: 'already-running', jobId: 'aaaa1111' });
    }
    assert.equal(fs.existsSync(callLog), false);

    writeJobState(jobsDir, 'aaaa1111', { state: 'stopped' });
    assert.deepEqual((await postJson(server.baseUrl, '/api/todo-import', {})).body, { launched: true, jobId: 'c3d4e5' });
  } finally {
    await server.stop();
  }
});
