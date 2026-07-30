---
name: init-spec
description: |
  サブプロジェクトの初期ディレクトリ構成（docs/specs, docs/tasks, docs/changes, docs/shared, src, tests）を
  _templates/dev/ からコピーして作成する。
  /init-spec, spec初期化, dev構成初期化
---

# /init-spec — devテンプレート初期化

トップレベル `CLAUDE.md` が前提とする SDD 構成（`docs/specs/`・`docs/tasks/`・`docs/changes/`・`docs/shared/`・`src/`・`tests/`）を、
新規または既存のサブプロジェクトに初期化する。詳細ルールは `self-work/directry-rules/directry-rules.md` の4章を参照。

## 引数

`$ARGUMENTS` にサブプロジェクトのディレクトリ名（`/home/igpf-2500009/projects/` からの相対パス）を渡す。
例: `/init-spec rpa-scenario`。省略時はカレントディレクトリを対象にする。

## ワークフロー

1. **対象ディレクトリの決定**
   - `$ARGUMENTS` が指定されていれば `/home/igpf-2500009/projects/<ARGUMENTS>` を対象にする。省略時はカレントディレクトリ。
   - 対象ディレクトリが存在しない場合は、作成してよいかユーザーに確認する。

2. **重複チェック**
   - 対象ディレクトリに既に `docs/specs/`・`docs/tasks/`・`docs/changes/`・`docs/shared/`・`src/`・`tests/` のいずれかが存在する場合は、
     上書きせずユーザーに確認する（既存ファイルは保持し、無いものだけ追加する）。

3. **テンプレートコピー**
   - `/home/igpf-2500009/projects/_templates/dev/` の内容を対象ディレクトリにコピーする:
     ```bash
     cp -Rn /home/igpf-2500009/projects/_templates/dev/docs/specs   <target>/docs/specs
     cp -Rn /home/igpf-2500009/projects/_templates/dev/docs/tasks   <target>/docs/tasks
     cp -Rn /home/igpf-2500009/projects/_templates/dev/docs/shared  <target>/docs/shared
     cp -Rn /home/igpf-2500009/projects/_templates/dev/src          <target>/src
     cp -Rn /home/igpf-2500009/projects/_templates/dev/tests        <target>/tests
     mkdir -p <target>/docs/changes
     ```
   - `docs/changes/<change-name>/` はプレースホルダーのため**コピーしない**。`docs/changes/` 自体は空ディレクトリとして作成する。
     実際の変更ディレクトリは `/init-change` で作成する。
   - `docs/shared/` は関係者との資料共有用ディレクトリ（空）。

4. **完了報告**
   - 作成したファイル・ディレクトリの一覧をユーザーに報告する。

## 注意事項

- 既存ファイルは上書きしない。
- `docs/changes/` は空ディレクトリのまま作成し、`<change-name>` の雛形はコピーしない。
- 指示にない設定ファイルやREADME等は作成しない。
