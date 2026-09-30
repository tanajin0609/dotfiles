# today-todo viewer

`today-todo/todo-YYYY-MM-DD.md` をカンバン形式で表示するローカルビューア。npm 依存なし（Node標準の `http` モジュールのみ使用。Markdown 描画の marked は CDN から読み込む）。

## 起動コマンド

```bash
today-todo-viewer
```

`install.sh` が `scripts/today-todo-viewer` を `~/.local/bin` にリンクする。ラッパーは `VIEWER_TODO_DIR=~/projects/today-todo`・`VIEWER_DATA_DIR=~/projects/today-todo/viewer/data` を渡して起動する。`server.js` を直接起動すると既定値が `__dirname`（dotfiles 内の実体）基準になり、todo の読み込み先と data の書き込み先が dotfiles 側になるため、ラッパー経由で起動すること。

前提: Node 18+、PATH 上の `claude` CLI（セッション起動系の機能）。

起動後、ブラウザで http://localhost:3131 を開く。

## 仕様

- `## 列名` を列、列内の `### 見出し` 配下のタスクを1グループ（カード）として表示する。
- `### 見出し` の無いタスクは、そのタスク自身を単独カードとして扱う。
- カードの並び順は `data/order-<todoファイル名>.json` に保存される（`POST /api/order`）。
- カードへのコメントは `data/comments-<todoファイル名>.json` に保存される（`POST /api/comments`）。
- ポートは既定で3131。環境変数 `VIEWER_PORT`・`VIEWER_TODO_DIR`・`VIEWER_DATA_DIR`・`VIEWER_CLAUDE_SETTINGS`・`VIEWER_CLAUDE_PROJECTS_DIR`・`VIEWER_RATE_LIMITS_PATH` で上書きできる（テスト用）。
- viewerから起動するセッションのmodel/effortは `data/launch-settings.json` に保存される（ヘッダー「モデル設定」、`POST /api/claude-settings`）。
- 受け入れ条件は `docs/specs/viewer.md`。

## テスト

```bash
node --test tests/*.test.js  # viewer ディレクトリで実行
```
