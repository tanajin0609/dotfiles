---
name: init-change
model: haiku
description: |
  既存の SDD サブプロジェクト内に、変更1件ぶんのディレクトリ
  docs/changes/<version>-<type>-<短い説明>-<日付>/ を作り、proposal.md・design.md・decisions.md・tasks.md・specs/
  の雛形を用意する。新しい改修・機能追加に着手する直前、実装より先に提案と設計を
  書き起こす段階で使う。バージョンは docs/specs/VERSION から算出し、日付は自動付与する。
---

# /init-change — 変更ディレクトリ初期化

`docs/changes/<version>-<type>-<短い説明>-<日付>/` を新規作成し、`proposal.md`・`design.md`・`decisions.md`・`tasks.md`・`specs/`（delta spec用）の雛形を用意する。
`/explore` → `/todo-propose` の前段、または `/todo-propose` を使わず手動で変更作業を始める際に使う。
詳細ルールは `self-work/directry-rules/directry-rules.md` の1章・4章（特に4.1）を参照。
バージョン増分の判断は `semver` skill を使う。

## 引数

`$ARGUMENTS` に `<change-name>`（Conventional Commitsの `<type>-<短い説明>` 形式、例: `feat-add-login-api`）を渡す。
`<type>` が省略された形（例: `add-login-api`）で渡された場合は、typeをユーザーに確認する。
カレントディレクトリの `docs/changes/` 配下に作成する。

## ディレクトリ命名規則

`<version>-<change-name>-<作成日8桁>`（例: `v0.2.0-feat-add-login-api-20260812`）。`change-name` 自体は
`<type>-<短い説明>` の形（Conventional Commits準拠）で、全体として概ね20文字以内を目安にする。

- **バージョンの算出**:
  1. `docs/specs/VERSION`（プレーンテキスト1行、`/init-spec` が作成）を読み、現在値とする。
     存在しない場合はユーザーに現在のバージョン（既存サブプロジェクトを後から本方式に載せ替える場合は
     成熟度に応じた初期値、目安は directry-rules.md 4.1参照）を尋ね、`docs/specs/VERSION` に書き込む。
  2. `change-name` のtypeから増分種別を判定する（`semver` skill参照:
     `feat`→MINOR、`fix`→PATCH、`docs`/`chore`/`refactor`等その他→PATCH、
     末尾`!`または本文`BREAKING CHANGE:`→MAJOR）。判断に迷う場合はユーザーに確認する。
  3. 現在値に増分を適用した値を採用する（例: 現在 `0.1.0` で `feat` → `0.2.0`）。
     このバージョンは**暫定値**であり、実際の差分が確定した時点（`/archive` 実行時。ただし
     バージョン確定自体は `/archive` のスコープ外のため人間が判断する）で見直される前提であることをユーザーに伝える。
  4. ディレクトリ名では `v` を先頭に付ける（`v0.2.0`）。`docs/specs/VERSION` 自体には `v` を付けない
     （例: `0.2.0`）。
- **作成日**: コマンド実行日を `YYYYMMDD` 形式で末尾に付与する。
- 既存のサブプロジェクトが旧フォーマット（`<連番4桁>-<日付>-<change-name>`）で運用中の場合、
  既存ディレクトリはリネームしない。新フォーマットは新規作成分にのみ適用する
  （directry-rules.md 4.1「既存ディレクトリは凍結」）。

## ワークフロー

1. **change-name の確認**
   - `$ARGUMENTS` が空ならユーザーに `<type>-<短い説明>` を尋ねる。typeが無ければ補って確認する。
   - カレントディレクトリに `docs/specs/` が存在しない場合、SDD構成が未初期化である旨を伝え、先に `/init-spec` の実行を提案する（提案のみ、勝手に実行しない）。

2. **重複チェック**
   - `docs/changes/` 配下に同じ `change-name`（バージョン・日付を除いた部分）を持つディレクトリが既に存在する場合は、上書きせずユーザーに確認する。

3. **バージョン・日付の決定とディレクトリ名の確定**
   - 上記「ディレクトリ命名規則」に従い、バージョン・当日日付から `<version>-<change-name>-<日付>` を組み立てる。
   - 決定したバージョン（暫定値である旨）と根拠（現在値＋typeによる増分）をユーザーに提示する。

4. **テンプレートコピーとプレースホルダー置換**
   - `/home/igpf-2500009/projects/_templates/dev/docs/changes/<change-name>/` の
     `proposal.md`・`design.md`・`decisions.md`・`tasks.md`・`specs/` を `docs/changes/<version>-<change-name>-<日付>/` にコピーする:
     ```bash
     cp -R /home/igpf-2500009/projects/_templates/dev/docs/changes/\<change-name\>/. docs/changes/<version>-<change-name>-<日付>/
     ```
   - コピーしたファイル内のプレースホルダー文字列 `<change-name>` を、実際の change-name（バージョン・日付は含めない）に置換する
     （`proposal.md`・`decisions.md`・`tasks.md`・`specs/README.md` の見出しに含まれる）。
   - `specs/README.md` 内の `<dir>` を、実際の変更ディレクトリ名（`<version>-<change-name>-<日付>`）に置換する。

5. **完了報告**
   - 作成したパス（`docs/changes/<version>-<change-name>-<日付>/proposal.md` など）と、
     暫定バージョンである旨・確定タイミング（差分確定時に見直す）をユーザーに報告する。
   - `specs/README.md` に「今回触る予定の大本spec・節」を記入する工程が残っている旨も伝える
     （着手時＝予定、完了時＝diffで確定の2段。詳細は `directry-rules.md` 4.2）。

## 注意事項

- `docs/specs/`（正式spec）は `/init-change` の時点では変更しない。実装フェーズで直接更新し、
  その差分を `specs/` に unified diff で残す（`directry-rules.md` 4.2）。
- `specs/`（delta spec）は `README.md`（索引と生成手順の雛形）付きで作成する。
  2026-08-17 改定以前は「空ディレクトリのまま作成し、中身は `/apply` 工程で生成する」としていたが、
  `/apply` が未実装のため delta spec が一件も書かれない状態を招いたので撤回した。
  **未実装コマンドに責務を預けない**（`directry-rules.md` 4.2）。
- バージョン確定時にディレクトリ名（バージョン部分）が変わる場合は、他ドキュメントからの
  相対リンク・パス参照を全文検索して更新する。番号を含む識別子は変更コストが高いため、
  リネームは慎重に行う。
- 上記に限らず、既存のディレクトリ名を変更する場合は、変更前のディレクトリ名で `grep -rn` を実行し、
  ヒットした全ファイル（`.md` だけでなく `.drawio` 等のテキスト内埋め込みも含む）のリンクを更新してから完了とする
  （`self-work/directry-rules/directry-rules.md` 4章参照）。
