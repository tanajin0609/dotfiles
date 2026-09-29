# 提案書: todo マネジメント仕様の新設（todo.md＝索引、tasks.md＝詳細）

> 対象読者: document-rules のメンテナ（自分）
> スコープ: `todo-management.md` の新設。todo.md と change の tasks.md の役割分担を決める
> 元セッション: 2026-09-29
> 結論: **決定**（A' 方式と、delta spec を仕組み側に移すこと。2026-09-29 ユーザー決定）

## 1. 経緯

change の進み具合が `tasks.md` にしか書かれず、todo-import（todo.md しか読まない）経由では
today-todo に出てこなかった。そのため todo.md 側に「次: 〜」を手で写すことになり、tasks.md と
食い違っていた。todo の扱いは todo-import の spec・check-todos・todo-sync-hook・todo-format・
document-rules.md の5か所に分かれており、両ファイルの関係をどこも決めていなかった。

## 2. 検討した選択肢

| 案 | 内容 | 不採用の理由 |
|---|---|---|
| ① | todo-import が `changes/*/tasks.md` を全部走査する | 止めている change や放棄した change まで今日のタスクに出てくる |
| ② | change を更新するたびに todo.md も更新する | 2か所に書くことになり、今回の食い違いが再発する |
| ③ | todo.md にまとめ、tasks.md を廃止する | `/init-change`・`/archive`・`/todo-execute` が前提とする構成が崩れる |
| **A'** | todo.md は索引、todo-import がリンク先の tasks.md を展開する | **採用** |

## 3. 決定内容

- `todo-management.md` を document-rules 配下に新設し、全体像と責務分担の上位仕様とする。
  既存の5ファイルの本文は動かさず、参照で結ぶ。
- A' を確定とする（内容は `todo-management.md` 1〜4章）。

## 4. delta spec の扱い（2026-09-29 決定）

tasks.md の `## delta spec` 節を todo-import で展開するか（旧 Q1）を検討する中で、節そのものを
tasks.md から外し、仕組み側に移すことにした（内容は `todo-management.md` 5章）。

- 着手時の変更予定の記入は廃止する。予定は proposal.md・design.md にあり、実際の差分は hook と
  `/archive` で機械的に残るため、写しになるだけだった。
- 保証索引・Gaps は途中から導入した仕組みで、節の無い change が残っている（2026-09-29 時点で、
  アーカイブ前の55件中5件、アーカイブ済み49件中14件）。導入前の change に後から保証を求めないよう、
  節があるかどうかで適用を切り替える。日付や version では判定しない。
- AC ID による照合が成り立つのは、2026-09-29 時点で1プロジェクトだけ（テストが AC ID を含んでいる）。
  それ以外は AI の下書きで補う。

## 5. 後続作業（本提案では未実施）

- PreToolUse hook を新設し、spec 編集の直前に `specs/base/` へ自動コピーする
- `/archive` に、diff の生成・README の確定・保証索引と Gaps の下書き・理由が空欄なら停止、を追加する
- `_templates/dev` の tasks.md から `## delta spec` 節を削除し、specs/README.md の「記入のタイミング」を直す
- プロジェクト CLAUDE.md の SDD ワークフロー 2〜5 のうち delta spec の手作業の記述を、仕組みが担う形に直す
- `self-work/today-todo/docs/specs/spec.md` と todo-import skill に、4章の展開・警告を反映する
- todo-format skill の「補足（進捗メモ）」の記述を、経緯・判断メモに限るよう直す
- 既存の todo.md に書かれた「次: 〜」行を tasks.md 側へ移す
