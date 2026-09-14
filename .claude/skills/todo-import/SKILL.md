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

`$HOME/projects/.claude/skills/` に `todo-source-` で始まる名前の skill があれば、
Step 1 の前にそれを実行する。外部（チケット管理ツール等）にあるタスクを `docs/tasks/todo.md` へ
反映させてから集約するためのフック。複数あればすべて実行する。

無ければ何もせず Step 1 に進む（この skill 単体でも成立する）。

## Step 1: todo.md を列挙し、未完了項目を抽出する

`check-todos` skill の Step1・2 とまったく同じ手順を使う（重複実装しない）。

```bash
find $HOME/projects -maxdepth 6 -path "*/docs/tasks/todo.md"
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
- チェックボックス直後が `#<連番>` で始まっていれば（例: `- [ ] #12 内容`）、その番号を保持する
  （Step4でそのまま引き継ぐ）。番号が無い行は、Step4で todo-YYYY-MM-DD.md 側にのみ新規採番する
  （元の todo.md への書き戻しはしない）。

0件でもエラー扱いにせず、「`docs/tasks/todo.md` を持つプロジェクトが見つかりませんでした」と
伝えて終了する。

## Step 2: 今日の下書きファイルの有無を確認する

実行時のシステム日付を `YYYY-MM-DD` として、`$HOME/projects/today-todo/todo-YYYY-MM-DD.md`
が既に存在するか確認する。

- 存在する場合: Read で読み込み、以降はこの内容を土台に更新する（上書きしない）。
- 存在しない場合: 新規に組み立てる。

## Step 3: 過去の todo-YYYY-MM-DD.md をアーカイブする（2026-08-26 追加）

`$HOME/projects/today-todo/` 直下にある `todo-YYYY-MM-DD.md` のうち、実行時の
システム日付（Step2で確認した今日の日付）と異なるものを、そのファイルの日付（`YYYY-MM-DD`→
`yyyymmdd`表記）に対応する `$HOME/projects/today-todo/archives/<yyyymmdd>/`
へ `mv` する（フォルダが無ければ作成する。既に同じ日付のフォルダがあれば新規作成しない）。

- 対象は `todo-YYYY-MM-DD.md` のみ。`plan-*.md`・`proposal-*.md`・`work-log-*.md` は当日以降も
  参照されることがあるため対象外（`self-work/document-rules/document-rules.md`「today-todo/ 配下の
  アーカイブ運用」参照。これらのアーカイブは引き続きユーザーが明示指示したときの手動運用のまま）。
- 移動した件数はStep6の作業ログに書き添える。0件でもよい（初回実行や前日分が既にアーカイブ済みの場合）。

## Step 4: 下書きを組み立てる

対話・絞り込み・分類はしない。Step1で抽出した未完了項目を、プロジェクトごとに見出しを分けて
そのまま列挙する（プロジェクト選定も「外部確認/開発側/後回し」等の分類も行わない）。

プロジェクト見出しの下は、その項目が元の todo.md でどの `##`/`###` 見出し配下にあったかで
さらにサブ見出しに分ける（2026-09-09追加。フラットな箇条書きだけだと項目数が多いプロジェクトで
読みにくいため）。見出しの外（todo.md 冒頭など）にある項目はサブ見出し無しでプロジェクト見出し
直下に列挙する。

```markdown
# 今日のタスク（YYYY-MM-DD）

## {プロジェクト名}

### {todo.md内の見出し文脈（`##`/`###`）}
- [ ] #{番号} {内容} → {参照リンク（該当 todo.md へのパス）} <!-- notion:<page_id> -->
```

`#{番号}` は次の優先順で決める。

1. 元の todo.md 行に既に付いていれば、そのまま引き継ぐ。
2. 無ければ、この todo-YYYY-MM-DD.md 内で同じ `## {プロジェクト名}` 見出し配下に
   既に使われている番号（引き継いだものも含む）の最大値+1を新規に割り当てる
   （元の todo.md には書き戻さない。todo-YYYY-MM-DD.md の中でだけ有効な番号）。

Step2で既存ファイルを土台に更新する場合、既に番号が付いている行の番号は変更しない
（新規に追加する項目にのみ、その時点の最大値+1を割り当てる）。

`<!-- notion:<page_id> -->` は元の todo.md 行に付いていた場合のみ付ける（無ければ省略）。

未完了項目が0件のプロジェクトは節ごと省略する。

Step2で既存ファイルを読み込んだ場合は、todo.md 側で完了扱いになった項目に `- [x]` を付け、
todo.md にある新規項目を追記する。既存の記述・ユーザーが手で加えた行は消さない。

## Step 5: 書き込む

`$HOME/projects/today-todo/` が無ければ作成し、
`$HOME/projects/today-todo/todo-YYYY-MM-DD.md` に書き込む。書き込んだファイルパスを
ユーザーに伝える。

## Step 6: 作業ログに追記する

`$HOME/projects/today-todo/work-log-YYYY-MM-DD.md`（Step2と同じ日付）に実行内容を
1エントリ追記する。無ければ新規作成し、あれば末尾に追記する（既存エントリは変更しない）。
`todo-import` → `todo-propose` → `todo-execute` と続く一連のワークフローで「いつ何を実行したか」を
積み上げる実行履歴であり、成果物のスナップショットである `proposal-YYYY-MM-DD.md`・
`plan-YYYY-MM-DD.md` とは別物（`self-work/document-rules/document-rules.md` 参照）。

```markdown
## HH:MM — /todo-import
- 対象: todo.mdを持つプロジェクト{M}件
- アーカイブ: todo-*.mdを{K}件 archives/<yyyymmdd>/へ移動
- 出力: todo-YYYY-MM-DD.md（未完了{N}件、新規{n1}件・完了反映{n2}件）
```

時刻は実行時刻（HH:MM、24時間表記）を使う。

---

## 注意事項

- `todo.md` の検出・抽出ルールは `check-todos` と同一。差分が生じたら両方を見直す。
- 同日の再実行では既存ファイルを上書きせず、既存内容を土台に更新する。
- `todo-YYYY-MM-DD.md` は実行のたびに前日以前の分を `archives/` へ自動移動する（Step3、2026-08-26追加）。
  それ以外（`plan-*.md`・`proposal-*.md`・`work-log-*.md`）の自動アーカイブ・削除は行わない。
- プロジェクト選定・優先順位付け・分類は行わない。ユーザーが生成後のファイルを自分で編集する前提。
