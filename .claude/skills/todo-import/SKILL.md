---
name: todo-import
model: haiku
description: |
  各プロジェクトの docs/tasks/todo.md に残っている未完了タスクを、対話や分類なしで機械的に
  projects/today-todo/todo-YYYY-MM-DD.md へ列挙する。
  一日の始まりに「今日やることは？」「今日のタスクは？」と聞かれたときに使う。
  横断の残タスク一覧をターミナル表示するだけの check-todos とは異なり、ファイルを生成する。
---

# todo-import — 今日のタスク下書き生成

## Step 0: 外部ソースの取り込み（前処理 skill があれば）

`~/projects/.claude/skills/` に `todo-source-` で始まる名前の skill があれば、
Step 1 の前にそれを実行する。外部（チケット管理ツール等）にあるタスクを `docs/tasks/todo.md` へ
反映させてから集約するためのフック。複数あればすべて実行する。

無ければ何もせず Step 1 に進む（この skill 単体でも成立する）。

## Step 1: todo.md を列挙し、未完了項目を抽出する

`check-todos` skill の Step1・2 とまったく同じ手順を使う（重複実装しない）。

```bash
find ~/projects -maxdepth 4 -path "*/docs/tasks/todo.md"
```

見つかった todo.md をそれぞれ Read で読み、以下の基準で対象を絞る。

- 対象: `- [ ]` の未完了チェックボックス項目のみ。
- 対象外: `- [x]` の完了項目、プレーンな箇条書きの運用メモ節。
- 複数行にまたがる項目（次の `- [ ]` や見出しが出てくるまでの継続行）は1項目として扱う。
- 見出し（`##`/`###`）は、その項目がどの文脈の残課題かを示す情報として保持する。
- プロジェクト名は `todo.md` から2階層上（`docs/tasks/` の親）のディレクトリ名を使う。
- 項目の行に `<!-- notion:<page_id> -->` があれば、その `page_id` を保持する（Step3で併記する）。
  後で提案書やサブエージェントが元のNotionページに書き戻す際、todo.md・order.mdを辿らず
  直接参照できるようにするため。

0件でもエラー扱いにせず、「`docs/tasks/todo.md` を持つプロジェクトが見つかりませんでした」と
伝えて終了する。

## Step 2: 今日の下書きファイルの有無を確認する

実行時のシステム日付を `YYYY-MM-DD` として、`~/projects/today-todo/todo-YYYY-MM-DD.md`
が既に存在するか確認する。

- 存在する場合: Read で読み込み、以降はこの内容を土台に更新する（上書きしない）。
- 存在しない場合: 新規に組み立てる。

## Step 3: 下書きを組み立てる

対話・絞り込み・分類はしない。Step1で抽出した未完了項目を、プロジェクトごとに見出しを分けて
そのまま列挙する（プロジェクト選定も「外部確認/開発側/後回し」等の分類も行わない）。

```markdown
# 今日のタスク（YYYY-MM-DD）

## {プロジェクト名}
- [ ] {内容} → {参照リンク（該当 todo.md へのパス。見出し文脈があれば併記）} <!-- notion:<page_id> -->
```

`<!-- notion:<page_id> -->` は元の todo.md 行に付いていた場合のみ付ける（無ければ省略）。

未完了項目が0件のプロジェクトは節ごと省略する。

Step2で既存ファイルを読み込んだ場合は、todo.md 側で完了扱いになった項目に `- [x]` を付け、
todo.md にある新規項目を追記する。既存の記述・ユーザーが手で加えた行は消さない。

## Step 4: 書き込む

`~/projects/today-todo/` が無ければ作成し、
`~/projects/today-todo/todo-YYYY-MM-DD.md` に書き込む。書き込んだファイルパスを
ユーザーに伝える。

## Step 5: 作業ログに追記する

`~/projects/today-todo/work-log-YYYY-MM-DD.md`（Step2と同じ日付）に実行内容を
1エントリ追記する。無ければ新規作成し、あれば末尾に追記する（既存エントリは変更しない）。
`todo-import` → `todo-propose` → `todo-execute` と続く一連のワークフローで「いつ何を実行したか」を
積み上げる実行履歴であり、成果物のスナップショットである `proposal-YYYY-MM-DD.md`・
`plan-YYYY-MM-DD.md` とは別物（`self-work/document-rules/document-rules.md` 参照）。

```markdown
## HH:MM — /todo-import
- 対象: todo.mdを持つプロジェクト{M}件
- 出力: todo-YYYY-MM-DD.md（未完了{N}件、新規{n1}件・完了反映{n2}件）
```

時刻は実行時刻（HH:MM、24時間表記）を使う。

---

## 注意事項

- `todo.md` の検出・抽出ルールは `check-todos` と同一。差分が生じたら両方を見直す。
- 同日の再実行では既存ファイルを上書きせず、既存内容を土台に更新する。
- `projects/today-todo/` 配下ファイルの自動アーカイブ・削除は行わない（`work-log-YYYY-MM-DD.md` も同様）。
- プロジェクト選定・優先順位付け・分類は行わない。ユーザーが生成後のファイルを自分で編集する前提。
