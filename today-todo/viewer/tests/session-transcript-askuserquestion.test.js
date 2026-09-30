'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { setupFixture, startViewerServer } = require('./helpers');

// server.jsのCLAUDE_JOBS_DIRは`~/.claude/jobs`に固定で環境変数による差し替えができないため、
// このテストは実ホームディレクトリ配下にランダムなhex名のジョブディレクトリを一時的に作り、
// 完了後に必ず削除する（他のジョブと衝突しないよう十分な長さのランダムIDを使う）。
function makeTestJobDir() {
  const jobId = crypto.randomBytes(16).toString('hex');
  const jobDir = path.join(os.homedir(), '.claude', 'jobs', jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  return { jobId, jobDir };
}

// AC-CC3-1（切り詰め上限の維持・input復元）
test('AskUserQuestionのtool_use inputは1000文字を超えてもJSONとして復元できる', async () => {
  const fixture = setupFixture();
  const { jobId, jobDir } = makeTestJobDir();
  const server = await startViewerServer({
    VIEWER_TODO_DIR: fixture.todoDir,
    VIEWER_DATA_DIR: fixture.dataDir,
  });
  try {
    const options = Array.from({ length: 6 }, (_, i) => ({
      label: `選択肢${i}`.repeat(5),
      description: 'テスト用の長めの説明文です。'.repeat(10),
    }));
    const askInput = { questions: [{ question: 'テスト質問', header: 'テスト', options, multiSelect: false }] };
    assert.ok(JSON.stringify(askInput).length > 1000, '検証対象がそもそも1000文字を超えていること');
    const transcriptPath = path.join(jobDir, 'transcript.jsonl');
    fs.writeFileSync(transcriptPath, `${JSON.stringify({
      type: 'assistant',
      timestamp: new Date().toISOString(),
      message: { content: [{ type: 'tool_use', name: 'AskUserQuestion', input: askInput }] },
    })}\n`);
    fs.writeFileSync(path.join(jobDir, 'state.json'), JSON.stringify({
      state: 'blocked',
      linkScanPath: transcriptPath,
    }));

    const res = await fetch(`${server.baseUrl}/api/session/transcript?jobId=${jobId}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    const entry = body.entries.find((e) => e.kind === 'tool_use' && e.name === 'AskUserQuestion');
    assert.ok(entry, 'AskUserQuestionのエントリが見つかること');
    const parsed = JSON.parse(entry.input);
    assert.equal(parsed.questions[0].options.length, 6);
    assert.equal(parsed.questions[0].options[5].label, askInput.questions[0].options[5].label);
  } finally {
    await server.stop();
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
});
