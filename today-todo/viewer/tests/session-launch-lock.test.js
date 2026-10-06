'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  setupFixture, startViewerServer, writeFakeClaude, countLines,
} = require('./helpers');

// server.jsのCLAUDE_JOBS_DIRは`~/.claude/jobs`に固定で環境変数による差し替えができないため、
// このテストは実ホームディレクトリ配下にランダムなhex名のジョブディレクトリを一時的に作り、
// 完了後に必ず削除する（他のジョブと衝突しないよう十分な長さのランダムIDを使う）。
function makeTestJobDir(jobId) {
  const jobDir = path.join(os.homedir(), '.claude', 'jobs', jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  return jobDir;
}

function writeSessionsMap(dataDir, file, sessionsMap) {
  fs.mkdirSync(dataDir, { recursive: true });
  const sessionsPath = path.join(dataDir, `sessions-${file.replace(/\.md$/, '')}.json`);
  fs.writeFileSync(sessionsPath, JSON.stringify(sessionsMap));
}

function buildLaunchPayload(overrides) {
  return {
    file: 'todo-2026-01-01.md',
    groupId: 'group-a',
    columnName: 'demo-project',
    groupTitle: 'demo-project',
    text: '実行してください',
    ...overrides,
  };
}

async function postLaunch(baseUrl, payload) {
  const res = await fetch(`${baseUrl}/api/session/launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json() };
}

// AC-H1-SRV-1
test('同一fileとgroupIdへの同時起動要求は片方が409になり、偽claudeは1回しか呼ばれない', async () => {
  const fixture = setupFixture();
  const callLog = path.join(fixture.root, 'claude-calls.log');
  writeFakeClaude(path.join(fixture.root, 'bin'), { callLogPath: callLog, delayMs: 300 });
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
    PATH: `${path.join(fixture.root, 'bin')}:${process.env.PATH}`,
  });
  try {
    const payload = buildLaunchPayload();
    const [a, b] = await Promise.all([
      postLaunch(server.baseUrl, payload),
      postLaunch(server.baseUrl, payload),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const conflicted = a.status === 409 ? a : b;
    assert.deepEqual(conflicted.body, { error: 'launch in progress' });
    assert.equal(countLines(callLog), 1);
  } finally {
    await server.stop();
  }
});

// AC-H1-SRV-2（成功後の解放）
test('起動完了後は同じfileとgroupIdへの再要求が409にならない', async () => {
  const fixture = setupFixture();
  const callLog = path.join(fixture.root, 'claude-calls.log');
  writeFakeClaude(path.join(fixture.root, 'bin'), { callLogPath: callLog, delayMs: 50 });
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
    PATH: `${path.join(fixture.root, 'bin')}:${process.env.PATH}`,
  });
  try {
    const payload = buildLaunchPayload();
    const first = await postLaunch(server.baseUrl, payload);
    assert.equal(first.status, 200);
    const second = await postLaunch(server.baseUrl, payload);
    assert.notEqual(second.status, 409);
    assert.equal(countLines(callLog), 2);
  } finally {
    await server.stop();
  }
});

// AC-H1-SRV-2（失敗後の解放）
test('cwd解決に失敗した400応答の後も同じfileとgroupIdへの再要求が409にならない', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
  });
  try {
    const payload = buildLaunchPayload({ columnName: 'no-such-project', groupTitle: 'no-such-project' });
    const first = await postLaunch(server.baseUrl, payload);
    assert.equal(first.status, 400);
    const second = await postLaunch(server.baseUrl, payload);
    assert.equal(second.status, 400);
    assert.notEqual(second.status, 409);
  } finally {
    await server.stop();
  }
});

// AC-H1-SRV-3
test('別groupIdまたは別fileへの同時起動要求はロックの影響を受けず両方通る', async () => {
  const fixture = setupFixture();
  const callLog = path.join(fixture.root, 'claude-calls.log');
  writeFakeClaude(path.join(fixture.root, 'bin'), { callLogPath: callLog, delayMs: 200 });
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
    PATH: `${path.join(fixture.root, 'bin')}:${process.env.PATH}`,
  });
  try {
    const [byGroup, byFile] = await Promise.all([
      Promise.all([
        postLaunch(server.baseUrl, buildLaunchPayload({ groupId: 'group-a' })),
        postLaunch(server.baseUrl, buildLaunchPayload({ groupId: 'group-b' })),
      ]),
      Promise.all([
        postLaunch(server.baseUrl, buildLaunchPayload({ groupId: 'group-c', file: 'todo-2026-01-02.md' })),
        postLaunch(server.baseUrl, buildLaunchPayload({ groupId: 'group-c', file: 'todo-2026-01-03.md' })),
      ]),
    ]);
    for (const { status } of [...byGroup, ...byFile]) {
      assert.equal(status, 200);
    }
    assert.equal(countLines(callLog), 4);
  } finally {
    await server.stop();
  }
});

// AC-CC2-2（resume がコピーになったときは、元ジョブをrmして一覧に残さない）
async function launchResumeFromBlocked({ transcriptLines }) {
  const fixture = setupFixture();
  const jobId = crypto.randomBytes(16).toString('hex');
  const resumedJobId = crypto.randomBytes(16).toString('hex');
  const jobDir = makeTestJobDir(jobId);
  const callLog = path.join(fixture.root, 'claude-calls.log');
  const transcriptPath = path.join(fixture.root, 'transcript.jsonl');
  fs.writeFileSync(transcriptPath, transcriptLines.map((l) => JSON.stringify(l)).join('\n'));
  writeFakeClaude(path.join(fixture.root, 'bin'), { jobId: resumedJobId, callLogPath: callLog, delayMs: 20 });
  writeSessionsMap(fixture.dataDir, buildLaunchPayload().file, {
    'group-a': { jobId, name: 'demo-project ▸ demo-project', launchedAt: new Date().toISOString() },
  });
  fs.writeFileSync(path.join(jobDir, 'state.json'), JSON.stringify({
    state: 'blocked',
    sessionId: 'full-session-uuid-0001',
    linkScanPath: transcriptPath,
  }));
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
    PATH: `${path.join(fixture.root, 'bin')}:${process.env.PATH}`,
  });
  try {
    const res = await postLaunch(server.baseUrl, buildLaunchPayload());
    const calls = fs.readFileSync(callLog, 'utf-8').trim().split('\n').map((c) => c.trim());
    const sessionsMap = JSON.parse(fs.readFileSync(path.join(fixture.dataDir, 'sessions-todo-2026-01-01.json'), 'utf-8'));
    return { res, calls, jobId, resumedJobId, sessionsMap };
  } finally {
    await server.stop();
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
}

test('入力待ち(blocked)セッションへの再起動は、stop→--resume後に元ジョブをrmし、カードを継続先jobIdに付け替える', async () => {
  const { res, calls, jobId, resumedJobId, sessionsMap } = await launchResumeFromBlocked({
    transcriptLines: [{ type: 'user', message: { content: 'hi' } }],
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.jobId, resumedJobId);
  // 偽CLIは毎回別jobIdを返すため、コピーとみなして1回やり直した後に元ジョブをrmする。
  assert.equal(calls[0], `stop ${jobId}`);
  assert.match(calls[1], /^--bg --resume full-session-uuid-0001 -- /);
  assert.deepEqual(calls.slice(2, 4), [`stop ${resumedJobId}`, `rm ${resumedJobId}`]);
  assert.match(calls[4], /^--bg --resume full-session-uuid-0001 -- /);
  assert.equal(calls.at(-1), `rm ${jobId}`);
  assert.equal(sessionsMap['group-a'].jobId, resumedJobId);
});

test('元ジョブがworktreeに入っていた場合はrmしない（継続先が同じworktreeを使うため）', async () => {
  const { res, calls, jobId } = await launchResumeFromBlocked({
    transcriptLines: [{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'EnterWorktree', input: {} }] } }],
  });
  assert.equal(res.status, 200);
  assert.ok(!calls.includes(`rm ${jobId}`), '元ジョブをrmしないこと');
});

// AC-CC2-2（CLIによっては稼働中を`running`と書くため、working同様にコピー起動しない）
test('稼働中(running)セッションへの依頼はclaudeを呼ばずlaunched:falseを返し、一覧ではworkingとして見える', async () => {
  const fixture = setupFixture();
  const jobId = crypto.randomBytes(16).toString('hex');
  const jobDir = makeTestJobDir(jobId);
  const callLog = path.join(fixture.root, 'claude-calls.log');
  writeFakeClaude(path.join(fixture.root, 'bin'), { jobId, callLogPath: callLog, delayMs: 20 });
  writeSessionsMap(fixture.dataDir, buildLaunchPayload().file, {
    'group-a': { jobId, name: 'demo-project ▸ demo-project', launchedAt: new Date().toISOString() },
  });
  fs.writeFileSync(path.join(jobDir, 'state.json'), JSON.stringify({ state: 'running', sessionId: 'full-session-uuid-0003' }));
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
    PATH: `${path.join(fixture.root, 'bin')}:${process.env.PATH}`,
  });
  try {
    const res = await postLaunch(server.baseUrl, buildLaunchPayload());
    assert.equal(res.status, 200);
    assert.equal(res.body.launched, false);
    assert.equal(res.body.reason, 'already-running');
    assert.equal(fs.existsSync(callLog), false, 'claudeを呼ばないこと');
    const sessions = await (await fetch(`${server.baseUrl}/api/sessions?file=${buildLaunchPayload().file}`)).json();
    assert.equal(sessions['group-a'].state, 'working');
  } finally {
    await server.stop();
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
});

// AC-CC2-2（doneセッションもプロセスが残るため、stopを挟んで同一IDで継続する）
test('完了済み(done)セッションへの再起動も、stopしてから--resumeする', async () => {
  const fixture = setupFixture();
  const jobId = 'bbbb2222';
  const jobDir = makeTestJobDir(jobId);
  const callLog = path.join(fixture.root, 'claude-calls.log');
  writeFakeClaude(path.join(fixture.root, 'bin'), { jobId, callLogPath: callLog, delayMs: 20 });
  writeSessionsMap(fixture.dataDir, buildLaunchPayload().file, {
    'group-a': { jobId, name: 'demo-project ▸ demo-project', launchedAt: new Date().toISOString() },
  });
  fs.writeFileSync(path.join(jobDir, 'state.json'), JSON.stringify({
    state: 'done',
    sessionId: 'full-session-uuid-0002',
  }));
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
    PATH: `${path.join(fixture.root, 'bin')}:${process.env.PATH}`,
  });
  try {
    const res = await postLaunch(server.baseUrl, buildLaunchPayload());
    assert.equal(res.status, 200);
    assert.equal(res.body.launched, true);
    const calls = fs.readFileSync(callLog, 'utf-8').trim().split('\n');
    assert.equal(calls.length, 2, 'stopと--resumeの2回呼ばれること');
    assert.equal(calls[0].trim(), `stop ${jobId}`);
    assert.match(calls[1], /^--bg --resume full-session-uuid-0002 -- /);
  } finally {
    await server.stop();
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
});

// AC-NS-SRV-1
test('newSession指定時は稼働中の既存セッションがあってもstop・--resumeせず新規起動し、紐付けを差し替える', async () => {
  const fixture = setupFixture();
  const oldJobId = 'cccc3333';
  const newJobId = 'dddd4444';
  const jobDir = makeTestJobDir(oldJobId);
  const callLog = path.join(fixture.root, 'claude-calls.log');
  writeFakeClaude(path.join(fixture.root, 'bin'), { jobId: newJobId, callLogPath: callLog, delayMs: 20 });
  const file = buildLaunchPayload().file;
  writeSessionsMap(fixture.dataDir, file, {
    'group-a': { jobId: oldJobId, name: 'demo-project ▸ demo-project', launchedAt: new Date().toISOString() },
  });
  fs.writeFileSync(path.join(jobDir, 'state.json'), JSON.stringify({
    state: 'working',
    sessionId: 'full-session-uuid-0003',
  }));
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
    PATH: `${path.join(fixture.root, 'bin')}:${process.env.PATH}`,
  });
  try {
    const res = await postLaunch(server.baseUrl, buildLaunchPayload({ newSession: true }));
    assert.equal(res.status, 200);
    assert.equal(res.body.launched, true);
    assert.equal(res.body.jobId, newJobId);
    const calls = fs.readFileSync(callLog, 'utf-8').trim().split('\n');
    assert.equal(calls.length, 1, 'stopは呼ばれず起動のみ1回であること');
    assert.doesNotMatch(calls[0], /--resume/);
    const sessionsMap = JSON.parse(fs.readFileSync(
      path.join(fixture.dataDir, `sessions-${file.replace(/\.md$/, '')}.json`), 'utf-8'));
    assert.equal(sessionsMap['group-a'].jobId, newJobId);
  } finally {
    await server.stop();
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
});
