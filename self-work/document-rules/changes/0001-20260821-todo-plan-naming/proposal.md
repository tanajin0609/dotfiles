# 提案書: today-todo配下のドキュメント種別定義と命名規則の整備

> 対象読者: document-rules.md / `todo-import`・`todo-propose` skillのメンテナ（自分）
> スコープ: `today-todo/`配下で使うドキュメント種別の定義と命名規則の確定・関連skillへの反映
> 元セッション: `/todo-propose`バッチモード実行後、「`today-todo/`配下に`plan.md`を作ってくれないのはなぜか」
>   という疑問から発端。directry-rules.md（ディレクトリ構成・配置場所ルール）とは別に
>   `document-rules.md`（誰が・いつ・何のために書くか）を新設する方針とセットで検討した。
> 結論: **決定・本セッション内で反映済み**（directry-rules.mdの0001と異なり、決定と同時に
>   `document-rules.md`本体・`todo-import`/`todo-propose` skill・既存ファイルのリネームまで
>   同一セッションで実施した）。

## 1. 経緯

`/todo-propose`バッチモード実行後、「`today-todo/`配下に`plan.md`が作られないのはなぜか」と
指摘された。調査の結果、過去の `today-todo/plan.md`（2026-08-19付）は `/todo-propose`
（実装は2026-08-20）が作ったものではなく、複数サブプロジェクトを横断してその場で実装まで
進めるアドホックなコーディネーター実行計画という、性質が全く別のドキュメントだったと判明した。

この混同が起きた根本原因は、「どのディレクトリに置くか」のルール（`directry-rules.md`）はあっても
「そのドキュメント種別が何を意味し、いつ使うか」を横断的にまとめた記述がどこにも無かったこと。
これを機に、責務分離した`document-rules.md`を新設し、命名規則も合わせて棚卸しした。

## 2. 【決定】`today-todo/plan-YYYY-MM-DD.md`は`/todo-propose`の成果物ではない

**深刻度: 中 / 確度: 高**

- `/todo-propose`は「提案書・作業計画書の作成で必ず停止し、実装フェーズを持たない」設計
  （`directry-rules.md` 7章、2026-08-20確定）。成果物は常に対象サブプロジェクト内
  （`docs/changes/`・`order-yyyymmdd/`）に閉じ、サブプロジェクトを横断する調整ファイルは作らない。
- `today-todo/plan-YYYY-MM-DD.md`は`/todo-propose`実装前（2026-08-19）に書かれたアドホックな
  成果物で、複数サブプロジェクトの`today-todo`項目を1セッションで実装まで並列消化するための
  実行計画（並列サブエージェントへのファイル競合マップ・モデル割当・実行順序）。単一サブプロジェクトの
  `docs/changes/`に置けない（複数プロジェクトにまたがる）ため`today-todo/`直下に置かれた。
- 現時点でこのパターン専用のコマンド・skillは無い。「今日のtodoを提案書止まりでなく実装まで
  一気に進めたい」とユーザーが明示した場合にのみ、コーディネーターがアドホックに作成する。

## 3. 【決定】todoファイルの命名は `todo-YYYY-MM-DD.md`（`todo-`prefix付与）

**深刻度: 低 / 確度: 高**

- 従来（`todo-import` skill定義）は`YYYY-MM-DD.md`（prefixなし）だった。
- ユーザー指示により`todo-`prefixを付与する形に改定。`today-todo/`ディレクトリ名と紛らわしい
  裸の日付ファイル名より、種別が一目でわかる利点がある。
- 反映先: `todo-import/SKILL.md`（生成規則）、`todo-propose.md`（バッチモードの入力パス）。

## 4. 【決定】planファイルの命名は `plan-YYYY-MM-DD[-<topic>].md`、日付は対応するtodoの日付と一致させる

**深刻度: 中 / 確度: 高**

- 従来の運用実績（2026-08-19）は`plan.md`/`plan-<topic>.md`で**日付なし**。日をまたぐと
  同名ファイルが衝突する欠陥があった。
- ユーザー指示により、ファイル名の日付は「計画を書いた日」ではなく**「処理対象の
  `todo-YYYY-MM-DD.md`と同じ日付」**にする方式へ改定。1トピックのみなら`plan-YYYY-MM-DD.md`、
  複数トピック並行なら`plan-YYYY-MM-DD-<topic>.md`。
- 過去分（2026-08-19付`plan.md`/`plan-notion-task-pipeline.md`）は`archives/`へ移動する際に
  `plan-2026-08-19.md`/`plan-2026-08-19-notion-task-pipeline.md`へリネームし、内部相対リンクも
  追従修正した（3章のtodoリネームと合わせて実施。directry-rules.mdの「既存ディレクトリは凍結」
  方針とは異なり、今回はアーカイブ移動と同時だったためリネームを実施した）。

## 5. 【決定】`today-todo/`直下のアーカイブは手動・都度指示ベース

**深刻度: 低 / 確度: 高**

- `todo-import` skill自体は自動アーカイブ・削除を行わない設計（既存のSKILL.md注記どおり、
  変更なし）。
- ユーザーが「前日までのtodo・planをアーカイブして」と明示したタイミングで、当日分を除く
  `todo-YYYY-MM-DD.md`・`plan-*.md`を`today-todo/archives/`へ`mv`する運用とした
  （ops系の`order-yyyymmdd/`→`archives/order-yyyymmdd/`と同じ考え方。`directry-rules.md` 5章参照）。
- 命名規則に一致しない自由記述メモ（例: `json-gui-editor-changes-open-items-20260819.md`）は
  対象外とし、扱いはユーザーに確認する。

## 6. 本セッション内での反映状況

directry-rules.mdの0001（`/grill-me`スコープの決定のみで実装は別対応）とは異なり、
本件は決定と同時に以下へ反映済み。

- 新設: `self-work/document-rules/document-rules.md`
- 更新: `self-work/directry-rules/directry-rules.md`（責務分離の相互参照、命名変更の追記）
- 更新（dotfiles共有）: `todo-import/SKILL.md`、`todo-propose.md`（`todo-YYYY-MM-DD.md`表記へ統一）
- リネーム: `today-todo/2026-08-21.md` → `todo-2026-08-21.md`、`archives/`配下の旧ファイル一式
- メモリ: `reference_document_rules.md`新設、`reference_directory_rules.md`・`MEMORY.md`更新

**未実施**: dotfiles側の変更のcommit/push（`dotfiles-sync`でユーザー確認の上、別途実行）。
