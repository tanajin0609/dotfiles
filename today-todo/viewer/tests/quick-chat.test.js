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

async function startWithJobs(fixture, fakeOptions = {}) {
  const callLog = path.join(fixture.root, 'claude-calls.log');
  const jobsDir = path.join(fixture.root, 'jobs');
  writeStatefulFakeClaude(path.join(fixture.root, 'bin'), { jobsDir, callLogPath: callLog, newJobId: 'feed01', ...fakeOptions });
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir,
    VIEWER_CLAUDE_SETTINGS: path.join(fixture.root, 'missing.json'),
    VIEWER_CLAUDE_JOBS_DIR: jobsDir, VIEWER_STOP_SETTLE_MS: '0',
    PATH: `${path.join(fixture.root, 'bin')}:${process.env.PATH}`,
  });
  return { server, callLog, jobsDir };
}

const readChatSessions = (fixture) => JSON.parse(fs.readFileSync(path.join(fixture.dataDir, 'chat-sessions.json'), 'utf-8'));

// AC-CH-SRV-1
test('チャットの記録を古い順に状態付きで返し、ジョブが消えたものはunknown、記録が無ければ空配列', async () => {
  const fixture = setupFixture();
  const { server, jobsDir } = await startWithJobs(fixture);
  try {
    const empty = await (await fetch(`${server.baseUrl}/api/chat`)).json();
    assert.deepEqual(empty, { sessions: [], defaultCwd: fixture.root });
    writeJobState(jobsDir, 'aaa111', { state: 'blocked', cwd: '/x', createdAt: '2026-01-01T00:00:00.000Z' });
    fs.writeFileSync(path.join(fixture.dataDir, 'chat-sessions.json'), JSON.stringify([
      { jobId: 'aaa111', cwd: '/x', launchedAt: '2026-01-01T00:00:00.000Z' },
      { jobId: 'gone99', cwd: '/y', launchedAt: '2026-01-02T00:00:00.000Z' },
    ]));
    const body = await (await fetch(`${server.baseUrl}/api/chat`)).json();
    assert.deepEqual(body.sessions.map((s) => [s.jobId, s.cwd, s.launchedAt, s.state]), [
      ['aaa111', '/x', '2026-01-01T00:00:00.000Z', 'blocked'],
      ['gone99', '/y', '2026-01-02T00:00:00.000Z', 'unknown'],
    ]);
  } finally {
    await server.stop();
  }
});

// AC-CH-SRV-2
test('chat付きの新規作成だけを記録し、chat無しは記録しない', async () => {
  const fixture = setupFixture();
  const { server } = await startWithJobs(fixture);
  try {
    assert.equal((await postJson(server.baseUrl, '/api/sessions/create', { cwd: fixture.root, text: '通常' })).status, 200);
    assert.equal(fs.existsSync(path.join(fixture.dataDir, 'chat-sessions.json')), false);
    const created = await postJson(server.baseUrl, '/api/sessions/create', { cwd: fixture.root, text: 'チャット', chat: true });
    assert.equal(created.status, 200);
    const records = readChatSessions(fixture);
    assert.equal(records.length, 1);
    assert.equal(records[0].jobId, created.body.jobId);
    assert.equal(records[0].cwd, fixture.root);
    assert.ok(records[0].launchedAt);
  } finally {
    await server.stop();
  }
});

// AC-CH-SRV-3
test('返信で別jobIdになったらチャットの記録も置き換える', async () => {
  const fixture = setupFixture();
  // stop後も稼働中と判定させ、CLIにコピー（別jobId）を起動させる。
  const { server, jobsDir } = await startWithJobs(fixture, { runningResumesAfterStop: 1 });
  writeJobState(jobsDir, 'cce333', { state: 'done', cwd: fixture.root, sessionId: '11111111-2222-3333-4444-555555555555', createdAt: '2026-01-01T00:00:00.000Z' });
  fs.writeFileSync(path.join(fixture.dataDir, 'chat-sessions.json'), JSON.stringify([{ jobId: 'cce333', cwd: fixture.root, launchedAt: '2026-01-01T00:00:00.000Z' }]));
  try {
    const res = await postJson(server.baseUrl, '/api/sessions/reply', { jobId: 'cce333', text: '続けて' });
    assert.equal(res.status, 200);
    assert.equal(res.body.jobId, 'feed01');
    assert.deepEqual(readChatSessions(fixture).map((s) => s.jobId), [res.body.jobId]);
  } finally {
    await server.stop();
  }
});

// AC-CH-SRV-4
test('閉じるはclaude stopして記録から外し、rmはしない。不正は400・記録に無ければ404', async () => {
  const fixture = setupFixture();
  const { server, callLog, jobsDir } = await startWithJobs(fixture);
  writeJobState(jobsDir, 'aee555', { state: 'working', cwd: fixture.root, createdAt: '2026-01-01T00:00:00.000Z' });
  fs.writeFileSync(path.join(fixture.dataDir, 'chat-sessions.json'), JSON.stringify([
    { jobId: 'aee555', cwd: fixture.root, launchedAt: '2026-01-01T00:00:00.000Z' },
    { jobId: 'bbb222', cwd: fixture.root, launchedAt: '2026-01-02T00:00:00.000Z' },
  ]));
  try {
    assert.equal((await postJson(server.baseUrl, '/api/chat/close', { jobId: '../x' })).status, 400);
    assert.equal((await postJson(server.baseUrl, '/api/chat/close', { jobId: 'fff999' })).status, 404);
    assert.equal((await postJson(server.baseUrl, '/api/chat/close', { jobId: 'aee555' })).status, 200);
    assert.deepEqual(readCalls(callLog), ['stop aee555']);
    assert.deepEqual(readChatSessions(fixture).map((s) => s.jobId), ['bbb222']);
  } finally {
    await server.stop();
  }
});
