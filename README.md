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
| check-todos | skill | 自動（descriptionに合致する文脈で発火） | 各プロジェクトの docs/tasks/todo.md に残っている未完了タスク（`- [ ]` 項目）を横断的に 洗い出し、プロジェクトごとに要約してターミナルに表示する。日次で「今どのプロジェクトに 何が残っているか」を俯瞰したいときに使う。読み取り専用で、ファイルの作成・更新は行わない。 |
| doc-coauthoring | skill | 自動（descriptionに合致する文脈で発火） | Guide users through a structured workflow for co-authoring documentation. Use when user wants to write documentation, proposals, technical specs, decision docs, or similar structured content. This workflow helps users efficiently transfer context, refine content through iteration, and verify the doc works for readers. Trigger when user mentions writing docs, creating proposals, drafting specs, or similar documentation tasks. |
| frontend-design | skill | 自動（descriptionに合致する文脈で発火） | Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one. Helps with aesthetic direction, typography, and making choices that don't read as templated defaults. |
| model-routing | skill | 自動（descriptionに合致する文脈で発火） | タスクの性質に応じてOpus/Sonnet/Haikuやサブエージェントのmodelパラメータを使い分け、トークン消費を抑えつつ出力品質を落とさないための判断基準。「どのモデルを使うべきか」「コストを抑えたい」「サブエージェントのモデルを選ぶ」「モデルを切り替えるべきか」と考えたときに使う。 |
| semver | skill | 自動（descriptionに合致する文脈で発火） | セマンティックバージョニング（SemVer 2.0.0）のルールに基づき、変更内容から メジャー/マイナー/パッチのどれをインクリメントすべきかを判断する。パッケージや 仕様書（docs/specs/ 等）のバージョン番号をどう上げるか迷ったとき、Conventional Commits のtype（feat/fix/docs 等）からバージョン増分を導きたいときに使う。 |
| skill-creator | skill | 自動（descriptionに合致する文脈で発火） | Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize an existing skill, run evals to test a skill, benchmark skill performance with variance analysis, or optimize a skill's description for better triggering accuracy. |
| todo-import | skill | 自動（descriptionに合致する文脈で発火） | 各プロジェクトの docs/tasks/todo.md に残っている未完了タスクを、対話や分類なしで機械的に projects/today-todo/YYYY-MM-DD.md へ列挙する。 一日の始まりに「今日やることは？」「今日のタスクは？」と聞かれたときに使う。 横断の残タスク一覧をターミナル表示するだけの check-todos とは異なり、ファイルを生成する。 |
| track-issues | skill | 自動（descriptionに合致する文脈で発火） | 作業中に見つかったバグ・想定外の挙動を issue.md に発生時点で記録し、原因が判明した時点・ 解決した時点で同じ Issue に追記していく。デバッグや障害調査を伴う作業を始めるとき、 エラーや「なぜこうなるのか分からない挙動」が出てきたとき、問題の経緯を後から追える形で 残したいときに使う。作業後にまとめて書き起こすのではなく、その場で書き足すのが目的。 |
| webapp-testing | skill | 自動（descriptionに合致する文脈で発火） | Toolkit for interacting with and testing local web applications using Playwright. Supports verifying frontend functionality, debugging UI behavior, capturing browser screenshots, and viewing browser logs. |
| dotfiles-sync | command | `/dotfiles-sync` | 現在の環境の ~/.claude 配下（commands / skills / CLAUDE.md）への直接編集を dotfiles リポジトリに取り込み、リモートの最新を pull し、symlink が未設置なら設置する。 スキルやスラッシュコマンドを追加・修正した後、別マシンと設定を揃えたいとき、 symlink が切れて設定が読まれなくなったときに使う。commit と push は必ず確認を取る。 |
| grill-me | command | `/grill-me` | 計画や設計について、共通理解に達するまで容赦なくインタビューする。決定木の各分岐を一つひとつ解決していく。計画をストレステストしたいとき、設計についてグリルされたいとき、または「grill me」と言ったときに使用する。 |
| init-change | command | `/init-change` | 既存の SDD サブプロジェクト内に、変更1件ぶんのディレクトリ docs/changes/<version>-<type>-<短い説明>-<日付>/ を作り、proposal.md・design.md・tasks.md・specs/ の雛形を用意する。新しい改修・機能追加に着手する直前、実装より先に提案と設計を 書き起こす段階で使う。バージョンは docs/specs/VERSION から算出し、日付は自動付与する。 |
| init-ops-work | command | `/init-ops-work` | 仕様駆動（SDD）ではなく運用（Ops）作業が中心のサブプロジェクトで、依頼1件ぶんの 作業ディレクトリ order-yyyymmdd/（order.md, plan.md, src/, share-doc/）を _templates/ops/ からコピーして作成する。運用・調査・データ修正の依頼を受けて着手するとき、 既存の ops サブプロジェクトに次の依頼が来たときに使う。 仕様書を伴う開発案件はこちらではなく /init-spec を使う。 |
| init-spec | command | `/init-spec` | サブプロジェクトに SDD の初期ディレクトリ構成（docs/specs, docs/tasks, docs/changes, docs/refs, src, tests）を _templates/dev/ からコピーして作成する。 新しいサブプロジェクトを立ち上げるとき、既存ディレクトリを SDD 構成に載せ替えるとき、 あるいは変更作業を始めようとして docs/specs/ がまだ無いと分かったときに使う。 Ops（運用）中心のサブプロジェクトはこちらではなく /init-ops-work を使う。 |
| patch-report | command | `/patch-report` | 実装が一段落した時点で、plan.md と実際に変更したファイルを読んで report/patch-report-YYYYMMDD.md を書き出す。改修や依頼対応を終えて成果を関係者に 報告したいとき、何をなぜ変えたかを引き継ぎ用に残したいときに使う。 issue.md に未解決 Issue があれば「課題・リスク」として自動で取り込む。 |
| self-improve | command | `/self-improve` | agent 向けテキスト指示（skill / slash command / task プロンプト / CLAUDE.md 節 / コード生成プロンプト）を、バイアスを排した実行者に動かしてもらい、両面（実行者の自己申告 + 指示側メトリクス）で評価して反復改善する手法。改善が頭打ちになるまで回す。プロンプトや skill を新規作成・大幅改訂した直後、またはエージェントの挙動が期待通りにならない原因を指示側の曖昧さに求めたいときに使う。 |
| teach | command | `/teach` | このセッションで扱った内容を、チェックリストとクイズを使って段階的にユーザーへ理解させる 教師モードに入る。実装や調査が一段落した後、何をなぜそうしたのかを腹落ちさせたいとき、 引き継ぎや学習のために解説してほしいとき、「教えて」「理解したい」と言われたときに使う。 |
| to-html | command | `/to-html` | Markdown を、現セッションの Claude が直接読んで Hero・メトリクスカード・図表・コールアウト・TOC を 備えたインフォグラフィック志向の HTML（同ディレクトリの `<basename>.html`）に変換する。 plan.md や実装レポートをブラウザで人に見せたいとき、md のままでは伝わりにくい数値や構造を 可視化したいとき、あるいは既存の HTML を md の変更に追従させたいときに使う。 |
| todo-propose | command | `/todo-propose` | 対象サブプロジェクトの既存資材（コード・spec・過去のバッチ/ブランチ）を調査したうえで、 dev系（docs/specs/あり）なら docs/changes/<version>-<type>-<短い説明>-<日付>/ の proposal.md・design.md・tasks.md を、ops系（docs/specs/なし）なら order-yyyymmdd/ の order.md・plan.md を埋める。todo.md への同期も行う。提案書・作業計画書の作成で必ず停止し、 実装には進まない（承認後の実装は別途の通常のやり取りで行う）。directry-rules.md 1章が 「想定仕様・未実装」としていた /propose に相当する（2026-08-20に /todo-propose に改称）。 新しい改修・依頼に着手する前に、 調査結果をもとに提案書・作業計画書を書き起こしたいときに使う。 |

<!-- SKILL_INDEX:END -->
