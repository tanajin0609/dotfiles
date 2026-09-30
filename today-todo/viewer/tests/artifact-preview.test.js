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

const toolUse = (name, filePath) => JSON.stringify({
  type: 'assistant', message: { content: [{ type: 'tool_use', name, input: { file_path: filePath } }] },
});

// AC-AP-SRV-1・AC-AP-SRV-2
test('セッションが書いた資料を一覧し、一覧内かつロック外のファイルだけ配信する', async () => {
  const fixture = setupFixture();
  const { jobId, jobDir } = makeTestJobDir();
  const out = path.join(fixture.root, 'out');
  fs.mkdirSync(out);
  const html = path.join(out, 'report.html');
  const png = path.join(out, 'chart.png');
  const secret = path.join(out, 'secret-notes.md');
  const outside = path.join(out, 'other.html');
  fs.writeFileSync(html, '<p>hi</p>');
  fs.writeFileSync(png, 'PNG');
  fs.writeFileSync(secret, 'x');
  fs.writeFileSync(outside, 'x');
  const transcriptPath = path.join(jobDir, 's.jsonl');
  fs.writeFileSync(transcriptPath, [
    toolUse('Write', html),
    toolUse('Write', path.join(out, 'main.js')),
    toolUse('Write', secret),
    toolUse('Edit', path.join(out, 'gone.md')),
  ].join('\n') + '\n');
  fs.mkdirSync(path.join(jobDir, 's', 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(jobDir, 's', 'subagents', 'a.jsonl'), `${toolUse('Write', png)}\n`);
  fs.writeFileSync(path.join(jobDir, 'state.json'), JSON.stringify({ state: 'done', linkScanPath: transcriptPath }));
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  const get = (p) => fetch(`${server.baseUrl}/api/session/artifact?jobId=${jobId}&path=${encodeURIComponent(p)}`);
  try {
    const { artifacts } = await (await fetch(`${server.baseUrl}/api/session/artifacts?jobId=${jobId}`)).json();
    const byPath = Object.fromEntries(artifacts.map((a) => [a.path, a]));
    assert.deepEqual(Object.keys(byPath).sort(), [html, png, secret, path.join(out, 'gone.md')].sort());
    assert.deepEqual(byPath[html], { path: html, kind: 'html', locked: false, exists: true });
    assert.equal(byPath[png].kind, 'image');
    assert.equal(byPath[secret].locked, true);
    assert.equal(byPath[path.join(out, 'gone.md')].exists, false);

    const htmlRes = await get(html);
    assert.equal(htmlRes.status, 200);
    assert.match(htmlRes.headers.get('content-type'), /text\/html/);
    assert.equal(htmlRes.headers.get('content-security-policy'), 'sandbox');
    assert.equal(await htmlRes.text(), '<p>hi</p>');
    assert.match((await get(png)).headers.get('content-type'), /image\/png/);
    assert.equal((await get(secret)).status, 403);
    assert.equal((await get(outside)).status, 403);
    assert.equal((await get(path.join(out, 'gone.md'))).status, 404);
    assert.equal((await fetch(`${server.baseUrl}/api/session/artifacts?jobId=../x`)).status, 400);
  } finally {
    await server.stop();
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
});
