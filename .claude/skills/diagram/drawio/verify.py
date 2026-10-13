"""Compare two drawio files cell-by-cell (order, attrs, geometry). Empty value attr == missing."""
import sys, xml.etree.ElementTree as ET
def canon(f):
    out = []
    for d in ET.parse(f).getroot().iter("diagram"):
        for c in d.iter("mxCell"):
            a = {k: v for k, v in c.attrib.items() if not (k == "value" and v == "")}
            g = c.find("mxGeometry")
            ga = {k: str(float(v)) if k in "x y width height" else v for k, v in (g.attrib.items() if g is not None else [])}
            pts = sorted((p.get("as"), float(p.get("x", 0)), float(p.get("y", 0))) for p in (g if g is not None else []))
            out.append((d.get("name"), tuple(sorted(a.items())), tuple(sorted(ga.items())), tuple(pts)))
    return out
a, b = canon(sys.argv[1]), canon(sys.argv[2])
diff = [(x, y) for x, y in zip(a, b) if x != y]
print(f"cells: orig={len(a)} rebuilt={len(b)} mismatched={len(diff) + abs(len(a) - len(b))}")
for x, y in diff[:5]: print(" ORIG", x, "\n NEW ", y)
