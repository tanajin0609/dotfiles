# Screen parts (markup patterns)

Each block below is the markup the viewer itself renders (copied from `index.html` and its DOM builders),
with placeholder data. Keep the class names and nesting; change only text, counts and `--col-hue`.
`--col-hue` is a hue in degrees (0–345, step 15). Every column-colored part reads it from the nearest ancestor.

### Header

```html
<header>
  <div class="hdr-row1">
    <h1 class="app-title">Today Todo</h1>
    <span class="date-badge">2026-09-30</span>
    <div class="file-controls">
      <select><option>todo-2026-09-30.md</option></select>
      <button type="button">再読込</button>
    </div>
    <div class="search-field"><input type="search" placeholder="カードを検索（/）"></div>
    <div class="hdr-spacer"></div>
    <div class="hdr-tools" role="group" aria-label="ツール">
      <button type="button" class="tool-btn" aria-label="セッション一覧" data-tip="セッション一覧"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/></svg></button>
      <span class="hdr-sep" aria-hidden="true"></span>
      <button type="button" class="tool-btn" aria-label="表示設定" data-tip="表示設定"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></button>
    </div>
  </div>
</header>
```

### Board toolbar and filter chips

```html
<div class="board-toolbar">
  <button type="button" class="ghost-btn">すべて開く</button>
  <div class="filter-chips" role="group">
    <button type="button" class="filter-chip" aria-pressed="true">未完了のみ</button>
    <button type="button" class="filter-chip" aria-pressed="false">稼働中</button>
  </div>
  <div class="hdr-spacer"></div>
  <button type="button" class="solid-btn">全カードのコメントをまとめてコピー</button>
</div>
```

### Column with cards

A column is `details.column` inside `.column-wrap` (which carries `--col-hue`). Cards are `.group-card` inside `.task-list`.

```html
<div class="column-wrap" style="--col-hue: 210">
  <details class="column" open>
    <summary class="column-header">
      <span class="column-title-row"><span class="chevron"></span><span class="dot"></span><span class="name">web-app</span><span class="column-count">2</span></span>
      <span class="column-stats">
        <span class="column-progress"><span class="bar"><span style="width: 40%"></span></span><span>タスク 2/5</span></span>
        <span class="column-stat working"><span class="session-dot"></span>稼働中 1</span>
      </span>
      <span class="column-next">次: ログイン画面のエラーメッセージを整理する</span>
    </summary>
    <div class="task-list">
      <div class="card-wrap">
        <div class="group-card" role="button" tabindex="0">
          <span class="stripe"></span>
          <div class="card-body">
            <div class="card-head"><span class="card-parent">auth</span><span class="card-title">ログイン画面の改修</span></div>
            <div class="card-meta">
              <span class="segs"><span style="background: var(--accent)"></span><span style="background: var(--accent)"></span><span style="background: var(--track)"></span></span>
              <span class="ratio-text">2/3</span><span style="flex: 1"></span>
              <span class="comment-badge"><span class="ico"></span>2</span>
            </div>
            <div class="card-session working"><span class="session-dot"></span><span class="session-label">稼働中</span><span class="session-detail">Bash: npm test</span></div>
          </div>
        </div>
        <div class="card-actions"><button type="button" class="share-btn card-action-btn star-btn">☆</button><button type="button" class="share-btn card-action-btn">…</button></div>
      </div>
    </div>
    <div class="closed-section">
      <div class="closed-header">完了（1）</div>
      <div class="closed-list">
        <div class="card-wrap"><div class="group-card done"><span class="stripe"></span><div class="card-body"><div class="card-head"><span class="card-parent">docs</span><span class="card-title">README の更新</span></div></div></div></div>
      </div>
    </div>
  </details>
</div>
```

### Claude session panel (left column)

Session cards carry the `--col-hue` of the card they belong to. Blocked ones go in `.attention-panel`.

```html
<aside id="globalCommentsPanel">
  <section class="side-section">
  <h2 class="side-heading">Claude セッション</h2>
  <div class="attention-panel">
    <span class="attention-label"><span class="session-icon">⏸&#xFE0E;</span>要対応 1件</span>
    <button type="button" class="session-card" style="--col-hue: 0">
      <span class="session-card-head"><span class="dot"></span><span class="title">仕様確認の回答待ち</span></span>
      <span class="chip-state blocked"><span class="session-icon">⏸&#xFE0E;</span>入力待ち</span>
      <span class="detail">AskUserQuestion</span>
    </button>
  </div>
  <div class="session-panel">
    <button type="button" class="session-card" style="--col-hue: 210">
      <span class="session-card-head"><span class="dot"></span><span class="title">ログイン画面の改修</span></span>
      <span class="chip-state working"><span class="session-dot"></span>稼働中</span>
      <span class="detail">Bash: npm test</span>
    </button>
  </div>
  </section>
</aside>
```

With no sessions, show `<div class="empty-state"><div class="empty-state-title">稼働中・入力待ちのセッションはありません</div><div>カード詳細のコメント欄で「Claudeに依頼」すると、ここに表示されます</div></div>` after the heading.

### Card detail panel

The real one is `<dialog class="app-dialog card-panel">` opened with `showModal()` (a right-side sheet, 540px, full height).
Put `--col-hue` on the `.card-panel` element. For a static mock, a `<div class="app-dialog card-panel">` works the same.

```html
<div class="app-dialog card-panel" style="--col-hue: 210">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-header-text">
        <div class="modal-col-label">web-app</div>
        <h2>auth ▸ ログイン画面の改修</h2>
        <div class="modal-progress-row"><span class="modal-progress"><span style="width: 67%"></span></span><div class="modal-ratio">2 / 3 完了</div></div>
      </div>
      <div class="modal-header-actions"><button type="button" class="star-btn">☆ 付ける</button><button type="button">閉じる</button></div>
    </div>
    <div class="modal-tasks">
      <div class="modal-task done"><input type="checkbox" checked><span class="task-number">#1</span>
        <div class="task-main"><div class="task-text">エラー文言の一覧を作る</div>
          <div class="task-actions"><button type="button" class="quote-btn">引用</button><button type="button" class="quote-btn">全体へ引用</button></div></div></div>
      <div class="modal-task"><input type="checkbox"><span class="task-number">#2</span>
        <div class="task-main"><div class="task-text">バリデーションを <code>zod</code> に寄せる</div>
          <div class="task-actions"><button type="button" class="quote-btn">出典</button><button type="button" class="quote-btn">引用</button><button type="button" class="quote-btn">全体へ引用</button></div></div></div>
    </div>
    <div class="modal-task-form">
      <div class="field"><label class="field-label">タスクを追加</label><textarea id="modalTaskInput" rows="1" placeholder="新しいタスクの内容"></textarea></div>
      <button type="button" id="modalTaskSubmit">追加</button>
    </div>
    <div class="modal-comments">
      <div class="modal-comments-head">コメント 1</div>
      <div class="modal-comment-list">
        <div class="modal-comment"><div class="at">2026/9/30 10:12:00</div><div class="text">#2 は既存のフォームにも影響するので確認したい</div></div>
      </div>
      <div class="modal-comment-form">
        <div class="field"><label class="field-label">新しいコメント</label><textarea id="modalCommentInput" rows="2" placeholder="コメントを入力"></textarea></div>
        <div class="modal-comment-actions"><button type="button" id="modalCommentSaveBtn">メモ保存</button><button type="button" id="modalCommentLaunchBtn">Claudeに依頼</button></div>
      </div>
    </div>
  </div>
</div>
```

### Focus mode card

```html
<div class="focus-panel">
  <div class="focus-progress"><span class="focus-strip"><span style="background: var(--ink)"></span><span style="background: var(--accent)"></span><span style="background: var(--track)"></span></span><span class="focus-position">2 / 3</span></div>
  <div class="focus-card" style="--col-hue: 210">
    <div class="focus-col-label">web-app</div>
    <h2>auth ▸ ログイン画面の改修</h2>
    <div class="focus-tasks"><label class="focus-task"><input type="checkbox"><span class="focus-task-text">バリデーションを zod に寄せる</span></label></div>
    <div class="focus-actions"><button type="button" class="ghost-btn">後で</button><button type="button" class="solid-btn" id="focusNextBtn">次のカードへ</button></div>
  </div>
</div>
```

### Toast

```html
<div class="toast"><span class="toast-message">コメントを保存しました</span><button type="button" class="toast-close">閉じる</button></div>
<div class="toast error"><span class="toast-message">保存に失敗しました</span><button type="button" class="toast-action">再試行</button></div>
```
