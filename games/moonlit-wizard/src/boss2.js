// Bosses of the newer worlds: the Drowned Organist, the Grand Clock and Eclipse (your own shadow).
import { W, H, TILE, clamp, canvas } from './gfx.js';
import { G, banner, later } from './state.js';
import { LV, groundBelow, WORLD_H } from './world.js';
import { burst, pop } from './fx.js';
import { sfx } from './audio.js';
import { hurtPlayer, killEnemy } from './combat.js';
import { makeEnemy } from './enemies.js';
import { inArena, wakeBoss, dyingUpdate, meteorRain } from './boss.js';
import { spiral, bubbles, crescents, chordWall } from './patterns.js';
import { pose, staffPos } from './player.js';
import * as A from './art.js';

const RED = '#ff5470';
const cxOf = e => e.x + e.w / 2, cyOf = e => e.y + e.h / 2;
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const approach = (e, tx, ty, dt, k) => { e.x += (tx - e.w / 2 - e.x) * Math.min(1, dt * k); e.y += (ty - e.h / 2 - e.y) * Math.min(1, dt * k); };
const aimAt = (x0, y0, sp, spread = 0) => { const P = G.P, a = Math.atan2(P.y + 9 - y0, P.x + 4 - x0) + spread; return [Math.cos(a) * sp, Math.sin(a) * sp]; };
const common = (e, dt) => {
  const P = G.P;
  if (e.state === 'sleep') { if (!P.dead && inArena(P)) wakeBoss(e); return true; }
  if (e.state === 'dying') { dyingUpdate(e, dt); return true; }
  e.timer -= dt; e.anim = (e.anim || 0) + dt;
  if (e.state === 'intro') { if (e.timer <= 0) { e.state = 'idle'; e.timer = 0.8; } return true; }
  return false;
};
const halfPhase = (e, text) => { if (!e.enraged && e.hp < e.maxHp * 0.5) { e.enraged = true; banner(text, RED, 1.6); G.shake = 0.5; sfx.moonfall(); } };

/* ================= THE DROWNED ORGANIST ================= */
export function organistAI(e, dt) {
  if (common(e, dt)) return;
  const P = G.P, b = LV.boss, floor = LV.rows * TILE - 2 * TILE, R = G.diff.react * (e.enraged ? 0.75 : 1);
  halfPhase(e, 'THE HALL FLOODS');
  const anchors = [b.arenaR - 96, b.arenaR - 60, b.arenaR - 26];
  e.slot ??= 1;
  const low = e.state === 'descend';
  approach(e, anchors[e.slot] + Math.sin(e.anim * 1.2) * 6, low ? floor - 34 : floor - 122 + Math.sin(e.anim * 2) * 5, dt, low ? 2.4 : 1.5);
  e.dir = Math.sign(P.x + 4 - cxOf(e)) || -1;
  switch (e.state) {
    case 'idle':
      if (e.timer <= 0 && !P.dead) {
        const r = Math.random();
        e.slot = (e.slot + 1 + (Math.random() * 2 | 0)) % 3;
        if (r < 0.4) { e.state = 'notes'; e.timer = 1.4; e.fired = 0; e.pose = 'play'; }
        else if (r < 0.55) { e.state = 'wallWind'; e.timer = 0.8 * R; e.pose = 'raise'; sfx.hex(); }
        else if (r < 0.7) { e.state = 'bubbles'; e.timer = 1.2; e.pose = 'wide'; bubbles(cxOf(e) - 10, cyOf(e), e.enraged ? 6 : 4); }
        else if (e.enraged && r < 0.85) { e.state = 'flood'; e.timer = 1; e.pose = 'wide'; }
        else { e.state = 'descend'; e.timer = 2.2; e.fired = 0; e.pose = 'play'; }
      }
      break;
    case 'notes': {                                                        // a hymn of homing-ish notes
      const due = Math.floor((1.4 - e.timer) / (e.enraged ? 0.11 : 0.16));
      while (e.fired < due && e.fired < (e.enraged ? 12 : 8)) {
        const [vx, vy] = aimAt(cxOf(e) - 14, cyOf(e) + 6, 72, (Math.random() - 0.5) * 0.5);
        G.shots.push({ kind: 'note', x: cxOf(e) - 14, y: cyOf(e) + 6, vx, vy, life: 3.2, friendly: false, dmg: 1 });
        e.fired++; sfx.ready();
      }
      if (e.timer <= 0) { e.state = 'idle'; e.timer = 1.1 * R; e.pose = null; }
      break;
    }
    case 'wallWind':                                                      // a marching chord with one gap in it
      if (e.timer <= 0) {
        chordWall(b.arenaR - 112, floor - 110, floor - 2, -1, 55);
        if (e.enraged) later(1.6, () => chordWall(b.arenaR - 112, floor - 110, floor - 2, -1, 55));
        e.state = 'idle'; e.timer = 1.6 * R; e.pose = null;
      }
      break;
    case 'bubbles':
      if (e.timer <= 0) { e.state = 'idle'; e.timer = 0.9 * R; e.pose = null; }
      break;
    case 'flood':
      if (e.timer <= 0) {
        if (G.water) { G.water.flood = -70; later(6, () => { if (G.water) G.water.flood = 0; }); }
        banner('THE TIDE RISES', '#8fe8ff', 1.4); sfx.moonfall();
        e.state = 'idle'; e.timer = 1.2; e.pose = null;
      }
      break;
    case 'descend':                                                       // plays the low keys: shockwaves along the floor, and it's in reach
      if (e.timer < 1.6 && !e.fired) {
        e.fired = 1; G.shake = 0.4; sfx.boom(26);
        for (const d of [-1, 1]) G.shots.push({ kind: 'wave', x: cxOf(e) + d * 18, y: floor - 4, vx: d * 140, vy: 0, life: 2.6, friendly: false, dmg: 1 });
      }
      if (e.timer <= 0) { e.state = 'idle'; e.timer = 0.9 * R; e.pose = null; }
      break;
  }
  if (e.state === 'descend' && !P.dead && overlap(P, e)) hurtPlayer(cxOf(e));
}

/* ================= THE BRASS WIDOW ================= */
// Crawls the arena's floor, walls and ceiling. Position is a single number `s` along that perimeter.
function perim() {
  const b = LV.boss, L = b.arenaL, R = b.arenaR, F = b.floorY, C = b.ceilY, w = R - L, h = F - C;
  return { L, R, F, C, w, h, total: 2 * (w + h) };
}
function onPerim(pm, s) {
  s = ((s % pm.total) + pm.total) % pm.total;
  if (s < pm.w) return { x: pm.L + s, y: pm.F, side: 0 };
  s -= pm.w; if (s < pm.h) return { x: pm.R, y: pm.F - s, side: 1 };
  s -= pm.h; if (s < pm.w) return { x: pm.R - s, y: pm.C, side: 2 };
  s -= pm.w; return { x: pm.L, y: pm.C + s, side: 3 };
}
const NORMAL = [[0, -1], [-1, 0], [0, 1], [1, 0]];
function placeOnPerim(e, pm) {
  const p = onPerim(pm, e.s), [nx, ny] = NORMAL[p.side];
  e.side = p.side; e.x = p.x + nx * 11 - e.w / 2; e.y = p.y + ny * 11 - e.h / 2;
}
const ceilS = (pm, x) => pm.w + pm.h + (pm.R - clamp(x, pm.L + 20, pm.R - 20));
const floorS = (pm, x) => clamp(x, pm.L + 12, pm.R - 12) - pm.L;
/** Signed shortest step from s toward t around the loop. */
const loopDelta = (pm, s, t) => { let d = ((t - s) % pm.total + pm.total) % pm.total; return d > pm.total / 2 ? d - pm.total : d; };

export function widowAI(e, dt) {
  const P = G.P, pm = perim(), b = LV.boss;
  if (e.state === 'sleep') { e.s ??= ceilS(pm, cxOf(e)); placeOnPerim(e, pm); }
  if (common(e, dt)) return;
  const R = G.diff.react * (e.enraged ? 0.72 : 1), speed = e.enraged ? 110 : 80;
  halfPhase(e, 'THE WIDOW SKITTERS');
  e.legT = (e.legT || 0) + dt;
  const crawlTo = (t, sp) => { const d = loopDelta(pm, e.s, t); e.dir = Math.sign(d) || e.dir; e.s += Math.sign(d) * Math.min(Math.abs(d), sp * dt); placeOnPerim(e, pm); return Math.abs(d) < 2; };
  switch (e.state) {
    case 'idle':
      e.goal ??= e.s;
      crawlTo(e.goal, speed * 0.6);
      if (e.timer <= 0 && !P.dead) {
        const r = Math.random();
        if (r < 0.34) { e.state = 'hunt'; e.goal = ceilS(pm, P.x + 4); }
        else if (r < 0.6) { e.state = 'webWind'; e.timer = 0.6 * R; sfx.hex(); }
        else if (r < 0.8) { e.state = 'gearWind'; e.timer = 0.5 * R; }
        else { e.state = 'dash'; e.goal = e.s + (Math.random() < 0.5 ? -1 : 1) * pm.total * 0.45; e.mark = { ch: '!', t: 0.7 }; sfx.shriek(); }
      }
      break;
    case 'hunt':                                                           // crawl onto the ceiling above you…
      e.goal = ceilS(pm, P.x + 4);
      if (crawlTo(e.goal, speed * 1.2)) { e.state = 'dropWind'; e.timer = 0.75 * R; e.dropX = cxOf(e); sfx.alert(); }
      break;
    case 'dropWind':                                                       // …hang there (thread + shadow warn you)…
      if (e.timer <= 0) { e.state = 'drop'; e.vy = 40; e.side = 0; }
      break;
    case 'drop': {                                                         // …and fall
      e.vy = Math.min(e.vy + 900 * dt, 420); e.y += e.vy * dt;
      if (e.y + e.h >= pm.F - 1) {
        e.y = pm.F - 11 - e.h / 2; e.s = floorS(pm, cxOf(e)); placeOnPerim(e, pm);
        G.shake = 0.5; sfx.boom(28);
        crescents(cxOf(e), pm.F - 2, e.enraged ? 80 : 65);
        burst(cxOf(e), pm.F, 16, ['#ffe29a', '#c08a3a', '#8c89ab'], 90, 300, 0.5, { size: 2, bounce: true });
        if (!P.dead && Math.abs(P.x + 4 - cxOf(e)) < 20 && P.y + P.h > pm.F - 24) hurtPlayer(cxOf(e));
        e.state = 'dazed'; e.timer = 1.6; pop('DAZED!', cxOf(e) - 12, e.y - 10, '#f0b541');
      }
      break;
    }
    case 'dazed':                                                          // on its back… er, feet: hit it now (double damage)
      if (Math.random() < 0.3) G.parts.push({ x: cxOf(e) + Math.sin(G.t * 8) * 8, y: e.y - 3, vx: 0, vy: -6, life: 0.4, max: 0.4, c: '#f0b541', g: 0, size: 1 });
      if (e.timer <= 0) { e.state = 'climb'; e.climbX = cxOf(e); }
      break;
    case 'climb':                                                          // back up its thread
      e.y -= 110 * dt; e.side = 2;
      if (e.y <= pm.C + 11 - e.h / 2) { e.s = ceilS(pm, e.climbX); placeOnPerim(e, pm); e.state = 'idle'; e.timer = 0.8 * R; e.goal = e.s; }
      break;
    case 'webWind':
      if (e.timer <= 0) {
        const shots = e.enraged ? 2 : 1;
        for (let k = 0; k < shots; k++) later(k * 0.4, () => { const [vx, vy] = aimAt(cxOf(e), cyOf(e), 75, (Math.random() - 0.5) * 0.3); G.shots.push({ kind: 'web', x: cxOf(e), y: cyOf(e), vx, vy, life: 5, friendly: false, dmg: 1, r: 2, shootable: true }); sfx.bow(); });
        e.state = 'idle'; e.timer = 1.3 * R; e.goal = e.s + (Math.random() - 0.5) * 160;
      }
      break;
    case 'gearWind':
      if (e.timer <= 0) {
        for (let i = 0; i < 3; i++) G.shots.push({ kind: 'gearshot', x: cxOf(e), y: cyOf(e), vx: (i - 1) * 70 + (Math.random() - 0.5) * 20, vy: -80, g: 500, life: 5, friendly: false, dmg: 1 });
        sfx.stomp(); e.state = 'idle'; e.timer = 1.4 * R; e.goal = e.s + (Math.random() - 0.5) * 200;
      }
      break;
    case 'dash':                                                           // a fast lap — jump it when it runs the floor
      if (crawlTo(e.goal, speed * 2.2)) { e.state = 'idle'; e.timer = 1 * R; e.goal = e.s; }
      if (Math.random() < 0.4) burst(cxOf(e), cyOf(e), 1, ['#8c89ab', '#ffe29a'], 30, 0, 0.3);
      break;
  }
  if (!P.dead && e.state !== 'dazed' && e.state !== 'dropWind' && overlap(P, e)) hurtPlayer(cxOf(e));
}

/* ================= ECLIPSE — your own shadow ================= */
const shadows = new Map();
function shadowOf(src) {
  let c = shadows.get(src);
  if (!c) {
    const cv = canvas(src.width, src.height);
    cv.g.drawImage(src, 0, 0); cv.g.globalCompositeOperation = 'source-in'; cv.g.fillStyle = '#20113a'; cv.g.fillRect(0, 0, src.width, src.height);
    c = cv.c; shadows.set(src, c);
  }
  return c;
}
export function eclipseAI(e, dt) {
  if (common(e, dt)) return;
  const easy = G.diff.id === 'easy';                                      // Easy: longer pauses, smaller/slower volleys, short mirror, no meteors
  const P = G.P, b = LV.boss, dx = P.x + 4 - cxOf(e), R = G.diff.react * (e.enraged ? 0.7 : 1) * (easy ? 1.45 : 1);
  halfPhase(e, 'THE SHADOW DEEPENS');
  e.mirror = Math.max(0, (e.mirror || 0) - dt);
  e.walk = (e.walk || 0) + (dt * Math.abs(e.vx)) / 11;
  e.dir = Math.sign(dx) || 1;
  // keep a duelling distance, hop around in the low gravity
  const want = Math.abs(dx) < 70 ? -e.dir : Math.abs(dx) > 130 ? e.dir : 0;
  if (e.state !== 'cast') e.vx = want * 80;
  if (e.onGround && (e.hop = (e.hop ?? 1) - dt) <= 0) { e.vy = -230; e.hop = (easy ? 1.8 : 1) + Math.random() * 1.4; }
  if (e.x < b.arenaL + 8) e.x = b.arenaL + 8;
  if (e.x > b.arenaR - 16) e.x = b.arenaR - 16;
  switch (e.state) {
    case 'idle':
      if (e.timer <= 0 && !P.dead) {
        const r = Math.random();
        if (r < 0.45) { e.state = 'cast'; e.timer = 0.5; e.fired = 0; }
        else if (r < 0.65) { e.mirror = easy ? 0.9 : 1.4; e.timer = 1.6 * R; pop('MIRROR', cxOf(e) - 12, e.y - 12, '#b07cff'); sfx.shield(); }
        else if (r < 0.78) { blink(e); e.timer = 0.6 * R; }
        else if (r < 0.88 || !e.enraged) { e.vy = -160; later(0.55, () => { if (e.alive) { crescents(cxOf(e), e.y + e.h + 4, 70); G.shake = 0.25; sfx.boom(18); } }); e.timer = 1.4 * R; }
        else if (e.enraged && !easy) { meteorRain(); e.timer = 2 * R; }
        else { e.state = 'cast'; e.timer = 0.5; e.fired = 0; }
      }
      break;
    case 'cast': {                                                         // it copies your volley back at you
      e.vx = 0;
      const n = easy ? (e.enraged ? 3 : 2) : e.enraged ? 5 : 3, due = Math.floor((0.5 - e.timer) / 0.1);
      while (e.fired < due && e.fired < n) {
        const [vx, vy] = aimAt(cxOf(e), e.y + 9, easy ? 85 : 105, (e.fired - (n - 1) / 2) * 0.14);
        G.shots.push({ kind: 'dark', home: false, x: cxOf(e), y: e.y + 9, vx, vy, life: 3, friendly: false, dmg: 1 });
        e.fired++; sfx.orb();
      }
      if (e.timer <= 0) { e.state = 'idle'; e.timer = 1.1 * R; }
      break;
    }
  }
  if (!P.dead && overlap(P, e)) hurtPlayer(cxOf(e));
}
function blink(e) {
  const P = G.P, b = LV.boss, poof = () => burst(cxOf(e), cyOf(e), 16, ['#20113a', '#7b4dff', '#ffffff'], 60, 0, 0.5);
  poof();
  e.x = clamp(P.x - P.face * (G.diff.id === 'easy' ? 100 : 70), b.arenaL + 8, b.arenaR - 16);   // Easy: reappears further away
  e.y = groundBelow(e.x + 4, P.y - 40) - e.h;
  poof(); sfx.teleport();
}

/* ================= DRAW ================= */
export function drawBoss2(ctx, e, X, Y) {
  const white = e.flash > 0;
  if (e.type === 'organist') {
    const org = A.organSprite, floor = LV.rows * TILE - 2 * TILE;
    ctx.drawImage(org, X(LV.boss.arenaR - org.width), Y(floor - org.height));
    const set = A.organistPoses[e.pose || (Math.floor(e.anim * 2) % 2 ? 'play' : 'wide')] || A.organistPoses.play;
    const spr = set[(white ? 'w' : '') + (e.dir > 0 ? 'r' : 'l')];
    ctx.drawImage(spr, X(cxOf(e) - spr.width / 2), Y(cyOf(e) - spr.height / 2 + Math.sin(e.anim * 3) * 2));
    return;
  }
  if (e.type === 'widow') {
    const pm = perim();
    if (e.state === 'dropWind' || e.state === 'climb' || e.state === 'drop') {   // silk thread from the ceiling
      ctx.fillStyle = '#e6e2f0';
      for (let y = Y(pm.C); y < Y(e.y + 4); y += 2) ctx.fillRect(X(e.dropX ?? e.climbX ?? cxOf(e)), y, 1, 1);
    }
    if (e.state === 'dropWind' && Math.floor(G.t * 12) % 2) { ctx.fillStyle = RED; ctx.fillRect(X(e.dropX) - 10, Y(pm.F) - 2, 21, 1); ctx.fillRect(X(e.dropX), Y(pm.F) - 5, 1, 2); }
    const side = e.state === 'drop' || e.state === 'dazed' ? 0 : e.state === 'climb' ? 2 : e.side ?? 2;
    const set = A.widowSprites[Math.floor((e.legT || 0) * (e.state === 'dash' ? 14 : 7)) % 2][side];
    const spr = set[(white ? 'w' : '') + (e.dir > 0 ? 'r' : 'l')];
    ctx.drawImage(spr, X(cxOf(e)) - (spr.width >> 1), Y(cyOf(e)) - (spr.height >> 1));
    return;
  }
  // eclipse: a living shadow of whichever hero you play
  const ps = pose(e.onGround ? e : { ...e, onGround: false });
  const set = G.hero === 'skeleton' ? A.skeletonHero : A.wizard, base = set[ps.legs][e.dir > 0 ? 'r' : 'l'];
  const bx = X(e.x - 4), by = Y(e.y - 6);
  if (G.hero !== 'skeleton') { const sp = staffPos(e, 0); ctx.drawImage(shadowOf(A.staff), X(sp.x), Y(sp.y)); }
  ctx.drawImage(white ? set[ps.legs][e.dir > 0 ? 'wr' : 'wl'] : shadowOf(base), bx, by);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(bx + (e.dir > 0 ? 9 : 5), by + (G.hero === 'skeleton' ? 5 : 11), 1, 1); ctx.fillRect(bx + (e.dir > 0 ? 11 : 7), by + (G.hero === 'skeleton' ? 5 : 11), 1, 1);
  if (e.mirror > 0) ctx.drawImage(A.shieldFrames[Math.floor(G.t * 12) % 4], X(cxOf(e)) - 15, Y(cyOf(e)) - 15);
}
