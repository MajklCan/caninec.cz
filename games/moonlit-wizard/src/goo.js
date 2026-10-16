// Sir Slimes a Lot's goo: every shot is a bit of him. Where it lands it pools into a puddle that
// hurts whatever walks through it — and that he can walk over to soak himself back up.
import { G } from './state.js';
import { groundBelow, WORLD_H } from './world.js';
import { burst } from './fx.js';
import { sfx } from './audio.js';
import { damageEnemy } from './combat.js';
import * as A from './art.js';

export const GOO_COST = 0.25, PUDDLE_W = 12;
const GOO = ['#4fd18a', '#9ff0c0', '#2a8f5c'];

/** Pool a puddle on the first floor below (x, y). `value` = how much health it gives back. */
export function puddleAt(x, y, value = GOO_COST) {
  const gy = groundBelow(x, y - 4);
  if (gy > WORLD_H) return;                                                // fell into a pit — lost
  G.puddles.push({ x: x - PUDDLE_W / 2, y: gy, value, t: 16, hit: new Map() });
  if (G.puddles.length > 24) G.puddles.shift();
  burst(x, gy - 1, 5, GOO, 30, 200, 0.3);
}

export function updateGoo(dt) {
  const P = G.P;
  for (const p of G.puddles) {
    p.t -= dt;
    // foes that wade through take a sting (every 0.6 s each)
    for (const e of G.enemies) {
      if (!e.alive || e.flying || e.type === 'barrel' || (e.boss && e.state === 'sleep')) continue;
      if (e.x + e.w < p.x || e.x > p.x + PUDDLE_W || Math.abs(e.y + e.h - p.y) > 4) continue;
      if ((p.hit.get(e) || 0) > G.t) continue;
      p.hit.set(e, G.t + 0.6);
      damageEnemy(e, 1, p.x + PUDDLE_W / 2, 'boom');
      burst(p.x + PUDDLE_W / 2, p.y - 2, 4, GOO, 30, 100, 0.3);
    }
    // Sir soaks it back up
    if (G.hero === 'slime' && !P.dead && p.value > 0 && P.hp < P.maxHp && P.x + P.w > p.x && P.x < p.x + PUDDLE_W && Math.abs(P.y + P.h - p.y) < 5) {
      P.hp = Math.min(P.maxHp, P.hp + p.value); p.t = 0;
      burst(P.x + P.w / 2, P.y + P.h - 2, 6, GOO, 40, -40, 0.3); sfx.collect();
    }
  }
  G.puddles = G.puddles.filter(p => p.t > 0);
}

export function drawGoo(ctx, X, Y) {
  for (const p of G.puddles) {
    if (p.t < 2 && Math.floor(p.t * 8) % 2) continue;
    ctx.drawImage(A.puddleSprite, X(p.x), Y(p.y) - 3);
  }
}
