function allBoardGroups() {
  return boardData ? boardData.columns.flatMap((c) => c.groups) : [];
}

function markGroupsSeen(groups) {
  seenRecords = seenRecords || {};
  for (const group of groups) {
    seenRecords[group.id] = { tasks: group.tasks.map((t) => t.id), session: respondedSessionSignature(group) };
  }
  saveSeenRecords();
}

function pruneSeenRecords() {
  const groups = allBoardGroups();
  if (!seenRecords) {
    markGroupsSeen(groups);
    return;
  }
  const ids = new Set(groups.map((g) => g.id));
  for (const id of Object.keys(seenRecords)) if (!ids.has(id)) delete seenRecords[id];
  saveSeenRecords();
}

function unreadMarksOf(group) {
  if (!seenRecords) return [];
  const seen = seenRecords[group.id];
  if (!seen) return [{ kind: 'new', label: '新規' }];
  const marks = [];
  const seenTaskIds = new Set(seen.tasks);
  const newTaskCount = group.tasks.filter((t) => !t.done && !seenTaskIds.has(t.id)).length;
  if (newTaskCount > 0) marks.push({ kind: 'tasks', label: `+${newTaskCount} タスク` });
  const signature = respondedSessionSignature(group);
  if (signature && signature !== seen.session) {
    marks.push({ kind: 'session', label: '応答' });
  }
  return marks;
}

function markAllSeen() {
  markGroupsSeen(allBoardGroups());
  renderBoard();
}

function splitGroupTitle(title) {
  const separator = ' ▸ ';
  const index = title.indexOf(separator);
  if (index === -1) return { parent: '', main: title };
  return { parent: title.slice(0, index), main: title.slice(index + separator.length) };
}

function clusterMatchesByParent(matches) {
  const sections = new Map();
  for (const m of matches) {
    const { parent } = splitGroupTitle(m.group.title);
    if (!sections.has(parent)) sections.set(parent, { parent, matches: [] });
    sections.get(parent).matches.push(m);
  }
  return [...sections.values()];
}

// 並べ替えは小見出しの中に限るため、上へ・下への可否も小見出し内の位置で決める。
function appendCardSections(list, column, matches, isReorderable) {
  for (const { parent, matches: sectionMatches } of clusterMatchesByParent(matches)) {
    if (parent) {
      const heading = document.createElement('div');
      heading.className = 'subproject-heading';
      heading.textContent = parent;
      list.appendChild(heading);
    }
    sectionMatches.forEach(({ group, matchedTaskText }, index) => {
      const orderPosition = isReorderable && sectionMatches.length >= 2 ? { index, count: sectionMatches.length } : null;
      list.appendChild(makeCard(column, group, { matchedTaskText, orderPosition, isUnderHeading: !!parent }));
    });
  }
}

// 「今日やる」「保留」「★」はカードIDごとにサーバーへ保存し、日をまたいでも別のブラウザでも同じにする。
function applyCardMarks(marks) {
  starredGroupIds = new Set(Object.keys(marks).filter((id) => marks[id].starred));
  groupStatuses = Object.fromEntries(Object.entries(marks).filter(([, m]) => m.status).map(([id, m]) => [id, m.status]));
}

function readLocalJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

// 以前はブラウザにだけ保存していたため、残っている分をサーバーへ一度だけ移す。
async function migrateLocalCardMarks(file) {
  const statuses = readLocalJson(STATUS_KEY_PREFIX + file);
  const starred = readLocalJson(STARRED_KEY_PREFIX + file);
  if (!statuses && !starred) return;
  const updates = {};
  if (statuses && typeof statuses === 'object' && !Array.isArray(statuses)) {
    for (const [id, status] of Object.entries(statuses)) if (!groupStatuses[id] && STATUS_LABELS[status]) updates[id] = { status };
  }
  if (Array.isArray(starred)) {
    for (const id of starred) if (!starredGroupIds.has(id)) updates[id] = { ...(updates[id] || {}), starred: true };
  }
  for (const [groupId, mark] of Object.entries(updates)) {
    const res = await postJson('/api/card-marks', { groupId, ...mark });
    if (!res.ok) return;
    if (mark.status) groupStatuses[groupId] = mark.status;
    if (mark.starred) starredGroupIds.add(groupId);
  }
  try {
    localStorage.removeItem(STATUS_KEY_PREFIX + file);
    localStorage.removeItem(STARRED_KEY_PREFIX + file);
  } catch {}
  if (Object.keys(updates).length) renderBoard();
}

async function saveCardMark(groupId, mark, revert) {
  const res = await postJson('/api/card-marks', { groupId, ...mark });
  if (res.ok) return;
  revert();
  renderBoard();
  showToast('カードの印を保存できませんでした', { kind: 'error' });
}

function localDateString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function renderStaleBoardNotice() {
  const notice = document.getElementById('staleBoardNotice');
  const today = localDateString();
  const stale = Boolean(boardData && boardData.date && boardData.date < today);
  notice.hidden = !stale;
  if (stale) {
    document.getElementById('staleBoardText').textContent = `これは ${boardData.date.slice(5).replace('-', '/')} のボードです。今日（${today.slice(5).replace('-', '/')}）の todo はまだありません。`;
  }
}

function statusOf(group) {
  return STATUS_LABELS[groupStatuses[group.id]] ? groupStatuses[group.id] : '';
}

function setGroupStatus(group, next) {
  const previous = groupStatuses[group.id];
  if (next) groupStatuses[group.id] = next;
  else delete groupStatuses[group.id];
  renderBoard();
  renderModalStatusButton();
  saveCardMark(group.id, { status: next || '' }, () => {
    if (previous) groupStatuses[group.id] = previous;
    else delete groupStatuses[group.id];
  });
}

// 3状態を1ボタンで巡回させると、今日やるを取り消すつもりの再押下で保留に化けるため、○は今日やるの付け外しに限る。
function nextTodayToggleStatus(group) {
  return statusOf(group) === 'today' ? '' : 'today';
}

function describeStatusButton(group, subject) {
  const current = statusOf(group);
  const next = nextTodayToggleStatus(group);
  return `${subject}のステータス: ${STATUS_LABELS[current]}（押すと${STATUS_LABELS[next]}にする）`;
}

function toggleGroupStar(groupId) {
  const starred = !starredGroupIds.has(groupId);
  if (starred) starredGroupIds.add(groupId);
  else starredGroupIds.delete(groupId);
  renderBoard();
  renderModalStarButton();
  saveCardMark(groupId, { starred }, () => {
    if (starred) starredGroupIds.delete(groupId);
    else starredGroupIds.add(groupId);
  });
}

function buildCardMenuItems(column, group, orderPosition) {
  const { main } = splitGroupTitle(group.title);
  const isHold = statusOf(group) === 'hold';
  const holdItem = {
    label: isHold ? '保留を解除' : '保留にする',
    ariaLabel: isHold ? `${main} の保留を解除` : `${main} を保留にする`,
    onSelect: () => setGroupStatus(group, isHold ? '' : 'hold'),
  };
  if (!orderPosition) return [holdItem];
  const { index, count } = orderPosition;
  return [
    holdItem,
    {
      label: '上へ',
      ariaLabel: `${main} を上へ移動（Alt+↑）`,
      disabledReason: index === 0 ? '先頭です' : null,
      onSelect: () => moveCardWithinColumn(column.name, group.id, -1),
    },
    {
      label: '下へ',
      ariaLabel: `${main} を下へ移動（Alt+↓）`,
      disabledReason: index === count - 1 ? '末尾です' : null,
      onSelect: () => moveCardWithinColumn(column.name, group.id, 1),
    },
  ];
}

// カード本体（role="button"）の中に置くと対話要素が入れ子になるため、列の操作と同じくカードの外側に重ねる。
function buildCardActions(column, group, orderPosition) {
  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const { main } = splitGroupTitle(group.title);
  const isStarred = starredGroupIds.has(group.id);
  const starBtn = document.createElement('button');
  starBtn.type = 'button';
  starBtn.className = 'btn btn-icon btn--sm' + (isStarred ? ' is-starred' : '');
  starBtn.dataset.focusKey = `card-star:${group.id}`;
  starBtn.textContent = isStarred ? '★' : '☆';
  starBtn.setAttribute('aria-label', isStarred ? `${main} の★を外す` : `${main} に★を付ける`);
  starBtn.addEventListener('click', () => toggleGroupStar(group.id));
  if (!group.done) {
    const status = statusOf(group);
    const statusBtn = document.createElement('button');
    statusBtn.type = 'button';
    statusBtn.className = `btn btn-icon btn--sm status-${status || 'none'}`;
    statusBtn.dataset.focusKey = `card-status:${group.id}`;
    statusBtn.textContent = STATUS_ICONS[status];
    statusBtn.setAttribute('aria-label', describeStatusButton(group, `${main} `));
    statusBtn.addEventListener('click', () => setGroupStatus(group, nextTodayToggleStatus(group)));
    actions.appendChild(statusBtn);
  }
  actions.appendChild(starBtn);
  if (!group.done) {
    const menu = buildActionMenu(`card-${group.id}-menu`, `${main} の操作`, buildCardMenuItems(column, group, orderPosition));
    const menuBtn = buildActionMenuButton(menu);
    menuBtn.dataset.focusKey = `card-menu:${group.id}`;
    actions.appendChild(menuBtn);
    actions.appendChild(menu);
  }
  return actions;
}

// orderPosition: 列内で並べ替えられるときだけ { index, count }（表示中の未完了カードでの位置）。
function makeCard(column, group, { matchedTaskText = null, orderPosition = null, isUnderHeading = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'card-wrap';
  const card = document.createElement('div');
  card.className = 'group-card' + (group.done ? ' done' : '');
  card.draggable = !group.done;
  card.dataset.id = group.id;
  card.dataset.focusKey = `card:${group.id}`;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');

  const stripe = document.createElement('span');
  stripe.className = 'stripe';
  card.appendChild(stripe);

  const body = document.createElement('div');
  body.className = 'card-body';

  const head = document.createElement('div');
  head.className = 'card-head';
  const { parent, main } = splitGroupTitle(group.title);
  if (parent && !isUnderHeading) {
    const parentLabel = document.createElement('span');
    parentLabel.className = 'card-parent';
    appendHighlightedText(parentLabel, parent);
    head.appendChild(parentLabel);
  }
  const title = document.createElement('span');
  title.className = 'card-title';
  appendHighlightedText(title, main);
  head.appendChild(title);
  const status = group.done ? '' : statusOf(group);
  if (status) {
    const badge = document.createElement('span');
    badge.className = `status-badge status-${status}`;
    badge.textContent = STATUS_LABELS[status];
    head.insertBefore(badge, head.firstChild);
  }
  const flow = cardFlowOf(group);
  if (flow === 'waiting' || flow === 'running') {
    const badge = document.createElement('span');
    badge.className = `flow-badge flow-${flow}`;
    badge.textContent = FLOW_LABELS[flow];
    head.insertBefore(badge, head.firstChild);
  }
  for (const mark of unreadMarksOf(group)) {
    if (flow === 'waiting' && mark.kind === 'session') continue;
    const badge = document.createElement('span');
    badge.className = `unread-badge unread-${mark.kind}`;
    badge.textContent = mark.label;
    head.insertBefore(badge, head.firstChild);
  }
  body.appendChild(head);

  if (matchedTaskText) {
    const match = document.createElement('div');
    match.className = 'card-match';
    match.append('タスク: ');
    appendHighlightedText(match, matchedTaskText);
    body.appendChild(match);
  }

  if (group.projectHint) {
    const hint = document.createElement('div');
    hint.className = 'card-hint';
    hint.textContent = group.projectHint;
    body.appendChild(hint);
  }

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  const segs = document.createElement('span');
  segs.className = 'segs';
  segs.style.setProperty('--seg-w', `${segWidthForCount(group.tasks.length)}px`);
  for (const task of group.tasks) {
    const seg = document.createElement('span');
    seg.style.background = task.done ? 'var(--accent)' : 'var(--track)';
    segs.appendChild(seg);
  }
  meta.appendChild(segs);
  const doneN = group.tasks.filter((t) => t.done).length;
  const ratio = document.createElement('span');
  ratio.className = 'ratio-text';
  ratio.textContent = `${doneN}/${group.tasks.length}`;
  meta.appendChild(ratio);
  const spacer = document.createElement('span');
  spacer.style.flex = '1';
  meta.appendChild(spacer);
  if (group.comments && group.comments.length > 0) {
    const badge = document.createElement('span');
    badge.className = 'comment-badge';
    badge.innerHTML = `<span class="icon"></span>${group.comments.length}`;
    meta.appendChild(badge);
  }
  body.appendChild(meta);
  const sessionEl = buildSessionStatus(group);
  if (sessionEl) body.appendChild(sessionEl);
  card.appendChild(body);

  let dragged = false;
  card.addEventListener('dragstart', (e) => {
    dragged = true;
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', group.id);
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  body.addEventListener('click', () => {
    if (dragged) { dragged = false; return; }
    openModal(column, group);
  });
  card.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      if (!group.done) moveCardWithinColumn(column.name, group.id, e.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openModal(column, group);
    }
  });

  wrap.appendChild(card);
  wrap.appendChild(buildCardActions(column, group, orderPosition));
  return wrap;
}

function onDragOver(e) {
  e.preventDefault();
  const list = e.currentTarget;
  const draggingCard = document.querySelector('.group-card.dragging');
  if (!draggingCard) return;
  const draggingSlot = draggingCard.closest('.card-wrap');
  const after = [...list.querySelectorAll(':scope > .card-wrap')].find((slot) => {
    if (slot === draggingSlot) return false;
    const rect = slot.getBoundingClientRect();
    return e.clientY < rect.top + rect.height / 2;
  });
  if (after) {
    list.insertBefore(draggingSlot, after);
  } else {
    list.appendChild(draggingSlot);
  }
}

async function onDrop(e) {
  e.preventDefault();
  if (!document.querySelector('.group-card.dragging')) return;
  const list = e.currentTarget;
  const columnName = list.parentElement.dataset.column;
  const shownIds = [...list.querySelectorAll('.group-card')].map((c) => c.dataset.id);

  await saveColumnOrder(currentFile, columnName, mergeShownOrder(columnName, shownIds), { isDomAlreadyReordered: true });
}

let draggingColumnName = null;

function onColumnDragOver(e) {
  if (!draggingColumnName) return;
  e.preventDefault();
  const board = e.currentTarget;
  const draggingWrap = board.querySelector('.column-wrap.column-dragging');
  if (!draggingWrap) return;
  const isRow = getComputedStyle(board).flexDirection === 'row';
  const pointer = isRow ? e.clientX : e.clientY;
  const after = [...board.querySelectorAll(':scope > .column-wrap:not([hidden])')].find((wrap) => {
    if (wrap === draggingWrap) return false;
    const rect = wrap.getBoundingClientRect();
    return pointer < (isRow ? rect.left + rect.width / 2 : rect.top + rect.height / 2);
  });
  if (after) board.insertBefore(draggingWrap, after);
  else board.appendChild(draggingWrap);
}

// 絞り込みで隠れている列もDOMには残っているため、DOMの並びをそのまま保存すれば隠れた列の位置も保たれる。
async function onColumnDrop(e) {
  if (!draggingColumnName) return;
  e.preventDefault();
  const names = [...e.currentTarget.querySelectorAll(':scope > .column-wrap > .column')].map((c) => c.dataset.column);
  const byName = new Map(boardData.columns.map((c) => [c.name, c]));
  boardData.columns = names.map((name) => byName.get(name)).filter(Boolean);
  renderBoard();
  const response = await postJson('/api/column-order', { order: names });
  if (!response.ok) {
    showFailureToast(`列の並び順の保存に失敗しました: ${formatFailureReason(response)}`, () => loadBoard(currentFile));
    await loadBoard(currentFile);
  }
}

async function toggleColumnFavorite(column) {
  const response = await postJson('/api/column-favorites', { name: column.name, favorite: !column.favorite });
  if (!response.ok) {
    showFailureToast(`お気に入りの保存に失敗しました: ${formatFailureReason(response)}`, () => loadBoard(currentFile));
  }
  await loadBoard(currentFile);
}

// 絞り込み中のリストには一部のカードしか無いため、非表示のカードは元の位置に残し、表示中のカードの位置だけを入れ替える。
function mergeShownOrder(columnName, shownIds) {
  const column = boardData.columns.find((c) => c.name === columnName);
  if (!column) return shownIds;
  const shownIdSet = new Set(shownIds);
  const remainingShownIds = [...shownIds];
  const merged = column.groups
    .filter((g) => !g.done)
    .map((g) => (shownIdSet.has(g.id) ? remainingShownIds.shift() : g.id));
  return [...merged, ...remainingShownIds];
}

// 絞り込みで隠れているカードは飛ばし、画面上で隣にあるカードと入れ替わるように動かす。
function moveCardWithinColumn(columnName, groupId, step) {
  const column = boardData.columns.find((c) => c.name === columnName);
  if (!column) return;
  const openIds = column.groups.filter((g) => !g.done).map((g) => g.id);
  const shownIds = new Set(listVisibleGroupMatches(column).map((m) => m.group.id));
  const parentById = new Map(column.groups.map((g) => [g.id, splitGroupTitle(g.title).parent]));
  const isSameSection = (id) => shownIds.has(id) && parentById.get(id) === parentById.get(groupId);
  const from = openIds.indexOf(groupId);
  if (from === -1) return;
  let to = from + step;
  while (to >= 0 && to < openIds.length && !isSameSection(openIds[to])) to += step;
  if (to < 0 || to >= openIds.length) return;
  const ids = [...openIds];
  ids.splice(from, 1);
  ids.splice(to, 0, groupId);
  saveColumnOrder(currentFile, columnName, ids);
  const movedCard = findElementByFocusKey(`card:${groupId}`);
  if (movedCard) movedCard.scrollIntoView({ block: 'nearest' });
}

function reorderColumnGroups(column, ids) {
  const byId = new Map(column.groups.map((g) => [g.id, g]));
  const openIds = new Set(ids);
  const reorderedOpen = ids.map((id) => byId.get(id)).filter(Boolean);
  const closed = column.groups.filter((g) => !openIds.has(g.id));
  column.groups = [...reorderedOpen, ...closed];
}

async function saveColumnOrder(file, columnName, ids, { isDomAlreadyReordered = false } = {}) {
  const column = file === currentFile ? boardData.columns.find((c) => c.name === columnName) : null;
  const previousGroups = column ? column.groups : null;
  if (column) {
    reorderColumnGroups(column, ids);
    if (!isDomAlreadyReordered) renderBoard();
  }
  const response = await postJson('/api/order', { file, order: { [columnName]: ids } });
  if (response.ok) return true;
  if (column && boardData.columns.includes(column)) {
    column.groups = previousGroups;
    renderBoard();
  }
  showFailureToast(
    `「${columnName}」の並べ替えを保存できませんでした（元の順序に戻しました）: ${formatFailureReason(response)}`,
    () => saveColumnOrder(file, columnName, ids),
  );
  return false;
}

// onSettled: 成功・失敗のどちらでも呼ばれ、呼び出し側が task.done に表示を合わせる。
function toggleTaskDone(task, group, onSettled) {
  return sendTaskToggle(currentFile, task, group, onSettled);
}

// 元に戻す・再試行は、その後に表示ファイルを切り替えていても、最初にチェックしたファイルに対して行う。
async function sendTaskToggle(file, task, group, onSettled) {
  const response = await runOwnBoardWrite(file, () => postJson('/api/checkbox', { file, taskId: task.id }));
  if (!response.ok) {
    if (onSettled) onSettled();
    showFailureToast(
      `チェック状態の更新に失敗しました: ${formatFailureReason(response)}`,
      () => sendTaskToggle(file, task, group, onSettled),
    );
    return false;
  }
  task.done = response.data.done;
  group.done = group.tasks.every((t) => t.done);
  // 再読込でboardDataが作り直された後に呼ばれると task/group は古いオブジェクトなので、表示中のものにも反映する。
  const current = file === currentFile ? findTaskById(task.id) : null;
  if (current) {
    current.task.done = task.done;
    current.group.done = current.group.tasks.every((t) => t.done);
  }
  if (onSettled) onSettled();
  if (current) reflectTaskDoneChange();
  showToast(describeTaskToggle(task, response.data.sourceUpdated), {
    actionLabel: '元に戻す',
    onAction: () => sendTaskToggle(file, task, group, onSettled),
    key: `task-toggle:${task.id}`,
    durationMs: TASK_TOGGLE_UNDO_DURATION_MS,
  });
  return true;
}

function describeTaskToggle(task, sourceUpdated) {
  const body = plainTextFromMarkdown(splitTaskSource(task.text).body);
  const label = body.length > TOAST_TASK_TEXT_MAX ? `${body.slice(0, TOAST_TASK_TEXT_MAX)}…` : body;
  const result = task.done ? '完了にしました' : '未完了に戻しました';
  const note = sourceUpdated === false ? '（元ファイルへの反映はスキップされました）' : '';
  return `「${label}」を${result}${note}`;
}

function reflectTaskDoneChange() {
  renderHeader();
  renderBoard();
  syncModalTaskRows();
  if (focusMode) {
    const focusReturn = captureFocusReturn();
    renderFocusCard();
    restoreFocusReturn(focusReturn);
  }
}

function completeFirstOpenTask(group) {
  const task = group.tasks.find((t) => !t.done);
  if (!task) {
    showToast('このカードに未完了のタスクはありません');
    return;
  }
  toggleTaskDone(task, group);
}

// `#<連番>`はtodoファイル内だけの番号で、起動先セッションのbacklogとは一致しないため本文も必ず添える。
function formatTaskQuote(task) {
  return task.number != null ? `#${task.number} ${task.text}` : task.text;
}

function insertQuote(task, selected, sourcePath) {
  if (!selected) addQuoteChip('modalCommentInput', `> ${formatTaskQuote(task)}`);
  else addQuoteChip('modalCommentInput', sourcePath ? toQuoteLines(sourcePath, selected) : toLineQuote(selected));
}

function readSelectionWithin(element) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) return '';
  return selection.toString().trim();
}

function openModal(column, group) {
  const dialog = document.getElementById('cardDialog');
  if (!dialog.open) modalFocusReturn = captureFocusReturn();
  if (!dialog.open || lastModalGroupId !== group.id) clearFieldError(document.getElementById('modalTaskInput'));
  if (lastModalGroupId !== group.id) {
    document.getElementById('modalCommentInput').value = '';
    document.getElementById('modalTaskInput').value = '';
    resetLaunchSelects('modal');
  }
  lastModalGroupId = group.id;
  modalColumnName = column.name;
  modalGroup = group;
  markGroupsSeen([group]);
  document.getElementById('modalColLabel').textContent = column.name;
  applyColumnHue(document.getElementById('cardDialog'), column.name);
  document.getElementById('modalTitle').textContent = group.title;
  const hintEl = document.getElementById('modalHint');
  hintEl.textContent = group.projectHint || '';
  hintEl.hidden = !group.projectHint;
  renderModalRatio();
  renderModalCost(group.id);

  const tasksEl = document.getElementById('modalTasks');
  tasksEl.innerHTML = '';
  for (const task of group.tasks) tasksEl.appendChild(buildModalTaskRow(column, group, task));

  if (modalLogView.groupId !== group.id) modalSelectedJobId = null;
  modalLogView.groupId = group.id;
  renderModalSessionLog();
  if (!modalLogView.timer) {
    modalLogView.timer = setInterval(() => { if (modalLogView.session) fetchAndRenderSessionLog(modalLogView, modalLogView.session); }, 5000);
  }
  renderModalCommentControls();
  renderModalStarButton();
  if (!dialog.open) {
    dialog.showModal();
    attachToastRegionToTopmostDialog();
    document.getElementById('modalCloseBtn').focus();
  }
  syncUrlHash();
}

function renderModalStatusButton() {
  if (!modalGroup) return;
  const segment = document.getElementById('modalStatusGroup');
  segment.hidden = !!modalGroup.done;
  const current = statusOf(modalGroup);
  segment.replaceChildren(...STATUS_ORDER.map((status) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn--sm chip status-${status || 'none'}`;
    btn.textContent = `${STATUS_ICONS[status]} ${STATUS_LABELS[status]}`;
    btn.setAttribute('aria-pressed', String(status === current));
    btn.addEventListener('click', () => {
      if (modalGroup) setGroupStatus(modalGroup, status);
    });
    return btn;
  }));
}

function renderModalStarButton() {
  if (!modalGroup) return;
  const starBtn = document.getElementById('modalStarBtn');
  const isStarred = starredGroupIds.has(modalGroup.id);
  starBtn.textContent = isStarred ? '★' : '☆';
  setButtonLabel(starBtn, isStarred ? '★を外す' : '★を付ける');
  starBtn.classList.toggle('is-starred', isStarred);
}

// 行を作り直すとチェックボックスのフォーカスが失われるため、表示中の行の状態だけを書き換える。
function syncModalTaskRows() {
  if (!modalGroup) return;
  const found = findGroupById(modalGroup.id);
  if (!found) return;
  modalGroup = found.group;
  for (const row of document.querySelectorAll('#modalTasks .modal-task')) {
    const task = modalGroup.tasks.find((t) => t.id === row.dataset.taskId);
    if (!task) continue;
    row.classList.toggle('done', task.done);
    row.draggable = !task.done;
    row.querySelector('input[type="checkbox"]').checked = task.done;
  }
  renderModalRatio();
}

function renderModalRatio() {
  const doneN = modalGroup.tasks.filter((t) => t.done).length;
  document.getElementById('modalRatio').textContent = `${doneN} / ${modalGroup.tasks.length} 完了`;
  const ratio = modalGroup.tasks.length > 0 ? doneN / modalGroup.tasks.length : 0;
  document.getElementById('modalProgressFill').style.width = `${Math.round(ratio * 100)}%`;
}

function buildModalTaskRow(column, group, task) {
  const row = document.createElement('div');
  row.className = 'modal-task' + (task.done ? ' done' : '');
  row.dataset.taskId = task.id;
  row.draggable = !task.done;
  row.hidden = pendingTaskDeletes.has(task.id);
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = task.done;
  checkbox.addEventListener('change', () => toggleTaskDone(task, group, () => {
    checkbox.checked = task.done;
    row.classList.toggle('done', task.done);
    row.draggable = !task.done;
    if (modalGroup === group) renderModalRatio();
  }));
  row.appendChild(checkbox);
  if (task.number != null) {
    const number = document.createElement('span');
    number.className = 'task-number';
    number.textContent = `#${task.number}`;
    row.appendChild(number);
  }
  const { body: taskBody, sourcePath } = splitTaskSource(task.text);
  const main = document.createElement('div');
  main.className = 'task-main';
  const body = document.createElement('div');
  body.className = 'task-text';
  body.id = `task-${task.id}-text`;
  renderInlineMarkdown(body, taskBody);
  bindDocLinks(body, sourcePath);
  checkbox.setAttribute('aria-labelledby', body.id);
  main.appendChild(body);
  const actions = document.createElement('div');
  actions.className = 'task-actions';
  main.appendChild(actions);
  row.appendChild(main);
  bindRowClickToCheckbox(row, checkbox);

  row.addEventListener('dragstart', (e) => {
    row.classList.add('dragging');
    e.dataTransfer.setData('text/plain', formatTaskQuote(task));
  });
  row.addEventListener('dragend', () => row.classList.remove('dragging'));
  // draggableな行の中では文字を範囲選択できないため、本文を押している間だけ行ドラッグを止める（AC-QT-2）。
  body.addEventListener('mousedown', () => {
    row.draggable = false;
    document.addEventListener('mouseup', () => { row.draggable = !task.done; }, { once: true });
  });

  if (sourcePath) {
    const sourceEl = document.createElement('code');
    sourceEl.className = 'task-source-path';
    sourceEl.id = `task-${task.id}-source`;
    sourceEl.textContent = sourcePath;
    sourceEl.hidden = true;
    main.appendChild(sourceEl);
    const sourceBtn = document.createElement('button');
    sourceBtn.type = 'button';
    sourceBtn.className = 'btn btn-icon btn--sm';
    sourceBtn.appendChild(icon('link'));
    setButtonLabel(sourceBtn, '出典');
    sourceBtn.setAttribute('aria-expanded', 'false');
    sourceBtn.setAttribute('aria-controls', sourceEl.id);
    sourceBtn.addEventListener('click', () => {
      sourceEl.hidden = !sourceEl.hidden;
      sourceBtn.setAttribute('aria-expanded', String(!sourceEl.hidden));
    });
    actions.appendChild(sourceBtn);
    const relatedBtn = document.createElement('button');
    relatedBtn.type = 'button';
    relatedBtn.className = 'btn btn-icon btn--sm';
    relatedBtn.appendChild(icon('doc'));
    setButtonLabel(relatedBtn, '仕様・設計');
    relatedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const changeDoc = [...body.querySelectorAll('a[href]')]
        .map((link) => resolveDocLink(link.getAttribute('href'), sourcePath))
        .find((p) => p && p.includes('/docs/changes/'));
      // ops系は docs/specs/ が無く related が404になるため、本文に平文で書かれた作業ディレクトリのパスで開く。
      const workDoc = body.textContent.match(/(?<![\w./-])[\w.-]+(?:\/[\w.-]+)*\/[\w.-]+\.md\b/);
      openRelatedDocs(changeDoc || sourcePath, workDoc && workDoc[0].replace(/\/[^/]+$/, ''), sourcePath);
    });
    actions.appendChild(relatedBtn);
  }

  const quoteBtn = document.createElement('button');
  quoteBtn.type = 'button';
  quoteBtn.className = 'btn btn-icon btn--sm';
  quoteBtn.dataset.shortLabel = '引用';
  quoteBtn.appendChild(icon('quote'));
  quoteBtn.setAttribute('aria-label', 'コメント欄に引用を挿入');
  quoteBtn.dataset.tip = '引用';
  // 押下でタスク本文の選択が外れないよう、フォーカス移動を止める。
  quoteBtn.addEventListener('mousedown', (e) => e.preventDefault());
  quoteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    insertQuote(task, readSelectionWithin(body), sourcePath);
  });
  actions.appendChild(quoteBtn);


  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn-icon btn--sm';
  editBtn.appendChild(icon('edit'));
  setButtonLabel(editBtn, '編集');
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startTaskEdit(row, main, body, task, taskBody);
  });
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-icon btn--sm';
  deleteBtn.appendChild(icon('trash'));
  setButtonLabel(deleteBtn, '削除');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteTaskWithUndo(currentFile, task, row);
  });
  actions.appendChild(deleteBtn);
  for (const btn of actions.querySelectorAll('.btn-icon:not(.btn--labeled)')) {
    btn.classList.add('btn--labeled');
    const label = document.createElement('span');
    label.textContent = btn.dataset.shortLabel || btn.getAttribute('aria-label');
    btn.appendChild(label);
  }
  return row;
}

// 編集対象は `#<連番>`・出典パスを除いた本文だけ（保存時にサーバー側で元の連番・パスを付け直す）。
function startTaskEdit(row, main, body, task, taskBody) {
  if (main.querySelector('.task-edit')) return;
  row.draggable = false;
  const form = document.createElement('div');
  form.className = 'task-edit';
  const input = document.createElement('textarea');
  input.rows = 2;
  input.value = taskBody.replace(/^#\d+\s+/, '');
  input.setAttribute('aria-label', 'タスクの内容');
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'btn btn--sm';
  save.textContent = '保存';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn--sm';
  cancel.textContent = 'キャンセル';
  const close = () => {
    form.remove();
    body.hidden = false;
    row.draggable = !task.done;
  };
  const submit = () => {
    const text = input.value.trim();
    if (!text) {
      showFieldError(input, 'タスクの内容を入力してください');
      return;
    }
    sendTaskEdit(currentFile, task, { text });
  };
  save.addEventListener('click', submit);
  cancel.addEventListener('click', close);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  for (const el of [form, input]) el.addEventListener('click', (e) => e.stopPropagation());
  form.append(input, save, cancel);
  body.hidden = true;
  body.after(form);
  input.focus();
}

// 削除は取り消せないため、通知が消えるまで送信を保留する。ページを離れたら送らない（タスクは残る）。
const pendingTaskDeletes = new Set();

function deleteTaskWithUndo(file, task, row) {
  pendingTaskDeletes.add(task.id);
  // 押したボタンごと行が消えるとフォーカスが body に飛ぶため、隣の行（無ければ追加欄）へ移す。
  const siblings = [...row.parentElement.children].filter((el) => el !== row && !el.hidden);
  const next = siblings.find((el) => row.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) || siblings.at(-1);
  row.hidden = true;
  (next?.querySelector('input[type="checkbox"]') || document.getElementById('modalTaskInput')).focus();
  const body = plainTextFromMarkdown(splitTaskSource(task.text).body);
  const label = body.length > TOAST_TASK_TEXT_MAX ? `${body.slice(0, TOAST_TASK_TEXT_MAX)}…` : body;
  showToast(`タスクを削除しました: ${label}`, {
    actionLabel: '元に戻す',
    onAction: () => {
      for (const el of document.querySelectorAll(`.modal-task[data-task-id="${CSS.escape(String(task.id))}"]`)) el.hidden = false;
    },
    onClose: (reason) => {
      pendingTaskDeletes.delete(task.id);
      if (reason !== 'action') sendTaskEdit(file, task, { remove: true });
    },
    key: `task-delete:${task.id}`,
    durationMs: TASK_TOGGLE_UNDO_DURATION_MS,
  });
}

async function sendTaskEdit(file, task, change) {
  const response = await runOwnBoardWrite(file, () => postJson('/api/tasks/edit', { file, taskId: task.id, ...change }));
  if (!response.ok) {
    showFailureToast(`タスクの${change.remove ? '削除' : '編集'}に失敗しました: ${formatFailureReason(response)}`, () => sendTaskEdit(file, task, change));
    return;
  }
  const groupId = modalGroup && modalGroup.id;
  if (file === currentFile) await loadBoard(currentFile);
  const found = groupId ? findGroupById(groupId) : null;
  if (found) openModal(found.column, found.group);
  else if (groupId) closeModal();
  if (!change.remove) showToast('タスクを更新しました');
}

const CARD_PANEL_WIDTH_KEY = 'viewer:cardPanelWidth';
const CARD_SESSION_EXPANDED_KEY = 'viewer:cardSessionExpanded';
const CARD_PANEL_MIN_W = 420;
const CARD_PANEL_KEY_STEP = 32;
const CARD_PANEL_KEY_STEP_LARGE = 96;
// ボードが左に見えたまま残るよう、サイドバー幅ぶんは常に空ける
const CARD_PANEL_BOARD_RESERVE = 320;

function clampCardPanelWidth(width) {
  return Math.max(CARD_PANEL_MIN_W, Math.min(width, window.innerWidth - CARD_PANEL_BOARD_RESERVE));
}

function applyCardPanelWidth(width) {
  const clamped = clampCardPanelWidth(width);
  document.documentElement.style.setProperty('--card-panel-w', `${clamped}px`);
  const handle = document.getElementById('cardPanelResizeHandle');
  handle.setAttribute('aria-valuenow', String(clamped));
  handle.setAttribute('aria-valuemin', String(CARD_PANEL_MIN_W));
  handle.setAttribute('aria-valuemax', String(Math.max(CARD_PANEL_MIN_W, window.innerWidth - CARD_PANEL_BOARD_RESERVE)));
  return clamped;
}

function setupCardPanelResize() {
  const saved = Number(localStorage.getItem(CARD_PANEL_WIDTH_KEY));
  if (saved) applyCardPanelWidth(saved);
  const handle = document.getElementById('cardPanelResizeHandle');
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('is-dragging');
    const onMove = (ev) => applyCardPanelWidth(window.innerWidth - ev.clientX);
    const onUp = (ev) => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.classList.remove('is-dragging');
      localStorage.setItem(CARD_PANEL_WIDTH_KEY, String(clampCardPanelWidth(window.innerWidth - ev.clientX)));
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  });
  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = (e.shiftKey ? CARD_PANEL_KEY_STEP_LARGE : CARD_PANEL_KEY_STEP) * (e.key === 'ArrowLeft' ? 1 : -1);
    const current = Number(handle.getAttribute('aria-valuenow')) || document.getElementById('cardDialog').getBoundingClientRect().width;
    localStorage.setItem(CARD_PANEL_WIDTH_KEY, String(applyCardPanelWidth(current + step)));
  });
}

function closeModal() {
  document.getElementById('cardDialog').close();
}

function onCardDialogClosed() {
  modalColumnName = null;
  modalGroup = null;
  clearInterval(modalLogView.timer);
  Object.assign(modalLogView, { timer: null, jobId: null, session: null, groupId: null, branchableUuid: null, renderedKeys: null });
  modalSelectedJobId = null;
  attachToastRegionToTopmostDialog();
  restoreFocusReturn(modalFocusReturn);
  modalFocusReturn = null;
  syncUrlHash();
}

let modalSelectedJobId = null;

function listCardSessions(group) {
  const current = group && group.session;
  return current ? [current, ...(current.history || [])] : [];
}

const SESSION_STATE_PRIORITY = ['blocked', 'working', 'failed', 'done'];
