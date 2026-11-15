function pruneFocusQueue() {
  const removedBeforeIndex = focusQueueIds.slice(0, focusIndex).filter((id) => !findGroupById(id)).length;
  focusQueueIds = focusQueueIds.filter((id) => findGroupById(id));
  focusIndex = Math.max(0, focusIndex - removedBeforeIndex);
}

function advanceFocus() {
  focusIndex += 1;
  renderFocusCard();
}

// 最後のカードで「後で」を押したときは、回す先が今の位置と同じなので「次へ」と同じく一巡させる。
function deferFocusCard() {
  if (focusIndex >= focusQueueIds.length - 1) {
    advanceFocus();
    return;
  }
  const [deferredId] = focusQueueIds.splice(focusIndex, 1);
  focusQueueIds.push(deferredId);
  renderFocusCard();
}

function restartFocusRound() {
  const openIds = (listFocusTargetEntries(focusTarget) || []).filter((e) => !e.group.done).map((e) => e.group.id);
  const openIdSet = new Set(openIds);
  const keptIds = focusQueueIds.filter((id) => openIdSet.has(id));
  focusQueueIds = [...keptIds, ...openIds.filter((id) => !keptIds.includes(id))];
  focusIndex = 0;
  renderFocusCard();
  moveFocusIntoFocusPanel();
}

function completeFirstOpenTaskOfFocusModeCard() {
  const found = focusIndex < focusQueueIds.length ? findGroupById(focusQueueIds[focusIndex]) : null;
  if (found) completeFirstOpenTask(found.group);
}

function renderFocusCard() {
  pruneFocusQueue();
  const total = focusQueueIds.length;
  const strip = document.getElementById('focusStrip');
  strip.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const seg = document.createElement('span');
    seg.style.background = i < focusIndex ? 'var(--ink)' : i === focusIndex ? 'var(--accent)' : 'var(--track)';
    strip.appendChild(seg);
  }
  document.getElementById('focusPositionText').textContent = `${Math.min(focusIndex + 1, total)} / ${total}`;

  const card = document.getElementById('focusCard');
  const emptyEl = document.getElementById('focusEmpty');
  if (total === 0 || focusIndex >= total) {
    card.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    renderFocusEnd();
    return;
  }
  emptyEl.classList.add('hidden');
  card.classList.remove('hidden');

  const { column, group } = findGroupById(focusQueueIds[focusIndex]);
  document.getElementById('focusColLabel').textContent = column.name;
  applyColumnHue(document.getElementById('focusCard'), column.name);
  document.getElementById('focusTitle').textContent = group.title;

  const tasksEl = document.getElementById('focusTasks');
  tasksEl.innerHTML = '';
  for (const task of group.tasks) {
    const row = document.createElement('div');
    row.className = 'focus-task' + (task.done ? ' done' : '');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.dataset.focusKey = `focus-task:${task.id}`;
    const syncRow = () => {
      checkbox.checked = task.done;
      row.classList.toggle('done', task.done);
    };
    checkbox.addEventListener('change', () => toggleTaskDone(task, group, syncRow));
    row.appendChild(checkbox);
    const text = document.createElement('span');
    text.className = 'focus-task-text';
    text.id = `focus-task-${task.id}-text`;
    renderInlineMarkdown(text, splitTaskSource(task.text).body);
    checkbox.setAttribute('aria-labelledby', text.id);
    row.appendChild(text);
    bindRowClickToCheckbox(row, checkbox);
    tasksEl.appendChild(row);
  }

  const noteEl = document.getElementById('focusNote');
  if (group.comments && group.comments.length > 0) {
    noteEl.textContent = group.comments[group.comments.length - 1].text;
    noteEl.classList.remove('hidden');
  } else {
    noteEl.textContent = '';
    noteEl.classList.add('hidden');
  }

  const previewEl = document.getElementById('focusNextPreview');
  const next = focusIndex + 1 < total ? findGroupById(focusQueueIds[focusIndex + 1]) : null;
  previewEl.textContent = next ? `次：${next.group.title}` : 'これが最後のカードです';
}

function renderFocusEnd() {
  const targetEntries = listFocusTargetEntries(focusTarget) || [];
  const openCount = targetEntries.filter((e) => !e.group.done).length;
  const messageEl = document.getElementById('focusEndMessage');
  if (focusTarget === FOCUS_TARGET_STARRED && targetEntries.length === 0) {
    messageEl.textContent = '★を付けたカードがありません（カード右上の☆かカード詳細で付けられます）';
  } else if (openCount === 0) {
    messageEl.textContent = 'すべて完了しました';
  } else {
    messageEl.textContent = `一巡しました（未完了${openCount}件）`;
  }
  document.getElementById('focusRestartBtn').hidden = openCount === 0;
}

const ROW_CLICK_IGNORED_SELECTOR = 'button, a, input, .task-source-path';

// <label>で行を包まないのは、行内に引用ボタン等を置くとlabelの中に対話要素が入り、
// クリック範囲とアクセシブルネームの両方に余計な文言が混ざるため。
function bindRowClickToCheckbox(row, checkbox) {
  row.addEventListener('click', (e) => {
    if (e.target.closest(ROW_CLICK_IGNORED_SELECTOR)) return;
    // 部分引用（AC-QT-2）のためにドラッグ選択した操作でチェックを切り替えない。
    if (readSelectionWithin(row)) return;
    checkbox.click();
  });
}

function sessionStatusLabel(session) {
  if (session.state === 'working') return '稼働中';
  if (session.state === 'blocked') return '入力待ち';
  if (session.state === 'done') return '完了';
  if (session.state === 'failed') return '失敗';
  if (session.state === 'unknown') return '不明（ジョブ削除済み）';
  return session.state ? `不明（${session.state}）` : '不明';
}

function buildSessionStateMarker(state) {
  const marker = document.createElement('span');
  marker.setAttribute('aria-hidden', 'true');
  if (state === 'blocked') {
    marker.className = 'session-icon';
    // U+FE0E を付けないと環境によって絵文字（カラー）で描かれ、状態色が当たらない。
    marker.textContent = '⏸\uFE0E';
  } else {
    marker.className = 'session-dot';
  }
  return marker;
}

function buildSessionStatus(group) {
  const session = representativeSessionOf(group);
  if (!session) return null;
  const wrap = document.createElement('div');
  wrap.className = `card-session ${session.state || ''}`;
  wrap.appendChild(buildSessionStateMarker(session.state));
  const label = document.createElement('span');
  label.className = 'session-label';
  label.textContent = sessionStatusLabel(session);
  wrap.appendChild(label);
  if (session.detail) {
    const detail = document.createElement('span');
    detail.className = 'session-detail';
    detail.textContent = session.detail;
    wrap.appendChild(detail);
  }
  return wrap;
}

// カードの状態を「未着手 → 稼働中 → 自分待ち → 完了」の1本で表す。Claude が応答済みでまだ開いていないカードも自分待ちに数える。
const FLOW_LABELS = { todo: '未着手', running: '稼働中', waiting: '自分待ち', done: '完了' };
const OFF_CARD_FLOW = { blocked: 'waiting', failed: 'waiting', working: 'running' };

function cardFlowOf(group) {
  const session = representativeSessionOf(group);
  if (session && (session.state === 'blocked' || session.state === 'failed')) return 'waiting';
  if (session && session.state === 'working') return 'running';
  if (unreadMarksOf(group).some((m) => m.kind === 'session')) return 'waiting';
  if (group.done) return 'done';
  return 'todo';
}

let offCardSessions = [];
const lastFlowStates = new Map();

function flowItemButton(title, sub, onClick) {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'flow-item';
  const main = document.createElement('span');
  main.textContent = title;
  const meta = document.createElement('span');
  meta.className = 'flow-item-sub';
  meta.textContent = sub;
  button.append(main, meta);
  button.addEventListener('click', onClick);
  li.append(button);
  return li;
}

function fillFlowList(listId, countId, items) {
  const list = document.getElementById(listId);
  document.getElementById(countId).textContent = items.length ? String(items.length) : '';
  if (!items.length) {
    const empty = document.createElement('li');
    empty.className = 'flow-empty';
    empty.textContent = 'なし';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...items);
}

function renderFlowPanel() {
  if (!boardData) return;
  const lists = { waiting: [], running: [], today: [] };
  const states = new Map();
  for (const column of boardData.columns) {
    for (const group of column.groups) {
      const flow = cardFlowOf(group);
      states.set(`card:${group.id}`, { flow, title: splitGroupTitle(group.title).main });
      const item = () => flowItemButton(splitGroupTitle(group.title).main, column.name, () => openModal(column, group));
      if (flow === 'waiting' || flow === 'running') lists[flow].push(item());
      else if (flow === 'todo' && statusOf(group) === 'today') lists.today.push(item());
    }
  }
  for (const s of offCardSessions) {
    const flow = OFF_CARD_FLOW[s.state];
    states.set(`job:${s.jobId}`, { flow: flow || 'done', title: s.name || s.jobId });
    if (!flow) continue;
    lists[flow].push(flowItemButton(s.name || s.jobId, 'カード外のセッション', async () => {
      await openSessionListDialog();
      selectManagedSession(s.jobId);
    }));
  }
  fillFlowList('flowWaitingList', 'flowWaitingCount', lists.waiting);
  fillFlowList('flowRunningList', 'flowRunningCount', lists.running);
  fillFlowList('flowTodayList', 'flowTodayCount', lists.today);
  notifyFlowChanges(states);
}

async function refreshOffCardSessions() {
  try {
    const res = await fetch('/api/sessions/all');
    if (!res.ok) return;
    const data = await res.json();
    offCardSessions = (data.sessions || []).filter((s) => !s.card);
    renderFlowPanel();
  } catch {}
}

// 別のウィンドウで作業している間に Claude が止まったことへ気づけるよう、稼働中から自分待ち・完了に変わったときだけ通知する。
function notifyFlowChanges(states) {
  const canNotify = typeof Notification !== 'undefined' && Notification.permission === 'granted';
  for (const [key, { flow, title }] of states) {
    const prev = lastFlowStates.get(key);
    lastFlowStates.set(key, { flow, title });
    if (!canNotify || !prev || prev.flow !== 'running' || flow === 'running' || document.hasFocus()) continue;
    const text = flow === 'waiting' ? 'あなたの返事を待っています' : '作業が終わりました';
    try {
      new Notification(`${title}`, { body: text, tag: key });
    } catch {}
  }
}

function setupNotifyButton() {
  const button = document.getElementById('notifyEnableBtn');
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
  button.hidden = false;
  button.addEventListener('click', async () => {
    await Notification.requestPermission();
    button.hidden = Notification.permission !== 'default';
  });
}

function bulkLaunchCandidates() {
  if (!boardData) return [];
  return boardData.columns.flatMap((column) => column.groups
    .filter((group) => cardFlowOf(group) === 'todo' && statusOf(group) === 'today')
    .map((group) => ({ column, group })));
}

function openBulkLaunchDialog() {
  const candidates = bulkLaunchCandidates();
  document.getElementById('bulkLaunchEmpty').hidden = candidates.length > 0;
  document.getElementById('bulkLaunchSubmit').disabled = candidates.length === 0;
  document.getElementById('bulkLaunchList').replaceChildren(...candidates.map(({ column, group }) => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    label.className = 'flow-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = true;
    box.dataset.groupId = group.id;
    const text = document.createElement('span');
    text.textContent = `${splitGroupTitle(group.title).main}（${column.name}）`;
    label.append(box, text);
    li.append(label);
    return li;
  }));
  document.getElementById('bulkLaunchDialog').showModal();
}

async function submitBulkLaunch() {
  const text = document.getElementById('bulkLaunchText').value.trim();
  const ids = [...document.querySelectorAll('#bulkLaunchList input:checked')].map((b) => b.dataset.groupId);
  if (!text || !ids.length) return;
  document.getElementById('bulkLaunchDialog').close();
  for (const id of ids) {
    const found = findGroupById(id);
    if (!found) continue;
    const target = { file: currentFile, columnName: found.column.name, groupId: id, groupTitle: found.group.title };
    await sendCardComment(target, text, {});
  }
  showToast(`${ids.length}件のカードに依頼しました`);
}

async function buildDayReviewMarkdown() {
  let costs = {};
  try {
    const res = await fetch(`/api/costs/cards?file=${encodeURIComponent(currentFile)}`);
    if (res.ok) costs = (await res.json()).cards || {};
  } catch {}
  const done = [];
  const open = [];
  for (const column of boardData.columns) {
    for (const group of column.groups) {
      const name = `${splitGroupTitle(group.title).main}（${column.name}）`;
      if (group.done) done.push(`- [x] ${name}`);
      else {
        const flow = cardFlowOf(group);
        const note = flow === 'waiting' ? ' — 自分待ち' : flow === 'running' ? ' — Claude が作業中' : statusOf(group) === 'today' ? ' — 今日やるだった' : '';
        open.push(`- [ ] ${name}${note}`);
      }
    }
  }
  const total = Object.values(costs).reduce((n, c) => n + (c.usd || 0), 0);
  return [
    `# ${boardData.date} の振り返り`, '',
    `## 完了（${done.length}件）`, ...(done.length ? done : ['- なし']), '',
    `## 未完了（${open.length}件）`, ...(open.length ? open : ['- なし']), '',
    `## 費用（API換算）`, `- 合計 ${formatUsd(total)}（Claude セッションを起動したカード ${Object.keys(costs).length}件）`, '',
  ].join('\n');
}

async function openDayReviewDialog() {
  if (!boardData) return;
  document.getElementById('dayReviewText').textContent = '集計中…';
  document.getElementById('dayReviewDialog').showModal();
  document.getElementById('dayReviewText').textContent = await buildDayReviewMarkdown();
}

async function copyDayReview() {
  const text = document.getElementById('dayReviewText').textContent;
  try {
    await navigator.clipboard.writeText(text);
    showToast('振り返りをコピーしました');
  } catch {
    showToast('コピーできませんでした。本文を選んでコピーしてください', { kind: 'error' });
  }
}

const BASE_DOCUMENT_TITLE = 'Today Todo';
const BADGE_COUNT_MAX = 9;
let baseFaviconHref = null;

function renderBlockedCountBadge(blockedCount) {
  const favicon = document.querySelector('link[rel="icon"]');
  if (baseFaviconHref === null) baseFaviconHref = favicon.href;
  if (blockedCount === 0) {
    document.title = BASE_DOCUMENT_TITLE;
    favicon.href = baseFaviconHref;
    return;
  }
  document.title = `(${blockedCount}) ${BASE_DOCUMENT_TITLE}`;
  const rootStyle = getComputedStyle(document.documentElement);
  const badgeFill = rootStyle.getPropertyValue('--state-blocked').trim();
  const badgeInk = rootStyle.getPropertyValue('--bg').trim();
  const badgeText = blockedCount > BADGE_COUNT_MAX ? `${BADGE_COUNT_MAX}+` : String(blockedCount);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">`
    + `<text y=".9em" font-size="90">📋</text>`
    + `<circle cx="70" cy="30" r="30" fill="${badgeFill}"/>`
    + `<text x="70" y="44" font-size="40" font-weight="700" font-family="sans-serif" text-anchor="middle" fill="${badgeInk}">${badgeText}</text>`
    + `</svg>`;
  favicon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// セッションログはヘッダーの一覧から開くダイアログとカード詳細の両方に描くため、描画先と表示中のジョブをビューごとに持つ。
function createSessionLogView(key, listId, inputId) {
  return { key, listId, inputId, timer: null, jobId: null, session: null, groupId: null, branchableUuid: null, renderedKeys: null };
}
const sessionLogView = createSessionLogView('dialog', 'sessionLogList', 'sessionLogReplyInput');
const modalLogView = createSessionLogView('modal', 'modalCommentList', 'modalCommentInput');
let sessionLogFocusReturn = null;
const SESSION_LOG_FOLLOW_MARGIN_PX = 40;

function sessionLogEntryLabel(entry) {
  if (entry.kind === 'tool_use') return `tool_use: ${entry.name}`;
  if (entry.kind === 'tool_result') return entry.name ? `tool_result: ${entry.name}` : 'tool_result';
  return entry.role === 'user' ? 'ユーザー' : 'Claude';
}

function renderSessionLogMessage(view, message, session) {
  const list = document.getElementById(view.listId);
  const retryJobId = session ? session.jobId : '';
  const shownBox = list.querySelector(':scope > .session-log-empty');
  // 稼働中は5秒ごとに同じ文言で呼ばれるため、作り直して再取得ボタンのフォーカスを落とさない。
  if (shownBox && shownBox.dataset.message === message && shownBox.dataset.retryJobId === retryJobId) return;
  view.renderedKeys = null;
  view.branchableUuid = null;
  list.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'session-log-empty';
  box.dataset.message = message;
  box.dataset.retryJobId = retryJobId;
  const text = document.createElement('span');
  text.textContent = message;
  box.appendChild(text);
  if (session) {
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn btn-icon';
    retryBtn.appendChild(icon('reload'));
    setButtonLabel(retryBtn, '再取得');
    retryBtn.addEventListener('click', () => fetchAndRenderSessionLog(view, session));
    box.appendChild(retryBtn);
  }
  list.appendChild(box);
}

// AskUserQuestionのinputをJSONとして解釈し、選択肢をボタン化する。
// 壊れている（切り詰め等でJSONとして不正）場合や選択肢が無い場合はnullを返し、生ログ表示のみにする。
function buildAskUserQuestionOptions(entry, view) {
  let payload;
  try {
    payload = JSON.parse(entry.input);
  } catch {
    return null;
  }
  const questions = Array.isArray(payload && payload.questions) ? payload.questions : [];
  const wrap = document.createElement('div');
  wrap.className = 'ask-user-question-options';
  const answers = new Map();
  questions.forEach((q, questionIndex) => {
    if (!Array.isArray(q.options) || q.options.length === 0) return;
    const block = document.createElement('div');
    block.className = 'ask-user-question-block';
    const label = document.createElement('div');
    label.className = 'ask-user-question-label';
    const tag = document.createElement('span');
    tag.className = 'ask-user-question-tag';
    const position = questions.length > 1 ? `${questionIndex + 1}/${questions.length}` : '';
    tag.textContent = [position, q.header].filter(Boolean).join(' · ');
    if (tag.textContent) label.appendChild(tag);
    const text = document.createElement('span');
    text.textContent = q.question || '';
    label.appendChild(text);
    block.appendChild(label);
    const buttons = document.createElement('div');
    buttons.className = 'ask-user-question-buttons';
    q.options.forEach((opt, optionIndex) => {
      const option = document.createElement('div');
      option.className = 'ask-user-question-option';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        if (q.multiSelect) {
          btn.setAttribute('aria-pressed', String(btn.getAttribute('aria-pressed') !== 'true'));
        } else {
          for (const other of buttons.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === btn));
        }
        const selected = q.options.filter((_, i) => buttons.querySelectorAll('button')[i].getAttribute('aria-pressed') === 'true');
        if (selected.length) answers.set(questionIndex, selected.map((o) => o.label).join(', '));
        else answers.delete(questionIndex);
        block.classList.toggle('is-answered', selected.length > 0);
        fillAskUserQuestionReply(view, questions, answers);
      });
      option.appendChild(btn);
      if (opt.description) {
        const description = document.createElement('span');
        description.className = 'input-hint';
        description.id = `${view.key}AskUserQuestionOption${questionIndex}-${optionIndex}Description`;
        description.textContent = opt.description;
        btn.setAttribute('aria-describedby', description.id);
        option.appendChild(description);
      }
      buttons.appendChild(option);
    });
    block.appendChild(buttons);
    wrap.appendChild(block);
  });
  return wrap.childElementCount > 0 ? wrap : null;
}

function fillAskUserQuestionReply(view, questions, answers) {
  document.getElementById(view.inputId).value = questions.length === 1
    ? answers.get(0) ?? ''
    : [...answers].sort(([a], [b]) => a - b)
      .map(([questionIndex, label]) => `「${questions[questionIndex].question || ''}」: ${label}`)
      .join(' / ');
}
