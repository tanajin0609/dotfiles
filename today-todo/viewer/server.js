const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const PORT = process.env.VIEWER_PORT ? Number(process.env.VIEWER_PORT) : 3131;
const TODO_DIR = process.env.VIEWER_TODO_DIR
  ? path.resolve(process.env.VIEWER_TODO_DIR)
  : path.resolve(__dirname, '..');
const PROJECTS_ROOT = path.resolve(TODO_DIR, '..');
const PUBLIC_DIR = __dirname;
const DATA_DIR = process.env.VIEWER_DATA_DIR
  ? path.resolve(process.env.VIEWER_DATA_DIR)
  : path.join(__dirname, 'data');
const CLAUDE_JOBS_DIR = process.env.VIEWER_CLAUDE_JOBS_DIR
  ? path.resolve(process.env.VIEWER_CLAUDE_JOBS_DIR)
  : path.join(os.homedir(), '.claude', 'jobs');
// stop が返った直後の resume は約22%でコピーになり、3秒以上待てば0件だった（claude-integration-audit.md §5 U6）。
const STOP_SETTLE_MS = process.env.VIEWER_STOP_SETTLE_MS ? Number(process.env.VIEWER_STOP_SETTLE_MS) : 3000;
const LAUNCH_TIMEOUT_MS = process.env.VIEWER_LAUNCH_TIMEOUT_MS ? Number(process.env.VIEWER_LAUNCH_TIMEOUT_MS) : 20000;
const CLAUDE_SETTINGS_PATH = process.env.VIEWER_CLAUDE_SETTINGS
  ? path.resolve(process.env.VIEWER_CLAUDE_SETTINGS)
  : path.join(os.homedir(), '.claude', 'settings.json');
const RATE_LIMITS_PATH = process.env.VIEWER_RATE_LIMITS_PATH
  ? path.resolve(process.env.VIEWER_RATE_LIMITS_PATH)
  : path.join(os.homedir(), '.cache', 'claude-statusline', 'rate-limits.json');
const LAUNCH_SETTINGS_PATH = path.join(DATA_DIR, 'launch-settings.json');
const CLAUDE_CONFIG_PATH = process.env.VIEWER_CLAUDE_CONFIG
  ? path.resolve(process.env.VIEWER_CLAUDE_CONFIG)
  : path.join(os.homedir(), '.claude.json');
// 先頭を英数字に限定し、`--xxx`のような値がclaudeのオプションとして解釈されるのを防ぐ。
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\[\]-]{0,63}$/;
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

const CLAUDE_PROJECTS_DIR = process.env.VIEWER_CLAUDE_PROJECTS_DIR
  ? path.resolve(process.env.VIEWER_CLAUDE_PROJECTS_DIR)
  : path.join(os.homedir(), '.claude', 'projects');
// USD/MTok（Anthropic API公開単価、2026-09時点）。前方一致で引くため、長い接頭辞を先に置く。
const MODEL_PRICES = [
  ['claude-fable-5-1', { input: 10, output: 50, cacheRead: 0.25 }],
  ['claude-mythos-5-1', { input: 10, output: 50, cacheRead: 0.25 }],
  ['claude-fable-5', { input: 10, output: 50, cacheRead: 1 }],
  ['claude-mythos-5', { input: 10, output: 50, cacheRead: 1 }],
  ['claude-opus-5-5', { input: 4, output: 20, cacheRead: 0.2 }],
  ['claude-opus-5', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-sonnet-5-5', { input: 2, output: 10, cacheRead: 0.2 }],
  ['claude-sonnet-5', { input: 2, output: 10, cacheRead: 0.2 }],
  ['claude-sonnet-4-6', { input: 3, output: 15, cacheRead: 0.3 }],
  ['claude-haiku-4-5', { input: 1, output: 5, cacheRead: 0.1 }],
];

function findModelPrice(model) {
  const hit = MODEL_PRICES.find(([prefix]) => model.startsWith(prefix));
  return hit ? hit[1] : null;
}

function countUsageTokens(usage) {
  return (usage.input_tokens || 0) + (usage.output_tokens || 0) +
    (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
}

function computeUsageCostUsd(usage, price) {
  const breakdown = usage.cache_creation;
  const write5m = breakdown ? breakdown.ephemeral_5m_input_tokens || 0 : usage.cache_creation_input_tokens || 0;
  const write1h = breakdown ? breakdown.ephemeral_1h_input_tokens || 0 : 0;
  const perMTok = (usage.input_tokens || 0) * price.input + (usage.output_tokens || 0) * price.output +
    (usage.cache_read_input_tokens || 0) * price.cacheRead + write5m * price.input * 1.25 + write1h * price.input * 2;
  return (perMTok / 1_000_000) * (usage.speed === 'fast' ? 2 : 1);
}

function formatLocalMonth(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// transcriptは数百MBになりうるため、mtimeとsizeが変わらない限り解析結果を使い回す。
const transcriptCostCache = new Map();

function readTranscriptCostEntries(filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return [];
  }
  const cached = transcriptCostCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.entries;
  const entries = [];
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    if (!line.includes('"usage"')) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const message = record.message;
    if (!message || !message.usage || !message.id || !message.model || message.model === '<synthetic>') continue;
    const price = findModelPrice(message.model);
    entries.push({
      id: message.id,
      month: formatLocalMonth(record.timestamp),
      model: message.model,
      tokens: countUsageTokens(message.usage),
      usd: price ? computeUsageCostUsd(message.usage, price) : null,
    });
  }
  transcriptCostCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, entries });
  return entries;
}

function listJsonlFilesRecursively(dir) {
  let dirents;
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return dirents.flatMap((d) => {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) return listJsonlFilesRecursively(full);
    return d.name.endsWith('.jsonl') ? [full] : [];
  });
}

// 同じmessage.idは1応答につき複数行書かれ、resume等でファイルをまたいで複製されることもあるため、全体で1回だけ数える。
function collectUniqueCostEntries(files) {
  const seen = new Set();
  const unique = [];
  for (const file of files) {
    for (const entry of readTranscriptCostEntries(file)) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      unique.push(entry);
    }
  }
  return unique;
}

function summarizeCostEntries(entries) {
  let usd = 0;
  let tokens = 0;
  let unpricedTokens = 0;
  for (const entry of entries) {
    tokens += entry.tokens;
    if (entry.usd === null) unpricedTokens += entry.tokens;
    else usd += entry.usd;
  }
  return { usd, tokens, unpricedTokens };
}

function buildMonthlyCosts() {
  const byMonth = new Map();
  for (const entry of collectUniqueCostEntries(listJsonlFilesRecursively(CLAUDE_PROJECTS_DIR))) {
    if (!byMonth.has(entry.month)) byMonth.set(entry.month, []);
    byMonth.get(entry.month).push(entry);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([month, entries]) => {
      const byModel = new Map();
      for (const entry of entries) {
        if (!byModel.has(entry.model)) byModel.set(entry.model, []);
        byModel.get(entry.model).push(entry);
      }
      return {
        month,
        ...summarizeCostEntries(entries),
        byModel: [...byModel.entries()]
          .map(([model, list]) => {
            const { usd, tokens } = summarizeCostEntries(list);
            return { model, usd, tokens };
          })
          .sort((a, b) => b.usd - a.usd),
      };
    });
}

function listTranscriptWithSubagents(transcriptPath) {
  const subagentsDir = path.join(transcriptPath.replace(/\.jsonl$/, ''), 'subagents');
  return [transcriptPath, ...listJsonlFilesRecursively(subagentsDir)];
}

// ジョブは`claude rm`や自動掃除で消えるがtranscriptは残るため、読めた時点のパスをsessionsへ控えておき、消えた後も集計できるようにする。
function rememberTranscriptPaths(file, sessionsMap) {
  let changed = false;
  for (const session of Object.values(sessionsMap)) {
    if (!session || !session.jobId) continue;
    const jobState = readJobState(session.jobId);
    const livePath = jobState && jobState.linkScanPath;
    if (livePath && livePath !== session.transcriptPath) {
      session.transcriptPath = livePath;
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(sessionsFilePath(file), JSON.stringify(sessionsMap));
}

function buildCardCosts(file) {
  const sessionsMap = readSessionsMap(file);
  rememberTranscriptPaths(file, sessionsMap);
  const cards = {};
  for (const [groupId, session] of Object.entries(sessionsMap)) {
    const transcriptPath = session && session.transcriptPath;
    if (!transcriptPath || !fs.existsSync(transcriptPath)) continue;
    cards[groupId] = summarizeCostEntries(collectUniqueCostEntries(listTranscriptWithSubagents(transcriptPath)));
  }
  return cards;
}

function readGlobalClaudeSettings() {
  try {
    const { model, effortLevel, modelSettings } = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    return { model: model ?? null, effortLevel: effortLevel ?? null, modelSettings: modelSettings ?? null };
  } catch {
    return null;
  }
}

function sendLaunchFailure(res, err, cwd) {
  const stderr = String(err.stderr || '');
  if (stderr.includes('Workspace not trusted')) {
    return sendJson(res, 403, { error: 'workspace not trusted', cwd });
  }
  return sendJson(res, 500, { error: 'launch failed', detail: String(err.stderr || err.message || err) });
}

function isTrustableCwd(cwd) {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) return false;
  let real;
  try {
    real = fs.realpathSync(cwd);
  } catch {
    return false;
  }
  const root = fs.realpathSync(PROJECTS_ROOT);
  return (real === root || real.startsWith(root + path.sep)) && fs.statSync(real).isDirectory();
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

function readLaunchSettings() {
  try {
    const { model, effort } = JSON.parse(fs.readFileSync(LAUNCH_SETTINGS_PATH, 'utf-8'));
    return { model: model || '', effort: effort || '' };
  } catch {
    return { model: '', effort: '' };
  }
}

function buildLaunchSettingArgs() {
  const { model, effort } = readLaunchSettings();
  return [...(model ? ['--model', model] : []), ...(effort ? ['--effort', effort] : [])];
}

// `file`と`groupId`の組ごとの起動処理中ロック。
const activeLaunchKeys = new Set();

function buildLaunchLockKey(file, groupId) {
  return `${file}::${groupId}`;
}

function listTodoFiles() {
  return fs.readdirSync(TODO_DIR)
    .filter((name) => /^todo-\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .sort()
    .reverse();
}

function isValidTodoFile(file) {
  return /^todo-\d{4}-\d{2}-\d{2}\.md$/.test(file);
}

function orderFilePath(file) {
  return path.join(DATA_DIR, `order-${file.replace(/\.md$/, '')}.json`);
}

function commentsFilePath(file) {
  return path.join(DATA_DIR, `comments-${file.replace(/\.md$/, '')}.json`);
}

function sessionsFilePath(file) {
  return path.join(DATA_DIR, `sessions-${file.replace(/\.md$/, '')}.json`);
}

function globalCommentsFilePath(file) {
  return path.join(DATA_DIR, `global-comments-${file.replace(/\.md$/, '')}.json`);
}

function readGlobalComments(file) {
  const p = globalCommentsFilePath(file);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return [];
  }
}

// 日付から対象ファイルを解決する: カレントの todo-<date>.md → archives/<YYYYMMDD>/todo-<date>.md の順に探す。
function resolveFileForDate(dateStr) {
  const rootPath = path.join(TODO_DIR, `todo-${dateStr}.md`);
  if (fs.existsSync(rootPath)) return rootPath;
  const archivePath = path.join(TODO_DIR, 'archives', dateStr.replace(/-/g, ''), `todo-${dateStr}.md`);
  if (fs.existsSync(archivePath)) return archivePath;
  return null;
}

// dateStr を末尾とする直近14日分の完了グループ数を集計する（ファイルが無い日は 0/0）。
function buildHistory(dateStr, days = 14) {
  const end = new Date(`${dateStr}T00:00:00Z`);
  const history = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const filePath = resolveFileForDate(ds);
    let done = 0;
    let total = 0;
    if (filePath) {
      const board = parseBoard(fs.readFileSync(filePath, 'utf-8'));
      for (const column of board.columns) {
        for (const group of column.groups) {
          total++;
          if (group.done) done++;
        }
      }
    }
    history.push({ date: ds, done, total });
  }
  return history;
}

// 同一ファイル内でカード/グループIDを安定させるための簡易ハッシュ（djb2）
function hashId(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

// `→` より手前を実質的な内容とみなし、長ければ省略する（### 見出しが無いタスク用の簡易タイトル）
function shortTitle(text) {
  const cut = text.split('→')[0].trim();
  const base = cut.length > 0 ? cut : text;
  return base.length > 48 ? `${base.slice(0, 48)}…` : base;
}

// `## 列名` を列、`### 見出し` 配下のタスクを1グループ（=1カード）としてまとめる。
// `### 見出し` が無いタスクは、そのタスク自身を単独グループとして扱う。
function parseBoard(md) {
  const lines = md.split('\n');
  let title = '';
  const columns = [];
  let currentColumn = null;
  let groupsByTag = null;
  let currentTag = '';

  for (const line of lines) {
    const h1 = line.match(/^# (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    const task = line.match(/^\s*- \[([ x])\] (.+)/);

    if (h1) {
      title = h1[1];
    } else if (h2) {
      currentColumn = { name: h2[1], groups: [] };
      groupsByTag = new Map();
      currentTag = '';
      columns.push(currentColumn);
    } else if (h3) {
      currentTag = h3[1];
    } else if (task && currentColumn) {
      const done = task[1] === 'x';
      const rawText = task[2];
      const taskId = hashId(`${currentColumn.name}::${currentTag}::${rawText}`);

      // 行頭の `#<連番>` は todo.md 側での採番（採番ルールは todo-import skill 参照）。あれば拾って本文から外す。
      let text = rawText;
      let number = null;
      const numMatch = rawText.match(/^#(\d+)\s+(.+)/);
      if (numMatch) {
        number = parseInt(numMatch[1], 10);
        text = numMatch[2];
      }

      if (currentTag) {
        let group = groupsByTag.get(currentTag);
        if (!group) {
          group = {
            id: hashId(`${currentColumn.name}::group::${currentTag}`),
            title: currentTag,
            tasks: [],
          };
          groupsByTag.set(currentTag, group);
          currentColumn.groups.push(group);
        }
        group.tasks.push({ id: taskId, text, done, number });
      } else {
        currentColumn.groups.push({
          id: taskId,
          title: shortTitle(text),
          tasks: [{ id: taskId, text, done, number }],
        });
      }
    }
  }

  for (const column of columns) {
    for (const group of column.groups) {
      group.done = group.tasks.every((t) => t.done);
    }
  }

  return { title, columns };
}

// taskIdを`parseBoard`と同じ列/タグ走査で特定し、その行の`- [ ]`/`- [x]`をトグルする。
function toggleTaskLine(md, taskId) {
  const lines = md.split('\n');
  let currentColumnName = '';
  let currentTag = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    const task = line.match(/^(\s*- \[)([ x])(\] )(.+)$/);
    if (h2) {
      currentColumnName = h2[1];
      currentTag = '';
    } else if (h3) {
      currentTag = h3[1];
    } else if (task) {
      const rawText = task[4];
      if (hashId(`${currentColumnName}::${currentTag}::${rawText}`) === taskId) {
        const newMark = task[2] === 'x' ? ' ' : 'x';
        lines[i] = `${task[1]}${newMark}${task[3]}${rawText}`;
        return { md: lines.join('\n'), done: newMark === 'x', rawText };
      }
    }
  }
  return null;
}

// 集約ファイルのタスク行から、todo-importが埋め込んだ元`docs/tasks/todo.md`への絶対パスを抽出する。
function extractSourcePath(rawText) {
  const m = rawText.match(/ → (\/\S+\/docs\/tasks\/backlog\.md)(?:\s*<!--\s*notion:[^>]*-->)?\s*$/);
  return m ? m[1] : null;
}

// `#<連番> `プレフィックス・埋め込みパス・notionコメントを取り除き、元ファイルの行テキストと
// 比較可能な形にする（todo-importが元テキストをそのまま先頭に連結する仕様を前提にした前方一致用）。
function computeAggCore(rawText) {
  const withoutNumber = rawText.replace(/^#\d+\s+/, '');
  const withoutPath = withoutNumber.replace(/ → \/\S+\/docs\/tasks\/backlog\.md(?:\s*<!--\s*notion:[^>]*-->)?\s*$/, '');
  return withoutPath.replace(/\s*<!--\s*notion:[^>]*-->\s*$/, '').trim();
}

// 元ファイル内でaggCoreの前方一致になる行を探し、1件に絞れた場合のみ行番号を返す。
function findSourceLine(srcMd, aggCore) {
  const lines = srcMd.split('\n');
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    const task = lines[i].match(/^(\s*- \[)([ x])(\] )(.+)$/);
    if (!task) continue;
    const srcCore = task[4]
      .replace(/^#\d+\s+/, '')
      .replace(/\s*<!--\s*notion:[^>]*-->\s*$/, '')
      .trim();
    if (srcCore && aggCore.startsWith(srcCore)) candidates.push(i);
  }
  return candidates.length === 1 ? candidates[0] : null;
}

// todo-importが機械的に列挙した定型文のみのタスク本文（記載が薄いカードの判定に使う）。
const THIN_TASK_TEXTS = ['タスク細分化を行う'];

// タスク本文から、todo-importが埋め込んだ末尾の絶対パス・notionコメントを取り除く。
function stripEmbeddedSuffix(text) {
  return text
    .replace(/ → \/\S+\/docs\/tasks\/backlog\.md(?:\s*<!--\s*notion:[^>]*-->)?\s*$/, '')
    .replace(/\s*<!--\s*notion:[^>]*-->\s*$/, '')
    .trim();
}

// グループの全タスクが定型文のみで構成されている（＝カードの内容が薄い）かを判定する。
function isThinGroup(group) {
  return group.tasks.length > 0 &&
    group.tasks.every((t) => THIN_TASK_TEXTS.includes(stripEmbeddedSuffix(t.text)));
}

// 薄いカードのプロジェクト説明を探す先のディレクトリを解決する（`resolveLaunchCwd`とは別関数、
// セッション起動先の解決には影響させない）。列名配下に、カードタイトル（`▸`前半）と同名の
// ディレクトリ、または`名前（親ディレクトリ名）`表記を分解した`親/名前`を探す。
function resolveProjectHintDir(columnName, groupTitle) {
  const base = path.join(PROJECTS_ROOT, columnName);
  if (!fs.existsSync(base)) return null;
  const segment = (groupTitle || '').split('▸')[0].trim();
  if (!segment) return null;
  const candidates = [path.join(base, segment)];
  const paren = segment.match(/^(.+?)（(.+?)）$/);
  if (paren) candidates.push(path.join(base, paren[2].trim(), paren[1].trim()));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
  }
  return null;
}

const PROJECT_HINT_FILES = ['README.md', 'docs/specs/spec.md', 'SPEC.md', 'REQ.md'];

// プロジェクト説明ファイルを順に探し、先頭の見出し行を飛ばした最初の本文行を一言ヒントとして返す。
function readProjectHint(dir) {
  for (const rel of PROJECT_HINT_FILES) {
    const filePath = path.join(dir, rel);
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    let i = 0;
    while (i < lines.length && (lines[i].trim() === '' || lines[i].trim().startsWith('#'))) i++;
    if (i < lines.length && lines[i].trim()) return truncate(lines[i].trim(), 60);
  }
  return null;
}

// 薄いカードにのみ`projectHint`を付与する。見つからなければ何も付けない。
function attachProjectHints(board) {
  for (const column of board.columns) {
    for (const group of column.groups) {
      if (!isThinGroup(group)) continue;
      const dir = resolveProjectHintDir(column.name, group.title);
      const hint = dir ? readProjectHint(dir) : null;
      if (hint) group.projectHint = hint;
    }
  }
  return board;
}

function applySavedOrder(board, file) {
  const orderPath = orderFilePath(file);
  if (!fs.existsSync(orderPath)) return board;
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(orderPath, 'utf-8'));
  } catch {
    return board;
  }
  for (const column of board.columns) {
    const savedIds = saved[column.name];
    if (!Array.isArray(savedIds)) continue;
    const byId = new Map(column.groups.map((g) => [g.id, g]));
    const ordered = savedIds.map((id) => byId.get(id)).filter(Boolean);
    const remaining = column.groups.filter((g) => !savedIds.includes(g.id));
    column.groups = [...ordered, ...remaining];
  }
  return board;
}

function readCommentsMap(file) {
  const commentsPath = commentsFilePath(file);
  if (!fs.existsSync(commentsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(commentsPath, 'utf-8'));
  } catch {
    return {};
  }
}

function attachComments(board, file) {
  const commentsMap = readCommentsMap(file);
  for (const column of board.columns) {
    for (const group of column.groups) {
      group.comments = commentsMap[group.id] || [];
    }
  }
  return board;
}

function readSessionsMap(file) {
  const sessionsPath = sessionsFilePath(file);
  if (!fs.existsSync(sessionsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'));
  } catch {
    return {};
  }
}

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

const UUID_JSONL_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/;

function sessionIdFromTranscriptPath(transcriptPath) {
  const m = transcriptPath ? path.basename(transcriptPath).match(UUID_JSONL_PATTERN) : null;
  return m ? m[1] : null;
}

// ジョブが消えた後もログ・資料を見られるよう、sessionsに控えたtranscriptPathを探す。
function findRememberedTranscriptPath(jobId) {
  if (!fs.existsSync(DATA_DIR)) return null;
  for (const name of fs.readdirSync(DATA_DIR)) {
    const m = name.match(/^sessions-(todo-\d{4}-\d{2}-\d{2})\.json$/);
    if (!m) continue;
    for (const linked of Object.values(readSessionsMap(`${m[1]}.md`))) {
      if (linked && linked.jobId === jobId && linked.transcriptPath) return linked.transcriptPath;
    }
  }
  return null;
}

function resolveTranscriptPath(jobId) {
  const jobState = readJobState(jobId);
  const candidate = (jobState && jobState.linkScanPath) || findRememberedTranscriptPath(jobId);
  return candidate && fs.existsSync(candidate) ? candidate : null;
}

// CLIを待っている間に別カードの起動やポーリングが同じファイルへ書くため、待った後に読み直して該当カードだけを書き換える。
function updateSessionEntry(file, groupId, entry) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sessionsMap = readSessionsMap(file);
  sessionsMap[groupId] = entry;
  fs.writeFileSync(sessionsFilePath(file), JSON.stringify(sessionsMap));
}

// `claude rm`はworktreeも消すが、継続先のジョブが同じworktreeで作業を続けるため、worktreeに入ったジョブは消さない。
// システムプロンプトのツール一覧にも`"name":"EnterWorktree"`が出るため、assistantのtool_useだけを見る。
function transcriptUsedWorktree(transcriptPath) {
  let text;
  try {
    text = fs.readFileSync(transcriptPath, 'utf-8');
  } catch {
    return false;
  }
  return text.split('\n').some((line) => {
    if (!line.includes('EnterWorktree')) return false;
    try {
      const obj = JSON.parse(line);
      const content = obj.type === 'assistant' && obj.message && obj.message.content;
      return Array.isArray(content) && content.some((b) => b.type === 'tool_use' && b.name === 'EnterWorktree');
    } catch {
      return false;
    }
  });
}

function isSessionBusy(jobId) {
  const jobState = readJobState(jobId);
  return !!jobState && jobState.state === 'working';
}

// カードのコメント欄からセッションを起動する先のディレクトリを解決する。
// 列名＝サブプロジェクト名の規約（todo-import skill）を前提に、カードタイトルの
// `▸` 前半がサブプロジェクト配下の実在ディレクトリ名ならそちらを優先する。
function resolveLaunchCwd(columnName, groupTitle) {
  const base = path.join(PROJECTS_ROOT, columnName);
  if (!fs.existsSync(base)) return null;
  const segment = (groupTitle || '').split('▸')[0].trim();
  if (segment && segment !== columnName) {
    const nested = path.join(base, segment);
    if (fs.existsSync(nested)) return nested;
  }
  return base;
}

// backlog.md内の`#<N>`採番の最大値を返す（1件も無ければ0＝この対象ファイルは無番号運用とみなす）。
function findMaxTaskNumber(md) {
  let max = 0;
  for (const line of md.split('\n')) {
    const m = line.match(/^\s*- \[[ x]\] #(\d+)\b/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

// 集約ファイル内の`## columnName`→`### headingText`セクション末尾（次の見出しの手前）に
// タスク行を1行挿入する。該当セクションが見つからなければnullを返す（新設はしない）。
function insertTaskUnderHeading(md, columnName, headingText, newLine) {
  const lines = md.split('\n');
  let inColumn = false;
  let headingIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const h2 = lines[i].match(/^## (.+)/);
    const h3 = lines[i].match(/^### (.+)/);
    if (h2) inColumn = h2[1] === columnName;
    if (inColumn && h3 && h3[1] === headingText) {
      headingIndex = i;
      break;
    }
  }
  if (headingIndex === -1) return null;
  let insertAt = lines.length;
  for (let i = headingIndex + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i]) || /^### /.test(lines[i])) {
      insertAt = i;
      break;
    }
  }
  while (insertAt > headingIndex + 1 && lines[insertAt - 1].trim() === '') insertAt--;
  lines.splice(insertAt, 0, newLine);
  return lines.join('\n');
}

// 集約ファイル内の`## columnName`見出い直後にタスク行を1行挿入する（見出し無しの単発カードとして
// 解釈させるため、`###`より前に置く。parseBoardのcurrentTagは直近の`###`を次の`##`まで引き継ぐ）。
// 列自体が見つからなければ`## columnName`ごと末尾に新設する。
function insertStandaloneTaskAfterColumnHeading(md, columnName, newLine) {
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const h2 = lines[i].match(/^## (.+)/);
    if (h2 && h2[1] === columnName) {
      lines.splice(i + 1, 0, newLine);
      return lines.join('\n');
    }
  }
  const sep = md.endsWith('\n') ? '' : '\n';
  return `${md}${sep}\n## ${columnName}\n${newLine}\n`;
}

const SYNC_SKIP_DIRS = new Set(['node_modules', '.git', 'archives']);

// todo-import の `find -maxdepth 6 -path "*/docs/tasks/backlog.md"` と同じ範囲を列ディレクトリ配下で探す。
function findBacklogFiles(dir, depth = 0) {
  if (depth > 6) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || SYNC_SKIP_DIRS.has(entry.name)) continue;
    const child = path.join(dir, entry.name);
    const candidate = path.join(child, 'tasks', 'backlog.md');
    if (entry.name === 'docs' && fs.existsSync(candidate)) found.push(candidate);
    found.push(...findBacklogFiles(child, depth + 1));
  }
  return found.sort();
}

const STATUS_HEADING_RE = /^(進行中|未着手|保留|完了)/;
const NOTION_RE = /\s*<!--\s*notion:([^>\s]*)\s*-->/;

// todo-import Step1 と同じ規則で backlog.md の項目を取り出す（継続行は空白で連結して1行にする）。
function parseBacklogItems(md) {
  const items = [];
  let heading = '';
  let current = null;
  for (const line of md.split('\n')) {
    const h = line.match(/^#{2,3} (.+)/);
    const task = line.match(/^\s*- \[([ x])\] (.+)/);
    if (h || task || line.trim() === '' || /^# /.test(line)) current = null;
    if (h) {
      // 状態名（進行中・未着手等）だけのカード名では中身が分からないため、状態見出しは見出し文脈にしない。
      const text = h[1].trim();
      heading = STATUS_HEADING_RE.test(text) ? '' : text;
    } else if (task) {
      const numMatch = task[2].match(/^#(\d+)\s+(.+)/);
      const first = numMatch ? numMatch[2] : task[2];
      const notion = first.match(NOTION_RE);
      current = {
        done: task[1] === 'x',
        heading,
        number: numMatch ? parseInt(numMatch[1], 10) : null,
        first: first.replace(NOTION_RE, '').trim(),
        rest: [],
        notionId: notion ? notion[1] : null,
      };
      items.push(current);
    } else if (current) {
      current.rest.push(line.trim());
    }
  }
  return items;
}

// 集約行（`- [ ] #N 本文 → /abs/backlog.md <!-- notion:id -->`）を突合用に分解する。
function parseAggLine(line) {
  const task = line.match(/^- \[([ x])\] (.+)$/);
  if (!task) return null;
  const numMatch = task[2].match(/^#(\d+)\s+(.+)/);
  const body = numMatch ? numMatch[2] : task[2];
  const notion = body.match(NOTION_RE);
  const withoutNotion = body.replace(NOTION_RE, '');
  const source = withoutNotion.match(/ → (\S*docs\/tasks\/backlog\.md)\s*$/);
  const core = withoutNotion.replace(/ → \S*docs\/tasks\/backlog\.md\s*$/, '').trim();
  return {
    done: task[1] === 'x', number: numMatch ? parseInt(numMatch[1], 10) : null, core,
    notionId: notion ? notion[1] : null, source: source ? source[1] : null,
  };
}

// `## columnName` 節を backlog.md から作り直した md を返す（規則は spec 1.14）。
function syncColumnSection(md, columnName, columnDir) {
  const sources = findBacklogFiles(columnDir).map((p) => {
    const projectDir = path.dirname(path.dirname(path.dirname(p)));
    return { path: p, project: path.basename(projectDir), parent: path.basename(path.dirname(projectDir)) };
  });
  const nameCount = new Map();
  for (const s of sources) nameCount.set(s.project, (nameCount.get(s.project) || 0) + 1);

  const lines = md.split('\n');
  let start = lines.indexOf(`## ${columnName}`);
  let end;
  if (start === -1) {
    start = lines.length;
    end = lines.length;
  } else {
    end = lines.findIndex((l, i) => i > start && /^## /.test(l));
    if (end === -1) end = lines.length;
  }

  // 見出しの外の行はカード名 '' として扱う。
  const existing = [];
  let card = '';
  for (const line of lines.slice(start + 1, end)) {
    const h3 = line.match(/^### (.+)/);
    if (h3) { card = h3[1]; continue; }
    if (line.trim() === '') continue;
    existing.push({ card, line, agg: parseAggLine(line), state: null });
  }
  const maxNumber = new Map();
  for (const e of existing) {
    if (!e.agg || e.agg.number == null) continue;
    const p = e.card.split(' ▸ ')[0];
    maxNumber.set(p, Math.max(maxNumber.get(p) || 0, e.agg.number));
  }

  // 見出し無しの行は `###` より前に置かないと直前のカードに吸収されるため、'' を先頭に確保する。
  const out = new Map([['', []]]);
  const push = (cardTitle, line) => {
    if (!out.has(cardTitle)) out.set(cardTitle, []);
    out.get(cardTitle).push(line);
  };
  let openCount = 0;
  for (const src of sources) {
    const project = nameCount.get(src.project) > 1 ? `${src.project}（${src.parent}）` : src.project;
    const backlogMd = fs.readFileSync(src.path, 'utf-8');
    for (const item of parseBacklogItems(backlogMd)) {
      const match = existing.find((e) => !e.state && e.agg &&
        ((item.notionId && e.agg.notionId === item.notionId) || (item.first && e.agg.core.startsWith(item.first))));
      if (item.done) {
        if (match) match.state = 'done';
        continue;
      }
      // ボード上で完了にした行は、backlog.md への書き戻しが漏れていても未完了に戻さない。
      if (match && match.agg.done) {
        match.state = 'done';
        continue;
      }
      if (match) match.state = 'replaced';
      openCount++;
      let number = item.number ?? (match && match.agg.number);
      if (number == null) number = Math.max(maxNumber.get(project) || 0, findMaxTaskNumber(backlogMd)) + 1;
      maxNumber.set(project, Math.max(maxNumber.get(project) || 0, number));
      const text = [item.first, ...item.rest].filter(Boolean).join(' ');
      const notion = item.notionId ? ` <!-- notion:${item.notionId} -->` : '';
      push(item.heading ? `${project} ▸ ${item.heading}` : project, `- [ ] #${number} ${text} → ${src.path}${notion}`);
    }
  }
  const syncedPaths = new Set(sources.map((s) => s.path));
  // 同期対象外の backlog.md は、その中にまだ同じ未完了項目があるかを見て判定する。
  const isStillInBacklog = (agg) => {
    const p = path.resolve(columnDir, agg.source);
    if (syncedPaths.has(p) || !fs.existsSync(p)) return false;
    return parseBacklogItems(fs.readFileSync(p, 'utf-8')).some((item) => !item.done &&
      ((item.notionId && agg.notionId === item.notionId) || (item.first && agg.core.startsWith(item.first))));
  };
  for (const e of existing) {
    if (e.state === 'replaced') continue;
    if (!e.state && e.agg && !e.agg.done && e.agg.source && !isStillInBacklog(e.agg)) continue;
    push(e.card, e.state === 'done' ? e.line.replace(/^- \[ \]/, '- [x]') : e.line);
  }

  const section = [`## ${columnName}`, ''];
  for (const [cardTitle, cardLines] of out) {
    if (cardLines.length === 0) continue;
    if (cardTitle) section.push(`### ${cardTitle}`);
    section.push(...cardLines, '');
  }
  const before = lines.slice(0, start);
  if (end === lines.length && before.length && before[before.length - 1].trim() !== '') before.push('');
  return { md: [...before, ...section, ...lines.slice(end)].join('\n'), items: openCount };
}

function isUnderProjectsRoot(p) {
  return fs.realpathSync(p).startsWith(fs.realpathSync(PROJECTS_ROOT) + path.sep);
}

function listMarkdownFiles(dir, depth, out) {
  if (depth < 0 || out.length >= 100) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listMarkdownFiles(full, depth - 1, out);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md') && out.length < 100) out.push(full);
  }
  return out;
}

// タスク本文のパス表記は書いた場所（サブプロジェクト・その親・projects直下）によって基準が違うため、
// 出典のディレクトリから上へさかのぼって最初に実在したものを採る。
function resolveDocRef(ref, base) {
  if (!ref || path.isAbsolute(ref)) return null;
  let dir = fs.existsSync(base) && fs.statSync(base).isDirectory() ? base : path.dirname(base);
  while (dir.startsWith(PROJECTS_ROOT)) {
    const candidate = path.resolve(dir, ref);
    if (fs.existsSync(candidate) && isUnderProjectsRoot(candidate)) {
      if (fs.statSync(candidate).isDirectory()) {
        return { path: candidate, kind: 'dir', docs: listMarkdownFiles(candidate, 2, []) };
      }
      return { path: candidate, kind: 'file', docs: candidate.toLowerCase().endsWith('.md') ? [candidate] : [] };
    }
    if (dir === PROJECTS_ROOT) break;
    dir = path.dirname(dir);
  }
  return null;
}

// 開いているドキュメントから、同じ変更ディレクトリの資料とサブプロジェクトの大本specへ移れるようにする。
function findRelatedDocs(target) {
  let dir = path.dirname(target);
  while (dir.startsWith(PROJECTS_ROOT + path.sep)) {
    const specsDir = path.join(dir, 'docs', 'specs');
    if (fs.existsSync(specsDir) && fs.statSync(specsDir).isDirectory()) {
      const docs = [];
      const rel = path.relative(path.join(dir, 'docs', 'changes'), target).split(path.sep);
      const depth = rel[0] === 'archives' ? 2 : 1;
      if (rel[0] !== '..' && rel.length > depth) {
        listMarkdownFiles(path.join(dir, 'docs', 'changes', ...rel.slice(0, depth)), 2, docs);
      }
      return { root: dir, docs: docs.concat(listMarkdownFiles(specsDir, 0, [])) };
    }
    dir = path.dirname(dir);
  }
  return null;
}

// `claude --bg` の標準出力（`backgrounded · <id> · <name>`、ANSIカラーコード付き）から短縮IDを取り出す。
function parseBackgroundedId(output) {
  const stripped = output.replace(/\x1b\[[0-9;]*m/g, '');
  // コピーを起動したときは名前が付かず`backgrounded · <id>`で行が終わる。
  const m = stripped.match(/backgrounded\s*·\s*([0-9a-f]+)\b/);
  return m ? m[1] : null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  } catch {
    // 停止済み・削除済み等の競合は無視する。
  }
}

function buildNewSessionPrompt(columnName, groupTitle, text) {
  return `「${columnName}」の「${groupTitle}」について、以下の指示を実行してください:\n\n${text}`;
}

// stopを挟むとCLIは答えていないAskUserQuestionを中断扱いにし、素の返信を質問への回答と結び付けないため、質問を添えて送る。
// 回答待ちのAskUserQuestionはCLIが回答されるまでtranscriptに書かず、state.jsonの`block`にだけ置く（CLI 2.1.291、実機で確認）。
function pendingQuestionsOf(jobState) {
  const questions = jobState && jobState.block && jobState.block.questions;
  return Array.isArray(questions) && questions.length > 0 ? questions : null;
}

function buildReplyPrompt(jobState, transcriptPath, text) {
  const pending = pendingQuestionsOf(jobState);
  let questions;
  if (pending) {
    questions = pending.map((q) => q.question).filter(Boolean);
  } else {
    let entries;
    try {
      entries = parseTranscriptEntries(transcriptPath);
    } catch {
      return text;
    }
    const last = entries[entries.length - 1];
    if (!last || last.kind !== 'tool_use' || last.name !== 'AskUserQuestion') return text;
    questions = [];
    try {
      questions = (JSON.parse(last.input).questions || []).map((q) => q.question).filter(Boolean);
    } catch {
      // 長すぎて切り詰められたinputは質問文を取り出せない。
    }
  }
  return questions.length ? `直前の質問「${questions.join(' / ')}」への回答: ${text}` : `直前の質問への回答: ${text}`;
}

function sessionInfoFor(linked) {
  if (!linked) return null;
  const jobState = readJobState(linked.jobId);
  return jobState
    ? { jobId: linked.jobId, state: jobState.state, tempo: jobState.tempo, detail: jobState.detail, updatedAt: jobState.updatedAt, questions: pendingQuestionsOf(jobState) }
    : { jobId: linked.jobId, state: 'unknown', tempo: null, detail: null, updatedAt: null, questions: null };
}

// セッションの状態がblocked/doneに変わるたびに、その回答（detail要約）を1回だけコメントとして自動追加する。
// 同じ状態変化を二重登録しないよう、jobStateのupdatedAtをnotifiedAtとして記録する。
function syncSessionComments(file, sessionsMap) {
  let changed = false;
  const commentsMap = readCommentsMap(file);
  for (const [groupId, linked] of Object.entries(sessionsMap)) {
    const jobState = readJobState(linked.jobId);
    if (!jobState || !jobState.detail) continue;
    if (jobState.state !== 'blocked' && jobState.state !== 'done') continue;
    if (linked.notifiedAt === jobState.updatedAt) continue;
    const label = jobState.state === 'done' ? '[Claude 完了]' : '[Claude 確認]';
    const list = commentsMap[groupId] || [];
    list.push({ text: `${label} ${jobState.detail}`, at: new Date().toISOString() });
    commentsMap[groupId] = list;
    linked.notifiedAt = jobState.updatedAt;
    changed = true;
  }
  if (!changed) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(commentsFilePath(file), JSON.stringify(commentsMap));
  fs.writeFileSync(sessionsFilePath(file), JSON.stringify(sessionsMap));
}

function syncAllSessionComments() {
  if (!fs.existsSync(DATA_DIR)) return;
  for (const name of fs.readdirSync(DATA_DIR)) {
    const m = name.match(/^sessions-(todo-\d{4}-\d{2}-\d{2})\.json$/);
    if (m) syncSessionComments(`${m[1]}.md`, readSessionsMap(`${m[1]}.md`));
  }
}

function listAllSessions() {
  if (!fs.existsSync(DATA_DIR)) return [];
  const sessions = [];
  for (const name of fs.readdirSync(DATA_DIR)) {
    const m = name.match(/^sessions-(todo-\d{4}-\d{2}-\d{2})\.json$/);
    if (!m) continue;
    const file = `${m[1]}.md`;
    for (const [groupId, linked] of Object.entries(readSessionsMap(file))) {
      if (!linked || !linked.jobId) continue;
      sessions.push({ file, groupId, name: linked.name || null, launchedAt: linked.launchedAt || null, ...sessionInfoFor(linked) });
    }
  }
  return sessions.sort((a, b) => String(b.launchedAt || '').localeCompare(String(a.launchedAt || '')));
}

// 5h/7dの使用率はステータスラインのstdinにしか渡されないため、statuslineが書き出したスナップショットを読む。
function readRateLimits() {
  try {
    return JSON.parse(fs.readFileSync(RATE_LIMITS_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function attachSessions(board, file) {
  const sessionsMap = readSessionsMap(file);
  syncSessionComments(file, sessionsMap);
  for (const column of board.columns) {
    for (const group of column.groups) {
      group.session = sessionInfoFor(sessionsMap[group.id]);
    }
  }
  return board;
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function stringifyBlockContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === 'string' ? c : c.text || '')).join('\n');
  }
  return '';
}

const transcriptEntriesCache = new Map();

// 稼働中のログは5秒ごとに取得されるため、ファイルが変わっていなければ前回の結果を返して全体の読み直しを避ける。
function parseTranscriptEntriesCached(jsonlPath) {
  const { mtimeMs, size } = fs.statSync(jsonlPath);
  const cached = transcriptEntriesCache.get(jsonlPath);
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) return cached.entries;
  const entries = parseTranscriptEntries(jsonlPath);
  transcriptEntriesCache.delete(jsonlPath);
  transcriptEntriesCache.set(jsonlPath, { mtimeMs, size, entries });
  if (transcriptEntriesCache.size > 20) transcriptEntriesCache.delete(transcriptEntriesCache.keys().next().value);
  return entries;
}

// jsonlトランスクリプトの各行から、text/tool_use/tool_result のみを会話ログとして抽出する（thinkingは除外）。
function parseTranscriptEntries(jsonlPath, limit = 300) {
  const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean);
  const entries = [];
  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.type !== 'user' && obj.type !== 'assistant') continue;
    const content = obj.message && obj.message.content;
    const role = obj.type;
    const at = obj.timestamp || null;
    const uuid = obj.uuid || null;
    if (typeof content === 'string') {
      if (content.trim()) entries.push({ kind: 'text', role, at, uuid, text: truncate(content, 4000) });
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === 'text' && block.text && block.text.trim()) {
        entries.push({ kind: 'text', role, at, uuid, text: truncate(block.text, 4000) });
      } else if (block.type === 'tool_use') {
        // AskUserQuestionは選択肢UIの復元にinput全体が必要なため、通常のtool_useより長く許容する。
        const inputLimit = block.name === 'AskUserQuestion' ? 4000 : 1000;
        entries.push({
          kind: 'tool_use', role, at, uuid,
          name: block.name,
          input: truncate(JSON.stringify(block.input || {}), inputLimit),
        });
      } else if (block.type === 'tool_result') {
        entries.push({ kind: 'tool_result', role, at, uuid, text: truncate(stringifyBlockContent(block.content), 1500) });
      }
    }
  }
  return entries.slice(-limit);
}

// 巻き戻し等で同じファイル内に複数の枝があるため、起点からparentUuidをたどった行だけを取り出す。
function extractAncestorLines(lines, leafUuid) {
  const byUuid = new Map();
  lines.forEach((text, index) => {
    try {
      const obj = JSON.parse(text);
      if (obj.uuid) byUuid.set(obj.uuid, { index, obj });
    } catch {
      // 壊れた行は分岐対象にしない。
    }
  });
  const chain = [];
  const seen = new Set();
  for (let cur = byUuid.get(leafUuid); cur && !seen.has(cur.obj.uuid); cur = byUuid.get(cur.obj.parentUuid)) {
    seen.add(cur.obj.uuid);
    chain.push(cur);
  }
  return chain.sort((a, b) => a.index - b.index).map((entry) => entry.obj);
}

const ARTIFACT_KINDS = {
  '.html': 'html', '.htm': 'html',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image', '.svg': 'image',
  '.md': 'markdown',
};
const ARTIFACT_CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8',
};
const ARTIFACT_WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

function isLockedArtifact(filePath) {
  return path.basename(filePath).startsWith('.env') || /secret|credential/i.test(filePath);
}

function listSessionArtifacts(transcriptPath) {
  const order = [];
  for (const file of listTranscriptWithSubagents(transcriptPath)) {
    for (const text of fs.readFileSync(file, 'utf-8').split('\n')) {
      let obj;
      try {
        obj = JSON.parse(text);
      } catch {
        continue;
      }
      const content = obj && obj.message && obj.message.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        const filePath = block.type === 'tool_use' && ARTIFACT_WRITE_TOOLS.has(block.name) && block.input && block.input.file_path;
        if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) continue;
        if (!ARTIFACT_KINDS[path.extname(filePath).toLowerCase()]) continue;
        const existingIndex = order.indexOf(filePath);
        if (existingIndex !== -1) order.splice(existingIndex, 1);
        order.push(filePath);
      }
    }
  }
  return order.reverse().map((filePath) => ({
    path: filePath,
    kind: ARTIFACT_KINDS[path.extname(filePath).toLowerCase()],
    locked: isLockedArtifact(filePath),
    exists: fs.existsSync(filePath),
  }));
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

// 上限を超えたら読み捨てて null を返す（途中で接続を切るとクライアントが413を受け取れないため最後まで受信する）。
function readBinaryBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    req.on('end', () => resolve(size > limit ? null : Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sanitizeAttachmentName(name) {
  const base = path.basename(String(name || '').replace(/\\/g, '/'));
  const cleaned = base.replace(/[\x00-\x1f/:*?"<>|]/g, '_').replace(/^\.+/, '');
  return cleaned.slice(-120) || 'file';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/attachments' && req.method === 'POST') {
    const file = url.searchParams.get('file') || '';
    const groupId = url.searchParams.get('groupId') || '';
    if (!isValidTodoFile(file) || !/^[\w-]+$/.test(groupId)) {
      req.resume();
      return sendJson(res, 400, { error: 'invalid payload' });
    }
    const body = await readBinaryBody(req, MAX_ATTACHMENT_BYTES);
    if (body === null) return sendJson(res, 413, { error: 'too large' });
    if (body.length === 0) return sendJson(res, 400, { error: 'empty body' });
    const dir = path.join(DATA_DIR, 'attachments', file.replace(/\.md$/, ''), groupId);
    fs.mkdirSync(dir, { recursive: true });
    const saved = path.join(dir, `${Date.now()}-${sanitizeAttachmentName(url.searchParams.get('name'))}`);
    fs.writeFileSync(saved, body);
    return sendJson(res, 200, { path: saved });
  }

  if (url.pathname === '/api/files') {
    return sendJson(res, 200, listTodoFiles());
  }

  if (url.pathname === '/api/board' && req.method === 'GET') {
    const file = url.searchParams.get('file') || '';
    if (!isValidTodoFile(file)) {
      return sendJson(res, 400, { error: 'invalid file name' });
    }
    const filePath = path.join(TODO_DIR, file);
    if (!fs.existsSync(filePath)) {
      return sendJson(res, 404, { error: 'not found' });
    }
    let board;
    try {
      board = parseBoard(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
      return sendJson(res, 500, { error: 'parse failed', detail: String(err.message || err) });
    }
    board = applySavedOrder(board, file);
    board = attachSessions(board, file);
    board = attachComments(board, file);
    board = attachProjectHints(board);
    const date = file.match(/^todo-(\d{4}-\d{2}-\d{2})\.md$/)[1];
    board.date = date;
    board.mtimeMs = fs.statSync(filePath).mtimeMs;
    board.history = buildHistory(date);
    board.globalComments = readGlobalComments(file);
    const columnFilter = url.searchParams.get('column');
    if (columnFilter) {
      board.columns = board.columns.filter((c) => c.name === columnFilter);
    }
    return sendJson(res, 200, board);
  }

  if (url.pathname === '/api/board/sync-column' && req.method === 'POST') {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    const { file, column } = payload;
    if (!isValidTodoFile(file) || typeof column !== 'string' || !column || /[\\/]|\.\./.test(column)) {
      return sendJson(res, 400, { error: 'invalid payload' });
    }
    const filePath = path.join(TODO_DIR, file);
    const columnDir = path.join(PROJECTS_ROOT, column);
    if (!fs.existsSync(filePath) || !fs.existsSync(columnDir)) {
      return sendJson(res, 404, { error: 'not found' });
    }
    const { md, items } = syncColumnSection(fs.readFileSync(filePath, 'utf-8'), column, columnDir);
    fs.writeFileSync(filePath, md);
    return sendJson(res, 200, { items });
  }

  if (url.pathname === '/api/board/version' && req.method === 'GET') {
    const file = url.searchParams.get('file') || '';
    if (!isValidTodoFile(file)) {
      return sendJson(res, 400, { error: 'invalid file name' });
    }
    const filePath = path.join(TODO_DIR, file);
    if (!fs.existsSync(filePath)) {
      return sendJson(res, 404, { error: 'not found' });
    }
    return sendJson(res, 200, { mtimeMs: fs.statSync(filePath).mtimeMs });
  }

  if (url.pathname === '/api/order' && req.method === 'POST') {
    const body = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    const { file, order } = payload;
    if (!isValidTodoFile(file) || typeof order !== 'object') {
      return sendJson(res, 400, { error: 'invalid payload' });
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const orderPath = orderFilePath(file);
    let existing = {};
    if (fs.existsSync(orderPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(orderPath, 'utf-8'));
      } catch {
        existing = {};
      }
    }
    fs.writeFileSync(orderPath, JSON.stringify({ ...existing, ...order }));
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/comments' && req.method === 'POST') {
    const body = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    const { file, groupId, text } = payload;
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!isValidTodoFile(file) || typeof groupId !== 'string' || !trimmed) {
      return sendJson(res, 400, { error: 'invalid payload' });
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const commentsMap = readCommentsMap(file);
    const list = commentsMap[groupId] || [];
    list.push({ text: trimmed, at: new Date().toISOString() });
    commentsMap[groupId] = list;
    fs.writeFileSync(commentsFilePath(file), JSON.stringify(commentsMap));
    return sendJson(res, 200, { comments: list });
  }

  if (url.pathname === '/api/comments/global' && req.method === 'POST') {
    const body = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    const { file, text } = payload;
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!isValidTodoFile(file) || !trimmed) {
      return sendJson(res, 400, { error: 'invalid payload' });
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const list = readGlobalComments(file);
    list.push({ text: trimmed, at: new Date().toISOString() });
    fs.writeFileSync(globalCommentsFilePath(file), JSON.stringify(list));
    return sendJson(res, 200, { comments: list });
  }

  if (url.pathname === '/api/checkbox' && req.method === 'POST') {
    const body = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    const { file, taskId } = payload;
    if (!isValidTodoFile(file) || typeof taskId !== 'string') {
      return sendJson(res, 400, { error: 'invalid payload' });
    }
    const filePath = path.join(TODO_DIR, file);
    if (!fs.existsSync(filePath)) {
      return sendJson(res, 404, { error: 'not found' });
    }
    const toggled = toggleTaskLine(fs.readFileSync(filePath, 'utf-8'), taskId);
    if (!toggled) {
      return sendJson(res, 404, { error: 'task not found' });
    }
    fs.writeFileSync(filePath, toggled.md);

    let sourceUpdated = false;
    const sourcePath = extractSourcePath(toggled.rawText);
    if (sourcePath && fs.existsSync(sourcePath)) {
      const srcMd = fs.readFileSync(sourcePath, 'utf-8');
      const srcLineIndex = findSourceLine(srcMd, computeAggCore(toggled.rawText));
      if (srcLineIndex != null) {
        const srcLines = srcMd.split('\n');
        const srcTask = srcLines[srcLineIndex].match(/^(\s*- \[)([ x])(\] )(.+)$/);
        srcLines[srcLineIndex] = `${srcTask[1]}${toggled.done ? 'x' : ' '}${srcTask[3]}${srcTask[4]}`;
        fs.writeFileSync(sourcePath, srcLines.join('\n'));
        sourceUpdated = true;
      }
    }
    return sendJson(res, 200, { ok: true, done: toggled.done, sourceUpdated });
  }

  if (url.pathname === '/api/tasks' && req.method === 'POST') {
    const body = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    const { file, columnName, groupTitle, text } = payload;
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!isValidTodoFile(file) || typeof columnName !== 'string' ||
        typeof groupTitle !== 'string' || !trimmed) {
      return sendJson(res, 400, { error: 'invalid payload' });
    }
    const targetDir = resolveLaunchCwd(columnName, groupTitle);
    if (!targetDir) {
      return sendJson(res, 400, { error: 'no matching project directory', columnName });
    }
    const sourcePath = path.join(targetDir, 'docs', 'tasks', 'backlog.md');
    if (!fs.existsSync(sourcePath)) {
      return sendJson(res, 400, { error: 'source backlog.md not found', sourcePath });
    }

    const srcMd = fs.readFileSync(sourcePath, 'utf-8');
    const maxNum = findMaxTaskNumber(srcMd);
    const number = maxNum > 0 ? maxNum + 1 : null;
    const taskBody = number != null ? `#${number} ${trimmed}` : trimmed;
    const newSrcLine = `- [ ] ${taskBody}`;
    const updatedSrc = (srcMd.endsWith('\n') ? srcMd : `${srcMd}\n`) + `${newSrcLine}\n`;
    fs.writeFileSync(sourcePath, updatedSrc);

    let mirroredToAggregate = false;
    const aggPath = path.join(TODO_DIR, file);
    if (fs.existsSync(aggPath)) {
      const aggMd = fs.readFileSync(aggPath, 'utf-8');
      const newAggLine = `${newSrcLine} → ${sourcePath}`;
      const updatedAgg = insertTaskUnderHeading(aggMd, columnName, groupTitle, newAggLine);
      if (updatedAgg != null) {
        fs.writeFileSync(aggPath, updatedAgg);
        mirroredToAggregate = true;
      }
    }

    return sendJson(res, 200, { task: { number, text: trimmed }, mirroredToAggregate });
  }

  if (url.pathname === '/api/cards' && req.method === 'POST') {
    const body = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    const { file, columnName, text } = payload;
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!isValidTodoFile(file) || typeof columnName !== 'string' || !trimmed) {
      return sendJson(res, 400, { error: 'invalid payload' });
    }
    const targetDir = resolveLaunchCwd(columnName, '');
    if (!targetDir) {
      return sendJson(res, 400, { error: 'no matching project directory', columnName });
    }
    const sourcePath = path.join(targetDir, 'docs', 'tasks', 'backlog.md');
    if (!fs.existsSync(sourcePath)) {
      return sendJson(res, 400, { error: 'source backlog.md not found', sourcePath });
    }

    const srcMd = fs.readFileSync(sourcePath, 'utf-8');
    const maxNum = findMaxTaskNumber(srcMd);
    const number = maxNum > 0 ? maxNum + 1 : null;
    const taskBody = number != null ? `#${number} ${trimmed}` : trimmed;
    const newSrcLine = `- [ ] ${taskBody}`;
    const updatedSrc = (srcMd.endsWith('\n') ? srcMd : `${srcMd}\n`) + `${newSrcLine}\n`;
    fs.writeFileSync(sourcePath, updatedSrc);

    let mirroredToAggregate = false;
    const aggPath = path.join(TODO_DIR, file);
    if (fs.existsSync(aggPath)) {
      const aggMd = fs.readFileSync(aggPath, 'utf-8');
      const newAggLine = `${newSrcLine} → ${sourcePath}`;
      const updatedAgg = insertStandaloneTaskAfterColumnHeading(aggMd, columnName, newAggLine);
      fs.writeFileSync(aggPath, updatedAgg);
      mirroredToAggregate = true;
    }

    return sendJson(res, 200, { card: { number, text: trimmed }, mirroredToAggregate });
  }

  if (url.pathname === '/api/sessions' && req.method === 'GET') {
    const file = url.searchParams.get('file') || '';
    if (!isValidTodoFile(file)) {
      return sendJson(res, 400, { error: 'invalid file name' });
    }
    syncAllSessionComments();
    const sessionsMap = readSessionsMap(file);
    rememberTranscriptPaths(file, sessionsMap);
    const result = {};
    for (const groupId of Object.keys(sessionsMap)) {
      result[groupId] = sessionInfoFor(sessionsMap[groupId]);
    }
    return sendJson(res, 200, result);
  }

  if (url.pathname === '/api/sessions/all' && req.method === 'GET') {
    return sendJson(res, 200, { sessions: listAllSessions() });
  }

  if (url.pathname === '/api/rate-limits' && req.method === 'GET') {
    return sendJson(res, 200, { rateLimits: readRateLimits() });
  }

  if (url.pathname === '/api/session/transcript' && req.method === 'GET') {
    const jobId = url.searchParams.get('jobId') || '';
    if (!/^[0-9a-f-]+$/.test(jobId)) {
      return sendJson(res, 400, { error: 'invalid job id' });
    }
    const transcriptPath = resolveTranscriptPath(jobId);
    if (!transcriptPath) {
      return sendJson(res, 404, { error: 'transcript not found' });
    }
    return sendJson(res, 200, { entries: parseTranscriptEntriesCached(transcriptPath) });
  }

  if (url.pathname === '/api/costs/monthly' && req.method === 'GET') {
    return sendJson(res, 200, { months: buildMonthlyCosts() });
  }

  if (url.pathname === '/api/costs/cards' && req.method === 'GET') {
    const file = url.searchParams.get('file');
    if (!isValidTodoFile(file)) return sendJson(res, 400, { error: 'invalid file' });
    return sendJson(res, 200, { cards: buildCardCosts(file) });
  }

  if (url.pathname === '/api/claude-settings' && req.method === 'GET') {
    return sendJson(res, 200, { global: readGlobalClaudeSettings(), override: readLaunchSettings() });
  }

  if (url.pathname === '/api/claude-settings' && req.method === 'POST') {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    const model = typeof payload.model === 'string' ? payload.model.trim() : '';
    const effort = typeof payload.effort === 'string' ? payload.effort : '';
    if ((model && !MODEL_PATTERN.test(model)) || (effort && !EFFORT_LEVELS.includes(effort))) {
      return sendJson(res, 400, { error: 'invalid payload' });
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LAUNCH_SETTINGS_PATH, JSON.stringify({ model, effort }));
    return sendJson(res, 200, { override: { model, effort } });
  }

  if (url.pathname === '/api/workspace/trust' && req.method === 'POST') {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    if (!isTrustableCwd(payload && payload.cwd)) {
      return sendJson(res, 400, { error: 'invalid cwd' });
    }
    markWorkspaceTrusted(payload.cwd);
    return sendJson(res, 200, { trusted: true });
  }

  if (url.pathname === '/api/session/launch' && req.method === 'POST') {
    const body = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    const { file, groupId, columnName, groupTitle, text, newSession } = payload;
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!isValidTodoFile(file) || typeof groupId !== 'string' || typeof columnName !== 'string' ||
        typeof groupTitle !== 'string' || !trimmed) {
      return sendJson(res, 400, { error: 'invalid payload' });
    }
    const lockKey = buildLaunchLockKey(file, groupId);
    if (activeLaunchKeys.has(lockKey)) {
      return sendJson(res, 409, { error: 'launch in progress' });
    }
    activeLaunchKeys.add(lockKey);
    try {
      const sessionsMap = readSessionsMap(file);
      // 同じカードの別タスクの指示を前の会話に混ぜないため、newSessionでは既存セッションを見ずに新規起動する。
      const existing = newSession === true ? null : sessionsMap[groupId];
      if (existing && isSessionBusy(existing.jobId)) {
        return sendJson(res, 200, { launched: false, reason: 'already-running', jobId: existing.jobId });
      }
      const cwd = resolveLaunchCwd(columnName, groupTitle);
      if (!cwd) {
        return sendJson(res, 400, { error: 'no matching project directory', columnName });
      }
      const name = `${columnName} ▸ ${groupTitle}`.slice(0, 60);
      const existingState = existing ? readJobState(existing.jobId) : null;
      // --resumeには短縮jobIdではなくフルセッションUUIDを渡す。短縮IDだと`claude`が曖昧一致とみなし、
      // 非対話実行のはずが対話的なResumeピッカーを開いて固まる（実機で確認済み）。
      let mode = 'new';
      let sessionId = null;
      let transcriptPath = null;
      if (existingState) {
        transcriptPath = existingState.linkScanPath || null;
        sessionId = existingState.sessionId || sessionIdFromTranscriptPath(transcriptPath);
        if (sessionId) mode = 'reply';
      } else if (existing && existing.transcriptPath && fs.existsSync(existing.transcriptPath)) {
        transcriptPath = existing.transcriptPath;
        sessionId = sessionIdFromTranscriptPath(transcriptPath);
        if (sessionId) mode = 'revive';
      }
      const prompt = mode === 'new' ? buildNewSessionPrompt(columnName, groupTitle, trimmed) : buildReplyPrompt(existingState, transcriptPath, trimmed);
      // `-`で始まる返信（箇条書き等）をCLIがオプションと解釈しないよう`--`で区切る（`--`はコピーの原因にならないことを実機で確認）。
      // 登録済みのbgセッションへの--resumeにプロンプト以外の引数があると、CLIはコピー（別jobId）を起動する。
      // 削除済みのセッションには保存済みのオプションが無いため、revive では付けて補う。
      const args = mode === 'reply'
        ? ['--bg', '--resume', sessionId, '--', prompt]
        : mode === 'revive'
          ? ['--bg', ...buildLaunchSettingArgs(), '--resume', sessionId, '-n', name, '--', prompt]
          : ['--bg', ...buildLaunchSettingArgs(), '-n', name, '--', prompt];
      if (mode === 'reply') {
        await runClaudeQuietly(['stop', existing.jobId]);
        await sleep(STOP_SETTLE_MS);
      }
      let result;
      try {
        result = await launchBackground(args, cwd, name);
        if (mode === 'reply' && result.jobId && result.jobId !== existing.jobId && /started a copy/.test(result.output)) {
          await runClaudeQuietly(['stop', result.jobId]);
          await runClaudeQuietly(['rm', result.jobId]);
          await sleep(STOP_SETTLE_MS);
          result = await launchBackground(args, cwd, name);
        }
      } catch (err) {
        return sendLaunchFailure(res, err, cwd);
      }
      const { jobId, recovered } = result;
      if (!jobId) {
        return sendJson(res, 500, { error: 'could not parse session id from claude output' });
      }
      updateSessionEntry(file, groupId, { jobId, name, launchedAt: new Date().toISOString() });
      const copied = mode === 'reply' && jobId !== existing.jobId;
      if (copied && !transcriptUsedWorktree(transcriptPath)) {
        await runClaudeQuietly(['rm', existing.jobId]);
      }
      return sendJson(res, 200, {
        launched: true, jobId, resumed: mode !== 'new',
        ...(copied ? { copied: true } : {}), ...(recovered ? { recovered: true } : {}),
      });
    } finally {
      activeLaunchKeys.delete(lockKey);
    }
  }

  if (url.pathname === '/api/doc/resolve' && req.method === 'GET') {
    const ref = url.searchParams.get('ref') || '';
    const base = path.resolve(url.searchParams.get('base') || PROJECTS_ROOT);
    const found = resolveDocRef(ref, base);
    if (!found) return sendJson(res, 404, { error: 'not found' });
    return sendJson(res, 200, found);
  }

  if (url.pathname === '/api/doc/related' && req.method === 'GET') {
    const requested = path.resolve(url.searchParams.get('path') || '/');
    if (!fs.existsSync(requested)) return sendJson(res, 404, { error: 'not found' });
    if (!isUnderProjectsRoot(requested)) return sendJson(res, 403, { error: 'forbidden' });
    const found = findRelatedDocs(requested);
    if (!found) return sendJson(res, 404, { error: 'not found' });
    return sendJson(res, 200, found);
  }
  if (url.pathname === '/api/doc' && req.method === 'GET') {
    const requested = path.resolve(url.searchParams.get('path') || '/');
    if (path.extname(requested).toLowerCase() !== '.md') {
      return sendJson(res, 403, { error: 'forbidden' });
    }
    if (!fs.existsSync(requested)) {
      return sendJson(res, 404, { error: 'not found' });
    }
    // symlinkで配下外を指していても読めないよう、解決後の実体パスで判定する。
    const realRoot = fs.realpathSync(PROJECTS_ROOT);
    if (!fs.realpathSync(requested).startsWith(realRoot + path.sep)) {
      return sendJson(res, 403, { error: 'forbidden' });
    }
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
    return res.end(fs.readFileSync(requested));
  }

  if ((url.pathname === '/api/session/artifacts' || url.pathname === '/api/session/artifact') && req.method === 'GET') {
    const jobId = url.searchParams.get('jobId') || '';
    if (!/^[0-9a-f-]+$/.test(jobId)) {
      return sendJson(res, 400, { error: 'invalid job id' });
    }
    const transcriptPath = resolveTranscriptPath(jobId);
    if (!transcriptPath) {
      return sendJson(res, 404, { error: 'transcript not found' });
    }
    const artifacts = listSessionArtifacts(transcriptPath);
    if (url.pathname === '/api/session/artifacts') {
      return sendJson(res, 200, { artifacts });
    }
    // 任意ファイルの読み出し口にしないため、このセッションが書いたと記録されたパスだけを配信する。
    const artifact = artifacts.find((a) => a.path === url.searchParams.get('path'));
    if (!artifact || artifact.locked) {
      return sendJson(res, 403, { error: 'forbidden' });
    }
    if (!artifact.exists) {
      return sendJson(res, 404, { error: 'not found' });
    }
    const headers = { 'Content-Type': ARTIFACT_CONTENT_TYPES[path.extname(artifact.path).toLowerCase()] };
    // 資料内のスクリプトがviewerと同一オリジンでAPIを叩けないよう、HTML・SVGはsandboxで隔離する。
    if (artifact.kind === 'html' || artifact.path.toLowerCase().endsWith('.svg')) {
      headers['Content-Security-Policy'] = 'sandbox';
    }
    res.writeHead(200, headers);
    return res.end(fs.readFileSync(artifact.path));
  }

  if (url.pathname === '/api/session/branch' && req.method === 'POST') {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    const { file, groupId, columnName, groupTitle, uuid, text } = payload;
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!isValidTodoFile(file) || typeof groupId !== 'string' || typeof columnName !== 'string' ||
        typeof groupTitle !== 'string' || typeof uuid !== 'string' || !uuid || !trimmed) {
      return sendJson(res, 400, { error: 'invalid payload' });
    }
    const lockKey = buildLaunchLockKey(file, groupId);
    if (activeLaunchKeys.has(lockKey)) {
      return sendJson(res, 409, { error: 'launch in progress' });
    }
    activeLaunchKeys.add(lockKey);
    try {
      const sessionsMap = readSessionsMap(file);
      const existing = sessionsMap[groupId];
      const jobState = existing ? readJobState(existing.jobId) : null;
      const transcriptPath = (jobState && jobState.linkScanPath) || (existing && existing.transcriptPath);
      if (!transcriptPath || !fs.existsSync(transcriptPath)) {
        return sendJson(res, 404, { error: 'transcript not found' });
      }
      const chain = extractAncestorLines(fs.readFileSync(transcriptPath, 'utf-8').split('\n').filter(Boolean), uuid);
      if (!chain.length) {
        return sendJson(res, 404, { error: 'uuid not found' });
      }
      const sessionId = crypto.randomUUID();
      // --resumeは<sessionId>.jsonlを元transcriptと同じプロジェクトディレクトリから探すため、同じ場所に置く。
      const branchedPath = path.join(path.dirname(transcriptPath), `${sessionId}.jsonl`);
      fs.writeFileSync(branchedPath, chain.map((obj) => JSON.stringify({ ...obj, sessionId })).join('\n') + '\n');
      const cwd = chain[chain.length - 1].cwd || resolveLaunchCwd(columnName, groupTitle);
      const name = `${columnName} ▸ ${groupTitle}`.slice(0, 60);
      const prompt = buildNewSessionPrompt(columnName, groupTitle, trimmed);
      let result;
      try {
        result = await launchBackground(['--bg', ...buildLaunchSettingArgs(), '--resume', sessionId, '-n', name, '--', prompt], cwd, name);
      } catch (err) {
        return sendLaunchFailure(res, err, cwd);
      }
      const { jobId, recovered } = result;
      if (!jobId) {
        return sendJson(res, 500, { error: 'could not parse session id from claude output' });
      }
      updateSessionEntry(file, groupId, { jobId, name, launchedAt: new Date().toISOString(), branchedFrom: { jobId: existing.jobId, uuid } });
      // 元ジョブは入力待ちのまま残さない。rmしないのは、元の会話をセッション一覧から見られるようにするため。
      if (jobState && ['blocked', 'done', 'failed'].includes(jobState.state)) {
        await runClaudeQuietly(['stop', existing.jobId]);
      }
      return sendJson(res, 200, { launched: true, jobId, sessionId, ...(recovered ? { recovered: true } : {}) });
    } finally {
      activeLaunchKeys.delete(lockKey);
    }
  }

  let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('not found');
    }
    const ext = path.extname(filePath);
    const type = ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : 'text/html';
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`todo viewer: http://localhost:${PORT}`);
});
