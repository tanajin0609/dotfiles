---
name: dotfiles-sync
description: |
  現在の環境の ~/.claude（直接編集した内容）をdotfilesリポジトリ（Claude Codeの
  commands/skills/CLAUDE.md を管理）に同期する。ローカルの変更をコミット・push
  するかユーザーに確認し、その後リモートの最新変更を取り込み、symlink未設置なら設置する。
  /dotfiles-sync, dotfiles同期, dotfiles更新, skill同期
---

# /dotfiles-sync — dotfiles と ~/.claude の同期

`.claude/commands`, `.claude/skills`, `.claude/CLAUDE.md` を管理している
dotfiles リポジトリと、現在の環境の `~/.claude` を同期する。

## ワークフロー

### Step 1: dotfilesリポジトリの場所を特定する

以下の候補を順に確認し、`.git` と `install.sh` (WSL/Linux/macOS) または
`install.ps1` (Windows) が存在する最初のディレクトリを使う。

1. 環境変数 `DOTFILES_DIR` が設定されていればそれを使う
2. `~/dotfiles`
3. WSL環境なら `/mnt/c/Users/<Windowsユーザー名>/dotfiles`
   （`/mnt/c/Users/` 配下を `ls` して該当ディレクトリを探す）
4. Windows ネイティブ環境なら `%USERPROFILE%\dotfiles`

見つからない場合はユーザーにパスを確認する（推測で新規作成しない）。

### Step 2: ローカル変更の確認とコミット提案

通常のスキル/コマンド更新は `~/.claude` を直接編集するだけでよい
（symlink 経由で dotfiles リポジトリ本体を編集していることになるため、
dotfiles を意識する必要はない）。ここではその変更を dotfiles リポジトリに
取り込む。

```bash
git status --short -- .claude/commands .claude/skills .claude/CLAUDE.md
git diff -- .claude/commands .claude/skills .claude/CLAUDE.md
```

変更がある場合:

1. 変更内容を要約してユーザーに提示する
2. 適切なコミットメッセージ案を提示する
3. **push はもちろん、commit も必ずユーザーの確認を取ってから実行する**（無断でcommit/pushしない）
4. 承認が得られたら `git add .claude/commands .claude/skills .claude/CLAUDE.md && git commit -m "<メッセージ>"`、
   その後 push するかを改めて確認してから `git push` する

変更がなければ「差分なし」と報告して次に進む。

### Step 3: リモートの最新を取り込む

```bash
cd <dotfilesディレクトリ>
git fetch
git status -sb   # ahead/behind を確認
```

- リモートより遅れている（ahead 0, behind > 0）場合のみ `git pull --ff-only` する
- Step 2 で未コミットの変更を先に commit/push 済みのため、pull 時の衝突を避けやすい
- fast-forward できない場合（分岐している）は自動解決せず、ユーザーに報告して指示を仰ぐ

### Step 4: symlink を(再)設置する

OS を判定し、対応するインストーラーを実行する。

- WSL / Linux / macOS: `bash install.sh`
- Windows ネイティブ: `pwsh -File install.ps1` または `powershell -File install.ps1`
  （開発者モード/管理者権限が無く失敗した場合はその旨をユーザーに伝える）

実行結果（`linked` / `skip` / `backup` のログ）をそのままユーザーに提示する。

### Step 5: 結果報告

以下を簡潔にまとめて報告する。

- リポジトリの場所
- コミット/pushの有無
- pull の有無と内容
- symlink の状態（新規作成 / 既にリンク済み / バックアップ発生）

## 注意事項

- push・commitは常にユーザー確認必須（自動実行しない）
- fast-forwardできないgitの状態や、symlink作成に失敗した場合は、自動で解決を試みず状況を報告してユーザーの判断を仰ぐ
- `settings.json` や `sessions/` など、共有対象外のファイルには一切触れない
