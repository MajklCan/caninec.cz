// The Elder Stag — guardian of Hollow Grove. A ground boss: every attack has a clear tell.
//   brace (paws the ground)  → CHARGE across the clearing; slams into a wall = stunned (double damage)
//   shake (antlers rattle)   → ACORN RAIN: big acorns fall on marked spots, one on you
//   crouch                   → LEAP at you, landing sends ripples both ways
// Below half health it's ENRAGED: faster, charges twice, and every landing cracks the canopy ledges.
import { TILE } from './gfx.js';
import { G, banner } from './state.js';
import { LV, damageTile, WORLD_H } from './world.js';
import { WOOD } from './level.js';
import { burst, pop } from './fx.js';
import { sfx } from './audio.js';
import { hurtPlayer } from './combat.js';
import { inArena, wakeBoss, dyingUpdate } from './boss.js';
import * as A from './art.js';

const RED = '#ff5470', DUST = ['#8a5e38', '#5e3e24', '#6ea84a', '#a8d86a'];
const cxOf = e => e.x + e.w / 2;
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function stagAI(e, dt) {
  const P = G.P, cx = cxOf(e), dx = P.x + 4 - cx, adx = Math.abs(dx);
  if (e.state === 'sleep') { e.vx = 0; if (!P.dead && inArena(P)) { wakeBoss(e); sfx.shriek(); } return; }
  if (e.state === 'dying') { dyingUpdate(e, dt); return; }
  const enraged = e.hp < e.maxHp * 0.5, R = G.diff.react * (enraged ? 0.75 : 1);
  if (enraged && !e.enraged) { e.enraged = true; banner('THE STAG IS ENRAGED', RED, 1.6); G.shake = 0.5; sfx.moonfall(); }
  const face = () => { if (!P.dead) e.dir = Math.sign(dx) || e.dir; };
  e.timer -= dt;
  switch (e.state) {
    case 'intro':
      e.vx = 0; face();
      if (e.timer <= 0) idle(e, 0.8);
      break;
    case 'idle': {
      face();
      const want = adx > 110 ? 1 : adx < 60 ? -0.6 : 0;                     // keep a charging distance
      e.vx = e.onGround ? e.dir * want * (enraged ? 60 : 44) : e.vx;
      if (e.timer <= 0 && !P.dead) choose(e, adx, enraged, R);
      break;
    }
    case 'brace':
      e.vx = 0;
      if (Math.random() < 0.5) burst(cx - e.dir * 14, e.y + e.h, 1, DUST, 40, 80, 0.4);
      if (e.timer <= 0) { e.state = 'charge'; e.chargeX = e.x; e.timer = 1.8; e.bumped = false; sfx.shriek(); }
      break;
    case 'charge':
      e.vx = e.dir * (enraged ? 290 : 250);
      if (Math.random() < 0.7) burst(cx - e.dir * 14, e.y + e.h - 2, 2, DUST, 50, 60, 0.4);
      if (e.bumped) {                                                        // antlers into a wall: stuck and dazed
        G.shake = 0.5; sfx.boom(24);
        burst(cx + e.dir * 20, e.y + 8, 18, ['#e9dcb8', '#8a5e38', '#ffffff'], 90, 300, 0.6);
        e.state = 'stunned'; e.timer = 2; e.vx = 0; e.again = false;
        pop('STUCK!', cx - 12, e.y - 14, '#f0b541');
      } else if (Math.abs(e.x - e.chargeX) > 300 || e.timer <= 0) {
        if (enraged && e.again) { e.again = false; e.dir = -e.dir; e.state = 'brace'; e.timer = 0.4; e.mark = { ch: '!', t: 0.4 }; }   // wheels round for a second pass
        else idle(e, 0.8 * R);
      }
      break;
    case 'stunned':
      e.vx = 0;
      if (Math.random() < 0.3) G.parts.push({ x: cx + Math.sin(G.t * 8) * 10, y: e.y - 6, vx: 0, vy: -6, life: 0.4, max: 0.4, c: '#f0b541', g: 0, size: 1 });
      if (e.timer <= 0) idle(e, 0.6);
      break;
    case 'shake':
      e.vx = 0;
      if (Math.random() < 0.4) burst(cx + e.dir * 10, e.y - 10, 1, ['#6ea84a', '#a8d86a', '#e0a458'], 40, 60, 0.6);
      if (e.timer <= 0) { acornRain(e, enraged); e.state = 'recover'; e.timer = 0.9; }
      break;
    case 'crouch':
      e.vx = 0;
      if (e.timer <= 0) {
        const tx = P.x + 4 - e.w / 2, T = 0.95;
        e.vx = Math.max(-240, Math.min(240, (tx - e.x) / T)); e.vy = -420; e.onGround = false;
        e.state = 'leap'; e.timer = 2; sfx.jump();
      }
      break;
    case 'leap':
      if (e.onGround && e.timer < 1.9) { land(e, enraged); e.state = 'recover'; e.timer = 0.7; e.vx = 0; }
      break;
    case 'recover':
      e.vx = 0;
      if (e.timer <= 0) idle(e, 0.9 * R);
      break;
  }
  e.bumped = false;
  if (!P.dead && overlap(P, e) && (e.state === 'charge' || e.state === 'leap')) { hurtPlayer(cx); P.vx = (Math.sign(P.x + 4 - cx) || e.dir) * 260; P.vy = -230; }
}

const idle = (e, t) => { e.state = 'idle'; e.timer = t; };
function choose(e, adx, enraged, R) {
  const r = Math.random();
  if (r < 0.42) { e.state = 'brace'; e.timer = 0.8 * R; e.again = enraged; e.mark = { ch: '!', t: 0.8 }; sfx.alert(); }
  else if (r < 0.72) { e.state = 'shake'; e.timer = 0.75; e.mark = { ch: '!', t: 0.7 }; sfx.hex(); }
  else { e.state = 'crouch'; e.timer = 0.55 * R; e.mark = { ch: '!', t: 0.55 }; sfx.alert(); }
}

/** Big acorns shaken loose from the canopy: each drops onto a marked spot — one on you, the rest spread out. */
function acornRain(e, enraged) {
  const P = G.P, b = LV.boss, n = enraged ? 7 : 5;
  const xs = [P.x + 4];
  for (let i = 1; i < n; i++) xs.push(b.arenaL + 24 + Math.random() * (b.arenaR - b.arenaL - 48));
  xs.forEach((x, i) => G.shots.push({ kind: 'bigacorn', x, y: G.cam.y - 12 - i * 14, vx: 0, vy: 30, g: 170, vmax: 150, life: 6, friendly: false, dmg: 1, r: 3 }));
  G.shake = Math.max(G.shake, 0.2); sfx.stomp();
}

function land(e, enraged) {
  const cx = cxOf(e), gy = e.y + e.h;
  for (const d of [-1, 1]) G.shots.push({ kind: 'wave', x: cx + d * 18, y: gy - 4, vx: d * (enraged ? 140 : 115), vy: 0, life: 3, friendly: false, dmg: 1 });
  G.shake = 0.45; sfx.boom(30);
  burst(cx, gy - 2, 20, DUST, 90, 300, 0.6, { size: 2, bounce: true });
  if (enraged) {                                                           // the grove shakes: the canopy ledges crack and fall
    const b = LV.boss, x0 = Math.floor(b.arenaL / TILE), x1 = Math.floor(b.arenaR / TILE), floor = Math.floor(gy / TILE);
    for (let ty = 0; ty < floor; ty++) for (let tx = x0; tx <= x1; tx++) if (LV.grid[ty * LV.cols + tx] === WOOD) damageTile(tx, ty, 1.2);
  }
}

export function drawBoss3(ctx, e, X, Y) {
  for (const s of G.shots) if (s.kind === 'bigacorn' && !s.dead) {         // where each acorn will land: a marker that tightens as it falls
    const gy = floorBelow(s.x), k = Math.max(0, Math.min(1, 1 - (gy - s.y) / 200)), w = Math.round(4 + k * 8);
    if (Math.floor(G.t * 10) % 2 || k > 0.7) { ctx.fillStyle = k > 0.7 ? RED : '#ffe29a'; ctx.fillRect(X(s.x) - w, Y(gy) - 1, w * 2 + 1, 1); ctx.fillRect(X(s.x), Y(gy) - 3, 1, 2); }
  }
  const pose = e.state === 'charge' ? 'charge' : e.state === 'brace' || e.state === 'crouch' ? 'brace' : e.state === 'stunned' ? 'stun'
    : e.state === 'intro' || e.state === 'shake' || e.state === 'leap' || e.state === 'sleep' ? (e.state === 'leap' ? 'charge' : 'rear')
    : Math.abs(e.vx) > 4 ? (Math.floor(G.t * 6) % 2 ? 'walk1' : 'walk2') : 'idle';
  const set = A.stagSprites[pose], spr = set[(e.flash > 0 ? 'w' : '') + (e.dir > 0 ? 'r' : 'l')];
  const shake = e.state === 'shake' ? Math.round(Math.sin(G.t * 60)) : 0;
  ctx.drawImage(spr, X(cxOf(e) - spr.width / 2) + shake, Y(e.y + e.h - spr.height));
  if (e.mark) { ctx.fillStyle = '#ffe14d'; ctx.fillRect(X(cxOf(e)), Y(e.y - 34), 2, 6); ctx.fillRect(X(cxOf(e)), Y(e.y - 26), 2, 2); }
}
function floorBelow(x) {
  const tx = Math.floor(x / TILE);
  for (let ty = 0; ty < LV.rows; ty++) if (LV.grid[ty * LV.cols + tx] && ty * TILE > G.cam.y - 20) return ty * TILE;
  return WORLD_H;
}
