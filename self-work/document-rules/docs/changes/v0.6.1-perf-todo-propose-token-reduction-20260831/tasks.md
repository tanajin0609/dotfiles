# Tasks: perf-todo-propose-token-reduction

- [ ] `todo-propose.md` 0-2: サブエージェントへの指示に「報告は成果物ファイル反映後、親への
      返答は要約のみ」を追記する
- [ ] `todo-propose.md` 0-4: 報告フォーマットを「親への返答（要約）」と「成果物ファイルに書く内容
      （詳細）」に分離して書き直す
- [ ] `todo-propose.md` 「today-todoバッチモードの最終レビュー」節: `todo-propose-checker`への
      引き渡し内容を成果物ファイルパス一覧に変更する
- [ ] `todo-propose.md` 3-1: まとめ版生成時に参照する情報源を成果物ファイル直読みに変更する
- [ ] 変更後の`todo-propose.md`で小規模なバッチモード実行（2〜3サブプロジェクト程度）を行い、
      変更前と同条件（同程度の項目数）でcache_read/output tokensを比較する
- [ ] 比較結果（削減率・削減できなかった場合の原因）を`design.md`に追記する

## delta spec（省略不可）

- [ ] 着手時: `specs/README.md` に変更予定の大本spec・節を記入した（状態=予定）
- [ ] 大本spec編集の直前: 対象ファイルを `specs/base/` にコピーした
- [ ] 完了時: `specs/*.diff` を生成し、`specs/README.md` を確定にして `base/` を削除した
      （大本specを変更しない変更の場合は、その旨を `specs/README.md` に明記した）
- [ ] テスト作成/更新時: `specs/README.md` の保証索引に受け入れ条件⇔テストの対応を記入した
- [ ] 完了時: `specs/README.md` の Gaps節に未テストの受け入れ条件を理由とともに明記した
      （無ければ「なし」と明記した）
