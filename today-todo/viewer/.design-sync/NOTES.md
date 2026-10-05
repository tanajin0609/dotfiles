# design-sync notes (today-todo viewer)

- viewer は React でも package でもない単一 `index.html`。design-sync の converter（`package-build.mjs`、`dist/` 前提）は使わず、
  `.design-sync/build.mjs` で tokens-only DS を off-script 生成する: `node .design-sync/build.mjs` → `ds-bundle/`。
- `index.html` の `<style>` を唯一の出典にする。トークンと部品CSSの境界は `* { box-sizing: border-box; }` の行（build.mjs の BOUNDARY）。
- `guidelines/screens.md` のマークアップは `index.html` の DOM 生成関数（`makeCard`・`buildSessionCard`・`buildModalTaskRow` 等）と
  静的マークアップから写したもの。データは業務の固有名詞を含まないダミーにする（dotfiles は共有リポジトリ）。
- 検証: `node .ds-sync/package-validate.mjs ./ds-bundle`（playwright は npx キャッシュの chromium-1246 対応版を
  `.ds-sync/node_modules/` に symlink）。見本 `ds-bundle/.specimen.html`（アップロードしない）を撮って、guidelines の各ブロックが
  実CSSだけで viewer と同じ見た目になるかをライト/ダークで確認する。
- `runtimeFontPrefixes: ["yu gothic"]`: viewer は仕様（viewer.md AC-A2-1）でWebフォントを読み込まず OS の和文書体を使う。
  validator の汎用書体リストに `yu gothic` はあるが `Yu Gothic Medium` が無いだけなので、実行環境側の書体として宣言した。
- 撮影時は WSL に和文フォントが無いので `FONTCONFIG_FILE` で `/mnt/c/Windows/Fonts` の Noto Sans JP 等を参照させる。
  ヘッドレスでは `⏸` の字形が無く ☒ になるが、Windows 上では正しく出る。

## Known render warns

- `_ds_sync.json absent` — off-script 生成のため sidecar を出さない。次回同期は全体を再検証する（tokens-only なので安い）。

## Re-sync risks

- `index.html` の CSS を変えたら `build.mjs` を再実行して再アップロードしないと、Claude Design 側が古い見た目のまま残る。
- `guidelines/screens.md` は手書き。DOM 生成関数のクラス構造を変えたら追従が要る（クラス名の実在は build 後に CSS と照合する）。
- BOUNDARY 行が `index.html` から消えると build.mjs は止まる（黙って全部をトークン扱いにはしない）。
