// Boss fights: the Bone Warden (end of level 1) and — surprise — the Moon itself (end of level 2).
// Bosses live in G.enemies (so orbs, explosions and reflects just work); this module owns their AI,
// the arena gate, beams, death sequences and drawing.
import { W, H, TILE, clamp } from './gfx.js';
import { G, banner, later } from './state.js';
import { LV, solidTile, setTile, damageTile, groundBelow, WORLD_H, restoreColumns } from './world.js';
import { BEDROCK } from './level.js';
import { burst, gibs, smoke, pop, FIRE } from './fx.js';
import { sfx } from './audio.js';
import { hurtPlayer } from './combat.js';
import { makeEnemy } from './enemies.js';
import { spiral, crescents } from './patterns.js';
import * as A from './art.js';

const RED = '#ff5470';
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const cxOf = e => e.x + e.w / 2, cyOf = e => e.y + e.h / 2;

/* ================= ARENA ================= */
export const BOSS_INFO = {
  warden: { name: 'BONE WARDEN', music: 'boss' },
  moon: { name: 'THE MOON', music: 'moon' },
  organist: { name: 'THE DROWNED ORGANIST', music: 'organ' },
  widow: { name: 'THE BRASS WIDOW', music: 'clockboss' },
  eclipse: { name: 'ECLIPSE', music: 'eclipse' },
  stag: { name: 'THE ELDER STAG', music: 'stag' },
};
/** Is the player inside this level's arena trigger? */
export const inArena = P => { const t = LV.boss.trigger; return P.x > t.x0 && P.x < t.x1 && P.y > t.y0 && P.y < t.y1; };
function closeGate() {
  const b = LV.boss, g = b.gate;
  b.gateCells = [];
  for (let ty = g.y0; ty <= g.y1; ty++) for (let tx = g.x0; tx <= g.x1; tx++)
    if (!solidTile(tx, ty)) { setTile(tx, ty, BEDROCK); b.gateCells.push([tx, ty]); burst(tx * TILE + 8, ty * TILE + 8, 2, ['#8c89ab', '#aeabcb', '#ff5470'], 40, 100, 0.5); }
}
function openGate() {
  const b = LV.boss;
  for (const [tx, ty] of b.gateCells || []) setTile(tx, ty, 0);
  b.gateCells = [];
}

export const wakeBoss = e => wake(e);
function wake(e) {
  G.boss = e;
  closeGate();
  G.shake = 0.5;
  sfx.moonfall();
  if (e.type !== 'moon') {
    e.state = 'intro'; e.timer = 1.4;
    banner(BOSS_INFO[e.type].name, RED, 2);
  } else {
    // the background moon comes alive and drops into the arena
    G.moonAwake = true; G.flash = 0.25;
    e.x = G.cam.x + 200 - G.cam.x * 0.015 - e.w / 2; e.y = G.cam.y + 30 - e.h / 2;
    e.state = 'wake'; e.timer = 2.4;
    banner('THE MOON WAKES', RED, 2.4);
  }
}

/** Player died mid-fight: put the boss back to sleep so the fight restarts cleanly from the checkpoint. */
export function resetBoss() {
  const b = LV.boss, boss = G.enemies.find(x => x.boss);
  if (b && boss && boss.alive && boss.state !== 'dying')                   // the arena comes back whole — no scarred terrain on the retry
    restoreColumns(Math.floor(Math.min(b.arenaL, b.trigger.x0) / TILE) - 1, Math.floor(Math.max(b.arenaR, b.trigger.x1) / TILE) + 1);
  const e = G.boss;
  if (!e || !e.alive || e.state === 'dying') return;
  Object.assign(e, { hp: e.maxHp, state: 'sleep', x: e.spawnX, y: e.spawnY, vx: 0, vy: 0, phase: 1, timer: 0 });
  openGate();
  G.boss = null; G.moonAwake = false; G.beams = [];
  G.shots = G.shots.filter(s => s.friendly);
}

/* ================= DEATH ================= */
export function startBossDeath(e) {
  if (e.state === 'dying') return;
  e.state = 'dying'; e.timer = e.type === 'moon' ? 3.2 : 2.4; e.vx = 0; e.pop = 0;
  G.shots = G.shots.filter(s => s.friendly);
  G.beams = [];
  banner(e.type === 'moon' ? 'THE MOON SHATTERS' : `${BOSS_INFO[e.type].name.replace(/^THE /, '')} DEFEATED`, '#f0b541', 2.4);
  sfx.moonfall();
}
export function dyingUpdate(e, dt) {
  e.vx = 0; e.vy = 0; e.timer -= dt; e.pop -= dt; e.flash = (e.timer * 10) % 1 < 0.5 ? 0.05 : 0;
  G.shake = Math.max(G.shake, 0.12);
  if (e.pop <= 0) {
    e.pop = 0.16;
    const x = e.x + Math.random() * e.w, y = e.y + Math.random() * e.h;
    G.booms.push({ x, y, r: 14 + Math.random() * 10, t: 0 });
    sfx.boom(18);
    burst(x, y, 8, FIRE, 60, 100, 0.5);
  }
  if (e.timer > 0) return;
  e.alive = false;
  G.kills++;
  const cx = cxOf(e), cy = cyOf(e);
  G.booms.push({ x: cx, y: cy, r: 44, t: 0 });
  G.flash = 0.3; G.shake = 0.8; G.hitstop = 0.12;
  sfx.boom(44);
  const P = G.P;
  P.hp = P.maxHp;
  G.boss = null;
  openGate();
  if (e.type === 'moon') {
    gibs(cx, cy, ['#faf5e2', '#e9e0c2', '#cfc4a4', '#ff6a55'], 60);
    burst(cx, cy, 60, ['#ffffff', '#faf5e2', '#8fe8ff'], 160, 0, 1.6);
    later(1.6, () => { G.moonFreed = true; G.moonAwake = false; G.flash = 0.4; sfx.win(); });
    later(4.5, () => { G.mode = 'win'; G.wonAt = G.t; G.banner = null; });              // → the Moon's surface
  } else if (e.type === 'eclipse') {
    gibs(cx, cy, ['#241638', '#7b4dff', '#ffffff', '#b07cff'], 50);
    burst(cx, cy, 70, ['#ffffff', '#faf5e2', '#b07cff'], 180, 0, 1.6);
    later(3, () => { G.mode = 'victory'; G.wonAt = G.t; G.banner = null; sfx.win(); });
  } else {
    gibs(cx, cy, e.type === 'stag' ? ['#6e4a2e', '#e9dcb8', '#4f8a3a', '#9ff0c0', '#43291a'] : e.type === 'widow' ? ['#ffe29a', '#c08a3a', '#f3e6c4', '#3a2410'] : e.type === 'organist' ? ['#5f8f8c', '#9fcfc8', '#e9c86a', '#8fe8ff'] : ['#e8e2cf', '#a9a18c', '#6f6a8a', '#b83a45', '#f0b541'], 40);
    if (LV.portal) LV.portal.sealed = false;
    if (G.water) G.water.flood = 0;
    later(1.2, () => banner('THE PORTAL OPENS', '#8fe8ff', 2));
  }
}

/* ================= BONE WARDEN ================= */
export function wardenAI(e, dt) {
  const P = G.P, cx = cxOf(e), dx = P.x + 4 - cx, adx = Math.abs(dx), dy = P.y + 9 - cyOf(e);
  if (e.state === 'sleep') { e.vx = 0; if (!P.dead && inArena(P)) wake(e); return; }
  if (e.state === 'dying') { dyingUpdate(e, dt); return; }
  const enraged = e.hp < e.maxHp * 0.5, R = G.diff.react * (enraged ? 0.75 : 1);
  if (enraged && !e.enraged) { e.enraged = true; banner('THE WARDEN IS ENRAGED', RED, 1.6); G.shake = 0.4; }
  const face = () => { if (!P.dead) e.dir = Math.sign(dx) || e.dir; };
  e.timer -= dt;
  switch (e.state) {
    case 'intro':
      e.vx = 0; face();
      if (e.timer <= 0) idle(e, 0.6);
      break;
    case 'idle':
      face();
      e.vx = adx > 28 && e.onGround ? e.dir * (G.diff.bruteSpeed / 28) * (enraged ? 46 : 32) : 0;
      if (e.timer <= 0 && !P.dead) choose(e, adx, enraged, R);
      break;
    case 'raise':
      e.vx = 0;
      if (e.timer <= 0) { slam(e, enraged); e.state = 'recover'; e.timer = 0.55; }
      break;
    case 'brace':
      e.vx = 0;
      if (Math.random() < 0.5) burst(cx - e.dir * 8, e.y + e.h, 1, ['#8c89ab', '#aeabcb'], 30, 60, 0.3);
      if (e.timer <= 0) { e.state = 'charge'; e.chargeX = e.x; e.timer = 1.6; e.bumped = false; sfx.shriek(); }
      break;
    case 'charge':
      e.vx = e.dir * (enraged ? 260 : 230);
      if (Math.random() < 0.6) burst(cx - e.dir * 10, e.y + e.h - 2, 2, ['#8c89ab', '#aeabcb'], 40, 60, 0.3);
      if (e.bumped) {                                              // smashed into a wall → stunned, wall cracks
        const tx = Math.floor((e.dir > 0 ? e.x + e.w + 2 : e.x - 2) / TILE);
        for (let ty = Math.floor(e.y / TILE); ty <= Math.floor((e.y + e.h - 1) / TILE); ty++) damageTile(tx, ty, 3);
        G.shake = 0.45; sfx.boom(22);
        burst(cx + e.dir * 12, cyOf(e), 16, ['#aeabcb', '#8c89ab', '#ffffff'], 90, 300, 0.6);
        e.state = 'stunned'; e.timer = 1.8; e.vx = 0;
        pop('STUNNED!', cx - 16, e.y - 12, '#f0b541');
      } else if (Math.abs(e.x - e.chargeX) > 260 || e.timer <= 0) idle(e, 0.7 * R);
      break;
    case 'stunned':
      e.vx = 0;
      if (Math.random() < 0.3) G.parts.push({ x: cx + Math.sin(G.t * 8) * 8, y: e.y - 4, vx: 0, vy: -6, life: 0.4, max: 0.4, c: '#f0b541', g: 0, size: 1 });
      if (e.timer <= 0) idle(e, 0.5);
      break;
    case 'swipeWind':
      e.vx = 0;
      if (e.timer <= 0) {
        if (adx < 36 && Math.abs(dy) < 30 && Math.sign(dx) === e.dir) hurtPlayer(cx);
        burst(cx + e.dir * 24, e.y + 14, 12, ['#ffffff', '#e6fbff', '#c9c3ef'], 70, 0, 0.25);
        sfx.swing(); e.state = 'recover'; e.timer = 0.45;
      }
      break;
    case 'rainWind':
      e.vx = 0;
      if (e.timer <= 0) { boulderRain(enraged); e.state = 'recover'; e.timer = 0.7; }
      break;
    case 'recover':
      e.vx = 0;
      if (e.timer <= 0) idle(e, 0.9 * R);
      break;
  }
  e.bumped = false;
  if (e.state === 'charge' && !P.dead && overlap(P, e)) { hurtPlayer(cx); P.vx = e.dir * 260; P.vy = -220; }
}
const idle = (e, t) => { e.state = 'idle'; e.timer = t; };
function choose(e, adx, enraged, R) {
  const r = Math.random();
  if (adx < 44 && r < 0.55) { e.state = 'swipeWind'; e.timer = 0.45 * R; e.mark = { ch: '!', t: 0.5 }; }
  else if (enraged && r < 0.4) { e.state = 'rainWind'; e.timer = 0.75; e.mark = { ch: '!', t: 0.7 }; sfx.hex(); }
  else if (r < 0.7) { e.state = 'raise'; e.timer = 0.75 * R; e.mark = { ch: '!', t: 0.7 }; sfx.alert(); }
  else { e.state = 'brace'; e.timer = 0.65 * R; e.mark = { ch: '!', t: 0.7 }; sfx.alert(); }
}
function slam(e, enraged) {
  const cx = cxOf(e), gy = e.y + e.h;
  for (const d of [-1, 1]) G.shots.push({ kind: 'wave', x: cx + d * 14, y: gy - 4, vx: d * (enraged ? 135 : 115), vy: 0, life: 3.2, friendly: false, dmg: 1 });
  if (enraged) later(0.35, () => { for (const d of [-1, 1]) G.shots.push({ kind: 'wave', x: cx + d * 14, y: gy - 4, vx: d * 90, vy: 0, life: 3.6, friendly: false, dmg: 1 }); });
  G.shake = 0.4; sfx.boom(28);
  burst(cx + e.dir * 20, gy - 2, 18, ['#aeabcb', '#8c89ab', '#e8e2cf'], 90, 400, 0.6, { size: 2, bounce: true });
}
/** Boulders: few, big and slow, each marked on the floor long before it lands — one aimed at you, the rest spread out. */
function boulderRain(enraged) {
  const b = LV.boss, n = enraged ? 4 : 3, lo = b.arenaL + 16, hi = b.arenaR - 16;
  const xs = [clamp(G.P.x + 4, lo, hi)];
  for (let tries = 0; xs.length < n && tries < 60; tries++) {
    const x = lo + Math.random() * (hi - lo);
    if (xs.every(o => Math.abs(o - x) > 44)) xs.push(x);
  }
  xs.forEach((x, i) => G.shots.push({ kind: 'boulder', x, y: G.cam.y - 40 - i * 55, vx: 0, vy: 40, g: 240, vmax: 170, life: 6, friendly: false, dmg: 1, r: 6, warnY: groundBelow(x, G.cam.y) }));
  sfx.boom(18);
}

/* ================= THE MOON ================= */
const approach = (e, tx, ty, dt, k) => { e.x += (tx - e.w / 2 - e.x) * Math.min(1, dt * k); e.y += (ty - e.h / 2 - e.y) * Math.min(1, dt * k); };

export function moonAI(e, dt) {
  const P = G.P, b = LV.boss, cx = cxOf(e), cy = cyOf(e);
  if (e.state === 'sleep') { if (!P.dead && inArena(P)) wake(e); return; }
  if (e.state === 'dying') { dyingUpdate(e, dt); return; }
  e.anim = (e.anim || 0) + dt;
  const phase = e.hp < e.maxHp * 0.25 ? 3 : e.hp < e.maxHp * 0.55 ? 2 : 1;
  if (phase !== (e.phase || 1)) {
    e.phase = phase; G.shake = 0.5; sfx.moonfall();
    banner(phase === 2 ? 'BLOOD MOON' : 'IT IS CRACKING!', RED, 1.6);
  }
  const R = G.diff.react * (phase === 3 ? 0.88 : phase === 2 ? 0.95 : 1);   // later phases add attacks, not bullet spam
  const hoverX = clamp(P.x + 4 + Math.sin(e.anim * 0.6) * 70, b.arenaL + 30, b.arenaR - 30);   // stalks you across the summit
  const hoverY = b.hoverY + Math.sin(e.anim * 1.3) * 8;
  e.timer -= dt; e.mouth = Math.max(0, (e.mouth || 0) - dt);
  switch (e.state) {
    case 'wake':
      approach(e, hoverX, hoverY, dt, 1.1);
      if (e.timer <= 0) { e.state = 'float'; e.timer = 1; }
      break;
    case 'float':
      approach(e, hoverX, hoverY, dt, 1.6);
      if (e.timer <= 0 && !P.dead) chooseMoon(e, phase, R);
      break;
    case 'rocksWind':
      approach(e, hoverX, hoverY, dt, 0.8); e.mouth = 0.3;
      if (e.timer <= 0) { spitRocks(e, phase); e.state = 'float'; e.timer = 1.6 * R; }
      break;
    case 'spiralWind':                                                    // moonstones unwind slowly from the mouth
      approach(e, hoverX, hoverY, dt, 0.6); e.mouth = 0.3;
      if (e.timer <= 0) { spiral(cx, cy + 6, { arms: 3, per: phase === 1 ? 4 : 5, speed: 34, spin: 0.6, gap: 0.22 }); e.state = 'float'; e.timer = 2.2 * R; }
      break;
    case 'diveWind':
      e.x += Math.sin(G.t * 60) * 0.6;
      if (e.timer <= 0) { e.state = 'dive'; e.diveTo = { x: P.x + 4, y: groundBelow(P.x + 4, P.y) - e.h / 2 - 2 }; sfx.shriek(); }
      break;
    case 'dive': {
      const tx = e.diveTo.x - e.w / 2, ty = e.diveTo.y - e.h / 2, ddx = tx - e.x, ddy = ty - e.y, d = Math.hypot(ddx, ddy), sp = 300 * dt;
      if (d <= sp || solidTile(Math.floor(cx / TILE), Math.floor((e.y + e.h + 2) / TILE))) {
        G.booms.push({ x: cx, y: e.y + e.h, r: 30, t: 0 });
        G.shake = 0.6; sfx.boom(30);
        for (let ty2 = Math.floor((e.y + e.h) / TILE); ty2 <= Math.floor((e.y + e.h) / TILE) + 1; ty2++)
          for (let tx2 = Math.floor(e.x / TILE); tx2 <= Math.floor((e.x + e.w) / TILE); tx2++) damageTile(tx2, ty2, 2);
        if (!P.dead && Math.hypot(P.x + 4 - cx, P.y + 9 - (e.y + e.h)) < 40) { hurtPlayer(cx); P.vx = Math.sign(P.x + 4 - cx || 1) * 220; P.vy = -240; }
        crescents(cx, e.y + e.h + 4, phase === 1 ? 65 : 80);
        e.state = 'dazed'; e.timer = 2.2;
        pop('DAZED!', cx - 12, e.y - 10, '#f0b541');
      } else { e.x += (ddx / d) * sp; e.y += (ddy / d) * sp; }
      break;
    }
    case 'dazed':
      if (Math.random() < 0.3) G.parts.push({ x: cx + Math.sin(G.t * 8) * 14, y: e.y - 3, vx: 0, vy: -6, life: 0.4, max: 0.4, c: '#f0b541', g: 0, size: 1 });
      if (e.timer <= 0) { e.state = 'float'; e.timer = 1.4 * R; }
      break;
  }
  if ((e.state === 'dive' || e.state === 'diveWind') && !P.dead && overlap(P, e)) hurtPlayer(cx);
}
function chooseMoon(e, phase, R) {
  const r = Math.random();
  if (phase >= 2 && r < 0.18 && G.enemies.filter(b => b.alive && b.type === 'bat').length < 3) {   // call the night's creatures (a few at a time)
    for (let i = 0; i < 3; i++) G.enemies.push(makeEnemy({ type: 'bat', cx: cxOf(e) + (i - 1) * 20, cy: cyOf(e) + 10 }));
    burst(cxOf(e), cyOf(e), 20, ['#4a3670', '#ff4d6d'], 70, 0, 0.6);
    e.mouth = 0.6; e.timer = 1.2 * R; sfx.shriek();
    return;
  }
  const busy = G.shots.filter(s => !s.friendly && !s.dead).length > 12;  // screen already full? dive instead of adding more
  if (busy) { e.state = 'diveWind'; e.timer = 0.8 * R; return; }
  if (phase === 3 && r < 0.3) { meteorRain(); e.mouth = 0.8; e.timer = 2.4 * R; return; }
  if (r < 0.62) { e.state = 'rocksWind'; e.timer = 0.6 * R; }
  else if (r < 0.84) { e.state = 'spiralWind'; e.timer = 0.7 * R; sfx.hex(); }
  else { e.state = 'diveWind'; e.timer = 0.7 * R; }
}
function spitRocks(e, phase) {
  const P = G.P, cx = cxOf(e), cy = cyOf(e) + 8, n = 5;
  const a0 = Math.atan2(P.y + 9 - cy, P.x + 4 - cx);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i - (n - 1) / 2) * 0.26, sp = 80 + Math.random() * 10;
    G.shots.push({ kind: 'rock', x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, g: 110, vmax: 120, life: 4, friendly: false, dmg: 1 });
  }
  e.mouth = 0.5; sfx.bow();
}
export function meteorRain() {
  const b = LV.boss;
  banner('MOONFALL... REVERSED', RED, 1.4);
  for (let i = 0; i < 4; i++) later(0.4 + i * 0.4, () => {
    const tx = clamp(G.P.x + (Math.random() - 0.5) * 160, b.arenaL + 16, b.arenaR - 16), sx = tx - 60;
    const ty = groundBelow(tx, G.cam.y), sy = G.cam.y - 30, d = Math.hypot(tx - sx, ty - sy);
    G.shots.push({ kind: 'meteor', x: sx, y: sy, vx: ((tx - sx) / d) * 150, vy: ((ty - sy) / d) * 150, life: 5, friendly: false, dmg: 1, warnX: tx, warnY: ty });
  });
}

/** Beams: short-lived columns of moonlight. */
export function updateBeams(dt) {
  const P = G.P;
  for (const bm of G.beams) {
    bm.t += dt;
    if (!bm.hit && bm.t < 0.4 && !P.dead && Math.abs(P.x + 4 - bm.x) < 8 && P.y + P.h > bm.top && P.y < (bm.bottom ?? 1e9)) { bm.hit = true; hurtPlayer(bm.x); }
  }
  G.beams = G.beams.filter(bm => bm.t < 0.5);
}

/* ================= DRAW ================= */
export function drawBoss(ctx, e, X, Y) {
  if (e.state === 'sleep' && e.type === 'moon') return;                 // still just a moon in the sky
  const side = e.dir > 0 ? 'r' : 'l', white = e.flash > 0 ? 'w' : '';
  if (e.type === 'warden') {
    const walking = Math.abs(e.vx) > 4;
    const pose = { raise: 'raise', recover: e.timer > 0.3 ? 'slam' : 'stand', brace: 'brace', charge: 'charge', swipeWind: e.timer < 0.12 ? 'swipe' : 'raise', rainWind: 'raise', stunned: 'stunned', sleep: 'stand', intro: 'raise' }[e.state]
      || (walking ? (Math.floor(e.t * 5) % 2 ? 'walk1' : 'walk2') : 'stand');
    const spr = A.wardenPoses[pose][white + side];
    ctx.drawImage(spr, X(cxOf(e) - A.WARDEN_W / 2), Y(e.y + e.h - A.WARDEN_H));
    if (e.enraged && e.state !== 'stunned' && Math.random() < 0.5)
      G.parts.push({ x: cxOf(e) + e.dir * 2 + (Math.random() - 0.5) * 6, y: e.y + e.h - A.WARDEN_H + 16, vx: 0, vy: -20, life: 0.3, max: 0.3, c: '#ffcc4d', g: 0, size: 1 });
    return;
  }
  // --- the Moon
  const blood = (e.phase || 1) >= 2, body = (blood ? A.moonBoss.blood : A.moonBoss.silver)[white ? 'wr' : 'r'];
  const shake = e.state === 'diveWind' || e.state === 'dying' ? Math.round(Math.sin(G.t * 70)) : 0;
  const ox = X(cxOf(e)) - A.MOONB_R + shake, oy = Y(cyOf(e)) - A.MOONB_R;
  ctx.drawImage(body, ox, oy);
  const hurt = 1 - e.hp / e.maxHp;
  if (hurt > 0.2) ctx.drawImage(A.moonCracks[hurt > 0.75 ? 2 : hurt > 0.45 ? 1 : 0], ox, oy);
  if (white) return;
  drawMoonFace(ctx, ox + A.MOONB_R, oy + A.MOONB_R, e);
}

function drawMoonFace(ctx, fx, fy, e) {
  const P = G.P, angry = e.state !== 'wake' || e.timer < 1.2, dazed = e.state === 'dazed';
  const dark = '#2a0a18';
  for (const s of [-1, 1]) {
    const ex = fx + s * 7 - 3, ey = fy - 6;
    if (dazed) { ctx.fillStyle = dark; ctx.fillRect(ex, ey + 2, 6, 1); ctx.fillRect(ex + 1, ey + 1, 1, 3); ctx.fillRect(ex + 4, ey + 1, 1, 3); continue; }
    ctx.fillStyle = dark; ctx.fillRect(ex - 1, ey - 1, 8, 6);
    ctx.fillStyle = '#fff4e0'; ctx.fillRect(ex, ey, 6, 4);
    const lx = clamp(Math.round((P.x + 4 - (fx + G.cam.x)) / 40), -2, 2), ly = clamp(Math.round((P.y - (fy + G.cam.y)) / 50), -1, 1);
    ctx.fillStyle = (e.phase || 1) >= 2 ? '#ff2a4a' : '#b82b52';
    ctx.fillRect(ex + 2 + lx, ey + 1 + ly, 2, 2);
    if (angry) {                                                          // furious brows
      ctx.fillStyle = dark;
      for (let i = 0; i < 7; i++) ctx.fillRect(ex - 1 + i, ey - 3 + (s > 0 ? Math.floor(i / 2.5) : 2 - Math.floor(i / 2.5)), 1, 1);
    }
  }
  const open = e.mouth > 0 || e.state === 'diveWind' || e.state === 'dying';
  if (open) {
    ctx.fillStyle = dark; ctx.fillRect(fx - 6, fy + 5, 12, 7);
    ctx.fillStyle = '#6a1a2a'; ctx.fillRect(fx - 4, fy + 8, 8, 3);
    ctx.fillStyle = '#fff4e0'; for (let i = -5; i <= 4; i += 3) ctx.fillRect(fx + i, fy + 5, 2, 2);
  } else {
    ctx.fillStyle = dark;
    for (let i = -6; i <= 5; i++) ctx.fillRect(fx + i, fy + 7 + (i & 1), 1, 1);
  }
}

/** The freed moon in the sky wears a sleepy smile. */
export function drawFreedFace(ctx, x, y) {
  ctx.fillStyle = '#6a5a4a';
  for (const s of [-1, 1]) { ctx.fillRect(x + s * 5 - 2, y - 3, 1, 1); ctx.fillRect(x + s * 5 - 1, y - 4, 2, 1); ctx.fillRect(x + s * 5 + 1, y - 3, 1, 1); }
  ctx.fillRect(x - 3, y + 3, 1, 1); ctx.fillRect(x - 2, y + 4, 4, 1); ctx.fillRect(x + 2, y + 3, 1, 1);
  ctx.fillStyle = '#ff9aa8'; ctx.fillRect(x - 8, y + 1, 2, 1); ctx.fillRect(x + 6, y + 1, 2, 1);
}

export function drawBeams(ctx, X, Y) {
  for (const bm of G.beams) {
    const w = bm.t < 0.08 ? 14 : Math.max(2, 12 - bm.t * 20), x = X(bm.x), top = Y(bm.top), bot = bm.bottom != null ? Y(bm.bottom) : H + 40;
    const geyser = bm.kind === 'geyser';
    ctx.fillStyle = geyser ? '#4fc8d8' : '#ffe9c0'; ctx.fillRect(x - (w >> 1), top, w, bot - top);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - (w >> 2), top, Math.max(1, w >> 1), bot - top);
    if (geyser) { ctx.fillStyle = '#bff0f6'; for (let i = 0; i < 6; i++) ctx.fillRect(x - 6 + ((i * 5 + (G.t * 60 | 0)) % 13), top - 2 - (i % 3) * 2, 2, 2); }
  }
}

export function drawTelegraphs(ctx, X, Y) {
  const e = G.boss;
  for (const s of G.shots) {                                              // ground markers for falling hazards
    const wy = s.warnY, wx = s.warnX ?? s.x;
    if (wy == null || s.friendly || !(s.kind === 'bone' || s.kind === 'meteor' || s.kind === 'boulder') || Math.floor(G.t * 12) % 2) continue;
    ctx.fillStyle = RED;
    if (s.kind === 'boulder') { const w = 9 + Math.round(6 * Math.min(1, Math.max(0, 1 - (wy - s.y) / 160))); ctx.fillRect(X(wx) - w, Y(wy) - 2, w * 2 + 1, 1); ctx.fillRect(X(wx) - 1, Y(wy) - 6, 3, 3); continue; }   // a wide mark that grows as the rock nears
    ctx.fillRect(X(wx) - 3, Y(wy) - 2, 7, 1); ctx.fillRect(X(wx), Y(wy) - 5, 1, 2);
  }
}
