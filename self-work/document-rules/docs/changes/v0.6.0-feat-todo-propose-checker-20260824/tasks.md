# Tasks: feat-todo-propose-checker

- [x] `~/.claude/agents/todo-propose-checker.md`（dotfiles実体）を新規作成する
      （`design.md`「新規: `todo-propose-checker` エージェント定義」の内容に従う。
      `tools: Read, Grep, Glob, Bash`、`Write`・`Edit`は与えない）
      → `$HOME/.claude/agents/todo-propose-checker.md` を作成した
- [x] `todo-propose.md`の「## today-todoバッチモードの最終レビュー（敵対的検証）」節を
      `design.md`「呼び出し元の変更点」の内容に書き換える（見出しは変更しない）
      → `$HOME/.claude/commands/todo-propose.md` の該当節を書き換えた
- [x] 要修正時の再起票フロー（design.md確認事項1）をユーザー指示により確定し、
      `todo-propose.md`本文に反映した（「要修正」となった特定のサブプロジェクトのみ再起動し、
      他のサブプロジェクトの結果は巻き込まない。2周で打ち切りユーザーに判断を仰ぐ）
- [x] `todo-propose-checker`のモデル指定（design.md確認事項2）を確定した
      （`todo-checker.md`と同様、frontmatterに`model`を書かず未指定とする＝呼び出し元が
      `Agent`呼び出し時に指定する前提）
- [ ] `dotfiles-sync` skillでdotfilesリポジトリへの取り込み・pull・symlink確認を行う
      （commit/pushはユーザー確認の上で実行）
- [ ] 動作確認: `/todo-propose`（引数なし・バッチモード）を実行し、
      `todo-propose-checker`が新規コンテキストで起動され、検証観点5項目
      （調査の実在形跡／「対象外」判定の恣意性／既存ディレクトリ流用原則／todo.md追記／見出し破壊）
      について報告を返すことを確認する
- [ ] 動作確認: 意図的に不備（例: 未確認事項を断定表現で書く、既存ディレクトリを無視して重複作成する）
      を仕込んだ起票内容を用意し、`todo-propose-checker`が「要修正」と判定できることを確認する

## delta spec（省略不可）

**確定（2026-08-24ユーザー指示）**: 本変更の実質的な大本specは`document-rules.md`ではなく
`todo-propose.md`自体（dotfilesリポジトリ管理下の外部ファイル）であり、`document-rules.md`は
今回変更しない。よってdelta spec機構（`specs/base/`コピー・`diff -u`）は本変更には**適用しない**。
（`proposal.md`確認事項2・`design.md`確認事項に対する最終回答。詳細は`specs/README.md`参照）

- [x] 着手時: `specs/README.md` に「大本specを変更しない」旨を記入した（delta spec機構は適用対象外）
- [ ] 大本spec編集の直前: 対象ファイルを `specs/base/` にコピーした
      → 対象外（大本spec = `document-rules.md`を変更しないため実施しない）
- [x] 完了時: `specs/*.diff` は生成しない。`specs/README.md` に大本specを変更しない旨を明記した
      （`base/` はそもそも作成していない）
- [x] テスト作成/更新時: `specs/README.md` の保証索引に受け入れ条件⇔テストの対応を記入した
      （本変更は`tests/`を持つ実装コードを伴わないため、「保証索引」は`tasks.md`の「動作確認」
      タスク2件＝次回`/todo-propose`実行時の動作確認で代替）
- [x] 完了時: `specs/README.md` の Gaps節に未テストの受け入れ条件を理由とともに明記した
      （「なし」と明記済み。動作確認2件は「未テスト」ではなく「次回実行時に検証予定」として
      保証索引側に記載）
