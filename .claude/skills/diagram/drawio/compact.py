"""drawio <-> compact JSON. Usage: compact.py extract IN.drawio OUT.json STYLES.json | build IN.json STYLES.json OUT.drawio"""
import json, sys, xml.etree.ElementTree as ET
from collections import Counter

MODEL_DEFAULTS = dict(dx="1080", dy="768", grid="1", gridSize="10", guides="1", tooltips="1", connect="1",
                      arrows="1", fold="1", page="1", pageScale="1", pageWidth="1600", pageHeight="900", math="0", shadow="0")

def num(s):
    f = float(s); return int(f) if f.is_integer() else f

def pt(g, as_):
    p = g.find(f"mxPoint[@as='{as_}']") if g is not None else None
    return [num(p.get("x", 0)), num(p.get("y", 0))] if p is not None else None

def extract(src, out, styles_out):
    root = ET.parse(src).getroot()
    freq = Counter(c.get("style") for c in root.iter("mxCell") if c.get("style") and c.get("parent") != "0")
    styles = {f"s{i:02d}": s for i, (s, _) in enumerate(freq.most_common(), 1)}
    key = {s: k for k, s in styles.items()}
    doc = []
    for d in root.iter("diagram"):
        m = d.find("mxGraphModel")
        diff = {k: v for k, v in m.attrib.items() if MODEL_DEFAULTS.get(k) != v}
        dd = {"id": d.get("id"), "name": d.get("name"), **({"model": diff} if diff else {}), "layers": []}
        layers = {}
        for c in m.find("root"):
            a = c.attrib
            if a.get("parent") == "0" or (a["id"] == "1" and a.get("parent") == "0"):
                L = {"id": a["id"], **({"name": a["value"]} if a.get("value") else {}),
                     **({"style": a["style"]} if a.get("style") else {}), "cells": []}
                layers[a["id"]] = L; dd["layers"].append(L); continue
            if "parent" not in a: continue  # id=0 root
            g = c.find("mxGeometry")
            sk = key.get(a.get("style"), a.get("style", ""))
            if a.get("vertex"):
                row = ["v", a["id"], sk, a.get("value", ""), *(num(g.get(k, 0)) for k in ("x", "y", "width", "height"))]
            else:
                row = ["e", a["id"], sk, a.get("value", ""), a.get("source"), a.get("target"),
                       pt(g, "sourcePoint"), pt(g, "targetPoint")]
                while row[-1] is None and len(row) > 4: row.pop()
            if a["parent"] not in layers: row.append({"parent": a["parent"]})
            layers.get(a["parent"], dd["layers"][-1])["cells"].append(row)
        doc.append(dd)
    json.dump(doc, open(out, "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump(styles, open(styles_out, "w"), ensure_ascii=False, indent=1)

def build(src, styles_in, out):
    doc, styles = json.load(open(src)), json.load(open(styles_in))
    mx = ET.Element("mxfile", host="compact.py")
    for dd in doc:
        d = ET.SubElement(mx, "diagram", id=dd["id"], name=dd["name"])
        m = ET.SubElement(d, "mxGraphModel", {**MODEL_DEFAULTS, **dd.get("model", {})})
        r = ET.SubElement(m, "root"); ET.SubElement(r, "mxCell", id="0")
        for L in dd["layers"]:
            la = {"id": L["id"], **({"value": L["name"]} if "name" in L else {}), **({"style": L["style"]} if "style" in L else {}), "parent": "0"}
            ET.SubElement(r, "mxCell", la)
            for row in L["cells"]:
                extra = row.pop() if isinstance(row[-1], dict) else {}
                kind, id_, sk, val = row[:4]
                a = {"id": id_, "value": val, "style": styles.get(sk, sk), "parent": extra.get("parent", L["id"])}
                if kind == "v":
                    c = ET.SubElement(r, "mxCell", {**a, "vertex": "1"})
                    ET.SubElement(c, "mxGeometry", dict(zip(("x", "y", "width", "height"), map(str, row[4:8])), **{"as": "geometry"}))
                else:
                    s, t, sp, tp = (row[4:] + [None] * 4)[:4]
                    c = ET.SubElement(r, "mxCell", {**a, "edge": "1", **({"source": s} if s else {}), **({"target": t} if t else {})})
                    g = ET.SubElement(c, "mxGeometry", relative="1", **{"as": "geometry"})
                    for p, as_ in ((sp, "sourcePoint"), (tp, "targetPoint")):
                        if p: ET.SubElement(g, "mxPoint", x=str(p[0]), y=str(p[1]), **{"as": as_})
    ET.indent(mx); ET.ElementTree(mx).write(out, encoding="unicode")

{"extract": extract, "build": build}[sys.argv[1]](*sys.argv[2:])
