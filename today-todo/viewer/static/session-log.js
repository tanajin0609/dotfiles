function buildSessionLogEntryRow(entry, view) {
  const row = document.createElement('div');
  row.className = `log-entry ${entry.kind} ${entry.role || ''}`;
  const isTool = entry.kind === 'tool_use' || entry.kind === 'tool_result';
  const container = isTool ? document.createElement('details') : row;
  const role = document.createElement(isTool ? 'summary' : 'div');
  role.className = 'role';
  role.textContent = sessionLogEntryLabel(entry);
  container.appendChild(role);
  const body = document.createElement('div');
  body.className = 'body';
  body.textContent = entry.kind === 'tool_use' ? entry.input : entry.text;
  container.appendChild(body);
  if (isTool) row.appendChild(container);
  if (entry.kind === 'text' && entry.role === 'assistant' && entry.uuid && !view.noBranch) {
    const branchBtn = document.createElement('button');
    branchBtn.type = 'button';
    branchBtn.className = 'btn btn-icon btn--sm';
    branchBtn.dataset.focusKey = `log-branch:${entry.uuid}`;
    branchBtn.appendChild(icon('branch'));
    setButtonLabel(branchBtn, 'ここから分岐');
    branchBtn.disabled = !!(view.groupId && busyCommentsByGroupId.has(view.groupId));
    branchBtn.addEventListener('click', () => branchSessionFromEntry(view, entry.uuid));
    row.appendChild(branchBtn);
  }
  return row;
}

function buildPendingAskUserQuestionOptions(view, entries, session) {
  if (session && session.state === 'blocked' && Array.isArray(session.questions)) {
    // CLIはblock.questionsにmultiSelectを残さないため、単一選択か判別できない。複数選択の質問で選べなくなるより、全問トグル式にする。
    const questions = session.questions.map((q) => ({ ...q, multiSelect: true }));
    return buildAskUserQuestionOptions({ input: JSON.stringify({ questions }) }, view);
  }
  const lastEntry = entries[entries.length - 1];
  if (!lastEntry) return null;
  const isPendingAskUserQuestion = lastEntry.kind === 'tool_use' && lastEntry.name === 'AskUserQuestion' &&
    session && session.state === 'blocked';
  return isPendingAskUserQuestion ? buildAskUserQuestionOptions(lastEntry, view) : null;
}

// 5秒ごとに呼ばれるため、表示済みの選択肢は作り直さない（押そうとしているボタンのフォーカスを落とさない）。
function syncPendingAskUserQuestionOptions(view, list, entries, session) {
  const shown = list.querySelector(':scope > .ask-user-question-options');
  const shouldShow = !!buildPendingAskUserQuestionOptions(view, entries, session);
  if (shown && !shouldShow) shown.remove();
  if (!shown && shouldShow) list.appendChild(buildPendingAskUserQuestionOptions(view, entries, session));
}

// 稼働中は5秒ごとに呼ばれるため、毎回作り直すと読み返し中のスクロール位置とフォーカスが失われる。
function renderSessionLogEntries(view, entries, session) {
  const list = document.getElementById(view.listId);
  const entryKeys = entries.map((entry) => JSON.stringify(entry));
  const renderedKeys = view.renderedKeys;
  const canAppend = !!renderedKeys && renderedKeys.length <= entryKeys.length &&
    renderedKeys.every((key, index) => key === entryKeys[index]);
  if (canAppend && renderedKeys.length === entryKeys.length) {
    syncPendingAskUserQuestionOptions(view, list, entries, session);
    return;
  }
  const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
  const shouldFollow = !renderedKeys || distanceFromBottom < SESSION_LOG_FOLLOW_MARGIN_PX;
  if (canAppend) {
    const staleOptions = list.querySelector(':scope > .ask-user-question-options');
    if (staleOptions) staleOptions.remove();
    for (const entry of entries.slice(renderedKeys.length)) list.appendChild(buildSessionLogEntryRow(entry, view));
  } else {
    const focusReturn = list.contains(document.activeElement) ? captureFocusReturn() : null;
    list.replaceChildren(...entries.map((entry) => buildSessionLogEntryRow(entry, view)));
    restoreFocusReturn(focusReturn);
  }
  syncPendingAskUserQuestionOptions(view, list, entries, session);
  view.renderedKeys = entryKeys;
  const latestBranchable = entries.findLast((entry) => entry.kind === 'text' && entry.role === 'assistant' && entry.uuid);
  view.branchableUuid = latestBranchable ? latestBranchable.uuid : null;
  if (shouldFollow) list.scrollTop = list.scrollHeight;
}

// サーバーはtranscriptの所在がまだ記録されていないときも404を返すため、稼働中なら起動直後とみなす。
function resolveEmptySessionLogReason(session, status) {
  const isJustLaunched = status === 200 || session.state === 'working';
  return isJustLaunched ? '起動直後でまだログがありません' : '紐付くログがありません';
}

async function fetchAndRenderSessionLog(view, session) {
  let res;
  try {
    res = await fetch(`/api/session/transcript?jobId=${encodeURIComponent(session.jobId)}`);
  } catch {
    res = null;
  }
  if (view.jobId !== session.jobId) return;
  if (!res) {
    renderSessionLogMessage(view, 'ログを取得できませんでした（サーバーに接続できません）', session);
    return;
  }
  if (res.status === 404) {
    renderSessionLogMessage(view, resolveEmptySessionLogReason(session, res.status), session);
    // 最初のターンで回答待ちになったジョブはstate.jsonにtranscriptの所在がまだ無いが、質問はblockにある。
    syncPendingAskUserQuestionOptions(view, document.getElementById(view.listId), [], session);
    return;
  }
  if (!res.ok) {
    renderSessionLogMessage(view, `ログを取得できませんでした（HTTP ${res.status}）`, session);
    return;
  }
  const data = await res.json();
  if (!data.entries || data.entries.length === 0) {
    renderSessionLogMessage(view, resolveEmptySessionLogReason(session, res.status), session);
    return;
  }
  renderSessionLogEntries(view, data.entries, session);
}

function openSessionLogModal(column, group) {
  const session = group.session;
  if (!session) return;
  const dialog = document.getElementById('sessionLogDialog');
  const wasOpen = dialog.open;
  if (!wasOpen) sessionLogFocusReturn = captureFocusReturn();
  if (sessionLogView.groupId !== group.id) {
    document.getElementById('sessionLogReplyInput').value = '';
    resetLaunchSelects('sessionLog');
  }
  sessionLogView.jobId = session.jobId;
  sessionLogView.groupId = group.id;
  document.getElementById('sessionLogColLabel').textContent = column.name;
  applyColumnHue(document.getElementById('sessionLogDialog'), column.name);
  document.getElementById('sessionLogTitle').textContent = group.title;
  document.getElementById('sessionLogStateLabel').textContent = sessionStatusLabel(session);
  renderSessionLogMessage(sessionLogView, '読込中…', null);
  if (!wasOpen) dialog.showModal();
  attachToastRegionToTopmostDialog();
  if (!wasOpen) document.getElementById('sessionLogCloseBtn').focus();
  sessionLogView.session = session;
  fetchAndRenderSessionLog(sessionLogView, session);
  if (sessionLogView.timer) clearInterval(sessionLogView.timer);
  // 起動直後でまだstate.jsonの無いジョブや、開いた後に状態が変わるジョブがあるため、状態にかかわらず回す。
  sessionLogView.timer = setInterval(() => fetchAndRenderSessionLog(sessionLogView, sessionLogView.session), 5000);
}

// refreshSessionsの結果を開いているログダイアログへ反映する（jobIdが変われば継続先へ切り替える）。
function syncOpenSessionLog() {
  const dialog = document.getElementById('sessionLogDialog');
  if (!dialog.open || !sessionLogView.groupId) return;
  const found = findGroupById(sessionLogView.groupId);
  if (!found || !found.group.session) return;
  const next = found.group.session;
  if (next.jobId !== sessionLogView.jobId) {
    openSessionLogModal(found.column, found.group);
    return;
  }
  // 状態が変わった直後はtranscriptへの書き込みがまだ届いていないことがあるため、状態の変化に関係なく毎回取り直す。
  sessionLogView.session = next;
  document.getElementById('sessionLogStateLabel').textContent = sessionStatusLabel(next);
  fetchAndRenderSessionLog(sessionLogView, next);
}

function artifactUrl(jobId, filePath) {
  return `/api/session/artifact?jobId=${encodeURIComponent(jobId)}&path=${encodeURIComponent(filePath)}`;
}

function renderArtifactNav(jobId, artifacts, current) {
  const nav = document.getElementById('docNav');
  nav.replaceChildren();
  nav.hidden = artifacts.length < 2;
  for (const artifact of artifacts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const name = artifact.path.split('/').pop();
    btn.title = artifact.path;
    btn.setAttribute('aria-current', String(artifact === current));
    if (artifact.locked) {
      btn.textContent = `🔒 ${name}`;
      btn.disabled = true;
    } else if (!artifact.exists) {
      btn.textContent = `${name}（削除済み）`;
      btn.disabled = true;
    } else {
      btn.textContent = name;
      btn.addEventListener('click', () => {
        for (const other of nav.children) other.setAttribute('aria-current', String(other === btn));
        openArtifactDoc(jobId, artifact);
      });
    }
    nav.appendChild(btn);
  }
}

async function openArtifactDoc(jobId, artifact) {
  const dialog = document.getElementById('docDialog');
  if (!dialog.open) docFocusReturn = captureFocusReturn();
  docArtifactJobId = jobId;
  document.getElementById('docTitle').textContent = artifact.path.split('/').pop();
  document.getElementById('docPath').textContent = artifact.path;
  document.getElementById('docQuoteBtn').hidden = false;
  renderDocReviewControls();
  const status = document.getElementById('docStatus');
  const loadId = ++docLoadSeq;
  status.textContent = '読み込み中…';
  replaceDocFrame('');
  if (!dialog.open) dialog.showModal();
  attachToastRegionToTopmostDialog();
  const url = artifactUrl(jobId, artifact.path);
  if (artifact.kind === 'html') {
    status.textContent = '';
    replaceDocFrame('', { src: url });
    return;
  }
  if (artifact.kind === 'image') {
    status.textContent = '';
    replaceDocFrame(docFrameHtml(`<img src="${escapeHtml(url)}" alt="${escapeHtml(artifact.path)}" style="max-width: 100%;">`));
    return;
  }
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    if (loadId === docLoadSeq) status.textContent = `読み込みに失敗しました: ${err.message}`;
    return;
  }
  if (loadId !== docLoadSeq) return;
  if (!response.ok) {
    status.textContent = `この資料は表示できません（${response.status}）`;
    return;
  }
  const markdown = await response.text();
  if (loadId !== docLoadSeq) return;
  status.textContent = '';
  replaceDocFrame(docFrameHtml(renderMarkdownHtml(markdown)));
}

async function openSessionArtifacts(view) {
  const jobId = view.jobId;
  if (!jobId) return;
  const res = await fetch(`/api/session/artifacts?jobId=${encodeURIComponent(jobId)}`).catch(() => null);
  if (!res || !res.ok) {
    showToast('資料一覧の読み込みに失敗しました', { kind: 'error', actionLabel: '再試行', onAction: () => openSessionArtifacts(view) });
    return;
  }
  const { artifacts } = await res.json();
  if (view.jobId !== jobId) return;
  if (!artifacts.length) {
    showToast('このセッションが書いた資料はありません');
    return;
  }
  const first = artifacts.find((a) => a.exists && !a.locked);
  if (!first) {
    showToast('開ける資料がありません（ロック中または削除済み）');
    return;
  }
  renderArtifactNav(jobId, artifacts, first);
  docArtifactInputId = view.inputId;
  openArtifactDoc(jobId, first);
}

function closeSessionLogModal() {
  document.getElementById('sessionLogDialog').close();
}

function onSessionLogDialogClosed() {
  sessionLogView.jobId = null;
  sessionLogView.session = null;
  sessionLogView.groupId = null;
  sessionLogView.renderedKeys = null;
  sessionLogView.branchableUuid = null;
  if (sessionLogView.timer) {
    clearInterval(sessionLogView.timer);
    sessionLogView.timer = null;
  }
  attachToastRegionToTopmostDialog();
  restoreFocusReturn(sessionLogFocusReturn);
  sessionLogFocusReturn = null;
}

async function refreshSessions() {
  if (!currentFile || !boardData) return;
  const res = await fetch(`/api/sessions?file=${encodeURIComponent(currentFile)}`);
  if (!res.ok) return;
  const map = await res.json();
  let changed = false;
  for (const column of boardData.columns) {
    for (const group of column.groups) {
      const next = map[group.id] || null;
      if (JSON.stringify(next) !== JSON.stringify(group.session || null)) changed = true;
      group.session = next;
    }
  }
  if (changed) renderBoard();
  syncOpenSessionLog();
  syncModalSessionLog();
}

const SEEN_STORAGE_KEY = 'viewer-seen-v1';
const SESSION_RESPONDED_STATES = ['done', 'blocked', 'failed'];

// 単一セッションのときは従来どおりupdatedAtそのものになるので、既存の既読記録とも比較できる。
function respondedSessionSignature(group) {
  const parts = listCardSessions(group).filter((s) => SESSION_RESPONDED_STATES.includes(s.state)).map((s) => s.updatedAt).sort();
  return parts.length ? parts.join('|') : null;
}
let seenRecords = loadSeenRecords();

function loadSeenRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(SEEN_STORAGE_KEY));
    return records && typeof records === 'object' ? records : null;
  } catch {
    return null;
  }
}

function saveSeenRecords() {
  localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(seenRecords));
}
