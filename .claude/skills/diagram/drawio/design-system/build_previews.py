"""tokens.json + semantic.json -> ds-bundle/_preview/*.html (Claude Design のプレビューカード)。"""
from tokens_lib import T, S, here, hex_
STYLES_HREF = "../styles.css"
CSS = ("body{font-family:var(--dg-font-family);margin:0;padding:24px;color:var(--dg-ink);background:var(--dg-canvas);"
       "background-image:radial-gradient(var(--dg-canvas-dot) 1px,transparent 1px);background-size:24px 24px}"
       ".grid{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}"
       ".cap{font:var(--dg-font-size-body) var(--dg-font-mono);color:var(--dg-ink-muted);margin-top:6px}"
       ".tag{font:500 var(--dg-font-size-caption) var(--dg-font-mono);letter-spacing:.1em}"
       "h3{font-size:var(--dg-font-size-title);font-weight:700;letter-spacing:-.02em;margin:0 0 20px}")

def page(group, title, body):
    return (f'<!-- @dsCard group="{group}" -->\n<!doctype html><html lang="ja"><meta charset="utf-8">'
            f'<title>{title}</title><link rel="stylesheet" href="{STYLES_HREF}"><style>{CSS}</style>'
            f'<body><h3>{title}</h3><div class="grid">{body}</div></body></html>\n')

def swatch(name, var, value):
    return (f'<div><div style="width:96px;height:48px;border-radius:var(--dg-radius-icon);background:var({var});'
            f'border:1px solid var(--dg-hairline)"></div><div class="cap">{name}<br>{value}</div></div>')

colors = "".join(swatch(f"{t}-{k}", f"--dg-tone-{t}-{k}", hex_(c)) for t, d in T["tone"].items() for k, c in d.items())
colors += "".join(swatch(k, f"--dg-{k}", hex_(c)) for k, c in T["neutral"].items())

def node(k, n):
    var = lambda p: f"var(--dg-node-{k}-{p})"
    if n["shape"] == "text":
        return f'<div style="font-size:var(--dg-font-size-{n["font"]});font-weight:700;color:{var("text")}">{k}</div>'
    radius = {"card": "var(--dg-radius-node)", "pill": "var(--dg-radius-pill)", "note": "0 14px 0 0"}[n["shape"]]
    width = f'{n.get("strokeWidth", 1)}px'
    shadow = [] if n.get("flat") else ["var(--dg-shadow-node)"]
    if n.get("halo"): shadow.insert(0, "var(--dg-halo-new)")
    icon = (f'<div style="flex:none;width:var(--dg-icon-size);height:var(--dg-icon-size);border-radius:var(--dg-radius-icon);'
            f'background:{var("icon-bg") if "iconBg" in n else "transparent"};border:2px solid {var("accent")}"></div>') if "accent" in n else ""
    tag = f'<div class="tag" style="color:{var("accent")}">{n["tag"]}</div>' if "tag" in n else ""
    return (f'<div style="display:flex;gap:10px;align-items:center;min-width:200px;padding:var(--dg-node-padding);'
            f'background:{var("fill")};border:{width} {"dashed" if n.get("dashed") else "solid"} {var("stroke")};'
            f'border-radius:{radius};box-shadow:{", ".join(shadow) or "none"};color:{var("text")}">{icon}'
            f'<div>{tag}<div style="font-size:var(--dg-font-size-{n["font"]});font-weight:{700 if n.get("bold") else 500}">{k}</div></div></div>')

nodes = "".join(f'<div>{node(k, n)}<div class="cap">{k}</div></div>' for k, n in S["node"].items())

DASH = {"solid": "", "dashed": ' stroke-dasharray="6 7"', "dotted": ' stroke-dasharray="0.5 8"'}
def edge(k, e):
    c = f"var(--dg-edge-{k})"
    head = {"none": "", "open": f'<polyline points="150,5 160,10 150,15" fill="none" stroke="{c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
            "block": f'<polygon points="149,4.5 160,10 149,15.5" fill="{c}"/>'}[e["arrow"]]
    chip = f'<span style="background:#fff;border:1px solid rgba(21,23,28,.1);border-radius:var(--dg-radius-pill);padding:1px 8px">{k}</span>'
    return (f'<div><svg width="170" height="20"><line x1="4" y1="10" x2="{150 if e["arrow"] != "none" else 166}" y2="10" stroke="{c}" '
            f'stroke-width="2" stroke-linecap="round"{DASH[e["line"]]}/>{head}</svg>'
            f'<div class="cap">{chip} {e["line"]} / {e["arrow"]}</div></div>')

edges = "".join(edge(k, e) for k, e in S["edge"].items())

out = here / "ds-bundle" / "_preview"; out.mkdir(parents=True, exist_ok=True)
for name, group, title, body in (("colors", "Colors", "Tone palette", colors),
                                 ("nodes", "Components", "Node styles", nodes),
                                 ("edges", "Components", "Edge styles", edges)):
    (out / f"{name}.html").write_text(page(group, title, body))
print(sorted(p.name for p in out.iterdir()))
