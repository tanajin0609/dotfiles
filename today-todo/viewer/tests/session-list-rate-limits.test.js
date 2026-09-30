'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer } = require('./helpers');

// AC-SL-SRV-1
test('全todoファイルのセッションを起動の新しい順に返し、ジョブが無ければstateはunknown', async () => {
  const fixture = setupFixture();
  fs.writeFileSync(path.join(fixture.dataDir, 'sessions-todo-2026-01-01.json'), JSON.stringify({
    g1: { jobId: 'nojob01', name: 'old', launchedAt: '2026-01-01T00:00:00.000Z' },
  }));
  fs.writeFileSync(path.join(fixture.dataDir, 'sessions-todo-2026-01-02.json'), JSON.stringify({
    g2: { jobId: 'nojob02', name: 'new', launchedAt: '2026-01-02T00:00:00.000Z' },
  }));
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    const res = await fetch(`${server.baseUrl}/api/sessions/all`);
    assert.equal(res.status, 200);
    const { sessions } = await res.json();
    assert.deepEqual(sessions.map((s) => [s.file, s.groupId, s.name, s.state]), [
      ['todo-2026-01-02.md', 'g2', 'new', 'unknown'],
      ['todo-2026-01-01.md', 'g1', 'old', 'unknown'],
    ]);
  } finally {
    await server.stop();
  }
});

// AC-RL-SRV-1
test('rate-limitsはファイルがあればその内容、無ければnullを返す', async () => {
  const fixture = setupFixture();
  const rlPath = path.join(fixture.root, 'rate-limits.json');
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir, VIEWER_RATE_LIMITS_PATH: rlPath,
  });
  try {
    assert.deepEqual(await (await fetch(`${server.baseUrl}/api/rate-limits`)).json(), { rateLimits: null });
    const snapshot = {
      fiveHour: { usedPercentage: 12, resetsAt: 1790000000 }, sevenDay: null, capturedAt: '2026-09-29T00:00:00.000Z',
    };
    fs.writeFileSync(rlPath, JSON.stringify(snapshot));
    assert.deepEqual(await (await fetch(`${server.baseUrl}/api/rate-limits`)).json(), { rateLimits: snapshot });
  } finally {
    await server.stop();
  }
});
