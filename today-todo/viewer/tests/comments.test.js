'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  setupFixture, startViewerServer, writeFakeClaude, countLines,
} = require('./helpers');

// AC-C3-SRV-1
test('POST /api/comments はコメントを保存するだけで偽claudeを呼ばない', async () => {
  const fixture = setupFixture();
  const callLog = path.join(fixture.root, 'claude-calls.log');
  writeFakeClaude(path.join(fixture.root, 'bin'), { callLogPath: callLog, delayMs: 50 });
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
    PATH: `${path.join(fixture.root, 'bin')}:${process.env.PATH}`,
  });
  try {
    const res = await fetch(`${server.baseUrl}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: fixture.todoFile, groupId: 'group-a', text: 'メモ' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.comments.length, 1);
    assert.equal(body.comments[0].text, 'メモ');
    assert.equal(countLines(callLog), 0);
  } finally {
    await server.stop();
  }
});
