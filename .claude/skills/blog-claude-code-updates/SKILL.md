---
name: blog-claude-code-updates
model: sonnet
description: |
  Claude Code 公式 CHANGELOG.md を取得し、手元の和訳ファイル（CHANGELOG.ja.md）にまだ無い
  新しいバージョンだけを日本語訳して先頭に追記したうえで、ブログネタになりそうな項目を提示する。
  「Claude Code のアップデート取って」「新しいリリースノートを訳して」「アップデート内容を取り込んで」
  と言われたときに使う。ネタファイルの作成自体は blog-neta、記事化は blog-article が担当する。
---

# blog-claude-code-updates — アップデート差分の取得・和訳・ネタ候補提示

## Step 0: 保存先を決める

`$HOME/.claude/local/blog-updates/RULES.md` が存在すれば Read し、そこに書かれた保存先ディレクトリ
（`CHANGELOG.ja.md` と `README.md` を置く場所）を使う。存在しない環境では保存せず、
Step 3 の和訳結果をチャットに表示するだけにとどめる。

## Step 1: 差分を切り出す

翻訳済みの最新版は、`CHANGELOG.ja.md` の最初の `## ` 見出しで判定する（README の記述より確実なため）。

```bash
tmp=$(mktemp -d)
curl -sfL -o "$tmp/src.md" https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md
last=$(grep -m1 '^## ' "<保存先>/CHANGELOG.ja.md" | sed 's/^## //')
grep -qx "## $last" "$tmp/src.md" || echo "WARN: $last が原文に見つからない"
awk -v last="## $last" '$0==last{exit} /^## /{p=1} p' "$tmp/src.md" > "$tmp/new.md"
grep -c '^## ' "$tmp/new.md"; grep '^## ' "$tmp/new.md"
```

- 新着 0 件なら「新しいアップデートなし（最新は $last）」と報告して終了する。
- WARN が出たら原文側の構成が変わっている。推測で切り出さず、ユーザーに報告して止まる。
- `CHANGELOG.ja.md` が無い場合は全文が差分になる。その旨を伝えてから進める。

## Step 2: 和訳する

`new.md` を日本語訳する。規則:

- 全行を訳す。項目の省略・統合・並べ替えをしない。
- `## x.y.z` 見出し、バッククォート内、コマンド名、フラグ、環境変数、設定キー、パス、URL、
  製品・モデル名、`[VSCode]` などの角括弧タグは原文のまま残す。
- 文体はリリースノート調（「〜を追加」「〜を修正」「〜を改善」「〜に変更」）。
- 原文の崩れ（閉じていないバッククォート等）は直さず原文どおりにする。

差分がおよそ 500 行を超える場合は、バージョン見出しの境界で約 500 行ずつに分割し、
`model: sonnet` のサブエージェントに並列で訳させる（1 本に長文を訳させると項目の脱落が起きやすい）。

訳し終えたら原文と件数を突き合わせる。どちらかがずれていたら、バージョンごとの件数を比べて
抜けを特定し、直してから次へ進む。

```bash
grep -c '^## ' "$tmp/new.md" "$tmp/new.ja.md"
grep -c '^- '  "$tmp/new.md" "$tmp/new.ja.md"
```

## Step 3: 追記する

`CHANGELOG.ja.md` の `# Changelog` 行の直後に `new.ja.md` を差し込む。その後、`README.md` にある
収録範囲の記述（先頭バージョン）を更新する。git 操作はしない。

## Step 4: ネタ候補を提示する

今回の差分から、ブログネタになりそうな項目を最大 5 件選び、1 件ずつ「バージョン・項目の要旨・
ネタになる理由（1 行）」で提示する。選ぶ目安:

- 挙動や既定値が変わり、既存の使い方に影響するもの（Changed / 破壊的変更）
- 新しい概念・機能で、試すと記事になりそうなもの
- 自分の運用（skill・hook・設定）に関係するもの

ネタファイルは作らない。ユーザーが記録を選んだら blog-neta に渡す。

## 完了報告

追加したバージョン範囲、見出し数・項目数の照合結果、更新したファイルのパス、ネタ候補を報告する。
