'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { setupFixture, startViewerServer } = require('./helpers');

// server.jsのCLAUDE_JOBS_DIRは`~/.claude/jobs`固定のため、実ホーム配下にランダム名のジョブを一時的に作り、必ず削除する。
function makeTestJobDir() {
  const jobId = crypto.randomBytes(16).toString('hex');
  const jobDir = path.join(os.homedir(), '.claude', 'jobs', jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  return { jobId, jobDir };
}

// 引数とcwdを1行ずつ記録し、`claude --bg`互換の出力を返す偽claude。
function writeFakeClaude(binDir, logPath) {
  fs.mkdirSync(binDir, { recursive: true });
  const scriptPath = path.join(binDir, 'claude');
  fs.writeFileSync(scriptPath, `#!/bin/sh
printf '%s\\n' "$PWD" >> "${logPath}"
for a in "$@"; do printf '%s\\n' "$a" >> "${logPath}"; done
echo "backgrounded · b7b7b7 · fake"
`);
  fs.chmodSync(scriptPath, 0o755);
}

const line = (o) => JSON.stringify({ sessionId: 'orig', ...o });

// AC-BR-SRV-1〜3
test('指定uuidまでの祖先だけを新sessionIdで書き出してresume起動し、カードのセッションを差し替える', async () => {
  const fixture = setupFixture();
  const { jobId, jobDir } = makeTestJobDir();
  const transcriptPath = path.join(jobDir, 'orig.jsonl');
  const original = [
    line({ type: 'mode', mode: 'x' }),
    line({ type: 'user', uuid: 'u1', parentUuid: null, cwd: fixture.projectDir, message: { content: 'はじめ' } }),
    line({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', cwd: fixture.projectDir, message: { content: [{ type: 'text', text: '回答1' }] } }),
    line({ type: 'user', uuid: 'u2', parentUuid: 'a1', cwd: fixture.projectDir, message: { content: '次' } }),
    line({ type: 'assistant', uuid: 'a2', parentUuid: 'u2', cwd: fixture.projectDir, message: { content: [{ type: 'text', text: '回答2' }] } }),
    line({ type: 'user', uuid: 'u3', parentUuid: 'a2', cwd: fixture.projectDir, message: { content: 'その先' } }),
  ].join('\n') + '\n';
  fs.writeFileSync(transcriptPath, original);
  fs.writeFileSync(path.join(jobDir, 'state.json'), JSON.stringify({ state: 'done', linkScanPath: transcriptPath, sessionId: 'orig' }));
  fs.writeFileSync(path.join(fixture.dataDir, 'sessions-todo-2026-01-01.json'), JSON.stringify({
    g1: { jobId, name: 'n', launchedAt: '2026-01-01T00:00:00.000Z' },
  }));
  const logPath = path.join(fixture.root, 'claude.log');
  writeFakeClaude(path.join(fixture.root, 'bin'), logPath);
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir,
    PATH: `${path.join(fixture.root, 'bin')}:${process.env.PATH}`,
  });
  try {
    const transcript = await (await fetch(`${server.baseUrl}/api/session/transcript?jobId=${jobId}`)).json();
    assert.deepEqual(transcript.entries.map((e) => e.uuid), ['u1', 'a1', 'u2', 'a2', 'u3']);

    const res = await fetch(`${server.baseUrl}/api/session/branch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: fixture.todoFile, groupId: 'g1', columnName: 'demo-project', groupTitle: 'group-a', uuid: 'a1', text: '別案で' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.jobId, 'b7b7b7');

    assert.equal(fs.readFileSync(transcriptPath, 'utf-8'), original, '元のtranscriptは変更しない');
    const branched = fs.readFileSync(path.join(jobDir, `${body.sessionId}.jsonl`), 'utf-8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(branched.map((o) => o.uuid), ['u1', 'a1']);
    assert.ok(branched.every((o) => o.sessionId === body.sessionId));

    const log = fs.readFileSync(logPath, 'utf-8').split('\n');
    assert.equal(fs.realpathSync(log[0]), fs.realpathSync(fixture.projectDir));
    const resumeAt = log.indexOf('--resume');
    assert.ok(log.includes('--bg'));
    assert.equal(log[resumeAt + 1], body.sessionId);

    const sessions = JSON.parse(fs.readFileSync(path.join(fixture.dataDir, 'sessions-todo-2026-01-01.json'), 'utf-8'));
    assert.equal(sessions.g1.jobId, 'b7b7b7');
    assert.deepEqual(sessions.g1.branchedFrom, { jobId, uuid: 'a1' });
  } finally {
    await server.stop();
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
});

// AC-BR-SRV-4
test('uuidが見つからなければ404、textが空なら400', async () => {
  const fixture = setupFixture();
  const { jobId, jobDir } = makeTestJobDir();
  const transcriptPath = path.join(jobDir, 'orig.jsonl');
  fs.writeFileSync(transcriptPath, `${line({ type: 'user', uuid: 'u1', parentUuid: null, cwd: fixture.projectDir, message: { content: 'x' } })}\n`);
  fs.writeFileSync(path.join(jobDir, 'state.json'), JSON.stringify({ state: 'done', linkScanPath: transcriptPath }));
  fs.writeFileSync(path.join(fixture.dataDir, 'sessions-todo-2026-01-01.json'), JSON.stringify({ g1: { jobId } }));
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  const post = (payload) => fetch(`${server.baseUrl}/api/session/branch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: fixture.todoFile, groupId: 'g1', columnName: 'demo-project', groupTitle: 'group-a', ...payload }),
  });
  try {
    assert.equal((await post({ uuid: 'nope', text: 'x' })).status, 404);
    assert.equal((await post({ uuid: 'u1', text: '  ' })).status, 400);
  } finally {
    await server.stop();
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
});
