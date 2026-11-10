# Proposal: feat-spec-template

意思決定が必要な論点は、本文には「問い → 回答（決定）」の1行粒度でだけ書く（未決定なら「未決定」）。選択肢の比較・検討過程は `decisions.md` に置く。

## 結論

`_templates/dev/` にspec本体の雛形を新設し、要件をMUST/SHOULD/MAYで、受け入れ条件をID付きのGiven/When/Thenで書き、未決事項をTBD節に出す記法を規約化する。
受け入れ条件IDを保証索引・テスト名と共通にし、条件とテストの対応をgrepで照合できるようにする。

## 背景

- `_templates/dev/docs/specs/` には `ubiquitous-language.md` しかなく、spec本体の書式が無い。
- 保証索引の「受け入れ条件」列は自由文（`<節番号・条件>`）で、テストとの対応をgrepで照合できない。
- 要件の強制度（必須か推奨か）が文章表現に埋もれ、AIが推測で埋める余地がある。
- 参考: 「生成AIに渡す仕様書の書き方」（Qiita, kodai_kitahara）のうち、既存SDD構成で未導入の4手法。

## 提案内容

- このサブプロジェクトの大本specの置き場所 → 未決定（decisions.md Q1）
- 受け入れ条件IDの形式 → 未決定（decisions.md Q2）
- spec本体雛形の名前と配布方法 → 未決定（decisions.md Q3）
- `_templates/dev/docs/specs/` にspec本体雛形を追加する。節: 目的 / 要件（MUST・SHOULD・MAY＋理由）/ 受け入れ条件（ID＋Given/When/Then）/ Out of Scope / TBD（担当つき）
- `_templates/dev/docs/changes/<change-name>/specs/README.md` の保証索引「受け入れ条件」列を受け入れ条件IDで書く形式にする。
- テスト名に受け入れ条件IDを含める規約を、大本spec（directry-rules.md 4章）に追記する。

## 影響範囲

- `_templates/dev/`（実体: `/mnt/c/Users/IGPF-2500009/dotfiles/templates/dev/`）— 以降の `/init-spec`・`/init-change` の生成物
- `init-spec` skill（Q3=a の場合のみ）
- `self-work/directry-rules/directry-rules.md` 4章

## Non-goals

- 既存サブプロジェクトのspecへの遡及適用
- OpenAPI等のスキーマ定義、markdownlint等のCI導入
- 保証索引とテストの照合を自動検査するツール（IDを振るところまで。検査は別change）
