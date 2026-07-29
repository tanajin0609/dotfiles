---
name: example-skill
description: このリポジトリでskillを追加する際のテンプレート例。実際に使う際は削除してよい。
---

# Example Skill

これはテンプレートです。新しいskillを追加するときは、
`.claude/skills/<skill-name>/SKILL.md` を同じ形式で作成してください。

- `name`: skillの識別子（ディレクトリ名と合わせる）
- `description`: いつ使うべきかをClaude Codeが判断するための説明文

本文には、Claude Codeがこのskillを呼び出したときに従うべき手順を書きます。

## このリポジトリで管理するskillの範囲

skillは出自によって3つに分類できる。ここに置くのは「1. 自作skill」のみ。

| 分類 | 例 | 管理方法 |
| --- | --- | --- |
| 1. 自作skill | 自分で書いたワークフロー | このリポジトリ（`.claude/skills/`） |
| 2. 他人のskill | skills CLI等で入れるもの | skills CLI側の管理に任せる（ここに置かない） |
| 3. 案件skill | 特定プロジェクト固有の規約 | そのプロジェクトのrepo側 |
