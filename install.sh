#!/usr/bin/env bash
set -euo pipefail

# dotfiles installer (WSL / Linux / macOS)
# .claude/commands, .claude/skills, .claude/CLAUDE.md を
# ~/.claude 以下へシンボリックリンクします。
# 既存の実体ディレクトリ/ファイルがある場合は上書きせずタイムスタンプ付きで退避します。

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${HOME}/.claude"
TIMESTAMP="$(date +%Y%m%d%H%M%S)"

link() {
  local src="$1" # dotfiles 内の実体
  local dest="$2" # リンク先 (例: ~/.claude/skills)

  mkdir -p "$(dirname "$dest")"

  if [ -L "$dest" ]; then
    if [ "$(readlink "$dest")" = "$src" ]; then
      echo "skip (already linked): $dest"
      return
    fi
    echo "remove stale symlink: $dest"
    rm "$dest"
  elif [ -e "$dest" ]; then
    local backup="${dest}.bak.${TIMESTAMP}"
    echo "backup existing $dest -> $backup"
    mv "$dest" "$backup"
  fi

  ln -s "$src" "$dest"
  echo "linked: $dest -> $src"
}

link "${DOTFILES_DIR}/.claude/commands" "${CLAUDE_DIR}/commands"
link "${DOTFILES_DIR}/.claude/skills" "${CLAUDE_DIR}/skills"
link "${DOTFILES_DIR}/.claude/CLAUDE.md" "${CLAUDE_DIR}/CLAUDE.md"

echo "done."
