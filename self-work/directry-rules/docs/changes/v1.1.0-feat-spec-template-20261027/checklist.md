# Tasks: feat-spec-template

- [ ] decisions.md Q1〜Q3 の承認を得る
- [ ] `_templates/dev/docs/specs/` にspec本体雛形を追加する（目的 / 要件 / 受け入れ条件 / Out of Scope / TBD）
- [ ] `_templates/dev/docs/changes/<change-name>/specs/README.md` の保証索引を受け入れ条件ID形式に変える
- [ ] （Q3=a の場合）`init-spec` skill がspec本体雛形をコピーしないようにする
- [ ] `directry-rules.md` 4章に記法規約の節を追加する
- [ ] `tests/` に雛形の必須節・記法をgrepで検査するスクリプトを置き、通す

## delta spec（省略不可）

- [x] 着手時: `specs/README.md` に変更予定の大本spec・節を記入した（状態=予定）
- [ ] 大本spec編集の直前: 対象ファイルを `specs/base/` にコピーした
- [ ] 完了時: `specs/*.diff` を生成し、`specs/README.md` を確定にして `base/` を削除した
      （大本specを変更しない変更の場合は、その旨を `specs/README.md` に明記した）
- [ ] テスト作成/更新時: `specs/README.md` の保証索引に受け入れ条件⇔テストの対応を記入した
- [ ] 完了時: `specs/README.md` の Gaps節に未テストの受け入れ条件を理由とともに明記した
      （無ければ「なし」と明記した）
