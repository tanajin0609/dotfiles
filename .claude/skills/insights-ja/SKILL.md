---
name: insights-ja
model: sonnet
description: |
  `/insights` が生成した英語の利用状況レポート（HTML）を、構成を保ったまま日本語の
  Markdown に翻訳して所定のディレクトリへ保存する。`/insights` を実行した直後に
  「日本語で読みたい」「日本語化して」と言われたとき、または過去に生成済みの
  レポートHTMLを後から日本語で読み直したいときに使う。翻訳と保存のみを行い、
  レポートの再生成（セッション再分析）はしない。
---

# insights-ja — 利用状況レポートの日本語化

`/insights` の成果物は英語のHTMLで、生成場所は
`/home/igpf-2500009/.claude/usage-data/` である。この skill はそれを日本語Markdownに
翻訳して `/home/igpf-2500009/projects/self-work/insight-report/` に保存する。

**この skill がやらないこと**: セッションの再分析・レポートの再生成。
分析結果は `/insights` の出力（既存データ）をそのまま使い、数値も一切変えない。
日本語化したいレポートがまだ無い場合は、先に `/insights` を実行してもらう。

## Step 0: 入力ソースを決める

日本語化の材料には以下の2通りがある。**上から順に使えるものを採用する。**

1. **同一セッションのコンテキストに `/insights` の分析データ（JSON）がある場合**
   （直前に `/insights` を実行した場合。`project_areas` / `interaction_style` /
   `what_works` / `friction_analysis` / `suggestions` / `on_the_horizon` /
   `fun_ending` / `at_a_glance` といったキーを持つデータ）
   → **そのJSONを正とする。** HTMLから抽出し直さない（HTMLは同じ内容の整形結果であり、
   JSONの方が構造が明示的で取りこぼしが無い）。対象レポートのパスは `/insights` が
   出力した Report URL のファイルパスとする。

2. **コンテキストにデータが無い場合**（別セッション、または後日の実行）
   → 生成済みHTMLから本文を抽出する（Step 1・2）。

引数でHTMLのパスが明示的に渡された場合は、常にそのファイルを対象にする（1より優先）。

**重要（1を選んだ場合も併用が必要）**: コンテキストのJSONには分析文（narrative・提案・摩擦の説明）は
含まれるが、**グラフの数値は含まれない**（ツール使用回数、言語別行数、返信までの時間の分布、
時間帯別メッセージ数、ツールエラー内訳、満足度など）。グラフ数値は必ずHTMLから抽出する（Step 2）。
つまり実際は「文章はJSON・数値はHTML」のハイブリッドになる。

## Step 1: 対象レポートHTMLを特定する

引数でパスが渡されていない場合、最新のレポートを対象にする。

```bash
ls -t /home/igpf-2500009/.claude/usage-data/report-*.html | head -5
```

- `report-YYYY-MM-DD-HHMMSS.html` が実体。`report.html` は最新のコピーなので**対象外**
  （日付が取れないため）。
- **同じ日に複数ある場合、内容（集計範囲）が異なることがある。** 実例として 2026-08-21 には
  `report-2026-08-21-180456.html`（952メッセージ／17日間）と
  `report-2026-08-21-180508.html`（928メッセージ／16日間）が並存していた。**タイムスタンプが
  新しい方が対象範囲が広いとは限らない。**
  - Step 0 の 1（同一セッション）に該当する場合は、`/insights` が出力した Report URL の
    ファイルを使う（最新ファイルではない）。
  - 該当しない場合は最新（`ls -t` の先頭）を使う。
  - いずれの場合も、どのファイルを使ったかを最後の報告に必ず書く。
- 1件も無ければ「日本語化できるレポートがありません。先に `/insights` を実行してください」
  と伝えて終了する。ここで勝手に `/insights` を実行しない。

## Step 2: HTMLから抽出する（グラフ数値は常に必要）

HTMLは静的で、`<style>` と `<script>` に大半のバイト数がある。本文は div のクラス名で
構造化されているため、クラス名ごとに拾えば節の対応関係を保ったまま抽出できる。

```bash
python3 - <<'EOF'
import re, sys
path = "<対象HTMLの絶対パス>"
h = open(path, encoding="utf-8").read()
b = re.sub(r"<style.*?</style>", "", h, flags=re.S)
b = re.sub(r"<script.*?</script>", "", b, flags=re.S)
# 構造を残すため、ブロック要素の境界を改行に変換してからタグを落とす
b = re.sub(r"</(div|h1|h2|h3|p|li|pre)>", "\n", b)
b = re.sub(r"<[^>]+>", "", b)
b = re.sub(r"\n{3,}", "\n\n", b)
print(re.sub(r"[ \t]+", " ", b).strip())
EOF
```

抽出結果を読み、`<h2 id="section-...">` に対応する節の切れ目を手がかりに節ごとに整理する。
（Step 0 で 1 を選んだ場合、この本文抽出は不要。次のグラフ抽出だけ実行する。）

### グラフ数値の抽出（常に実行する）

グラフは `chart-card` 単位で、タイトルが `chart-title`、各行が `bar-label` と `bar-value` の対に
なっている。以下でタイトルごとにラベルと数値を一括で取れる。

```bash
python3 - <<'EOF'
import re
path = "<対象HTMLの絶対パス>"
b = open(path, encoding="utf-8").read().split("</style>", 1)[1]
for card in re.split(r'<div class="chart-card"', b)[1:]:
    t = re.search(r'<div class="chart-title"[^>]*>(.*?)</div>', card, re.S)
    title = re.sub(r"<[^>]+>", "", t.group(1)).strip() if t else "(no title)"
    rows = re.findall(r'<div class="bar-label">([^<]*)</div>.*?<div class="bar-value">([^<]*)</div>', card, re.S)
    print(f"## {title}")
    for l, v in rows:
        print(f"   {l.strip()} = {v.strip()}")
    if not rows:  # 棒グラフ以外（指標カード等）は生テキストで確認する
        print("   RAW:", re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", card))[:400])
    print()
EOF
```

冒頭の統計行（メッセージ数・変更行数・ファイル数・日数）は別構造なので個別に拾う。

```bash
python3 -c "
import re
b = open('<対象HTMLの絶対パス>', encoding='utf-8').read().split('</style>',1)[1]
print(re.findall(r'<div class=\"stat-value\">([^<]*)</div>\s*<div class=\"stat-label\">([^<]*)</div>', b))
"
```

棒グラフでないカード（並列セッションの指標カード、時間帯セレクタ付きのカードなど）は
`RAW:` 出力を読んで手で拾う。時間帯別のグラフはタイムゾーンセレクタを含むため、
どのタイムゾーンの値かを日本語レポートの見出しに明記する（例: `Tokyo UTC+9`）。

## Step 3: 日本語Markdownを組み立てる

原本の節構成をそのまま維持する（節を減らす・増やす・並べ替えるをしない）。

```markdown
# Claude Code 利用状況レポート（YYYY-MM-DD）

対象期間: YYYY-MM-DD 〜 YYYY-MM-DD
セッション数: N件（分析対象 M件） / メッセージ数: N件 / 稼働時間: Nh / コミット数: N
原本: `/home/igpf-2500009/.claude/usage-data/report-YYYY-MM-DD-HHMMSS.html`（英語）

## 概況（At a Glance）

### 機能していること
### 妨げになっていること
### すぐ試せる改善
### 今後可能になること

## 作業領域（Project Areas）

| 領域 | セッション数 | 内容 |

## 対話スタイル（Interaction Style）

（原本の narrative を段落として訳す。末尾の key_pattern は引用ブロックで置く）

## うまくいっている点（What Works）

## 摩擦が生じている点（Where Things Go Wrong）

## CLAUDE.md への追記提案（Suggested CLAUDE.md Additions）

## 試すとよい機能（Features to Try）

## 使い方のパターン（Usage Patterns）

## 今後の展望（On the Horizon）

## おまけ（Fun Ending）
```

グラフ（ツール使用回数・言語別行数・目標分類など）が原本にある節では、
ラベルと数値をMarkdownの表にして残す。**数値・パーセンテージ・日付は改変しない。**

### 翻訳ポリシー

- **そのまま残す（訳さない）**: ツール名（`Bash` / `Edit` / `Write` / `AskUserQuestion` 等）、
  スラッシュコマンド名、ファイル名・パス、コードブロック・シェルコマンド・JSON、
  機能名（Hooks / Skills / Task Agents 等）、数値・統計値。
- **日本語にする**: 説明文・分析文・見出し。節見出しは「日本語（英語原文）」の形で併記し、
  原本のどの節に対応するか追えるようにする。
- **コピペ用プロンプト**（`copyable_prompt` 等、ユーザーがそのまま貼って使う文章）は
  日本語に訳す。そのまま日本語で実行できるため、原文の併記はしない。
- 意訳しすぎない。指摘の強さ（「〜すべき」「〜かもしれない」）を勝手に和らげたり
  強めたりしない。分析結果の**要約・省略もしない**（全項目を訳す）。

## Step 4: 保存する

保存先ディレクトリは `/home/igpf-2500009/projects/self-work/insight-report/`。
無ければ作成する。

```bash
mkdir -p /home/igpf-2500009/projects/self-work/insight-report
```

ファイル名は `insight-report-YYYY-MM-DD.md`。日付は**原本HTMLのファイル名の日付**を使う
（翻訳を実行した日ではなく、レポートが生成された日）。

- 同名ファイルが既に存在する場合は、**上書きせずユーザーに確認する**
  （同日に複数回 `/insights` を実行したケース。`insight-report-YYYY-MM-DD-2.md` にするか、
  上書きするかを尋ねる）。
- 英語の原本HTMLはコピーしない（`/home/igpf-2500009/.claude/usage-data/` にあるものを
  参照する前提。保存したMarkdownの冒頭に原本パスを明記しておく）。

## Step 5: 報告する

以下を簡潔に伝える。

- 保存したファイルのパス（リンクとして明記）
- 材料にしたソース（同一セッションの分析データ / 抽出したHTMLのパス）
- 翻訳で判断に迷った箇所や、原本に情報が欠けていた箇所があればその旨
