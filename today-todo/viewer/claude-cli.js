'use strict';

// Claude Code CLI の内部仕様（state.json の項目、`claude --bg` の出力、~/.claude.json）に頼る処理をここに集める。
// CLI の版が変わって状態表示や返信がずれたら、まずこのファイルを見る。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const CLAUDE_JOBS_DIR = process.env.VIEWER_CLAUDE_JOBS_DIR
  ? path.resolve(process.env.VIEWER_CLAUDE_JOBS_DIR)
  : path.join(os.homedir(), '.claude', 'jobs');
const LAUNCH_TIMEOUT_MS = process.env.VIEWER_LAUNCH_TIMEOUT_MS ? Number(process.env.VIEWER_LAUNCH_TIMEOUT_MS) : 20000;
const CLAUDE_CONFIG_PATH = process.env.VIEWER_CLAUDE_CONFIG
  ? path.resolve(process.env.VIEWER_CLAUDE_CONFIG)
  : path.join(os.homedir(), '.claude.json');

// state.json の項目や `backgrounded · <id>` の出力など、CLI の内部仕様に頼る処理はこの版で実機確認している。
const TESTED_CLAUDE_CLI_VERSION = '2.1.332';

const BUSY_JOB_STATES = new Set(['working', 'running', 'starting', 'resuming', 'crashed']);

// AskUserQuestionの回答待ちはCLI 2.1.291で`state:"working"`のまま`tempo:"blocked"`になるため、`state`だけでは判定できない。
// `running`＋`tempo:"idle"`はターン途中のバックグラウンドコマンド待ちでも出るので入力待ちとはみなさない（実機で確認）。
function normalizeJobState(raw) {
  if (raw.tempo === 'blocked' || raw.needs) return 'blocked';
  if (BUSY_JOB_STATES.has(raw.state)) return 'working';
  if (raw.state === 'failed' || raw.state === 'error') return 'failed';
  if (raw.state === 'stopped') return 'done';
  return raw.state;
}

function readJobState(jobId) {
  let jobState;
  try {
    jobState = JSON.parse(fs.readFileSync(path.join(CLAUDE_JOBS_DIR, jobId, 'state.json'), 'utf-8'));
  } catch {
    return null;
  }
  return { ...jobState, state: normalizeJobState(jobState) };
}

// ~/.claude.jsonはClaude Code CLI本体も書き換えるため、読んだ直後に書いて競合の窓を狭め、
// 一時ファイル→renameで途中書きの壊れたJSONを残さない。
function markWorkspaceTrusted(cwd) {
  const config = fs.existsSync(CLAUDE_CONFIG_PATH) ? JSON.parse(fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf-8')) : {};
  config.projects = config.projects || {};
  config.projects[cwd] = { ...config.projects[cwd], hasTrustDialogAccepted: true };
  const tmpPath = `${CLAUDE_CONFIG_PATH}.viewer-${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2));
  fs.renameSync(tmpPath, CLAUDE_CONFIG_PATH);
}

// `claude --bg` の標準出力（`backgrounded · <id> · <name>`、ANSIカラーコード付き）から短縮IDを取り出す。
function parseBackgroundedId(output) {
  const stripped = output.replace(/\x1b\[[0-9;]*m/g, '');
  // コピーを起動したときは名前が付かず`backgrounded · <id>`で行が終わる。
  const m = stripped.match(/backgrounded\s*·\s*([0-9a-f]+)\b/);
  return m ? m[1] : null;
}

// timeoutで子プロセスを殺しても、daemon側ではジョブが既に作られていることがあるため、同じ名前で受付以降に始まったジョブを探す。
async function findLaunchedJob(cwd, name, startedAt) {
  try {
    const { stdout } = await execFileAsync('claude', ['agents', '--json', '--cwd', cwd], { timeout: LAUNCH_TIMEOUT_MS });
    const found = JSON.parse(stdout)
      .filter((a) => a.kind === 'background' && a.name === name && Number(a.startedAt) >= startedAt - 1000)
      .sort((a, b) => b.startedAt - a.startedAt)[0];
    return found ? found.id : null;
  } catch {
    return null;
  }
}

async function launchBackground(args, cwd, name) {
  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync('claude', args, { cwd, timeout: LAUNCH_TIMEOUT_MS });
    return { jobId: parseBackgroundedId(stdout), output: `${stdout}\n${stderr}`, recovered: false };
  } catch (err) {
    if (!err.killed) throw err;
    const jobId = await findLaunchedJob(cwd, name, startedAt);
    if (!jobId) throw err;
    return { jobId, output: '', recovered: true };
  }
}

async function runClaudeQuietly(args) {
  try {
    await execFileAsync('claude', args, { timeout: LAUNCH_TIMEOUT_MS });
  } catch (err) {
    // 停止済み・削除済み等の競合は無視するが、rm 失敗でジョブが残る原因を追えるよう記録する。
    console.error(`[claude ${args.join(' ')}] failed: ${err.stderr || err.message}`);
  }
}

// stopを挟むとCLIは答えていないAskUserQuestionを中断扱いにし、素の返信を質問への回答と結び付けないため、質問を添えて送る。
// 回答待ちのAskUserQuestionはCLIが回答されるまでtranscriptに書かず、state.jsonの`block`にだけ置く（CLI 2.1.291、実機で確認）。
function pendingQuestionsOf(jobState) {
  const questions = jobState && jobState.block && jobState.block.questions;
  return Array.isArray(questions) && questions.length > 0 ? questions : null;
}

let detectedVersion = null;

function detectCliVersion() {
  execFileAsync('claude', ['--version'], { timeout: LAUNCH_TIMEOUT_MS })
    .then(({ stdout }) => { detectedVersion = (String(stdout).match(/\d+\.\d+\.\d+/) || [null])[0]; })
    .catch(() => {});
}

const cliVersion = () => detectedVersion;

module.exports = {
  CLAUDE_JOBS_DIR,
  TESTED_CLAUDE_CLI_VERSION,
  readJobState,
  markWorkspaceTrusted,
  launchBackground,
  runClaudeQuietly,
  pendingQuestionsOf,
  detectCliVersion,
  cliVersion,
};
