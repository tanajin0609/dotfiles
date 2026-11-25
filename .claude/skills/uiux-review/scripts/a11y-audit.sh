#!/usr/bin/env bash
# Usage: a11y-audit.sh <url> [outdir]
# 結果は <outdir>/axe.json と <outdir>/lighthouse-summary.json。片方が失敗しても他方は続行し、終了コードは失敗数。
set -u
URL="${1:?usage: a11y-audit.sh <url> [outdir]}"
OUT="${2:-/tmp/uiux-review-audit}"
AXE_VERSION=4.14.1
LIGHTHOUSE_VERSION=13.6.0
HERE="$(cd "$(dirname "$0")" && pwd)"
CACHE=/tmp/uiux-review-tools
mkdir -p "$OUT" "$CACHE"
fail=0

# --prefix で /tmp に入れるのは、レビュー対象やこのリポジトリの package.json を汚さないため
AXE_JS="$CACHE/node_modules/axe-core/axe.min.js"
if [ ! -f "$AXE_JS" ] || ! grep -q "\"version\": \"$AXE_VERSION\"" "$CACHE/node_modules/axe-core/package.json"; then
  npm install --silent --no-save --no-package-lock --prefix "$CACHE" "axe-core@$AXE_VERSION" >/dev/null 2>&1
fi
if [ -f "$AXE_JS" ]; then
  node "$HERE/axe-run.cjs" "$URL" "$AXE_JS" "$OUT/axe.json" || fail=$((fail+1))
else
  echo "axe: FAILED npm install axe-core@$AXE_VERSION"; fail=$((fail+1))
fi

CHROME_PATH="${CHROME_PATH:-/opt/pw-browsers/chromium}"
if [ -x "$CHROME_PATH" ]; then export CHROME_PATH; fi
if npx -y "lighthouse@$LIGHTHOUSE_VERSION" "$URL" --only-categories=accessibility --output=json \
     --output-path="$OUT/lighthouse.json" --quiet --chrome-flags="--headless --no-sandbox" >/dev/null 2>"$OUT/lighthouse.err"; then
  node -e '
    const r = require(process.argv[1]);
    const failed = Object.values(r.audits)
      .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode === "binary")
      .map((a) => ({ id: a.id, title: a.title, nodes: (a.details?.items || []).map((i) => i.node?.selector).filter(Boolean) }));
    const manual = Object.values(r.audits).filter((a) => a.scoreDisplayMode === "manual").map((a) => a.id);
    const out = { tool: "lighthouse", version: r.lighthouseVersion, score: r.categories.accessibility.score, failed, manual };
    require("fs").writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
    console.log(`lighthouse: score=${out.score} failed=${failed.length}`);
  ' "$OUT/lighthouse.json" "$OUT/lighthouse-summary.json" || fail=$((fail+1))
else
  echo "lighthouse: FAILED (see $OUT/lighthouse.err)"; fail=$((fail+1))
fi
exit $fail
