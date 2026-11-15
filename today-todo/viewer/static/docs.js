function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 一覧から開くとき最初に見せたい順。ops系はinstruction→order→plan、dev系はproposal。
const DOC_PREFERRED_NAMES = ['instruction.md', 'order.md', 'plan.md', 'proposal.md'];

function renderDocNav(docs, baseDir, currentPath) {
  const nav = document.getElementById('docNav');
  nav.replaceChildren();
  nav.hidden = docs.length < 2;
  for (const docPath of docs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = docPath.startsWith(baseDir + '/') ? docPath.slice(baseDir.length + 1) : docPath;
    btn.title = docPath;
    btn.setAttribute('aria-current', String(docPath === currentPath));
    btn.addEventListener('click', () => {
      for (const other of nav.children) other.setAttribute('aria-current', String(other === btn));
      openDocDialog(docPath, { keepNav: true });
    });
    nav.appendChild(btn);
  }
}

async function openDocRef(ref, sourcePath) {
  let response;
  try {
    response = await fetch(`/api/doc/resolve?ref=${encodeURIComponent(ref)}&base=${encodeURIComponent(sourcePath || '')}`);
  } catch {
    response = null;
  }
  const found = response && response.ok ? await response.json() : null;
  if (!found || found.docs.length === 0) {
    showToast('表示できるドキュメントがありません');
    return;
  }
  const first = DOC_PREFERRED_NAMES.map((name) => found.docs.find((d) => d.endsWith(`/${name}`))).find(Boolean) || found.docs[0];
  renderDocNav(found.docs, found.path, first);
  openDocDialog(first, { keepNav: true });
}

async function fetchRelatedDocs(absPath) {
  try {
    const response = await fetch(`/api/doc/related?path=${encodeURIComponent(absPath)}`);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function openRelatedDocs(absPath, fallbackRef, sourcePath) {
  const found = await fetchRelatedDocs(absPath);
  if (!found || found.docs.length === 0) {
    if (fallbackRef) return openDocRef(fallbackRef, sourcePath);
    showToast('表示できるドキュメントがありません');
    return;
  }
  const first = (found.docs.includes(absPath) && absPath)
    || DOC_PREFERRED_NAMES.map((name) => found.docs.find((d) => d.endsWith(`/${name}`))).find(Boolean)
    || found.docs[0];
  renderDocNav(found.docs, found.root, first);
  openDocDialog(first, { keepNav: true });
}

let docLoadSeq = 0;
// セッション資料を表示中ならそのジョブID。カードのドキュメント専用の引用・注釈を出さない判定に使う。
let docArtifactJobId = null;
let docArtifactInputId = null;

// 同じiframeのsrcdocを続けて書き換えると、先の空ページの読み込みが後から勝って本文が消えることがあるため、毎回作り直す。
function replaceDocFrame(srcdoc, { src } = {}) {
  document.getElementById('docAnnoLayer').replaceChildren();
  const old = document.getElementById('docFrame');
  const frame = old.cloneNode(false);
  frame.removeAttribute('srcdoc');
  frame.removeAttribute('src');
  // 資料のHTMLはviewerと同一オリジンから配信されるため、allow-same-originを外して親の文書・APIに触れないようにする。
  frame.setAttribute('sandbox', src ? '' : 'allow-same-origin');
  if (src) {
    frame.src = src;
  } else if (srcdoc) {
    frame.addEventListener('load', () => setupDocAnnotations(frame), { once: true });
    frame.srcdoc = srcdoc;
  }
  old.replaceWith(frame);
}

function docFrameHtml(bodyHtml) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${DOC_FRAME_STYLE}</style></head><body><main>${bodyHtml}</main></body></html>`;
}

function renderMarkdownHtml(markdown) {
  // markedはCDN読み込みのため、取得に失敗しても原文で読めるようにする。
  return typeof marked === 'undefined' ? `<pre>${escapeHtml(markdown)}</pre>` : marked.parse(markdown);
}

async function openDocDialog(absPath, { keepNav = false } = {}) {
  const dialog = document.getElementById('docDialog');
  if (!dialog.open) docFocusReturn = captureFocusReturn();
  docArtifactJobId = null;
  docArtifactInputId = null;
  if (!keepNav) {
    renderDocNav([], '', absPath);
    fetchRelatedDocs(absPath).then((found) => {
      if (found && dialog.open && document.getElementById('docPath').textContent === absPath) renderDocNav(found.docs, found.root, absPath);
    });
  }
  document.getElementById('docTitle').textContent = absPath.split('/').pop();
  document.getElementById('docPath').textContent = absPath;
  document.getElementById('docQuoteBtn').hidden = !modalGroup;
  renderDocReviewControls();
  const status = document.getElementById('docStatus');
  const loadId = ++docLoadSeq;
  status.textContent = '読み込み中…';
  replaceDocFrame('');
  if (!dialog.open) dialog.showModal();
  attachToastRegionToTopmostDialog();
  let response;
  try {
    response = await fetch(`/api/doc?path=${encodeURIComponent(absPath)}`);
  } catch (err) {
    if (loadId === docLoadSeq) status.textContent = `読み込みに失敗しました: ${err.message}`;
    return;
  }
  if (loadId !== docLoadSeq) return;
  if (!response.ok) {
    status.textContent = response.status === 404 ? 'ファイルが見つかりません' : response.status === 415 ? 'バイナリファイルは表示できません' : `このファイルは表示できません（${response.status}）`;
    return;
  }
  const markdown = await response.text();
  if (loadId !== docLoadSeq) return;
  status.textContent = '';
  replaceDocFrame(docFrameHtml(/\.md$/i.test(absPath) ? renderMarkdownHtml(markdown) : `<pre>${escapeHtml(markdown)}</pre>`));
}

// 資料を切り替えたり閉じたりしても書きかけを失わないよう、カード単位で持つ。位置は本文の文書座標。
let docReview = { groupId: null, items: [] };

function readDocSelection() {
  const frame = document.getElementById('docFrame');
  return frame.contentDocument ? frame.contentDocument.getSelection().toString().trim() : '';
}

function toQuoteLines(docPath, selected) {
  return [docPath, ...selected.split('\n')].map((line) => `> ${line}`).join('\n');
}

function textOffsetIn(doc, node, offset) {
  const range = doc.createRange();
  range.setStart(doc.body, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

function rangeFromTextOffsets(doc, start, end) {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  let seen = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const next = seen + node.data.length;
    if (!started && start <= next) { range.setStart(node, start - seen); started = true; }
    if (started && end <= next) { range.setEnd(node, end - seen); return range; }
    seen = next;
  }
  return null;
}

// 本文iframeはスクリプト不可のため、親からiframe側のHighlightレジストリへ登録する。
function applyDocHighlights(frame) {
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc || !doc.body || !win.CSS || !win.CSS.highlights || typeof win.Highlight !== 'function') return;
  const docPath = document.getElementById('docPath').textContent;
  const ranges = docReview.items
    .filter((item) => item.path === docPath && item.comment.trim() && item.start != null)
    .map((item) => rangeFromTextOffsets(doc, item.start, item.end))
    .filter(Boolean);
  win.CSS.highlights.set('viewer-anno', new win.Highlight(...ranges));
}

function syncDocReviewOwner() {
  if (!modalGroup || docReview.groupId !== modalGroup.id) docReview = { groupId: modalGroup ? modalGroup.id : null, items: [] };
}

function renderDocReviewControls() {
  syncDocReviewOwner();
  const count = docReview.items.filter((item) => item.comment.trim()).length;
  const busy = modalGroup && busyCommentsByGroupId.has(modalGroup.id);
  const launch = document.getElementById('docReviewLaunchBtn');
  const fresh = document.getElementById('docReviewNewSessionBtn');
  setButtonLabel(launch, `コメント${count}件をClaudeに依頼`);
  launch.hidden = fresh.hidden = count === 0 || docArtifactJobId !== null;
  launch.disabled = fresh.disabled = busy;
}

// 吹き出しをiframe内に置くと本文幅からはみ出して横スクロールが出るため、ダイアログ直下のfixedレイヤーに置き、
// 本文の文書座標から画面座標へ毎回換算する。iframeはスクリプト不可なので、本文側の操作は親から付けたリスナーで扱う。
let docAnnoRelayout = () => {};

function placeAnno(el, frame, item, gap) {
  const frameRect = frame.getBoundingClientRect();
  const win = frame.contentWindow;
  const x = frameRect.left + item.left - win.scrollX;
  const y = frameRect.top + item.top - win.scrollY;
  el.hidden = y < frameRect.top || y > frameRect.bottom;
  const width = el.offsetWidth;
  const left = Math.max(8, Math.min(x + gap, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(y - el.offsetHeight, window.innerHeight - el.offsetHeight - 8));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function setupDocAnnotations(frame) {
  const layer = document.getElementById('docAnnoLayer');
  layer.replaceChildren();
  const doc = frame.contentDocument;
  if (!doc || !modalGroup || docArtifactJobId !== null) return;
  syncDocReviewOwner();
  const docPath = document.getElementById('docPath').textContent;
  const placed = [];
  let addBtn = null;
  const removeAddBtn = () => { if (addBtn) addBtn.remove(); addBtn = null; };
  docAnnoRelayout = () => { for (const { el, item, gap } of placed) if (el.isConnected) placeAnno(el, frame, item, gap); };
  frame.contentWindow.addEventListener('scroll', docAnnoRelayout);
  doc.addEventListener('mousedown', removeAddBtn);
  doc.addEventListener('mouseup', () => {
    removeAddBtn();
    const selection = doc.getSelection();
    const quote = selection.toString().trim();
    if (!quote || selection.rangeCount === 0) return;
    const selectedRange = selection.getRangeAt(0);
    const rect = selectedRange.getBoundingClientRect();
    const offsets = {
      start: textOffsetIn(doc, selectedRange.startContainer, selectedRange.startOffset),
      end: textOffsetIn(doc, selectedRange.endContainer, selectedRange.endOffset),
    };
    const anchor = { top: rect.top + frame.contentWindow.scrollY, left: rect.right + frame.contentWindow.scrollX };
    addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'anno-add';
    addBtn.textContent = 'コメント';
    addBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
    addBtn.addEventListener('click', () => {
      removeAddBtn();
      const item = { path: docPath, quote, comment: '', ...anchor, ...offsets };
      docReview.items.push(item);
      selection.removeAllRanges();
      renderAnnotation(frame, layer, placed, item, true);
    });
    layer.appendChild(addBtn);
    placed.push({ el: addBtn, item: anchor, gap: 4 });
    placeAnno(addBtn, frame, anchor, 4);
  });
  for (const item of docReview.items) if (item.path === docPath) renderAnnotation(frame, layer, placed, item, false);
  applyDocHighlights(frame);
}

function renderAnnotation(frame, layer, placed, item, editing) {
  const bubble = document.createElement('div');
  const show = (mode) => {
    bubble.className = `anno ${mode}`;
    bubble.replaceChildren();
    bubble.title = mode === 'edit' ? '' : 'クリックで編集';
    if (mode === 'edit') {
      const quote = document.createElement('span');
      quote.className = 'anno-quote';
      quote.textContent = item.quote;
      const input = document.createElement('textarea');
      input.dataset.skillSuggest = '';
      input.rows = 3;
      input.value = item.comment;
      input.placeholder = 'コメント';
      input.setAttribute('aria-label', '選択範囲へのコメント');
      const actions = document.createElement('div');
      actions.className = 'anno-actions';
      const discard = () => {
        docReview.items.splice(docReview.items.indexOf(item), 1);
        bubble.remove();
        applyDocHighlights(frame);
        renderDocReviewControls();
      };
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '削除';
      remove.addEventListener('click', (e) => { e.stopPropagation(); discard(); });
      const done = document.createElement('button');
      done.type = 'button';
      done.textContent = '完了';
      const finish = (e) => {
        e.stopPropagation();
        item.comment = input.value;
        if (!item.comment.trim()) discard();
        else {
          show('min');
          applyDocHighlights(frame);
          renderDocReviewControls();
        }
      };
      done.addEventListener('click', finish);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) finish(e);
        // Escでダイアログごと閉じず、編集の確定だけにする。
        if (e.key === 'Escape') { e.preventDefault(); finish(e); }
      });
      actions.append(remove, done);
      bubble.append(quote, input, actions);
      placeAnno(bubble, frame, item, 8);
      input.focus();
      return;
    }
    if (mode === 'max') {
      const quote = document.createElement('span');
      quote.className = 'anno-quote';
      quote.textContent = item.quote;
      bubble.append(quote, document.createTextNode(item.comment));
    } else {
      bubble.textContent = item.comment;
    }
    placeAnno(bubble, frame, item, 8);
  };
  bubble.addEventListener('mouseenter', () => { if (bubble.classList.contains('min')) show('max'); });
  bubble.addEventListener('mouseleave', () => { if (bubble.classList.contains('max')) show('min'); });
  bubble.addEventListener('click', () => { if (!bubble.classList.contains('edit')) show('edit'); });
  layer.appendChild(bubble);
  placed.push({ el: bubble, item, gap: 8 });
  show(editing ? 'edit' : 'min');
}

function sendDocReview(launchOptions = {}) {
  syncDocReviewOwner();
  const items = docReview.items.filter((item) => item.comment.trim());
  if (!modalGroup || items.length === 0 || busyCommentsByGroupId.has(modalGroup.id)) return;
  const text = items.map((item) => `${toQuoteLines(item.path, item.quote)}\n\n${item.comment.trim()}`).join('\n\n');
  const target = { file: currentFile, columnName: modalColumnName, groupId: modalGroup.id, groupTitle: modalGroup.title };
  const remaining = docReview.items;
  docReview.items = [];
  document.getElementById('docDialog').close();
  sendCardComment(target, text, { ...launchOptions, ...readLaunchSelects('modal') }, () => {
    if (docReview.groupId === target.groupId) docReview.items = [...remaining, ...docReview.items];
  });
}

function quoteDocSelection() {
  const selected = readDocSelection();
  if (!selected) {
    showToast('引用する範囲を選択してください');
    return;
  }
  const docPath = document.getElementById('docPath').textContent;
  const quote = toQuoteLines(docPath, selected);
  // closeイベントは非同期に来るため、開く前の要素へ戻すフォーカス復帰を止めてコメント欄に留める。
  docFocusReturn = null;
  const inputId = docArtifactInputId ?? 'modalCommentInput';
  document.getElementById('docDialog').close();
  addQuoteChip(inputId, quote);
}

function onDocDialogClosed() {
  docLoadSeq++;
  docArtifactJobId = null;
  docArtifactInputId = null;
  replaceDocFrame('');
  attachToastRegionToTopmostDialog();
  restoreFocusReturn(docFocusReturn);
  docFocusReturn = null;
}

// タスク本文のリンクはbacklog.mdからの相対パスで書かれているため、出典パスのディレクトリを基準に解決する。
function resolveDocLink(href, sourcePath) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  const [pathPart] = href.split('#');
  if (!/\.md$/i.test(pathPart)) return null;
  if (pathPart.startsWith('/')) return decodeURIComponent(pathPart);
  if (!sourcePath) return null;
  const baseDir = sourcePath.slice(0, sourcePath.lastIndexOf('/') + 1);
  return decodeURIComponent(new URL(pathPart, `file://${baseDir}`).pathname);
}

function bindDocLinks(container, sourcePath) {
  for (const link of container.querySelectorAll('a[href]')) {
    const absPath = resolveDocLink(link.getAttribute('href'), sourcePath);
    if (!absPath) continue;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openDocDialog(absPath);
    });
  }
  for (const code of container.querySelectorAll('code')) {
    const ref = code.textContent.trim();
    if (!/^[\w.-]+(\/[\w.-]+)+\/?$/.test(ref) || code.closest('a')) continue;
    code.classList.add('doc-ref');
    code.tabIndex = 0;
    code.setAttribute('role', 'button');
    code.title = 'このパスのドキュメントを開く';
    const open = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openDocRef(ref, sourcePath);
    };
    code.addEventListener('click', open);
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
  }
}

function captureFocusReturn() {
  const element = document.activeElement;
  const keyed = element && element.closest ? element.closest('[data-focus-key]') : null;
  return { element, focusKey: keyed ? keyed.dataset.focusKey : null };
}

// 開いている間の再描画で元の要素が作り直されていたら、同じキーを持つ新しい要素へ戻す。
function restoreFocusReturn(focusReturn) {
  if (!focusReturn) return;
  if (focusReturn.element && focusReturn.element.isConnected) {
    focusReturn.element.focus();
    return;
  }
  const replacement = findElementByFocusKey(focusReturn.focusKey);
  if (replacement) replacement.focus();
}

function setCopyAvailability(button, reasonEl, hasComments) {
  button.disabled = !hasComments;
  reasonEl.hidden = hasComments;
}

function countCardComments(groups) {
  return groups.reduce((n, g) => n + (g.comments ? g.comments.length : 0), 0);
}

function observeHeaderHeight() {
  const header = document.getElementById('appHeader');
  const syncHeaderHeight = () => {
    document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
  };
  new ResizeObserver(syncHeaderHeight).observe(header);
  syncHeaderHeight();
}

async function loadFileList() {
  const res = await fetch('/api/files');
  const files = await res.json();
  todoFiles = files;
  return files;
}
