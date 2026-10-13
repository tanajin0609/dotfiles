# Diagram tokens (draw.io palette) v0.2

Tokens-only design system: no React components. Use it to color and type **diagrams** (flowcharts, sequence diagrams, state diagrams, architecture maps) built as HTML/SVG, so they match the team's draw.io figures.

## Setup
Load `styles.css`; every token is a CSS custom property on `:root`. Nothing to wrap, no provider. Fonts (Plus Jakarta Sans, Noto Sans JP, JetBrains Mono) are not bundled — load them yourself or accept the sans-serif/monospace fallback.

## Styling idiom — `var(--dg-*)`
| Family | Names |
|---|---|
| Palette | `--dg-tone-{blue,green,yellow,orange,red,purple,gray,white}-{fill,stroke,text}` (blue=indigo, green=teal, yellow=amber, red=coral, purple=violet) |
| Neutrals | `--dg-ink`, `--dg-ink-muted`, `--dg-ink-faint`, `--dg-slate`, `--dg-hairline`, `--dg-canvas`, `--dg-canvas-dot` |
| Node roles | `--dg-node-{step,impl,new,data,human,branch,risk,legacy,lane,queue,external,state,note}-{fill,stroke,text}`; most also have `-accent` and `-icon-bg` |
| Edge roles | `--dg-edge-{flow,request,dataflow,response,error,ref,guide}` (stroke color) |
| Edge shape | `--dg-edge-width` (2px), `--dg-edge-dash` (6 7), `--dg-edge-dot` (0.5 8), `--dg-edge-cap` (round), `--dg-edge-head` (9 11), `--dg-edge-corner` (16px) |
| Type | `--dg-font-family`, `--dg-font-mono`, `--dg-font-size-{caption,body,heading,title}` (10/11/16/28px) |
| Shape | `--dg-radius-{node,icon,lane,pill}`, `--dg-icon-size` (34px), `--dg-node-padding`, `--dg-shadow-node`, `--dg-halo-new` |

## Node anatomy
White card (`--dg-radius-node`, `--dg-shadow-node`) = 34px icon tile (`-icon-bg` fill, `-accent` color) + uppercase role tag (mono, `--dg-font-size-caption`, letter-spacing .1em, `-accent` color) + node name (`--dg-font-size-heading`, 700). Role color lives in the icon and tag, not the card fill.
Roles: step = business step (tile shows its number); impl = existing implementation, tag `EXISTING`, weight 500; new = newly added part, amber 1.5px border + `--dg-halo-new`, tag `NEW`; data = data store, tag `DATA STORE`; queue = queue, tag `QUEUE`; human = actor, tag `ACTOR`; branch = decision, pill-shaped card, tag `DECISION`; risk = risk/known issue, coral-tinted card, tag `RISK`; legacy = reused as-is, translucent card with 1.5px dashed border and no shadow, tag `REUSED`; external = external system, translucent and no shadow, tag `EXTERNAL`; state = state in a state diagram, pill-shaped card; lane = section container with a pill-shaped heading; note = annotation.

## Edges
All lines `--dg-edge-width`, round caps. flow/request = slate solid with filled triangle; dataflow = teal solid with filled triangle; response = `--dg-ink-faint` dashed with open chevron; error = coral dashed with filled triangle; ref/guide = dotted, no arrowhead. Edge labels sit in a white pill chip (mono 11px, `--dg-ink-muted`). Canvas: `--dg-canvas` with a 24px dot grid of `--dg-canvas-dot`.

Prefer role tokens over raw palette tokens; always pair the diagram with a legend stating what each color means.

## Example
```html
<div style="display:flex;gap:10px;align-items:center;padding:var(--dg-node-padding);background:var(--dg-node-data-fill);border:1px solid var(--dg-node-data-stroke);border-radius:var(--dg-radius-node);box-shadow:var(--dg-shadow-node);font-family:var(--dg-font-family);color:var(--dg-node-data-text)">
  <div style="width:var(--dg-icon-size);height:var(--dg-icon-size);border-radius:var(--dg-radius-icon);background:var(--dg-node-data-icon-bg)"></div>
  <div><div style="font:500 var(--dg-font-size-caption) var(--dg-font-mono);letter-spacing:.1em;color:var(--dg-node-data-accent)">DATA STORE</div>
  <div style="font-size:var(--dg-font-size-heading);font-weight:700">S3 JSON</div></div>
</div>
<svg width="160" height="20"><line x1="0" y1="10" x2="150" y2="10" style="stroke:var(--dg-edge-response);stroke-width:var(--dg-edge-width);stroke-dasharray:var(--dg-edge-dash);stroke-linecap:var(--dg-edge-cap)"/></svg>
```
