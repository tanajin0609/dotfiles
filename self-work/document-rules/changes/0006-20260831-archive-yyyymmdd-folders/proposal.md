# 提案書: `today-todo/archives/`をフラット配置から`yyyymmdd/`フォルダ集約に変更

> 対象読者: document-rules.md のメンテナ（自分）
> スコープ: `today-todo/archives/`配下の配置方式（`todo-*.md`・`plan-*.md`・`proposal-*.md`・
>   `work-log-*.md`の格納単位）
> 元セッション: 2026-08-31
> 結論: **決定・本セッション内で反映済み**

## 1. 経緯

2026-08-21の`changes/0001-20260821-todo-plan-naming/proposal.md`で決めた運用は
「`today-todo/archives/`直下に4種のファイルをフラットに`mv`する」だった。運用を続けるうちに
`archives/`直下にファイル種別・日付が混在して蓄積し、特定の日にどの成果物が揃っているか
見通しにくくなった。ユーザーから「`yyyymmdd`フォルダを作って、todo・proposal・work-logなど
生成物をまとめたい」という改善依頼を受けた。

## 2. 【決定】日付ごとのサブフォルダへ集約

**深刻度: 低 / 確度: 高**

- `archives/`配下はフラット配置をやめ、ファイル名に含まれる日付（`YYYY-MM-DD`→`yyyymmdd`表記）
  ごとにサブフォルダ（例: `archives/20260824/`）を作り、その日付の`todo-*.md`・`plan-*.md`・
  `proposal-*.md`・`work-log-*.md`をまとめて格納する。
- グルーピング基準は「ファイル名の日付」（ユーザー確認済み）。`mv`実行時点の日付ではない。
  `todo-*`は自動アーカイブ、他3種は手動アーカイブとタイミングが異なるため、同じ日付で4種すべてが
  揃うとは限らない。揃っていない時点ではある分だけのフォルダになり、後から同じ日付の別種が
  アーカイブされたら既存の同名フォルダへ`mv`する（新規フォルダは作らない）。
- 既存の`archives/`直下フラット配置分（`todo-2026-08-18〜26.md`、`plan-2026-08-19*.md`）も
  同じ基準で`<yyyymmdd>/`へ再編成する（ユーザー確認済み。ルール改定だけでなく既存分も対象）。

## 3. 反映範囲

- `document-rules.md`: 「`today-todo/`配下のアーカイブ運用」節に「フォルダ集約」小節を追加し、
  「How to apply」の該当箇所を`archives/<yyyymmdd>/`表記に更新。
- `~/.claude/skills/todo-import/SKILL.md`（dotfiles配下）: Step3の自動アーカイブ先を
  `archives/`直下から`archives/<yyyymmdd>/`に変更。
- 実データ: `today-todo/archives/`配下の既存フラットファイルと、`today-todo/`直下に残っていた
  前日以前の`proposal-*.md`・`work-log-*.md`を、本提案と同一セッションで`<yyyymmdd>/`へ再編成。
- 対象外: 4種の命名規則に一致しない自由記述メモ（`2026-0821-<project-name>-contents.md`、
  `<project-name>-changes-open-items-20260819.md`）はスコープ外のため触っていない。
