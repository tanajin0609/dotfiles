// ボード上は、カードの複数セッションのうち最も手当てが要る状態を代表として見せる（AC-MT-2）。
function representativeSessionOf(group) {
  const rank = (s) => { const i = SESSION_STATE_PRIORITY.indexOf(s.state); return i < 0 ? SESSION_STATE_PRIORITY.length : i; };
  return listCardSessions(group).reduce((best, s) => (!best || rank(s) < rank(best) ? s : best), null);
}

function formatSessionTabLabel(session) {
  const at = session.launchedAt ? new Date(session.launchedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '起動日時不明';
  return `${at} · ${sessionStatusLabel(session)}`;
}

function renderModalSessionTabs(sessions, selected) {
  const tabs = document.getElementById('modalSessionTabs');
  tabs.hidden = sessions.length === 0;
  tabs.replaceChildren(...sessions.map((s) => {
    const wrap = document.createElement('span');
    wrap.className = 'session-tab';
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'btn btn--sm chip';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(s === selected));
    tab.textContent = formatSessionTabLabel(s);
    tab.addEventListener('click', () => {
      modalSelectedJobId = s.jobId;
      renderModalSessionLog();
    });
    const close = buildIconButton('close', 'セッションを閉じる', 'sm');
    close.addEventListener('click', () => closeCardSession(modalGroup.id, s.jobId));
    wrap.append(tab, close);
    return wrap;
  }));
}

async function closeCardSession(groupId, jobId) {
  if (!confirm('このセッションを停止してタブを閉じますか？（ログはセッション一覧に残ります）')) return;
  const response = await postJson('/api/session/close', { file: currentFile, groupId, jobId });
  if (!response.ok && response.status !== 404) {
    showFailureToast(`セッションを閉じられませんでした: ${formatFailureReason(response)}`, () => closeCardSession(groupId, jobId));
    return;
  }
  if (modalSelectedJobId === jobId) modalSelectedJobId = null;
  showToast('セッションを閉じました');
  await refreshSessions();
}

function selectedModalSession() {
  const sessions = listCardSessions(modalGroup);
  return sessions.find((s) => s.jobId === modalSelectedJobId) || sessions[0] || null;
}

// 選択中のタブのセッションのログを出し、入力欄の送信先・分岐元にもする（AC-CSL-2）。
function renderModalSessionLog() {
  if (!modalGroup) return;
  const current = modalGroup.session;
  const sessions = current ? [...(current.history || []), current] : [];
  const selected = selectedModalSession();
  document.getElementById('modalCommentHead').textContent = selected ? `セッション · ${sessionStatusLabel(selected)}` : 'セッション';
  renderModalSessionTabs(sessions, selected);
  document.getElementById('modalSessionArtifactsBtn').hidden = !selected;
  if (!selected) {
    modalLogView.jobId = null;
    modalLogView.session = null;
    renderSessionLogMessage(modalLogView, 'まだClaudeに依頼していません', null);
    return;
  }
  if (modalLogView.jobId !== selected.jobId) {
    modalLogView.jobId = selected.jobId;
    modalLogView.renderedKeys = null;
    renderSessionLogMessage(modalLogView, '読込中…', null);
  }
  modalLogView.session = selected;
  fetchAndRenderSessionLog(modalLogView, selected);
  renderModalChangeSummary(selected);
}

// 「終わった」の確認を viewer の中で済ませられるよう、セッションが書いたファイルの増減をカード詳細に出す。
const changeSummaryCache = new Map();
const CHANGE_STATUS_LABELS = { modified: '変更', added: '追加', untracked: '新規', deleted: '削除', unchanged: '差分なし' };

async function renderModalChangeSummary(session) {
  const box = document.getElementById('modalChangeSummary');
  if (!session || !session.jobId) {
    box.hidden = true;
    return;
  }
  const key = `${session.jobId}|${session.updatedAt || ''}|${session.state || ''}`;
  let files = changeSummaryCache.get(key);
  if (!files) {
    const res = await fetch(`/api/session/changes?jobId=${encodeURIComponent(session.jobId)}`).catch(() => null);
    if (!res || !res.ok) {
      box.hidden = true;
      return;
    }
    files = (await res.json()).files;
    changeSummaryCache.set(key, files);
  }
  if (modalLogView.jobId !== session.jobId) return;
  const changed = files.filter((f) => f.status !== 'unchanged');
  box.hidden = !files.length;
  if (!files.length) return;
  const added = changed.reduce((n, f) => n + (f.added || 0), 0);
  const deleted = changed.reduce((n, f) => n + (f.deleted || 0), 0);
  document.getElementById('modalChangeSummaryText').textContent = changed.length
    ? `変更 ${changed.length}ファイル（+${added} −${deleted}）`
    : `書いた ${files.length}ファイルはすべてコミット済み`;
  document.getElementById('modalChangeList').replaceChildren(...files.map((f) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = CHANGE_STATUS_LABELS[f.status] || f.status;
    const p = document.createElement('span');
    p.className = 'change-path';
    p.textContent = f.path;
    p.title = f.path;
    li.append(label, p);
    if (f.added != null) {
      const a = document.createElement('span');
      a.className = 'change-add';
      a.textContent = `+${f.added}`;
      const d = document.createElement('span');
      d.className = 'change-del';
      d.textContent = `−${f.deleted || 0}`;
      li.append(a, d);
    }
    return li;
  }));
}

// 送信直後は状態がすぐ変わるので、5秒ごとの取得を待たずに1秒おきに数回取り直す。
function refreshSessionsSoon() {
  for (let i = 1; i <= 5; i++) setTimeout(() => refreshSessions(), i * 1000);
}

function refreshOpenCardPanel() {
  if (!modalGroup || !document.getElementById('cardDialog').open) return;
  const found = findGroupById(modalGroup.id);
  if (found) openModal(found.column, found.group);
  else closeModal();
}

function syncModalSessionLog() {
  if (!modalGroup || !document.getElementById('cardDialog').open) return;
  const found = findGroupById(modalGroup.id);
  if (found) modalGroup = found.group;
  renderModalSessionLog();
}

function submitModalTask() {
  const input = document.getElementById('modalTaskInput');
  const text = input.value.trim();
  if (!modalGroup) return;
  if (!text) {
    showFieldError(input, 'タスクの内容を入力してください');
    input.focus();
    return;
  }
  addTaskToCard({ file: currentFile, columnName: modalColumnName, groupId: modalGroup.id, groupTitle: modalGroup.title }, text);
}

async function addTaskToCard(target, text) {
  const { file, columnName, groupId, groupTitle } = target;
  const response = await runOwnBoardWrite(file, () => postJson('/api/tasks', { file, columnName, groupTitle, text }));
  if (!response.ok) {
    showFailureToast(`タスク追加に失敗しました: ${formatFailureReason(response)}`, () => addTaskToCard(target, text));
    return;
  }
  const isShowingTarget = modalGroup && modalGroup.id === groupId;
  const input = document.getElementById('modalTaskInput');
  if (isShowingTarget && input.value.trim() === text) input.value = '';
  if (response.data.mirroredToAggregate) {
    if (file === currentFile) await loadBoard(currentFile);
    const found = findGroupById(groupId);
    if (isShowingTarget && found) openModal(found.column, found.group);
    showToast('タスクを追加しました');
  } else {
    showToast('元のtodo.mdにタスクを追加しました（このボードへの反映は次回のtodo-import実行後になります）');
  }
}

const ICON_PATHS = {
  reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  focus: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="3"/>',
  expand: '<path d="M7 9l5-5 5 5"/><path d="M7 15l5 5 5-5"/>',
  collapse: '<path d="M7 4l5 5 5-5"/><path d="M7 20l5-5 5 5"/>',
  enlarge: '<path d="M14 4h6v6"/><path d="M20 4l-7 7"/><path d="M10 20H4v-6"/><path d="M4 20l7-7"/>',
  shrink: '<path d="M20 10h-6V4"/><path d="M14 10l6-6"/><path d="M4 14h6v6"/><path d="M10 14l-6 6"/>',
  comment: '<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
  copy: '<path d="M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z"/><path d="M16 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  later: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  next: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  doc: '<path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4"/><path d="M8.5 12h7M8.5 16h7"/>',
  quote: '<path d="M10 7c-2.8.8-4.5 2.8-4.5 6v4H10v-4.5H7.5"/><path d="M19 7c-2.8.8-4.5 2.8-4.5 6v4H19v-4.5h-2.5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  branch: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 8v8"/><path d="M18 8a6 6 0 0 1-6 6H8"/>',
  send: '<path d="M21 3L10 14"/><path d="M21 3l-6.5 18-4.5-7-7-4.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  memo: '<path d="M13 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/><path d="M17.5 3.5l3 3L13 14h-3v-3z"/>',
  check: '<path d="M6 12.5l4 4 8-9"/>',
};

function icon(name) {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
  return t.content.firstChild;
}

function setButtonLabel(btn, label) {
  btn.setAttribute('aria-label', label);
  btn.dataset.tip = label;
}

function buildIconButton(name, label, size = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn btn-icon${size ? ` btn--${size}` : ''}`;
  btn.appendChild(icon(name));
  setButtonLabel(btn, label);
  return btn;
}

function setBusyLabel(btn, busyLabel, idleLabel) {
  if (busyLabel) btn.setAttribute('aria-busy', 'true');
  else btn.removeAttribute('aria-busy');
  setButtonLabel(btn, busyLabel || idleLabel);
}

const COMMENT_BUSY_LABELS = { launch: '起動中…' };
const COMMENT_IDLE_LABELS = { launch: 'Claudeに依頼', newSession: '新規セッションで依頼' };

// 送信中の表示は、閉じて別カードを開き直したときに持ち越さないようカードIDで判定する。
function renderModalCommentControls() {
  const busy = modalGroup ? busyCommentsByGroupId.get(modalGroup.id) : null;
  const isBusy = !!busy;
  const launchBtn = document.getElementById('modalCommentLaunchBtn');
  const newSessionBtn = document.getElementById('modalCommentNewSessionBtn');
  const input = document.getElementById('modalCommentInput');
  launchBtn.disabled = isBusy;
  newSessionBtn.disabled = isBusy;
  input.disabled = isBusy;
  for (const btn of document.querySelectorAll('#modalCommentList .ask-user-question-buttons button, #modalCommentList [data-focus-key^="log-branch:"]')) {
    btn.disabled = isBusy;
  }
  setBusyLabel(launchBtn, isBusy && busy.mode === 'launch' && COMMENT_BUSY_LABELS.launch, COMMENT_IDLE_LABELS.launch);
  setBusyLabel(newSessionBtn, isBusy && busy.mode === 'newSession' && COMMENT_BUSY_LABELS.launch, COMMENT_IDLE_LABELS.newSession);
}

// セッションログダイアログの返信欄も、同じbusyCommentsByGroupIdをsessionLogGroupIdで参照するだけなので
// カード詳細とは独立に描画してよい（両方開いていても状態は一致する）。
function renderSessionLogReplyControls() {
  const busy = sessionLogView.groupId ? busyCommentsByGroupId.get(sessionLogView.groupId) : null;
  const isBusy = !!busy;
  const replyBtn = document.getElementById('sessionLogReplyBtn');
  const replyInput = document.getElementById('sessionLogReplyInput');
  const newSessionBtn = document.getElementById('sessionLogNewSessionBtn');
  replyBtn.disabled = isBusy;
  replyInput.disabled = isBusy;
  newSessionBtn.disabled = isBusy;
  setBusyLabel(replyBtn, isBusy && busy.mode === 'launch' && COMMENT_BUSY_LABELS.launch, 'このセッションに送信');
  setBusyLabel(newSessionBtn, isBusy && busy.mode === 'newSession' && COMMENT_BUSY_LABELS.launch, '新しいセッションで依頼');
  for (const btn of document.querySelectorAll('#sessionLogList .ask-user-question-buttons button, #sessionLogList [data-focus-key^="log-branch:"]')) {
    btn.disabled = isBusy;
  }
}

async function runWithCommentBusy(groupId, mode, operation) {
  const busy = { mode };
  busyCommentsByGroupId.set(groupId, busy);
  renderModalCommentControls();
  renderSessionLogReplyControls();
  try {
    await operation();
  } finally {
    // 同じカードの再試行と重なったとき、先に終わった側が後の送信中表示を消さないようにする。
    if (busyCommentsByGroupId.get(groupId) === busy) busyCommentsByGroupId.delete(groupId);
    renderModalCommentControls();
    renderSessionLogReplyControls();
    // 送信中にdisabledにした入力欄・ボタンからフォーカスが外れたままにしない。
    const dialog = document.getElementById('cardDialog');
    const hasLostFocus = document.activeElement === document.body || document.activeElement === dialog;
    if (dialog.open && modalGroup && modalGroup.id === groupId && hasLostFocus) {
      document.getElementById('modalCommentInput').focus();
    }
    const sessionLogDialogEl = document.getElementById('sessionLogDialog');
    const hasLostSessionLogFocus = document.activeElement === document.body || document.activeElement === sessionLogDialogEl;
    if (sessionLogDialogEl.open && sessionLogView.groupId === groupId && hasLostSessionLogFocus) {
      document.getElementById('sessionLogReplyInput').focus();
    }
  }
}

function saveModalCommentAndLaunch() {
  submitModalComment();
}

function saveModalCommentAndLaunchNewSession() {
  submitModalComment({ newSession: true });
}

function submitModalComment(launchOptions = {}) {
  const text = document.getElementById('modalCommentInput').value.trim();
  if (!text || !modalGroup || busyCommentsByGroupId.has(modalGroup.id)) return;
  const target = { file: currentFile, columnName: modalColumnName, groupId: modalGroup.id, groupTitle: modalGroup.title };
  const selected = launchOptions.newSession ? null : selectedModalSession();
  sendCardComment(target, text, { ...launchOptions, ...readLaunchSelects('modal'), ...(selected ? { jobId: selected.jobId } : {}) }, takeDraft('modalCommentInput', () => modalGroup && modalGroup.id === target.groupId));
}

function submitSessionLogReply() {
  const text = document.getElementById('sessionLogReplyInput').value.trim();
  if (!text || !sessionLogView.groupId || busyCommentsByGroupId.has(sessionLogView.groupId)) return;
  const found = findGroupById(sessionLogView.groupId);
  if (!found) return;
  const target = { file: currentFile, columnName: found.column.name, groupId: sessionLogView.groupId, groupTitle: found.group.title };
  sendCardComment(target, text, readLaunchSelects('sessionLog'), takeDraft('sessionLogReplyInput', () => sessionLogView.groupId === target.groupId));
}

// 送信した時点で入力欄を空にし、取り消したら同じカードを開いたままのときだけチップごと書きかけを戻す関数を返す。
function takeDraft(inputId, isSameCard) {
  const input = document.getElementById(inputId);
  const draftHtml = input.innerHTML;
  input.value = '';
  return () => {
    if (!isSameCard() || input.value.trim()) return;
    input.innerHTML = draftHtml;
    input.focus();
  };
}

const UNDO_SENT_TOAST_MS = 5000;

async function cancelSentRequest(target, at, jobId, restore) {
  const response = await postJson('/api/session/cancel', { file: target.file, groupId: target.groupId, at, ...(jobId ? { jobId } : {}) });
  if (response.status === 409) {
    showToast('セッションが切り替わったため取り消せません');
    return;
  }
  if (!response.ok) {
    showFailureToast(`取り消しに失敗しました: ${formatFailureReason(response)}`, () => cancelSentRequest(target, at, jobId, restore));
    return;
  }
  const found = target.file === currentFile ? findGroupById(target.groupId) : null;
  if (found) found.group.comments = response.data.comments;
  showToast(response.data.stopped ? '送信を取り消しました（セッションを停止）' : '依頼の記録を削除しました');
  restore();
  await refreshSessions();
}

function bindSessionLogQuote(view) {
  const list = document.getElementById(view.listId);
  let button = null;
  const removeButton = () => { if (button) button.remove(); button = null; };
  list.addEventListener('mousedown', removeButton);
  list.addEventListener('scroll', removeButton);
  list.addEventListener('mouseup', () => {
    removeButton();
    const quote = readSelectionWithin(list);
    if (!quote) return;
    const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'anno-add log-quote-btn';
    button.textContent = '引用';
    button.addEventListener('mousedown', (e) => e.preventDefault());
    button.addEventListener('click', () => {
      removeButton();
      addQuoteChip(view.inputId, toLineQuote(quote));
    });
    // dialogはtop layerに出るため、ボタンも同じdialogの中に置かないと下に隠れる。
    list.closest('dialog').appendChild(button);
    button.style.left = `${Math.max(8, Math.min(rect.right + 4, window.innerWidth - button.offsetWidth - 8))}px`;
    button.style.top = `${Math.max(8, rect.top - button.offsetHeight - 4)}px`;
  });
}

function branchSessionFromLatestEntry() {
  if (!sessionLogView.branchableUuid) {
    showToast('引き継げる会話がまだありません');
    return;
  }
  branchSessionFromEntry(sessionLogView, sessionLogView.branchableUuid, 'newSession');
}

function branchSessionFromEntry(view, uuid, busyMode = 'launch') {
  const input = document.getElementById(view.inputId);
  const text = input.value.trim();
  if (!view.groupId || busyCommentsByGroupId.has(view.groupId)) return;
  const found = findGroupById(view.groupId);
  if (!found) {
    showToast('分岐は表示中のtodoファイルのセッションだけが対象です');
    return;
  }
  if (!text) {
    showToast('分岐後の指示を返信欄に入力してください');
    input.focus();
    return;
  }
  const target = { file: currentFile, columnName: found.column.name, groupId: view.groupId, groupTitle: found.group.title };
  const sourceJobId = view.jobId;
  runWithCommentBusy(target.groupId, busyMode, async () => {
    const response = await postJson('/api/session/branch', { ...target, uuid, text, jobId: sourceJobId, ...readLaunchSelects(view === sessionLogView ? 'sessionLog' : 'modal') });
    if (response.status === 409) {
      showToast('このカードは起動処理中です');
      return;
    }
    if (isUntrustedWorkspace(response)) {
      showUntrustedWorkspaceDialog(response.data.cwd, () => branchSessionFromEntry(view, uuid, busyMode));
      return;
    }
    if (!response.ok) {
      showFailureToast(`分岐に失敗しました: ${formatFailureReason(response)}`, () => branchSessionFromEntry(view, uuid, busyMode));
      return;
    }
    input.value = '';
    if (view === sessionLogView) closeSessionLogModal();
    else modalSelectedJobId = null;
    showToast(`分岐したセッションを起動しました（id: ${response.data.jobId}）`);
    await refreshSessions();
    refreshSessionsSoon();
  });
}

function sendCardComment(target, text, launchOptions = {}, restore = () => {}) {
  const mode = launchOptions.newSession ? 'newSession' : 'launch';
  return runWithCommentBusy(target.groupId, mode, async () => {
    const response = await postJson('/api/comments', { file: target.file, groupId: target.groupId, text });
    if (!response.ok) {
      showFailureToast(
        `コメントの保存に失敗しました: ${formatFailureReason(response)}`,
        () => sendCardComment(target, text, launchOptions, restore),
      );
      return;
    }
    const found = target.file === currentFile ? findGroupById(target.groupId) : null;
    if (found) found.group.comments = response.data.comments;
    if (found) renderBoard();
    const saved = response.data.comments;
    await launchCardSession(target, text, { ...launchOptions, restore }, saved.length > 0 ? saved[saved.length - 1].at : null);
  });
}

function retryCardSessionLaunch(target, text, launchOptions, commentAt) {
  return runWithCommentBusy(target.groupId, launchOptions.newSession ? 'newSession' : 'launch', () => launchCardSession(target, text, launchOptions, commentAt));
}

async function launchCardSession(target, text, launchOptions = {}, commentAt = null) {
  const undoable = (jobId) => (commentAt
    ? { actionLabel: '取り消す', durationMs: UNDO_SENT_TOAST_MS, onAction: () => cancelSentRequest(target, commentAt, jobId, launchOptions.restore || (() => {})) }
    : {});
  const { file, groupId, columnName, groupTitle } = target;
  showBudgetHintIfNeeded();
  const before = file === currentFile ? findGroupById(groupId) : null;
  const hadSession = !!(before && before.group.session) && launchOptions.newSession !== true;
  const response = await postJson('/api/session/launch', { file, groupId, columnName, groupTitle, text, newSession: launchOptions.newSession === true, jobId: launchOptions.jobId, model: launchOptions.model, effort: launchOptions.effort });
  if (response.status === 409 && response.data && response.data.error === 'session changed') {
    showToast('送信先のセッションが閉じられたため送れませんでした（コメントは保存しました）');
  } else if (response.status === 409) {
    showToast('このカードは起動処理中です（コメントは保存しました）');
  } else if (isUntrustedWorkspace(response)) {
    showUntrustedWorkspaceDialog(response.data.cwd, () => retryCardSessionLaunch(target, text, launchOptions, commentAt));
  } else if (!response.ok) {
    showFailureToast(
      `セッション起動に失敗しました（コメントは保存済み）: ${formatFailureReason(response)}`,
      () => retryCardSessionLaunch(target, text, launchOptions, commentAt),
    );
  } else if (response.data.launched === false) {
    showToast('このカードは既にセッションが稼働中です（コメントのみ保存しました）', undoable(null));
  } else {
    const options = undoable(response.data.jobId);
    const isTargetSelected = launchOptions.newSession || (launchOptions.jobId && launchOptions.jobId === modalSelectedJobId);
    if (modalGroup && modalGroup.id === groupId && isTargetSelected) modalSelectedJobId = response.data.jobId;
    if (hadSession && response.data.resumed === false) {
      showToast(`履歴を引き継げなかったため新規セッションで起動しました（id: ${response.data.jobId}）`, options);
    } else if (response.data.copied) {
      showToast(`セッションが停止しきらず、履歴を引き継いだ別のセッションで起動しました（id: ${response.data.jobId}）`, options);
    } else {
      showToast(`セッションを起動しました（id: ${response.data.jobId}）`, options);
    }
    await refreshSessions();
    refreshSessionsSoon();
  }
}

function buildSharePrompt(scopeLabel, pairs) {
  const withComments = pairs.filter((p) => p.group.comments && p.group.comments.length > 0);
  if (withComments.length === 0) return null;

  const sections = withComments.map(({ column, group }) => {
    const lines = [`## ${column}: ${group.title}`, 'タスク:'];
    for (const t of group.tasks) lines.push(`- [${t.done ? 'x' : ' '}] ${t.text}`);
    lines.push('コメント:');
    for (const c of group.comments) lines.push(`- ${c.text}`);
    return lines.join('\n');
  });

  return `# Todo コメントまとめ（${scopeLabel}）\n\n${sections.join('\n\n')}`;
}

async function copyPrompt(scopeLabel, pairs) {
  const prompt = buildSharePrompt(scopeLabel, pairs);
  if (!prompt) {
    showToast('共有できるコメントがありません');
    return;
  }
  try {
    await navigator.clipboard.writeText(prompt);
    showToast(`クリップボードにコピーしました（${scopeLabel}）`);
  } catch {
    showToast('コピーに失敗しました', { kind: 'error' });
  }
}

function syncUrlHash() {
  if (!boardData || renderedBoardFile !== currentFile) return;
  const params = new URLSearchParams();
  params.set('file', currentFile);
  if (focusMode && focusTarget) params.set('focus', focusTarget);
  if (modalGroup && document.getElementById('cardDialog').open) params.set('card', modalGroup.id);
  history.replaceState(null, '', `#${params}`);
}

function readUrlHashState() {
  const params = new URLSearchParams(location.hash.slice(1));
  const file = params.get('file');
  if (!file) return null;
  return {
    file,
    focusTarget: params.get('focus'),
    cardId: params.get('card'),
  };
}

// 列名・カードIDが今のボードに無い場合（古いURL）は、その項目だけ無視する。
function restoreUrlViewState(hashState) {
  if (hashState.focusTarget) enterFocusMode(hashState.focusTarget);
  const found = hashState.cardId ? findGroupById(hashState.cardId) : null;
  if (found) openModal(found.column, found.group);
}
