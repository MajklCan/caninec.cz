// Goblinbomber's sticky charges, the detonator, and rocket-jumping off his own blasts.
import { G, later } from './state.js';
import { LV, solidTile, WORLD_H } from './world.js';
import { pop } from './fx.js';
import { sfx } from './audio.js';
import { explode, damageEnemy } from './combat.js';
import * as A from './art.js';

export const MAX_CHARGES = 5, CHARGE_R = 26, DMG = 5, DIRECT_DMG = 8, BOSS_DMG = 6, ARM_TIME = 0.35;   // a fresh charge needs a beat to arm — no throw-and-pop insta-jumps

export function resetGoblin() { G.charges = []; }

/** Q: lob a sticky charge — it glues itself to the first wall, floor, ceiling or foe it touches. */
export function throwCharge(P) {
  if (G.charges.length >= MAX_CHARGES) return false;
  const air = !P.onGround;                                                // jump-throws keep the long lob; grounded ones stay close
  G.charges.push({ x: P.x + P.w / 2 + P.face * 6, y: P.y + 6, vx: P.face * (air ? 190 : 115), vy: air ? -130 : -110, stuck: false, foe: null, ox: 0, oy: 0, age: 0 });
  return true;
}

/** Blasts from Goblinbomber's own bombs never hurt him — they launch him. */
export function rocketPush(x, y, power = 1) {
  const P = G.P;
  if (P.dead) return;
  const cx = P.x + P.w / 2, cy = P.y + P.h / 2, d = Math.hypot(cx - x, cy - y), reach = 68 * power;
  if (d > reach) return;
  const k = 1 - (d / reach) * 0.4;
  P.vy = Math.min(P.vy, -420 * k * power);
  P.vx += (Math.sign(cx - x) || P.face) * 175 * k;
  P.onGround = false; P.coyote = 0; P.climbT = 0.4;                       // no jump-cut: ride the blast
}

/** E: set them all off, one after another — a chain you can ride. */
/** Returns how many went off; -1 = charges are out but none has armed yet. */
export function detonateAll() {
  const list = G.charges.filter(c => c.age >= ARM_TIME);
  if (!list.length) return G.charges.length ? -1 : 0;
  G.charges = G.charges.filter(c => c.age < ARM_TIME);
  list.forEach((c, i) => later(i * 0.08, () => {
    const host = c.foe?.alive ? c.foe : null;                              // a charge stuck on a foe is a direct hit — pay it off
    explode(c.x, c.y, CHARGE_R, { dmg: DMG, spare: host });                // bystanders take the normal blast
    if (host) damageEnemy(host, host.boss ? BOSS_DMG : host.flying ? host.hp : DIRECT_DMG, c.x, 'boom');   // flyers are hard to tag: a direct charge always kills
    if (G.hero === 'goblin') rocketPush(c.x, c.y);
  }));
  return list.length;
}

export function updateCharges(dt) {
  for (const c of G.charges) {
    c.age += dt;
    if (c.foe) {
      if (c.foe.alive) { c.x = c.foe.x + c.ox; c.y = c.foe.y + c.oy; continue; }
      c.foe = null; c.stuck = false; c.vx = 0; c.vy = 0;                // host died: the charge drops
    }
    if (c.stuck) continue;
    const px = c.x, py = c.y;
    c.vy += 450 * (LV.grav || 1) * dt;
    c.x += c.vx * dt; c.y += c.vy * dt;
    for (const e of G.enemies) {
      if (!e.alive || e.carried || (e.boss && e.state === 'sleep') || c.x < e.x || c.x > e.x + e.w || c.y < e.y || c.y > e.y + e.h) continue;
      c.foe = e; c.ox = c.x - e.x; c.oy = c.y - e.y; c.stuck = true;
      pop('STUCK!', c.x - 10, c.y - 10, '#ff9a4d'); sfx.stomp();
      break;
    }
    if (c.foe) continue;
    if (solidTile(Math.floor(c.x / 16), Math.floor(c.y / 16))) { c.x = px; c.y = py; c.stuck = true; sfx.stomp(); }
    if (c.y > WORLD_H + 20) c.dead = true;
  }
  G.charges = G.charges.filter(c => !c.dead);
}

export function drawCharges(ctx, X, Y) {
  const blink = Math.floor(G.t * 5) % 2;
  for (const c of G.charges) ctx.drawImage(A.chargeSprite[c.age < ARM_TIME ? 0 : blink], Math.round(X(c.x)) - 4, Math.round(Y(c.y)) - 4);   // unarmed = dark beacon
  if (!blink) return;
  ctx.globalCompositeOperation = 'lighter';
  for (const c of G.charges) if (c.age >= ARM_TIME) ctx.drawImage(A.glows.charge, Math.round(X(c.x)) - A.glows.charge.width / 2, Math.round(Y(c.y)) - A.glows.charge.height / 2);
  ctx.globalCompositeOperation = 'source-over';
}
