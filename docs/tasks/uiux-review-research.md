# uiux-review ブラッシュアップ向けベストプラクティス調査（2026-11-25時点、原文検証済み版）

**結論（改善提案トップ5、原文検証後も順位・内容は変わらず）**: ①機械判定できる項目はLLMの目視判断から外し、axe-core/Lighthouse/Playwrightの実測値を根拠にする ②出力前に「指摘ごとに根拠を入力へ再照合する」自己検証パスを入れ、根拠位置を示せない指摘は要確認へ落とす ③深刻度を「頻度×影響×持続性」で評定し、発見と評定を分ける。
④基準の鮮度を更新する（EN 301 549 v4.1.1公開・EU官報引用は未了、EUデジタル公正法の提案、WCAG 3はコントラスト算出法が未定、Liquid Glass。FTCの経緯は原文未確認） ⑤出力に「この評価の限界」（単独評価者の発見率は平均35%、ユーザーテストの代替ではない）を1行で明示し、改善案は「最小変更・具体例つき」に揃える。
**根拠の強さ**: ①②③はすべて原文で確認できた。④はEN 301 549・DFA・WCAG 3を原文で確認、FTC・JISは未確認。⑤の限界明示は原文確認済み、改善案の品質基準（Molichら）は原文未確認。

**検証タグの意味**
- **[原文確認済]**: 出典ページを取得し、該当の文・数値を本文で確認した。
- **[訂正]**: 原文と初版の記述が違ったので直した。
- **[未確認: 理由]**: 原文を取得できなかった。検索結果の抜粋に基づく記述のまま。

**取得できなかったドメイン**: uxpajournal.org・adrianroselli.com・playwright.dev・baymard.com など許可リスト外のもの、www.ftc.gov（自動クライアントに403を返す）、www.soumu.go.jp（該当PDFが404）、europarl.europa.eu（接続不可）。

---

## 1. ヒューリスティック評価の方法論

| 知見 | 検証 | 出典 |
|---|---|---|
| 評価者は3〜5人が理想。各自が**独立に**評価し、自分の評価を終えるまで他人の評価を見ない | [原文確認済] | [NN/g: How to Conduct a Heuristic Evaluation](https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/) |
| 単独評価者が見つける問題は、6プロジェクト平均で**35%**。6事例での範囲は19〜51%（平均34%）。費用対効果の試算例での最適人数は4人 | [訂正] 初版は「20〜51%（Nielsen & Molich 1990）」と二次資料経由で書いていた。NN/g原文の数値に差し替え | [NN/g: Theory Behind Heuristic Evaluations](https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/theory-heuristic-evaluations/) |
| 深刻度は0〜4の5段階で、**頻度・影響・持続性**の3要素の組み合わせ（加えて市場への影響）。評定は発見セッションの**後**に集め、各評価者が独立に付ける。単独評価者の評定は「信頼するには不安定すぎる」。3人の平均で実用上足りる | [原文確認済] | [NN/g: Severity Ratings for Usability Problems](https://www.nngroup.com/articles/how-to-rate-the-severity-of-usability-problems/) |
| ヒューリスティック評価はユーザー調査を**代替できない**。両者は互いに見落とす問題を見つけるので併用が推奨。ドメイン依存が強いシステムでは、ユーザーテスト無しではほぼ見つけられない問題があった | [原文確認済] | [NN/g: How to Conduct](https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/) / [NN/g: Usability Problems Found by Heuristic Evaluation](https://www.nngroup.com/articles/usability-problems-found-by-heuristic-evaluation/) |
| 評価者効果: 同じ手法を使う2人の一致率は平均5〜65%。厳密な手順でも消えない | [未確認: 許可リスト外] | [Hertzum & Jacobsen](https://forskning.ruc.dk/da/publications/the-evaluator-effect-a-chilling-fact-about-usability-evaluation-m/) |
| ISO 9241-110:2020 は2025年に確認済みで現行。適用範囲からAI機能は除外 | [未確認: 許可リスト外] | [ISO 9241-110:2020](https://www.iso.org/standard/75258.html) |

**現行スキルとの差分**
- 深刻度は「タスク完了可否」（影響）だけで決まり、頻度と持続性が入っていない。
- 発見と評定が同じ走査の中で同時に行われる。NN/gは分離を推奨している。
- 単独評価（1回の走査）である。発見率の限界を出力に書いていない。
- 認知的ウォークスルーの4問は方法論上の欠落が見当たらない（この点の原文照合はしていない）。

## 2. 基準の更新（確定／ドラフトの区別）

| 項目 | 状態（2026-11時点） | 検証 | 出典 |
|---|---|---|---|
| WCAG 3.0 | **Working Draft（2026-09-10版）**。W3Cは「変更される未完成の草案」「完成したW3C標準になるのはあと数年先」「WCAG 2を置き換えず、WCAG 3確定後も数年はWCAG 2を廃止しない」「将来に備える最良の方法は今WCAG 2.2を満たすこと」と明記 | [原文確認済] | [W3C WCAG 3 Introduction](https://www.w3.org/WAI/standards-guidelines/wcag/wcag3-intro/) / [WCAG 3.0 WD](https://www.w3.org/TR/wcag-3.0/) |
| WCAG 3 のコントラスト | 草案の編集者注に「WCAG 3で使うコントラストのアルゴリズムは未定」とある。要件本文も「@@[contrast measure to be determined]」。**草案内に「APCA」の語は1件も無い** | [訂正] 初版は個人ブログ経由で「コントラスト節は exploratory」「APCAは2023年に削除対象」と書いた。原文では、文字コントラストの要件自体は **Developing** 段階で、測定法だけが未定。APCAの削除経緯は原文で確認できないので削除した | [WCAG 3.0 WD 2026-09-10](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/) |
| EN 301 549 v4.1.1 | **2026-09-02に公開**。Web・文書・ソフトウェアの基準は WCAG 2.2 AA（新規6基準を追加）。附属書にEAAとの対応付け。**EU官報への引用は未了**で、引用までは適合推定の効力を持たない。引用の予定日は当初の2026-11-30から**2027-01-22**に変更された | [訂正] 初版は官報引用の有無を「未確認」、予定を「2026年10月見込み」としていた。未了と確認し、予定日を差し替え。なお「WCAG 2.2 AAを満たすだけではEN 301 549 v4.1.1を満たさない」（リアルタイム通信などが別にある）とも原文にある | [Deque（2026-09-08）](https://www.deque.com/blog/en-301-549-v4-1-1-is-final-what-changed-what-it-means-and-what-you-should-do/) / [ETSI配布ディレクトリ（04.01.01_60 が 2026-09-02付）](https://www.etsi.org/deliver/etsi_en/301500_301599/301549/) |
| EU デジタル公正法（DFA） | **提案段階**。欧州委員会が**2026-11-11**に、簡素化指令の提案と同時に採択。対象はダークパターン、依存を誘う設計、過剰支出を促す手法、不公正なパーソナライズ、解約の困難、自動更新、無料体験の有料転換、人間の窓口に到達できないこと | [原文確認済]。ただし文書番号 COM(2026) 1100、「UCPDを置き換える規則」という法形式、今後の審議手順は同ページに記載が無く [未確認] | [欧州委員会 DFAページ](https://commission.europa.eu/law/law-topic/consumer-protection-law/digital-fairness-act_en) |
| 米 FTC Click-to-Cancel | 規則は2025-07に第8巡回区控訴裁が無効化。FTCは2026-03に規則制定を再開（ANPRM）。執行はROSCAとFTC法5条で継続（Amazonと25億ドルで和解） | [未確認: ftc.gov が自動クライアントに403を返す。法律事務所の解説は許可リスト外] | [Covington](https://www.cov.com/en/news-and-insights/insights/2026/03/ftc-launches-new-rulemaking-on-the-negative-option-rule) |
| JIS X 8341-3 | 現行は2016年版。WCAG 2.2相当への改正は早くて2026-10、遅くとも2027-03の見通し | [未確認: 総務省の該当PDFが404。WAIC・JISCは許可リスト外] | [総務省資料](https://www.soumu.go.jp/main_content/000945249.pdf) |
| EAA の執行状況 | 1年目は苦情・訴訟・警告が中心 | [未確認: 許可リスト外] | [Level Access](https://www.levelaccess.com/blog/eaa-compliance-in-2026-how-enforcement-has-evolved-and-what-to-expect-next/) |
| EU AI Act 第50条 | 2026-08-02から適用。既存の生成AIの機械可読マーキングのみ2026-12-02まで猶予 | [未確認: 許可リスト外]。現行スキルの記述とは一致 | [Paul Weiss](https://www.paulweiss.com/insights/client-memos/eu-finalises-transparency-rules-for-ai-generated-content) |
| Apple Liquid Glass | 標準のバー・シート・ポップオーバー・コントロールは自動で新素材になる。独自コントロールへの適用は控えめに。コントロールに色を付けるなら、ライト／ダークと、それぞれの**コントラストを上げた版**を定義する。重ね置きを避ける | [原文確認済]。iOS 26.1の「Tinted」設定は [未確認: 許可リスト外] | [Apple: Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass) |
| Material 3 Expressive | 2025-05発表。寸法規定の変更有無は不明 | [未確認: 許可リスト外] | [Google Design](https://design.google/library/expressive-material-design-google-research) |

## 3. LLM／マルチモーダルAIによるUIレビュー

**精度と典型的な誤り**

| 研究 | 結果 | 検証 | 出典 |
|---|---|---|---|
| GPT-4o 対 専門家3人（Guerino ら 2025） | 専門家が見つけた66件のうち GPT-4o も見つけたのは14件（**21.2%**）。GPT-4o だけが見つけた新規の問題は27件。GPT-4o の指摘の**24.3%が偽陽性**。原因は、ハルシネーションと「静止画からは検出できない操作上の問題を推測で挙げること」。得意は「美的で最小限」「現実との一致」、苦手は「柔軟性」「制御」「効率」。深刻度の付け方に両者の有意差は無い | [原文確認済]。24.3%は初版に無かった数値で、今回追加 | [arXiv 2506.16345](https://arxiv.org/abs/2506.16345) |
| GPT-4o・Gemini 2.5 Flash 対 専門家4人（Campos ら 2025） | 適合率／再現率は、人 0.917／0.567、Gemini 0.829／0.433、ChatGPT 0.820／0.409。偽陽性率は Gemini 17.11%、ChatGPT 18%、人は108件中9件。重複は ChatGPT 30件、Gemini 8件。AIは「検証できない仮定（フィードバック不足、入力検証、挙動）を置き、美観の不一致を強調する」。**人＋Gemini の併用が最良**（再現率0.843、F1 0.861） | [原文確認済]。適合率と偽陽性率は今回追加 | [arXiv 2510.17056](https://arxiv.org/abs/2510.17056) |
| 合成ヒューリスティック評価（Zhong ら 2025） | GPT-4が2アプリで問題の73%・77%を発見（専門家5人の合算は57%・63%）。レイアウトの問題に強い。弱点は**一部のUI部品とデザイン慣習の認識、複数画面にまたがる違反**。「画面は出現順なので画面間の関係を考慮せよ」と指示を足すと、画面間の問題をある程度報告した | [原文確認済] | [arXiv 2507.02306](https://arxiv.org/abs/2507.02306) |
| ベンダー事例（NN/gによるBaymardの紹介） | Microsoftの研究者2人が2025-03に4つのAIツールを評価し、正確率は50〜70%。Baymardのツールは、確率的なAIを**パターン識別だけ**に使い、評価判断は事前定義のロジックで決定的に行う。正確率95%以上を出せる指針だけを収録 | [原文確認済]（NN/g記事）。Baymard側の「50〜75%」「GPT-4は20%」は [未確認: 許可リスト外] | [NN/g: Baymard AI tool accuracy](https://www.nngroup.com/articles/baymard-ai-tool-accuracy/) |
| GPT-4によるモックアップ評価（Duan ら CHI 2024）、UICrit（UIST 2024）、プロンプト戦略比較（SBC 2026） | 原則ごとに精度差がある／少数例で55%改善／few-shotがF1最良 | [未確認: 今回は照合していない（Duanら2本は取得済みだが該当数値の照合を省いた）。SBCは許可リスト外] | [arXiv 2403.13139](https://arxiv.org/abs/2403.13139) / [arXiv 2407.08850](https://arxiv.org/abs/2407.08850) |

研究間で発見率は割れている（21.2%と73〜77%）。対象アプリ・プロンプト・正解の作り方が違うので単純比較はできない。偽陽性が2割前後という点は2本で一致している。

**抑制手法**

| 手法 | 根拠 | 検証 | 出典 |
|---|---|---|---|
| 自動ツールとLLMの役割分担 | 250件の評価で、axe-core は**適合率0.90・再現率0.36**。基準別のエージェントは適合率0.56・再現率0.86。手がかり無しの視覚言語モデルは適合率0.61・再現率0.67。正解ラベルは専門家の監査報告から作られ、「報告に無い＝陰性」と推定しているので、著者は真の精度についての結論に限界があると明記 | [原文確認済] | [arXiv 2609.09379](https://arxiv.org/abs/2609.09379) |
| 自動ツールの守備範囲 | axe系ツールは、件数ベースで問題の57%を完全に検出（2,000件超の監査、13,000ページ超、約30万件の問題。Dequeの自己申告、2021-03）。「達成基準の2〜3割」という通説とは測り方が違う | [原文確認済]。「50基準中16基準」は該当ページに無く [未確認] | [Deque](https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues/) |
| 自己検証パス | 検証段は誤報を減らすが本物の問題も落としうる。LLMには正しいものを誤りと判定する傾向がある | [未確認: 今回は照合していない] | [arXiv 2505.17928](https://arxiv.org/pdf/2505.17928) |
| 自動テストで検出できない項目（フォーカス管理など）、Playwright MCPのアクセシビリティツリー入力 | — | [未確認: 許可リスト外] | [Playwright docs](https://playwright.dev/docs/accessibility-testing) |

スクリーンショットからの色・コントラスト誤判定を直接測った研究は見つけられなかった（未確認のまま）。

## 4. レビュー出力のベストプラクティス

| 知見 | 検証 | 出典 |
|---|---|---|
| 17チーム比較で、改善提案のうち「有用かつ使える」ものは84件中14件（17%）。指針は、具体例つきで曖昧さを避ける、問題全体を解く、制約を踏まえる、最小の変更を勧める | [未確認: uxpajournal.org・uxpa.org は許可リスト外] | [Molich, Jeffries, Dumas](https://uxpajournal.org/wp-content/uploads/sites/7/pdf/useful-usable.pdf) |
| 問題記述の10指針（Capra 2006） | [未確認: 許可リスト外] | [Capra 学位論文](https://vtechworks.lib.vt.edu/items/75609b21-8f95-43a1-aa02-44aa653c8644) |
| 所見は問題を起こした具体的な箇所を特定して書く（NN/g Actionable Usability Findings） | [未確認: 今回は取得していない] | [NN/g](https://www.nngroup.com/articles/actionable-usability-findings/) |

指摘数の適正量を定量的に示した一次情報は見つけられなかった。ただし3章の原文確認で、AIに「軽微なものも省くな」と指示した研究（Campos ら）で重複と偽陽性が増えた事実は確認できた。現行の「高を数件に絞る」方針を支持する間接的な根拠になる。

## 5. 現行スキルに欠けていそうな観点

- **実測ツール連携**: `auto` フィールドは未使用のメタデータで、機械チェックは grep 相当の13行の表に留まる。
- **ユーザーテストとの使い分け**: 出力がユーザー調査の代替ではないこと（NN/g原文確認済）の明示が無い。
- **複数画面にまたがる違反**: LLMの弱点として原文確認済み。現行はウォークスルーで補うが、入力の画面順と「画面間の関係を見よ」という明示指示が効くという知見は未反映。
- **AI機能UI**: Microsoft の18指針のうち「時間経過」に当たる項目が無い（[未確認: 許可リスト外]）。

---

## 現行スキルとのギャップ表

| 観点 | 現状 | 推奨 | 根拠（検証状況） |
|---|---|---|---|
| 機械判定項目の根拠 | grep相当の表13行。`auto` は確信度に使わない | `runtime` があれば axe-core / Lighthouse を実行し、結果を「確定」の根拠にする。無ければ現行の表を使う | arXiv 2609.09379、Deque 57%（確認済） |
| 偽陽性の抑制 | 確信度3段階、意図の断定を避ける | 出力前に全指摘を入力へ再照合する。静止画・コードから観察できない挙動を推測で指摘しない（要確認へ回す）。「高」は検証で削除せず要確認へ | arXiv 2506.16345 の偽陽性24.3%と原因、2510.17056（確認済） |
| 過剰指摘・重複 | 件数の目安、重複ペアの `note` | 統合時に同一原因の指摘を1件にまとめる。美観のみの指摘は「低」上限 | arXiv 2510.17056（確認済） |
| 深刻度の評定 | 影響のみ＋フロー種別で±1 | 頻度と持続性を補正条件に加える。発見を終えてから評定する | NN/g Severity Ratings（確認済） |
| 単独評価の限界 | 記載なし | サマリに「単独評価のため見落としがありうる。ユーザーテストの代替ではない」を1行。独立した複数回の走査の統合は任意（コスト増） | NN/g 35%、代替不可（確認済） |
| 複数画面の評価 | ウォークスルーで対応 | 画面を出現順に与え、画面間の一貫性を見る指示を明示する | arXiv 2507.02306（確認済） |
| コントラスト | 「実際に計算し色とサイズを併記」 | 色の出所を併記し、スクリーンショット由来は「推定」止まり。WCAG 3の算出法は未定なので WCAG 2.x の比だけで判定する | WCAG 3.0 WD（確認済）。スクショ誤差の研究は未確認 |
| EUアクセシビリティ規格 | 「EN 301 549 は WCAG 2.1 AA 相当」 | 「v4.1.1（WCAG 2.2 AA、2026-09-02公開）。官報引用（2027-01-22予定）までは適合推定の効力なし」と書き分ける | Deque、ETSI（確認済） |
| ダークパターン規制 | UCPD・DSA・GDPR・日本法 | DFAを「提案中（2026-11-11採択）・未施行」として追記。米国分は原文確認後に追記 | 欧州委員会（確認済）／FTC（未確認） |
| WCAG 3 | 言及なし | 「Working Draftであり違反根拠にしない。備えはWCAG 2.2を満たすこと」を注記 | W3C（確認済） |
| プラットフォーム | HIG 44pt、M3 48dp | Liquid Glass 上の独自コントロールは多用しない、色を付けるならコントラストを上げた版も用意、を追加 | Apple（確認済） |
| 改善案の品質 | 「具体的な変更内容」 | 最小変更・具体例・問題全体を解く、を基準に明記 | Molich ら（未確認） |
| 指摘の記述項目 | 問題・根拠・影響・改善案 | フロー上の問題に再現手順を加える | Capra（未確認） |
| 日本のJIS | 適合は法的義務でない旨のみ | 改正見込みを追記（公示状況の確認後） | 未確認 |
| AI機能UI | AI-01〜06 | 「時間経過」の観点を追加検討 | 未確認 |

## 未確認のまま残った事項

- FTC Click-to-Cancel の経緯全体（無効化、ANPRM、Amazon和解）。
- JIS X 8341-3 の改正時期と公示状況。
- Molich らの17チーム比較（17%、指針）、Capra の10指針、NN/g Actionable Usability Findings。
- Hertzum & Jacobsen の評価者効果（5〜65%）。
- DFA の文書番号・法形式・審議手順。
- EAA の執行状況、EU AI Act 第50条の日付、iOS 26.1 の Tinted 設定、Material 3 Expressive。
- Baymard 自身の数値（50〜75%、GPT-4は20%）、Deque の「50基準中16基準」。
- Duan ら2本・SBC 2026・自己検証の副作用（arXiv 2505.17928、2508.12358）の数値。
- Playwright docs / MCP、Microsoft HAX、ISO 9241-110。
- スクリーンショットからのコントラスト誤判定を測った研究、指摘件数の適正量を定量化した研究（存在自体が未確認）。
