#!/usr/bin/env python3
"""dotfiles管理下の .claude/skills, .claude/commands から frontmatter を読み、
README.md 内の索引セクション（START/END マーカー間）を再生成する。

依存ライブラリなし（標準ライブラリのみ）。/dotfiles-sync から呼ばれる想定。
"""
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
README = REPO_ROOT / "README.md"
START_MARKER = "<!-- SKILL_INDEX:START (gen_skill_index.py で自動生成。手で編集しない) -->"
END_MARKER = "<!-- SKILL_INDEX:END -->"


def parse_frontmatter(path: Path) -> dict:
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    end = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), None)
    if end is None:
        return {}
    fm = {}
    i = 1
    while i < end:
        line = lines[i]
        m = re.match(r"^(\w+):\s*(.*)$", line)
        if not m:
            i += 1
            continue
        key, rest = m.group(1), m.group(2)
        if rest == "|" or rest == ">":
            # ブロックスカラー: 次のインデント行を集める
            block = []
            i += 1
            while i < end and (lines[i].startswith("  ") or lines[i].strip() == ""):
                block.append(lines[i].strip())
                i += 1
            fm[key] = " ".join(l for l in block if l)
            continue
        fm[key] = rest.strip().strip('"').strip("'")
        i += 1
    return fm


def collect(glob_pattern: str, kind: str, invoke_fn) -> list:
    rows = []
    for path in sorted(REPO_ROOT.glob(glob_pattern)):
        fm = parse_frontmatter(path)
        name = fm.get("name", path.stem)
        desc = fm.get("description", "").replace("\n", " ").strip()
        rows.append((name, kind, invoke_fn(name), desc))
    return rows


def build_table(rows: list) -> str:
    header = "| 名前 | 種別 | 起動方法 | 説明 |\n| --- | --- | --- | --- |\n"
    body = "".join(
        f"| {name} | {kind} | {invoke} | {desc} |\n" for name, kind, invoke, desc in rows
    )
    return header + body


def main() -> None:
    skill_rows = collect(
        ".claude/skills/*/SKILL.md", "skill", lambda n: "自動（descriptionに合致する文脈で発火）"
    )
    command_rows = collect(".claude/commands/*.md", "command", lambda n: f"`/{n}`")
    rows = skill_rows + command_rows

    section = (
        f"{START_MARKER}\n\n"
        f"{build_table(rows)}\n"
        f"{END_MARKER}"
    )

    text = README.read_text(encoding="utf-8")
    if START_MARKER in text and END_MARKER in text:
        pattern = re.compile(re.escape(START_MARKER) + r".*?" + re.escape(END_MARKER), re.DOTALL)
        text = pattern.sub(section, text)
    else:
        text = text.rstrip("\n") + "\n\n## 利用可能な skill / command 一覧\n\n" + section + "\n"

    README.write_text(text, encoding="utf-8")
    print(f"{len(rows)} 件を索引に反映しました（skill: {len(skill_rows)}, command: {len(command_rows)}）")


if __name__ == "__main__":
    main()
