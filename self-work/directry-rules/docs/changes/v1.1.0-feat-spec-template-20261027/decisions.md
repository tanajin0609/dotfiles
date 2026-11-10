# Decisions: feat-spec-template

意思決定が必要な論点をここに集約する。詳細な検討背景は proposal.md（要件・影響範囲）や
components.md（設計: 技術的な実装方針）に書き、ここには論点・選択肢・決定だけを置く。

## 論点

| # | 論点 | 選択肢 | 決定 | 出典 |
|---|---|---|---|---|
| Q1 | このサブプロジェクトの大本specをどこに置くか | (a) ルート直下の `directry-rules.md` を大本specとして扱う（推奨: install.shのsymlinkや各skillからの参照パスが変わらない）/ (b) `docs/specs/directry-rules.md` へ移動する（構成は揃うが、参照元すべての更新が必要） | 未決定 | proposal.md 提案内容 |
| Q2 | 受け入れ条件IDの形式 | (a) `AC-001`（サブプロジェクト内通し番号。推奨: 短くテスト名に入れやすい）/ (b) `<spec略称>-AC-001`（spec単位採番。衝突しないが長い）/ (c) 要件 `REQ-001` と受け入れ条件 `AC-001` の2系統 | 未決定 | proposal.md 提案内容 |
| Q3 | spec本体雛形の名前と配布方法 | (a) `_templates/dev/docs/specs/<feature>.md` に置き、`/init-spec` ではコピーしない（`<change-name>/` と同じ扱い。推奨: 未記入ファイルが各プロジェクトに残らない）/ (b) `spec-template.md` として `/init-spec` で各プロジェクトへコピーする | 未決定 | proposal.md 提案内容 |

## 承認状況

- [ ] 承認者が本変更の内容（背景・提案内容・実装方針）を自分の言葉で説明できる状態である
- [ ] 承認済み（承認者：`<user>`／日付：`<date>`）
- Q1 の決定理由: 未決定
- Q2 の決定理由: 未決定
- Q3 の決定理由: 未決定
