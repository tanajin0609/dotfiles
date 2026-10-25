---
name: image-gen-inbox
description: 画像生成AIのアプリ（Gemini アプリなど、APIを使わず無料で使える画面）で手作業で作った画像を、プロジェクトに取り込む流れを自動化する。プロンプトを出し、受付フォルダの画像の背景を抜いて確認用の一覧を作り、確認済みのものを出力先へ移す。「画像のプロンプトを出して」「inbox の画像を取り込んで」「生成した絵を組み込んで」と言われたとき、またはプロジェクト直下に .claude/image-gen-inbox.json があり、画像の追加が必要な変更をしたときに使う。
---

# image-gen-inbox

API の画像生成は有料のことが多いため、生成だけは人が無料のアプリで行い、前後をスクリプトが受け持つ。

```
[Claude] prompts ─▶ [人] アプリで生成 ─▶ [人] GitHub の <inbox>/ にアップロード
                                                 │
[人] contact-sheet を見て採用を決める ◀─ [Claude] ingest
        │
        ▼
[Claude] adopt ─▶ <outputDir>/ へ移す ─▶ afterAdopt（プロジェクト側の登録処理）─▶ commit
```

スクリプト: このskillのディレクトリの `scripts/image_inbox.py`（Python 3 + Pillow）。プロジェクト直下で `python3 <skill>/scripts/image_inbox.py <prompts|ingest|adopt>` と実行する。

## 設定 `.claude/image-gen-inbox.json`

| キー | 必須 | 意味 |
|---|---|---|
| outputDir | ○ | 採用した画像（`<id>[-<variant>].png`）の置き場所 |
| itemsCommand | ○ | 項目の一覧を JSON で標準出力に出すコマンド（配列）。形式は `[{"id", "label", "prompts": {"<variant>": "..."}}]`。variants が空なら `"prompt": "..."` |
| variants | | 1項目あたりの画像の種類（例: サイズ違い）。先頭を最初に生成し、残りはその画像を添えて画風をそろえる。既定は無し（1項目1枚） |
| styleReference | | 各項目の1枚目に添える、既存の見本画像のパス |
| afterAdopt | | adopt の最後に、採用した id を引数に付けて呼ぶコマンド（配列）。コードへの登録などに使う |
| inbox | | 受付フォルダ。既定 `art-inbox`。`<inbox>/review/` は .gitignore に入れる |
| background / backgroundTolerance | | 抜く背景色と、RGB の距離の許容幅。既定 `#ff00ff` / 100。プロンプトでも単色背景を指定しておく |
| keepLargestShape | | いちばん大きい塊だけ残す（アプリの透かし対策）。既定 true |
| outputWidth / binaryAlpha / previewCells | | 出力の幅（既定は切り抜いたまま）、半透明を2値にするか（既定 true）、一覧の下段に出す点の粗さ（既定 40） |

## Claude が受け持つこと

- **prompts:** 出力をそのままユーザーに渡す。itemsCommand の一覧に無い項目が要るときは、先にプロジェクト側に足す。
- **ingest:** 既定ブランチを取り込んで `<inbox>/` を確認する。名前が `<id>[-<variant>]` でない画像は、Read で中身を見て判断し名前を付け直す（迷えば AskUserQuestion で聞く）。ingest 後、`<inbox>/review/contact-sheet.png` を SendUserFile で見せ、採用する項目を AskUserQuestion で聞く。背景が残った・向きや画風がそろわないものは作り直しの候補として挙げる。
- **adopt:** 採用と言われた項目だけ取り込み、プロジェクトのテストが通ることを確かめてから commit する。

テスト: `cd <skill>/scripts && python3 -m unittest`
