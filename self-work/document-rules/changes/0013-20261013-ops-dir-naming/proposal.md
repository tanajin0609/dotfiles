# 提案書: ops 依頼ディレクトリ名を order-yyyymmdd から yyyymmdd-<slug> へ変更

> 結論: **決定**（2026-10-13 ユーザー決定。形式は `yyyymmdd-<英語ケバブケースの作業名>`、進行中のみリネームし archives 配下は旧名のまま）

`order-yyyymmdd/` は日付しか持たず、一覧を見ても何の作業か分からなかった。

## 範囲

- 規則: directry-rules.md 5章、document-rules.md、todo-management.md、ops-work/CLAUDE.md（`fix-manual` カテゴリも追記）、local/ops-work/RULES.md
- command/skill: init-ops-work（slug の付け方・同名衝突時の扱い）、todo-propose、todo-execute、archive、todo-format、ops-work/.claude/skills/notion-ops-plan、_templates/ops/backlog.md
- ディレクトリ: 進行中の `order-*` を `yyyymmdd-<slug>` へリネームし、参照リンクを追従

## Non-goals

- `archives/` 配下のディレクトリ名と、過去 change・経緯の本文に出てくる旧名は書き換えない
- `order.md` というファイル名は変えない
