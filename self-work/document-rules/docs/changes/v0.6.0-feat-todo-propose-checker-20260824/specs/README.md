# Delta Spec: feat-todo-propose-checker

大本spec（`docs/specs/`）に対して、この変更で入れた差分の記録。
差分の実体は同ディレクトリの `*.diff`（unified diff）で、このファイルは
「どの大本specのどの節を、なぜ変えたか」を人が読むための索引。

**本変更は大本specを変更しない（確定・2026-08-24ユーザー指示）**: 本変更の実質的な大本specは
`document-rules.md`（このプロジェクトの大本spec相当。「ドキュメント種別・命名規則」を扱う別責務の
メタ文書）ではなく、`$HOME/.claude/commands/todo-propose.md`自体
（dotfilesリポジトリ管理下、`docs/specs/`配下ではない外部ファイル）である。`document-rules.md`は
今回変更しないため、`self-work/document-rules`側のdelta spec機構（`specs/base/`にコピーして
`diff -u`を生成する`projects/CLAUDE.md`標準ワークフロー5番）は適用しない。`todo-propose.md`・
新規`todo-propose-checker.md`自体の変更内容は`proposal.md`・`design.md`側の記述、および
本変更ディレクトリの`tasks.md`のチェック実績で代替する。

以下は`proposal.md`・`design.md`起案時点で残っていた確認事項（読み替えの是非）に対する、
上記確定前の記録として残す（過去の検討過程の参照用）。

## 記入のタイミング

1. **着手時**: 下表に変更**予定**を書く（状態 = `予定`）。`base/` は空のまま。
2. **大本specを編集する直前**: 編集対象の大本specを `base/` にコピーする（差分の基準点。既にあれば上書きしない）。
3. **完了時**: `base/` と大本specを `diff -u` して `*.diff` を生成し、状態を `確定` にする。`base/` は削除する。

## 差分一覧

**該当なし（2026-08-24確定）**: 本変更は`document-rules.md`（このプロジェクトの大本spec相当）を
変更しないため、上記「本変更は大本specを変更しない」の通りdiffは生成しない。
`todo-propose.md`・`todo-propose-checker.md`（新規）は`self-work/document-rules`の大本specではなく
外部（dotfilesリポジトリ管理下のコマンド/エージェント定義）のファイルであり、そもそも
この delta spec の対象外（`proposal.md`「影響範囲」参照）。それらの変更内容自体は
`proposal.md`・`design.md`側の記述、および本変更ディレクトリの`tasks.md`のチェック実績で
代替する。

## 保証索引（受け入れ条件 ⇔ テスト）

本変更はドキュメント・エージェント定義の追加であり、`tests/`を持つ実装コードを伴わない。
受け入れ条件の検証は以下で代替する（本プロジェクトに自動テストが無いため、実態に即した記載）。

| 受け入れ条件 | 検証方法 | 状態 |
|---|---|---|
| `todo-propose-checker`が新規コンテキストで起動され、検証観点5項目について報告を返す | 次回`/todo-propose`（引数なし・バッチモード）実行時の動作確認 | 未実施（`tasks.md`「動作確認」タスク） |
| 意図的な不備を仕込んだ起票内容に対し「要修正」判定を返せる | 同上、意図的な不備を仕込んだ起票内容での動作確認 | 未実施（`tasks.md`「動作確認」タスク） |

## Gaps（未テストの受け入れ条件）

なし（上記2件は「未テスト」ではなく「次回実行時に検証予定」として保証索引に記載済み。
`design.md`の確認事項1・2は本変更ディレクトリの`tasks.md`で確定済み）。

## ファイル名規約・diffの生成コマンド（本変更では未使用）

以下はテンプレートの標準手順（大本specを変更する場合に使う）。本変更では上記の通り
大本spec（`document-rules.md`）を変更しないため、`base/`へのコピー・`diff -u`の実行は
行わない。テンプレートの記述として参考のみ残す。

`docs/` 以降のパスの `/` を `_` に置換した平坦名にする。

| 大本spec | `base/` 内 | diff |
|---|---|---|
| `docs/specs/foo.md` | `specs_foo.md` | `specs_foo.md.diff` |

サブプロジェクトのルートで実行する（`<dir>` はこの変更ディレクトリ名）。
`diff` は差分があると終了コード1を返すため `|| true` を付ける。

```bash
CH=docs/changes/<change-name>
diff -u --label "a/docs/specs/foo.md" --label "b/docs/specs/foo.md" \
  "$CH/specs/base/docs_specs_foo.md" "docs/specs/foo.md" \
  > "$CH/specs/docs_specs_foo.md.diff" || true
```

生成後、`*.diff` が空でないことを確認する（空なら大本specを実際には変更していない）。

## 大本specを変更しない場合

**本変更に適用（確定）**: 本変更は大本spec（`document-rules.md`）を変更しない。理由:
本変更の実質的な大本specは`todo-propose.md`自体（dotfilesリポジトリ管理下の外部ファイル）であり、
`document-rules.md`（このプロジェクトの大本spec相当、「ドキュメント種別・命名規則」を扱う別責務の
メタ文書）はそもそも変更対象ではない。よって上記delta spec機構（`base/`コピー・`diff -u`）は
本変更では適用しない。
