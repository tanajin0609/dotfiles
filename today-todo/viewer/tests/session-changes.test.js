'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { setupFixture, startViewerServer, TEST_JOBS_DIR } = require('./helpers');

const toolUse = (name, filePath) => JSON.stringify({
  type: 'assistant', message: { content: [{ type: 'tool_use', name, input: { file_path: filePath } }] },
});

// AC-CHG-SRV-1
test('GET /api/session/changes はセッションが書いたファイルの git の状態と行数の増減を返す', async () => {
  const fixture = setupFixture();
  const repo = fixture.projectDir;
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  fs.writeFileSync(path.join(repo, 'a.js'), 'one\ntwo\nthree\n');
  fs.writeFileSync(path.join(repo, 'same.md'), 'x\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  fs.writeFileSync(path.join(repo, 'a.js'), 'one\nTWO\nthree\nfour\n');
  fs.writeFileSync(path.join(repo, 'new.md'), 'a\nb\n');

  const jobId = crypto.randomBytes(16).toString('hex');
  const jobDir = path.join(TEST_JOBS_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  const outside = path.join(path.dirname(path.resolve(fixture.todoDir, '..')), `outside-${process.pid}.md`);
  const transcriptPath = path.join(jobDir, 's.jsonl');
  fs.writeFileSync(transcriptPath, [
    toolUse('Edit', path.join(repo, 'a.js')),
    toolUse('Write', path.join(repo, 'new.md')),
    toolUse('Edit', path.join(repo, 'same.md')),
    toolUse('Write', outside),
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(jobDir, 'state.json'), JSON.stringify({ state: 'done', linkScanPath: transcriptPath }));

  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    const res = await fetch(`${server.baseUrl}/api/session/changes?jobId=${jobId}`);
    assert.equal(res.status, 200);
    const { files } = await res.json();
    const byName = Object.fromEntries(files.map((f) => [path.basename(f.path), f]));
    assert.deepEqual(Object.keys(byName).sort(), ['a.js', 'new.md', 'same.md']);
    assert.equal(byName['a.js'].status, 'modified');
    assert.equal(byName['a.js'].added, 2);
    assert.equal(byName['a.js'].deleted, 1);
    assert.equal(byName['new.md'].status, 'untracked');
    assert.equal(byName['new.md'].added, 2);
    assert.equal(byName['same.md'].status, 'unchanged');
    assert.equal((await fetch(`${server.baseUrl}/api/session/changes?jobId=zz`)).status, 400);
  } finally {
    await server.stop();
  }
});
