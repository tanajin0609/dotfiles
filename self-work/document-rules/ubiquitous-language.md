# ユビキタス言語（SDD運用）

SDD運用で使う語の定義。文書・コマンド・会話ではここの「用語」をそのまま使い、「使わない語」は使わない。
業務ドメインの用語は各サブプロジェクトの `docs/specs/ubiquitous-language.md` に置く。

| 用語 | 定義 | 実体 | 使わない語 |
|---|---|---|---|
| 大本spec | 仕様の唯一の正解（Single Source of Truth） | `docs/specs/` | 正式仕様、本仕様 |
| change | 変更1件ぶんの作業単位 | `docs/changes/<version>-<type>-<短い説明>-<日付>/` | 変更チケット |
| proposal | changeの目的・スコープ・受け入れ条件 | `proposal.md` | 企画書 |
| components | changeの設計。既存構造のどこに手を入れ、どう実装するか | `components.md` | design、設計書 |
| decisions | 複数案から選ぶ論点の選択肢・比較・決定 | `decisions.md` | — |
| checklist | changeのタスク分解 | `checklist.md` | tasks |
| delta spec | changeが大本specに入れた差分（unified diff） | `specs/*.diff` | 差分仕様書 |
| 保証索引 | 受け入れ条件とテストの対応表 | `specs/README.md` | — |
| backlog | サブプロジェクトの未完了タスク一覧 | `docs/tasks/backlog.md` | todo |
| refs | 関係者との共有資料。仕様ではない | `docs/refs/` | shared、tmp |
| dev系 / ops系 | `docs/specs/` を持つ開発中心 / 持たない運用中心のサブプロジェクト | — | — |
