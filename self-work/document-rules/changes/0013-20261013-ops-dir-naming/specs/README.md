# 差分仕様（確定）

ops 依頼ディレクトリ名を `order-yyyymmdd/` から `yyyymmdd-<slug>/` へ変更（命名規則・同名衝突時の扱い・改定理由を directry-rules.md 5章に追記）。他2ファイルは名称置換のみ。

| diff | 対象 |
|---|---|
| directry-rules.md.diff | `self-work/directry-rules/directry-rules.md` |
| document-rules.md.diff | `self-work/document-rules/document-rules.md` |
| todo-management.md.diff | `self-work/document-rules/todo-management.md` |

## Gaps

なし（notion2md-task-pipeline の `todo_sync.py`・`fetch.py` も ops 系を `<yyyymmdd>-<slug>` 生成に変更し、`tests/test_todo_sync.py` で検証）
