async function fetchJson(url) {
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

async function loadBoard(file) {
  currentFile = file;
  const status = document.getElementById('status');
  status.textContent = '読込中...';
  const response = await fetchJson(`/api/board?file=${encodeURIComponent(file)}`);
  if (file !== currentFile) return false;
  if (!response.ok) {
    status.textContent = '';
    showBoardLoadError(file, response);
    return false;
  }
  hideBoardLoadError();
  const isSameFile = renderedBoardFile === file;
  boardData = response.data;
  notifyServerWarnings(boardData);
  loadedBoardMtimeMs = boardData.mtimeMs;
  notifiedBoardMtimeMs = null;
  if (dismissBoardUpdatedToast) dismissBoardUpdatedToast();
  applyCardMarks(boardData.cardMarks || {});
  if (!isSameFile) migrateLocalCardMarks(file);
  renderStaleBoardNotice();
  pruneSeenRecords();
  renderAll();
  status.textContent = `最終取得: ${new Date().toLocaleTimeString('ja-JP')}`;
  if (focusMode) {
    if (isSameFile) renderFocusCard();
    else enterFocusMode(focusTarget);
  }
  syncUrlHash();
  return true;
}

function showBoardLoadError(file, response) {
  failedBoardFile = file;
  boardData = null;
  renderedBoardFile = null;
  if (focusMode) exitFocusMode();
  document.getElementById('cardDialog').close();
  document.getElementById('board').innerHTML = '';
  document.getElementById('mainLayout').classList.add('hidden');
  document.getElementById('loadErrorMessage').textContent = `「${file}」を読み込めませんでした: ${formatFailureReason(response)}`;
  const detail = response.data && response.data.detail;
  const detailEl = document.getElementById('loadErrorDetail');
  detailEl.textContent = detail || '';
  detailEl.hidden = !detail;
  document.getElementById('loadError').hidden = false;
}

function hideBoardLoadError() {
  failedBoardFile = null;
  document.getElementById('loadError').hidden = true;
  document.getElementById('mainLayout').classList.remove('hidden');
}

async function fetchBoardMtimeMs(file) {
  const response = await fetchJson(`/api/board/version?file=${encodeURIComponent(file)}`);
  return response.ok && response.data ? response.data.mtimeMs : null;
}

// 自分の書き込み（チェック・タスク/カード追加）でtodo.mdの更新時刻が変わっても、外部更新として通知しないようにする。
// 書き込み完了から時刻の取り直しまでの間に外部で更新された場合は、その変更も既知として扱ってしまう（取り逃しは次の外部更新で解消する）。
async function runOwnBoardWrite(file, operation) {
  ownBoardWriteCount += 1;
  try {
    return await operation();
  } finally {
    if (file === currentFile) {
      const mtimeMs = await fetchBoardMtimeMs(file);
      if (mtimeMs !== null && file === currentFile) loadedBoardMtimeMs = mtimeMs;
    }
    ownBoardWriteCount -= 1;
  }
}

async function detectExternalBoardUpdate() {
  if (!boardData || ownBoardWriteCount > 0) return;
  const file = currentFile;
  const mtimeMs = await fetchBoardMtimeMs(file);
  if (mtimeMs === null || file !== currentFile || !boardData || ownBoardWriteCount > 0) return;
  if (mtimeMs === loadedBoardMtimeMs) return;
  if (!isEditingFormOpen() && !hasUnsavedText(document.activeElement)) {
    if (await loadBoard(file)) refreshOpenCardPanel();
    return;
  }
  if (mtimeMs === notifiedBoardMtimeMs) return;
  notifiedBoardMtimeMs = mtimeMs;
  dismissBoardUpdatedToast = showToast('新しい内容があります', {
    actionLabel: '再読込',
    onAction: () => loadBoard(currentFile),
    key: 'board-updated',
    durationMs: null,
  });
}

// 列単位のピンポイント更新（`column`クエリでその列のみ取得し、APIレスポンスサイズを絞る）。
async function refreshColumn(columnName) {
  let res;
  try {
    res = await fetch('/api/board/sync-column', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: currentFile, column: columnName }),
    });
    if (res.ok) res = await fetch(`/api/board?file=${encodeURIComponent(currentFile)}&column=${encodeURIComponent(columnName)}`);
  } catch {
    res = null;
  }
  if (!res || !res.ok) {
    showFailureToast(`「${columnName}」の再取得に失敗しました`, () => refreshColumn(columnName));
    return;
  }
  const data = await res.json();
  const updated = data.columns[0];
  if (!updated) return;
  const index = boardData.columns.findIndex((c) => c.name === columnName);
  if (index === -1) return;
  boardData.columns[index] = updated;
  renderBoard();
  showToast(`「${columnName}」をbacklog.mdから同期しました`);
}

function countProgress(columns) {
  const groups = columns.flatMap((c) => c.groups);
  const tasks = groups.flatMap((g) => g.tasks);
  return {
    doneGroups: groups.filter((g) => g.done).length,
    totalGroups: groups.length,
    doneTasks: tasks.filter((t) => t.done).length,
    totalTasks: tasks.length,
  };
}

function renderAll() {
  renderHeader();
  renderBoard();
  renderTodayChipCount();
  renderGlobalComments();
}

function renderGlobalComments() {
  const listEl = document.getElementById('globalCommentsList');
  listEl.innerHTML = '';
  const comments = boardData.globalComments || [];
  setCopyAvailability(
    document.getElementById('globalCommentsCopyBtn'),
    document.getElementById('globalCommentsEmptyReason'),
    comments.length > 0,
  );
  if (comments.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const title = document.createElement('div');
    title.className = 'empty-state-title';
    title.textContent = '全体コメントはまだありません';
    const description = document.createElement('div');
    description.textContent = 'カードをまたぐメモを残す場所です。';
    empty.appendChild(title);
    empty.appendChild(description);
    listEl.appendChild(empty);
  }
  for (const comment of comments) {
    const item = document.createElement('div');
    item.className = 'modal-comment';
    const at = document.createElement('div');
    at.className = 'at';
    at.textContent = new Date(comment.at).toLocaleString('ja-JP');
    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = comment.text;
    item.appendChild(at);
    item.appendChild(text);
    listEl.appendChild(item);
  }
}

function showFieldError(input, message) {
  const errorId = `${input.id}Error`;
  let errorEl = document.getElementById(errorId);
  if (!errorEl) {
    errorEl = document.createElement('span');
    errorEl.id = errorId;
    errorEl.className = 'field-error';
    input.after(errorEl);
    input.addEventListener('input', () => clearFieldError(input), { once: true });
  }
  errorEl.textContent = message;
  input.setAttribute('aria-invalid', 'true');
  const describedByIds = (input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
  if (!describedByIds.includes(errorId)) input.setAttribute('aria-describedby', [...describedByIds, errorId].join(' '));
}

function clearFieldError(input) {
  const errorId = `${input.id}Error`;
  const errorEl = document.getElementById(errorId);
  if (errorEl) errorEl.remove();
  input.removeAttribute('aria-invalid');
  const describedByIds = (input.getAttribute('aria-describedby') || '').split(' ').filter((id) => id && id !== errorId);
  if (describedByIds.length > 0) input.setAttribute('aria-describedby', describedByIds.join(' '));
  else input.removeAttribute('aria-describedby');
}

function submitGlobalComment() {
  const input = document.getElementById('globalCommentInput');
  const text = input.value.trim();
  if (!text) {
    showFieldError(input, 'コメントを入力してください');
    input.focus();
    return;
  }
  addGlobalComment(currentFile, text);
}

async function addGlobalComment(file, text) {
  const response = await postJson('/api/comments/global', { file, text });
  if (!response.ok) {
    showFailureToast(`全体コメントの追加に失敗しました: ${formatFailureReason(response)}`, () => addGlobalComment(file, text));
    return;
  }
  if (file !== currentFile) return;
  boardData.globalComments = response.data.comments;
  const input = document.getElementById('globalCommentInput');
  if (input.value.trim() === text) input.value = '';
  renderGlobalComments();
}

async function copyGlobalComments() {
  const comments = boardData.globalComments || [];
  if (comments.length === 0) {
    showToast('コピーできる全体コメントがありません');
    return;
  }
  const text = `# 全体コメント\n\n${comments.map((c) => `- ${c.text}`).join('\n')}`;
  try {
    await navigator.clipboard.writeText(text);
    showToast('クリップボードにコピーしました（全体コメント）');
  } catch {
    showToast('コピーに失敗しました', { kind: 'error' });
  }
}

let newCardDialogFocusReturn = null;

function openNewCardDialog() {
  const dialog = document.getElementById('newCardDialog');
  if (dialog.open) return;
  newCardDialogFocusReturn = captureFocusReturn();
  clearFieldError(document.getElementById('newCardColumnInput'));
  clearFieldError(document.getElementById('newCardTextInput'));
  dialog.showModal();
  attachToastRegionToTopmostDialog();
}

let globalCommentsDialogFocusReturn = null;

function openGlobalCommentsDialog() {
  const dialog = document.getElementById('globalCommentsDialog');
  if (!dialog.open) {
    globalCommentsDialogFocusReturn = captureFocusReturn();
    clearFieldError(document.getElementById('globalCommentInput'));
    dialog.showModal();
    attachToastRegionToTopmostDialog();
  }
}

function submitNewCard() {
  const columnInput = document.getElementById('newCardColumnInput');
  const textInput = document.getElementById('newCardTextInput');
  const columnName = columnInput.value.trim();
  const text = textInput.value.trim();
  if (!columnName) showFieldError(columnInput, '列（プロジェクト）を入力してください');
  if (!text) showFieldError(textInput, '内容を入力してください');
  if (!columnName || !text) {
    (columnName ? textInput : columnInput).focus();
    return;
  }
  const backlogField = document.getElementById('newCardBacklogField');
  const backlogPath = backlogField.hidden ? undefined : document.getElementById('newCardBacklogSelect').value;
  const createProject = document.getElementById('newCardProjectField').hidden
    ? undefined
    : { subName: document.getElementById('newCardSubNameInput').value.trim() };
  addCard(currentFile, columnName, text, backlogPath, createProject);
}

// 列ディレクトリ配下に backlog.md が複数あるときだけ、書き込み先の選択欄を出す。
async function refreshNewCardBacklogTargets() {
  const columnName = document.getElementById('newCardColumnInput').value.trim();
  const response = columnName ? await fetchJson(`/api/backlog-targets?column=${encodeURIComponent(columnName)}`) : null;
  if (columnName !== document.getElementById('newCardColumnInput').value.trim()) return;
  const targets = response && response.ok ? response.data.targets : [];
  const select = document.getElementById('newCardBacklogSelect');
  select.innerHTML = '';
  const labels = response && response.ok ? response.data.labels : [];
  for (const [i, target] of targets.entries()) {
    const option = document.createElement('option');
    option.value = target;
    option.textContent = labels[i];
    select.appendChild(option);
  }
  document.getElementById('newCardBacklogField').hidden = targets.length < 2;
  document.getElementById('newCardProjectField').hidden = !(columnName && response && response.ok && targets.length === 0);
}

async function addCard(file, columnName, text, backlogPath, createProject) {
  const response = await runOwnBoardWrite(file, () => postJson('/api/cards', { file, columnName, text, backlogPath, createProject }));
  if (!response.ok) {
    showFailureToast(`カード追加に失敗しました: ${formatFailureReason(response)}`, () => addCard(file, columnName, text, backlogPath, createProject));
    return;
  }
  if (createProject) {
    document.getElementById('newCardSubNameInput').value = '';
    refreshNewCardBacklogTargets();
  }
  const textInput = document.getElementById('newCardTextInput');
  if (textInput.value.trim() === text) textInput.value = '';
  if (response.data.mirroredToAggregate) {
    if (file === currentFile) await loadBoard(currentFile);
    showToast('カードを追加しました');
  } else {
    showToast('元のtodo.mdにカードを追加しました（このボードへの反映は次回のtodo-import実行後になります）');
  }
}

function renderHeader() {
  document.getElementById('dateBadge').textContent = boardData.date || '';

  const progress = countProgress(boardData.columns);
  const strip = document.getElementById('todayStrip');
  strip.innerHTML = '';
  for (let i = 0; i < progress.totalGroups; i++) {
    const seg = document.createElement('span');
    seg.style.background = i < progress.doneGroups ? 'var(--accent)' : 'var(--track)';
    strip.appendChild(seg);
  }
  document.getElementById('todayRatio').textContent = `${progress.doneGroups} / ${progress.totalGroups}`;
  document.getElementById('todayTaskRatio').textContent = `${progress.doneTasks} / ${progress.totalTasks}`;
  const todayPct = progress.totalGroups ? Math.round((progress.doneGroups / progress.totalGroups) * 100) : 0;
  document.getElementById('brandMark').style.setProperty('--today-pct', String(todayPct));

  renderHistoryGraph(boardData.history || []);
}

function renderHistoryGraph(history) {
  const bars = document.getElementById('historyBars');
  bars.innerHTML = '';
  const max = Math.max(1, ...history.map((h) => h.done));
  history.forEach((h, i) => {
    const bar = document.createElement('span');
    const isLast = i === history.length - 1;
    const heightPct = h.done > 0 ? Math.max(12, Math.round((h.done / max) * 100)) : 10;
    bar.style.height = `${heightPct}%`;
    bar.style.background = isLast || h.done > 0 ? 'var(--accent)' : 'var(--track)';
    bars.appendChild(bar);
  });

  const list = document.getElementById('historyList');
  list.innerHTML = '';
  history.forEach((h, i) => {
    const item = document.createElement('li');
    item.classList.toggle('today', i === history.length - 1);
    const date = document.createElement('span');
    date.textContent = shortDate(h.date);
    const count = document.createElement('span');
    count.textContent = `${h.done} / ${h.total} 完了`;
    item.appendChild(date);
    item.appendChild(count);
    list.appendChild(item);
  });
}

function placePopoverBelow(popover, anchorEl) {
  const anchor = anchorEl.getBoundingClientRect();
  // 開く前（beforetoggle）は未表示で幅が測れないため、leftではなくrightで揃える。
  popover.style.top = `${anchor.bottom + 6}px`;
  popover.style.right = `${Math.max(8, document.documentElement.clientWidth - anchor.right)}px`;
}

// タスク本文は backlog・Notion・Claude が書いた文字列なので、生のHTMLと javascript: などのリンクは無害化して描く。
// ドキュメント表示（sandbox付きiframe）とは別インスタンスにし、そちらの描画は変えない。
const UNSAFE_HREF = /^\s*(javascript|vbscript|data):/i;
const inlineMarked = typeof marked === 'undefined' ? null : new marked.Marked({
  // CDNの `marked@13` は13系の最新に解決され、レンダラーの引数が位置引数（13.0）とトークン（新しい版）のどちらでも来うる。
  renderer: {
    html(arg) {
      return escapeHtml(String(typeof arg === 'string' ? arg : arg.text));
    },
    link(arg, oldTitle, oldText) {
      const isToken = typeof arg === 'object';
      const href = String((isToken ? arg.href : arg) || '');
      const title = isToken ? arg.title : oldTitle;
      const label = isToken ? this.parser.parseInline(arg.tokens) : oldText;
      if (UNSAFE_HREF.test(href)) return label;
      return `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ''}>${label}</a>`;
    },
  },
});

function plainTextFromMarkdown(markdown) {
  // markedはCDN読み込みのため、取得に失敗しても列見出しの描画は止めずに原文を出す。
  if (!inlineMarked) return markdown;
  const scratch = document.createElement('template');
  scratch.innerHTML = inlineMarked.parseInline(markdown);
  return scratch.content.textContent;
}

// markedはCDN読み込みのため、取得に失敗してもカード詳細・フォーカスモードが開けるよう原文を出す。
function renderInlineMarkdown(element, markdown) {
  if (!inlineMarked) {
    element.textContent = markdown;
    return;
  }
  element.innerHTML = inlineMarked.parseInline(markdown);
}

// todo-importが本文末尾に付ける「 → <元todo.mdの絶対パス>」（後ろにnotionコメントが続くことがある）。
// 本文途中の「→ docs/…」のような相対パスは本文の一部なので外さない。
const TASK_SOURCE_SUFFIX_PATTERN = /\s*→\s*(\/\S+)\s*(?:<!--[^>]*-->\s*)?$/;

function splitTaskSource(text) {
  const match = text.match(TASK_SOURCE_SUFFIX_PATTERN);
  if (!match) return { body: text, sourcePath: null };
  return { body: text.slice(0, match.index), sourcePath: match[1] };
}

function summarizeColumn(column) {
  const progress = countProgress([column]);
  const sessionStates = column.groups.map((g) => { const s = representativeSessionOf(g); return s && s.state; });
  const firstOpenTask = column.groups
    .filter((g) => !g.done)
    .flatMap((g) => g.tasks)
    .find((t) => !t.done);
  return {
    doneTasks: progress.doneTasks,
    totalTasks: progress.totalTasks,
    workingCount: sessionStates.filter((s) => s === 'working').length,
    blockedCount: sessionStates.filter((s) => s === 'blocked').length,
    commentCount: column.groups.reduce((n, g) => n + (g.comments ? g.comments.length : 0), 0),
    firstOpenTask,
    isAllDone: column.groups.length > 0 && column.groups.every((g) => g.done),
  };
}

const BOARD_FILTERS = {
  incomplete: (group) => !group.done,
  commented: (group) => !!(group.comments && group.comments.length > 0),
  working: (group) => { const s = representativeSessionOf(group); return !!s && s.state === 'working'; },
  blocked: (group) => { const s = representativeSessionOf(group); return !!s && s.state === 'blocked'; },
  unread: (group) => unreadMarksOf(group).length > 0,
  statusToday: (group) => !group.done && statusOf(group) === 'today',
  statusNone: (group) => !group.done && statusOf(group) === '',
  statusHold: (group) => !group.done && statusOf(group) === 'hold',
};

function isBoardFilterActive() {
  return searchQuery !== '' || activeFilterIds.size > 0;
}

function findSearchMatch(group) {
  if (!searchQuery || group.title.toLowerCase().includes(searchQuery)) return { matchedTaskText: null };
  const matchedTaskText = group.tasks
    .map((t) => plainTextFromMarkdown(splitTaskSource(t.text).body))
    .find((text) => text.toLowerCase().includes(searchQuery));
  return matchedTaskText ? { matchedTaskText } : null;
}

function listVisibleGroupMatches(column) {
  return column.groups.flatMap((group) => {
    if (![...activeFilterIds].every((id) => BOARD_FILTERS[id](group))) return [];
    const match = findSearchMatch(group);
    return match ? [{ group, matchedTaskText: match.matchedTaskText }] : [];
  });
}

function updateBoardFilter(applyChange) {
  const wasFiltering = isBoardFilterActive();
  applyChange();
  renderFilterChips();
  if (!boardData || (!wasFiltering && !isBoardFilterActive())) return;
  renderBoard();
}

function renderFilterChips() {
  for (const chip of document.querySelectorAll('#filterChips .chip')) {
    const filterId = chip.dataset.filterId;
    chip.setAttribute('aria-pressed', String(activeFilterIds.has(filterId)));
  }
}

function appendHighlightedText(parent, text) {
  if (!searchQuery) {
    parent.append(text);
    return;
  }
  const lowerText = text.toLowerCase();
  let from = 0;
  for (let at = lowerText.indexOf(searchQuery); at !== -1; at = lowerText.indexOf(searchQuery, from)) {
    parent.append(text.slice(from, at));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(at, at + searchQuery.length);
    parent.appendChild(mark);
    from = at + searchQuery.length;
  }
  parent.append(text.slice(from));
}

function buildColumnHeader(column, colIndex) {
  const header = document.createElement('div');
  header.className = 'column-header';
  const stats = summarizeColumn(column);
  const describedByIds = [];

  const titleRow = document.createElement('span');
  titleRow.className = 'column-title-row';
  const dot = document.createElement('span');
  dot.className = 'dot';
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = column.name;
  const count = document.createElement('span');
  count.className = 'column-count';
  count.textContent = String(column.groups.length);
  titleRow.appendChild(dot);
  titleRow.appendChild(name);
  titleRow.appendChild(count);
  if (stats.isAllDone) {
    const doneBadge = document.createElement('span');
    doneBadge.className = 'column-done-badge';
    doneBadge.id = `col-${colIndex}-done`;
    doneBadge.textContent = '✓ 完了';
    titleRow.appendChild(doneBadge);
    describedByIds.push(doneBadge.id);
  }
  const favoriteBtn = document.createElement('button');
  favoriteBtn.type = 'button';
  favoriteBtn.className = 'btn btn-icon btn--sm column-favorite-btn';
  favoriteBtn.dataset.focusKey = `column-favorite:${column.name}`;
  favoriteBtn.textContent = column.favorite ? '★' : '☆';
  favoriteBtn.setAttribute('aria-pressed', String(Boolean(column.favorite)));
  favoriteBtn.setAttribute('aria-label', column.favorite ? `${column.name} をお気に入りから外す` : `${column.name} をお気に入りに追加`);
  favoriteBtn.addEventListener('click', () => toggleColumnFavorite(column));
  titleRow.appendChild(favoriteBtn);
  header.appendChild(titleRow);

  const statsRow = document.createElement('span');
  statsRow.className = 'column-stats';
  statsRow.id = `col-${colIndex}-stats`;
  describedByIds.push(statsRow.id);
  const progress = document.createElement('span');
  progress.className = 'column-progress';
  const bar = document.createElement('span');
  bar.className = 'bar';
  bar.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('span');
  fill.style.width = `${stats.totalTasks > 0 ? Math.round((stats.doneTasks / stats.totalTasks) * 100) : 0}%`;
  bar.appendChild(fill);
  const progressText = document.createElement('span');
  progressText.textContent = `タスク ${stats.doneTasks}/${stats.totalTasks}`;
  progress.appendChild(bar);
  progress.appendChild(progressText);
  statsRow.appendChild(progress);
  const sessionCounts = [
    { state: 'working', count: stats.workingCount },
    { state: 'blocked', count: stats.blockedCount },
  ];
  for (const { state, count: sessionCount } of sessionCounts) {
    if (sessionCount === 0) continue;
    const stat = document.createElement('span');
    stat.className = `column-stat ${state}`;
    stat.appendChild(buildSessionStateMarker(state));
    stat.append(`${sessionStatusLabel({ state })} ${sessionCount}`);
    statsRow.appendChild(stat);
  }
  if (stats.commentCount > 0) {
    const commentStat = document.createElement('span');
    commentStat.className = 'column-stat';
    commentStat.textContent = `コメント ${stats.commentCount}`;
    statsRow.appendChild(commentStat);
  }
  header.appendChild(statsRow);

  if (stats.firstOpenTask) {
    const next = document.createElement('span');
    next.className = 'column-next';
    next.id = `col-${colIndex}-next`;
    next.textContent = `次: ${plainTextFromMarkdown(splitTaskSource(stats.firstOpenTask.text).body)}`;
    header.appendChild(next);
    describedByIds.push(next.id);
  }
  return { header, describedBy: describedByIds.join(' ') };
}

function buildColumnMenuItems(column) {
  return [
    {
      label: 'この列のコメントをまとめてコピー',
      ariaLabel: `${column.name} のコメントをまとめてコピー`,
      disabledReason: countCardComments(column.groups) === 0 ? 'コメントがありません' : null,
      onSelect: () => copyPrompt(column.name, column.groups.map((g) => ({ column: column.name, group: g }))),
    },
  ];
}

function buildActionMenu(menuId, menuLabel, items) {
  const menu = document.createElement('div');
  menu.className = 'column-menu';
  menu.id = menuId;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', menuLabel);
  menu.hidden = true;
  for (const item of items) {
    const itemBtn = document.createElement('button');
    itemBtn.type = 'button';
    itemBtn.className = 'column-menu-item';
    itemBtn.setAttribute('role', 'menuitem');
    itemBtn.tabIndex = -1;
    itemBtn.textContent = item.label;
    itemBtn.setAttribute('aria-label', item.ariaLabel);
    if (item.disabledReason) {
      itemBtn.disabled = true;
      const note = document.createElement('span');
      note.className = 'menu-item-note';
      note.textContent = item.disabledReason;
      itemBtn.appendChild(note);
      itemBtn.setAttribute('aria-label', `${item.ariaLabel}（${item.disabledReason}）`);
    }
    itemBtn.addEventListener('click', () => {
      closeActionMenu(true);
      item.onSelect();
    });
    menu.appendChild(itemBtn);
  }
  menu.addEventListener('keydown', onActionMenuKeydown);
  return menu;
}

function buildActionMenuButton(menu) {
  const menuBtn = document.createElement('button');
  menuBtn.type = 'button';
  menuBtn.className = 'btn btn-icon btn--sm';
  menuBtn.textContent = '…';
  menuBtn.setAttribute('aria-label', menu.getAttribute('aria-label'));
  menuBtn.setAttribute('aria-haspopup', 'menu');
  menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.setAttribute('aria-controls', menu.id);
  menuBtn.addEventListener('click', () => {
    if (openedActionMenu && openedActionMenu.menu === menu) closeActionMenu(false);
    else openActionMenu(menuBtn, menu);
  });
  return menuBtn;
}

function buildColumnActions(column, colIndex) {
  const actions = document.createElement('div');
  actions.className = 'column-actions';
  const menu = buildActionMenu(`col-${colIndex}-menu`, `${column.name} の操作`, buildColumnMenuItems(column));
  const menuBtn = buildActionMenuButton(menu);
  menuBtn.dataset.focusKey = `column-menu:${column.name}`;

  const newCardBtn = document.createElement('button');
  newCardBtn.type = 'button';
  newCardBtn.className = 'btn btn-icon btn--sm';
  newCardBtn.textContent = '+';
  newCardBtn.setAttribute('aria-label', `${column.name} にカードを追加`);
  newCardBtn.dataset.tip = '新規カードを追加';
  newCardBtn.addEventListener('click', () => {
    openNewCardDialog();
    document.getElementById('newCardColumnInput').value = column.name;
    refreshNewCardBacklogTargets();
    document.getElementById('newCardTextInput').focus();
  });

  const refreshBtn = buildIconButton('reload', `${column.name} の列を再取得`, 'sm');
  refreshBtn.dataset.tip = '列を再取得';
  refreshBtn.dataset.focusKey = `column-refresh:${column.name}`;
  refreshBtn.addEventListener('click', () => refreshColumn(column.name));

  actions.appendChild(refreshBtn);
  actions.appendChild(menuBtn);
  actions.appendChild(newCardBtn);
  actions.appendChild(menu);
  return actions;
}

const ACTION_MENU_HOST_SELECTOR = '.card-wrap, .column-wrap';

function openActionMenu(button, menu) {
  closeActionMenu(false);
  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  button.closest(ACTION_MENU_HOST_SELECTOR).classList.add('is-menu-open');
  openedActionMenu = { button, menu };
  menu.querySelector('[role="menuitem"]:not(:disabled)').focus();
}

function closeActionMenu(shouldRestoreFocus) {
  if (!openedActionMenu) return;
  const { button, menu } = openedActionMenu;
  openedActionMenu = null;
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  button.closest(ACTION_MENU_HOST_SELECTOR).classList.remove('is-menu-open');
  if (shouldRestoreFocus && button.isConnected) button.focus();
}

function captureOpenedActionMenu() {
  if (!openedActionMenu) return null;
  const items = [...openedActionMenu.menu.querySelectorAll('[role="menuitem"]')];
  return { buttonFocusKey: openedActionMenu.button.dataset.focusKey, focusedItemIndex: items.indexOf(document.activeElement) };
}

function reopenActionMenu(openedMenuSnapshot) {
  const button = openedMenuSnapshot ? findElementByFocusKey(openedMenuSnapshot.buttonFocusKey) : null;
  if (!button || button.getClientRects().length === 0) return false;
  openActionMenu(button, document.getElementById(button.getAttribute('aria-controls')));
  const item = openedActionMenu.menu.querySelectorAll('[role="menuitem"]')[openedMenuSnapshot.focusedItemIndex];
  if (item && !item.disabled) item.focus();
  return true;
}

function onActionMenuKeydown(e) {
  const items = [...e.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)')];
  const index = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    items[(index + 1) % items.length].focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    items[(index - 1 + items.length) % items.length].focus();
  } else if (e.key === 'Home') {
    e.preventDefault();
    items[0].focus();
  } else if (e.key === 'End') {
    e.preventDefault();
    items[items.length - 1].focus();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeActionMenu(true);
  } else if (e.key === 'Tab') {
    closeActionMenu(false);
  }
}

function renderBoard() {
  const board = document.getElementById('board');
  const openFound = document.getElementById('cardDialog').open && findGroupById(lastModalGroupId);
  if (openFound) markGroupsSeen([openFound.group]);
  const { focusKey: focusedKey } = captureFocusReturn();
  const openedMenuSnapshot = captureOpenedActionMenu();
  closeActionMenu(false);
  const isFiltering = isBoardFilterActive();
  let visibleColumnCount = 0;
  board.innerHTML = '';
  boardData.columns.forEach((column, colIndex) => {
    const visibleMatches = listVisibleGroupMatches(column);
    const wrap = document.createElement('div');
    wrap.className = 'column-wrap';
    wrap.hidden = isFiltering && visibleMatches.length === 0;
    if (!wrap.hidden) visibleColumnCount += 1;
    applyColumnHue(wrap, column.name);

    const columnEl = document.createElement('section');
    columnEl.className = 'column';
    columnEl.dataset.column = column.name;
    columnEl.id = `col-${colIndex}`;
    columnEl.setAttribute('role', 'group');
    columnEl.setAttribute('aria-label', `${column.name} ${column.groups.length}件`);
    const { header, describedBy } = buildColumnHeader(column, colIndex);
    columnEl.setAttribute('aria-describedby', describedBy);
    header.draggable = true;
    header.addEventListener('dragstart', (e) => {
      draggingColumnName = column.name;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', column.name);
      wrap.classList.add('column-dragging');
    });
    header.addEventListener('dragend', () => {
      draggingColumnName = null;
      wrap.classList.remove('column-dragging');
    });
    columnEl.appendChild(header);

    const openMatches = visibleMatches.filter((m) => !m.group.done && statusOf(m.group) !== 'hold');
    const holdMatches = visibleMatches.filter((m) => !m.group.done && statusOf(m.group) === 'hold');
    const closedMatches = visibleMatches.filter((m) => m.group.done);
    const closedGroups = closedMatches.map((m) => m.group);

    const list = document.createElement('div');
    list.className = 'task-list';
    list.addEventListener('dragover', onDragOver);
    list.addEventListener('drop', onDrop);
    appendCardSections(list, column, openMatches, true);
    columnEl.appendChild(list);

    if (holdMatches.length > 0) {
      const holdSection = document.createElement('details');
      holdSection.className = 'closed-section hold-section';
      holdSection.open = openHoldColumns.has(column.name);
      holdSection.addEventListener('toggle', () => {
        if (holdSection.open) openHoldColumns.add(column.name); else openHoldColumns.delete(column.name);
      });
      const holdHeader = document.createElement('summary');
      holdHeader.className = 'closed-header';
      holdHeader.textContent = `保留（${holdMatches.length}）`;
      holdSection.appendChild(holdHeader);
      const holdList = document.createElement('div');
      holdList.className = 'closed-list';
      appendCardSections(holdList, column, holdMatches, false);
      holdSection.appendChild(holdList);
      columnEl.appendChild(holdSection);
    }

    if (closedGroups.length > 0) {
      const closedSection = document.createElement('div');
      closedSection.className = 'closed-section';
      const closedHeader = document.createElement('div');
      closedHeader.className = 'closed-header';
      closedHeader.textContent = `完了（${closedGroups.length}）`;
      closedSection.appendChild(closedHeader);
      const closedList = document.createElement('div');
      closedList.className = 'closed-list';
      appendCardSections(closedList, column, closedMatches, false);
      closedSection.appendChild(closedList);
      columnEl.appendChild(closedSection);
    }

    wrap.appendChild(columnEl);
    wrap.appendChild(buildColumnActions(column, colIndex));
    board.appendChild(wrap);
  });
  renderedBoardFile = currentFile;
  document.getElementById('boardFilterEmpty').hidden = !(isFiltering && visibleColumnCount === 0);
  populateFocusColumnSelect();
  populateNewCardColumnOptions();
  renderBlockedCountBadge(boardData.columns.flatMap((c) => c.groups).filter((g) => { const s = representativeSessionOf(g); return !!s && s.state === 'blocked'; }).length);
  renderFlowPanel();
  setCopyAvailability(
    document.getElementById('shareAllBtn'),
    document.getElementById('shareAllEmptyReason'),
    countCardComments(boardData.columns.flatMap((c) => c.groups)) > 0,
  );
  if (!reopenActionMenu(openedMenuSnapshot)) {
    const focusedElement = findElementByFocusKey(focusedKey);
    if (focusedElement && document.activeElement !== focusedElement) focusedElement.focus({ preventScroll: true });
  }
  syncUrlHash();
}

function populateFocusColumnSelect() {
  const select = document.getElementById('focusColumnSelect');
  const prev = select.value;
  select.innerHTML = '';
  const columnGroup = document.createElement('optgroup');
  columnGroup.label = '列';
  for (const column of boardData.columns) {
    columnGroup.appendChild(new Option(column.name, FOCUS_TARGET_COLUMN_PREFIX + column.name));
  }
  const crossGroup = document.createElement('optgroup');
  crossGroup.label = '列をまたいで';
  crossGroup.appendChild(new Option('全列の未完了', FOCUS_TARGET_ALL_OPEN));
  crossGroup.appendChild(new Option('★を付けたカード', FOCUS_TARGET_STARRED));
  crossGroup.appendChild(new Option('今日やるのカード', FOCUS_TARGET_TODAY));
  select.appendChild(columnGroup);
  select.appendChild(crossGroup);
  if (prev && [...select.options].some((o) => o.value === prev)) select.value = prev;
  else select.value = countOpenTodayCards() > 0 ? FOCUS_TARGET_TODAY : FOCUS_TARGET_ALL_OPEN;
}

function countOpenTodayCards() {
  return boardData.columns.flatMap((c) => c.groups).filter((g) => !g.done && statusOf(g) === 'today').length;
}

function renderTodayChipCount() {
  const count = countOpenTodayCards();
  document.querySelector('[data-filter-id="statusToday"]').textContent = count > 0 ? `今日やる（${count}）` : '今日やる';
}

function populateNewCardColumnOptions() {
  const datalist = document.getElementById('newCardColumnOptions');
  datalist.innerHTML = boardData.columns.map((c) => `<option value="${escapeHtml(c.name)}">`).join('');
}

function toggleFocusMode() {
  if (focusMode) exitFocusMode(); else enterFocusMode();
}

// 戻り値nullは、対象がこのボードに存在しない（列が無い・値が不正）ことを表す。
function listFocusTargetEntries(target) {
  if (!boardData || !target) return null;
  const entries = boardData.columns.flatMap((column) => column.groups.map((group) => ({ column, group })));
  if (target === FOCUS_TARGET_ALL_OPEN) return entries;
  if (target === FOCUS_TARGET_STARRED) return entries.filter((e) => starredGroupIds.has(e.group.id));
  if (target === FOCUS_TARGET_TODAY) return entries.filter((e) => statusOf(e.group) === 'today');
  if (!target.startsWith(FOCUS_TARGET_COLUMN_PREFIX)) return null;
  const columnName = target.slice(FOCUS_TARGET_COLUMN_PREFIX.length);
  if (!boardData.columns.some((c) => c.name === columnName)) return null;
  return entries.filter((e) => e.column.name === columnName);
}

function enterFocusMode(target = document.getElementById('focusColumnSelect').value) {
  const entries = listFocusTargetEntries(target);
  if (!entries) {
    if (focusMode) exitFocusMode();
    return false;
  }
  document.getElementById('focusColumnSelect').value = target;
  focusTarget = target;
  focusQueueIds = entries.filter((e) => !e.group.done).map((e) => e.group.id);
  focusIndex = 0;
  focusMode = true;
  const dialog = document.getElementById('focusDialog');
  if (!dialog.open) dialog.showModal();
  attachToastRegionToTopmostDialog();
  document.getElementById('focusModeBtn').setAttribute('aria-pressed', 'true');
  setButtonLabel(document.getElementById('focusModeBtn'), 'カンバンに戻る');
  renderFocusCard();
  moveFocusIntoFocusPanel();
  syncUrlHash();
  return true;
}

function exitFocusMode() {
  const wasFocusInPanel = document.getElementById('focusPanel').contains(document.activeElement);
  focusMode = false;
  document.getElementById('focusDialog').close();
  attachToastRegionToTopmostDialog();
  document.getElementById('focusModeBtn').setAttribute('aria-pressed', 'false');
  setButtonLabel(document.getElementById('focusModeBtn'), 'フォーカス');
  if (wasFocusInPanel) document.getElementById('focusModeBtn').focus();
  syncUrlHash();
}

// ボタン以外（カード本体か終了画面）にフォーカスを置き、Spaceがボタンの押下ではなくチェックとして届くようにする。
function moveFocusIntoFocusPanel() {
  const endEl = document.getElementById('focusEmpty');
  (endEl.classList.contains('hidden') ? document.getElementById('focusCard') : endEl).focus();
}
