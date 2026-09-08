# dotfiles

設定ファイルたち（wezterm, yazi, Claude Code の commands/skills/CLAUDE.md）。

## Claude Code 設定の共有

`.claude/commands`, `.claude/skills`, `.claude/CLAUDE.md` の3つを
このリポジトリで管理し、実際に使う `~/.claude` からシンボリックリンクします
（`.gitignore` でもこの3つだけが共有対象として許可されています）。

```
このリポジトリ (.claude/{commands,skills,CLAUDE.md})
        ▲
        │ symlink
        │
~/.claude/{commands,skills,CLAUDE.md}  ← Claude Code はここを読みにいく
```

編集はどちらから触っても実体は同じなので、`git add` / `commit` / `push` すれば
変更がそのまま履歴として残ります。`~/.claude` の他のファイル
（`settings.json`, `sessions/` など）はリンク対象外で、環境ごとのローカル設定のままです。

### 共有する範囲 — 業務ドメインを混入させない

このリポジトリは push すると内容が履歴に残ります。履歴からの除去は force-push を伴い高コストなので、
**業務ドメインを含むものは最初から置かない**という方針をとります。

skill / command は出自と内容によって4つに分類し、このリポジトリで管理するのは
**1. 自作の汎用 skill / command** のみです。

| 分類 | 例 | 置き場所 |
| --- | --- | --- |
| 1. 自作の汎用 skill / command | 自分で書いたワークフロー。業務語を含まない | このリポジトリ（`.claude/skills/`, `.claude/commands/`） |
| 2. 他人の skill | skills CLI等で入れるもの | skills CLI側の管理に任せる（ここに置かない） |
| 3. 業務横断の業務ルール | 複数案件に共通する運用ルール | `/home/igpf-2500009/.claude/local/`（symlink 対象外・git 管理外） |
| 4. 案件固有のルール | 特定プロジェクトの規約・ワークフロー | そのプロジェクトのrepo側（`.claude/`） |

```
/home/igpf-2500009/.claude/
├── CLAUDE.md   ─┐
├── commands/    ├─ symlink → このリポジトリ（共有される）
├── skills/     ─┘
└── local/       ← symlink なし・git 管理外（業務ドメインはここ）
```

#### 業務ドメインの判定基準

次のいずれかを含むなら業務ドメインです。分類1（このリポジトリ）に書いてはいけません。

1. **固有名** — 顧客名・案件名・プロダクト名・リポジトリ名
2. **業務データ構造** — テーブル名・カラム名・APIのフィールド名・ID体系
3. **業務ルール / 運用文言** — 承認フロー、レコードに残す定型文言、締め日、金額やポイントの扱い
4. **環境・接続先** — ホスト名、サーバー、エンドポイント、環境名、認証情報
5. **組織固有の固有名詞** — 部署名、担当者名、社内システム名、Slackチャンネル、チケット番号

**判定テスト: その固有名詞を `<placeholder>` に置き換えたとき、記述の価値が失われるか？**

- 失われない → 分類1に置く。ただし固有名詞は placeholder のまま書く
- 失われる（固有名詞そのものが情報の本体） → 分類3か4に下げる

#### 業務層の参照のしかた

汎用側（分類1）から業務側（分類3・4）へは、**任意参照**だけを書きます。
「あれば読む・なければ黙って続行」にすることで、業務層が無い環境でも壊れません。

skill / command 側にはこう書きます:

```markdown
## 業務ドメイン参照

このコマンド自体には案件固有のルールを書かない。実行時に以下を確認し、
**存在すれば読み込んで本フローに上書き適用する。存在しなければ黙って続行する。**

1. `/home/igpf-2500009/.claude/local/<領域>/RULES.md` — 領域横断の業務ルール
2. 対象リポジトリの `.claude/` 配下 — その案件固有のルール
```

実例は `.claude/commands/init-ops-work.md` の「業務ドメイン参照」節です。

## セットアップ方法

### WSL / Linux / macOS（`install.sh`）

前提: `git` と `bash` が使えること。追加の権限設定は不要です。

```bash
cd ~/dotfiles   # クローン先はどこでもよい
./install.sh
```

- `~/.claude/commands` / `~/.claude/skills` / `~/.claude/CLAUDE.md` が無ければ新規にシンボリックリンクを作成
- 既存のファイル/ディレクトリがあれば `<元のパス>.bak.<実行時刻>` に退避してからリンクを作成（データは消えず退避されるだけ）
- 既にこのリポジトリへリンク済みなら何もしない（再実行しても安全）

### Windows ネイティブ（`install.ps1`）

Windows 上でシンボリックリンクを作るには、以下のいずれかが必要です。

- 「開発者モード」を有効化（設定 > プライバシーとセキュリティ > 開発者向け）
- または管理者権限で PowerShell を実行

```powershell
cd C:\Users\<user>\dotfiles
.\install.ps1
```

動作（バックアップ・再実行時のスキップなど）は `install.sh` と同じです。

普段の開発が WSL 中心の場合、Windows ネイティブ側は必須ではありません。
Windows ネイティブの Claude Code も使う場合にのみ実行してください。

## 新しい skill を追加する

```bash
cd /mnt/c/Users/IGPF-2500009/dotfiles   # 他マシンではそのクローン先
mkdir -p .claude/skills/<skill-name>

# SKILL.md を新規作成する（frontmatter は name / description の2つ）
#   → 書く前に「共有する範囲 — 業務ドメインを混入させない」の判定基準を確認する
cat > .claude/skills/<skill-name>/SKILL.md <<'EOF'
---
name: <skill-name>
description: <どんな時に使うか。Claude はこの説明文を見て起動を判断する>
---

# <skill-name>

（本文）
EOF

# コミット前チェック: 業務ドメインが混ざっていないか
# （パターン自体が業務語なので、リストは git 管理外の /home/igpf-2500009/.claude/local/ngwords.txt に置く）
grep -rniEf /home/igpf-2500009/.claude/local/ngwords.txt .claude/ \
  && echo "!! 業務語が混入している。/home/igpf-2500009/.claude/local/ へ退避して任意参照に置き換えること" \
  || echo "OK"

git add .claude/skills/<skill-name>
git commit -m "Add <skill-name> skill"
git push
```

`~/.claude/skills` はこのリポジトリへのシンボリックリンクなので、
ファイルを追加・編集した時点で Claude Code 側にもすぐ反映されます。

## 別のマシン/環境で使う場合

同じ手順（クローン → `install.sh` または `install.ps1` 実行）を行うだけで、
同じ commands/skills/CLAUDE.md をそこでも使えるようになります。

## 元に戻したい場合

```bash
rm ~/.claude/skills                                    # シンボリックリンクを削除
mv ~/.claude/skills.bak.<実行時刻> ~/.claude/skills      # 退避していた場合は復元
```

Windows の場合も同様に、対象を削除してから `.bak.<実行時刻>` を元の名前に戻してください。

## 利用可能な skill / command 一覧

<!-- SKILL_INDEX:START (gen_skill_index.py で自動生成。手で編集しない) -->

| 名前 | 種別 | 起動方法 | 説明 |
| --- | --- | --- | --- |
| blog-article | skill | 自動（descriptionに合致する文脈で発火） | tech-blog/neta/ に溜まったネタから1件（または関連する複数件）を選び、Zenn向け記事として tech-blog/article/ に下書きする。「記事化して」「ブログ記事にして」「ネタを記事にまとめて」 と言われたときに使う。ネタの一次記録自体は別スキル（blog-neta）が担当し、本スキルは ネタを読者向けの記事構成に組み替え、社外に出せない固有名詞を一般化するところまでを担う。 |
| blog-neta | skill | 自動（descriptionに合致する文脈で発火） | 作業中に生まれた「思い込みを指摘されて訂正した」「多義語やレイヤーの取り違えで行き違った」 「仕様の前提を勘違いしていた」といった気づきを、tech-blog/neta/ にブログのネタとして記録する。 自動発動条件: ユーザーの指摘で自分の理解・報告内容が覆った、用語やアーキテクチャの解釈が 途中でズレていたと判明した、といった出来事が起きたとき。 明示発動条件: 「これネタになりそう」「ネタ化して」「今日の作業でネタになりそうな話ある？」 「セッション振り返ってネタ拾って」と言われたとき。 記事に仕上げる作業は別スキル（blog-article）が担当し、本スキルはネタの一次記録のみ行う。 |
| check-todos | skill | 自動（descriptionに合致する文脈で発火） | 各プロジェクトの docs/tasks/todo.md に残っている未完了タスク（`- [ ]` 項目）を横断的に 洗い出し、プロジェクトごとに要約してターミナルに表示する。日次で「今どのプロジェクトに 何が残っているか」を俯瞰したいときに使う。読み取り専用で、ファイルの作成・更新は行わない。 |
| code-comments | skill | 自動（descriptionに合致する文脈で発火） | コード・テストコード・コミットログ・コードコメントのどこに何を書くかを決めるときに使う。コードには How、テストコードには What、コミットログには Why、コードコメントには Why not を書き分ける。実装時とコミット・PR 作成時に使う。 |
| code-naming | skill | 自動（descriptionに合致する文脈で発火） | コードの識別子（変数・関数・メソッド・クラス・型・ファイル）に名前を付けるときに使う。get の濫用をやめ、何をして値を得るのかが名前から読み取れる状態にする。実装時と、実装計画でメソッド名・クラス名を決めるときの両方で使う。 |
| code-review-checklist | skill | 自動（descriptionに合致する文脈で発火） | Googleエンジニアリング・プラクティス（"What to look for in a code review"）に基づく、 観点網羅型のコードレビューを行う。設計・機能性・複雑性（オーバーエンジニアリング）・ テスト・命名・コメント（WHY vs WHAT）・スタイル・ドキュメンテーション・コンテキスト整合性の 各観点を一行ずつ確認し、「システムのコードの健康状態を改善するか」を最上位基準に判定する。 差分/PR/ブランチ/パスに対して「コードレビューして」「レビュー観点でチェックして」 「Googleの基準でレビューして」と言われたとき、あるいはコードレビューの相談を受けたときに使う。 ツール自体でPRコメント投稿は行わないコードレビュー専用skill（marketplace公式pluginの `code-review`とは別物）。指摘はReportFindingsで報告する。 |
| doc-coauthoring | skill | 自動（descriptionに合致する文脈で発火） | Guide users through a structured workflow for co-authoring documentation. Use when user wants to write documentation, proposals, technical specs, decision docs, or similar structured content. This workflow helps users efficiently transfer context, refine content through iteration, and verify the doc works for readers. Trigger when user mentions writing docs, creating proposals, drafting specs, or similar documentation tasks. |
| docx | skill | 自動（descriptionに合致する文脈で発火） | Use this skill whenever the user wants to create, read, edit, or manipulate Word documents (.docx files) or Word templates (.dotx files). Triggers include: any mention of 'Word doc', 'word document', '.docx', '.dotx', or requests to produce professional documents with formatting like tables of contents, headings, page numbers, or letterheads. Also use when extracting or reorganizing content from .docx or .dotx files, inserting or replacing images in documents, performing find-and-replace in Word files, working with tracked changes or comments, or converting content into a polished Word document. If the user asks for a 'report', 'memo', 'letter', 'template', or similar deliverable as a Word or .docx file, use this skill. Do NOT use for PDFs, spreadsheets, Google Docs, or general coding tasks unrelated to document generation. |
| explain-visually | skill | 自動（descriptionに合致する文脈で発火） | 長大な設計文書・Pull Request・Issueを読み解き、図と短い文を組み合わせた解説HTMLを生成してブラウザで開く。生成したページ内の識別子を指定すると、その項目だけを掘り下げたページも作る。 |
| github-conventions | skill | 自動（descriptionに合致する文脈で発火） | worktree/ブランチの命名・分割判断、コミット粒度、push前の確認、PRのタイトル/本文の 書き方をまとめたGitHub運用ルール。EnterWorktreeでworktreeを作る前、複数の変更を ブランチに分けるかまとめるか迷ったとき、git commitやgit push・PR作成をする前に必ず 参照する。セッション内でだけ通じる省略名や作業コードネーム（「群B」「M1」「フェーズ2」等） をそのままworktree名やPRタイトルに使うと、そのセッションを見ていない人がブランチ一覧や PR一覧を眺めても何の変更か分からなくなる。また`credential.helper`未設定によるpush時の ハングなど、push前に踏みがちな落とし穴も扱う。 |
| github-pr-review-draft | skill | 自動（descriptionに合致する文脈で発火） | 他の開発者のGitHub PRを下読みしてレビューコメント案を作り、人間が承認した内容だけを保留(PENDING)レビュー経由で投稿する。自作PRの修正ループには codex-pr-review-loop / claude-pr-review-loop を使う。 |
| insights-ja | skill | 自動（descriptionに合致する文脈で発火） | `/insights` が生成した英語の利用状況レポート（HTML）を、構成を保ったまま日本語の Markdown に翻訳して所定のディレクトリへ保存する。`/insights` を実行した直後に 「日本語で読みたい」「日本語化して」と言われたとき、または過去に生成済みの レポートHTMLを後から日本語で読み直したいときに使う。翻訳と保存のみを行い、 レポートの再生成（セッション再分析）はしない。 |
| mcp-builder | skill | 自動（descriptionに合致する文脈で発火） | Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. Use when building MCP servers to integrate external APIs or services, whether in Python (FastMCP) or Node/TypeScript (MCP SDK). |
| memory-inventory | skill | 自動（descriptionに合致する文脈で発火） | auto memory（~/.claude/projects/<project>/memory/）を棚卸しする。実測と鮮度検証で整理案を作り、AskUserQuestion でカテゴリ単位に合意を取りながら反映する。削除は archive 退避で可逆に保つ。「メモリ棚卸し」「memory-inventory」「メモリを整理して」で発動。 |
| model-routing | skill | 自動（descriptionに合致する文脈で発火） | タスクの性質に応じてOpus/Sonnet/Haikuやサブエージェントのmodelパラメータを使い分け、トークン消費を抑えつつ出力品質を落とさないための判断基準。「どのモデルを使うべきか」「コストを抑えたい」「サブエージェントのモデルを選ぶ」「モデルを切り替えるべきか」と考えたときに使う。 |
| pdf | skill | 自動（descriptionに合致する文脈で発火） | Use this skill whenever the user wants to do anything with PDF files. This includes reading or extracting text/tables from PDFs, combining or merging multiple PDFs into one, splitting PDFs apart, rotating pages, adding watermarks, creating new PDFs, filling PDF forms, encrypting/decrypting PDFs, extracting images, and OCR on scanned PDFs to make them searchable. If the user mentions a .pdf file or asks to produce one, use this skill. |
| semver | skill | 自動（descriptionに合致する文脈で発火） | セマンティックバージョニング（SemVer 2.0.0）のルールに基づき、変更内容から メジャー/マイナー/パッチのどれをインクリメントすべきかを判断する。パッケージや 仕様書（docs/specs/ 等）のバージョン番号をどう上げるか迷ったとき、Conventional Commits のtype（feat/fix/docs 等）からバージョン増分を導きたいときに使う。 |
| skill-creator | skill | 自動（descriptionに合致する文脈で発火） | Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize an existing skill, run evals to test a skill, benchmark skill performance with variance analysis, or optimize a skill's description for better triggering accuracy. |
| theme-factory | skill | 自動（descriptionに合致する文脈で発火） | Toolkit for styling artifacts with a theme. These artifacts can be slides, docs, reportings, HTML landing pages, etc. There are 10 pre-set themes with colors/fonts that you can apply to any artifact that has been creating, or can generate a new theme on-the-fly. |
| to-html | skill | 自動（descriptionに合致する文脈で発火） | Markdown を、固定テンプレート（assets/template.html）に本文を流し込む形で、Hero・メトリクスカード・ 図表・コールアウト・TOC を備えたインフォグラフィック志向の HTML（同ディレクトリの `<basename>.html`）に 変換する。plan.md や実装レポートをブラウザで人に見せたいとき、md のままでは伝わりにくい数値や構造を 可視化したいとき、あるいは既存の HTML を md の変更に追従させたいときに使う。 |
| todo-import | skill | 自動（descriptionに合致する文脈で発火） | 各プロジェクトの docs/tasks/todo.md に残っている未完了タスクを、対話や分類なしで機械的に projects/today-todo/todo-YYYY-MM-DD.md へ列挙する。 一日の始まりに「今日やることは？」「今日のタスクは？」と聞かれたときに使う。 横断の残タスク一覧をターミナル表示するだけの check-todos とは異なり、ファイルを生成する。 |
| track-issues | skill | 自動（descriptionに合致する文脈で発火） | 作業中に見つかったバグ・想定外の挙動を issue.md に発生時点で記録し、原因が判明した時点・ 解決した時点で同じ Issue に追記していく。デバッグや障害調査を伴う作業を始めるとき、 エラーや「なぜこうなるのか分からない挙動」が出てきたとき、問題の経緯を後から追える形で 残したいときに使う。作業後にまとめて書き起こすのではなく、その場で書き足すのが目的。 |
| uiux-review | skill | 自動（descriptionに合致する文脈で発火） | UI/UXのヒューリスティック評価を行う。スクリーンショット・HTML/CSS・画面遷移図・実機のいずれかを入力に、ニールセンの10原則、WCAG 2.2、フォーム設計、マイクロコピー、ダークパターン、モバイル固有の観点などから指摘を深刻度・確信度付きで出す。「この画面のUI/UXをレビューして」「ユーザビリティの問題点を教えて」「アクセシビリティをチェックして」「ダークパターンがないか確認して」「このフォームの使いやすさは」と言われたときに使う。 |
| web-artifacts-builder | skill | 自動（descriptionに合致する文脈で発火） | Suite of tools for creating elaborate, multi-component claude.ai HTML artifacts using modern frontend web technologies (React, Tailwind CSS, shadcn/ui). Use for complex artifacts requiring state management, routing, or shadcn/ui components - not for simple single-file HTML/JSX artifacts. |
| webapp-testing | skill | 自動（descriptionに合致する文脈で発火） | Toolkit for interacting with and testing local web applications using Playwright. Supports verifying frontend functionality, debugging UI behavior, capturing browser screenshots, and viewing browser logs. |
| xlsx | skill | 自動（descriptionに合致する文脈で発火） | Use this skill any time a spreadsheet file is the primary input or output. This means any task where the user wants to: open, read, edit, or fix an existing .xlsx, .xlsm, .xltx, .csv, or .tsv file (e.g., adding columns, computing formulas, formatting, charting, cleaning messy data); create a new spreadsheet from scratch or from other data sources; or convert between tabular file formats. Trigger especially when the user references a spreadsheet file by name or path — even casually (like \"the xlsx in my downloads\") — and wants something done to it or produced from it. Also trigger for cleaning or restructuring messy tabular data files (malformed rows, misplaced headers, junk data) into proper spreadsheets. The deliverable must be a spreadsheet file. Do NOT trigger when the primary deliverable is a Word document, HTML report, standalone Python script, database pipeline, or Google Sheets API integration, even if tabular data is involved. |
| archive | command | `/archive` | dev系サブプロジェクト（docs/specs/ あり）の docs/changes/<change-name>/ を対象に、実装・ ドキュメント管理（tasks.md・specs/README.md・decisions.md・proposal.md）が完了しているかを検証したうえで docs/changes/archives/ へ移動する。directry-rules.md 1章で「未実装コマンド」とされていた /archive の実装。完了の最終判断は常にユーザーが行い、コマンドは事実確認と移動作業だけを担う。 「このchangeをアーカイブして」「完了したものをまとめてアーカイブして」と言われたときに使う。 ops系サブプロジェクトの order-yyyymmdd/ は対象外（directry-rules.md 5章の既存フローに従う）。 |
| checkpoint | command | `/checkpoint` | 長セッションの中間状態を保存する。API 500/401/レート制限による進捗喪失に備え、ユーザーが「checkpoint」「中間保存」「途中経過を残す」と言ったとき、または長時間の作業の節目で使用する。 |
| dotfiles-sync | command | `/dotfiles-sync` | 現在の環境の ~/.claude 配下（commands / skills / CLAUDE.md）への直接編集を dotfiles リポジトリに取り込み、リモートの最新を pull し、symlink が未設置なら設置する。 スキルやスラッシュコマンドを追加・修正した後、別マシンと設定を揃えたいとき、 symlink が切れて設定が読まれなくなったときに使う。commit と push は必ず確認を取る。 |
| bals | command | `/bals` | 計画や設計について、共通理解に達するまで容赦なくインタビューする。決定木の各分岐を一つひとつ解決していく。計画をストレステストしたいとき、設計についてグリルされたいとき、または「grill me」と言ったときに使用する。 |
| init-change | command | `/init-change` | 既存の SDD サブプロジェクト内に、変更1件ぶんのディレクトリ docs/changes/<version>-<type>-<短い説明>-<日付>/ を作り、proposal.md・design.md・decisions.md・tasks.md・specs/ の雛形を用意する。新しい改修・機能追加に着手する直前、実装より先に提案と設計を 書き起こす段階で使う。バージョンは docs/specs/VERSION から算出し、日付は自動付与する。 |
| init-ops-work | command | `/init-ops-work` | 仕様駆動（SDD）ではなく運用（Ops）作業が中心のサブプロジェクトで、依頼1件ぶんの 作業ディレクトリ order-yyyymmdd/（order.md, plan.md, src/, refs/, tasks/）を _templates/ops/ からコピーして作成する。運用・調査・データ修正の依頼を受けて着手するとき、 既存の ops サブプロジェクトに次の依頼が来たときに使う。 仕様書を伴う開発案件はこちらではなく /init-spec を使う。 |
| init-spec | command | `/init-spec` | サブプロジェクトに SDD の初期ディレクトリ構成（docs/specs, docs/tasks, docs/changes, docs/refs, src, tests）を _templates/dev/ からコピーして作成する。 新しいサブプロジェクトを立ち上げるとき、既存ディレクトリを SDD 構成に載せ替えるとき、 あるいは変更作業を始めようとして docs/specs/ がまだ無いと分かったときに使う。 Ops（運用）中心のサブプロジェクトはこちらではなく /init-ops-work を使う。 |
| merge-md | command | `/merge-md` | 2つ以上のMarkdownファイルをマージする。「Markdownをマージ」「md統合」「2つのmdをひとつに」「明細をマージ」と指示されたとき、または既存Markdownへの追記・統合作業全般で使用する。 |
| patch-report | command | `/patch-report` | 実装が一段落した時点で、plan.md と実際に変更したファイルを読んで report/patch-report-YYYYMMDD.md を書き出す。改修や依頼対応を終えて成果を関係者に 報告したいとき、何をなぜ変えたかを引き継ぎ用に残したいときに使う。 issue.md に未解決 Issue があれば「課題・リスク」として自動で取り込む。 |
| self-improve | command | `/self-improve` | agent 向けテキスト指示（skill / slash command / task プロンプト / CLAUDE.md 節 / コード生成プロンプト）を、バイアスを排した実行者に動かしてもらい、両面（実行者の自己申告 + 指示側メトリクス）で評価して反復改善する手法。改善が頭打ちになるまで回す。プロンプトや skill を新規作成・大幅改訂した直後、またはエージェントの挙動が期待通りにならない原因を指示側の曖昧さに求めたいときに使う。 |
| teach | command | `/teach` | このセッションで扱った内容を、チェックリストとクイズを使って段階的にユーザーへ理解させる 教師モードに入る。実装や調査が一段落した後、何をなぜそうしたのかを腹落ちさせたいとき、 引き継ぎや学習のために解説してほしいとき、「教えて」「理解したい」と言われたときに使う。 |
| todo-execute | command | `/todo-execute` | `/todo-propose`（引数なし・バッチモード）が today-todo/proposal-YYYY-MM-DD.md に書いた 「今日のゴールとマイルストーン（提案）」から、ユーザーが指定したマイルストーンID（例: `M1 M3`）を 実装する。対象サブプロジェクト単位でファイル競合マップを作り today-todo/plan-YYYY-MM-DD.md に 記録した上で、並列にサブエージェントを起動して実装・テスト検証・spec/todo.mdへの反映まで進める。 マイルストーンの承認は $ARGUMENTS での明示指定のみで判定し、引数なし実行は一覧提示で停止する （AIが自己判定して全件実行することはない、2026-08-24確定）。 「提案したマイルストーンを実装してほしい」「M1を進めて」と言われたときに使う。 |
| todo-propose | command | `/todo-propose` | 対象サブプロジェクトの既存資材（コード・spec・過去のバッチ/ブランチ）を調査したうえで、 dev系（docs/specs/あり）なら docs/changes/<version>-<type>-<短い説明>-<日付>/ の proposal.md・design.md・tasks.md を、ops系（docs/specs/なし）なら order-yyyymmdd/ の order.md・plan.md を埋める。todo.md への同期も行う。対象項目がNotion起源（page_idを持つ） 場合は提案書をNotionチケットへ書き戻す（対応するtodo-source-*skillの定義に従う）。 提案書・作業計画書の作成で必ず停止し、 実装には進まない（承認後の実装は別途の通常のやり取りで行う）。directry-rules.md 1章が 「想定仕様・未実装」としていた /propose に相当する（2026-08-20に /todo-propose に改称）。 新しい改修・依頼に着手する前に、 調査結果をもとに提案書・作業計画書を書き起こしたいときに使う。 引数なしで実行すると today-todo/todo-YYYY-MM-DD.md の未完了項目をサブプロジェクト単位で サブエージェントに並列で振り分け、起票可否を判定した上で一括処理する（バッチモード）。 バッチモードでは最後に横断まとめを today-todo/proposal-YYYY-MM-DD.md へ書き出し、 今日着手するゴール・マイルストーンと提案モデル/エフォートも併記する。 両モードとも today-todo/work-log-YYYY-MM-DD.md に実行ログを追記する。 |
| uiux-review | command | `/uiux-review` | uiux-review skillを明示的に起動し、UI/UXのヒューリスティック評価を行う。「/uiux-review」で対象（スクショのパス・HTML/CSSファイル・PRのURL等）を指定して確実に実行したいときに使う。 |

<!-- SKILL_INDEX:END -->
