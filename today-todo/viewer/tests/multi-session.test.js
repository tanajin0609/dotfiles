'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer, writeStatefulFakeClaude, readCalls } = require('./helpers');

const FILE = 'todo-2026-01-01.md';
const SESSIONS_NAME = 'sessions-todo-2026-01-01.json';

async function postJson(baseUrl, url, body) {
  const res = await fetch(`${baseUrl}${url}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function withServer(fake, fn) {
  const fixture = setupFixture();
  const jobsDir = path.join(fixture.root, 'jobs');
  const callLog = path.join(fixture.root, 'claude-calls.log');
  writeStatefulFakeClaude(path.join(fixture.root, 'bin'), { jobsDir, callLogPath: callLog, ...fake });
  const writeJob = (jobId, state) => {
    fs.mkdirSync(path.join(jobsDir, jobId), { recursive: true });
    fs.writeFileSync(path.join(jobsDir, jobId, 'state.json'), JSON.stringify(state));
  };
  const writeSessions = (map) => fs.writeFileSync(path.join(fixture.dataDir, SESSIONS_NAME), JSON.stringify(map));
  const readSessions = () => JSON.parse(fs.readFileSync(path.join(fixture.dataDir, SESSIONS_NAME), 'utf-8'));
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
    VIEWER_CLAUDE_JOBS_DIR: jobsDir,
    VIEWER_STOP_SETTLE_MS: '0',
    PATH: `${path.join(fixture.root, 'bin')}:${process.env.PATH}`,
  });
  try {
    await fn({ baseUrl: server.baseUrl, callLog, writeJob, writeSessions, readSessions });
  } finally {
    await server.stop();
  }
}

const launchPayload = (extra) => ({ file: FILE, groupId: 'group-a', columnName: 'demo-project', groupTitle: 'demo-project', text: '続けて', ...extra });

function twoSessions() {
  return { 'group-a': { jobId: 'cccc0001', name: 'cur', launchedAt: '2026-01-01T01:00:00.000Z', history: [{ jobId: 'aaaa0001', name: 'old', launchedAt: '2026-01-01T00:00:00.000Z' }] } };
}

// AC-MT-SRV-1
test('jobIdにhistoryのジョブを渡すと、そのセッションへ返信し現在のセッションは変えない', async () => {
  await withServer({}, async ({ baseUrl, callLog, writeJob, writeSessions, readSessions }) => {
    const sid = crypto.randomUUID();
    writeJob('aaaa0001', { state: 'done', sessionId: sid });
    writeJob('cccc0001', { state: 'working', sessionId: crypto.randomUUID() });
    writeSessions(twoSessions());
    const res = await postJson(baseUrl, '/api/session/launch', launchPayload({ jobId: 'aaaa0001' }));
    assert.equal(res.status, 200);
    assert.equal(res.body.jobId, 'aaaa0001');
    assert.deepEqual(readCalls(callLog), ['stop aaaa0001', `--bg --resume ${sid} -- 続けて`]);
    const entry = readSessions()['group-a'];
    assert.equal(entry.jobId, 'cccc0001');
    assert.deepEqual(entry.history.map((h) => h.jobId), ['aaaa0001']);
  });
});

test('historyのセッションへの返信がコピーになったら、historyの同じ位置を新しいjobIdに置き換える', async () => {
  await withServer({ runningResumesAfterStop: 5, newJobId: 'dddd0001' }, async ({ baseUrl, writeJob, writeSessions, readSessions }) => {
    writeJob('aaaa0001', { state: 'done', sessionId: crypto.randomUUID() });
    writeSessions(twoSessions());
    const res = await postJson(baseUrl, '/api/session/launch', launchPayload({ jobId: 'aaaa0001' }));
    assert.equal(res.body.copied, true);
    const entry = readSessions()['group-a'];
    assert.equal(entry.jobId, 'cccc0001');
    assert.deepEqual(entry.history.map((h) => h.jobId), ['dddd0001']);
    assert.equal(entry.history[0].launchedAt, '2026-01-01T00:00:00.000Z');
  });
});

test('カードのセッションに無いjobIdへの返信は409でclaudeを呼ばない', async () => {
  await withServer({}, async ({ baseUrl, callLog, writeSessions }) => {
    writeSessions(twoSessions());
    const res = await postJson(baseUrl, '/api/session/launch', launchPayload({ jobId: 'eeee0001' }));
    assert.equal(res.status, 409);
    assert.deepEqual(res.body, { error: 'session changed' });
    assert.deepEqual(readCalls(callLog), []);
  });
});

// AC-MT-SRV-2
test('現在のセッションを閉じるとstopし、historyの最後が現在のセッションになる', async () => {
  await withServer({}, async ({ baseUrl, callLog, writeSessions, readSessions }) => {
    writeSessions(twoSessions());
    const res = await postJson(baseUrl, '/api/session/close', { file: FILE, groupId: 'group-a', jobId: 'cccc0001' });
    assert.equal(res.status, 200);
    assert.deepEqual(readCalls(callLog), ['stop cccc0001']);
    assert.deepEqual(readSessions()['group-a'], { jobId: 'aaaa0001', name: 'old', launchedAt: '2026-01-01T00:00:00.000Z' });
  });
});

test('historyのセッションを閉じるとstopしてhistoryから外す。最後の1件を閉じるとカードのエントリを消す', async () => {
  await withServer({}, async ({ baseUrl, callLog, writeSessions, readSessions }) => {
    writeSessions(twoSessions());
    await postJson(baseUrl, '/api/session/close', { file: FILE, groupId: 'group-a', jobId: 'aaaa0001' });
    assert.deepEqual(readSessions()['group-a'], { jobId: 'cccc0001', name: 'cur', launchedAt: '2026-01-01T01:00:00.000Z' });
    await postJson(baseUrl, '/api/session/close', { file: FILE, groupId: 'group-a', jobId: 'cccc0001' });
    assert.equal(readSessions()['group-a'], undefined);
    assert.deepEqual(readCalls(callLog), ['stop aaaa0001', 'stop cccc0001']);
  });
});

test('カードのセッションに無いjobIdを閉じると404、不正な入力は400', async () => {
  await withServer({}, async ({ baseUrl, callLog, writeSessions }) => {
    writeSessions(twoSessions());
    assert.equal((await postJson(baseUrl, '/api/session/close', { file: FILE, groupId: 'group-a', jobId: 'eeee0001' })).status, 404);
    assert.equal((await postJson(baseUrl, '/api/session/close', { file: FILE, groupId: 'group-a', jobId: 'x; rm' })).status, 400);
    assert.equal((await postJson(baseUrl, '/api/session/close', { file: 'bad.md', groupId: 'group-a', jobId: 'cccc0001' })).status, 400);
    assert.deepEqual(readCalls(callLog), []);
  });
});

// AC-MT-SRV-3（取り消し）
test('historyのセッションのjobIdでも送信を取り消せる', async () => {
  await withServer({}, async ({ baseUrl, callLog, writeSessions }) => {
    writeSessions(twoSessions());
    const res = await postJson(baseUrl, '/api/session/cancel', { file: FILE, groupId: 'group-a', at: 'x', jobId: 'aaaa0001' });
    assert.equal(res.status, 200);
    assert.equal(res.body.stopped, true);
    assert.deepEqual(readCalls(callLog), ['stop aaaa0001']);
  });
});

// AC-SL-SRV-1
test('セッション一覧のcardはhistoryのジョブにも付く', async () => {
  await withServer({}, async ({ baseUrl, writeJob, writeSessions }) => {
    writeJob('aaaa0001', { state: 'done', createdAt: '2026-01-01T00:00:00.000Z' });
    writeJob('cccc0001', { state: 'working', createdAt: '2026-01-01T01:00:00.000Z' });
    writeSessions(twoSessions());
    const res = await fetch(`${baseUrl}/api/sessions/all`).then((r) => r.json());
    const byId = Object.fromEntries(res.sessions.map((s) => [s.jobId, s]));
    assert.equal(byId.aaaa0001.card.groupId, 'group-a');
    assert.equal(byId.cccc0001.card.groupId, 'group-a');
  });
});
