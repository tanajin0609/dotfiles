"""tokens.json / semantic.json の読み込みと値解決（css / hex）を各生成スクリプトで共有する。"""
import json
from pathlib import Path
here = Path(__file__).parent
T, S = (json.loads((here / f).read_text()) for f in ("tokens.json", "semantic.json"))

def _lookup(v):
    if isinstance(v, str) and v.startswith("@"):
        node = T
        for k in v[1:].split("."): node = node[k]
        return node
    return v

def css(v):
    v = _lookup(v); return v["css"] if isinstance(v, dict) else v

def hex_(v):
    v = _lookup(v); return v["hex"] if isinstance(v, dict) else v
