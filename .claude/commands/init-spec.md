---
name: init-spec
model: haiku
description: |
  サブプロジェクトに SDD の初期ディレクトリ構成（docs/specs, docs/tasks, docs/changes,
  docs/refs, src, tests）を _templates/dev/ からコピーして作成する。
  新しいサブプロジェクトを立ち上げるとき、既存ディレクトリを SDD 構成に載せ替えるとき、
  あるいは変更作業を始めようとして docs/specs/ がまだ無いと分かったときに使う。
  Ops（運用）中心のサブプロジェクトはこちらではなく /init-ops-work を使う。
---

# /init-spec — devテンプレート初期化

トップレベル `CLAUDE.md` が前提とする SDD 構成（`docs/specs/`・`docs/tasks/`・`docs/changes/`・`docs/refs/`・`src/`・`tests/`）を、
新規または既存のサブプロジェクトに初期化する。詳細ルールは `self-work/directry-rules/directry-rules.md` の4章を参照。

## 引数

`$ARGUMENTS` にサブプロジェクトのディレクトリ名（`/home/igpf-2500009/projects/` からの相対パス）を渡す。
例: `/init-spec rpa-scenario`。省略時はカレントディレクトリを対象にする。

## ワークフロー

1. **対象ディレクトリの決定**
   - `$ARGUMENTS` が指定されていれば `/home/igpf-2500009/projects/<ARGUMENTS>` を対象にする。省略時はカレントディレクトリ。
   - 対象ディレクトリが存在しない場合は、作成してよいかユーザーに確認する。

2. **重複チェック**
   - 対象ディレクトリに既に `docs/specs/`・`docs/tasks/`・`docs/changes/`・`docs/refs/`・`src/`・`tests/` のいずれかが存在する場合は、
     上書きせずユーザーに確認する（既存ファイルは保持し、無いものだけ追加する）。

3. **テンプレートコピー**
   - `/home/igpf-2500009/projects/_templates/dev/` の内容を対象ディレクトリにコピーする:
     ```bash
     mkdir -p <target>/docs
     cp -Rn /home/igpf-2500009/projects/_templates/dev/docs/specs   <target>/docs/specs
     cp -Rn /home/igpf-2500009/projects/_templates/dev/docs/tasks   <target>/docs/tasks
     cp -Rn /home/igpf-2500009/projects/_templates/dev/docs/refs    <target>/docs/refs
     cp -Rn /home/igpf-2500009/projects/_templates/dev/src          <target>/src
     cp -Rn /home/igpf-2500009/projects/_templates/dev/tests        <target>/tests
     mkdir -p <target>/docs/changes
     find <target>/docs/specs <target>/docs/tasks <target>/docs/refs <target>/src <target>/tests -name .gitkeep -delete
     ```
   - `.gitkeep` はテンプレート側（dotfilesリポジトリ）で空ディレクトリを保持するためだけの目印なので、コピー後に削除する。
   - `docs/changes/<change-name>/` はプレースホルダーのため**コピーしない**。`docs/changes/` 自体は空ディレクトリとして作成する。
     実際の変更ディレクトリは `/init-change` で作成する。
   - `docs/refs/` は関係者との資料共有用ディレクトリ（空）。

4. **バージョンファイルの作成**
   - `docs/specs/VERSION` が無ければ作成する（`/init-change` がバージョン算出時に参照する。
     詳細: `self-work/directry-rules/directry-rules.md` 4.1、増分判断は `semver` skill）。
   - 初期値はユーザーに尋ねる（新規サブプロジェクトなら通常 `0.1.0`。既存の仕様を後から
     この構成に載せ替える場合は、成熟度に応じた値を一度だけ決めてもらう）。
   - `v` プレフィックスは付けず、プレーンテキスト1行（例: `0.1.0`）で書き込む。

5. **完了報告**
   - 作成したファイル・ディレクトリの一覧をユーザーに報告する。

## 注意事項

- 既存ファイルは上書きしない（`docs/specs/VERSION` が既に存在する場合も上書きしない）。
- `docs/changes/` は空ディレクトリのまま作成し、`<change-name>` の雛形はコピーしない。
- 指示にない設定ファイルやREADME等は作成しない。
- 既存のディレクトリ構成を変更（リネーム等）する場合は、変更前のディレクトリ名で `grep -rn` を実行し、
  ヒットした全ファイル（`.md` だけでなく `.drawio` 等のテキスト内埋め込みも含む）のリンクを更新してから完了とする
  （`self-work/directry-rules/directry-rules.md` 4章参照）。
