// ゲームのルール。描画・DOM・時計に触れないこと（measure.js が画面なしで同じ関数を回す）。
// 契約: CONFIG.arena / CONFIG.step、createState(seed)、step(state, input, dt)、bots。
// state には mode('playing'|'dead')・time・score・deathCause・player{x,y}・events を必ず持たせる。
// この雛形の中身（追ってくる四角を避ける）は差し替え用の例。
(function (root) {
  // 調整つまみ。数値はここ以外に書かない。
  const CONFIG = {
    arena: 600,
    step: 1 / 60,
    retryDelay: 0.4,
    keyboardAimDistance: 160,
    player: { radius: 12, speed: 260 },
    hazard: { half: 12, speed: 150, spawnEvery: 0.7 },
  };

  function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createState(seed) {
    const c = CONFIG.arena / 2;
    return {
      mode: 'playing', time: 0, score: 0, deathCause: null, threatAge: null,
      random: seededRandom(seed), events: [],
      player: { x: c, y: c },
      hazards: [], spawnIn: CONFIG.hazard.spawnEvery,
    };
  }

  // input: { aimX, aimY, active }
  function step(s, input, dt) {
    if (s.mode !== 'playing') return;
    const { arena, player: P, hazard: H } = CONFIG;
    const p = s.player;
    s.events.length = 0;
    s.time += dt;

    if (input.active) {
      const dx = input.aimX - p.x, dy = input.aimY - p.y, len = Math.hypot(dx, dy);
      if (len > 1) {
        const move = Math.min(len, P.speed * dt);
        p.x = Math.min(arena - P.radius, Math.max(P.radius, p.x + dx / len * move));
        p.y = Math.min(arena - P.radius, Math.max(P.radius, p.y + dy / len * move));
      }
    }

    s.spawnIn -= dt;
    if (s.spawnIn <= 0) {
      s.spawnIn = H.spawnEvery;
      const along = s.random() * arena, side = Math.floor(s.random() * 4);
      const x = side === 0 ? 0 : side === 1 ? arena : along;
      const y = side === 2 ? 0 : side === 3 ? arena : along;
      const dx = p.x - x, dy = p.y - y, len = Math.hypot(dx, dy) || 1;
      s.hazards.push({ x, y, vx: dx / len * H.speed, vy: dy / len * H.speed, born: s.time });
    }

    for (const h of s.hazards) { h.x += h.vx * dt; h.y += h.vy * dt; }
    const before = s.hazards.length;
    s.hazards = s.hazards.filter(h => h.x > -H.half && h.x < arena + H.half && h.y > -H.half && h.y < arena + H.half);
    s.score += before - s.hazards.length;

    const hit = s.hazards.find(h => Math.hypot(h.x - p.x, h.y - p.y) < H.half + P.radius);
    if (hit) {
      s.mode = 'dead'; s.deathCause = 'hazard'; s.threatAge = s.time - hit.born;
      s.events.push({ type: 'death', x: p.x, y: p.y });
    }
  }

  // 計測用の遊び方。(state, memo, random) => input。random はゲーム本体とは別の乱数。
  // 最低でも「何もしない」「でたらめ」「最も素朴な正攻法」の3つを置く。
  const bots = {
    idle: () => ({ aimX: 0, aimY: 0, active: false }),
    random: (s, memo, random) => ({ aimX: random() * CONFIG.arena, aimY: random() * CONFIG.arena, active: true }),
    naive: (s) => {
      const p = s.player;
      let near = null, best = Infinity;
      for (const h of s.hazards) { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < best) { best = d; near = h; } }
      if (!near) return { aimX: p.x, aimY: p.y, active: false };
      return { aimX: p.x - (near.x - p.x), aimY: p.y - (near.y - p.y), active: true };
    },
  };

  const api = { CONFIG, createState, step, bots };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
