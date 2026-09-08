# Proposal: feat-todo-propose-checker

> 補足: 本ディレクトリは `projects/CLAUDE.md` 標準の SDD フルセット（`proposal.md`/`design.md`/
> `tasks.md`/`specs/README.md`）で作成している。`self-work/document-rules` はこれまで
> `changes/<連番4桁>-<日付>-<短い名前>/proposal.md` のみの簡略形式（`changes/0001`〜`0005`）で
> 運用してきたが、今回はユーザー指示によりフルセット・バージョン番号付きディレクトリ名
> （`docs/changes/<version>-<type>-<短い説明>-<日付>/`）で作成する。**この構造上の非対称
> （後述「影響範囲」参照）は未解決の確認事項であり、本ファイルはあくまで提案書。実装はしない。**

## 背景

`$HOME/.claude/commands/todo-execute.md` の Step4「最終レビュー（独立Checkerによる
敵対的検証）」では、実装した本人（Step2のサブエージェントやメインセッション自身）とは別の
独立コンテキストで `todo-checker` エージェント（`~/.claude/agents/todo-checker.md`、`Write`・`Edit`
を持たない判定専任）を起動し、成果物をゼロから再検証させている。この設計を採った理由は
「実装者が自分の成果を採点すると、合格させたい方向に評価が甘くなりやすい」ため
（`todo-execute.md` Step4本文）。

`$HOME/.claude/commands/todo-propose.md` の
「## today-todoバッチモードの最終レビュー（敵対的検証）」節（180〜198行目）は、同じ「敵対的検証」を
謳いながら、検証の実施者が**メインセッション自身**のままになっている。バッチモードでは
メインセッションが0-2で各サブプロジェクト向けサブエージェントを並列起動した張本人であり、
「起票内容に調査の実在した形跡があるか」「『対象外』判定が恣意的でないか」といった検証を、
その起動元と同じコンテキスト（同じ会話履歴・同じ思い込みを共有する可能性がある状態）で行っている。
これは `todo-execute` が排除しようとした構造（採点者と被採点者の距離の近さ）が、`todo-propose` 側には
そのまま残っている状態であり、ユーザー指示によりこれを是正する。

## 提案内容

`/todo-propose` の「today-todoバッチモードの最終レビュー（敵対的検証）」を、`todo-checker` と対になる
新規エージェント `todo-propose-checker`（`Write`・`Edit`を持たない判定専任、独立コンテキストで起動）に
切り出す。

- 新規エージェント定義: `todo-propose-checker`（実体は dotfiles リポジトリ、
  `~/.claude/agents/` に symlink 経由で配置。`todo-checker.md` と同じ配置方式）
- `todo-propose.md` の「today-todoバッチモードの最終レビュー（敵対的検証）」節を、
  「メインセッションが直接検証する」記述から「`todo-propose-checker` を新規コンテキストで起動し、
  その判定結果を受け取る」記述に書き換える
- 検証観点は `todo-propose.md` 側の既存4項目（起票内容の実在形跡／「対象外」判定の恣意性／
  既存ディレクトリ流用原則／todo.md追記・見出し破壊）を土台に、`todo-propose-checker` エージェント
  定義側に責務を移す（`todo-execute.md`と`todo-checker.md`の責務分割を踏襲）
- 詳細な検証観点・ツール構成・呼び出し方は `design.md` を参照

**実装はしない**（本提案書の作成で停止する）。

## 影響範囲

### 変更対象ファイル（想定・いずれも本提案の対象。実装フェーズで着手）

- `$HOME/.claude/commands/todo-propose.md`
  （dotfiles実体: `$HOME/.claude/commands/todo-propose.md` 相当。
  実パスは実装時に確認する）— 「today-todoバッチモードの最終レビュー（敵対的検証）」節の書き換え
- `~/.claude/agents/todo-propose-checker.md`（新規作成。dotfiles実体側に新設し、symlink経由で反映）
- `$HOME/projects/self-work/document-rules/document-rules.md` —
  Maker-Checker分離の経緯を反映するかどうかは要検討（下記「確認事項」参照。document-rules.mdは
  「ドキュメント種別（誰が・いつ・何のために書くか）」を扱うファイルであり、検証プロセスの
  設計そのものは扱っていないため、必須ではない可能性がある）

### 影響しないもの

- `/todo-propose` の単一対象モード（`$ARGUMENTS`あり）— 「today-todoバッチモードの最終レビュー」は
  バッチモード専用の節であり、単一対象モードには適用されない
- `/todo-execute` およびその `todo-checker` — 既に独立検証パターンが実装済みで変更不要
- `docs/tasks/todo.md` への追記 — `self-work/document-rules` に `docs/tasks/` が存在しないため省略
  （プロジェクト内の他ドキュメント種別と同じ扱い）

### 確認事項（推測で埋めず質問として残す）

1. **`docs/specs/` が存在しない構造上の非対称**: `self-work/document-rules` は
   `document-rules.md`（直下1ファイル）が大本specの役割を果たしており、`docs/specs/` ディレクトリは
   存在しない。一方、今回作成した `docs/changes/` はSDD標準の構造。したがって
   「`docs/changes/`はあるが`docs/specs/`は無い」という非対称な状態になる。これは今回ユーザー指示で
   許容された前提だが、**今後このプロジェクトで `docs/changes/` を使う変更が続く場合、
   `docs/specs/VERSION` を作らないままバージョン番号（`v0.6.0`等）をどう確定・追跡するかは未解決**。
   本提案では `directry-rules.md` 4.1の目安（開発中プロジェクト→`0.x.0`）に従い `v0.6.0`
   （現在値`0.5.0`は`changes/0001`〜`0005`の5件の既決定を根拠にした**自己申告の暫定値**、
   `feat`によりMINOR増分）を仮置きしたが、**この初期値自体が正しいかはユーザー確認が必要**。
2. **delta spec（`specs/`ディレクトリ）の適用方法**: SDDフルセットの `tasks.md` は
   「大本specを編集する際は `specs/base/` に事前コピーし `specs/*.diff` を生成する」ことを求める
   （`_templates/dev/docs/changes/<change-name>/tasks.md`）。この項目が対象とする「大本spec」を
   `document-rules.md`（直下1ファイル）とみなしてよいか、あるいは
   `document-rules.md` は「差分ではなく先頭の変更履歴リンクで参照する」という
   `changes/0001`〜`0005`の既存運用（diffを取らない）を優先し、delta spec機構自体を
   本プロジェクトでは適用対象外とすべきか、方針が未確定（`design.md`・`tasks.md`にも同様の
   確認事項を記載）。
3. **`docs/changes/`（フルセット）と `changes/`（簡略形式）の共存**: 今回の変更ディレクトリのみ
   `docs/changes/` 配下に作られ、既存の `changes/0001`〜`0005` は `changes/` 直下のまま残る。
   将来的にこの2系統をどう扱うか（フルセットに統一する／simplified形式のまま今回だけ例外とする）は
   本提案のスコープ外だが、次に `self-work/document-rules` で変更が発生した際に判断が必要になる。
