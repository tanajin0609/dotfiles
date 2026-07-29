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

### skill の追加範囲

skill は出自によって3つに分類し、このリポジトリで管理するのは **1. 自作skill** のみです。

| 分類 | 例 | 管理方法 |
| --- | --- | --- |
| 1. 自作skill | 自分で書いたワークフロー | このリポジトリ（`.claude/skills/`） |
| 2. 他人のskill | skills CLI等で入れるもの | skills CLI側の管理に任せる（ここに置かない） |
| 3. 案件skill | 特定プロジェクトの規約・ワークフロー | そのプロジェクトのrepo側 |

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
cd ~/dotfiles   # または Windows 側のクローン
mkdir -p .claude/skills/<skill-name>
cp .claude/skills/example-skill/SKILL.md .claude/skills/<skill-name>/SKILL.md
# SKILL.md の name / description / 本文を編集する

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
