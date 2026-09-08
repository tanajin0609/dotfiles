# projects/ ドキュメント種別ルール まとめ

作成日: 2026-08-21
対象: `/home/igpf-2500009/projects/` 配下で使われるドキュメント種別（誰が・いつ・何のために書くか）
関連: ディレクトリ構成・バージョニング等の「どこに置くか」は
[`self-work/directry-rules/directry-rules.md`](../directry-rules/directry-rules.md) を参照（責務分離、2026-08-21）。
変更履歴: 個別の意思決定の経緯は`directry-rules.md`と同じ方式で
`changes/<連番>-<日付>-<短い名前>/proposal.md` に記録する。本ファイル新設時の決定は
[`changes/0001-20260821-todo-plan-naming/proposal.md`](./changes/0001-20260821-todo-plan-naming/proposal.md) 参照。
2026-08-24に`/todo-propose`バッチモードのまとめ版を追加（0001の一部改定）:
[`changes/0002-20260824-todo-propose-summary/proposal.md`](./changes/0002-20260824-todo-propose-summary/proposal.md)。
2026-08-24に`work-log-YYYY-MM-DD.md`の新設と、まとめ版へのマイルストーン提案（例外）追加を決定:
[`changes/0003-20260824-work-log-and-milestone/proposal.md`](./changes/0003-20260824-work-log-and-milestone/proposal.md)。
2026-08-24に`/todo-execute`を新設し、`plan-YYYY-MM-DD.md`のアドホック運用を正式化:
[`changes/0004-20260824-todo-execute/proposal.md`](./changes/0004-20260824-todo-execute/proposal.md)。
2026-08-24に「正の情報源と`today-todo/`は必ずペアで更新する」原則を追加:
[`changes/0005-20260824-dual-update-source-and-today-todo/proposal.md`](./changes/0005-20260824-dual-update-source-and-today-todo/proposal.md)。
2026-08-31に更新ペア原則の対象を`proposal-YYYY-MM-DD.md`（まとめ版）にも拡張:
[`changes/0007-20260831-proposal-pair-update/proposal.md`](./changes/0007-20260831-proposal-pair-update/proposal.md)。
2026-09-02に`/todo-execute`の未完了マイルストーンについて、申し送り（defer）情報の形式化を追加:
[`changes/0008-20260902-defer-format/proposal.md`](./changes/0008-20260902-defer-format/proposal.md)。
2026-09-02にdefer運用の安全装置（Checker打ち切り時の自動defer化・defer回数上限）を追加:
[`changes/0009-20260902-defer-loop-safeguards/proposal.md`](./changes/0009-20260902-defer-loop-safeguards/proposal.md)。

---

## 背景（このファイルを作った経緯）

2026-08-21、`/todo-propose`バッチモードの実行後に「`today-todo/`配下に`plan.md`を作ってくれないのはなぜか」という
疑問が出た。調査の結果、過去の `today-todo/plan.md`（2026-08-19付）は `/todo-propose`（実装は2026-08-20）が
作ったものではなく、**性質が全く別のドキュメント**だったと判明。この混同が起きたのは、「どのディレクトリに
置くか」のルール（directry-rules.md）はあっても、「そのドキュメント種別が何を意味し、いつ使うか」を
横断的にまとめた記述がどこにも無かったため（責務漏れ）。このファイルはその隙間を埋める。

## `today-todo/`の目的と、正の情報源との更新ペア原則（2026-08-24追加）

`today-todo/`配下（特に`todo-YYYY-MM-DD.md`）の目的は、**`projects/`配下に散らばる各サブプロジェクトの
`docs/tasks/todo.md`（正の情報源）を横断的に一元管理・一覧できるようにすること**。したがって：

- いずれかのサブプロジェクトで作業が完了・進捗したら、**正の情報源（`docs/tasks/todo.md`、ops系は
  `order-yyyymmdd/plan.md`）と`today-todo/todo-YYYY-MM-DD.md`の両方を更新する。片方だけでは
  完了とみなさない。**
- 順序は「正の情報源 → `today-todo/`」（`today-todo/`は正の情報源の写しであり、逆方向に情報が
  生まれることはない）。
- `today-todo/todo-YYYY-MM-DD.md`にはユーザーが直接書き込んだ注記（`->`行等）が残っているため、
  更新は全文re-generateではなく差分反映（`/todo-import`の既存Step2/3の設計どおり）。
- 決定の経緯: `changes/0005-20260824-dual-update-source-and-today-todo/proposal.md`
  （サブエージェント実行後に正の情報源への反映が漏れ、さらに`today-todo/`側への反映も別途漏れた
  2件のインシデントを受けて明文化）。

## ドキュメント種別一覧

| 種別 | 置き場所 | 作成者（コマンド/フロー） | 目的 | 実装を含むか |
|---|---|---|---|---|
| `proposal.md` / `design.md` / `tasks.md` | `<subproject>/docs/changes/<version>-<type>-...-<日付>/` | `/todo-propose`（dev系）、`/init-change`で雛形作成 | 単一サブプロジェクト内の1変更について、着手前に提案・設計を書き起こす | **含まない**（承認後、別途の実装依頼で着手） |
| `order.md` / `plan.md` | `<subproject>/order-yyyymmdd/` | `/todo-propose`（ops系）、`/init-ops-work`で雛形作成 | 単一サブプロジェクトへの1依頼について、作業計画を書き起こす（承認ゲート） | **含まない**（`plan.md`承認後、`src/`実装に着手） |
| `today-todo/plan-YYYY-MM-DD.md`（またはトピック別に`plan-YYYY-MM-DD-<topic>.md`） | `projects/today-todo/` 直下 | `/todo-execute`（2026-08-24追加。それ以前はアドホックなコーディネーターセッション、専用コマンドなし） | **複数サブプロジェクトを横断**して、その場で実装まで進める実行計画（並列サブエージェントへのファイル競合マップ・モデル割当・実行順序）を記録する。`/todo-execute`は`proposal-YYYY-MM-DD.md`のマイルストーンのうちユーザーが指定したものを対象に、この計画を作ってから実行する | **含む**（計画と同じセッションで実装まで進める前提） |
| `today-todo/proposal-YYYY-MM-DD.md` | `projects/today-todo/` 直下 | `/todo-propose`（引数なし・today-todoバッチモード）の完了報告ステップ | バッチモードが**複数サブプロジェクトに起票した提案書・作業計画書の横断まとめ**（判定集計・起票パス一覧・発見事項・留保・マイルストーン提案）を1ファイルに残す。散らばった成果物への入口として、承認判断をここから始める | **含まない**（各提案の承認・実装は別途） |
| `today-todo/work-log-YYYY-MM-DD.md` | `projects/today-todo/` 直下 | `/todo-import`・`/todo-propose`・`/todo-execute` が各実行時に追記 | `todo-import → todo-propose → todo-execute` のワークフローで**いつ何を実行したか**を時系列に積み上げる実行履歴。成果物のスナップショット（`proposal-`・`plan-`）とは別物 | **含まない**（実行結果の記録のみ） |

## `today-todo/plan-YYYY-MM-DD.md` について（誤解しやすい点）

- **`/todo-propose`の成果物ではない**（まとめ版 `proposal-YYYY-MM-DD.md` とは別物。下節参照）。
  `/todo-propose`は「提案書・作業計画書の作成で必ず停止し、実装フェーズを持たない」設計
  （`directry-rules.md` 7章、2026-08-20確定）であり、**提案そのもの**は常に対象サブプロジェクト内
  （`docs/changes/`・`order-yyyymmdd/`）に閉じる。実装まで進める横断実行計画は書かない。
- `today-todo/plan-YYYY-MM-DD.md` は `/todo-propose` 実装前（2026-08-19）に、複数サブプロジェクトの `today-todo` 項目を
  1セッションで実装まで並列消化するために書かれたアドホックな成果物。単一サブプロジェクトの
  `docs/changes/` に置けない（複数プロジェクトにまたがるため）ので `today-todo/` 直下に置かれた。
- **2026-08-24に`/todo-execute`として専用コマンド化した**（`changes/0004-20260824-todo-execute/proposal.md`）。
  `/todo-execute <マイルストーンID...>`（例: `M1 M3`）を実行すると、`proposal-YYYY-MM-DD.md`の
  「今日のゴールとマイルストーン（提案）」から指定IDを読み取り、この形式で`plan-YYYY-MM-DD.md`を
  作った上で実装まで進める。それ以前はコーディネーター（メインセッション）がユーザーの明示指示を
  受けてアドホックに作成していた（専用コマンドが無かった時期の運用）。
  `/todo-propose`バッチモードが出すのは**まとめ版**（`proposal-`prefix）とマイルストーン提案までで、
  この実行計画版自体は`/todo-propose`からは出てこない（`/todo-execute`の責務）。
- **ファイル名は日付必須で、処理対象の`todo-YYYY-MM-DD.md`と同じ日付にする**: `plan-YYYY-MM-DD.md`
  （対象が1トピックのみ）または `plan-YYYY-MM-DD-<topic>.md`（複数トピックを並行、例:
  `plan-2026-08-19-notion-task-pipeline.md`）。日付は「計画を書いた日」ではなく
  **「処理対象のtodoファイルの日付」**（＝`today-todo/todo-YYYY-MM-DD.md`と同じ値）を使う。
  2026-08-19時点の運用実績は `plan.md`/`plan-<topic>.md`（日付なし）だったが、日をまたぐと
  同名ファイルが衝突する欠陥があったため、2026-08-21に日付必須へ改定した（過去分は`archives/`へ
  移動済み、遡ってのリネームはしない）。

## `today-todo/proposal-YYYY-MM-DD.md`（まとめ版）について（2026-08-24追加）

- **`/todo-propose`の引数なしバッチモードは、最後にこのまとめ版を必ず書く。** バッチモードの成果物は
  6サブプロジェクト前後に散るため、「どこに何が起票されたか」の入口が無いと承認判断ができない
  （2026-08-24、まとめ版が無いという指摘を受けて追加。`changes/0002-20260824-todo-propose-summary/proposal.md`）。
- **同ファイルは報告の写しであって、新しい判断を足さない。** 内容はセッション最終報告と同じ
  （判定集計・新規起票パス一覧・発見事項・留保・次アクション）。ここで承認したり実装方針を決めたりはしない。
  **例外（2026-08-24追加）**: 末尾の「今日のゴールとマイルストーン（提案）」節のみ、判定集計・新規起票
  結果を踏まえて優先順位を絞る新しい判断を含む（`changes/0003-20260824-work-log-and-milestone/proposal.md`）。
  マイルストーンごとに提案モデル（`haiku`/`sonnet`/`opus`）とエフォート（`low`/`medium`/`high`）を付記する。
  これも**提案**であり、確定・承認はユーザーが行う（本コマンドが実装フェーズを持たない原則は変わらない）。
- **命名は `proposal-YYYY-MM-DD.md`**。日付は処理対象の`todo-YYYY-MM-DD.md`と同じ値。
  実装を含む横断実行計画（`plan-`）とは prefix そのものが違うので、ファイル名だけで種別が判別できる
  （`plan-`と`proposal-`を重ねた命名を一度採ったが、冗長なだけで情報が増えないため2026-08-24に廃止）。
- 単一対象モード（`/todo-propose <subproject> ...`）では作らない。成果物が1ディレクトリに閉じており、
  入口が不要なため。
- **事後更新の例外（2026-08-31追加）**: 「報告の写しで新しい判断を足さない」原則は変えないが、
  同ファイルが参照する対象について正の情報源側で決定・完了が確定したら、該当節（判定集計表の
  該当行・新規起票一覧の該当項目・「今日のゴールとマイルストーン」の該当マイルストーン）は
  「完了」に更新する。全文re-generateはせず差分反映のみ（`todo-YYYY-MM-DD.md`と同じ扱い）。
  まとめ版だけを見て古い未完了状態を事実と誤認する事故を防ぐため
  （`changes/0007-20260831-proposal-pair-update/proposal.md`）。
  同じトピック（例: Checkerの発見事項、留保・未確定事項、次アクション、マイルストーン）が
  複数節に渡って言及されている構成のため、**1箇所だけ直して他が矛盾したまま残る事故が起きやすい**。
  更新時は対象キーワードでファイル全文を検索し、言及箇所を洗い出してから全て直す
  （1・2・3節を直したのに4・5節の要約文が古い記述のまま残った実例あり、2026-08-31）。

## `today-todo/work-log-YYYY-MM-DD.md` について（2026-08-24追加）

- **`todo-import`・`todo-propose`・`todo-execute`が、それぞれの実行完了時にエントリを1件追記する**
  （新規なら作成、既存なら末尾に追記。既存エントリは書き換えない）。同日に複数回実行されれば
  その分だけエントリが積み上がる、追記専用（append-only）のファイル。
- **他の`today-todo/`配下ファイルとの違い**: `todo-YYYY-MM-DD.md`は当日のタスク一覧そのもの、
  `proposal-YYYY-MM-DD.md`・`plan-YYYY-MM-DD.md`は成果物のスナップショットであるのに対し、
  `work-log-YYYY-MM-DD.md`だけが**「いつ・どのコマンドを・何を対象に実行したか」という実行履歴**
  を持つ。詳細内容は二重管理せず、各成果物へのリンクで参照する。
- ファイル名は日付必須（処理対象の`todo-YYYY-MM-DD.md`と同じ日付）。トピック別分割は行わない
  （1日1ファイルに集約する）。
- 決定の経緯: `changes/0003-20260824-work-log-and-milestone/proposal.md`。

## defer情報の形式化（2026-09-02追加）

`/todo-execute`が「一部失敗」「スキップ」と判定したマイルストーンは、以下4項目を
構造化して申し送る（`defer`と呼ぶ）。自由記述の「未解決点・次アクション」だけでは
次サイクルに拾われず埋もれるため、次の一手を機械的に引き継げる形にする。

- **状態**: `pending`（未着手のまま）/ `blocked`（依存待ち）/ `partial`（部分完了）
- **理由**: なぜ完了しなかったか
- **次の一手**: 次に何をすれば前進するか（具体的な調査対象・コマンド）
- **推奨モデル/エフォート**: 変更する場合のみ記載（当初提案からの見直し）

記録先は役割分担した2箇所（**二重管理を許容**）:

- `today-todo/plan-YYYY-MM-DD.md`の該当マイルストーン見出し下に、上記4項目を**詳細に**記録する
  （実行計画ファイルであり当日以降も参照される前提のため。詳細の一次情報はここに置く）。
- 対象サブプロジェクトの`docs/tasks/todo.md`（正の情報源）には、defer理由の**要約1行**と
  `plan-YYYY-MM-DD.md`への参照リンクを追記する（「正の情報源→today-todoへ反映」という
  既存の一貫性原則に合わせるため）。

次サイクルでの拾い上げは`/todo-propose`バッチモードの一次判定に委ねる。`todo.md`のdefer行が
`today-todo/todo-YYYY-MM-DD.md`に列挙されたら、`/todo-propose`は参照先`plan-YYYY-MM-DD.md`の
詳細（次の一手・推奨モデル）を読み取り、ゼロから調査し直さずマイルストーン再提案に引き継ぐ。
決定の経緯: `changes/0008-20260902-defer-format/proposal.md`。

### Checkerループ打ち切り時の自動defer化（2026-09-02追加）

`/todo-execute` Step4（`todo-checker`による検証ループ）が2周しても「要修正」を解消できない場合、
そのマイルストーンは自動的にdefer記録する（状態は`blocked`固定）。理由には`todo-checker`の
指摘内容を、次の一手には`todo-checker`が最後に示した修正方針を転記する。人間の判断を待って
から記録するのではなく、記録自体は自動で行い、実行するかどうかの判断は次サイクルの
`/todo-propose`起票時にユーザーへ委ねる。決定の経緯: `changes/0009-20260902-defer-loop-safeguards/proposal.md`。

### defer回数カウントと閾値（2026-09-02追加）

`docs/tasks/todo.md`のdefer要約行には`defer x<n>`の形で回数を持たせる（初回defer時は`x1`、
再度deferされるたびに加算）。`n`が**3**に達した項目は、`/todo-propose`が同じ「次の一手」で
機械的に自動再提案することをやめ、「3回defer済み、方針から見直すべきでは」という一言とともに
まとめ版（`proposal-YYYY-MM-DD.md`）に明示する（起票自体はスキップせず提示に留め、黙って
消さない）。無限に先送りされ続けるのを防ぐための歯止め。決定の経緯:
`changes/0009-20260902-defer-loop-safeguards/proposal.md`。

## `today-todo/` 配下のアーカイブ運用（2026-08-21追加、2026-08-24に`work-log-`を追加、2026-08-26に`todo-`の自動化を追加、2026-08-31に`yyyymmdd/`フォルダ集約に変更）

`today-todo/`直下は当日分の`todo-YYYY-MM-DD.md`・当日以降も参照する`plan-YYYY-MM-DD*.md`・
`proposal-YYYY-MM-DD.md`・`work-log-YYYY-MM-DD.md`のみを置く。

**`todo-YYYY-MM-DD.md`だけは`todo-import`実行のたびに自動アーカイブする**（2026-08-26変更）。
今日の日付と異なる`todo-YYYY-MM-DD.md`はStep3で`today-todo/archives/<yyyymmdd>/`へ`mv`される
（`todo-import`SKILL.md Step3）。過去分を毎回手で消す必要が無いよう、ユーザー指示で明示的に
自動化を依頼された。

`plan-YYYY-MM-DD*.md`・`proposal-YYYY-MM-DD.md`・`work-log-YYYY-MM-DD.md`はこの自動アーカイブの
対象外（当日以降も参照されることがあるため）。これらは従来どおり、
**完了したものを、ユーザーが指示したタイミングで手動で`today-todo/archives/<yyyymmdd>/`へ`mv`する**
（ops系の`order-yyyymmdd/`→`archives/order-yyyymmdd/`と同じ考え方。`directry-rules.md` 5章参照）。
完了判定・削除に類する操作をAIが先回りして決めないという原則と同根
（`changes/0001-20260821-todo-plan-naming/proposal.md` 5章）。

**フォルダ集約（2026-08-31変更）**: `archives/`配下はフラット配置ではなく、ファイル名に含まれる日付
（`YYYY-MM-DD`→`yyyymmdd`表記に変換）ごとにサブフォルダを作り、その日付の`todo-*.md`・`plan-*.md`・
`proposal-*.md`・`work-log-*.md`をまとめて格納する（例: `archives/20260824/todo-2026-08-24.md`と
`archives/20260824/proposal-2026-08-24.md`を同じフォルダに置く）。`todo-*`は自動アーカイブ、他3種は
手動アーカイブとタイミングが異なるため、4種すべてが同じ日付で揃うとは限らない。揃っていない時点では
その時点である分だけを格納したフォルダになり、後から同じ日付の別種がアーカイブされたら同じ
`archives/<yyyymmdd>/`へ`mv`する（新規フォルダを作らない）。決定経緯:
`changes/0006-20260831-archive-yyyymmdd-folders/proposal.md`。

## How to apply

- 「提案書を書いて」「作業計画書を書いて」だけの依頼 → `/todo-propose`（dev系は`docs/changes/`、ops系は`order-yyyymmdd/`）。
  実装を含む`today-todo/plan-YYYY-MM-DD.md`（横断実行計画）は作らない。
  ただし**引数なしのバッチモードのときだけ**、最後に`today-todo/proposal-YYYY-MM-DD.md`（まとめ版）を書く。
- 「`/todo-propose`が提案したマイルストーンを実装して」「M1を進めて」のように、承認済みマイルストーンを
  実装する依頼 → `/todo-execute <マイルストーンID...>`。`today-todo/plan-YYYY-MM-DD.md`
  （またはトピック別ファイル）を書き、ファイル競合マップ・並列グループを整理してから
  サブエージェントに実装させる（2026-08-24以降はこのコマンドに一本化。それ以前のアドホック運用は
  `today-todo/plan-YYYY-MM-DD.md`について節を参照）。
- 「前日までのtodo・planをアーカイブして」と言われたら、当日分（実行時のシステム日付の
  `todo-YYYY-MM-DD.md`と、当日分の`plan-*.md`・`proposal-*.md`・`work-log-*.md`があればそれ）を除く
  `todo-YYYY-MM-DD.md`・`plan-*.md`・`proposal-*.md`・`work-log-*.md`を、ファイル名の日付ごとに
  `today-todo/archives/<yyyymmdd>/`へ`mv`する（既存の`archives/`直下フラット配置分も同じ基準で
  `<yyyymmdd>/`へ再編成する）。これら4つの命名規則に一致しない
  ファイル（例: トピック名+日付が混在した自由記述のメモ）は対象外とし、扱いをユーザーに確認する。
- `todo-import`・`todo-propose`を実行したら、`work-log-YYYY-MM-DD.md`に実行エントリを追記する
  （各コマンドのSKILL.md/コマンド定義側の手順に従う。本ファイルでは種別としての位置づけのみ扱う）。
- サブエージェント経由か直接作業かを問わず、何らかの作業が完了したら**必ず**対象サブプロジェクトの
  `docs/tasks/todo.md`（正の情報源）を更新し、続けて`today-todo/todo-YYYY-MM-DD.md`にも同じ変化を
  反映する（`/todo-import`再実行、または差分が小さければ同等の手動反映）。片方だけで完了報告しない。
  当日分の`today-todo/proposal-YYYY-MM-DD.md`が存在し、その対象について完了が確定した場合は
  該当節も同様に更新する（2026-08-31追加）。
- `/todo-execute`がマイルストーンを「一部失敗」「スキップ」とした場合は、完了報告と同じ扱いで
  `plan-YYYY-MM-DD.md`に詳細defer情報を、`docs/tasks/todo.md`に要約行を書く（2026-09-02追加。
  「defer情報の形式化」節参照）。
