# 提案書: todo.md→backlog.md、tasks.md→checklist.md への改名

> 結論: **決定**（2026-09-29 ユーザー決定。archives 配下は旧名のまま）

todo-management.md で todo.md は「索引（人が優先度を付けて today に引き出す待ち行列）」、change の
tasks.md は「作業項目の詳細」と定めたが、名前がそれを表していなかった。todo.md は today-todo の
`todo-YYYY-MM-DD.md` と紛らわしく、tasks.md は親の `docs/tasks/` ディレクトリの中身に見える。

## 範囲

- 改名: 稼働中の `docs/tasks/todo.md`（38件）・`docs/changes/*/tasks.md`（62件）・`_templates/`
- 参照更新: skill（check-todos・todo-format・todo-import・todo-source-notion）、command（archive・
  init-change・init-ops-work・todo-execute・todo-propose）、projects/CLAUDE.md・ops-work/CLAUDE.md、
  todo-sync-hook・sdd-change-guard・notion2md-task-pipeline/src/todo_sync.py とテスト、specs/ の6仕様

## Non-goals

- `archives/` 配下と過去 change の本文（経緯の記述）は書き換えない。本文中のリンク `](./tasks.md)` のみ追従
- `docs/tasks/` ディレクトリ名、`completed.md`、today-todo の `todo-YYYY-MM-DD.md` は変えない
