// The Monkey's toys: banana peels, grabbed-and-thrown enemies, and the TROOP (R): three monkeys that trail
// your exact path, throw every banana with you, pile onto whatever you YOINK — and jump in front of hits meant for you.
import { G, GRAV, MAX_FALL, later, hint } from './state.js';
import { LV, move, groundBelow, WORLD_H, damageTile } from './world.js';
import { burst, pop } from './fx.js';
import { sfx } from './audio.js';
import { damageEnemy, killEnemy, finish } from './combat.js';
import * as A from './art.js';

const cx = e => e.x + e.w / 2, cy = e => e.y + e.h / 2;
const FUR = ['#8a5a34', '#b07a48', '#e8c090'], YEL = ['#ffe14d', '#fff4c9', '#c9a820'];
export const BANANA_G = 450;

export function resetMonkey() { G.peels = []; G.monkeys = []; }

/** A banana that lands on a floor leaves a peel; foes that step on it go flying. */
export function dropPeel(x, y) {
  G.peels.push({ x: x - 5, y: groundBelow(x, y - 6) - 4, t: 12 });
  if (G.peels.length > 6) G.peels.shift();
}

/** Aimed banana arc from (x,y) onto a target point. */
export function lobBanana(x, y, tx, ty, friendly = true) {
  const T = Math.max(0.35, Math.min(0.9, Math.abs(tx - x) / 200));
  G.shots.push({ kind: 'banana', x, y, vx: (tx - x) / T, vy: (ty - y) / T - 0.5 * BANANA_G * T, g: BANANA_G, life: 2.5, friendly, dmg: 1.5 });
}

/* ================= E: YOINK ================= */
/** Grab the nearest foe (or barrel) within reach — flyers too; only bosses get a punch instead. Returns false if nothing is close. */
export function yoink(P) {
  let best = null, bd = 44;
  for (const e of G.enemies) {
    if (!e.alive || e.thrown || (e.boss && e.state === 'sleep')) continue;
    const d = Math.hypot(cx(e) - P.x - P.w / 2, cy(e) - P.y - P.h / 2);
    if (d < bd) { bd = d; best = e; }
  }
  if (!best) return false;
  troopBonk(best);                                                         // the troop piles on
  if (best.boss || best.heavy) {                                          // too big to lift (bosses, walking trees): monkey punch
    damageEnemy(best, 4, P.x + P.w / 2, 'boom');
    burst(cx(best), cy(best), 10, ['#ffffff', '#ffe14d'], 70, 0, 0.3);
    pop('POW!', cx(best) - 8, best.y - 10, '#ffe14d'); sfx.stomp(); G.shake = 0.2;
    return true;
  }
  P.carry = best; P.carryT = 0.3;
  best.wasFlying = best.flying; best.flying = false; best.stun = 99; best.carried = true;   // flyers fall like anything else while held/thrown
  pop('YOINK!', P.x - 10, P.y - 14, '#ffe14d'); sfx.shriek();
  return true;
}

/** While carried the foe sits above the monkey's head; then it's hurled. */
export function updateCarry(P, dt) {
  const e = P.carry;
  if (!e) return;
  if (!e.alive || P.dead) {                                                // dropped (you died): let it go instead of leaving it frozen mid-air
    P.carry = null; e.carried = false; e.stun = 0.5;
    if (e.wasFlying) { e.flying = true; e.wasFlying = false; e.home = e.x; e.homeY = e.y; e.baseY = e.y; e.ax = cx(e); e.ay = cy(e); }
    return;
  }
  e.x = P.x + P.w / 2 - e.w / 2; e.y = P.y - e.h - 1; e.vx = 0; e.vy = 0;
  if ((P.carryT -= dt) > 0) return;
  e.carried = false; e.thrown = { t: 1.6, hit: new Set(), dir: P.face }; e.stun = 1.6;
  e.vx = P.face * 270; e.vy = -140;
  P.carry = null; P.throwT = 0.2;
  sfx.orb(); G.shake = 0.1;
}

function impact(e) {
  const dir = e.thrown.dir, intoWall = e.vx === 0 && !e.onGround;
  e.thrown = null;
  if (intoWall) {                                                          // a foe hurled into a wall smashes it: wood breaks, stone cracks (2 throws)
    const tx = Math.floor((cx(e) + dir * (e.w / 2 + 3)) / 16);
    for (let ty = Math.floor((e.y - 4) / 16); ty <= Math.floor((e.y + e.h + 14) / 16); ty++) damageTile(tx, ty, 2.5);   // a body-sized hole down to the floor, even from a small foe
  }
  if (e.wasFlying) {                                                       // a thrown flyer shakes it off and hovers again from where it landed
    e.flying = true; e.wasFlying = false;
    e.home = e.x; e.homeY = e.y - 6; e.baseY = e.y - 6; e.ax = cx(e); e.ay = cy(e) - 6;
  }
  G.shake = Math.max(G.shake, 0.2); sfx.stomp();
  burst(cx(e), cy(e), 12, ['#aeabcb', '#ffffff', '#ffe14d'], 80, 300, 0.5);
  if (e.type === 'barrel' || e.type === 'bomber') killEnemy(e);            // thrown explosives go off
  else damageEnemy(e, 4, cx(e) - e.vx, 'boom');
}

/* ================= R: THE TROOP ================= */
export const TROOP = 3, GAP = 13, ENTER = 0.45;
const troop = () => G.monkeys.filter(m => !m.leaving);
const CONTACT_SAFE = new Set(['barrel']);

/** R: call the troop (tops it back up to three). Returns false when it is already full. */
export function callTroop(P) {
  const missing = TROOP - troop().length;
  if (missing <= 0) return false;
  for (let i = 0; i < missing; i++)                                        // staggered drop-ins (no timers: G.monkeys is re-filtered every frame)
    G.monkeys.push({ x: P.x, y: G.cam.y - 20, w: 8, h: 14, sx: P.x, sy: G.cam.y - 20, enter: ENTER + i * 0.15, face: P.face, walk: 0, throwT: 0, bonk: 0, leaving: false, t: 0 });
  sfx.shriek();
  pop('OOK OOK!', P.x - 12, P.y - 14, '#ffe14d'); G.shake = Math.max(G.shake, 0.15);
  if (!G.seenTroop) { G.seenTroop = true; hint('TROOP: THEY TRAIL YOU, THROW WITH YOU, TAKE HITS', 4); }
  return true;
}

/** Every banana you throw, the troop throws too — same direction, from wherever each of them is. */
export function troopThrow(P) {
  for (const m of troop()) {
    if (m.enter > 0) continue;
    m.throwT = 0.15;
    G.shots.push({ kind: 'banana', x: m.x + 4 + P.face * 6, y: m.y + 5, vx: P.face * 290, vy: -30, g: 140, life: 1.4, friendly: true, dmg: 1, troop: true });
  }
}

/** YOINK: each monkey gets a smack in on the grabbed foe. */
function troopBonk(e) {
  troop().forEach((m, k) => {
    if (m.enter > 0) return;
    later(0.05 + k * 0.08, () => {
      if (m.leaving || !e.alive) return;
      m.bonk = 0.2; damageEnemy(e, 1, m.x + 4, 'boom');
      burst(cx(e), cy(e), 5, ['#ffffff', '#ffe14d'], 50, 0, 0.25); sfx.stomp();
      if (k === 0) pop('BONK!', cx(e) - 10, e.y - 12, '#ffe14d');
    });
  });
}

/** A hit meant for you: the monkey right behind you takes it instead. Called from hurtPlayer. */
export function troopTakesHit(P, fromX) {
  const m = troop().find(q => q.enter <= 0);
  if (!m) return false;
  loseMonkey(m, Math.sign(P.x + 4 - fromX) || -P.face);
  m.x = P.x; m.y = P.y + P.h - m.h;                                        // it leaps into the blow
  P.inv = G.duel ? 0.35 : 0.8;
  pop('OOK!', P.x - 6, P.y - 14, '#ffe14d');
  return true;
}

function loseMonkey(m, dir) {
  m.leaving = true; m.vx = dir * 110; m.vy = -260; m.t = 0;
  burst(m.x + 4, m.y + 7, 10, FUR, 60, 200, 0.4); sfx.shriek();
}

/** Point `dist` px back along the path you walked (the troop walks exactly where you did). */
function pathPoint(path, dist) {
  for (let i = path.length - 1; i > 0; i--) {
    const a = path[i], b = path[i - 1], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (dist <= d) { const k = dist / d; return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dx: a.x - b.x }; }
    dist -= d;
  }
  const o = path[0]; return { x: o.x, y: o.y, dx: 0 };
}

function updateTroop(P, dt) {
  const path = (P.path = P.path || [{ x: P.x, y: P.y }]), last = path[path.length - 1];
  if (Math.hypot(P.x - last.x, P.y - last.y) >= 1) { path.push({ x: P.x, y: P.y }); if (path.length > 240) path.shift(); }
  let k = 0;
  for (const m of G.monkeys) {
    m.throwT -= dt; m.bonk -= dt; m.t += dt;
    if (m.leaving) { m.vy += GRAV * (LV.grav || 1) * dt; m.x += m.vx * dt; m.y += m.vy * dt; continue; }
    if (P.dead) { loseMonkey(m, m.face); continue; }
    const pt = pathPoint(path, (k + 1) * GAP), tx = pt.x, ty = pt.y + P.h - m.h, px = m.x;
    if (m.enter > 0) {                                                     // swings down on a vine into its place in line
      m.enter -= dt; const e = 1 - Math.min(1, Math.max(0, m.enter) / ENTER);
      m.x = m.sx + (tx - m.sx) * e; m.y = m.sy + (ty - m.sy) * e * e;
    } else { m.x = tx; m.y = ty; }
    if (Math.abs(pt.dx) > 0.2) m.face = Math.sign(pt.dx);
    if (m.throwT > 0) m.face = P.face;
    m.walk += Math.abs(m.x - px) / 6;
    k++;
    if (m.enter > 0) continue;
    // danger they walk into is theirs to take
    for (const s of G.shots) {
      if (s.dead || s.friendly || s.x < m.x - 2 || s.x > m.x + m.w + 2 || s.y < m.y - 2 || s.y > m.y + m.h + 2) continue;
      finish(s); loseMonkey(m, Math.sign(m.x + 4 - s.x) || -m.face); break;
    }
    if (m.leaving) continue;
    for (const e of G.enemies) {
      if (!e.alive || e.fighter || CONTACT_SAFE.has(e.type) || e.carried || e.thrown || e.stun > 0 || (e.boss && e.state === 'sleep')) continue;
      if (e.x > m.x + m.w || e.x + e.w < m.x || e.y > m.y + m.h || e.y + e.h < m.y) continue;
      loseMonkey(m, Math.sign(m.x + 4 - cx(e)) || -m.face); break;
    }
  }
  G.monkeys = G.monkeys.filter(m => !(m.leaving && (m.t > 1.4 || m.y > G.cam.y + 200)));
}

export function updateMonkeyStuff(dt) {
  const P = G.P;
  // peels
  for (const p of G.peels) {
    p.t -= dt;
    for (const e of G.enemies) {
      if (!e.alive || e.flying || e.boss || e.type === 'barrel' || e.thrown || e.carried) continue;
      if (e.x + e.w < p.x || e.x > p.x + 10 || e.y + e.h < p.y - 2 || e.y + e.h > p.y + 8) continue;
      e.stun = 1.4; e.vy = -240; e.vx = (e.vx >= 0 ? 1 : -1) * 70; p.t = 0;
      damageEnemy(e, 1, p.x + 5, 'boom');
      pop('SLIP!', p.x - 4, p.y - 12, '#ffe14d'); sfx.pop();
      break;
    }
  }
  const rival = G.enemies[0] && G.enemies[0].fighter;                     // duel: the rival slips on your peels too
  if (rival && !rival.P.dead && rival.P.onGround && !(rival.P.dash > 0)) for (const p of G.peels) {
    const R = rival.P;
    if (p.t <= 0 || R.x + R.w < p.x || R.x > p.x + 10 || Math.abs(R.y + R.h - (p.y + 4)) > 6) continue;
    p.t = 0; R.vy = -240; R.vx = (R.vx >= 0 ? 1 : -1) * 90;
    damageEnemy(rival.proxy, 1, p.x + 5, 'boom');
    pop('SLIP!', p.x - 4, p.y - 12, '#ffe14d'); sfx.pop();
  }
  G.peels = G.peels.filter(p => p.t > 0);
  // thrown foes bowl into others, then smack into whatever stops them
  for (const e of G.enemies) {
    if (!e.alive || !e.thrown) continue;
    e.thrown.t -= dt;
    for (const o of G.enemies) {
      if (o === e || !o.alive || e.thrown.hit.has(o) || o.x > e.x + e.w || o.x + o.w < e.x || o.y > e.y + e.h || o.y + o.h < e.y) continue;
      e.thrown.hit.add(o); damageEnemy(o, 4, cx(e), 'boom');
      if (!o.boss && !o.flying) { o.vx = Math.sign(e.vx || 1) * 200; o.vy = -200; o.stun = 0.8; }
      burst(cx(o), cy(o), 8, ['#ffffff', '#ffe14d'], 60, 0, 0.3); sfx.stomp();
    }
    if (e.onGround || e.vx === 0 || e.thrown.t <= 0) impact(e);
  }
  updateTroop(P, dt);
}

export function drawMonkeyStuff(ctx, X, Y) {
  for (const p of G.peels) if (p.t > 2 || Math.floor(p.t * 8) % 2) ctx.drawImage(A.peelSprite, X(p.x), Y(p.y));
  for (const m of G.monkeys) {
    if (m.enter > 0) { ctx.fillStyle = '#3f7a3a'; for (let y = 0; y < Y(m.y); y += 3) ctx.fillRect(X(m.x + 4), y, 1, 2); }   // the vine it swings in on
    const moving = !m.leaving && m.enter <= 0 && Math.floor(m.walk) % 2;
    const f = A.monkeyAlly[m.leaving || m.throwT > 0 || m.bonk > 0 ? 1 : moving ? 1 : 0][m.face > 0 ? 'r' : 'l'];
    ctx.drawImage(f, X(m.x - 2), Y(m.y - 2) - (m.bonk > 0 ? 2 : 0));
  }
}
