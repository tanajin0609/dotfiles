'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  setupFixture, startViewerServer, writeStatefulFakeClaude, readCalls, readPrompts,
} = require('./helpers');

const FILE = 'todo-2026-01-01.md';
const SESSIONS_NAME = 'sessions-todo-2026-01-01.json';

function payload(overrides) {
  return { file: FILE, groupId: 'group-a', columnName: 'demo-project', groupTitle: 'demo-project', text: '続けて', ...overrides };
}

async function postJson(baseUrl, url, body) {
  const res = await fetch(`${baseUrl}${url}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

// 状態を持つ偽の claude と、テスト専用のジョブ置き場（VIEWER_CLAUDE_JOBS_DIR）でサーバーを起動する。
async function setup({ fake = {}, env = {} } = {}) {
  const fixture = setupFixture();
  const jobsDir = path.join(fixture.root, 'jobs');
  const callLog = path.join(fixture.root, 'claude-calls.log');
  const projectsDir = path.join(fixture.root, 'projects');
  fs.mkdirSync(projectsDir, { recursive: true });
  writeStatefulFakeClaude(path.join(fixture.root, 'bin'), { jobsDir, callLogPath: callLog, ...fake });
  const writeJob = (jobId, state) => {
    fs.mkdirSync(path.join(jobsDir, jobId), { recursive: true });
    fs.writeFileSync(path.join(jobsDir, jobId, 'state.json'), JSON.stringify(state));
  };
  const writeTranscript = (sessionId, lines) => {
    const p = path.join(projectsDir, `${sessionId}.jsonl`);
    fs.writeFileSync(p, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    return p;
  };
  const writeSessions = (map, file = FILE) => {
    fs.writeFileSync(path.join(fixture.dataDir, `sessions-${file.replace(/\.md$/, '')}.json`), JSON.stringify(map));
  };
  const readSessions = (name = SESSIONS_NAME) => JSON.parse(fs.readFileSync(path.join(fixture.dataDir, name), 'utf-8'));
  const start = () => startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
    VIEWER_CLAUDE_JOBS_DIR: jobsDir,
    PATH: `${path.join(fixture.root, 'bin')}:${process.env.PATH}`,
    ...env,
  });
  return { fixture, jobsDir, callLog, writeJob, writeTranscript, writeSessions, readSessions, start };
}

function linked(jobId, extra) {
  return { jobId, name: 'demo-project ▸ demo-project', launchedAt: '2026-01-01T00:00:00.000Z', ...extra };
}

// K1・N12（AC-CC2-2・AC-MS-SRV-3）
test('done のジョブへの返信は stop の後にフラグなしで --resume し、jobId が変わらない（rm もしない）', async () => {
  const t = await setup();
  const sid = crypto.randomUUID();
  t.writeJob('aaaa1111', { state: 'done', sessionId: sid, linkScanPath: t.writeTranscript(sid, [{ type: 'user', message: { content: 'hi' } }]) });
  t.writeSessions({ 'group-a': linked('aaaa1111') });
  fs.writeFileSync(path.join(t.fixture.dataDir, 'launch-settings.json'), JSON.stringify({ model: 'opus', effort: 'high' }));
  const server = await t.start();
  try {
    const res = await postJson(server.baseUrl, '/api/session/launch', payload());
    assert.equal(res.status, 200);
    assert.equal(res.body.jobId, 'aaaa1111');
    assert.equal(res.body.resumed, true);
    assert.equal(res.body.copied, undefined);
    const calls = readCalls(t.callLog);
    assert.deepEqual(calls, ['stop aaaa1111', `--bg --resume ${sid} -- 続けて`]);
    assert.equal(t.readSessions()['group-a'].jobId, 'aaaa1111');
  } finally {
    await server.stop();
  }
});

// K2・N2
test('stop の後は VIEWER_STOP_SETTLE_MS だけ待ってから resume する', async () => {
  const t = await setup({ env: { VIEWER_STOP_SETTLE_MS: '600' } });
  const sid = crypto.randomUUID();
  t.writeJob('aaaa2222', { state: 'done', sessionId: sid });
  t.writeSessions({ 'group-a': linked('aaaa2222') });
  const server = await t.start();
  try {
    const startedAt = Date.now();
    const res = await postJson(server.baseUrl, '/api/session/launch', payload());
    assert.equal(res.body.jobId, 'aaaa2222');
    assert.ok(Date.now() - startedAt >= 600, 'stop の後に待つこと');
  } finally {
    await server.stop();
  }
});

test('stop 直後でまだ running と判定されてコピーになったら、コピーを片付けて1回だけやり直す', async () => {
  const t = await setup({ fake: { runningResumesAfterStop: 1, newJobId: 'c0c0c0c0' } });
  const sid = crypto.randomUUID();
  t.writeJob('aaaa3333', { state: 'done', sessionId: sid });
  t.writeSessions({ 'group-a': linked('aaaa3333') });
  const server = await t.start();
  try {
    const res = await postJson(server.baseUrl, '/api/session/launch', payload());
    assert.equal(res.body.jobId, 'aaaa3333');
    assert.equal(res.body.copied, undefined);
    assert.deepEqual(readCalls(t.callLog), [
      'stop aaaa3333', `--bg --resume ${sid} -- 続けて`, 'stop c0c0c0c0', 'rm c0c0c0c0', `--bg --resume ${sid} -- 続けて`,
    ]);
    assert.equal(fs.existsSync(path.join(t.jobsDir, 'c0c0c0c0')), false);
  } finally {
    await server.stop();
  }
});

test('やり直してもコピーなら、コピーを紐付けて copied を返し、元ジョブを rm する', async () => {
  const t = await setup({ fake: { runningResumesAfterStop: 5 } });
  const sid = crypto.randomUUID();
  t.writeJob('aaaa4444', { state: 'done', sessionId: sid });
  t.writeSessions({ 'group-a': linked('aaaa4444') });
  const server = await t.start();
  try {
    const res = await postJson(server.baseUrl, '/api/session/launch', payload());
    assert.equal(res.body.copied, true);
    assert.notEqual(res.body.jobId, 'aaaa4444');
    assert.equal(t.readSessions()['group-a'].jobId, res.body.jobId);
    assert.equal(readCalls(t.callLog).at(-1), 'rm aaaa4444');
  } finally {
    await server.stop();
  }
});

// K3
test('システムプロンプトのツール一覧に EnterWorktree があるだけなら、コピーになった元ジョブを rm する', async () => {
  const t = await setup({ fake: { runningResumesAfterStop: 5 } });
  const sid = crypto.randomUUID();
  const transcript = t.writeTranscript(sid, [
    { type: 'user', message: { content: [{ type: 'text', text: 'hi' }] }, tools: [{ name: 'EnterWorktree', description: '...' }] },
    { type: 'user', message: { content: 'hi' } },
  ]);
  t.writeJob('aaaa5555', { state: 'done', sessionId: sid, linkScanPath: transcript });
  t.writeSessions({ 'group-a': linked('aaaa5555') });
  const server = await t.start();
  try {
    await postJson(server.baseUrl, '/api/session/launch', payload());
    assert.equal(readCalls(t.callLog).at(-1), 'rm aaaa5555');
  } finally {
    await server.stop();
  }
});

// N1（AC-BR-SRV-5）
test('同じ todo の別カードへの起動が重なっても、両方の jobId が sessions に残る', async () => {
  const t = await setup({ fake: { delayMs: 400 } });
  fs.writeFileSync(path.join(t.fixture.dataDir, SESSIONS_NAME), '{}');
  const server = await t.start();
  try {
    const [a, b] = await Promise.all([
      postJson(server.baseUrl, '/api/session/launch', payload({ groupId: 'group-a' })),
      postJson(server.baseUrl, '/api/session/launch', payload({ groupId: 'group-b' })),
    ]);
    const map = t.readSessions();
    assert.equal(map['group-a'].jobId, a.body.jobId);
    assert.equal(map['group-b'].jobId, b.body.jobId);
  } finally {
    await server.stop();
  }
});

test('起動を待っている間にポーリングが書いた別カードの notifiedAt を消さない', async () => {
  const t = await setup({ fake: { delayMs: 800 } });
  t.writeJob('bbbb0001', { state: 'done', detail: '終わりました', updatedAt: '2026-01-01T01:00:00.000Z' });
  t.writeSessions({ 'group-b': linked('bbbb0001') });
  const server = await t.start();
  try {
    const launching = postJson(server.baseUrl, '/api/session/launch', payload({ groupId: 'group-a' }));
    await new Promise((r) => setTimeout(r, 200));
    await fetch(`${server.baseUrl}/api/sessions?file=${FILE}`);
    await launching;
    assert.equal(t.readSessions()['group-b'].notifiedAt, '2026-01-01T01:00:00.000Z');
    await fetch(`${server.baseUrl}/api/sessions?file=${FILE}`);
    const comments = JSON.parse(fs.readFileSync(path.join(t.fixture.dataDir, 'comments-todo-2026-01-01.json'), 'utf-8'));
    assert.equal(comments['group-b'].length, 1, '完了コメントが重複しないこと');
  } finally {
    await server.stop();
  }
});

// N3・N17（AC-JS-SRV-1）
test('state.json の state/tempo/needs を working・blocked・done・failed に正規化する', async () => {
  const t = await setup();
  const cases = {
    ask: [{ state: 'working', tempo: 'blocked', needs: 'answer: 続行しますか？', detail: '続行しますか？' }, 'blocked'],
    needsOnly: [{ state: 'working', needs: 'answer: x' }, 'blocked'],
    idleRunning: [{ state: 'running', tempo: 'idle' }, 'working'],
    running: [{ state: 'running', tempo: 'active' }, 'working'],
    crashed: [{ state: 'crashed' }, 'working'],
    resuming: [{ state: 'resuming' }, 'working'],
    starting: [{ state: 'starting' }, 'working'],
    failed: [{ state: 'failed' }, 'failed'],
    error: [{ state: 'error' }, 'failed'],
    stopped: [{ state: 'stopped' }, 'done'],
    blocked: [{ state: 'blocked' }, 'blocked'],
    done: [{ state: 'done' }, 'done'],
  };
  const map = {};
  for (const [key, [state]] of Object.entries(cases)) {
    const jobId = crypto.createHash('md5').update(key).digest('hex').slice(0, 8);
    t.writeJob(jobId, state);
    map[key] = linked(jobId);
  }
  t.writeSessions(map);
  const server = await t.start();
  try {
    const sessions = await (await fetch(`${server.baseUrl}/api/sessions?file=${FILE}`)).json();
    for (const [key, [, expected]] of Object.entries(cases)) {
      assert.equal(sessions[key].state, expected, key);
    }
  } finally {
    await server.stop();
  }
});

test('AskUserQuestion の回答待ち（working＋tempo=blocked）には返信でき、質問を添えて送る（N13）', async () => {
  const t = await setup();
  const sid = crypto.randomUUID();
  const transcript = t.writeTranscript(sid, [
    { type: 'user', uuid: 'u1', message: { content: 'はじめ' } },
    { type: 'assistant', uuid: 'a1', message: { content: [{ type: 'tool_use', name: 'AskUserQuestion', input: { questions: [{ question: '続行しますか？', options: [{ label: 'はい' }, { label: 'いいえ' }] }] } }] } },
  ]);
  t.writeJob('aaaa6666', { state: 'working', tempo: 'blocked', needs: 'answer: 続行しますか？', detail: '続行しますか？', sessionId: sid, linkScanPath: transcript, updatedAt: 'x1' });
  t.writeSessions({ 'group-a': linked('aaaa6666') });
  const server = await t.start();
  try {
    await fetch(`${server.baseUrl}/api/sessions?file=${FILE}`);
    const comments = JSON.parse(fs.readFileSync(path.join(t.fixture.dataDir, 'comments-todo-2026-01-01.json'), 'utf-8'));
    assert.deepEqual(comments['group-a'].map((c) => c.text), ['[Claude 確認] 続行しますか？']);
    const res = await postJson(server.baseUrl, '/api/session/launch', payload({ text: 'はい' }));
    assert.equal(res.body.launched, true);
    assert.equal(res.body.jobId, 'aaaa6666');
    assert.equal(readCalls(t.callLog)[0], 'stop aaaa6666');
    assert.deepEqual(readPrompts(t.callLog), ['直前の質問「続行しますか？」への回答: はい']);
  } finally {
    await server.stop();
  }
});

test('crashed・resuming のジョブへの返信は稼働中として扱い、claude を呼ばない', async () => {
  const t = await setup();
  t.writeJob('aaaa7777', { state: 'resuming', sessionId: crypto.randomUUID() });
  t.writeSessions({ 'group-a': linked('aaaa7777') });
  const server = await t.start();
  try {
    const res = await postJson(server.baseUrl, '/api/session/launch', payload());
    assert.equal(res.body.launched, false);
    assert.deepEqual(readCalls(t.callLog), []);
  } finally {
    await server.stop();
  }
});

// N13（前置きを付けない）
test('返信の指示には新規起動の前置きを付けず、新規起動には付ける', async () => {
  const t = await setup();
  const sid = crypto.randomUUID();
  t.writeJob('aaaa8888', { state: 'done', sessionId: sid });
  t.writeSessions({ 'group-a': linked('aaaa8888') });
  const server = await t.start();
  try {
    await postJson(server.baseUrl, '/api/session/launch', payload({ text: '返信です' }));
    await postJson(server.baseUrl, '/api/session/launch', payload({ groupId: 'group-new', text: '新しい依頼' }));
    assert.deepEqual(readPrompts(t.callLog), ['返信です', '「demo-project」の「demo-project」について、以下の指示を実行してください:\\n\\n新しい依頼']);
  } finally {
    await server.stop();
  }
});

// N4
test('state.json に sessionId が無ければ linkScanPath のファイル名の UUID で resume する', async () => {
  const t = await setup();
  const sid = crypto.randomUUID();
  t.writeJob('aaaa9999', { state: 'blocked', linkScanPath: t.writeTranscript(sid, [{ type: 'user', message: { content: 'hi' } }]) });
  t.writeSessions({ 'group-a': linked('aaaa9999') });
  const server = await t.start();
  try {
    const res = await postJson(server.baseUrl, '/api/session/launch', payload());
    assert.equal(res.body.resumed, true);
    assert.deepEqual(readCalls(t.callLog), ['stop aaaa9999', `--bg --resume ${sid} -- 続けて`]);
  } finally {
    await server.stop();
  }
});

test('sessionId を取れずに新規起動したときは resumed:false を返す', async () => {
  const t = await setup();
  t.writeJob('abab0001', { state: 'blocked', linkScanPath: '/nowhere/not-a-uuid.jsonl' });
  t.writeSessions({ 'group-a': linked('abab0001') });
  const server = await t.start();
  try {
    const res = await postJson(server.baseUrl, '/api/session/launch', payload());
    assert.equal(res.body.launched, true);
    assert.equal(res.body.resumed, false);
    assert.doesNotMatch(readCalls(t.callLog)[0], /--resume/);
  } finally {
    await server.stop();
  }
});

// N5
test('rm 済みのジョブには控えた transcript の UUID でフラグ付きの resume をし、ログと資料も控えたパスから返す', async () => {
  const t = await setup();
  const sid = crypto.randomUUID();
  const transcript = t.writeTranscript(sid, [
    { type: 'user', uuid: 'u1', message: { content: 'はじめ' } },
    { type: 'assistant', uuid: 'a1', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: path.join(t.fixture.root, 'out.md') } }] } },
  ]);
  fs.writeFileSync(path.join(t.fixture.root, 'out.md'), '# out');
  t.writeSessions({ 'group-a': linked('deadbeef', { transcriptPath: transcript }) });
  fs.writeFileSync(path.join(t.fixture.dataDir, 'launch-settings.json'), JSON.stringify({ model: 'opus' }));
  const server = await t.start();
  try {
    const log = await fetch(`${server.baseUrl}/api/session/transcript?jobId=deadbeef`);
    assert.equal(log.status, 200);
    assert.deepEqual((await log.json()).entries.map((e) => e.uuid), ['u1', 'a1']);
    const artifacts = await fetch(`${server.baseUrl}/api/session/artifacts?jobId=deadbeef`);
    assert.equal(artifacts.status, 200);
    assert.equal((await artifacts.json()).artifacts.length, 1);

    const res = await postJson(server.baseUrl, '/api/session/launch', payload());
    assert.equal(res.body.resumed, true);
    assert.equal(res.body.jobId, sid.slice(0, 8));
    assert.deepEqual(readCalls(t.callLog), [`--bg --model opus --resume ${sid} -n demo-project ▸ demo-project -- 続けて`]);
  } finally {
    await server.stop();
  }
});

test('- で始まる返信・新規依頼も -- の後に置き、そのまま送る', async () => {
  const t = await setup();
  const sid = crypto.randomUUID();
  t.writeJob('afaf0001', { state: 'done', sessionId: sid });
  t.writeSessions({ 'group-a': linked('afaf0001') });
  const server = await t.start();
  try {
    const reply = await postJson(server.baseUrl, '/api/session/launch', payload({ text: '- 箇条書き\n- --help' }));
    assert.equal(reply.body.jobId, 'afaf0001');
    await postJson(server.baseUrl, '/api/session/launch', payload({ groupId: 'group-new', text: '-n x' }));
    const calls = readCalls(t.callLog);
    assert.equal(calls[1], `--bg --resume ${sid} -- - 箇条書き - --help`);
    assert.match(calls[2], /^--bg -n demo-project ▸ demo-project -- 「demo-project」/);
    assert.equal(readPrompts(t.callLog)[0], '- 箇条書き\\n- --help');
  } finally {
    await server.stop();
  }
});

// N8（AC-BR-SRV-6）
test('claude --bg が時間切れになっても、同じ名前で起動したジョブが見つかれば紐付ける', async () => {
  const t = await setup({ fake: { hangMs: 3000, newJobId: 'f00df00d' }, env: { VIEWER_LAUNCH_TIMEOUT_MS: '700' } });
  const server = await t.start();
  try {
    const res = await postJson(server.baseUrl, '/api/session/launch', payload());
    assert.equal(res.status, 200);
    assert.equal(res.body.jobId, 'f00df00d');
    assert.equal(res.body.recovered, true);
    assert.equal(t.readSessions()['group-a'].jobId, 'f00df00d');
  } finally {
    await server.stop();
  }
});

// N9（AC-BR-SRV-3）
test('分岐の後、入力待ちの元ジョブを stop する（rm はしない）', async () => {
  const t = await setup();
  const sid = crypto.randomUUID();
  const transcript = t.writeTranscript(sid, [
    { type: 'user', uuid: 'u1', parentUuid: null, cwd: t.fixture.projectDir, sessionId: sid, message: { content: 'はじめ' } },
    { type: 'assistant', uuid: 'a1', parentUuid: 'u1', cwd: t.fixture.projectDir, sessionId: sid, message: { content: [{ type: 'text', text: '回答' }] } },
  ]);
  t.writeJob('acac0001', { state: 'working', tempo: 'blocked', needs: 'answer: x', sessionId: sid, linkScanPath: transcript });
  t.writeSessions({ 'group-a': linked('acac0001') });
  const server = await t.start();
  try {
    const res = await postJson(server.baseUrl, '/api/session/branch', { ...payload({ text: '別案で' }), uuid: 'a1' });
    assert.equal(res.status, 200);
    const calls = readCalls(t.callLog);
    assert.match(calls[0], new RegExp(`^--bg --resume ${res.body.sessionId} -n `));
    assert.deepEqual(calls.slice(1), ['stop acac0001']);
  } finally {
    await server.stop();
    fs.rmSync(path.join(path.dirname(transcript)), { recursive: true, force: true });
  }
});

// N11（AC-CC2-3）
test('/api/sessions のポーリングで、表示中でない todo のセッションにも自動コメントを付ける', async () => {
  const t = await setup();
  t.writeJob('adad0001', { state: 'done', detail: '別の日の完了', updatedAt: 'u1' });
  t.writeSessions({ 'group-z': linked('adad0001') }, 'todo-2025-12-31.md');
  const server = await t.start();
  try {
    await fetch(`${server.baseUrl}/api/sessions?file=${FILE}`);
    const comments = JSON.parse(fs.readFileSync(path.join(t.fixture.dataDir, 'comments-todo-2025-12-31.json'), 'utf-8'));
    assert.deepEqual(comments['group-z'].map((c) => c.text), ['[Claude 完了] 別の日の完了']);
  } finally {
    await server.stop();
  }
});

// N10
test('ログの取得はファイルが変わったときだけ読み直し、追記された行は次の取得で返る', async () => {
  const t = await setup();
  const sid = crypto.randomUUID();
  const transcript = t.writeTranscript(sid, [{ type: 'user', uuid: 'u1', message: { content: 'one' } }]);
  t.writeJob('aeae0001', { state: 'working', sessionId: sid, linkScanPath: transcript });
  const server = await t.start();
  try {
    const first = await (await fetch(`${server.baseUrl}/api/session/transcript?jobId=aeae0001`)).json();
    assert.equal(first.entries.length, 1);
    fs.appendFileSync(transcript, JSON.stringify({ type: 'assistant', uuid: 'a1', message: { content: [{ type: 'text', text: 'two' }] } }) + '\n');
    const second = await (await fetch(`${server.baseUrl}/api/session/transcript?jobId=aeae0001`)).json();
    assert.deepEqual(second.entries.map((e) => e.uuid), ['u1', 'a1']);
  } finally {
    await server.stop();
  }
});
