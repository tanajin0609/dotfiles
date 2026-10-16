'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer, writeStatefulFakeClaude, readCalls } = require('./helpers');

function writeJobState(jobsDir, jobId, state) {
  fs.mkdirSync(path.join(jobsDir, jobId), { recursive: true });
  fs.writeFileSync(path.join(jobsDir, jobId, 'state.json'), JSON.stringify(state));
}

async function postJson(baseUrl, pathname, body) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function startWithJobs(fixture) {
  const callLog = path.join(fixture.root, 'claude-calls.log');
  const jobsDir = path.join(fixture.root, 'jobs');
  writeStatefulFakeClaude(path.join(fixture.root, 'bin'), { jobsDir, callLogPath: callLog, newJobId: 'feed01' });
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir,
    VIEWER_CLAUDE_SETTINGS: path.join(fixture.root, 'missing.json'),
    VIEWER_CLAUDE_JOBS_DIR: jobsDir, VIEWER_STOP_SETTLE_MS: '0',
    PATH: `${path.join(fixture.root, 'bin')}:${process.env.PATH}`,
  });
  return { server, callLog, jobsDir };
}

// AC-SL-SRV-1
test('createdAtの無いものを除いた全ジョブを新しい順に返し、カードに紐付いたジョブにはcardを付ける', async () => {
  const fixture = setupFixture();
  const { server, jobsDir } = await startWithJobs(fixture);
  writeJobState(jobsDir, 'abc000', { state: 'done', sessionId: 'orig' });
  writeJobState(jobsDir, 'aaa111', { state: 'done', name: '外部ジョブ', cwd: '/x', createdAt: '2026-01-01T00:00:00.000Z' });
  writeJobState(jobsDir, 'bbb222', { state: 'blocked', name: 'カードのジョブ', cwd: '/y', createdAt: '2026-01-03T00:00:00.000Z' });
  fs.writeFileSync(path.join(fixture.dataDir, 'sessions-todo-2026-01-02.json'), JSON.stringify({
    g1: { jobId: 'bbb222', name: 'カードA', launchedAt: '2026-01-03T00:00:00.000Z' },
    g2: { jobId: 'gone99', name: 'カードB', launchedAt: '2026-01-02T00:00:00.000Z' },
  }));
  try {
    const body = await (await fetch(`${server.baseUrl}/api/sessions/all`)).json();
    assert.deepEqual(body.sessions.map((s) => [s.jobId, s.name, s.cwd, s.state, s.card && s.card.groupId]), [
      ['bbb222', 'カードのジョブ', '/y', 'blocked', 'g1'],
      ['gone99', 'カードB', null, 'unknown', 'g2'],
      ['aaa111', '外部ジョブ', '/x', 'done', null],
    ]);
    assert.deepEqual(body.sessions[0].card, { file: 'todo-2026-01-02.md', groupId: 'g1', name: 'カードA' });
    assert.equal(body.defaultCwd, fixture.root);
  } finally {
    await server.stop();
  }
});

// AC-SL-SRV-2
test('新規作成はcwdで起動し、名前・model/effortを付け、不正なcwdと空の依頼は400', async () => {
  const fixture = setupFixture();
  const { server, callLog } = await startWithJobs(fixture);
  try {
    assert.equal((await postJson(server.baseUrl, '/api/sessions/create', { cwd: '/etc', text: 'x' })).status, 400);
    assert.equal((await postJson(server.baseUrl, '/api/sessions/create', { cwd: fixture.root, text: ' ' })).status, 400);
    const created = await postJson(server.baseUrl, '/api/sessions/create', { cwd: fixture.root, name: '調査', text: '依頼文', model: 'opus', effort: 'high' });
    assert.equal(created.status, 200);
    assert.ok(created.body.jobId);
    const call = readCalls(callLog).find((c) => c.startsWith('--bg'));
    assert.equal(call, '--bg --model opus --effort high -n 調査 -- 依頼文');
  } finally {
    await server.stop();
  }
});

// AC-SL-SRV-3
test('返信はカード非紐付けのジョブだけ受け付け、カード紐付きは409・不明は404', async () => {
  const fixture = setupFixture();
  const { server, callLog, jobsDir } = await startWithJobs(fixture);
  const sessionId = '11111111-2222-3333-4444-555555555555';
  writeJobState(jobsDir, 'cce333', { state: 'blocked', name: 'n', cwd: fixture.root, sessionId, createdAt: '2026-01-01T00:00:00.000Z' });
  writeJobState(jobsDir, 'dde444', { state: 'blocked', name: 'n', cwd: fixture.root, sessionId: '99999999-2222-3333-4444-555555555555', createdAt: '2026-01-01T00:00:00.000Z' });
  fs.writeFileSync(path.join(fixture.dataDir, 'sessions-todo-2026-01-02.json'), JSON.stringify({ g1: { jobId: 'dde444' } }));
  fs.writeFileSync(path.join(fixture.dataDir, 'skill-sessions.json'), JSON.stringify([{ jobId: 'cce333', text: 's' }]));
  try {
    assert.equal((await postJson(server.baseUrl, '/api/sessions/reply', { jobId: 'fff999', text: 'a' })).status, 404);
    assert.equal((await postJson(server.baseUrl, '/api/sessions/reply', { jobId: 'dde444', text: 'a' })).status, 409);
    const res = await postJson(server.baseUrl, '/api/sessions/reply', { jobId: 'cce333', text: '続けて' });
    assert.equal(res.status, 200);
    assert.equal(res.body.launched, true);
    const calls = readCalls(callLog);
    assert.ok(calls.includes('stop cce333'));
    assert.ok(calls.some((c) => c.startsWith(`--bg --resume ${sessionId} -- `) && c.endsWith('続けて')));
    const skillSessions = JSON.parse(fs.readFileSync(path.join(fixture.dataDir, 'skill-sessions.json'), 'utf-8'));
    assert.equal(skillSessions[0].jobId, res.body.jobId);
  } finally {
    await server.stop();
  }
});

// AC-SL-SRV-4
test('停止はclaude stop、削除はstop→rmを実行し、不正なjobIdは400', async () => {
  const fixture = setupFixture();
  const { server, callLog, jobsDir } = await startWithJobs(fixture);
  writeJobState(jobsDir, 'aee555', { state: 'working', name: 'n', cwd: fixture.root, createdAt: '2026-01-01T00:00:00.000Z' });
  try {
    assert.equal((await postJson(server.baseUrl, '/api/sessions/stop', { jobId: '../x' })).status, 400);
    assert.equal((await postJson(server.baseUrl, '/api/sessions/stop', { jobId: 'aee555' })).status, 200);
    assert.equal((await postJson(server.baseUrl, '/api/sessions/delete', { jobId: 'aee555' })).status, 200);
    assert.deepEqual(readCalls(callLog), ['stop aee555', 'stop aee555', 'rm aee555']);
    assert.equal(fs.existsSync(path.join(jobsDir, 'aee555')), false);
  } finally {
    await server.stop();
  }
});
