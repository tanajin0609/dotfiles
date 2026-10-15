'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { setupFixture, startViewerServer } = require('./helpers');

// server.jsのCLAUDE_JOBS_DIRは`~/.claude/jobs`に固定のため、ランダムなhex名のジョブディレクトリを一時的に作って必ず消す。
// AC-SLG-SRV-1
test('tool_resultには対応するtool_useのツール名を付け、対応が無ければnull', async () => {
  const fixture = setupFixture();
  const jobId = crypto.randomBytes(16).toString('hex');
  const jobDir = path.join(os.homedir(), '.claude', 'jobs', jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    const transcriptPath = path.join(jobDir, 'transcript.jsonl');
    const at = new Date().toISOString();
    fs.writeFileSync(transcriptPath, [
      { type: 'assistant', timestamp: at, message: { content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } }] } },
      { type: 'user', timestamp: at, message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'a.txt' }] } },
      { type: 'user', timestamp: at, message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_x', content: 'b' }] } },
    ].map((o) => JSON.stringify(o)).join('\n') + '\n');
    fs.writeFileSync(path.join(jobDir, 'state.json'), JSON.stringify({ state: 'done', linkScanPath: transcriptPath }));

    const body = await (await fetch(`${server.baseUrl}/api/session/transcript?jobId=${jobId}`)).json();
    const results = body.entries.filter((e) => e.kind === 'tool_result');
    assert.deepEqual(results.map((e) => e.name), ['Bash', null]);
  } finally {
    await server.stop();
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
});
