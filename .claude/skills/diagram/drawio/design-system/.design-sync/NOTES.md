# design-sync notes

- 変換スクリプトと依存（.ds-sync/）・生成物（dist/・ds-bundle/）は git 管理外。同期の前に、/design-sync スキル本文の手順どおり .ds-sync/ にスクリプトを置き、`npm i esbuild ts-morph @types/react react react-dom playwright` を入れる。

- 色・フォントのみの同期（コンポーネント0件）。dist/ は `python3 to_css.py` が tokens.json と semantic.json から生成する。ビルドコマンドはない。
- プレビューカード（_preview/{colors,nodes,edges}.html）は変換スクリプトの出力ではなく `build_previews.py` が ds-bundle/_preview/ に書き出す。変換スクリプトを流すと消えるので、手順は「to_css.py → resync.mjs → build_previews.py → package-validate.mjs」の順に固定する。
- package-validate の表示確認は components/ だけが対象で、_preview/ の3枚は見ない。3枚は playwright で別に開き、var(--dg-*) が効いているかを確認した。
- [DTS_REACT] の警告はコンポーネントがないので無視してよい。
- v0.2 の配色は Claude Design 側の templates/diagram-refresh/TOKEN_SPEC.md が出典。tokens.json は値を {css, hex} で持ち、CSS は oklch、draw.io は hex の近似値を使う。値の解決は tokens_lib.py に集約。
- [FONT_MISSING]（Plus Jakarta Sans / JetBrains Mono）は既知の警告。フォント実体は同梱していないので、未導入の環境では代替フォントで表示される。
- TOKEN_SPEC.md 6章のアイコン形状と、ノードの部品化（カード＋アイコン＋タグ）は未対応。CSS 変数では表現できないため。

## Re-sync risks
- tokens.json / semantic.json を変えたら to_css.py と build_previews.py の再実行を忘れない。忘れると、同期した CSS と drawio-styles.json の配色がずれる。
- conventions.md の変数名一覧は手書き。semantic.json の役割を増減したら conventions.md も直す。
- ここは git 管理外のため、config.json などはコミットしていない。
