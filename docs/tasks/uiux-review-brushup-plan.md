# uiux-review スキルの改善計画

**結論**: LLMによるUIレビューは偽陽性が2割前後、単独評価の発見率は平均35%という原文確認済みの知見に合わせ、①実測ツールで確定させる ②出力前に根拠を再照合する ③深刻度を3要素で評定する ④評価の限界を明示する ⑤基準の記述を更新する、の順に1項目1PRで直す。
同じ `SKILL.md` / `references/` を触るため並行させず、backlog `#11`〜`#16` を番号順に直列で進める。
根拠と検証状況（原文確認済み／未確認）は [uiux-review-research.md](uiux-review-research.md) にある。数値をスキルへ書くときは、そこで `[原文確認済]` のものだけを使う。

対象: `.claude/skills/uiux-review/`（`SKILL.md`、`references/uiux-checklist.yaml`、`references/uiux-heuristics.md`）

## 共通の完了条件

- 変更後のスキルで、同じ入力（例: アクセシビリティ違反を数件仕込んだ1ページのHTML）を改修前後で1回ずつレビューさせ、狙った挙動の差が出力に現れることを確認し、PR本文に差分を書く。
- `grep -rniEf ~/.claude/local/ngwords.txt .claude/` がヒットしない（ファイルが無い環境では省略）。

## #11 実測ツールで機械判定項目を確定させる

- `runtime` 入力（起動できるアプリ・URL）があるとき、axe-core（Playwright経由）と Lighthouse のアクセシビリティ監査を実行し、該当idの指摘は実測結果を「確定」の根拠にする。無いときは既存の機械チェック表（SKILL.md 手順6）を使う。
- フォーカス管理・キーボードトラップ・読み上げ順は自動ツールで判定できない前提で、手動確認として残す。
- 根拠: axe-core は適合率0.90・再現率0.36（arXiv 2609.09379）。自動検出は件数ベースで57%（Deque）。
- 実行方法: axe-core は、プリインストール済みの Playwright で対象ページを開き、npm の `axe-core` パッケージの `axe.min.js` を `page.addScriptTag` で注入して `axe.run()` を呼ぶ。Lighthouse は `npx -y lighthouse@<版> <URL> --only-categories=accessibility --output=json --chrome-flags="--headless --no-sandbox"`（Chrome は `/opt/pw-browsers/chromium` を `CHROME_PATH` で渡す）。どちらも版を固定し、版は着手時に `npm view <pkg> version` で決める。
- npm レジストリはクラウド環境の既定で到達できる。リポジトリの依存（package.json 等）には加えないので、依存追加の確認は不要。実行スクリプトはスキル内の `scripts/` に置き、出力は `/tmp` 配下に保存する。
- axe のルールid とチェックリストidの対応: `auto: true` の項目ごとに、判定内容が一致する axe ルール（例: `image-alt` → `A11Y-P-01`、`html-has-lang` → `A11Y-U-01`）をスキル内の対応表に書く。対応の無い axe 違反は `[axe: <rule id>]` として出す。
- 検証用入力: `lang` 無し・`alt` 無し・ラベル無し入力欄・低コントラスト文字を仕込んだ1ページのHTMLを `/tmp` に作り、`python3 -m http.server` で配信して使う（リポジトリにはコミットしない）。
- 実行できなかったとき（ネットワーク不可・ページ起動失敗）は、既存の機械チェック表に戻し、その旨をサマリに1行書く。

## #12 出力前の自己検証パスを入れる

- 出力直前に全指摘を入力へ再照合し、根拠位置（コード行・スクショの箇所）を示せない指摘は「要確認」へ移す。深刻度「高」は削除せず要確認へ回す（検証は本物の問題も落としうるため）。
- 静止画・コードから観察できない操作上の挙動を推測で指摘しない。同一原因の指摘は1件にまとめ、見た目だけの指摘の深刻度は「低」を上限にする。
- 根拠: GPT-4o の指摘の24.3%が偽陽性、原因はハルシネーションと静止画から検出できない問題の推測（arXiv 2506.16345）。AIは検証できない仮定と美観の不一致を強調する（arXiv 2510.17056）。

## #13 深刻度を頻度・影響・持続性で評定する

- `uiux-checklist.yaml` の severity 補正条件（42行目付近）に次の2条件を加える。既存の「2段は不可」の制約は保つ（例: 決済で+1、頻度で+1が重なっても上げるのは1段まで）。
  - 頻度: 主要シナリオの全員が通る箇所、または3画面以上で同じ問題が起きる → +1
  - 持続性: 一度気づけば以後は迷わない（初回だけの戸惑い） → -1
  - 補正は既存条件と合算し、+1と-1は相殺する。合計を±1に丸める。
- 評定の段は SKILL.md の実行手順に「手順8: 評定」として足す（手順2〜7で見つけた指摘に、ここで初めて深刻度を付ける）。出力フォーマットは変えない。
- 手順上、発見（チェックリスト走査）を終えてから評定を付ける段を分ける。
- 根拠: NN/g Severity Ratings（3要素、評定は発見セッションの後）。

## #14 評価の限界と複数画面の扱いを明示する

- サマリに「単独評価のため見落としがありうる。ユーザーテストの代替ではない」を1行入れる。
- 複数画面の入力は出現順に扱い、画面間の一貫性・遷移の違反を見るよう手順に明記する。
- 根拠: 単独評価者の発見率は平均35%、ユーザー調査は代替不可（NN/g）。LLMは複数画面にまたがる違反に弱く、画面順を明示すると改善した（arXiv 2507.02306）。

## #15 基準の記述を原文確認済みの範囲で更新する

- `uiux-heuristics.md` 6章: EN 301 549 を「v4.1.1（WCAG 2.2 AA参照、2026-09-02公開）。EU官報引用（2027-01-22予定）までは適合推定の効力なし」に書き換える。WCAG 3 は Working Draft で違反の根拠にしないこと、コントラスト算出法が未定なので WCAG 2.x の比で判定することを注記する。
- 10章: EUデジタル公正法を「提案中（2026-11-11採択）・未施行」として追記する。
- 17章: Liquid Glass 上の独自コントロールは控えめに、色を付けるならコントラストを上げた版も用意、を追加する。
- 根拠: Deque・ETSI・W3C・欧州委員会・Apple の原文（uiux-review-research.md 2章）。

## #16 未確認の基準・指針を原文確認してから追記する

- 対象と追記先:

  | 対象 | 確認先 | 追記先 |
  |---|---|---|
  | 米FTC Click-to-Cancel の経緯 | Federal Register の Negative Option Rule 関連公示 | `uiux-heuristics.md` 10章 |
  | JIS X 8341-3 の改正状況 | JISC・WAIC の公示 | `uiux-heuristics.md` 6章 |
  | 改善案の品質指針（Molich, Jeffries, Dumas「Making Usability Recommendations Useful and Usable」） | https://uxpajournal.org/wp-content/uploads/sites/7/pdf/useful-usable.pdf | `SKILL.md` 出力フォーマットの「改善案」の書き方 |
  | AI機能UIの「時間経過」観点 | Microsoft HAX Toolkit の Guidelines for Human-AI Interaction | `uiux-heuristics.md` 21章と `uiux-checklist.yaml` の `AI-*` |
- 原文を取得できたものだけを追記する。取得できないものは追記しない。
- 着手条件（2026-11-25時点で未充足）: ftc.gov は許可済みでも自動クライアントに403を返すため、Federal Register（www.federalregister.gov）の公示で代替確認する。JIS は総務省PDFが404のため、JISC・WAIC の公示ページで確認する。uxpajournal.org・www.microsoft.com・www.federalregister.gov・www.jisc.go.jp・waic.jp はネットワーク許可リストに無いので、着手時にユーザーへ許可を依頼する。User-Agent を偽装して取得しない。

## Non-goals

- 評価者を複数並べて独立に走査し統合する仕組み（NN/gは3〜5人を推奨するが、コスト増のため今回は扱わない）。
- 指摘件数の上限の見直し（定量的な一次情報が見つからなかったため、現行の経験則を維持）。
