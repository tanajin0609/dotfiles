# Delta Spec: perf-todo-propose-token-reduction

大本spec（`docs/specs/`）に対して、この変更で入れた差分の記録。
差分の実体は同ディレクトリの `*.diff`（unified diff）で、このファイルは
「どの大本specのどの節を、なぜ変えたか」を人が読むための索引。

大本specは従来どおり直接更新する（delta specは大本の写しを持たないので二重管理にならない）。

## 記入のタイミング

1. **着手時**: 下表に変更**予定**を書く（状態 = `予定`）。`base/` は空のまま。
2. **大本specを編集する直前**: 編集対象の大本specを `base/` にコピーする（差分の基準点。既にあれば上書きしない）。
3. **完了時**: `base/` と大本specを `diff -u` して `*.diff` を生成し、状態を `確定` にする。`base/` は削除する。

## 差分一覧

本変更は大本specを変更しない（理由: 変更対象は`docs/specs/`配下のspec文書ではなく、
`$HOME/.claude/commands/todo-propose.md`というコマンド定義
自体のため。`document-rules`の`docs/specs/`はこの変更に伴い`/init-spec`で初期化したばかりで
現時点では`VERSION`のみ。運用ルールをspec化する作業自体はスコープ外）。

## 保証索引（受け入れ条件 ⇔ テスト）

大本specの受け入れ条件と、それを検証するテストの対応。どの条件が誰にテストされているかを可視化する。

| 大本spec | 受け入れ条件 | テスト | 状態 |
|---|---|---|---|
| `docs/specs/<file>.md` | `<節番号・条件>` | `<test file>::<test name>` | 済 / 未 |

## Gaps（未テストの受け入れ条件）

上表で状態が「未」の行、またはテスト追加を見送った受け入れ条件を理由とともに列挙する。無い場合は「なし」と明記する（空欄放置は不可）。

- `<受け入れ条件>` — 理由: `<なぜ未テストか>`

## ファイル名規約

`docs/` 以降のパスの `/` を `_` に置換した平坦名にする。

| 大本spec | `base/` 内 | diff |
|---|---|---|
| `docs/specs/foo.md` | `specs_foo.md` | `specs_foo.md.diff` |

## diffの生成コマンド

サブプロジェクトのルートで実行する（`v0.6.1-perf-todo-propose-token-reduction-20260831` はこの変更ディレクトリ名）。
`diff` は差分があると終了コード1を返すため `|| true` を付ける。

```bash
CH=docs/changes/v0.6.1-perf-todo-propose-token-reduction-20260831
diff -u --label "a/docs/specs/<file>.md" --label "b/docs/specs/<file>.md" \
  "$CH/specs/base/specs_<file>.md" "docs/specs/<file>.md" \
  > "$CH/specs/specs_<file>.md.diff" || true
```

生成後、`*.diff` が空でないことを確認する（空なら大本specを実際には変更していない）。

## 大本specを変更しない場合

上表を削除し、「本変更は大本specを変更しない（理由: ...）」の1行を残す。
判断の結果として書かれていない状態（空ディレクトリのまま放置）と区別できるようにする。
