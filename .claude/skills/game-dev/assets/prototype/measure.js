#!/usr/bin/env node
// 自動プレイで「面白くなりようがない状態」を検出する。面白さそのものは測れない。
// 使い方: node measure.js <game.js> [--games 300] [--cap 300] [--react 15] [--threat 1] [--save f.json] [--compare f.json]
//   --react  方針に判断させる間隔（フレーム）。人の反応の遅れの代用
//   --threat やられた相手の出現からこの秒数未満なら「避けようがない」と数える。相手が届くまでの最短時間より短くする
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; };
if (!args[0] || args[0].startsWith('--')) { console.error('使い方: node measure.js <game.js> [--games N] [--cap 秒] [--react フレーム] [--save f.json] [--compare f.json]'); process.exit(2); }

const Game = require(path.resolve(args[0]));
const GAMES = Number(opt('games', 300)), CAP = Number(opt('cap', 300)), REACT = Number(opt('react', 15)), THREAT = Number(opt('threat', 1));
const MASH_REACT = 5, SKIP_EDGE = !!(Game.measureHints && Game.measureHints.skipEdge);
const A = Game.CONFIG.arena, DT = Game.CONFIG.step, EDGE = A * 0.1;
const botNames = Object.keys(Game.bots || {});
if (!botNames.length) { console.error('警告: game.js が bots を1つも公開していない。計測できない。'); process.exit(2); }

function botRandom(seed) { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; }
const pct = (a, q) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))];

function play(name, react) {
  const rows = [], causes = {}, threat = [], cells = new Array(9).fill(0);
  let edge = 0, samples = 0, capped = 0;
  for (let g = 1; g <= GAMES; g++) {
    const s = Game.createState(g), memo = {}, random = botRandom(g * 7919);
    let input = { aimX: A / 2, aimY: A / 2, active: false, pressed: false }, n = 0;
    while (s.mode === 'playing' && s.time < CAP) {
      // react フレームごとにしか判断させない。pressed は判断したフレームだけ通す（押した瞬間は1回きり）
      const decide = n % react === 0;
      if (decide) input = Game.bots[name](s, memo, random) || input;
      Game.step(s, decide ? input : { ...input, pressed: false }, DT); n++;
      if (n % 6 === 0) {
        samples++; const p = s.player;
        if (Math.min(p.x, p.y, A - p.x, A - p.y) < EDGE) edge++;
        cells[Math.min(2, Math.max(0, Math.floor(p.x / A * 3))) + 3 * Math.min(2, Math.max(0, Math.floor(p.y / A * 3)))]++;
      }
    }
    if (s.mode === 'playing') capped++;
    else { causes[s.deathCause] = (causes[s.deathCause] || 0) + 1; if (typeof s.threatAge === 'number') threat.push(s.threatAge); }
    rows.push([Number(s.time.toFixed(4)), s.score, s.mode === 'playing' ? 'cap' : String(s.deathCause)]);
  }
  const times = rows.map(r => r[0]);
  return {
    rows, median: pct(times, 0.5), p10: pct(times, 0.1), p90: pct(times, 0.9),
    scoreMedian: pct(rows.map(r => r[1]), 0.5), capped: capped / GAMES, edge: samples ? edge / samples : 0,
    cell: samples ? Math.max(...cells) / samples : 0,
    causes, earlyThreat: threat.length ? threat.filter(t => t < THREAT).length / threat.length : null,
  };
}
const results = {}, flags = [];
for (const name of botNames) results[name] = play(name, REACT);

console.log(`対局数 ${GAMES}/方針  上限 ${CAP}秒  判断間隔 ${REACT}フレーム  場 ${A}`);
console.log('方針'.padEnd(12) + '生存秒 10%/50%/90%'.padEnd(22) + 'スコア中央'.padEnd(10) + '上限到達'.padEnd(8) + '居場所の偏り'.padEnd(26) + '終了原因');
for (const name of botNames) {
  const r = results[name];
  const causeText = Object.entries(r.causes).map(([c, k]) => `${c} ${(k / GAMES * 100).toFixed(0)}%`).join(' / ') || '-';
  console.log(name.padEnd(14) + `${r.p10.toFixed(0)}/${r.median.toFixed(0)}/${r.p90.toFixed(0)}`.padEnd(24) + String(r.scoreMedian).padEnd(12)
    + `${(r.capped * 100).toFixed(0)}%`.padEnd(10) + `${SKIP_EDGE ? '' : `端 ${(r.edge * 100).toFixed(0)}%(均等36) `}最多マス ${(r.cell * 100).toFixed(0)}%(均等11)`.padEnd(34) + causeText);
  if (r.earlyThreat !== null) console.log(' '.repeat(14) + `出現${THREAT}秒未満の相手で終了: ${(r.earlyThreat * 100).toFixed(0)}%`);
}

const active = botNames.filter(n => n !== 'idle');
for (const n of botNames) {
  const r = results[n];
  if (r.capped > 0.5) flags.push(n === 'idle' ? '何もしなくても終わらない（idle が上限到達）' : `考えなくても終わらない（${n} が上限到達 ${(r.capped * 100).toFixed(0)}%）`);
  if (r.earlyThreat !== null && r.earlyThreat > 0.2) flags.push(`避けようのない終了が多い（${n}: 出現${THREAT}秒未満 ${(r.earlyThreat * 100).toFixed(0)}%。相手が届くまでの最短時間が${THREAT}秒より短いゲームなら --threat を下げる）`);
}
if (active.length >= 2) {
  const med = active.map(n => results[n].median).filter(m => m > 0);
  if (med.length >= 2 && Math.max(...med) / Math.min(...med) < 1.3) flags.push(`遊び方で結果が変わらない（中央値 ${med.map(m => m.toFixed(0)).join(' / ')}秒）`);
} else console.log('注意: idle 以外の方針が2つ未満のため、「遊び方で結果が変わるか」は判定していない。');
if (active.length) {
  const top = active.reduce((a, b) => (results[a].median >= results[b].median ? a : b)), r = results[top];
  // 居場所の偏りは最も長く生きる方針だけで見る（すぐ終わる方針は開始位置から動く前に終わるため）
  if (top !== 'random') {
    if (!SKIP_EDGE && r.edge > 0.7) flags.push(`場の端に偏っている（${top}: ${(r.edge * 100).toFixed(0)}%）`);
    if (r.cell > 0.5) flags.push(`場の一か所に留まっている（${top}: 9分割の1マスに ${(r.cell * 100).toFixed(0)}%）`);
  }
  if (r.capped < 0.5 && r.median > 0 && (r.p90 - r.p10) / r.median < 0.25) flags.push(`決まった時刻に必ず終わる（${top}: ${r.p10.toFixed(0)}〜${r.p90.toFixed(0)}秒に集中。要求量が処理能力を超える時刻がないか確認）`);
}

// でたらめが正攻法に並ぶなら、読む・狙う意味が無い。速い連打でも確かめる（判断間隔を詰めないと見えない）
const strategies = active.filter(n => n !== 'random');
if (results.random && strategies.length) {
  const bestName = strategies.reduce((a, b) => (results[a].median >= results[b].median ? a : b)), bestMedian = results[bestName].median;
  const mash = play('random', MASH_REACT);
  console.log(`連打の確認: random を判断間隔 ${MASH_REACT}フレームで回すと生存中央 ${mash.median.toFixed(0)}秒（${bestName} は ${bestMedian.toFixed(0)}秒）`);
  if (results.random.median >= bestMedian * 0.9) flags.push(`でたらめが正攻法に並ぶ（random ${results.random.median.toFixed(0)}秒 / ${bestName} ${bestMedian.toFixed(0)}秒）。方針の実装ミスの可能性も確かめる`);
  else if (mash.median >= bestMedian * 0.9) flags.push(`連打で凌げる（判断間隔 ${MASH_REACT}フレームの random ${mash.median.toFixed(0)}秒 / ${bestName} ${bestMedian.toFixed(0)}秒）`);
} else console.log('注意: random と正攻法の方針が揃っていないため、「でたらめが正攻法に並ぶか」は判定していない。');

console.log(flags.length ? '\n赤信号:\n' + flags.map(f => '  - ' + f).join('\n') : '\n赤信号: なし（面白いことの保証ではない。人のプレイで判定する）');
console.log('自動判定しない項目: 終了原因がコンセプトの言う原因と合っているか、処理能力と要求量の逆転時刻。');

const snapshot = Object.fromEntries(botNames.map(n => [n, results[n].rows]));
const savePath = opt('save'), comparePath = opt('compare');
if (savePath) { fs.writeFileSync(savePath, JSON.stringify(snapshot)); console.log(`\n保存: ${savePath}`); }
if (comparePath) {
  const base = JSON.parse(fs.readFileSync(comparePath, 'utf8'));
  let diff = null;
  for (const n of new Set([...Object.keys(base), ...botNames])) {
    const a = base[n] || [], b = snapshot[n] || [];
    for (let i = 0; i < Math.max(a.length, b.length) && !diff; i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) diff = `${n} 種${i + 1}: 前 ${JSON.stringify(a[i])} → 今 ${JSON.stringify(b[i])}`;
  }
  console.log(diff ? `\n照合: 不一致（ルールが変わっている）。最初の差: ${diff}` : `\n照合: 完全一致（${botNames.length}方針 × ${GAMES}戦）`);
  if (diff) process.exit(1);
}
