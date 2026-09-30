// Off-script layout: viewer は React でも package でもない単一HTMLのため、design-sync の converter
// （dist/ 前提）は使えない。index.html の <style> を唯一の出典として tokens-only DS を組み立てる。
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] ?? join(HOME, 'ds-bundle'));
const cfg = JSON.parse(readFileSync(join(HOME, '.design-sync/config.json'), 'utf8'));

const html = readFileSync(join(HOME, 'index.html'), 'utf8');
const style = /<style>\n([\s\S]*?)<\/style>/.exec(html)?.[1];
if (!style) throw new Error('index.html: <style> block not found');
// トークン（:root とダークの2ブロック）と部品CSSの境界。index.html 側で最初の部品ルールが変わったらここも直す。
const BOUNDARY = '  * { box-sizing: border-box; }';
const cut = style.indexOf(BOUNDARY);
if (cut < 0) throw new Error(`index.html: token/component boundary "${BOUNDARY.trim()}" not found`);

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'tokens'), { recursive: true });
mkdirSync(join(OUT, 'guidelines'), { recursive: true });
// validator は components/ を必ず走査する。tokens-only でも空ディレクトリは要る
mkdirSync(join(OUT, 'components'), { recursive: true });

const srcNote = '/* generated from today-todo/viewer/index.html <style> by .design-sync/build.mjs */\n';
writeFileSync(join(OUT, 'tokens/tokens.css'), srcNote + style.slice(0, cut));
writeFileSync(join(OUT, '_ds_bundle.css'), srcNote + style.slice(cut));
writeFileSync(join(OUT, 'styles.css'), '@import "./tokens/tokens.css";\n@import "./_ds_bundle.css";\n');

const header = { namespace: cfg.globalName, components: [], sourceHashes: {}, inlinedExternals: [], builtBy: 'cc-design-sync' };
writeFileSync(join(OUT, '_ds_bundle.js'),
  `/* @ds-bundle: ${JSON.stringify(header)} */\n(function(){window.${cfg.globalName}=window.${cfg.globalName}||{};})();\n`);

const guideDir = join(HOME, '.design-sync/guidelines');
const guides = readdirSync(guideDir).filter((f) => f.endsWith('.md')).sort();
for (const f of guides) cpSync(join(guideDir, f), join(OUT, 'guidelines', f));

const tokenNames = [...new Set([...style.slice(0, cut).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))];
const conventions = readFileSync(join(HOME, cfg.readmeHeader), 'utf8').trimEnd();
const body = [
  '## Files',
  '',
  '- `styles.css` — entry. `@import`s `tokens/tokens.css` (theme tokens) and `_ds_bundle.css` (all component rules).',
  ...guides.map((f) => `- \`guidelines/${f}\` — markup patterns for each screen part.`),
  '- `_ds_bundle.js` — empty namespace; this DS ships CSS only, no React components.',
  '',
  '## Tokens',
  '',
  tokenNames.map((n) => `\`${n}\``).join(' '),
  '',
].join('\n');
writeFileSync(join(OUT, 'README.md'), `${conventions}\n\n${body}`);

// 検証用の見本ページ（dot-prefix なのでアップロードしない）: guidelines の ```html ブロックを実CSSで並べる
const blocks = guides.flatMap((f) => [...readFileSync(join(guideDir, f), 'utf8').matchAll(/^### (.+)\n[\s\S]*?```html\n([\s\S]*?)```/gm)]
  .map((m) => `<section class="specimen"><h3 class="specimen-label">${m[1]}</h3>\n${m[2]}</section>`));
writeFileSync(join(OUT, '.specimen.html'), `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><link rel="stylesheet" href="styles.css">
<style>.specimen{margin:24px 0}.specimen-label{font-size:12px;color:#888;margin:0 0 8px}.specimen .app-dialog,.specimen dialog{position:static;display:block}</style></head>
<body>${blocks.join('\n')}</body></html>`);

writeFileSync(join(OUT, '.ds-build-meta.json'), JSON.stringify({ componentCount: 0, shape: cfg.shape, runtimeFontPrefixes: cfg.runtimeFontPrefixes ?? [] }, null, 2) + '\n');
writeFileSync(join(OUT, '_ds_needs_recompile'), JSON.stringify({ by: 'design-sync-cli' }));
const sha = createHash('sha256').update(readFileSync(join(OUT, 'styles.css'))).update(style).digest('hex').slice(0, 12);
console.log(`built ${OUT}: ${tokenNames.length} tokens, ${guides.length} guideline file(s), ${blocks.length} specimen block(s), style sha ${sha}`);
