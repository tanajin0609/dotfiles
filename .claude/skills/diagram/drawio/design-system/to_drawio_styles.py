"""tokens.json + semantic.json -> drawio style dict (key -> style string). Usage: to_drawio_styles.py OUT.json"""
import json, sys
from pathlib import Path
from tokens_lib import T, S, hex_
FAMILY = T["font"]["family"].split(",")[0].strip("'")
MONO = T["font"]["mono"].split(",")[0].strip("'")
SIZE = T["font"]["size"]
# draw.io は absoluteArcSize=1 のとき arcSize を直径相当で解釈する
SHAPE = {"card": f"rounded=1;absoluteArcSize=1;arcSize={int(T['shape']['radius-node'][:-2]) * 2};whiteSpace=wrap;html=1;",
         "pill": "rounded=1;arcSize=50;whiteSpace=wrap;html=1;",
         "note": "shape=note;whiteSpace=wrap;html=1;size=12;verticalAlign=top;spacingTop=4;",
         "text": "text;html=1;verticalAlign=middle;align=left;"}
out = {}
for k, n in S["node"].items():
    s = SHAPE[n["shape"]]
    if n["shape"] != "text":
        s += f"fillColor={hex_(n['fill'])};strokeColor={hex_(n['stroke'])};"
        s += f"strokeWidth={n['strokeWidth']};" if "strokeWidth" in n else ""
        s += "dashed=1;" if n.get("dashed") else ""
        s += "" if n.get("flat") or n["shape"] == "note" else "shadow=1;"
    s += f"fontColor={hex_(n['text'])};fontFamily={FAMILY};fontSize={SIZE[n['font']]};"
    s += "fontStyle=1;" if n.get("bold") else ""
    s += "align=left;spacingLeft=8;" if n.get("align") == "left" else ""
    out[k] = s
DASH = {"solid": "", "dashed": f"dashed=1;dashPattern={T['edge']['dash']};", "dotted": "dashed=1;dashPattern=1 8;"}
for k, e in S["edge"].items():
    s = "edgeStyle=orthogonalEdgeStyle;rounded=1;" if e.get("orthogonal") else ""
    s += f"html=1;endArrow={e['arrow']};" + ("endFill=1;" if e["arrow"] == "block" else "")
    s += DASH[e["line"]]
    s += f"strokeColor={hex_(e['color'])};strokeWidth={T['edge']['width'][:-2]};"
    s += f"fontFamily={MONO};fontSize={SIZE['body']};fontColor={hex_('@neutral.ink-muted')};labelBackgroundColor=#ffffff;labelBorderColor=#e6e6e8;"
    out[k] = s
Path(sys.argv[1]).write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(f"{len(out)} styles -> {sys.argv[1]}")
