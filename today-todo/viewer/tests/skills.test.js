'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer, writeFakeClaude } = require('./helpers');

function writeSkill(skillsDir, dir, content) {
  fs.mkdirSync(path.join(skillsDir, dir), { recursive: true });
  if (content !== null) fs.writeFileSync(path.join(skillsDir, dir, 'SKILL.md'), content);
}

async function postJson(baseUrl, pathname, body) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function startWithSkills(fixture, extraEnv = {}) {
  const callLog = path.join(fixture.root, 'claude-calls.log');
  writeFakeClaude(path.join(fixture.root, 'bin'), { callLogPath: callLog, jobId: 'b2c3d4', delayMs: 0 });
  const skillCwd = path.join(fixture.root, 'skill-cwd');
  fs.mkdirSync(skillCwd, { recursive: true });
  const jobsDir = path.join(fixture.root, 'jobs');
  fs.mkdirSync(jobsDir, { recursive: true });
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir,
    VIEWER_CLAUDE_SETTINGS: path.join(fixture.root, 'missing.json'),
    VIEWER_SKILLS_DIR: path.join(fixture.root, 'skills'), VIEWER_SKILL_CWD: skillCwd,
    VIEWER_CLAUDE_JOBS_DIR: jobsDir, VIEWER_STOP_SETTLE_MS: '0',
    PATH: `${path.join(fixture.root, 'bin')}:${process.env.PATH}`, ...extraEnv,
  });
  return { server, callLog, jobsDir, skillCwd };
}

// AC-SK-SRV-1
test('スキル一覧はfrontmatterのname・descriptionを名前順で返し、SKILL.mdの無いディレクトリと隠しディレクトリを除く', async () => {
  const fixture = setupFixture();
  const skillsDir = path.join(fixture.root, 'skills');
  writeSkill(skillsDir, 'zeta', '---\nname: zeta\ndescription: 一行の説明\n---\n本文');
  writeSkill(skillsDir, 'alpha-dir', '---\nname: alpha\ndescription: |\n  複数行の\n  説明\nmetadata:\n  x: y\n---\n');
  writeSkill(skillsDir, 'noname', '本文だけ');
  writeSkill(skillsDir, 'empty', null);
  writeSkill(skillsDir, '.trash', '---\nname: trash\n---\n');
  const { server } = await startWithSkills(fixture);
  try {
    const body = await (await fetch(`${server.baseUrl}/api/skills`)).json();
    assert.deepEqual(body.skills, [
      { name: 'alpha', description: '複数行の 説明' },
      { name: 'noname', description: '' },
      { name: 'zeta', description: '一行の説明' },
    ]);
  } finally {
    await server.stop();
  }
});

// AC-SK-SRV-1
test('スキルディレクトリが無ければ空配列', async () => {
  const fixture = setupFixture();
  const { server } = await startWithSkills(fixture);
  try {
    assert.deepEqual(await (await fetch(`${server.baseUrl}/api/skills`)).json(), { skills: [] });
  } finally {
    await server.stop();
  }
});

// AC-SK-SRV-2・AC-SK-SRV-3・AC-WT-SRV-2
test('作成依頼は/skill-creatorで起動して記録し、一覧に新しい順で出る。起動ディレクトリは信頼設定できる', async () => {
  const fixture = setupFixture();
  const configPath = path.join(fixture.root, 'claude.json');
  const { server, callLog, skillCwd } = await startWithSkills(fixture, { VIEWER_CLAUDE_CONFIG: configPath });
  try {
    assert.equal((await postJson(server.baseUrl, '/api/skills/create', { text: '  ' })).status, 400);
    const created = await postJson(server.baseUrl, '/api/skills/create', { text: '議事録を要約するskill' });
    assert.equal(created.status, 200);
    assert.equal(created.body.jobId, 'b2c3d4');
    const lastCall = fs.readFileSync(callLog, 'utf-8').split('\n').filter(Boolean).at(-1);
    assert.equal(lastCall.trim(), '--bg -n skill作成 ▸ 議事録を要約するskill -- /skill-creator 議事録を要約するskill');

    const { sessions } = await (await fetch(`${server.baseUrl}/api/skills/sessions`)).json();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].jobId, 'b2c3d4');
    assert.equal(sessions[0].text, '議事録を要約するskill');
    assert.equal(sessions[0].state, 'unknown');

    assert.equal((await postJson(server.baseUrl, '/api/workspace/trust', { cwd: skillCwd })).status, 200);
  } finally {
    await server.stop();
  }
});

// AC-SK-SRV-4
test('返信は記録済みのjobIdだけを受け付け、resumeして記録を新しいjobIdに差し替える', async () => {
  const fixture = setupFixture();
  const { server, callLog, jobsDir } = await startWithSkills(fixture);
  try {
    fs.mkdirSync(fixture.dataDir, { recursive: true });
    fs.writeFileSync(path.join(fixture.dataDir, 'skill-sessions.json'), JSON.stringify([{ jobId: 'aaaa1111', text: 't', launchedAt: '2026-10-15T00:00:00Z' }]));
    const sessionId = '11111111-2222-3333-4444-555555555555';
    fs.mkdirSync(path.join(jobsDir, 'aaaa1111'), { recursive: true });
    fs.writeFileSync(path.join(jobsDir, 'aaaa1111', 'state.json'), JSON.stringify({ state: 'blocked', sessionId }));

    assert.equal((await postJson(server.baseUrl, '/api/skills/reply', { jobId: 'ffff0000', text: 'x' })).status, 404);
    const replied = await postJson(server.baseUrl, '/api/skills/reply', { jobId: 'aaaa1111', text: 'はい' });
    assert.equal(replied.status, 200);
    assert.deepEqual(replied.body, { launched: true, jobId: 'b2c3d4' });
    const calls = fs.readFileSync(callLog, 'utf-8').split('\n').filter(Boolean).map((l) => l.trim());
    assert.deepEqual(calls.slice(-2), ['stop aaaa1111', `--bg --resume ${sessionId} -- はい`]);
    const saved = JSON.parse(fs.readFileSync(path.join(fixture.dataDir, 'skill-sessions.json'), 'utf-8'));
    assert.equal(saved[0].jobId, 'b2c3d4');

    fs.mkdirSync(path.join(jobsDir, 'b2c3d4'), { recursive: true });
    fs.writeFileSync(path.join(jobsDir, 'b2c3d4', 'state.json'), JSON.stringify({ state: 'working', sessionId }));
    assert.deepEqual((await postJson(server.baseUrl, '/api/skills/reply', { jobId: 'b2c3d4', text: 'x' })).body, { launched: false, reason: 'already-running' });
  } finally {
    await server.stop();
  }
});
