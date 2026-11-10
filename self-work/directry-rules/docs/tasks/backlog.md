# Todo

<!-- 採番ルール: 新規タスクにはチェックボックス直後に `#<連番>` を振る（例: `- [ ] #3 内容`）。
     <連番> はこのファイル内の既存 `#<N>` の最大値+1（無ければ1）。完了・削除しても番号は
     再利用しない。既存の未採番タスクへの後付けは不要。 -->

## 進行中
<!-- 1行 = 1成果物（change 1件／未着手フェーズ1つ）。specの開発ステップや手順を1行ずつ並べない。内訳は checklist.md へ（todo-format skill「カードの単位」） -->
<!-- 項目は `### <テーマ名>` でまとめる。todo-import は状態見出しをカード名に使わないため、テーマ見出しが無いとカード名がプロジェクト名だけになる -->
<!-- docs/changes/<version>-<change-name>-<日付>/ を作成したら1行追記する（/init-change 手順5） -->
<!-- 形式（todo-format skill）: - [ ] #<連番> <何をするかの要約> → [docs/changes/<version>-<change-name>-<日付>/proposal.md](../changes/<version>-<change-name>-<日付>/proposal.md) -->

### spec本体雛形と受け入れ条件の記法規約
- [ ] #1 spec本体の雛形を新設し、受け入れ条件ID・Given/When/Then・MUST/SHOULD/MAY・TBD節を規約化する → [docs/changes/v1.1.0-feat-spec-template-20261027/proposal.md](../changes/v1.1.0-feat-spec-template-20261027/proposal.md)

### decisions.md 書き方規約のレビュー自動化
- [ ] #2 todo-checker・grill-checkerの判定観点にdecisions.md書き方規約（D-01〜D-12）のID指摘を追加する → [self-work/document-rules/decisions-authoring.md](../../../document-rules/decisions-authoring.md)

## 完了（archives/へ移動済み）
<!-- /archive で docs/changes/<dir>/ を archives/ へ移したら、該当行をここへ移してチェックする -->
<!-- 形式（todo-format skill）: - [x] #<連番> <何をするかの要約> → [docs/changes/archives/<dir>/proposal.md](../changes/archives/<dir>/proposal.md) -->
