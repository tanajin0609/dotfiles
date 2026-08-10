---
name: init-change
description: |
  既存の SDD サブプロジェクト内に、変更1件ぶんのディレクトリ
  docs/changes/<連番>-<日付>-<change-name>/ を作り、proposal.md・design.md・tasks.md・specs/
  の雛形を用意する。新しい改修・機能追加に着手する直前、実装より先に提案と設計を
  書き起こす段階で使う。連番と作成日は自動付与するため、採番順がそのまま時系列になる。
---

# /init-change — 変更ディレクトリ初期化

`docs/changes/<連番>-<日付>-<change-name>/` を新規作成し、`proposal.md`・`design.md`・`tasks.md`・`specs/`（delta spec用）の雛形を用意する。
`/explore` → `/propose` の前段、または `/propose` を使わず手動で変更作業を始める際に使う。
詳細ルールは `self-work/directry-rules/directry-rules.md` の1章・4章を参照。

## 引数

`$ARGUMENTS` に作成する `<change-name>` を渡す（必須、番号・日付は自動付与のため含めない）。例: `/init-change add-login-api`。
カレントディレクトリの `docs/changes/` 配下に作成する。

## ディレクトリ命名規則

`<連番4桁>-<作成日8桁>-<change-name>`（例: `0001-20260805-add-login-api`）。

- **連番**: `docs/changes/` 配下の既存ディレクトリ名から先頭4桁の連番を走査し、最大値+1を採用する（ゼロ埋め4桁）。既存ディレクトリが無ければ `0001` から開始する。
  ```bash
  ls -d docs/changes/*/ 2>/dev/null \
    | sed -E 's#.*/([0-9]{4})-[0-9]{8}-.*/$#\1#' \
    | grep -E '^[0-9]{4}$' \
    | sort -n | tail -1
  ```
- **作成日**: コマンド実行日を `YYYYMMDD` 形式で付与する。
- 連番は「作成順＝時系列」を兼ねるため、日付とは別に厳密な連続性を保つ（歯抜け・同日内の連番リセットはしない）。

## ワークフロー

1. **change-name の確認**
   - `$ARGUMENTS` が空ならユーザーに change-name を尋ねる。
   - カレントディレクトリに `docs/specs/` が存在しない場合、SDD構成が未初期化である旨を伝え、先に `/init-spec` の実行を提案する（提案のみ、勝手に実行しない）。

2. **重複チェック**
   - `docs/changes/` 配下に同じ `<change-name>`（末尾部分）を持つディレクトリが既に存在する場合は、連番違いでも上書きせずユーザーに確認する。

3. **連番・日付の決定とディレクトリ名の確定**
   - 上記「ディレクトリ命名規則」に従い、次の連番と当日日付から `<連番>-<日付>-<change-name>` を組み立てる。

4. **テンプレートコピーとプレースホルダー置換**
   - `/home/igpf-2500009/projects/_templates/dev/docs/changes/<change-name>/` の
     `proposal.md`・`design.md`・`tasks.md`・`specs/` を `docs/changes/<連番>-<日付>-<change-name>/` にコピーする:
     ```bash
     cp -R /home/igpf-2500009/projects/_templates/dev/docs/changes/\<change-name\>/. docs/changes/<連番>-<日付>-<change-name>/
     ```
   - コピーしたファイル内のプレースホルダー文字列 `<change-name>` を、実際の change-name（番号・日付は含めない）に置換する
     （`proposal.md`・`tasks.md` の見出しに含まれる）。

5. **完了報告**
   - 作成したパス（`docs/changes/<連番>-<日付>-<change-name>/proposal.md` など）をユーザーに報告する。

## 注意事項

- `docs/specs/`（正式spec）はここでは変更しない。正式反映は `/archive` で行う。
- `docs/changes/<連番>-<日付>-<change-name>/specs/`（delta spec）は空ディレクトリのまま作成する（中身は `/apply` 工程で生成する）。
