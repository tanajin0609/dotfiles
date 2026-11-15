let inboxMemos = [];
let inboxDialogFocusReturn = null;
let inboxMovingMemo = null;
// 新規メモの保存前に添付できるよう、IDをクライアントで先に決めておく。
let inboxDraftId = newInboxId();
const pendingInboxDeletes = new Set();

function newInboxId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function inboxUploadUrl(id) {
  return (file) => `/api/inbox/attachments?${new URLSearchParams({ id, name: file.name })}`;
}

function bindInboxAttachments(textarea, getId) {
  textarea.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    textarea.classList.add('drag-over');
  });
  textarea.addEventListener('dragleave', () => textarea.classList.remove('drag-over'));
  textarea.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length === 0) return;
    e.preventDefault();
    textarea.classList.remove('drag-over');
    attachDroppedFiles(textarea, null, e.dataTransfer.files, inboxUploadUrl(getId()));
  });
  textarea.addEventListener('paste', (e) => {
    if (e.clipboardData.files.length === 0) return;
    e.preventDefault();
    attachDroppedFiles(textarea, null, e.clipboardData.files, inboxUploadUrl(getId()));
  });
}

async function loadInbox() {
  const response = await fetchJson('/api/inbox');
  if (!response.ok) return;
  inboxMemos = response.data.memos;
  renderInbox();
}

function renderInbox() {
  const visible = inboxMemos.filter((m) => !pendingInboxDeletes.has(m.id));
  const count = document.getElementById('inboxCount');
  count.hidden = visible.length === 0;
  count.textContent = String(visible.length);
  document.getElementById('inboxBtn').setAttribute('aria-label', visible.length ? `Inbox（${visible.length}件）` : 'Inbox');
  const list = document.getElementById('inboxList');
  // 編集中の行は作り直さず差し戻し、入力途中の本文を失わずに他のメモだけ更新する。
  const editingItems = new Map([...list.querySelectorAll('.inbox-memo.editing')].map((li) => [li.dataset.memoId, li]));
  const focused = list.contains(document.activeElement) ? document.activeElement : null;
  document.getElementById('inboxEmpty').hidden = visible.length > 0;
  document.getElementById('inboxHint').hidden = visible.length === 0;
  list.replaceChildren(...visible.map((memo) => editingItems.get(memo.id) || buildInboxMemoItem(memo)));
  if (focused && focused.isConnected) focused.focus();
}

function formatInboxTime(iso) {
  return new Date(iso).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' });
}

function buildInboxMemoItem(memo) {
  const item = document.createElement('li');
  item.className = 'inbox-memo';
  item.dataset.memoId = memo.id;
  // 行全体を draggable にすると本文を範囲選択できないため、取っ手だけをドラッグ元にする。
  const handle = document.createElement('span');
  handle.className = 'inbox-memo-handle';
  handle.draggable = true;
  handle.title = 'ボードの列へドラッグして移す';
  handle.setAttribute('aria-hidden', 'true');
  handle.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/></svg>';
  handle.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(INBOX_MEMO_MIME, memo.id);
    e.dataTransfer.setDragImage(item, 12, 12);
    item.classList.add('dragging');
  });
  handle.addEventListener('dragend', () => {
    item.classList.remove('dragging');
    clearInboxDropTarget();
  });
  const body = document.createElement('div');
  body.className = 'inbox-memo-body';
  const text = document.createElement('p');
  text.className = 'inbox-memo-text';
  text.textContent = memo.text;
  const meta = document.createElement('span');
  meta.className = 'inbox-memo-meta';
  meta.textContent = memo.updatedAt && memo.updatedAt !== memo.createdAt
    ? `${formatInboxTime(memo.createdAt)}（編集 ${formatInboxTime(memo.updatedAt)}）`
    : formatInboxTime(memo.createdAt);
  const actions = document.createElement('div');
  actions.className = 'inbox-memo-actions';
  const makeButton = (label) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary btn--sm';
    btn.textContent = label;
    btn.setAttribute('aria-label', `${label}: ${memo.text.trim().split('\n')[0]}`);
    actions.append(btn);
    return btn;
  };
  makeButton('編集').addEventListener('click', () => startInboxEdit(item, memo));
  makeButton('削除').addEventListener('click', () => deleteInboxMemoWithUndo(memo));
  makeButton('プロジェクトへ移す').addEventListener('click', () => openInboxMoveDialog(memo));
  body.append(text, meta, actions);
  item.append(handle, body);
  return item;
}

function startInboxEdit(item, memo) {
  const input = document.createElement('textarea');
  input.rows = Math.min(10, memo.text.split('\n').length + 1);
  input.value = memo.text;
  input.setAttribute('aria-label', 'メモを編集');
  bindInboxAttachments(input, () => memo.id);
  const finish = () => {
    item.classList.remove('editing');
    renderInbox();
  };
  const save = async () => { if (await saveInboxMemo(memo.id, input.value)) finish(); };
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    finish();
  });
  bindSubmitShortcut(input, save);
  const hint = document.createElement('span');
  hint.className = 'input-hint';
  const modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  hint.innerHTML = `<kbd>${modKey}</kbd>+<kbd>Enter</kbd> で保存 / <kbd>Esc</kbd> で取消`;
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary btn--sm';
  saveBtn.textContent = '保存';
  saveBtn.addEventListener('click', save);
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-secondary btn--sm';
  cancelBtn.textContent = 'キャンセル';
  cancelBtn.addEventListener('click', finish);
  item.classList.add('editing');
  item.querySelector('.inbox-memo-text').replaceWith(input);
  item.querySelector('.inbox-memo-actions').replaceChildren(hint, saveBtn, cancelBtn);
  input.focus();
}

async function saveInboxMemo(id, text) {
  if (!text.trim()) {
    showToast('メモが空です', { kind: 'error' });
    return false;
  }
  const response = await postJson('/api/inbox', { id, text });
  if (!response.ok) {
    showFailureToast(`メモを保存できませんでした: ${formatFailureReason(response)}`, () => saveInboxMemo(id, text));
    return false;
  }
  const index = inboxMemos.findIndex((m) => m.id === id);
  if (index === -1) inboxMemos.unshift(response.data.memo);
  else inboxMemos[index] = response.data.memo;
  return true;
}

async function addInboxMemo() {
  const input = document.getElementById('inboxNewInput');
  if (!await saveInboxMemo(inboxDraftId, input.value)) return;
  input.value = '';
  inboxDraftId = newInboxId();
  renderInbox();
}

function deleteInboxMemoWithUndo(memo) {
  pendingInboxDeletes.add(memo.id);
  renderInbox();
  showToast(`メモを削除しました: ${memo.text.trim().split('\n')[0].slice(0, TOAST_TASK_TEXT_MAX)}`, {
    actionLabel: '元に戻す',
    onAction: () => {},
    onClose: async (reason) => {
      pendingInboxDeletes.delete(memo.id);
      if (reason !== 'action') {
        const response = await postJson('/api/inbox/delete', { id: memo.id });
        if (response.ok || response.status === 404) inboxMemos = inboxMemos.filter((m) => m.id !== memo.id);
        else showToast(`メモを削除できませんでした: ${formatFailureReason(response)}`, { kind: 'error' });
      }
      renderInbox();
    },
    key: `inbox-delete:${memo.id}`,
    durationMs: TASK_TOGGLE_UNDO_DURATION_MS,
  });
}

function openInboxDialog() {
  const dialog = document.getElementById('inboxDialog');
  if (dialog.open) return;
  inboxDialogFocusReturn = captureFocusReturn();
  dialog.show();
  attachToastRegionToTopmostDialog();
  loadInbox();
  document.getElementById('inboxNewInput').focus();
}

const INBOX_MEMO_MIME = 'application/x-inbox-memo';

function firstLineOf(text) {
  return text.split('\n').map((l) => l.trim()).find(Boolean) || '';
}

function clearInboxDropTarget() {
  document.querySelectorAll('.column.inbox-drop-target').forEach((c) => c.classList.remove('inbox-drop-target'));
}

function onInboxMemoDragOver(e) {
  if (!e.dataTransfer.types.includes(INBOX_MEMO_MIME)) return;
  const column = e.target.closest('.column');
  if (!column) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (!column.classList.contains('inbox-drop-target')) {
    clearInboxDropTarget();
    column.classList.add('inbox-drop-target');
  }
}

async function onInboxMemoDrop(e) {
  if (!e.dataTransfer.types.includes(INBOX_MEMO_MIME)) return;
  const column = e.target.closest('.column');
  clearInboxDropTarget();
  if (!column) return;
  e.preventDefault();
  e.stopPropagation();
  const memo = inboxMemos.find((m) => m.id === e.dataTransfer.getData(INBOX_MEMO_MIME));
  if (memo) await moveInboxMemoToColumn(memo, column.dataset.column);
}

async function moveInboxMemoToColumn(memo, columnName) {
  const response = await fetchJson(`/api/backlog-targets?column=${encodeURIComponent(columnName)}`);
  if (!response.ok) {
    showFailureToast(`移せませんでした: ${formatFailureReason(response)}`, () => moveInboxMemoToColumn(memo, columnName));
    return;
  }
  if (response.data.targets.length >= 2) {
    openInboxMoveDialog(memo, columnName);
    return;
  }
  const moved = await postJson('/api/inbox/move', { id: memo.id, column: columnName, title: firstLineOf(memo.text) });
  if (!moved.ok) {
    showFailureToast(`移せませんでした: ${formatFailureReason(moved)}`, () => moveInboxMemoToColumn(memo, columnName));
    return;
  }
  inboxMemos = inboxMemos.filter((m) => m.id !== memo.id);
  renderInbox();
  showToast(`${columnName} に移しました（列を再取得で反映）`);
}

function openInboxMoveDialog(memo, columnName) {
  inboxMovingMemo = memo;
  const select = document.getElementById('inboxMoveColumnSelect');
  select.replaceChildren(...(boardData ? boardData.columns : []).map((column) => {
    const option = document.createElement('option');
    option.value = column.name;
    option.textContent = column.name;
    return option;
  }));
  if (columnName) select.value = columnName;
  document.getElementById('inboxMoveTitleInput').value = firstLineOf(memo.text);
  document.getElementById('inboxMoveDialog').showModal();
  attachToastRegionToTopmostDialog();
  refreshInboxMoveBacklogTargets();
  select.focus();
}

async function refreshInboxMoveBacklogTargets() {
  const columnName = document.getElementById('inboxMoveColumnSelect').value;
  const response = columnName ? await fetchJson(`/api/backlog-targets?column=${encodeURIComponent(columnName)}`) : null;
  if (columnName !== document.getElementById('inboxMoveColumnSelect').value) return;
  const targets = response && response.ok ? response.data.targets : [];
  const labels = response && response.ok ? response.data.labels : [];
  document.getElementById('inboxMoveBacklogSelect').replaceChildren(...targets.map((target, i) => {
    const option = document.createElement('option');
    option.value = target;
    option.textContent = labels[i];
    return option;
  }));
  document.getElementById('inboxMoveBacklogField').hidden = targets.length < 2;
}

async function submitInboxMove() {
  const memo = inboxMovingMemo;
  if (!memo) return;
  const column = document.getElementById('inboxMoveColumnSelect').value;
  const title = document.getElementById('inboxMoveTitleInput').value;
  if (!column || !title.trim()) {
    showToast('列とタスク本文を入れてください', { kind: 'error' });
    return;
  }
  const backlogField = document.getElementById('inboxMoveBacklogField');
  const backlogPath = backlogField.hidden ? undefined : document.getElementById('inboxMoveBacklogSelect').value;
  const button = document.getElementById('inboxMoveSubmit');
  button.disabled = true;
  const response = await postJson('/api/inbox/move', { id: memo.id, column, backlogPath, title });
  button.disabled = false;
  if (!response.ok) {
    showFailureToast(`移せませんでした: ${formatFailureReason(response)}`, submitInboxMove);
    return;
  }
  inboxMemos = inboxMemos.filter((m) => m.id !== memo.id);
  document.getElementById('inboxMoveDialog').close();
  renderInbox();
  showToast(`${column} に移しました（列を再取得で反映）`);
}

let chatSessions = [];
let chatTimer = null;
let chatFocusReturn = null;
const chatLogView = { ...createSessionLogView('chat', 'chatLog', 'chatInput'), noBranch: true };

function selectedChatSession() {
  return chatSessions.find((s) => s.jobId === chatLogView.jobId) || chatSessions[chatSessions.length - 1] || null;
}

function renderChat() {
  const tabs = document.getElementById('chatSessionTabs');
  const selected = selectedChatSession();
  tabs.hidden = chatSessions.length === 0;
  tabs.replaceChildren(...chatSessions.map((s) => {
    const wrap = document.createElement('span');
    wrap.className = 'session-tab';
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'btn btn--sm chip';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(s === selected));
    tab.textContent = formatSessionTabLabel(s);
    tab.addEventListener('click', () => {
      chatLogView.jobId = s.jobId;
      renderChat();
    });
    const close = buildIconButton('close', 'セッションを閉じる', 'sm');
    close.addEventListener('click', () => closeChatSession(s.jobId));
    wrap.append(tab, close);
    return wrap;
  }));
  if (!selected) {
    chatLogView.jobId = null;
    chatLogView.session = null;
    chatLogView.renderedKeys = null;
    renderSessionLogMessage(chatLogView, '下の欄から依頼すると新しいセッションを起動します', null);
    return;
  }
  if (chatLogView.session && chatLogView.session.jobId !== selected.jobId) {
    chatLogView.renderedKeys = null;
    document.getElementById('chatLog').replaceChildren();
  }
  chatLogView.jobId = selected.jobId;
  chatLogView.session = selected;
  fetchAndRenderSessionLog(chatLogView, selected);
}

async function refreshChat() {
  try {
    const res = await fetch('/api/chat');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    chatSessions = data.sessions;
    const cwdInput = document.getElementById('chatCwdInput');
    if (!cwdInput.value) cwdInput.value = data.defaultCwd;
  } catch (err) {
    showToast(`チャットの読み込みに失敗しました（${err.message}）`, { kind: 'error', actionLabel: '再試行', onAction: refreshChat });
    return;
  }
  renderChat();
}

function openChatDialog() {
  const dialog = document.getElementById('chatDialog');
  if (dialog.open) return;
  chatFocusReturn = captureFocusReturn();
  dialog.show();
  document.getElementById('chatFab').setAttribute('aria-expanded', 'true');
  attachToastRegionToTopmostDialog();
  refreshChat();
  chatTimer = setInterval(refreshChat, 5000);
  document.getElementById('chatInput').focus();
}

function setChatBusy(busy) {
  document.getElementById('chatSendBtn').disabled = busy;
  document.getElementById('chatNewSessionBtn').disabled = busy;
}

async function launchChatSession() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  const cwd = document.getElementById('chatCwdInput').value.trim();
  setChatBusy(true);
  const response = await postJson('/api/sessions/create', { cwd, text, chat: true, ...readLaunchSelects('chat') });
  setChatBusy(false);
  if (isUntrustedWorkspace(response)) {
    showUntrustedWorkspaceDialog(response.data.cwd, launchChatSession);
    return;
  }
  if (!response.ok) {
    showFailureToast(`セッションの起動に失敗しました: ${formatFailureReason(response)}`, launchChatSession);
    return;
  }
  input.value = '';
  chatLogView.jobId = response.data.jobId;
  await refreshChat();
}

async function sendChatMessage() {
  const session = selectedChatSession();
  if (!session) {
    await launchChatSession();
    return;
  }
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  setChatBusy(true);
  const response = await postJson('/api/sessions/reply', { jobId: session.jobId, text });
  setChatBusy(false);
  if (isUntrustedWorkspace(response)) {
    showUntrustedWorkspaceDialog(response.data.cwd, sendChatMessage);
    return;
  }
  if (!response.ok) {
    showFailureToast(`送信に失敗しました: ${formatFailureReason(response)}`, sendChatMessage);
    return;
  }
  if (!response.data.launched) {
    showToast('このセッションは稼働中です。完了または入力待ちになってから送ってください');
    return;
  }
  input.value = '';
  chatLogView.jobId = response.data.jobId;
  await refreshChat();
}

async function closeChatSession(jobId) {
  if (!confirm('このセッションを停止してタブを閉じますか？（ログはセッション一覧に残ります）')) return;
  const response = await postJson('/api/chat/close', { jobId });
  if (!response.ok && response.status !== 404) {
    showFailureToast(`セッションを閉じられませんでした: ${formatFailureReason(response)}`, () => closeChatSession(jobId));
    return;
  }
  if (chatLogView.jobId === jobId) chatLogView.jobId = null;
  showToast('セッションを閉じました');
  await refreshChat();
}

function setupChat() {
  const dialog = document.getElementById('chatDialog');
  document.getElementById('chatFab').addEventListener('click', () => (dialog.open ? dialog.close() : openChatDialog()));
  document.getElementById('chatDialogCloseBtn').addEventListener('click', () => dialog.close());
  // show() で開く非モーダルの dialog は Esc で閉じないため自前で閉じる。
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented) dialog.close();
  });
  dialog.addEventListener('close', () => {
    clearInterval(chatTimer);
    chatTimer = null;
    document.getElementById('chatFab').setAttribute('aria-expanded', 'false');
    attachToastRegionToTopmostDialog();
    restoreFocusReturn(chatFocusReturn);
    chatFocusReturn = null;
  });
  bindLaunchOnEnter(document.getElementById('chatInput'), sendChatMessage);
  document.getElementById('chatSendBtn').addEventListener('click', sendChatMessage);
  document.getElementById('chatNewSessionBtn').addEventListener('click', launchChatSession);
}

function setupInbox() {
  const dialog = document.getElementById('inboxDialog');
  document.getElementById('inboxBtn').addEventListener('click', () => (dialog.open ? dialog.close() : openInboxDialog()));
  document.getElementById('inboxDialogCloseBtn').addEventListener('click', () => dialog.close());
  // show() で開く非モーダルの dialog は Esc で閉じないため自前で閉じる。
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented) dialog.close();
  });
  const board = document.getElementById('board');
  board.addEventListener('dragover', onInboxMemoDragOver);
  board.addEventListener('drop', onInboxMemoDrop, true);
  board.addEventListener('dragleave', (e) => { if (!board.contains(e.relatedTarget)) clearInboxDropTarget(); });
  dialog.addEventListener('close', () => {
    attachToastRegionToTopmostDialog();
    restoreFocusReturn(inboxDialogFocusReturn);
    inboxDialogFocusReturn = null;
  });
  const newInput = document.getElementById('inboxNewInput');
  bindSubmitShortcut(newInput, addInboxMemo);
  bindInboxAttachments(newInput, () => inboxDraftId);
  document.getElementById('inboxAddBtn').addEventListener('click', addInboxMemo);

  const moveDialog = document.getElementById('inboxMoveDialog');
  document.getElementById('inboxMoveCloseBtn').addEventListener('click', () => moveDialog.close());
  moveDialog.addEventListener('click', (e) => { if (e.target === moveDialog) moveDialog.close(); });
  moveDialog.addEventListener('close', () => {
    inboxMovingMemo = null;
    attachToastRegionToTopmostDialog();
  });
  document.getElementById('inboxMoveColumnSelect').addEventListener('change', refreshInboxMoveBacklogTargets);
  document.getElementById('inboxMoveTitleInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      submitInboxMove();
    }
  });
  document.getElementById('inboxMoveSubmit').addEventListener('click', submitInboxMove);
  loadInbox();
}
