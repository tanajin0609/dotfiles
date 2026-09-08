# 提案書: `today-todo/`は正の情報源とのペアで更新する（片方だけの更新を禁止）

> 対象読者: document-rules.md のメンテナ（自分）
> スコープ: 各サブプロジェクトの`docs/tasks/todo.md`（正の情報源）と`today-todo/todo-YYYY-MM-DD.md`
>   （横断スナップショット）の更新タイミングの原則を明文化する
> 元セッション: 2026-08-24
> 結論: **決定・本セッション内で反映済み**

## 1. 経緯

2026-08-24、`today-todo/proposal-2026-08-24.md`の「今日のゴールとマイルストーン」をサブエージェントで
実施した際、以下の2段階の抜けが起きた。

1. サブエージェントの完了報告を受けてすぐユーザーに完了報告したが、`json-gui-editor`・`self-work`の
   `docs/tasks/todo.md`（正の情報源）には結果が未反映のままだった（ユーザーの「今日のtodo.mdも更新済み？」
   という確認で発覚）。→ `/todo-execute`のStep2・Step4を修正済み（別途）。
2. `docs/tasks/todo.md`側を修正した後、`today-todo/todo-2026-08-24.md`（当日の横断一覧）は
   別途`/todo-import`を明示的に実行するまで古いままだった（ユーザーの「today-todo配下も更新してほしい」
   という依頼で発覚）。

どちらも「作業が完了したら、正の情報源（各サブプロジェクトの`docs/tasks/todo.md`）と、横断的な
一覧である`today-todo/`の両方を更新する」という原則が明文化されていなかったために起きた抜けだった。

## 2. 【決定】`today-todo/`の目的の明文化と、更新ペアの原則

**深刻度: 中 / 確度: 高**

- `today-todo/`配下（`todo-YYYY-MM-DD.md`）の目的は、**`projects/`配下に散らばる各サブプロジェクトの
  `docs/tasks/todo.md`を横断的に一元管理・一覧できるようにすること**（今回ユーザーが明言）。
- したがって、いずれかのサブプロジェクトで作業が完了・進捗した場合、
  1. まず正の情報源である当該`docs/tasks/todo.md`（またはops系`order-yyyymmdd/plan.md`）を更新し、
  2. 続けて`today-todo/todo-YYYY-MM-DD.md`にも同じ変化を反映する（`/todo-import`の再実行、または
     差分が小さい場合は同等の手動反映）。
  **片方だけの更新で完了とみなさない。**
- `today-todo/todo-YYYY-MM-DD.md`はユーザーが直接書き込んだ注記（`->`行等）を保持したまま
  更新する必要があるため、`/todo-import`は都度全文re-generateではなく「既存ファイルを土台に、
  変化があった箇所だけ差分反映する」（既存のStep2/3の設計のまま。今回変更なし）。

## 3. 反映範囲

- `document-rules.md`: 「背景」節に本件の教訓を追記し、「How to apply」に
  「作業完了時は正の情報源と`today-todo/`の両方を更新する」を明記。
- `/todo-execute`（`~/.claude/commands/todo-execute.md`）: Step2に「`docs/tasks/todo.md`への反映を
  作業そのものの一部として指示する」、Step4に「実際に更新されているかReadで確認する」を追加済み
  （本提案と同一セッションで対応。正の情報源側の抜けに対応）。
- `today-todo/`側（横断一覧）の抜けに対する専用コマンドの自動化は今回スコープ外
  （`/todo-execute`が実装まで進めるフローには`/todo-import`の再実行を組み込んでいないため、
  将来的に`/todo-execute`のStep5に「`/todo-import`相当の反映」を追加するかは別途検討）。
