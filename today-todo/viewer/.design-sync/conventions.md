# Today Todo Viewer — conventions

A local kanban viewer for one engineer's daily todo file, which also launches and monitors Claude Code
background sessions. Visual direction: **sticky notes** — each column (= project directory) has its own hue;
the column is a pale tinted surface, cards are white notes on it, labels are hue-colored pills.

**This DS ships CSS only — no React components.** Build with plain JSX elements and these class names.
Read `styles.css` (→ `tokens/tokens.css`, `_ds_bundle.css`) before styling, and copy the markup patterns in
`guidelines/screens.md` — they are the exact structures the real app renders. Don't invent new class names
for parts that exist there; for your own layout glue use inline styles with the tokens below.

## Setup

- Put `data-skin="sticky"` on `<html>` (or any wrapper). The viewer has 4 skins; this DS describes Sticky, and without it parts render in the default Cobalt look.
- Dark theme: put `data-theme="dark"` on the same element as `data-skin` (`data-theme="auto"` follows the OS).
- Column color: set `style={{ '--col-hue': 210 }}` (0–345, step 15) on `.column-wrap`, `.session-card`,
  `.card-panel` or `.focus-card`. Everything inside (`.dot`, `.column-count`, `.card-parent`, `.modal-col-label`, `.focus-col-label`,
  progress bars, tinted surfaces, note shadows) derives from it. Without it, parts fall back to hue 0 (red).
- Global element rules exist for `header`, `mark`, `kbd`, `code` and all `button/input/select/textarea`.

## Styling vocabulary

| Purpose | Use |
|---|---|
| Surfaces | `var(--bg)` page < column tint < `var(--raised)` cards; `var(--surface)` for panels inside dialogs |
| Text | `var(--ink)`, `var(--ink-sub)`, `var(--ink-mute)` (all ≥4.5:1). `var(--ink-faint)` is decoration only |
| Accent / states | `var(--accent)`, `var(--state-working)`, `var(--state-blocked)`, `var(--state-done)` |
| Shape | `var(--radius-sm|radius|radius-lg)` = 6/8/12px, `var(--shadow-sm|shadow-md)` |
| Type | only `var(--fs-xs|sm|md|lg|xl)` = 12/13/15/18/22px; `var(--font-sans)`, `var(--font-mono)` |
| Buttons | `.solid-btn` primary (one per area), `.ghost-btn` secondary, `.share-btn` small icon, `.quote-btn` inline, `.filter-chip[aria-pressed]` toggles; toolbars of tools go in `.hdr-tools` |
| Labels | `.modal-col-label` · `.focus-col-label` · `.card-parent` (column-hued pills), `.date-badge`, `.empty-state` |

Buttons have no borders — a fill plus `--shadow-sm` marks them. Inputs keep a 3:1 border (`--input-line`).
Session states are always shown with both a marker and a word: `.session-dot` + 稼働中, `.session-icon` (⏸) + 入力待ち.
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
