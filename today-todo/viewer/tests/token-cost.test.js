'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { setupFixture, startViewerServer, TEST_JOBS_DIR } = require('./helpers');

const M = 1_000_000;

function usageLine({ id, model, timestamp, usage }) {
  return JSON.stringify({ type: 'assistant', timestamp, message: { id, model, usage } });
}

function writeJsonl(filePath, lines) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, [...lines, 'not json', ''].join('\n'));
}

function assertUsd(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `usd ${actual} !== ${expected}`);
}

const opusInput = usageLine({
  id: 'm1', model: 'claude-opus-5-5', timestamp: '2026-08-15T03:00:00.000Z',
  usage: { input_tokens: M, output_tokens: M },
});

// AC-CO-SRV-1〜3
test('月間コストは単価・キャッシュ倍率・fast・重複排除・単価不明を反映して月ごとに返る', async () => {
  const fixture = setupFixture();
  const projectsDir = path.join(fixture.root, 'claude-projects');
  writeJsonl(path.join(projectsDir, 'p1', 's1.jsonl'), [
    opusInput,
    usageLine({
      id: 'm2', model: 'claude-haiku-4-5-20251001', timestamp: '2026-08-20T03:00:00.000Z',
      usage: {
        input_tokens: 0, output_tokens: 0, cache_read_input_tokens: M, cache_creation_input_tokens: 2 * M,
        cache_creation: { ephemeral_5m_input_tokens: M, ephemeral_1h_input_tokens: M },
      },
    }),
    usageLine({ id: 's', model: '<synthetic>', timestamp: '2026-09-01T03:00:00.000Z', usage: { input_tokens: M, output_tokens: 0 } }),
  ]);
  writeJsonl(path.join(projectsDir, 'p2', 's2.jsonl'), [
    opusInput,
    usageLine({
      id: 'm3', model: 'claude-opus-5-5', timestamp: '2026-09-01T03:00:00.000Z',
      usage: { input_tokens: 0, output_tokens: M, speed: 'fast' },
    }),
    usageLine({ id: 'm4', model: 'unknown-model', timestamp: '2026-09-02T03:00:00.000Z', usage: { input_tokens: 500, output_tokens: 0 } }),
  ]);
  writeJsonl(path.join(projectsDir, 'p2', 's2', 'subagents', 'agent-a.jsonl'), [
    usageLine({
      id: 'm5', model: 'claude-sonnet-5', timestamp: '2026-09-03T03:00:00.000Z',
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: M },
    }),
  ]);
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir, VIEWER_CLAUDE_PROJECTS_DIR: projectsDir,
  });
  try {
    const res = await fetch(`${server.baseUrl}/api/costs/monthly`);
    assert.equal(res.status, 200);
    const { months } = await res.json();
    assert.deepEqual(months.map((m) => m.month), ['2026-09', '2026-08']);
    const [sep, aug] = months;
    assertUsd(aug.usd, 24 + 3.35);
    assert.equal(aug.tokens, 5 * M);
    assert.equal(aug.unpricedTokens, 0);
    assertUsd(sep.usd, 40 + 2.5);
    assert.equal(sep.tokens, 2 * M + 500);
    assert.equal(sep.unpricedTokens, 500);
    assertUsd(sep.byModel.find((m) => m.model === 'claude-opus-5-5').usd, 40);
  } finally {
    await server.stop();
  }
});

// AC-CO-SRV-1
test('claude-haiku-5-5 は単価表で換算され、単価不明に数えない', async () => {
  const fixture = setupFixture();
  const projectsDir = path.join(fixture.root, 'claude-projects');
  writeJsonl(path.join(projectsDir, 'p1', 's1.jsonl'), [
    usageLine({
      id: 'h1', model: 'claude-haiku-5-5', timestamp: '2026-10-20T03:00:00.000Z',
      usage: { input_tokens: M, output_tokens: M, cache_read_input_tokens: M },
    }),
  ]);
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir, VIEWER_CLAUDE_PROJECTS_DIR: projectsDir,
  });
  try {
    const { months: [oct] } = await (await fetch(`${server.baseUrl}/api/costs/monthly`)).json();
    assertUsd(oct.usd, 0.1 + 0.5 + 0.01);
    assert.equal(oct.unpricedTokens, 0);
  } finally {
    await server.stop();
  }
});

// AC-CO-SRV-4・AC-CO-SRV-5
test('カード別コストは紐付くジョブのtranscriptとsubagentsを合算し、不正ファイル名は400', async () => {
  const fixture = setupFixture();
  const projectsDir = path.join(fixture.root, 'claude-projects');
  const transcript = path.join(projectsDir, 'p1', 'sess.jsonl');
  writeJsonl(transcript, [opusInput]);
  writeJsonl(path.join(projectsDir, 'p1', 'sess', 'subagents', 'agent-a.jsonl'), [
    usageLine({ id: 'm6', model: 'claude-sonnet-5', timestamp: '2026-09-01T03:00:00.000Z', usage: { input_tokens: 0, output_tokens: M } }),
  ]);
  const jobId = crypto.randomBytes(12).toString('hex');
  const jobDir = path.join(TEST_JOBS_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(path.join(jobDir, 'state.json'), JSON.stringify({ state: 'done', linkScanPath: transcript }));
  fs.writeFileSync(path.join(fixture.dataDir, 'sessions-todo-2026-01-01.json'), JSON.stringify({
    'group-a': { jobId, name: 'x' },
    'group-missing': { jobId: 'no-such-job-000000', name: 'y' },
  }));
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir, VIEWER_CLAUDE_PROJECTS_DIR: projectsDir,
  });
  try {
    const res = await fetch(`${server.baseUrl}/api/costs/cards?file=todo-2026-01-01.md`);
    assert.equal(res.status, 200);
    const { cards } = await res.json();
    assert.deepEqual(Object.keys(cards), ['group-a']);
    assertUsd(cards['group-a'].usd, 24 + 10);
    assert.equal(cards['group-a'].tokens, 3 * M);
    assert.equal((await fetch(`${server.baseUrl}/api/costs/cards?file=../x.md`)).status, 400);

    // AC-CO-SRV-5: ジョブ削除後も控えたtranscriptPathから集計できる
    fs.rmSync(jobDir, { recursive: true, force: true });
    const after = await (await fetch(`${server.baseUrl}/api/costs/cards?file=todo-2026-01-01.md`)).json();
    assertUsd(after.cards['group-a'].usd, 24 + 10);
  } finally {
    await server.stop();
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
});

// AC-CO-SRV-6
test('完了カードのコスト一覧は全todoファイルの完了カードだけを新しいファイル順・高い順で返す', async () => {
  const fixture = setupFixture();
  const projectsDir = path.join(fixture.root, 'claude-projects');
  fs.writeFileSync(path.join(fixture.todoDir, 'todo-2026-01-02.md'), [
    '# 2026-01-02', '', '## demo-project', '', '### 安いカード', '- [x] a', '', '### 高いカード', '- [x] b', '- [x] c', '',
    '### 未完了カード', '- [x] d', '- [ ] e', '',
  ].join('\n'));
  fs.writeFileSync(path.join(fixture.todoDir, 'todo-2026-01-01.md'), [
    '# 2026-01-01', '', '## demo-project', '', '### 古いカード', '- [x] f', '',
  ].join('\n'));
  const writeCardTranscript = (name, outputTokens) => {
    const transcriptPath = path.join(projectsDir, 'p1', `${name}.jsonl`);
    writeJsonl(transcriptPath, [usageLine({
      id: `id-${name}`, model: 'claude-opus-5-5', timestamp: '2026-09-01T03:00:00.000Z', usage: { input_tokens: 0, output_tokens: outputTokens },
    })]);
    return { jobId: `gone-${name}`, transcriptPath };
  };
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir, VIEWER_CLAUDE_PROJECTS_DIR: projectsDir,
  });
  try {
    const board = await (await fetch(`${server.baseUrl}/api/board?file=todo-2026-01-02.md`)).json();
    const idByTitle = Object.fromEntries(board.columns[0].groups.map((g) => [g.title, g.id]));
    const oldBoard = await (await fetch(`${server.baseUrl}/api/board?file=todo-2026-01-01.md`)).json();
    fs.writeFileSync(path.join(fixture.dataDir, 'sessions-todo-2026-01-02.json'), JSON.stringify({
      [idByTitle['安いカード']]: writeCardTranscript('cheap', M),
      [idByTitle['高いカード']]: writeCardTranscript('expensive', 2 * M),
      [idByTitle['未完了カード']]: writeCardTranscript('open', 3 * M),
    }));
    fs.writeFileSync(path.join(fixture.dataDir, 'sessions-todo-2026-01-01.json'), JSON.stringify({
      [oldBoard.columns[0].groups[0].id]: writeCardTranscript('old', M),
    }));
    const res = await fetch(`${server.baseUrl}/api/costs/done-cards`);
    assert.equal(res.status, 200);
    const { cards } = await res.json();
    assert.deepEqual(cards.map((c) => [c.file, c.column, c.title]), [
      ['todo-2026-01-02.md', 'demo-project', '高いカード'],
      ['todo-2026-01-02.md', 'demo-project', '安いカード'],
      ['todo-2026-01-01.md', 'demo-project', '古いカード'],
    ]);
    assertUsd(cards[0].usd, 40);
    assert.equal(cards[0].groupId, idByTitle['高いカード']);
    assert.equal(cards[0].tokens, 2 * M);
  } finally {
    await server.stop();
  }
});

// AC-CO-1
test('/costs はコストダッシュボードのHTMLを返す', async () => {
  const fixture = setupFixture();
  const server = await startViewerServer({ VIEWER_TODO_DIR: fixture.todoDir, VIEWER_DATA_DIR: fixture.dataDir });
  try {
    const res = await fetch(`${server.baseUrl}/costs`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();
    assert.match(html, /<title>コストダッシュボード<\/title>/);
    assert.match(html, /<a href="\/"[^>]*>← ボードに戻る<\/a>/);
    const board = await (await fetch(`${server.baseUrl}/`)).text();
    assert.match(board, /location\.href = '\/costs'/);
    assert.doesNotMatch(board, /window\.open\('\/costs'/);
  } finally {
    await server.stop();
  }
});
