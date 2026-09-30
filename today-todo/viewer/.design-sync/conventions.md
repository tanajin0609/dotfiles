# Today Todo Viewer — conventions

A local kanban viewer for one engineer's daily todo file, which also launches and monitors Claude Code
background sessions. Visual direction: **sticky notes** — each column (= project directory) has its own hue;
the column is a pale tinted surface, cards are white notes on it, labels are hue-colored pills.

**This DS ships CSS only — no React components.** Build with plain JSX elements and these class names.
Read `styles.css` (→ `tokens/tokens.css`, `_ds_bundle.css`) before styling, and copy the markup patterns in
`guidelines/screens.md` — they are the exact structures the real app renders. Don't invent new class names
for parts that exist there; for your own layout glue use inline styles with the tokens below.

## Setup

- Page font, colors and `body` padding come from the global rules — no wrapper needed for light theme.
- Dark theme: put `data-theme="dark"` on `<html>` (or any wrapper). `data-theme="auto"` follows the OS.
- Column color: set `style={{ '--col-hue': 210 }}` (0–345, step 15) on `.column-wrap`, `.session-card`,
  `.card-panel` or `.focus-card`. Everything inside (`.dot`, `.column-count`, `.card-parent`, `.col-pill`,
  progress bars, tinted surfaces, note shadows) derives from it. Without it, parts fall back to hue 0 (red).
- Global element rules exist for `header`, `mark`, `kbd`, `code` and all `button/input/select/textarea`.

## Styling vocabulary

| Purpose | Use |
|---|---|
| Surfaces | `var(--bg)` page < column tint < `var(--raised)` cards; `var(--surface)` for panels inside dialogs |
| Text | `var(--ink)`, `var(--ink-sub)`, `var(--ink-mute)` (all ≥4.5:1). `var(--ink-faint)` is decoration only |
| Accent / states | `var(--accent)`, `var(--state-working)`, `var(--state-blocked)`, `var(--state-done)` |
| Shape | `var(--radius-sm|md|lg|pill)` = 8/12/18/999px, `var(--elev-1)` small shadow |
| Type | only `var(--fs-xs|sm|md|lg|xl)` = 12/13/15/18/22px; `var(--font-sans)`, `var(--font-mono)` |
| Buttons | `.solid-btn` primary (one per area), `.ghost-btn` secondary, `.share-btn` small icon, `.quote-btn` inline, `.filter-chip[aria-pressed]` toggles; toolbars of tools go in `.hdr-tools` |
| Labels | `.col-pill` (column-hued pill), `.date-badge`, `.empty-state` |

Buttons have no borders — a fill plus `--elev-1` marks them. Inputs keep a 3:1 border (`--input-line`).
Session states are always shown with both a marker and a word: `.session-dot` + 稼働中, `.session-icon` (⏸) + 待機中.
UI copy is Japanese, sentence-style, and names what happens (「Claudeに依頼」「メモ保存」).

## Example

```jsx
<div className="column-wrap" style={{ '--col-hue': 120 }}>
  <details className="column" open>
    <summary className="column-header">
      <span className="column-title-row"><span className="chevron" /><span className="dot" /><span className="name">api-server</span><span className="column-count">1</span></span>
    </summary>
    <div className="task-list">
      <div className="card-wrap"><div className="group-card" role="button" tabIndex={0}><span className="stripe" />
        <div className="card-body"><div className="card-head"><span className="card-parent">billing</span><span className="card-title">請求APIのリトライ</span></div></div>
      </div></div>
    </div>
  </details>
</div>
```
