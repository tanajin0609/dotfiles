const COLUMN_HUE_STEPS = 24;
function hueForColumnName(name) {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % COLUMN_HUE_STEPS) * (360 / COLUMN_HUE_STEPS);
}
function applyColumnHue(el, columnName) {
  el.style.setProperty('--col-hue', String(hueForColumnName(columnName)));
}

const SEGS_MAX_WIDTH = 100;
const SEGS_GAP = 2;
const SEGS_MAX_SEG_WIDTH = 15;
const SEGS_MIN_SEG_WIDTH = 1;
function segWidthForCount(n) {
  if (n <= 0) return SEGS_MAX_SEG_WIDTH;
  const available = SEGS_MAX_WIDTH - SEGS_GAP * (n - 1);
  const w = available / n;
  return Math.max(SEGS_MIN_SEG_WIDTH, Math.min(SEGS_MAX_SEG_WIDTH, w));
}
function shortDate(dateStr) { return dateStr.slice(5); }

let currentFile = null;
let boardData = null;
let modalColumnName = null;
let modalGroup = null;
let modalFocusReturn = null;
let lastModalGroupId = null;
const busyCommentsByGroupId = new Map();
let focusMode = false;
let focusTarget = null;
let focusQueueIds = [];
let focusIndex = 0;
let renderedBoardFile = null;
let openedActionMenu = null;
let todoFiles = [];
let starredGroupIds = new Set();
let groupStatuses = {};
// 5秒ごとの再描画で保留の折りたたみが閉じ直さないよう、開いた列名を覚えておく。
const openHoldColumns = new Set();
let searchQuery = '';
const activeFilterIds = new Set();
let failedBoardFile = null;
let loadedBoardMtimeMs = null;
let notifiedBoardMtimeMs = null;
let dismissBoardUpdatedToast = null;
let ownBoardWriteCount = 0;

const STARRED_KEY_PREFIX = 'viewer:starred:';
const FOCUS_TARGET_ALL_OPEN = 'all-open';
const FOCUS_TARGET_STARRED = 'starred';
const FOCUS_TARGET_TODAY = 'status-today';
const STATUS_KEY_PREFIX = 'viewer:status:';
const STATUS_ORDER = ['', 'today', 'hold'];
const STATUS_LABELS = { '': '未着手', today: '今日やる', hold: '保留' };
const STATUS_ICONS = { '': '○', today: '▶', hold: '⏸' };
const FOCUS_TARGET_COLUMN_PREFIX = 'column:';
const TASK_TOGGLE_UNDO_DURATION_MS = 10000;
const TOAST_TASK_TEXT_MAX = 30;

function applyAndSaveTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function applyAndSaveSkin(skin) {
  document.documentElement.dataset.skin = skin;
  localStorage.setItem(SKIN_STORAGE_KEY, skin);
}

const TOAST_DEFAULT_DURATION_MS = 3000;
const TOAST_MAX_PER_KIND = 3;
const toastDismissers = new WeakMap();

// モーダルの<dialog>を開いている間は、その外側がinertになりトーストのボタンを押せないため、
// 最前面のダイアログの中へ移してから出す（popoverで重ねてもinertのままでクリックできないことをChromiumで実測）。
function attachToastRegionToTopmostDialog() {
  const region = document.getElementById('toastRegion');
  const openDialogs = [...document.querySelectorAll('dialog[open]')].filter((d) => d.matches(':modal'));
  const host = openDialogs[openDialogs.length - 1] || document.body;
  if (region.parentElement !== host) host.appendChild(region);
}

const shownServerWarnings = new Set();

function notifyServerWarnings(board) {
  for (const w of board.dataWarnings || []) {
    if (shownServerWarnings.has(w.movedTo)) continue;
    shownServerWarnings.add(w.movedTo);
    showToast(`保存データ「${w.file}」が壊れていたため、空として読み直しました。元の内容は ${w.movedTo} に退避しています`, { kind: 'error', durationMs: null, key: `data-warning-${w.movedTo}` });
  }
  const cli = board.claudeCli;
  if (!cli || !cli.version || cli.version === cli.tested) return;
  const key = `viewer:cliVersionNotified:${cli.version}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch {}
  showToast(`Claude Code ${cli.version} は viewer で未確認の版です（確認済みは ${cli.tested}）。セッションの状態表示や返信がずれたら知らせてください`, { durationMs: null, key: 'cli-version' });
}

// durationMs: 省略時は失敗(error)なら閉じるまで残し、それ以外は既定時間で消す。nullで常に残す。
// key: 同じkeyのトーストが出ていれば置き換える。戻り値はトーストを閉じる関数。
// onClose: トーストが消えたときに呼ぶ。操作ボタンで消えたときだけ引数が 'action'。
function showToast(message, { kind = 'info', actionLabel, onAction, onClose, key, durationMs } = {}) {
  attachToastRegionToTopmostDialog();
  const region = document.getElementById('toastRegion');
  if (key) {
    const existing = region.querySelector(`[data-toast-key="${CSS.escape(key)}"]`);
    if (existing) toastDismissers.get(existing)();
  }
  const toast = document.createElement('div');
  toast.className = `toast ${kind}`;
  if (key) toast.dataset.toastKey = key;
  let timer = null;
  let closed = false;
  const dismiss = (reason) => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    toast.remove();
    if (onClose) onClose(reason);
  };
  toastDismissers.set(toast, dismiss);

  const text = document.createElement('span');
  text.className = 'toast-message';
  text.textContent = message;
  toast.appendChild(text);
  if (actionLabel && onAction) {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'toast-action';
    actionBtn.textContent = actionLabel;
    actionBtn.addEventListener('click', () => {
      dismiss('action');
      onAction();
    });
    toast.appendChild(actionBtn);
  }
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', '通知を閉じる');
  closeBtn.addEventListener('click', () => dismiss());
  toast.appendChild(closeBtn);

  const list = region.querySelector(`[data-toast-kind="${kind === 'error' ? 'error' : 'info'}"]`);
  list.appendChild(toast);
  while (list.children.length > TOAST_MAX_PER_KIND) toastDismissers.get(list.firstElementChild)();

  const effectiveDurationMs = durationMs !== undefined ? durationMs : (kind === 'error' ? null : TOAST_DEFAULT_DURATION_MS);
  if (effectiveDurationMs) {
    // フォーカス中・ポインターを乗せている間は残り時間を止める。
    // ホバーはmouseenterでなくpointermoveで判定する: 止まっていたポインターの真下に出たトーストまで止まると、消えずに下の操作を塞ぎ続けるため。
    let remainingMs = effectiveDurationMs;
    let startedAt = 0;
    let focused = false;
    let hovered = false;
    const resume = () => {
      startedAt = Date.now();
      timer = setTimeout(dismiss, remainingMs);
    };
    const pause = () => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
      remainingMs -= Date.now() - startedAt;
    };
    const resumeIfIdle = () => {
      if (!focused && !hovered && timer === null) resume();
    };
    toast.addEventListener('focusin', () => { focused = true; pause(); });
    toast.addEventListener('focusout', (e) => {
      if (toast.contains(e.relatedTarget)) return;
      focused = false;
      resumeIfIdle();
    });
    toast.addEventListener('pointermove', () => { hovered = true; pause(); });
    toast.addEventListener('pointerleave', () => { hovered = false; resumeIfIdle(); });
    resume();
  }
  return dismiss;
}

function showFailureToast(message, onRetry) {
  return showToast(message, { kind: 'error', actionLabel: '再試行', onAction: onRetry });
}

function isUntrustedWorkspace(response) {
  return response.status === 403 && response.data && response.data.error === 'workspace not trusted';
}

function showUntrustedWorkspaceDialog(cwd, onRetry) {
  const dialog = document.getElementById('trustDialog');
  const acceptBtn = document.getElementById('trustDialogAccept');
  document.getElementById('trustDialogPath').textContent = cwd;
  document.getElementById('trustDialogCancel').onclick = () => dialog.close();
  acceptBtn.disabled = false;
  acceptBtn.onclick = async () => {
    acceptBtn.disabled = true;
    const response = await postJson('/api/workspace/trust', { cwd });
    dialog.close();
    if (!response.ok) {
      showFailureToast(`ワークスペースの信頼設定に失敗しました: ${formatFailureReason(response)}`, () => showUntrustedWorkspaceDialog(cwd, onRetry));
      return;
    }
    onRetry();
  };
  if (!dialog.open) dialog.showModal();
}

// 通信失敗も含めて例外を投げず、呼び出し側が `ok` だけで分岐できる形にそろえる。
async function postJson(url, body) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function formatFailureReason(response) {
  if (response.status === 0) return 'サーバーに接続できません';
  const error = response.data && response.data.error;
  return error ? `${error}（HTTP ${response.status}）` : `HTTP ${response.status}`;
}

function findGroupById(groupId) {
  if (!boardData) return null;
  for (const column of boardData.columns) {
    const group = column.groups.find((g) => g.id === groupId);
    if (group) return { column, group };
  }
  return null;
}

function findTaskById(taskId) {
  if (!boardData) return null;
  for (const column of boardData.columns) {
    for (const group of column.groups) {
      const task = group.tasks.find((t) => t.id === taskId);
      if (task) return { column, group, task };
    }
  }
  return null;
}

function findElementByFocusKey(focusKey) {
  return focusKey ? document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`) : null;
}

function insertAtCursor(input, text) {
  if (input.isContentEditable || input.classList.contains('rich-input')) {
    insertIntoRichInput(input, document.createTextNode(text));
    return;
  }
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  input.focus();
  const pos = start + text.length;
  input.setSelectionRange(pos, pos);
}

// 引用を本文中の位置ごと保ちたいため、依頼欄はcontenteditableにして引用をインラインのチップで持つ。
// 既存処理がtextareaと同じく value・disabled で扱えるよう、要素にプロパティを生やす。
const RICH_INPUT_IDS = ['modalCommentInput', 'sessionLogReplyInput'];

function serializeRichInput(el) {
  let out = '';
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) out += child.data.replace(/\u200B/g, '');
      else if (child.nodeName === 'BR') out += '\n';
      else if (child.classList && child.classList.contains('quote-chip')) out += `\n\n${child.dataset.quote}\n\n`;
      else {
        if (/^(DIV|P)$/.test(child.nodeName) && out && !out.endsWith('\n')) out += '\n';
        walk(child);
      }
    }
  };
  walk(el);
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

function enhanceRichInput(el) {
  Object.defineProperty(el, 'value', {
    get: () => serializeRichInput(el),
    set: (text) => { el.textContent = text; },
  });
  Object.defineProperty(el, 'disabled', {
    get: () => el.getAttribute('aria-disabled') === 'true',
    set: (flag) => {
      el.setAttribute('aria-disabled', String(!!flag));
      el.contentEditable = flag ? 'false' : 'true';
    },
  });
  let lastRange = null;
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (selection.rangeCount && el.contains(selection.anchorNode)) lastRange = selection.getRangeAt(0).cloneRange();
  });
  el.restoreCaret = () => {
    el.focus();
    const selection = window.getSelection();
    if (lastRange && el.contains(lastRange.startContainer)) {
      selection.removeAllRanges();
      selection.addRange(lastRange);
    } else {
      selection.selectAllChildren(el);
      selection.collapseToEnd();
    }
    return selection.getRangeAt(0);
  };
  el.addEventListener('paste', (e) => {
    e.preventDefault();
    if (e.clipboardData.files.length > 0 && el.onPasteFiles) {
      el.onPasteFiles(e.clipboardData.files);
      return;
    }
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  el.addEventListener('click', (e) => {
    const remove = e.target.closest('.quote-chip-remove');
    if (!remove || el.disabled) return;
    remove.closest('.quote-chip').remove();
    el.focus();
  });
  // Chromeは中身を消しても<br>を残し、:emptyのplaceholderが出なくなるため掃除する。
  el.addEventListener('input', () => { if (!el.textContent && !el.querySelector('.quote-chip')) el.replaceChildren(); });
}

function insertIntoRichInput(el, node) {
  const range = el.restoreCaret();
  range.deleteContents();
  range.insertNode(node);
  // チップの直後にカーソルを置ける足場がないと、末尾のチップの後ろへ入力できないため空文字を足す。
  const after = document.createTextNode('\u200B');
  node.after(after);
  range.setStart(after, 1);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function addQuoteChip(inputId, quote) {
  const el = document.getElementById(inputId);
  const text = quote.replace(/\n+$/, '');
  const chip = document.createElement('span');
  chip.className = 'quote-chip';
  chip.contentEditable = 'false';
  chip.dataset.quote = text;
  chip.title = text;
  const label = document.createElement('span');
  label.className = 'quote-chip-label';
  // 部分引用の1行目は出典パスなので、見分けやすい引用本文の行を見出しにする。
  const lines = text.split('\n').map((line) => line.replace(/^> ?/, ''));
  label.textContent = lines.find((line) => line && !line.startsWith('/')) || lines[0];
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'quote-chip-remove';
  remove.textContent = '×';
  remove.setAttribute('aria-label', `引用「${label.textContent}」を外す`);
  chip.append(label, remove);
  insertIntoRichInput(el, chip);
}

function toLineQuote(text) {
  return text.split('\n').map((line) => `> ${line}`).join('\n');
}

// Claudeにはファイル本体を渡せないため、サーバーに保存した絶対パスを本文に書き、セッション側に読ませる。
async function attachDroppedFiles(input, groupId, fileList, uploadUrl) {
  const files = [...fileList];
  const dismiss = showToast(`添付中…（${files.length}件）`, { key: 'attachments', durationMs: null });
  const lines = [];
  for (const file of files) {
    const query = new URLSearchParams({ file: currentFile, groupId, name: file.name });
    let response;
    try {
      response = await fetch(uploadUrl ? uploadUrl(file) : `/api/attachments?${query}`, { method: 'POST', body: file });
    } catch {
      response = null;
    }
    if (!response || !response.ok) {
      const reason = !response ? '通信に失敗しました' : response.status === 413 ? '20MBを超えています' : `HTTP ${response.status}`;
      showToast(`「${file.name}」を添付できませんでした: ${reason}`, { kind: 'error' });
      continue;
    }
    lines.push(`[添付] ${(await response.json()).path}\n`);
  }
  dismiss();
  if (lines.length === 0) return;
  const needsBreak = input.value && !input.value.slice(0, input.selectionStart ?? input.value.length).endsWith('\n');
  insertAtCursor(input, (needsBreak ? '\n' : '') + lines.join(''));
  showToast(`${lines.length}件添付しました`);
}

// Notionの読み物レイアウトに寄せた本文用スタイル。iframe内はviewerのテーマ変数が届かないため固定色で持つ。
const DOC_FRAME_STYLE = `
  ::highlight(viewer-anno) { background-color: #fff3b0; }
  body { margin: 0; background: #fff; color: #37352f; font: 16px/1.75 ui-sans-serif, -apple-system, "Segoe UI", "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", sans-serif; }
  main { max-width: 1000px; margin: 0 auto; padding: 40px 48px 96px; overflow-wrap: anywhere; }
  h1 { font-size: 2em; line-height: 1.25; margin: 0 0 .6em; font-weight: 700; }
  h2 { font-size: 1.5em; line-height: 1.3; margin: 1.8em 0 .4em; font-weight: 600; }
  h3 { font-size: 1.25em; margin: 1.4em 0 .3em; font-weight: 600; }
  p, ul, ol, table, pre, blockquote { margin: .4em 0 .9em; }
  ul, ol { padding-left: 1.6em; }
  li { margin: .15em 0; }
  li:has(> input[type=checkbox]) { list-style: none; margin-left: -1.4em; }
  input[type=checkbox] { margin-right: .5em; accent-color: #2383e2; }
  a { color: inherit; text-decoration: underline; text-decoration-color: rgba(55,53,47,.4); text-underline-offset: 2px; }
  code { font: .85em/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: rgba(135,131,120,.15); color: #eb5757; padding: .15em .4em; border-radius: 4px; }
  pre { background: #f7f6f3; padding: 16px 20px; border-radius: 6px; overflow-x: auto; }
  pre code { background: none; color: #37352f; padding: 0; }
  blockquote { border-left: 3px solid #37352f; padding: 0 0 0 14px; margin-left: 0; }
  table { border-collapse: collapse; width: 100%; font-size: .9em; display: block; overflow-x: auto; }
  th, td { border: 1px solid #e9e9e7; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #f7f6f3; font-weight: 600; }
  hr { border: 0; border-top: 1px solid #e9e9e7; margin: 2em 0; }
  img { max-width: 100%; }
`;

let docFocusReturn = null;
