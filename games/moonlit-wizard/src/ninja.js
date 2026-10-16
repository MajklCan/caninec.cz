// The Ninja: shuriken that pass through foes (Q), an untargetable dash (E),
// and FURY (R) — a glowing katana that turns Q into a slash and puts E on a short fuse.
import { G, banner } from './state.js';
import { damageTile } from './world.js';
import { burst, pop } from './fx.js';
import { sfx } from './audio.js';
import { damageEnemy, finish } from './combat.js';
import * as A from './art.js';

export const FURY_TIME = 6, DASH_TIME = 0.16, DASH_SPEED = 430, FURY_E_CD = 0.75, FURY_Q_CD = 0.22, SLASH_TIME = 0.16;
const RED = ['#ff4d6d', '#ffb3c1', '#ffffff'], STEEL = ['#ffffff', '#c9c3ef', '#8fe8ff'];

/** Q: a flat, fast shuriken that cuts through every foe in its line. */
export function throwStar(P) {
  G.shots.push({ kind: 'shuriken', x: P.x + P.w / 2 + P.face * 6, y: P.y + 9, vx: P.face * 300, vy: 0, life: 0.55, friendly: true, dmg: 1.5, hitSet: new Set() });   // ~165 px
}

/** Shuriken hit test (called from updateShots): pierces — each foe is cut once, the star keeps flying. */
export function starHits(s) {
  for (const e of G.enemies) {
    if (!e.alive || s.hitSet.has(e) || (e.boss && e.state === 'sleep') || s.x < e.x - 3 || s.x > e.x + e.w + 3 || s.y < e.y - 3 || s.y > e.y + e.h + 3) continue;
    s.hitSet.add(e);
    damageEnemy(e, s.dmg, s.x - Math.sign(s.vx) * 10, 'shot');
    burst(s.x, s.y, 4, STEEL, 50, 0, 0.25); sfx.tink();
  }
}

/** E: a blink-fast dash forward. Untargetable while it lasts; in FURY it also cuts whatever you pass through. */
export function startDash(P) {
  P.dash = DASH_TIME; P.dashDir = P.face; P.vy = 0; P.dashHit = new Set(); P.trail = P.trail || [];
  burst(P.x + P.w / 2, P.y + P.h - 2, 6, ['#8c89ab', '#c9c3ef'], 40, 40, 0.25);
  sfx.swing();
}

export function updateNinja(P, dt) {
  P.trail = (P.trail || []).filter(g => (g.t -= dt) > 0);
  if (P.dash > 0) {
    P.dash -= dt;
    const last = P.trail[P.trail.length - 1];                              // one afterimage every ~16 px, so they read as separate ghosts
    if (!last || Math.abs(last.x - P.x) >= 16) P.trail.push({ x: P.x, y: P.y, face: P.face, t: 0.24, fury: P.fury > 0 });
    if (P.fury > 0) for (const e of G.enemies) {
      if (!e.alive || P.dashHit.has(e) || (e.boss && e.state === 'sleep') || e.x > P.x + P.w + 4 || e.x + e.w < P.x - 4 || e.y > P.y + P.h || e.y + e.h < P.y) continue;
      P.dashHit.add(e); damageEnemy(e, 2, P.x + P.w / 2 - P.dashDir * 10, 'boom');
      burst(e.x + e.w / 2, e.y + e.h / 2, 8, RED, 70, 0, 0.3);
    }
  } else if (P.fury > 0 && Math.abs(P.vx) > 60) {
    const last = P.trail[P.trail.length - 1];
    if (!last || Math.abs(last.x - P.x) >= 14) P.trail.push({ x: P.x, y: P.y, face: P.face, t: 0.14, fury: true });
  }
  if (P.fury > 0) {
    P.fury -= dt;
    if (Math.random() < 0.5) G.parts.push({ x: P.x + Math.random() * P.w, y: P.y + P.h - Math.random() * 6, vx: (Math.random() - 0.5) * 10, vy: -30 - Math.random() * 30, life: 0.5, max: 0.5, c: RED[(Math.random() * 2) | 0], g: -10, size: 1 });
    if (P.fury <= 0) { burst(P.x + P.w / 2 + P.face * 8, P.y + 4, 8, STEEL, 40, 0, 0.3); sfx.tink(); pop('SHEATHED', P.x - 16, P.y - 12, '#c9c3ef'); }
  }
  P.slashT = Math.max(0, (P.slashT || 0) - dt);
}

/** R: draw the katana — FURY. */
export function startFury(P) {
  P.fury = FURY_TIME;
  P.cd.e = Math.min(P.cd.e, FURY_E_CD);                                   // the dash is ready almost at once
  banner('FURY!', '#ff4d6d', 1.1);
  G.shake = Math.max(G.shake, 0.3); sfx.shriek(); sfx.swing();
  burst(P.x + P.w / 2, P.y + P.h / 2, 22, RED, 110, 0, 0.45);
}

/** FURY Q: a wide katana arc in front — cuts foes, shots out of the air, and wood/stone in the way (never the floor). */
export function slash(P) {
  const dir = P.face, hx = dir > 0 ? P.x + P.w / 2 : P.x + P.w / 2 - 30, hy = P.y - 8, hw = 30, hh = P.h + 12;
  P.slashT = SLASH_TIME; P.slashUp = !P.slashUp;
  for (const e of G.enemies) {
    if (!e.alive || (e.boss && e.state === 'sleep')) continue;
    if (e.x > hx + hw || e.x + e.w < hx || e.y > hy + hh || e.y + e.h < hy) continue;
    damageEnemy(e, 3, P.x + P.w / 2, 'boom');
    if (!e.boss && !e.flying && e.type !== 'barrel') { e.vx = dir * 160; e.vy = -150; e.stun = 0.4; }
    burst(e.x + e.w / 2, e.y + e.h / 2, 6, RED, 60, 0, 0.25);
  }
  for (const s of G.shots) {                                                // cut bullets clean in half
    if (s.dead || s.friendly || s.x < hx || s.x > hx + hw || s.y < hy || s.y > hy + hh) continue;
    finish(s); burst(s.x, s.y, 4, STEEL, 50, 0, 0.2);
  }
  const rival = G.enemies[0] && G.enemies[0].fighter;                     // duel: the rival's shots are cut too
  if (rival) for (const s of rival.shots) {
    if (s.dead || s.kind === 'skull' || s.x < hx || s.x > hx + hw || s.y < hy || s.y > hy + hh) continue;
    s.dead = true; burst(s.x, s.y, 4, STEEL, 50, 0, 0.2);
  }
  for (let ty = Math.floor(hy / 16); ty <= Math.floor((P.y + P.h - 1) / 16); ty++)
    for (let tx = Math.floor(hx / 16); tx <= Math.floor((hx + hw - 1) / 16); tx++) damageTile(tx, ty, 1.5);
  sfx.swing();
}

/** Afterimages, the slash arc, and the katana itself. */
export function drawNinja(ctx, X, Y, P, spr, bx, by) {
  const side = P.face > 0 ? 'r' : 'l';
  for (const g of P.trail || []) {
    ctx.globalAlpha = Math.min(0.5, g.t * 2.2);
    ctx.drawImage(g.fury ? A.ninjaRed[g.face > 0 ? 'r' : 'l'] : A.ninjaDash[g.face > 0 ? 'wr' : 'wl'], X(g.x - 4), Y(g.y - 6));
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(spr, bx, by);
  if (P.fury > 0) {
    const f = Math.floor(G.t * 12) % 2;
    if (P.slashT > 0 || P.throwT > 0) ctx.drawImage(A.katanaFwd[f][side], P.face > 0 ? bx + 15 : bx - 15, by + 13);
    else ctx.drawImage(A.katanaUp[f][side], P.face > 0 ? bx + 12 : bx - 8, by + 8);
  }
  if (P.slashT > 0) {                                                       // the arc sweeps up→down (or back) across the swing
    const cx0 = X(P.x + P.w / 2 + P.face * 6), cy0 = Y(P.y + 8), k = 1 - P.slashT / SLASH_TIME;
    const a0 = P.slashUp ? 1.1 : -1.3, a1 = P.slashUp ? -1.3 : 1.1, aEnd = a0 + (a1 - a0) * Math.min(1, k * 1.4), aStart = a0 + (a1 - a0) * Math.max(0, k * 1.4 - 0.9);
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const a = aStart + ((aEnd - aStart) * i) / n, ca = Math.cos(a) * P.face, sa = Math.sin(a);
      const tip = i > n - 4;
      ctx.fillStyle = '#ff4d6d'; ctx.fillRect(Math.round(cx0 + ca * 20), Math.round(cy0 + sa * 17), 1, 1);
      ctx.fillStyle = tip ? '#ffffff' : '#ffd6de'; ctx.fillRect(Math.round(cx0 + ca * 18), Math.round(cy0 + sa * 15), 2, 1);
      if (i % 3 === 0) { ctx.fillStyle = '#ffb3c1'; ctx.fillRect(Math.round(cx0 + ca * 15), Math.round(cy0 + sa * 12), 1, 1); }
    }
  }
}

/** Additive light: the blade glows and FURY bathes the ninja in red. */
export function glowNinja(gl, P) {
  if (P.fury <= 0) return;
  gl(A.glows.fury, P.x + P.w / 2, P.y + P.h / 2);
  if (P.slashT > 0 || P.throwT > 0) gl(A.glows.katana, P.x + P.w / 2 + P.face * 20, P.y + 9);
  else gl(A.glows.katana, P.x + P.w / 2 + P.face * 13, P.y + 6);
}
