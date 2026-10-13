"""tokens.json + semantic.json -> dist/tokens.css（Claude Design 同期用の CSS 変数）。"""
from tokens_lib import T, S, here, css
v = [f"--dg-font-family: {T['font']['family']};", f"--dg-font-mono: {T['font']['mono']};"]
v += [f"--dg-font-size-{k}: {n}px;" for k, n in T["font"]["size"].items()]
v += [f"--dg-stroke-{k}: {n}px;" for k, n in T["stroke"].items()]
v += [f"--dg-tone-{t}-{k}: {css(c)};" for t, d in T["tone"].items() for k, c in d.items()]
v += [f"--dg-{k}: {css(c)};" for k, c in T["neutral"].items()]
v += [f"--dg-edge-{k}: {c};" for k, c in T["edge"].items()]
v += [f"--dg-{k}: {c};" for k, c in T["shape"].items()]
for k, n in S["node"].items():
    for prop, name in (("fill", "fill"), ("stroke", "stroke"), ("text", "text"), ("accent", "accent"), ("iconBg", "icon-bg")):
        if prop in n: v.append(f"--dg-node-{k}-{name}: {css(n[prop])};")
v += [f"--dg-edge-{k}: {css(e['color'])};" for k, e in S["edge"].items()]
(here / "dist").mkdir(exist_ok=True)
(here / "dist/tokens.css").write_text(":root {\n" + "\n".join("  " + x for x in v) + "\n}\n")
(here / "dist/index.js").write_text("export {};\n")
print(len(v), "vars")
