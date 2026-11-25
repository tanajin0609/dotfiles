// Usage: node axe-run.cjs <url> <axe.min.js path> <out.json>
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const [url, axePath, outPath] = process.argv.slice(2);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const res = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    if (!res || !res.ok()) throw new Error(`page load failed: ${res ? res.status() : 'no response'}`);
    await page.addScriptTag({ path: axePath });
    const r = await page.evaluate(() => axe.run(document, { resultTypes: ['violations', 'incomplete'] }));
    const pick = (list) => list.map((v) => ({
      id: v.id, impact: v.impact, help: v.help, tags: v.tags.filter((t) => t.startsWith('wcag')),
      nodes: v.nodes.map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 200), summary: n.failureSummary })),
    }));
    const out = { tool: 'axe-core', version: r.testEngine.version, url, violations: pick(r.violations), incomplete: pick(r.incomplete) };
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log(`axe: violations=${out.violations.length} incomplete=${out.incomplete.length}`);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(`axe: FAILED ${e.message}`); process.exit(1); });
