---
name: init-change
description: |
  docs/changes/<change-name>/ の雛形（proposal.md, design.md, tasks.md, specs/）を
  _templates/dev/docs/changes/<change-name>/ からコピーして作成する。
  /init-change, 変更ディレクトリ初期化
---

# /init-change — 変更ディレクトリ初期化

`docs/changes/<change-name>/` を新規作成し、`proposal.md`・`design.md`・`tasks.md`・`specs/`（delta spec用）の雛形を用意する。
`/explore` → `/propose` の前段、または `/propose` を使わず手動で変更作業を始める際に使う。
詳細ルールは `self-work/directry-rules/directry-rules.md` の1章・4章を参照。

## 引数

`$ARGUMENTS` に作成する `<change-name>` を渡す（必須）。例: `/init-change add-login-api`。
カレントディレクトリの `docs/changes/` 配下に作成する。

## ワークフロー

1. **change-name の確認**
   - `$ARGUMENTS` が空ならユーザーに change-name を尋ねる。
   - カレントディレクトリに `docs/specs/` が存在しない場合、SDD構成が未初期化である旨を伝え、先に `/init-spec` の実行を提案する（提案のみ、勝手に実行しない）。

2. **重複チェック**
   - `docs/changes/<change-name>/` が既に存在する場合は上書きせずユーザーに確認する。

3. **テンプレートコピーとプレースホルダー置換**
   - `/home/igpf-2500009/projects/_templates/dev/docs/changes/<change-name>/` の
     `proposal.md`・`design.md`・`tasks.md`・`specs/` を `docs/changes/<change-name>/` にコピーする:
     ```bash
     cp -R /home/igpf-2500009/projects/_templates/dev/docs/changes/\<change-name\>/. docs/changes/<change-name>/
     ```
   - コピーしたファイル内のプレースホルダー文字列 `<change-name>` を、実際の change-name に置換する
     （`proposal.md`・`tasks.md` の見出しに含まれる）。

4. **完了報告**
   - 作成したパス（`docs/changes/<change-name>/proposal.md` など）をユーザーに報告する。

## 注意事項

- `docs/specs/`（正式spec）はここでは変更しない。正式反映は `/archive` で行う。
- `docs/changes/<change-name>/specs/`（delta spec）は空ディレクトリのまま作成する（中身は `/apply` 工程で生成する）。
