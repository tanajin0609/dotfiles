function isTypingTarget(element) {
  return element instanceof HTMLElement && (element.matches('input, textarea, select') || element.isContentEditable);
}

// フォーカスモード自体もdialogだが、その上でのショートカット（→・Space等）は効かせる。
function isOverlayOpen() {
  return !!document.querySelector('dialog[open]:not(#focusDialog), :popover-open') || !!openedActionMenu;
}

// 外部更新の自動反映を止める条件。閲覧中心のダイアログは止めず、ボードの列・カードを選ばせるフォームだけ止める
// （選択肢が読み直しで変わると入力途中の選択がずれるため）。
function isEditingFormOpen() {
  return !!document.querySelector('#newCardDialog[open], #inboxMoveDialog[open], #modelSettingsDialog[open], :popover-open') || !!openedActionMenu;
}

// フォーカスが残っているだけのチェックボックス・select・空欄では止めない。
function hasUnsavedText(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  const isTextField = element.matches('textarea') || (element.matches('input') && !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes(element.type));
  return isTextField && element.value.trim() !== '';
}

function findFocusedCard() {
  const slot = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.card-wrap') : null;
  return slot ? slot.querySelector('.group-card') : null;
}

function moveCardFocus(step) {
  const cards = [...document.querySelectorAll('#board .column-wrap:not([hidden]) .group-card')];
  if (cards.length === 0) return;
  const index = cards.indexOf(findFocusedCard());
  const nextIndex = index === -1
    ? (step > 0 ? 0 : cards.length - 1)
    : Math.min(cards.length - 1, Math.max(0, index + step));
  cards[nextIndex].focus();
}

function completeFirstOpenTaskOfFocusedBoardCard() {
  const card = findFocusedCard();
  const found = card ? findGroupById(card.dataset.id) : null;
  if (!found) {
    showToast('カードを選んでから押してください（j / k で選べます）', { key: 'no-focused-card' });
    return;
  }
  completeFirstOpenTask(found.group);
}

function focusSearchInput() {
  const input = document.getElementById('searchInput');
  input.focus();
  input.select();
}

let shortcutDialogFocusReturn = null;

function openShortcutDialog() {
  const dialog = document.getElementById('shortcutDialog');
  if (dialog.open) return;
  shortcutDialogFocusReturn = captureFocusReturn();
  dialog.showModal();
  attachToastRegionToTopmostDialog();
  document.getElementById('shortcutDialogCloseBtn').focus();
}

function formatUsd(usd) {
  return `$${usd.toFixed(2)}`;
}

let sessionListFocusReturn = null;

let managedSessions = [];
let sessionListTimer = null;
const sessionManageView = { ...createSessionLogView('manage', 'sessionManageLog', 'sessionManageReplyInput'), noBranch: true };

function selectedManagedSession() {
  return managedSessions.find((s) => s.jobId === sessionManageView.jobId) || null;
}

function renderSessionList() {
  const container = document.getElementById('sessionListBody');
  const selected = selectedManagedSession();
  document.getElementById('sessionManageReplyBtn').disabled = !selected;
  document.getElementById('sessionManageDeleteBtn').disabled = !selected;
  document.getElementById('sessionManageStopBtn').disabled = !selected || !['working', 'blocked'].includes(selected.state);
  if (!managedSessions.length) {
    container.textContent = 'セッションはありません';
    return;
  }
  container.replaceChildren(...managedSessions.map((s) => {
    const title = s.name || s.jobId;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'session-card';
    row.setAttribute('aria-pressed', String(s.jobId === sessionManageView.jobId));
    const head = document.createElement('span');
    head.className = 'session-card-head';
    const name = document.createElement('span');
    name.className = 'title';
    name.textContent = title;
    head.append(name);
    const state = document.createElement('span');
    state.className = `chip-state ${s.state}`;
    state.append(buildSessionStateMarker(s.state), sessionStatusLabel(s));
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = `${s.launchedAt ? new Date(s.launchedAt).toLocaleString('ja-JP') : '起動日時不明'}　${s.cwd || ''}`;
    row.append(head, state, meta);
    if (s.card) {
      const badge = document.createElement('span');
      badge.className = 'card-badge';
      badge.textContent = `カード: ${s.card.name || s.card.groupId}（${s.card.file}）`;
      row.append(badge);
    }
    row.addEventListener('click', () => openManagedSession(s));
    return row;
  }));
}

function openManagedSession(s) {
  if (!s.card) {
    selectManagedSession(s.jobId);
    return;
  }
  const found = s.card.file === currentFile ? findGroupById(s.card.groupId) : null;
  document.getElementById('sessionListDialog').close();
  if (found) {
    openModal(found.column, found.group);
  } else {
    openSessionLogModal({ name: s.card.file.replace(/\.md$/, '') }, { id: s.card.groupId, title: s.card.name || s.name || s.jobId, session: s });
  }
}

function selectManagedSession(jobId) {
  if (sessionManageView.jobId !== jobId) {
    sessionManageView.renderedKeys = null;
    document.getElementById('sessionManageLog').replaceChildren();
  }
  sessionManageView.jobId = jobId;
  renderSessionList();
  const session = selectedManagedSession();
  if (session) fetchAndRenderSessionLog(sessionManageView, session);
}

async function refreshSessionList() {
  try {
    const res = await fetch('/api/sessions/all');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    managedSessions = data.sessions;
    const cwdInput = document.getElementById('sessionCreateCwd');
    if (!cwdInput.value) cwdInput.value = data.defaultCwd;
  } catch (err) {
    showToast(`セッション一覧の読み込みに失敗しました（${err.message}）`, { kind: 'error', actionLabel: '再試行', onAction: refreshSessionList });
    return false;
  }
  renderSessionList();
  const session = selectedManagedSession();
  if (session) fetchAndRenderSessionLog(sessionManageView, session);
  return true;
}

async function openSessionListDialog() {
  const dialog = document.getElementById('sessionListDialog');
  if (dialog.open) return;
  if (!await refreshSessionList()) return;
  resetLaunchSelects('sessionCreate');
  sessionListFocusReturn = captureFocusReturn();
  dialog.showModal();
  attachToastRegionToTopmostDialog();
  sessionListTimer = setInterval(refreshSessionList, 5000);
}

async function createManagedSession() {
  const input = document.getElementById('sessionCreateInput');
  const text = input.value.trim();
  if (!text) return;
  const cwd = document.getElementById('sessionCreateCwd').value.trim();
  const button = document.getElementById('sessionCreateBtn');
  button.disabled = true;
  const response = await postJson('/api/sessions/create', {
    cwd, name: document.getElementById('sessionCreateName').value.trim(), text, ...readLaunchSelects('sessionCreate'),
  });
  button.disabled = false;
  if (isUntrustedWorkspace(response)) {
    showUntrustedWorkspaceDialog(response.data.cwd, createManagedSession);
    return;
  }
  if (!response.ok) {
    showFailureToast(`セッションの作成に失敗しました: ${formatFailureReason(response)}`, createManagedSession);
    return;
  }
  input.value = '';
  document.getElementById('sessionCreateName').value = '';
  showToast(`セッションを起動しました（id: ${response.data.jobId}）`);
  sessionManageView.jobId = response.data.jobId;
  sessionManageView.renderedKeys = null;
  document.getElementById('sessionManageLog').replaceChildren();
  await refreshSessionList();
}

async function replyManagedSession() {
  const input = document.getElementById('sessionManageReplyInput');
  const text = input.value.trim();
  const session = selectedManagedSession();
  if (!text || !session) return;
  const button = document.getElementById('sessionManageReplyBtn');
  button.disabled = true;
  const response = await postJson('/api/sessions/reply', { jobId: session.jobId, text });
  button.disabled = false;
  if (isUntrustedWorkspace(response)) {
    showUntrustedWorkspaceDialog(response.data.cwd, replyManagedSession);
    return;
  }
  if (!response.ok) {
    showFailureToast(`送信に失敗しました: ${formatFailureReason(response)}`, replyManagedSession);
    return;
  }
  if (!response.data.launched) {
    showToast('このセッションは稼働中です。完了または入力待ちになってから送ってください');
    return;
  }
  input.value = '';
  sessionManageView.jobId = response.data.jobId;
  await refreshSessionList();
}

async function stopOrDeleteManagedSession(action) {
  const session = selectedManagedSession();
  if (!session) return;
  if (action === 'delete' && !confirm(`「${session.name || session.jobId}」を削除しますか？（claude rm。ログも消えます）`)) return;
  const response = await postJson(`/api/sessions/${action}`, { jobId: session.jobId });
  if (!response.ok) {
    showFailureToast(`${action === 'delete' ? '削除' : '停止'}に失敗しました: ${formatFailureReason(response)}`, () => stopOrDeleteManagedSession(action));
    return;
  }
  if (action === 'delete') {
    sessionManageView.jobId = null;
    document.getElementById('sessionManageLog').replaceChildren();
  }
  await refreshSessionList();
}

function formatRateLimitWindow(label, window) {
  if (!window) return null;
  const el = document.createElement('span');
  if (window.resetsAt && window.resetsAt * 1000 <= Date.now()) {
    el.textContent = `${label} リセット済み（未更新）`;
    return el;
  }
  el.className = 'rl-window';
  el.style.setProperty('--pct', String(Math.min(100, Math.max(0, window.usedPercentage))));
  const pct = document.createElement('span');
  pct.className = 'pct';
  pct.textContent = `${Math.round(window.usedPercentage)}%`;
  const reset = window.resetsAt
    ? `（${new Date(window.resetsAt * 1000).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}まで）`
    : '';
  el.append(`${label} `, pct, reset);
  return el;
}

let lastRateLimits = null;
let lastBudgetHintAt = 0;
const BUDGET_HINT_PERCENT = 80;
const BUDGET_HINT_INTERVAL_MS = 10 * 60 * 1000;

// 使い切ると作業中のセッションまで止まるため、使用率が高いときは起動の前に一言だけ出す（起動は止めない）。
function showBudgetHintIfNeeded() {
  const windows = lastRateLimits ? [['5時間', lastRateLimits.fiveHour], ['7日間', lastRateLimits.sevenDay]] : [];
  const hot = windows.find(([, w]) => w && w.usedPercentage >= BUDGET_HINT_PERCENT && !(w.resetsAt && w.resetsAt * 1000 <= Date.now()));
  if (!hot || Date.now() - lastBudgetHintAt < BUDGET_HINT_INTERVAL_MS) return;
  lastBudgetHintAt = Date.now();
  showToast(`${hot[0]}の使用率が ${Math.round(hot[1].usedPercentage)}% です。重いモデルや長い作業は控えめに`, { key: 'budget-hint' });
}

async function refreshRateLimits() {
  const container = document.getElementById('rateLimits');
  let rateLimits = null;
  try {
    const res = await fetch('/api/rate-limits');
    if (res.ok) rateLimits = (await res.json()).rateLimits;
  } catch {
    // 表示は補助情報のため、取得失敗時は前回表示を残す。
    return;
  }
  lastRateLimits = rateLimits;
  const parts = rateLimits
    ? [formatRateLimitWindow('5h', rateLimits.fiveHour), formatRateLimitWindow('7d', rateLimits.sevenDay)].filter(Boolean)
    : [];
  container.replaceChildren(...parts);
  container.hidden = parts.length === 0;
  container.title = rateLimits ? `使用率（${new Date(rateLimits.capturedAt).toLocaleString('ja-JP')} 時点、Claude Codeのステータスラインより）` : '';
}

async function renderModalCost(groupId) {
  const el = document.getElementById('modalCost');
  el.hidden = true;
  try {
    const res = await fetch(`/api/costs/cards?file=${encodeURIComponent(currentFile)}`);
    if (!res.ok) return;
    const cost = (await res.json()).cards[groupId];
    // 取得中に別カードへ切り替わっていたら古い結果は捨てる。
    if (!cost || lastModalGroupId !== groupId) return;
    el.textContent = `コスト（API換算）: ${formatUsd(cost.usd)}`;
    el.hidden = false;
  } catch {
    // 補助情報のため、取得失敗時は表示しないだけに留める。
  }
}

let modelSettingsDialogFocusReturn = null;

function renderGlobalModelSettings(global) {
  const list = document.getElementById('modelSettingsGlobal');
  list.replaceChildren();
  const rows = global
    ? [['model', global.model], ['effortLevel', global.effortLevel],
      ...Object.entries(global.modelSettings || {}).map(([name, s]) => [`${name} の effortLevel`, s && s.effortLevel])]
    : [['状態', 'settings.json を読み込めません']];
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value ?? '（未設定）';
    list.append(dt, dd);
  }
}

let skillsCache = null;
let skillsDialogFocusReturn = null;
let skillsDialogTimer = null;
let skillSessions = [];
const skillLogView = { ...createSessionLogView('skill', 'skillLogList', 'skillRequestInput'), noBranch: true };

async function loadSkills() {
  try {
    const res = await fetch('/api/skills');
    if (res.ok) skillsCache = (await res.json()).skills;
  } catch {
    // 取れなければ候補を出さないだけで、入力自体は妨げない。
  }
  return skillsCache || [];
}

function renderSkillsList() {
  const query = document.getElementById('skillsFilterInput').value.trim().toLowerCase();
  const list = document.getElementById('skillsList');
  const skills = (skillsCache || []).filter((sk) => !query || `${sk.name} ${sk.description}`.toLowerCase().includes(query));
  list.replaceChildren(...skills.map((sk) => {
    const li = document.createElement('li');
    const name = document.createElement('div');
    name.className = 'skill-name';
    name.textContent = `/${sk.name}`;
    const desc = document.createElement('div');
    desc.className = 'skill-desc';
    desc.textContent = sk.description;
    li.title = sk.description;
    li.append(name, desc);
    return li;
  }));
  if (!skills.length) list.textContent = skillsCache && skillsCache.length ? '該当するスキルはありません' : 'スキルはありません';
}

function selectedSkillSession() {
  return skillSessions.find((s) => s.jobId === skillLogView.jobId) || null;
}

function renderSkillSessions() {
  const container = document.getElementById('skillSessionList');
  document.getElementById('skillReplyBtn').disabled = !selectedSkillSession();
  if (!skillSessions.length) {
    container.textContent = 'まだskill作成を依頼していません';
    return;
  }
  container.replaceChildren(...skillSessions.map((s) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'session-card';
    row.setAttribute('aria-pressed', String(s.jobId === skillLogView.jobId));
    const head = document.createElement('span');
    head.className = 'session-card-head';
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = s.text;
    head.append(title);
    const state = document.createElement('span');
    state.className = `chip-state ${s.state}`;
    state.append(buildSessionStateMarker(s.state), sessionStatusLabel(s));
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = s.launchedAt ? new Date(s.launchedAt).toLocaleString('ja-JP') : '起動日時不明';
    row.append(head, state, meta);
    row.addEventListener('click', () => selectSkillSession(s.jobId));
    return row;
  }));
}

function selectSkillSession(jobId) {
  if (skillLogView.jobId !== jobId) {
    skillLogView.renderedKeys = null;
    document.getElementById('skillLogList').replaceChildren();
  }
  skillLogView.jobId = jobId;
  renderSkillSessions();
  const session = selectedSkillSession();
  if (session) fetchAndRenderSessionLog(skillLogView, session);
}

async function refreshSkillSessions() {
  try {
    const res = await fetch('/api/skills/sessions');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    skillSessions = (await res.json()).sessions;
  } catch (err) {
    showToast(`skill作成セッションの読み込みに失敗しました（${err.message}）`, { kind: 'error' });
    return;
  }
  renderSkillSessions();
  const session = selectedSkillSession();
  if (session) fetchAndRenderSessionLog(skillLogView, session);
}

async function openSkillsDialog() {
  const dialog = document.getElementById('skillsDialog');
  if (dialog.open) return;
  skillsDialogFocusReturn = captureFocusReturn();
  dialog.showModal();
  attachToastRegionToTopmostDialog();
  await loadSkills();
  renderSkillsList();
  await refreshSkillSessions();
  skillsDialogTimer = setInterval(refreshSkillSessions, 5000);
}

const TODO_IMPORT_POLL_MS = 5000;
let todoImportPollTimer = null;
let todoImportLastState = null;

const TODO_IMPORT_STATUS_LABELS = { working: '実行中', blocked: '回答待ち', done: '完了', failed: '失敗' };

// stateがnull（未実行・前回分の結果）のときはゲージを出さない。
function renderTodoImportGauge(state) {
  const button = document.getElementById('todoImportBtn');
  const label = TODO_IMPORT_STATUS_LABELS[state];
  if (label) button.dataset.state = state; else delete button.dataset.state;
  document.getElementById('todoImportStatus').textContent = label || '';
  button.setAttribute('aria-busy', String(isTodoImportActive(state)));
}

function isTodoImportActive(state) {
  return state === 'working' || state === 'blocked';
}

async function pollTodoImport() {
  const response = await fetchJson('/api/todo-import');
  const session = response.ok && response.data ? response.data.session : null;
  const state = session ? session.state : null;
  const previous = todoImportLastState;
  todoImportLastState = state;
  renderTodoImportGauge(isTodoImportActive(previous) || isTodoImportActive(state) ? state : null);
  if (isTodoImportActive(previous) && state !== previous) {
    if (state === 'done') {
      const files = await loadFileList();
      if (files.length) await loadBoard(files[0]);
      showToast('todo-importが完了しました');
    } else if (state === 'blocked') {
      showToast('todo-importが回答を待っています（セッション一覧で回答）');
    } else if (state === 'failed') {
      showToast('todo-importが失敗しました', { kind: 'error' });
    }
  }
  if (!isTodoImportActive(state)) {
    clearInterval(todoImportPollTimer);
    todoImportPollTimer = null;
  }
}

function watchTodoImport() {
  // 起動直後はstate.jsonがまだ無いことがあるため、稼働中とみなして完了への遷移を取りこぼさない。
  todoImportLastState = 'working';
  renderTodoImportGauge('working');
  if (!todoImportPollTimer) todoImportPollTimer = setInterval(pollTodoImport, TODO_IMPORT_POLL_MS);
}

// 起動後にページを開き直しても、完了時の最新ファイルへの切り替えを効かせる。
async function resumeTodoImportWatch() {
  const response = await fetchJson('/api/todo-import');
  const state = response.ok && response.data && response.data.session ? response.data.session.state : null;
  if (isTodoImportActive(state)) {
    watchTodoImport();
    todoImportLastState = state;
    renderTodoImportGauge(state);
  }
}

async function startTodoImport() {
  const button = document.getElementById('todoImportBtn');
  button.disabled = true;
  const response = await postJson('/api/todo-import', {});
  button.disabled = false;
  if (isUntrustedWorkspace(response)) {
    showUntrustedWorkspaceDialog(response.data.cwd, startTodoImport);
    return;
  }
  if (!response.ok) {
    showFailureToast(`todo-importの起動に失敗しました: ${formatFailureReason(response)}`, startTodoImport);
    return;
  }
  showToast(response.data.launched ? 'todo-importを開始しました' : 'todo-importは実行中です');
  watchTodoImport();
}

async function createSkill() {
  const input = document.getElementById('skillRequestInput');
  const text = input.value.trim();
  if (!text) return;
  const button = document.getElementById('skillCreateBtn');
  button.disabled = true;
  const response = await postJson('/api/skills/create', { text });
  button.disabled = false;
  if (isUntrustedWorkspace(response)) {
    showUntrustedWorkspaceDialog(response.data.cwd, createSkill);
    return;
  }
  if (!response.ok) {
    showFailureToast(`skill作成の依頼に失敗しました: ${formatFailureReason(response)}`, createSkill);
    return;
  }
  input.value = '';
  showToast(`skill作成セッションを起動しました（id: ${response.data.jobId}）`);
  skillLogView.jobId = response.data.jobId;
  skillLogView.renderedKeys = null;
  await refreshSkillSessions();
}

async function replySkillSession() {
  const input = document.getElementById('skillRequestInput');
  const text = input.value.trim();
  const session = selectedSkillSession();
  if (!text || !session) return;
  const button = document.getElementById('skillReplyBtn');
  button.disabled = true;
  const response = await postJson('/api/skills/reply', { jobId: session.jobId, text });
  button.disabled = false;
  if (!response.ok) {
    showFailureToast(`送信に失敗しました: ${formatFailureReason(response)}`, replySkillSession);
    return;
  }
  if (!response.data.launched) {
    showToast('このセッションは稼働中です。完了または入力待ちになってから送ってください');
    return;
  }
  input.value = '';
  skillLogView.jobId = response.data.jobId;
  await refreshSkillSessions();
}

// 依頼欄で「/」から始まる語を打っている間だけ、スキル名の候補を出す。
const SKILL_SUGGEST_LIMIT = 8;
const skillSuggest = { input: null, items: [], index: 0, replace: null, el: null };

function findSkillQueryAtCaret(input) {
  if (input.tagName === 'TEXTAREA') {
    const before = input.value.slice(0, input.selectionStart);
    const m = before.match(/(?:^|\s)\/([\w:.-]*)$/);
    if (!m || input.selectionStart !== input.selectionEnd) return null;
    const start = input.selectionStart - m[1].length - 1;
    return {
      query: m[1],
      replace: (text) => {
        input.value = input.value.slice(0, start) + text + input.value.slice(input.selectionStart);
        input.setSelectionRange(start + text.length, start + text.length);
      },
      rect: input.getBoundingClientRect(),
    };
  }
  const selection = window.getSelection();
  if (!selection.rangeCount || !selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE || !input.contains(node)) return null;
  const offset = range.startOffset;
  const m = node.data.slice(0, offset).match(/(?:^|[\s​])\/([\w:.-]*)$/);
  if (!m) return null;
  const start = offset - m[1].length - 1;
  const caretRect = range.getBoundingClientRect();
  return {
    query: m[1],
    replace: (text) => {
      node.data = node.data.slice(0, start) + text + node.data.slice(offset);
      const caret = document.createRange();
      caret.setStart(node, start + text.length);
      caret.collapse(true);
      selection.removeAllRanges();
      selection.addRange(caret);
    },
    rect: caretRect.height ? caretRect : input.getBoundingClientRect(),
  };
}

function matchSkills(query) {
  const skills = skillsCache || [];
  const q = query.toLowerCase();
  const prefix = skills.filter((sk) => sk.name.toLowerCase().startsWith(q));
  const matched = prefix.length ? prefix : skills.filter((sk) => sk.name.toLowerCase().includes(q));
  return matched.slice(0, SKILL_SUGGEST_LIMIT);
}

function closeSkillSuggest() {
  if (skillSuggest.el) skillSuggest.el.remove();
  Object.assign(skillSuggest, { input: null, items: [], index: 0, replace: null, el: null });
}

function renderSkillSuggest(rect) {
  const el = skillSuggest.el;
  el.replaceChildren(...skillSuggest.items.map((sk, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(i === skillSuggest.index));
    const name = document.createElement('div');
    name.className = 'skill-name';
    name.textContent = `/${sk.name}`;
    const desc = document.createElement('div');
    desc.className = 'skill-desc';
    desc.textContent = sk.description;
    li.append(name, desc);
    li.addEventListener('mousedown', (e) => e.preventDefault());
    li.addEventListener('click', () => acceptSkillSuggest(i));
    return li;
  }));
  if (!rect) return;
  el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - el.offsetWidth - 8))}px`;
  const below = rect.bottom + 4;
  el.style.top = `${below + el.offsetHeight > window.innerHeight ? Math.max(8, rect.top - el.offsetHeight - 4) : below}px`;
}

function acceptSkillSuggest(index) {
  const skill = skillSuggest.items[index];
  if (skill && skillSuggest.replace) skillSuggest.replace(`/${skill.name} `);
  closeSkillSuggest();
}

async function updateSkillSuggest(input) {
  if (!skillsCache) await loadSkills();
  const found = findSkillQueryAtCaret(input);
  const items = found ? matchSkills(found.query) : [];
  if (!items.length) {
    closeSkillSuggest();
    return;
  }
  if (!skillSuggest.el || skillSuggest.input !== input) {
    closeSkillSuggest();
    const el = document.createElement('ul');
    el.className = 'skill-suggest';
    el.setAttribute('role', 'listbox');
    el.setAttribute('aria-label', 'スキルの候補');
    // dialogはtop layerに出るため、候補も同じdialogの中に置かないと下に隠れる。
    (input.closest('dialog') || document.body).appendChild(el);
    skillSuggest.el = el;
    skillSuggest.input = input;
  }
  skillSuggest.items = items;
  skillSuggest.index = Math.min(skillSuggest.index, items.length - 1);
  skillSuggest.replace = found.replace;
  renderSkillSuggest(found.rect);
}

function setupSkillSuggest() {
  document.addEventListener('input', (e) => {
    if (e.target instanceof HTMLElement && e.target.closest('[data-skill-suggest]')) updateSkillSuggest(e.target.closest('[data-skill-suggest]'));
  }, true);
  // 入力欄自身のEnter送信より先に拾うため、documentのcaptureで処理する。
  document.addEventListener('keydown', (e) => {
    if (!skillSuggest.el || e.isComposing || !skillSuggest.input.contains(e.target)) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const n = skillSuggest.items.length;
      skillSuggest.index = (skillSuggest.index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      renderSkillSuggest(null);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      acceptSkillSuggest(skillSuggest.index);
    } else if (e.key === 'Escape') {
      closeSkillSuggest();
    } else {
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  document.addEventListener('focusout', (e) => {
    if (skillSuggest.input && skillSuggest.input.contains(e.target)) closeSkillSuggest();
  }, true);
}

let launchSettingsOverride = { model: '', effort: '' };

async function loadLaunchSettingsOverride() {
  try {
    const res = await fetch('/api/claude-settings');
    if (res.ok) launchSettingsOverride = (await res.json()).override;
  } catch {
    // 取れなければ「既定」のまま送り、サーバー側で保存済みの設定と同じ扱いになる。
  }
  resetLaunchSelects('modal');
  resetLaunchSelects('sessionLog');
  resetLaunchSelects('chat');
}

function resetLaunchSelects(prefix) {
  const modelSelect = document.getElementById(`${prefix}LaunchModel`);
  const { model, effort } = launchSettingsOverride;
  if (model && ![...modelSelect.options].some((o) => o.value === model)) modelSelect.add(new Option(model, model));
  modelSelect.value = model;
  document.getElementById(`${prefix}LaunchEffort`).value = effort;
}

function readLaunchSelects(prefix) {
  return {
    model: document.getElementById(`${prefix}LaunchModel`).value,
    effort: document.getElementById(`${prefix}LaunchEffort`).value,
  };
}

async function openModelSettingsDialog() {
  const dialog = document.getElementById('modelSettingsDialog');
  if (dialog.open) return;
  try {
    const res = await fetch('/api/claude-settings');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { global, override } = await res.json();
    renderGlobalModelSettings(global);
    document.getElementById('modelSettingsModelInput').value = override.model;
    document.getElementById('modelSettingsEffortSelect').value = override.effort;
  } catch (err) {
    showToast(`モデル設定の読み込みに失敗しました（${err.message}）`, {
      kind: 'error', actionLabel: '再試行', onAction: openModelSettingsDialog,
    });
    return;
  }
  modelSettingsDialogFocusReturn = captureFocusReturn();
  dialog.showModal();
  attachToastRegionToTopmostDialog();
}

async function saveModelSettings() {
  const button = document.getElementById('modelSettingsSubmit');
  button.disabled = true;
  setBusyLabel(button, '保存中…');
  try {
    const res = await fetch('/api/claude-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: document.getElementById('modelSettingsModelInput').value.trim(),
        effort: document.getElementById('modelSettingsEffortSelect').value,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(res.status === 400 ? 'modelの書式が不正です' : `HTTP ${res.status} ${body.error || ''}`);
    }
    showToast('モデル設定を保存しました（次回の起動から反映）');
    loadLaunchSettingsOverride();
  } catch (err) {
    showToast(`モデル設定の保存に失敗しました（${err.message}）`, {
      kind: 'error', actionLabel: '再試行', onAction: saveModelSettings,
    });
  } finally {
    button.disabled = false;
    setBusyLabel(button, null, '保存');
  }
}

const BOARD_SHORTCUT_ACTIONS = {
  j: () => moveCardFocus(1),
  k: () => moveCardFocus(-1),
  x: completeFirstOpenTaskOfFocusedBoardCard,
  '/': focusSearchInput,
  f: toggleFocusMode,
  '?': openShortcutDialog,
};

const FOCUS_MODE_SHORTCUT_ACTIONS = {
  ArrowRight: advanceFocus,
  ' ': completeFirstOpenTaskOfFocusModeCard,
  Escape: exitFocusMode,
  f: exitFocusMode,
  '?': openShortcutDialog,
};

// Enter（カード詳細を開く）とAlt+↑↓はカード自身のkeydownで扱う。
function onShortcutKeydown(e) {
  if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
  if (!boardData || isTypingTarget(e.target) || isOverlayOpen()) return;
  // ボタン上のSpaceはブラウザ標準のボタン押下のままにする（キーボード利用者がボタンを押せなくならないように）。
  if (e.key === ' ' && e.target instanceof HTMLElement && e.target.closest('button')) return;
  const action = (focusMode ? FOCUS_MODE_SHORTCUT_ACTIONS : BOARD_SHORTCUT_ACTIONS)[e.key];
  if (!action) return;
  e.preventDefault();
  action();
}

function bindSubmitShortcut(textarea, submit) {
  textarea.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.isComposing) return;
    e.preventDefault();
    submit();
  });
}

function bindLaunchOnEnter(textarea, launch) {
  textarea.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    e.preventDefault();
    launch();
  });
}
