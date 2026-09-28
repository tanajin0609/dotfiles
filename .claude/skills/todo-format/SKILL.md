---
name: todo-format
description: >
  各サブプロジェクトの docs/tasks/todo.md に `- [ ]` / `- [x]` の行を書く・書き換えるときの1行の書式。
  /init-change・/todo-propose・/init-ops-work・/archive が todo.md に追記・移動するとき、
  または手作業で todo.md に項目を足すときに必ず参照する。
---

# todo-format — todo.md の1行の書式

todo.md の行は、ビューアのカードや `/todo-import` の一覧で**行単体で**読まれる。
リンク先を開かなくても「何をするタスクか」が分かることを最優先にする。

## 書式

```
- [ ] #<連番> <要約>（<状態>） → <リンク>
```

| 部分 | 必須 | 内容 |
|---|---|---|
| `#<連番>` | 任意 | 既に番号が振られている行はそのまま保持する（`/todo-import` が拾う） |
| `<要約>` | 必須 | 何をするかを日本語1文（目安40字以内）で。動詞で終える（「〜を追加」「〜を修正」「〜を調査」） |
| `（<状態>）` | 任意 | `提案中・承認待ち` など。無ければ付けない |
| `→ <リンク>` | 必須 | 作業ディレクトリの入口ファイルへのパス。区切りは半角スペース付きの ` → ` を1つだけ |

- 要約に change-name・order-yyyymmdd などの識別子を**書かない**。識別子はリンクのパスに含まれており、
  検索もパスで当たるため重複になる。
- そのためリンクの表示文字列は `proposal.md` だけに縮めず、パスを省略せずに書く。
- ` → ` は区切り専用。要約・状態の中では使わない（ビューアは最初の `→` より前をタイトルにする）。
- 補足（未決事項・進捗メモ）は次行以降に字下げして続けてよい。1行目には入れない。

## 種類別の形

```
# dev（/init-change・/todo-propose）
- [ ] ヘッダーのUndo/Redoボタンを削除 → [docs/changes/<version>-<change-name>-<日付>/proposal.md](../changes/<version>-<change-name>-<日付>/proposal.md)
- [ ] ヘッダーのUndo/Redoボタンを削除（提案中・承認待ち） → [docs/changes/.../proposal.md](../changes/.../proposal.md)

# ops（/init-ops-work）
- [ ] <依頼概要> → order-yyyymmdd/order.md

# 完了（/archive・ops完了時）: [x] にしてリンク先を archives/ 配下に書き換える。要約は変えない
- [x] ヘッダーのUndo/Redoボタンを削除 → [docs/changes/archives/<dir>/proposal.md](../changes/archives/<dir>/proposal.md)
```

## 要約の作り方

- proposal.md / order.md の「背景」「提案内容」から、**利用者から見て何が変わるか**を1文にする。
  ファイル名・関数名は、それが無いと区別できない場合だけ入れる。
- 入口ファイルが未記入で要約が作れない場合は、推測で埋めずに `<分かる範囲の要約>（内容未記入）` とする。

## 悪い例

```
- [ ] docs-user-manual → [docs/changes/v0.16.2-docs-user-manual-20260918/proposal.md](...)   # 識別子だけで内容が無い
- [ ] chore-header-undo-redo-btn — 提案中・承認待ち → [...]                                    # 同上
- [ ] 修正 → [...]                                                                             # 何を直すか分からない
```
