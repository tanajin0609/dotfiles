'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer } = require('./helpers');

function writeUntrustedClaude(binDir, cwdForMessage) {
  fs.mkdirSync(binDir, { recursive: true });
  const scriptPath = path.join(binDir, 'claude');
  fs.writeFileSync(scriptPath, `#!/bin/sh
echo "Workspace not trusted. Run \\\`claude\\\` in ${cwdForMessage} once and accept the trust prompt, then retry." >&2
exit 1
`);
  fs.chmodSync(scriptPath, 0o755);
}

async function postJson(baseUrl, url, body) {
  const res = await fetch(`${baseUrl}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function startWithFixture() {
  const fixture = setupFixture();
  const binDir = path.join(fixture.root, 'bin');
  writeUntrustedClaude(binDir, fixture.projectDir);
  const configPath = path.join(fixture.root, 'claude.json');
  fs.writeFileSync(configPath, JSON.stringify({ numStartups: 3, projects: { '/other': { hasTrustDialogAccepted: false, foo: 1 } } }));
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
    VIEWER_CLAUDE_CONFIG: configPath,
    PATH: `${binDir}:${process.env.PATH}`,
  });
  return { fixture, configPath, server };
}

test('AC-WT-SRV-1: 未信頼で起動失敗したら403とcwdを返す', async () => {
  const { fixture, server } = await startWithFixture();
  try {
    const res = await postJson(server.baseUrl, '/api/session/launch', {
      file: fixture.todoFile, groupId: 'g', columnName: 'demo-project', groupTitle: 'demo-project', text: 'x',
    });
    assert.equal(res.status, 403);
    assert.deepEqual(res.data, { error: 'workspace not trusted', cwd: fixture.projectDir });
  } finally {
    await server.stop();
  }
});

test('AC-WT-SRV-2: 信頼フラグを立て、他のキーは保持する', async () => {
  const { fixture, configPath, server } = await startWithFixture();
  try {
    const res = await postJson(server.baseUrl, '/api/workspace/trust', { cwd: fixture.projectDir });
    assert.equal(res.status, 200);
    assert.deepEqual(res.data, { trusted: true });
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.equal(config.numStartups, 3);
    assert.deepEqual(config.projects['/other'], { hasTrustDialogAccepted: false, foo: 1 });
    assert.equal(config.projects[fixture.projectDir].hasTrustDialogAccepted, true);
  } finally {
    await server.stop();
  }
});

test('AC-WT-SRV-2: PROJECTS_ROOT外・実在しないパスは400で設定を変更しない', async () => {
  const { fixture, configPath, server } = await startWithFixture();
  const before = fs.readFileSync(configPath, 'utf-8');
  try {
    for (const cwd of ['/tmp', path.join(fixture.root, 'missing'), path.join(fixture.projectDir, '..', '..'), 123]) {
      const res = await postJson(server.baseUrl, '/api/workspace/trust', { cwd });
      assert.equal(res.status, 400, String(cwd));
    }
    assert.equal(fs.readFileSync(configPath, 'utf-8'), before);
  } finally {
    await server.stop();
  }
});
