---
name: to-html
model: sonnet
description: |
  Markdown を、固定テンプレート（assets/template.html）に本文を流し込む形で、Hero・メトリクスカード・
  図表・コールアウト・TOC を備えたインフォグラフィック志向の HTML（同ディレクトリの `<basename>.html`）に
  変換する。plan.md や実装レポートをブラウザで人に見せたいとき、md のままでは伝わりにくい数値や構造を
  可視化したいとき、あるいは既存の HTML を md の変更に追従させたいときに使う。
---

# /to-html — Markdown → HTML（テンプレート一本化）

冒頭で `$HOME/.claude/local/doc-rules/RULES.md` が存在すれば Read し、ドキュメント横断ルールを確認してから実行する（存在しない環境では無視して続行する）。

現セッションの Claude が md を直接 Read し、`${CLAUDE_SKILL_DIR}/assets/template.html` の `{{TITLE}}` / `{{BODY}}` を埋める形で HTML を Write する。`${CLAUDE_SKILL_DIR}` が展開されない環境では、このSKILL.mdがあるディレクトリに読み替える。

## 入力仕様

- `/to-html <md_path>`
- 旧モード名は **全て現行動作に正規化**（破壊的変更を避けるため受理だけする）
  - `simple` / `rich` / `auto` / `fancy` / `designer` → 全部同じ動作
- `<md_path>` 省略時はカレントディレクトリで以下の優先度で自動検出
  1. `plan.md`
  2. `spec.md`
  3. `report*.md`（更新日時最新）
  4. `research.md`
  5. どれも見つからない場合は AskUserQuestion でパスを聞く

## 設計方針

- **単一モード**: テンプレート方式のみ。分岐は無い。
- **セッション内処理**: 外部の `claude -p` プロセスを起動しないため、別プロセス / 別 API 課金は発生しない。本セッションの Claude が直接 HTML を書く。
- **CSSはテンプレート固定**: `assets/template.html` に全パーツのCSSが入っている。Claude は本文（`{{BODY}}`）だけを組み立て、CSSを書き足さない。見た目が文書ごとにばらつかない代わりに、毎回CSSを書く分のトークンを使わない。
- **md が canonical source**: 情報の出どころは常に md 側。詳細と例外は後述の「.md ⇔ .html 同期ルール」に集約してある。
- **描画検証つき**: HTML を書いたら `scripts/verify_page.py` で実際に描画し、Chart.js の初期化漏れやページ高さの取得失敗を機械的に確認してから開く案内をする。

## 共通ルール

- 出力: 入力 md と同ディレクトリの `<basename>.html`
- 上書き保護マーカー
  - 既存 HTML がマーカー無し（手書き想定） → 上書きしない
  - 既存 HTML が以下のいずれかのマーカー → 上書き可
    - `<!-- generated-by: to-html-designer -->`（現行）
    - `<!-- generated-by: to-html-auto -->`（旧、互換）
    - `<!-- generated-by: md2html -->`（旧 simple、互換）
    - `<!-- generated-by: md2html-rich -->`（旧 rich、互換）
    - `<!-- generated-by: md2html-fancy -->`（旧 fancy、互換）
- 個人情報のマスクは、HTML を Write する前に自分で適用する（誰かが自動でやってくれる工程は無い）。
  マスク対象の識別子と表記は案件ごとに異なるため、冒頭で読み込んだ doc-rules の PII 規則に従う。
  規則が読めなかった場合は、実データらしき ID・氏名・連絡先を HTML に出す前にユーザーへ確認する

## ワークフロー

### Step 1: 引数確定
- `<md_path>` を解決し `ls -la` で実在確認する。md ファイルが無ければここで停止する（md の無い HTML は、後から誰も内容を更新できない行き止まりになる）
- 拡張子が `.md` であること、ファイルが UTF-8 で読めること
- 旧モード引数が渡されてもエラーにせず無視して続行する

### Step 2: 本文組み立て
1. md を `Read` ツールで取り込む
2. **md の充足チェック** — HTML に出したい以下の「伝達内容」が md 側に存在するかを確認し、無ければ md 側を先に Edit/Write で追記してから HTML 生成に進む（後述の同期ルールの適用箇所）:
   - 文書 H1 直下の Lede 文章（短い導入段落） — Hero として描画する内容
   - サマリ章（指標・キー数値・件数等） — メトリクスカードとして描画する内容
   - 各章の本文・表・コードブロック・コールアウト — そのまま HTML 化される内容
   - 装飾（gradient・色・カード枠線）はテンプレート固定のため md に書く必要はない
3. `${CLAUDE_SKILL_DIR}/assets/template.html` を Read し、`{{TITLE}}` に文書タイトルを、`{{BODY}}` に以下を組み立てて埋める:
   - `.hero` — md の H1 + Lede をそのまま
   - `.toc` — md の `## ` 以下を拾ったアンカーリンク
   - `.metrics` — サマリ章の指標・件数を `.metric` カードに
   - 各章 → `.section`（h2/h3・段落・表・`pre.code`）
   - 数値テーブルがあれば `canvas.chart` に `data-chart-type`（`bar`/`line`/`pie`/`doughnut`）と `data-chart-config`（Chart.js の `data`/`options` 相当のJSON）を持たせて図化する。**個々のグラフに `new Chart(...)` を書く必要は無い**（テンプレートの script がまとめて初期化する。詳細はテンプレート内コメント参照）
   - 数値以外でも構造化された情報（フロー・関係性・分類）は `.svg-box` 内に静的な SVG で図化を検討
   - コールアウト記法（`> [!NOTE]` / `[!WARN]` / `[!OK]` / `[!RISK]`）を `.callout` の対応クラス（`note`/`warn`/`ok`/`risk`）に変換
4. 先頭にマーカー `<!-- generated-by: to-html-designer -->` を必ず付与
5. `Write` ツールで `${MD_PATH%.md}.html` に保存（マーカーチェックを満たす場合のみ）

> 図表の密度について: この変換の目的は、md を読むより速く要点が掴める view を人に渡すことにある。段落が並ぶだけの HTML なら md を読んでもらうのと変わらず、変換した意味が無い。テーブル・リスト・フロー・関係性にあたる情報が md にあるなら、Chart.js / SVG / カードレイアウトのどれかで視覚化する。逆に、視覚化できる情報が md に無いなら、装飾を盛るのではなく md 側の不足を先に指摘する。

### Step 3: 検証

Bash のサンドボックスの外で実行する（サンドボックス内では Chrome がプロファイルを作成できず起動に失敗し、CDN にも到達できない）。

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/verify_page.py" <出力html>
```

出力の `ok` が `true` であることを確認する。`charts` がある場合は `chartsReady` が `true` になっているかを見る。`warnings` があれば直してから再実行する。

そのうえで `screenshot` のパスを Read し、実際の見た目を目視する。機械的な確認では次のような崩れを検出できない。

- 表の列幅が偏っている
- カードやグラフが横に広がりすぎて読めない
- 長いラベルが枠からはみ出している

### Step 4: 結果案内
- 生成 HTML の絶対パスをユーザに伝える
- 自動でブラウザを開かない（必要なら `wslview <path>` を案内）

## 関連コマンド

- `/patch-report`: 実装完了レポートを md で生成する。HTML 化したい場合は完成後に `/to-html report-*.md` を続けて呼ぶ

## .md ⇔ .html 同期ルール

**役割:** `.md` は **AI 用**（Claude が canonical source として読む情報本体）、`.html` は **人間用**（ブラウザで読むためのレビュー view）。両者は同じ情報を異なる読み手向けに表現したもの。

**原則:** 同名の `.md` と `.html` が同じディレクトリに存在する場合、両者は**常に完全一致**させる（内容・章立て・例示・テーブル・コードブロック・Lede 文章・サマリ数値すべて）。変更が入った場合は**必ず両方更新**する。

- いずれか一方を編集したら、**同じコミット内でもう一方も同等の変更を適用**する。片方だけの更新は不可
- 既に乖離している状態を見つけたら、ユーザーに「どちらを正とするか」を確認してから同期する
- HTML が `to-html` で生成されている場合でも、`.html` を手動で直接編集したなら `.md` を手動で追従させる（再生成で済むなら再生成する）

### md に書かなくてよいもの（HTML 固有の純装飾のみ）

- gradient 背景・カラーパレット・カード枠線・シャドウ（テンプレート固定）
- フォントサイズ・余白・行間・レスポンシブブレークポイント・ダーク/ライト切替（テンプレート固定）

### md にも必ず書くもの（情報・データ・構造）

- 文書冒頭の Lede 文章（H1 直下の導入段落）
- サマリ章のメトリクス数値・件数・指標
- 各章本文・表のデータ・コードブロック・コールアウトの文面
- 章構造（h2 / h3 の見出し）と章の並び

> **誤解しがちな点**: HTML に「メトリクスカード 4 枚」を表示するなら、md にも対応する「サマリ表（4 行）」が必要。逆も同様。視覚化の形（カード／表／リスト）は HTML 側で選んでよいが、**運ぶ情報量は完全一致**させる。

## トラブルシュート

- 既存 HTML が更新されない: マーカー無しの手書き HTML → 手動退避してから再実行
- `verify_page.py` が「chrome-headless-shell が見つかりません」と出る: Playwright付属の `chrome-headless-shell`（`~/.cache/ms-playwright/chromium_headless_shell-*/`）が未インストール。`npx playwright install chromium` で入る
- `verify_page.py` が Chrome 起動に失敗する: Bash のサンドボックスが原因。サンドボックス無しで再実行する
- グラフが描画されない: `data-chart-config` が有効なJSONか確認。ブラウザコンソールも確認（Chart.js CDN の jsdelivr 不達の可能性）
- 図表が少ないと感じる: md 側にテーブル・サマリ章・数値が無いのが原因。md を先に充実させる
