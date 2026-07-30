---
name: init-ops-work
description: |
  Ops系サブプロジェクトの依頼単位ディレクトリ（order-yyyymmdd/ 配下に order.md, plan.md, src/, share-doc/）を
  _templates/ops/ からコピーして作成する。
  /init-ops-work, ops初期化, 運用テンプレート初期化
---

# /init-ops-work — opsテンプレート初期化

仕様駆動（SDD）ではなく運用（Ops）作業が中心のサブプロジェクト向けに、`order.md`・`plan.md`・`src/`・`share-doc/` の軽量構成を初期化する。
直置きするとファイル・フォルダが散らかるため、依頼（order）単位で `order-yyyymmdd/` サブディレクトリを作り、その配下に構成する。
詳細ルールは `self-work/directry-rules/directry-rules.md` の5章を参照。

## 依頼対応の標準フロー

1. `order.md` の依頼内容を確認する。
2. **plan.mdを書く前に、対象システムのリポジトリ内に同種の作業を行う既存のバッチ管理ファイル（例: `lib/batch/<tenant>/tmp/*.rb`のような汎用バッチクラス。`operation/*`等の専用ブランチにしかない場合もあるので`git branch -a`も確認する）がないか確認する。** 見つかった場合はそれを実装内容のベースとして`src/`スクリプトを作成する（対象リポジトリへのコミットや作業ブランチでの管理は不要、`ops-work`側の一回限りスクリプトとして完結させる）。
3. `order.md`と2の調査結果をもとに `plan.md`（作業計画書）を作成する。調査結果・対応方針・対象データ・リスクを明記する。
4. **`plan.md` はユーザーの承認を得てから次に進む。承認前に `src/` の実装に着手しない。**
5. 承認後、`src/` に実装を行う（2で見つかった既存バッチファイルがあれば、それをベースに実装する）。
6. 手動作業（本番サーバーへのscp、rails runner実行、DRYRUN確認、本実行など）が発生する場合は、その手順を `instruction.md` に書く（`_templates/ops/instruction.md` をコピーして使う）。
7. 関係者と共有する資料は `share-doc/` に置く。

## 引数

`$ARGUMENTS` にサブプロジェクトのディレクトリ名（`/home/igpf-2500009/projects/` からの相対パス）を渡す。
例: `/init-ops-work rpa-scenario`。省略時はカレントディレクトリを対象にする。

## ワークフロー

1. **対象ディレクトリの決定**
   - `$ARGUMENTS` が指定されていれば `/home/igpf-2500009/projects/<ARGUMENTS>` を対象にする。省略時はカレントディレクトリ。
   - 対象ディレクトリが存在しない場合は、作成してよいかユーザーに確認する。
   - 対象に既に `docs/specs/`（devテンプレート）が存在する場合、混在させてよいかユーザーに確認する。

2. **依頼ディレクトリの決定**
   - 実行日の `order-yyyymmdd/`（例: `order-20260730/`）を対象ディレクトリ配下に作る。これが今回の依頼（order）の作業ディレクトリになる。
   - 同日中に複数の依頼が来た場合は `order-yyyymmdd/` が既に存在するため、上書きせずユーザーに確認する（連番付与などの対応を相談する）。

3. **重複チェック**
   - `order-yyyymmdd/` 配下に既に `order.md`・`plan.md`・`src/`・`share-doc/` のいずれかが存在する場合は、
     上書きせずユーザーに確認する（既存ファイルは保持し、無いものだけ追加する）。

4. **テンプレートコピー**
   - `/home/igpf-2500009/projects/_templates/ops/` の内容を `order-yyyymmdd/` 配下にコピーする:
     ```bash
     ORDER_DIR="<target>/order-$(date +%Y%m%d)"
     mkdir -p "$ORDER_DIR"
     cp -n  /home/igpf-2500009/projects/_templates/ops/order.md       "$ORDER_DIR/order.md"
     cp -n  /home/igpf-2500009/projects/_templates/ops/plan.md        "$ORDER_DIR/plan.md"
     cp -Rn /home/igpf-2500009/projects/_templates/ops/src            "$ORDER_DIR/src"
     cp -Rn /home/igpf-2500009/projects/_templates/ops/share-doc      "$ORDER_DIR/share-doc"
     ```
   - `instruction.md`（`_templates/ops/instruction.md`）は手動作業が発生する依頼でのみ、実装フェーズで `order-yyyymmdd/` 直下にコピーして使う（`order.md`・`plan.md`と同じ階層。このタイミングでは無条件にはコピーしない）。

5. **完了報告**
   - 作成したファイル・ディレクトリの一覧をユーザーに報告する。

## 注意事項

- `docs/specs/` は作成しない（1章のコアルール1「仕様書が唯一の正解」の適用対象外）。
- 既存ファイルは上書きしない。
- `order.md`・`src/`・`share-doc/` はサブプロジェクト直下ではなく、必ず `order-yyyymmdd/` 配下に作る（直置き禁止）。
