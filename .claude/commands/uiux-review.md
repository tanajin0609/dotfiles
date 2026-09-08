---
description: uiux-review skillを明示的に起動し、UI/UXのヒューリスティック評価を行う。「/uiux-review」で対象（スクショのパス・HTML/CSSファイル・PRのURL等）を指定して確実に実行したいときに使う。
---

# /uiux-review — UI/UXレビュー明示実行コマンド

引数 `$ARGUMENTS`: レビュー対象（スクリーンショットのパス、HTML/CSSファイル、画面遷移図、PRのURL等）。空の場合は直近の会話で言及された対象を確認してから進める。

## 動作

`uiux-review` skillを`$ARGUMENTS`を対象として実行する。評価軸・出力フォーマットはskill側（`.claude/skills/uiux-review/SKILL.md`）の定義に従う。本コマンドはskillの明示的な起動口であり、判定ロジック自体はここに複製しない。
