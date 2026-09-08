#!/usr/bin/env bash
# ディレクトリツリーを深さ制限・除外パターン付きで表示する。
# Usage: list_dirs.sh [root_path] [max_depth]
set -euo pipefail

root="${1:-$HOME/projects}"
depth="${2:-3}"

root="${root%/}"
if [ ! -d "$root" ]; then
  echo "エラー: ディレクトリが見つかりません: $root" >&2
  exit 1
fi

excludes=(.git node_modules .venv __pycache__ dist build .astro .next)

prune_args=()
for ex in "${excludes[@]}"; do
  if [ ${#prune_args[@]} -gt 0 ]; then
    prune_args+=(-o)
  fi
  prune_args+=(-name "$ex")
done

echo "$root"
find "$root" -mindepth 1 -maxdepth "$depth" -type d \( "${prune_args[@]}" \) -prune -o -type d -print | \
  sort | \
  awk -v root="$root" '
  {
    rel = substr($0, length(root) + 2)
    n = split(rel, parts, "/")
    indent = ""
    for (i = 1; i < n; i++) indent = indent "  "
    print indent "- " parts[n]
  }'
