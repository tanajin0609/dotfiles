# projects/ ドキュメントルール まとめ

作成日: 2026-07-29
対象: `$HOME/projects/` 配下のドキュメント運用ルールの現状（**ディレクトリ構成・バージョニング・
配置場所**が中心）。各ドキュメント種別（`proposal.md`/`plan.md`/`today-todo/plan-YYYY-MM-DD.md`等）が
「誰が・いつ・何のために書くか」は責務分離のため
[`self-work/document-rules/document-rules.md`](../document-rules/document-rules.md) を参照（2026-08-21）。

---

## 1. 全体ルール（`projects/CLAUDE.md` = 全体共通）

トップレベルの `CLAUDE.md` は **SPEC駆動開発（SDD）** を宣言しており、以下の構成を前提としている。

```text
docs/
├── changes/
│   └── <change-name>/
│       ├── proposal.md
│       ├── design.md
│       ├── tasks.md
│       └── specs/          ← delta spec（変更分の仕様）
├── specs/                  ← 正式なspec（唯一の正解、/archiveで反映）
├── tasks/                  ← todo.md / completed.md
└── refs/                   ← 関係者との資料共有用（仕様書ではない）
src/                        # 実装コード
tests/                      # 受け入れ条件を検証するテスト
```

コアルール:

1. 仕様書 (`docs/specs/`) が Single Source of Truth。仕様にない機能を推測実装しない。
2. コードを触る前に仕様書を更新する（Spec-First）。曖昧・矛盾があればユーザーに確認。
3. 実装後は必ずテストコマンドを実行して検証する。
4. 標準ワークフロー: 仕様確認 → タスク整理(`docs/tasks/todo.md`) → テスト作成 → 実装 → 検証・報告。
5. 単一責任の原則、仕様書通りのエラーハンドリング、指示にない設定/一時ファイルの生成禁止。

変更は `docs/changes/<change-name>/` を作業ディレクトリとして進める。`proposal.md`（提案）・`design.md`（設計）・`decisions.md`（意思決定が必要な論点。2026-08-31追加。複数案から選ぶ必要がある事項は`proposal.md`・`design.md`本文ではなくここに集約する）・`tasks.md`（タスク分解）に加え、その変更で大本specに入れた差分を `specs/`（delta spec）に **unified diff** で記録する。大本spec（`docs/specs/`）は作業中に**直接更新**し、delta specは大本の写しを持たずdiffだけを保持するため、内容の二重管理は発生しない（2026-08-17 改定。旧方式＝delta specを先に書いて`/archive`でマージする案からの変更理由は4.2）。`docs/specs/` が唯一の正解である点（コアルール1）は変わらず、`docs/changes/` は「その変更で仕様のどこが動いたか」を後から復元するための履歴として位置づける。

具体的な進行は以下のフローに従う。

1. **`/explore`**（想定仕様・未実装）: 既存コードと既存資料の関連箇所を調査する。過去のPRやWikiなど、コード外で管理されている資料の場所を明示的に指定して調査させる。
2. **`/todo-propose`**（旧称 `/propose`。2026-08-20に実装・改称。7章参照）: 調査結果をもとに `proposal.md`・`design.md`・`tasks.md`（ops系は `order.md`・`plan.md`）を生成する。着手時の変更ディレクトリ作成は実装済みの `/init-change`・`/init-ops-work` に委譲する。
3. **人間レビュー**: 人間が `proposal.md` をレビューし、必要に応じて修正する。実装着手はこのレビュー・承認を経てから進む。
4. **delta spec の記録**: 大本specを直接更新しつつ、その差分を `specs/` にdiffで残す（着手時に予定 → 完了時に確定の2段）。

4の工程は**コマンドではなく**、`projects/CLAUDE.md` の標準ワークフロー（手順2・4・5）と `_templates/dev/docs/changes/<change-name>/` の `specs/README.md`・`tasks.md` 固定チェック項目に載せている（詳細は4.2）。

当初は4を `/apply`（delta spec生成）、5を `/archive`（正式specへの反映）という2つの想定コマンドに割り当てていたが、どちらも未実装のまま運用したため delta spec が一件も書かれない状態が続いた。**未実装コマンドに責務を預けない**のが改定後の設計原則である（4.2）。

## 2. サブプロジェクトごとの実際の運用状況

上記ルールは **projects/ 直下には実装されておらず**、各サブプロジェクトが独自に運用している。

| ディレクトリ | 独自CLAUDE.md | ドキュメント運用の実態 |
|---|---|---|
| `<point-api-project>/` | あり（詳細版） | `docs/specs/` は使わず、**API仕様は `schema/*.yaml`（OpenAPI）が正**。Swagger UIが直接読み込む。スコープ解釈表（設計依頼 vs 実装依頼の区別）や、向け先別（user_app/admin_web/client_app/exif）のAPI ID命名規則を規定。テストは `docker compose run` 経由のRSpec |
| `<ops-project-a>/` | なし | `doc/spec/`、`doc/issue-20260727/logs/` ディレクトリはあるが中身は空。仕様書運用は未着手 |
| `<ops-project-b>/` | なし | 仕様書なし。`logs/` に日次実行ログを蓄積するのみの運用スクリプト群 |
| `<ops-project-c>/` | なし | 仕様書なし。`runbook.txt`・`README.txt` に運用手順、`logs/` に日次ログ蓄積 |
| `self-work/` | なし | プロジェクト単位のCLAUDE.mdは無し。案件ごとに `REQ.md`/`SPEC.md`/`TODO.md`（set-dotfiles）や `proposal.md`（statusline）など軽量な提案・仕様ドキュメントを都度作成 |

## 3. ルール運用における懸念点

- トップレベル `CLAUDE.md` が定義する `docs/specs/` `docs/tasks/` `src/` `tests/` 構成は、**`<point-api-project>/` 以外のどのサブディレクトリにも実在しない**。各サブプロジェクトは個別の運用（OpenAPI、`doc/`配下、`self-work/`内の軽量Markdownなど）で代替している状態。
- `<point-api-project>/CLAUDE.md` は「設計案の相談」と「実装依頼」を明確に区別するスコープ解釈表を持ち、他プロジェクトには無い独自ルール（日本語回答、`startLine:endLine:path` 形式でのコード参照など）を定めている。
- まとめると、全体共通ルール（SDD）は**宣言のみで強制力を持たず**、実質的にはプロジェクトごとにドキュメント運用が分岐している。今後ディレクトリ戦略を決める際は、「全プロジェクト共通の`docs/specs`構成を徹底させるか」「サブプロジェクトごとの運用差異を正式に許容するルールへ書き換えるか」の二択が論点になる。

## 4. 初期セットアップコマンド（`projects/.claude/commands/` に実装済み）

`docs/specs/` `docs/tasks/` 構成が実際にはほとんどのサブプロジェクトで整備されていない（2章参照）ことを受け、初期セットアップを素早く行うための以下のコマンドを追加する。

1. **`/init-spec`** : プロジェクト全体の初期ディレクトリ構成（トップレベル `CLAUDE.md` が前提とする `docs/specs/`・`docs/tasks/`・`src/`・`tests/` 一式）をスケルトンとして作成する。
2. **`/init-change`** : `docs/changes/<version>-<type>-<短い説明>-<日付>/`（例: `v0.2.0-feat-add-login-api-20260812`）配下に `proposal.md`・`design.md`・`decisions.md`・`tasks.md`・`specs/`（delta spec用）の雛形一式を作成する。`/explore` → `/todo-propose` の前段として、または `/todo-propose` を使わず手動で変更作業を始める際の初期化コマンドとして使う。

### 4.1 change-nameのバージョニング（2026-08-12 改定）

当初は「4桁連番-日付-change-name」（例: `0001-20260805-add-login-api`）だったが、以下の3点を理由に改定した。

1. **先頭4桁を「意味のあるバージョン」にしたい**: 単なる連番ではなく、そのサブプロジェクトの
   `docs/specs/`（仕様そのもの）のSemVerバージョンを指すようにする。判断ルールは `semver` skill
   （`~/.claude/skills/semver/`、出典: tohoho-webのSemVer解説）を参照する。
2. **`<type>-<短い説明>` はGitHubのコミット名としてそのまま使えるようにしたい**: Conventional Commits
   準拠のtype（`feat` `fix` `docs` `chore` `refactor` 等）を先頭に付けたスラッグにする。
   実際にcommitする際は `<type>: <説明>`（コロン+半角スペース）に変換する。
3. **日付は末尾に置く**: ディレクトリ名の先頭（＝一覧の並び順の主キー）はバージョンにしたいため、
   日付は末尾に回す。

**新フォーマット**: `<version>-<type>-<短い説明>-<日付8桁>`（例: `v0.2.0-feat-add-login-api-20260812`）

- **`<version>`**: `docs/specs/VERSION`（`/init-spec` が作成するプレーンテキスト1行、初期値は開発者が
  そのサブプロジェクトの成熟度に応じて一度だけ決める。目安: 本番運用済みで大きな仕様変更が
  一段落している→`1.0.0`、まだ仕様が変わり続けているPoC・開発中→`0.x.0`）を現在値とし、
  そこに `<type>` から導かれる増分（`semver` skill参照）を適用した値。
- **`<type>`**: Conventional Commitsのtype（`feat`=MINOR, `fix`=PATCH, `docs`/`chore`/`refactor`等=PATCH,
  破壊的変更は末尾`!`または本文`BREAKING CHANGE:`でMAJOR）。
- **バージョン確定のタイミング**: `/init-change` 実行時は開発者の自己申告で暫定決定し、
  変更が完了・正式反映される時点（`/archive` 実行時。ただしバージョン確定自体は `/archive` の
  チェック対象に含めていないため、引き続き人間判断で行う。2026-08-24 `/archive` 実装）で
  実際の差分から確定・必要なら訂正する。訂正でディレクトリ名（バージョン部分）が変わる場合は、
  他ドキュメントからの相対リンク・パス参照を全文検索して更新すること
  （`changes/0001-20260812-docs-naming-rules/proposal.md` 4章の手順を流用できる）。
- **`change-name` は `<type>-<短い説明>` 全体で概ね20文字以内を目安にする。** 内容の詳細は
  ディレクトリ名ではなく `proposal.md` の見出し・本文で説明すればよい。
- **既存ディレクトリは凍結**: <project-a>の `0001-ui-final-check` 等、旧フォーマット
  （4桁連番-日付-change-name）で既に作成済みのディレクトリはリネームしない。新フォーマットは
  「今後そのサブプロジェクトで新規作成するchangeから」適用する。旧→新が混在する期間が生じるのは許容する。
- **既知のトレードオフ**: バージョンが2桁以上になると（例: `v0.9.0` と `v0.10.0`）、
  ディレクトリ名の単純な辞書順ソートは時系列と一致しなくなる。時系列で並べたい場合は
  末尾の日付部分を見る。

上記2コマンドが生成する雛形は、`projects/_templates/dev/` として実体化済み：

```text
_templates/dev/
├── docs/
│   ├── specs/
│   ├── tasks/
│   │   └── todo.md
│   ├── refs/
│   └── changes/
│       └── <change-name>/
│           ├── proposal.md
│           ├── design.md
│           ├── tasks.md
│           └── specs/
│               └── README.md   ← delta specの索引・手順（雛形）
├── src/
└── tests/
```

新規サブプロジェクトの `docs/`・`src/`・`tests/` はこのディレクトリをコピーして初期化する。`docs/refs/` は関係者との資料共有用ディレクトリで、`docs/specs/` とは異なり仕様のSingle Source of Truthではない。

**命名の経緯（2026-08-13 決定）**: 従来は `docs/shared/`（task-management・notion-task-pipeline・<ops-project-b>・<ops-project-a>・<ops-project-c>の5プロジェクト）と `docs/tmp/`（<project-a>のみ、outlier）に名称が割れていた。どちらの既存資産にも寄せず、仕様書から継続的に参照される資料であることを表す `refs` に統一した（詳細: `changes/0001-20260812-docs-naming-rules/proposal.md` 3章）。既存5プロジェクトおよびテンプレート（`_templates/dev/docs/refs/`）は `docs/refs/` へリネーム済み（2026-08-13）。<project-a>の `docs/tmp/`（他ファイルからの壊れたリンクを含む）のリネーム・リンク修正は未対応（提案書4章の対象外につき別途実施）。

### 4.2 delta specの記録方式（2026-08-17 改定）

**発覚した事象**: <project-a> の `docs/changes/` 8件（`0001`〜`0005`、`v0.6.0`〜`v0.7.1`）すべてで
`specs/` が空だった（`0004`・`0005` は `specs/` 自体が無い）。

**原因はルール構造にあり、運用ミスではない**:

1. delta spec生成の責務が未実装コマンド `/apply` にのみ割り当てられており、実装済みの `/init-change` は
   注意事項で「`specs/` は空ディレクトリのまま作成する（中身は `/apply` 工程で生成する）」と明記していた。
   つまり作る側は「書かない」と宣言し、書く側は存在しない＝**誰の責務でもなかった**。
2. 実作業で毎回読まれる `projects/CLAUDE.md` に `docs/changes/` も delta spec も一切登場せず
   （ディレクトリ構造図にも標準ワークフローにも無し）、実装フェーズで書くトリガーが存在しなかった。
   `directry-rules.md` は `/init-*` 系から任意参照される二次資料にすぎない。
3. `_templates/dev/docs/changes/<change-name>/specs/` に雛形ファイルが無く、書式が未定義だった
   （proposal・design・tasksには雛形mdがあるのにspecsだけ空）。書こうとしても型が無かった。

**結果として起きたこと**: 差分は大本spec内のインライン注記でしか残らず、その書式も
「訂正メモ」「変更履歴」「見出しに日付埋め込み」「文末カッコの日付」の4通りに揺れて `grep` での
一括抽出が不可能になった。`0004` のように `tasks.md` に「`spec.md` 2章・4章更新」と節番号だけを
記録した変更は、**何をどう変えたか復元できない**。さらに `projects/` 配下は **git管理外**であり、
git履歴という代替の追跡手段が存在しない（差分記録は `docs/changes/` にしか置けない）。

**採用した方式**:

- **大本specは直接更新する**（従来の実運用のまま）。delta specは大本の写しを持たず、
  **unified diffだけを保持する**。二重管理を避けつつ、当時の差分を機械的に完全復元できる。
- **記録タイミングは2段**: 着手時に「触る予定の大本spec・節」を `specs/README.md` に書き（状態=予定）、
  完了時に実際のdiffで確定させる。予定と結果のズレも記録に残る。
- **差分の基準点**: 大本specを編集する**直前**に対象ファイルを `specs/base/` にコピーする。
  完了時に `diff -u` してdiffを生成したら `base/` は削除する（diffから復元できるため保持不要）。
- **ファイル名規約**: `docs/` 以降のパスの `/` を `_` に置換した平坦名＋`.diff`
  （例: `docs/specs/foo.md` → `specs_foo.md.diff`）。
- **大本specを変更しない変更**でも、その旨を `specs/README.md` に1行書く。
  「判断の結果として書かれていない」と「未着手で空」を区別するため。
- **責務の置き場所**: `projects/CLAUDE.md` の最優先原則2および標準ワークフロー手順2・4・5、
  `_templates/dev/docs/changes/<change-name>/specs/README.md`（書式と生成コマンド）、
  同 `tasks.md` の固定チェック項目3つ。**未実装コマンドに責務を預けない**ことが今回の設計原則。
- **適用範囲**: 2026-08-17 以降に新規作成するchangeのみ。既存の空 `specs/` は遡って埋めない
  （4.1「既存ディレクトリは凍結」と同じ扱い）。復元不可能な既存分は負債として扱う。

**大本specのディレクトリ名が `docs/specs/` でないサブプロジェクトでの注意**: どのディレクトリが
大本specなのかをサブプロジェクト側で明示し、delta specのdiff対象は**大本specに限る**。

- <project-a>: **`docs/02-specs/` が大本spec**（2026-08-17 ユーザー確認）。
  `docs/01-reqs/`（要件定義）・`docs/03-design/`（設計）は大本specではない。
  したがってdiff対象は `docs/02-specs/*.md` のみで、ファイル名規約上は
  `docs/02-specs/spec.md` → `02-specs_spec.md.diff` となる。
- 上記の帰結として、`01-reqs/`・`03-design/` だけを更新した変更（例: `v0.7.0-feat-element-delete-20260817`）は
  **「大本specを変更しない変更」として扱う**（2026-08-17 決定）。要件・設計の変更はdiffを取らず、
  `specs/README.md` に「大本specは変更なし（要件・設計のみ更新）」と1行書き、内容の説明はchangeの
  `proposal.md`・`design.md` に委ねる。delta specのdiff対象を「大本spec」と一致させるための線引き。
- **`VERSION` の置き場所は大本specディレクトリ直下**とする（4.1は `docs/specs/VERSION` と書いているが、
  ディレクトリ名が異なる場合はその大本specディレクトリに置く）。<project-a>は
  `docs/02-specs/VERSION`（2026-08-17 に `0.7.1` で作成。`v0.6.0`〜`v0.7.1` は自己申告値だったため、
  到達済みの最新値を現在値として採用した）。

### 4.3 todo.mdとの同期漏れ（2026-08-19発覚）

**発覚した事象**: <project-a> の `docs/tasks/todo.md` に、`0003-admin-web-api-integration` の
残タスク2件（`facilities[]`キー集合の突き合わせ方針、画像配信ドメイン`public_base_url`確定待ち）と、
`v0.7.1-chore-save-verify-20260817`（提案・未承認・未実装のまま）が一度も `- [ ]` として
反映されていなかった。`todo-import`（当時の名称は `today-todo`。7章参照）スキルは
`docs/tasks/todo.md` の `- [ ]` のみを機械抽出する
仕組みのため、両者は日次の棚卸しから完全に漏れていた。

**原因はルール構造にあり、運用ミスではない**: `todo.md` 末尾の運用メモが「小さい修正依頼は
`docs/changes/xxxx-*/` 内に記録し、todo.mdへの実装ログ追記は行わない」とだけ書いており、
**完了ログ**と**未解決の残タスク・承認待ち事項**を区別していなかった。結果として、
0003はtasks.mdに残タスクを記録した時点で運用メモ上「対応済み」の扱いに見え、v0.7.1は
そもそもtodo.mdへ登録するトリガーが最初から存在しなかった（アドホックな申告調査から
直接proposalを書いたため）。4.2（delta specが誰の責務でもなかった件）と同じ「書く側と
読む側の対象範囲が噛み合っていない」構造。

**採用した方式**: 実装ログ（完了記録）はchangeディレクトリ内のみで良いという原則は維持しつつ、
「未解決の残タスク・承認待ち事項・外部ブロッカーが残る場合は `todo.md` にも `- [ ]` で反映する」
という区分を<project-a>の `todo.md` 運用メモに明記した（2026-08-19）。責務の起点は
change作成・更新のタイミングとし、そのchangeがtodo.mdの既存項目に対応するか、新規に
`- [ ]` を追加すべきかをそこで判断する。

**適用範囲**: <project-a>で発見した事象だが、`docs/tasks/todo.md` 運用を前提とする他の
devサブプロジェクトにも同じ構造的リスクがある。`_templates/dev/docs/tasks/todo.md` の雛形への
反映は今回は行っていない（未実施・検討課題として残す）。

## 5. Ops系サブプロジェクト向けテンプレート（`_templates/ops/`）

`<ops-project-a>/`・`<ops-project-b>/`・`<ops-project-c>/`（2章）のように、仕様駆動（SDD）ではなく運用（Ops）作業が中心のサブプロジェクトは、`_templates/dev/` を使わず以下の軽量構成を初期ディレクトリとする。

```text
_templates/ops/
├── order.md         # 依頼内容・作業指示を記録するファイル
├── plan.md          # 作業計画書（order.mdをもとに作成、承認後に実装へ進む）
├── instruction.md   # 手動作業手順書（手動作業が発生する依頼でのみ使用）
├── src/             # 運用スクリプト・実装
├── refs/            # 依頼者・関係者と共有するドキュメント（旧share-doc、2026-08-20改名）
└── tasks/           # 依頼単位のタスク管理用（2026-08-20追加）
```

`_templates/dev/` との違い：

- `docs/specs/` を持たない＝1章のコアルール1（仕様書が唯一の正解）は適用対象外。`order.md` が「何を依頼されたか」の記録として代わりに機能する。
- 変更管理（`docs/changes/<change-name>/`）ほど重い提案・設計フェーズは前提としないが、`order.md`→`plan.md`（承認ゲート）→実装（`src/`）→（手動作業があれば）`instruction.md`→共有（`refs/`）という軽量な計画・承認フローを踏む（2026-07-30 追加、2026-08-20 `share-doc`→`refs`に改名）。

**標準フロー（2026-07-30 追加、同日中に手順2を追加）**

1. `order.md` の依頼内容を確認する。
2. **plan.mdを書く前に、対象システムのリポジトリ内に同種の作業を行う既存のバッチ管理ファイルがないか確認する。**
   例: `<point-api-project>` には `lib/batch/<tenant>/tmp/*.rb`（`Batch::<Tenant>::Tmp::ClassName`、`Batch::Base`継承、`dryrun`/`execute`メソッド）という汎用バッチクラスの蓄積がある（`git branch -a` で `operation/*` 等の専用作業ブランチにしかない資材がないかも確認する）。既存の対象ファイルが見つかった場合は、それを実装内容のベース（参考実装）として `ops-work`側の`src/`スクリプトを作成する。対象リポジトリへのコミットや作業ブランチでの管理は不要（`ops-work`側での一回限りスクリプトとして完結させる）。
3. `order.md`と2の調査結果をもとに `plan.md`（作業計画書：依頼概要・調査結果・対応方針・対象データ・リスク）を作成する。
4. **`plan.md` はユーザーの承認を得てから次に進む。承認前に `src/` の実装に着手しない。**
5. 承認後、`src/` に実装する（2で見つかった既存バッチファイルがあれば、それをベースに実装する）。**スクリプトの実体は `ops-work` 側の `order-yyyymmdd/src/` に置く。対象リポジトリ（例: `<point-api-project>`）側のディレクトリ（`tmp/`等）に直接新規作成・保存しない**（2の既存バッチファイルを参考実装として読むことと、そこへ新規スクリプトを置くことは別）。対象リポジトリの`tmp/`は、次の手順7で本番実行時に一時的にscpするコピー先に過ぎない。
6. **履歴・ログを残すレコードを作成する場合は、備考欄（`notes` 等）に作業起因を必ず記録する**（下記「備考欄（notes）への作業起因の記録」参照）。
7. 本番サーバーへのscp・rails runner実行・DRYRUN確認・本実行など**手動作業が発生する場合**は、その手順を `instruction.md` に書く（scp先は対象リポジトリの`tmp/`等、実行環境側のパスになる。ops-work側の`src/`とは別の場所である点に注意）。
8. 関係者と共有する資料は `refs/` に置く。

**Why 手順2を追加したか:** <tenant-a> `order-20260730/`（初回ログイン特典917件付与）で、既存の仕組み（GHR取込用に`operation/GHR_point_import`ブランチで管理されている`lib/batch/<tenant-a>/tmp/<point_import_batch>.rb`、および master上の`lib/batch/<tenant-a>/tmp/<grant_points_manually>.rb`）の存在を知らずに、独自スクリプト（`<add_first_login_points>.rb`）をモデルのソースコードを読んで一から書いてしまっていたことが判明（ユーザーが別件のレビュー資料を提示して発覚）。実装内容自体は`<PointHistoryModel>.<grant_method>`の実装と突き合わせて等価と確認できたが、既存ファイルを参考にすれば無駄な調査を省けたため、既存資材の確認を標準フローに追加した（対象リポジトリへのコミット運用までは求めない）。

**備考欄（notes）への作業起因の記録（2026-07-30 追加）**

運用スクリプトで履歴レコード（例: `<point_history_table>`）を作成・更新する場合、備考欄（`notes`）に作業起因を**必ず**記録する。省略・空文字は不可。

- 文言は「**日付＋対応内容**」形式で統一する。例: `2026/07/30ポイント一括付与対応`、`2026/07/01事後加算依頼対応`。
- 使用するファクトリメソッドが `notes` を引数に取らない場合（例: `<PointHistoryModel>.<grant_method>`）は、**レコード作成直後に `update!(notes: ...)` で設定する**。`create!` を直書きしてライブロジック（有効期限延長など）から乖離させる方法は採らない。
- `plan.md` の「対応方針」に設定する文言を明記し、`instruction.md` の「確認事項」に**DRYRUN出力で全件が同一文言に揃っていること**（空文字・nilの混在がないこと）の確認項目を入れる。スクリプト側にも備考欄の内訳集計を出力させる。
- 文言は関係者以外にも見える前提で選ぶ。`<point-api-project>` の `notes` は管理Web・店舗クライアントだけでなく**<member-app>の履歴APIレスポンスにも含まれる**（`app/serializers/user_app/<point_history_table>_serializer.rb`）。内部の課題番号や個人名などは書かない。

**Why:** 備考欄が空だと、後から履歴を見たときに通常の自動付与と運用一括作業による付与を判別できず、問い合わせ調査や再対応の起点が失えてしまう。<tenant-a> `order-20260730/`（初回ログイン特典917件付与）で、実装後に依頼元から備考欄への文言追加を追加依頼された経緯から、最初から必須項目として扱うことにした。

**依頼単位のディレクトリ分割（`order-yyyymmdd/`）**

Ops系サブプロジェクトは継続的に依頼（order）を受けて対応していくため、`order.md`・`plan.md`・`src/`・`refs/`・`tasks/` をサブプロジェクト直下に直置きすると依頼のたびにファイル・フォルダが混在し散らかる。これを避けるため、依頼ごとに実行日ベースの `order-yyyymmdd/` サブディレクトリ（例: `order-20260730/`）を作り、その配下にテンプレート一式を展開する。

```text
<subproject>/
└── order-20260730/
    ├── order.md
    ├── plan.md
    ├── instruction.md   # 手動作業が発生する場合のみ
    ├── src/
    ├── refs/
    └── tasks/
```

同日中に複数の依頼が来た場合は `order-yyyymmdd/` が既に存在するため、上書きせずユーザーに確認する（連番付与などの対応を相談する）。

この初期化は **`/init-ops-work`** コマンドを使う。`_templates/ops/`（`order.md`・`plan.md`・`src/`・`refs/`・`tasks/`。`instruction.md`は手動作業発生時に個別コピー）をスケルトンとして `order-yyyymmdd/` 配下にコピーし、Ops系サブプロジェクトの依頼単位ディレクトリ構成とする。

**`instruction.md` 内のコマンドのパス表記（2026-07-30 追加 / 2026-08-20 改定）**

`instruction.md`（およびサブ手順書）に書く scp・ssh 等のローカルコマンドは、**すべて絶対パスで記載する**。カレントディレクトリに関わらずそのまま貼って実行できる形にする。

- ops-work側の資材: `$HOME/projects/ops-work/<領域>/<tenant>/order-yyyymmdd/src/xxx`
- SSH鍵も絶対パス。**`~/` 記法は使わない。**
- WSL bash と Windows cmd.exe の両方で実行しうる場合は、**両方のコマンドを併記する**。Windows側は `\\wsl.localhost\<ディストリ名>\home\<ユーザー名>\projects\...` のUNCパスを使う。
  - ただし**SSH秘密鍵だけはUNCパス不可**。Windows版OpenSSHの権限チェックで `UNPROTECTED PRIVATE KEY FILE!` となるため、鍵のみ Windows ローカルパス（例: `C:\Users\<ユーザー名>\work\pem\xxx.pem`、WSL側と同一の鍵）を参照する。
- 本番サーバー側のパスは、`cd /var/www/<app>/current/` を手順に明記した上で `tmp/xxx` の相対パスで書いてよい（`rails runner` のカレントディレクトリが `current/` であることが前提のため）。

**改定の経緯（2026-08-20）:** 当初（2026-07-30）は「`projects/` 直下（リポジトリルート）で実行する前提の相対パス（例: `./ops-work/fix-points/<tenant>/order-yyyymmdd/src/xxx`）」としていた。<tenant-a> `order-20260730`・`order-20260731` がこの表記。しかし2026-08以降の実運用は絶対パスに移っており（`fix-points/<tenant-b>/order-20260805`・`order-20260818`、`fix-user-data/<tenant-b>/order-20260818`）、`~/` 記法も使わない方針になったため、**実運用側に合わせてルールを改定した**。過去分の相対パス表記は当時の経緯としてそのまま残す（遡って書き換えない）。

**Why:** 相対パスはカレントディレクトリ依存で、ユーザーが別ディレクトリから実行すると失敗する（これは当初ルールの動機と同じで、絶対パスはその動機をより強く満たす）。`~/` はWindows cmd.exe側で展開されないため、WSL/Windowsを行き来する環境では機能しない。

**`instruction.md` の分割（2026-08-20 追加）**

手動作業手順が1ファイルで長くなり端末で追いにくくなった場合、**本番実行をメインの `instruction.md` に置き、準備・付随作業を子タスクとして `instruction-sub-<名前>.md`（サブ）へ切り出す**。

```text
<subproject>/
└── order-yyyymmdd/
    ├── instruction.md                # メイン: 本番実行（DRYRUN→本実行→完了確認）
    ├── instruction-sub-<名前>.md      # サブ: 準備・付随作業の子タスク（複数可）
    ├── order.md
    ├── plan.md
    ├── src/
    ├── refs/
    └── tasks/
```

- **メイン側に置くもの**: 前提（サーバー・SSH鍵・パス・資材一覧）、本番実行前の事前確認、本番実行の全手順、ロールバック／問題発生時の対応、完了後の対応。
- **サブ側に置くもの**: 本番実行の前後に発生する子タスク（対象データの抽出、中間ファイルの取得・目視確認・加工など）。**DBを変更しない準備作業をサブに寄せると、事前確認の完了を待たずに先に着手できる**という切り分けにもなる。
- 手順番号はメイン内で通し（①②③…）にする。サブは各ファイル内で①から振り直す。
- **メインを「目次だけのハブ」にして本番実行をサブへ出す形は採らない。** 本番実行が主役なので、それを1ファイルで通しで追える形にする。
- `ssh` 接続コマンドのように「その場で打つ手順」はメイン・サブそれぞれに重複記載してよい（前提の重複ではない）。前提（パス・鍵）はメイン1箇所に集約し、サブからはリンクで参照する。
- サブ手順書の冒頭には「メインのどこに戻るか」を明記し、メイン側にも「準備（サブ手順書）」の節を置いて相互にリンクする。

**Why:** 分割しないと1ファイルが数百行になり、本番実行の最中に必要な箇所を探すことになる。逆に均等分割（準備・第1段・第2段を同格の3ファイルにする）だと本番実行そのものが2ファイルに割れ、実行中にファイルを行き来することになる。主役（本番実行）を1本に保ち、従（準備）を外に出すのが読み手の動線に合う。`fix-user-data/<tenant-b>/order-20260818`（海外住所の改行除去＋NEHOPS再連携）で、1ファイル269行 → 均等3分割 → メイン+サブへ再編した経緯から確定した（2026-08-20）。

**How to apply:** 最初から分割しない。`instruction.md` 1本で書き始め、**肥大化して読みにくくなった時点で**メイン／サブに切り出す。分割の単位は「本番実行かどうか」であり、フェーズ数や行数で機械的に割らない。

**失効ポイント復活対応の標準手順（2026-08-03 追加）**

「失効したポイントを復活してほしい」という依頼（`fix-points/<tenant>/order-yyyymmdd/`）は、`<point-api-project>`にモデル層での正規の復活メソッドが存在しない（`app/models/<point_history_model>.rb`の`<expire_method>`は失効専用の一方向処理で、逆再生用メソッドはない）ため、以下を標準手順とする（<tenant-b> `order-20260803`で採用。詳細な再現SQLは同ディレクトリの`instruction.md`を参照）。

1. `src/`スクリプトや`<grant_method>`等のモデルメソッド経由の新規ポイント付与ではなく、**本番DBへの直接SQL**で対応する。
2. 対象の失効履歴（`<point_history_table>`、`reason: EXPIRED`）を論理削除する（`acts_as_paranoid`採用のため`DELETE`ではなく`UPDATE ... SET deleted_at = NOW()`）。
3. 失効時に論理削除された`<point_balance_table>`レコードは復元しない（そのまま論理削除済みで放置する）。
4. 復活先の有効期限に対応する既存`<point_balance_table>`レコードの`points`カラムに直接UPDATEで加算する（新規レコードは作成しない）。
5. **加算分に対応する新規`<point_history_table>`レコードは作成しない**（ユーザー判断、2026-08-03）。これは上記「備考欄（notes）への作業起因の記録」ルールの例外であり、<member-app>等の履歴表示に今回の加算は一切表示されない（追跡手段はDB直接確認のみ）ことを踏まえた上での運用判断。

この手順は本番データへの不可逆な直接SQL操作を伴うため、`plan.md`の承認ゲートは通常どおり経由するが、<tenant-b> `order-20260803`自体は当初計画（モデル層経由での方針）が不要と判明した時点で承認プロセスを経ずに直接SQL対応へ切り替えたという経緯がある。

新規サブプロジェクトを作る際は、性質に応じて `/init-spec`（`_templates/dev/`）または `/init-ops-work`（`_templates/ops/`）を使って初期構成とする。

**todo.md管理とアーカイブ化（2026-08-19 追加、2026-08-26 パス形式を修正）**

`order-yyyymmdd/` を直置きするサブプロジェクト直下（`order-yyyymmdd/` と同じ階層）の `docs/tasks/todo.md` に、依頼の進行状況を管理する。粒度はサブプロジェクト単位（`ops-work/docs/tasks/todo.md`のような横断1ファイルや`ops-work/fix-points/docs/tasks/todo.md`のようなカテゴリ単位ではない。`ops-work/fix-points/<tenant-b>/docs/tasks/todo.md`のようにテナント/案件単位まで下りる）。

- **依頼作成時**: `docs/tasks/todo.md` が無ければ `_templates/ops/todo.md` を `docs/tasks/todo.md` としてコピーして新規作成し、`## 進行中` に `- [ ] order-yyyymmdd — 依頼概要 → order-yyyymmdd/order.md` を1行追記する（`/init-ops-work` ワークフロー手順5）。
- **完了時**: ユーザーが明示的に「完了」と伝えたら、`order-yyyymmdd/` を `archives/order-yyyymmdd/` へ `mv` し、`docs/tasks/todo.md` の該当行を `## 完了（archives/へ移動済み）` へ移して `- [x]` にし、リンク先を更新する（`/init-ops-work` 依頼対応の標準フロー手順9）。

**Why:** ops-workサブプロジェクトが依頼を継続的に受けていく中で、`order-yyyymmdd/`が増えるほど「今どの依頼が進行中か」が一覧できなくなっていた。todo.mdは`docs/tasks/todo.md`（1章・4章のdevテンプレート）に相当するops版の進行管理として新設した。archives/への移動は、完了済みの依頼を`order-yyyymmdd/`の一覧から分離し、進行中のものだけを見やすくするため。

**パス形式修正の経緯（2026-08-26）**: 当初は`docs/`を挟まないベタ置き`todo.md`として運用していたが、`/todo-import`・`check-todos`の探索が`find -path "*/docs/tasks/todo.md"`である（[[project_notion_task_pipeline]]のtodo_sync.pyと同じ形式）ため、ベタ置き`todo.md`は日次の棚卸しに一切乗らなかった。devテンプレートと同じ`docs/tasks/todo.md`形式に統一し、`find`の`-maxdepth`も4→6に拡張して`ops-work/<カテゴリ>/<テナント>/docs/tasks/todo.md`（6階層）・`self-work/<サブプロジェクト>/docs/tasks/todo.md`（5階層）を拾えるようにした。

**How to apply:** 「完了」の判定は厳密な基準（本実行完了・refs共有済み等）を設けず、**ユーザーが都度明示的に「完了」と伝えた時点**とする。本実行完了やrefs共有をもってClaude側が自動的に完了とみなし、確認なしでarchives/へ移動しない（[[feedback_no_unilateral_judgment]]と同根: 完了判定はユーザーの判断であり、Claudeが先回りして決めない）。移動自体はユーザーの完了報告を受けてClaudeが`mv`し、結果を報告する。

**`inbox/` からの正式配置タイミング（2026-09-02 追加）**

`inbox/order-yyyymmdd/`（配置先＝カテゴリ・テナントが未確定のまま仮置きされた依頼）は、`plan.md`が承認された時点でClaudeが機械的に`<category>/<tenant>/order-yyyymmdd/`へ`mv`する（archives/への移動＝完了判定とは別物で、ユーザーの明示確認は不要）。カテゴリ・テナントは本節冒頭のNotionプロパティ判定に従う。移動と同時に`inbox/docs/tasks/todo.md`の該当行を削除し、`<category>/<tenant>/docs/tasks/todo.md`（無ければ`_templates/ops/todo.md`から新規作成）の`## 進行中`へ追記する。プロパティ値が既存カテゴリのいずれにも該当しない場合は新カテゴリを機械的に新設せず、都度ユーザーに確認する。

**Why:** Inbox配下の依頼がplan.md承認後も配置先未確定のまま滞留し続けるケースが発生した（ops-work/inbox配下に長期間残る依頼が出た、2026-09-02）。承認＝カテゴリ・テナントが決まったタイミングであるため、そのタイミングで機械的に配置を確定させることで滞留を防ぐ。承認自体はユーザー判断のままなので[[feedback_no_unilateral_judgment]]とは抵触しない。

## 6. Claude Code 設定の3層分離（2026-08-05 追加）

`$HOME/.claude/{CLAUDE.md, commands, skills}` は dotfiles リポジトリ
（実体パスは環境依存。GitHub の個人リポジトリ）への symlink であり、
そこに書いた内容は push した時点で履歴に残る。履歴からの除去は force-push を伴い高コストなので、
**業務ドメインを含む指示は共有側に最初から置かない**。skill / command は次の3層に分ける。

| 層 | 場所 | git | 置くもの |
| --- | --- | --- | --- |
| 汎用 | `$HOME/.claude/{commands,skills}` → dotfiles | 共有される | 手順・構造・ワークフロー。業務語ゼロ |
| 業務横断 | `$HOME/.claude/local/` | 管理外（symlink 対象外） | 複数案件に共通する業務ルール |
| 案件固有 | 各案件リポジトリの `.claude/` | その案件の repo | その案件だけのルール |

判定基準（固有名・業務データ構造・運用文言・接続先・組織固有名詞の5分類）と参照記法の詳細は、
dotfiles の README「共有する範囲 — 業務ドメインを混入させない」を正とする。

### projects/ 側から見た運用

- 4章の初期セットアップコマンド（`/init-spec`・`/init-change`・`/init-ops-work`）は**汎用層**にあるため、
  案件固有の実装ルールを直接書かない。書きたくなったら `$HOME/.claude/local/<領域>/RULES.md` に置き、
  コマンド側は「業務ドメイン参照」節から任意参照する（あれば読む・なければ黙って続行）。
- `/init-ops-work` の実装フェーズ業務ルール（スクリプトの置き場所、履歴レコードの備考欄への
  作業起因の記録）は `$HOME/.claude/local/ops-work/RULES.md` に退避済み。コマンド本体には
  「監査のための作業起因をレコード側に残す」という汎用ルールだけが残っている。
- 本ファイル（`self-work/directry-rules/directry-rules.md`）と `projects/` 配下は git 管理外のため、
  業務ドメインを書いてよい。ただしここの内容を dotfiles 側の skill に転記する場合は、
  上記の判定基準を通してから行う。
- 特定の案件でしか使わないルールは、その案件リポジトリの `.claude/` に置く。

## 7. 提案書・作業計画書の自動作成（`/todo-propose`、2026-08-20 追加）

1章のコアフロー「`/explore` → `/propose` → 人間レビュー」で「想定仕様・未実装」としていた
`/propose` を実装した（`$HOME/.claude/commands/todo-propose.md`）。
命名規則の整理（7.1）に伴い、実装と同日に `/todo-propose` へ改称した。

- 対象サブプロジェクトに `docs/specs/` があるか否かでdev系/ops系を自動判定し、
  dev系なら `proposal.md`・`design.md`・`decisions.md`・`tasks.md`、ops系なら `order.md`・`plan.md` を埋める。
  意思決定が必要な論点は `proposal.md`・`design.md` 本文ではなく `decisions.md` に集約する
  （2026-08-31追加。責務分離により意思決定を追いやすくする施策）。
- ディレクトリの雛形作成は重複させず、既存の `/init-change`・`/init-ops-work` に委譲する
  （責務分割。`/todo-propose` の責務は既存資材の調査と内容の執筆・`todo.md`への同期）。
- 既存資材の調査（5章の既存バッチ確認、`notion-sync` A-4相当）は省略不可。
- **提案書・作業計画書の作成で必ず停止し、実装フェーズは持たない。** 承認後の実装は
  通常のやり取りに任せる（`notion-sync` のようなステータス駆動のA/B分岐は導入しない。
  外部ステータスストアが無く承認判定を機械的に行えないことと、スコープを小さく保つため。
  2026-08-20、ユーザー確認済み）。
- 4.3で発覚した「提案が `todo.md` に反映されず日次棚卸しから漏れる」問題への対策として、
  dev系では変更ディレクトリ作成時に `docs/tasks/todo.md` への1行追記を必須手順に含めた。

### 7.1 スラッシュコマンドの命名規則（2026-08-20 追加）

**同じフロー（一連の作業の流れ）で使うスラッシュコマンドは、共通のプレフィックスを揃える。**
予測変換で候補として出しやすくするため（ユーザー判断、2026-08-20）。

今回、todo運用フローに属する2つのコマンドを改称した。

| 旧称 | 新称 | 役割 |
|---|---|---|
| `/today-todo`（skill） | `/todo-import` | 各プロジェクトのtodo.mdを集約し、当日の下書きを生成する |
| `/propose`（command） | `/todo-propose` | todoに挙がった依頼から提案書・作業計画書を書き起こす |

- 対象は `$HOME/.claude/skills/today-todo/` → `todo-import/`（ディレクトリ名・`SKILL.md`の`name`・見出し）、
  `$HOME/.claude/commands/propose.md` → `todo-propose.md`（ファイル名・`name`・見出し・本文中の自己参照）。
- 出力先ディレクトリ `projects/today-todo/YYYY-MM-DD.md`（データの置き場所）は**リネーム対象外**。
  今回改称したのはコマンド名（呼び出し方）のみで、既存データの格納場所は変更しない。
  **追記（2026-08-21）**: ファイル名自体は別件でその後 `todo-YYYY-MM-DD.md`（`todo-`prefix付与）へ
  変更している。ファイル名ルールの詳細は `self-work/document-rules/document-rules.md` を参照。
- 参照元（`todo-source-notion`、`init-change`、本ファイル4.3など）の呼称も合わせて更新した。
- **How to apply**: 新しいコマンドを作る際、既存の一連のフロー（例: todo収集→取り込み→提案→実装）に
  属するものであれば、そのフローの代表的な語をプレフィックスにする（今回は `todo-`）。単独で完結する
  コマンド（`/init-spec`・`/init-ops-work`・`/notion-sync` 等）まで無理に揃えない。

## 8. テスト時スクリーンショットが`projects/`直下に散乱していた件（2026-08-31発覚）

**発覚した事象**: `projects/`直下（サブプロジェクトにも属さない場所）に`review-hub-viewer.png`・
`preview-nav-1.png`・`01-loaded.png`など14個のPNGが直置きされていた。いずれもPlaywrightでの
UI確認作業（`webapp-testing` skill・MCPのスクリーンショットツール）で撮ったスクショで、
成果物として意図的に置いたものではない。

**原因**: `page.screenshot(path=...)`やMCPスクリーンショットツールに相対パス・簡略ファイル名を
渡すと、実行時のカレントディレクトリ（`/projects`直下であることが多い）にそのまま書き出される。
`webapp-testing` skill自体は`/tmp/inspect.png`という絶対パス例を示していたが、それに従わない
アドホックな呼び出しがあると同じ問題が再発しうる。

**対策**: `webapp-testing` skill（Best Practices節）と `~/.claude/CLAUDE.md`（追加ルール節）に
「スクリーンショット等の一時生成物は絶対パスで`/tmp`かジョブのtmpディレクトリに保存し、
プロジェクト/リポジトリ直下には書かない」ルールを追記した（2026-08-31、いずれも汎用層のため
業務ドメインなしで共有側に直接記載可）。証跡として残したい場合のみ、後から明示的に
`docs/refs/`等へコピーする運用とする。

**既存分の扱い**: 発覚時点の14個は証跡としての用途がなかったため削除済み（2026-08-31）。
