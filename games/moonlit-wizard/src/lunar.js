// The Wizard's lunar phases. R flips between FULL MOON (blue: blast orbs + mirror shield — the classic kit)
// and BLOOD MOON (red staff: boomerang orbs that cut on the way out AND back, E heals instead of shielding).
import { G, hint } from './state.js';
import { solidAt } from './world.js';
import { burst, pop } from './fx.js';
import { sfx } from './audio.js';
import { damageEnemy } from './combat.js';

export const BLOOD = ['#ff5470', '#ffb3c1', '#ffffff'], BLUE = ['#58d7ff', '#8fe8ff', '#e6fbff'];
export const HEAL = 1;                                                      // hearts per Blood Moon E
const REACH = 126, BRAKE = 400, BACK_SPEED = 290;                          // same reach as a Full Moon orb (190 px/s × 0.7 s, measured in-game)
const OUT_SPEED = Math.sqrt(2 * BRAKE * REACH + 30 * 30);                   // brakes to 30 px/s exactly at REACH, then turns

export const isBlood = P => P.phase === 'blood';

/** R: switch phase. Instant, 1 s cooldown — the skill is in picking the right moon for the moment. */
export function switchPhase(P, sp) {
  P.phase = isBlood(P) ? 'moon' : 'blood';
  const blood = isBlood(P);
  P.castT = 0.3;
  burst(sp.gx, sp.gy, 14, blood ? BLOOD : BLUE, 70, 0, 0.4);
  pop(blood ? 'BLOOD MOON' : 'FULL MOON', P.x - 18, P.y - 14, blood ? '#ff5470' : '#8fe8ff');
  G.shake = Math.max(G.shake, 0.12); sfx.hex();
  if (blood && !G.seenBlood) { G.seenBlood = true; hint('BLOOD MOON: ORBS RETURN, E HEALS - R TO SWITCH BACK', 4); }
}

/** Blood Moon Q: an orb that flies out, brakes, and swings back to your hand — it cuts on both legs. */
export function throwBloodOrb(P, muzzle) {
  P.castT = 0.15;
  G.shots.push({ kind: 'bloodorb', x: muzzle.x + P.face, y: muzzle.y - 1, vx: P.face * OUT_SPEED, vy: 0, back: false, life: 3, friendly: true, dmg: 1.5, hitSet: new Set(), owner: P });
  burst(muzzle.x, muzzle.y, 5, BLOOD, 40, 0, 0.25);
  sfx.orb();
}

/** Called from updateShots instead of the generic flight. */
export function updateBloodOrb(s, dt) {
  const P = s.owner || G.P;
  s.life -= dt;
  if (!s.back) {
    s.x += s.vx * dt;
    s.vx -= Math.sign(s.vx) * BRAKE * dt;
    if (Math.abs(s.vx) < 30 || solidAt(s.x, s.y)) { s.back = true; s.hitSet.clear(); if (solidAt(s.x, s.y)) burst(s.x, s.y, 4, BLOOD, 40, 0, 0.2); }
  } else {                                                                  // home to the staff hand, through walls
    const tx = P.x + P.w / 2, ty = P.y + 8, dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy), sp = BACK_SPEED * dt;
    if (P.dead || d <= sp + 3) { s.dead = true; burst(tx, ty, 4, BLOOD, 30, 0, 0.2); return; }
    s.x += (dx / d) * sp; s.y += (dy / d) * sp; s.vx = (dx / d) * BACK_SPEED;
  }
  if (Math.random() < 0.7) G.parts.push({ x: s.x + (Math.random() * 4 - 2), y: s.y + (Math.random() * 4 - 2), vx: 0, vy: -8, life: 0.35, max: 0.35, c: BLOOD[(Math.random() * 3) | 0], g: 0, size: 1 });
  for (const e of G.enemies) {
    if (!e.alive || s.hitSet.has(e) || (e.boss && e.state === 'sleep') || s.x < e.x - 3 || s.x > e.x + e.w + 3 || s.y < e.y - 3 || s.y > e.y + e.h + 3) continue;
    s.hitSet.add(e);
    damageEnemy(e, s.dmg, s.x - Math.sign(s.vx || 1) * 10, 'shot');
    burst(s.x, s.y, 5, BLOOD, 50, 0, 0.25);
  }
  if (s.life <= 0) s.dead = true;
}

/** Blood Moon E: mend a heart. Refused at full health (no cooldown spent). */
export function bloodHeal(P) {
  if (P.hp >= P.maxHp) { P.deny.e = 0.3; sfx.denied(); hint('ALREADY AT FULL HEALTH'); return false; }
  P.hp = Math.min(P.maxHp, P.hp + HEAL); P.castT = 0.4;
  for (let i = 0; i < 10; i++) G.parts.push({ x: P.x + Math.random() * P.w, y: P.y + P.h - Math.random() * 10, vx: (Math.random() - 0.5) * 12, vy: -30 - Math.random() * 30, life: 0.8, max: 0.8, c: BLOOD[(Math.random() * 3) | 0], g: -20, size: 1 });
  pop('+1', P.x - 2, P.y - 12, '#ff5470'); sfx.collect();
  return true;
}
