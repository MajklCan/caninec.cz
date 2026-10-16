// Frost Peaks icicles: they shiver when you walk underneath, then drop. Shoot them to drop them on foes.
import { G } from './state.js';
import { solidTile, solidAt } from './world.js';
import { LV } from './world.js';
import { burst } from './fx.js';
import { sfx } from './audio.js';
import { hurtPlayer, damageEnemy } from './combat.js';
import * as A from './art.js';

const ICE = ['#ffffff', '#bfeaff', '#8fd8f2'];

export function spawnIcicles() {
  G.icicles = (LV.icicles || []).map(i => ({ ...i, state: 'hang', t: 0, vy: 0 }));
}

/** Knock an icicle loose (orbs, explosions). */
export function dropIcicle(c) { if (c.state === 'hang' || c.state === 'shake') { c.state = 'fall'; c.vy = 40; } }

function shatter(c) {
  c.state = 'gone';
  burst(c.x, c.y + 6, 10, ICE, 70, 400, 0.6, { size: 1, bounce: true });
  sfx.tink();
}

export function updateIcicles(dt) {
  const P = G.P;
  for (const c of G.icicles) {
    if (c.state === 'gone') continue;
    if (c.state === 'hang') {
      if (!solidTile(c.tx, c.ty)) dropIcicle(c);
      else if (!P.dead && Math.abs(P.x + 4 - c.x) < 16 && P.y > c.y && P.y - c.y < 120) { c.state = 'shake'; c.t = 0.4; sfx.tink(); }
    } else if (c.state === 'shake') {
      if ((c.t -= dt) <= 0) dropIcicle(c);
    } else {
      c.vy = Math.min(c.vy + 900 * dt, 420);
      c.y += c.vy * dt;
      const tip = c.y + 8;
      if (!P.dead && c.x > P.x - 2 && c.x < P.x + P.w + 2 && tip > P.y && c.y < P.y + P.h) { hurtPlayer(c.x); shatter(c); continue; }
      for (const e of G.enemies) {
        if (!e.alive || c.x < e.x - 2 || c.x > e.x + e.w + 2 || tip < e.y || c.y > e.y + e.h) continue;
        damageEnemy(e, 4, c.x, 'boom'); shatter(c); break;
      }
      if (c.state !== 'gone' && (solidAt(c.x, tip) || c.y > G.cam.y + 400)) shatter(c);
    }
  }
}

export function drawIcicles(ctx, X, Y) {
  for (const c of G.icicles) {
    if (c.state === 'gone') continue;
    const wig = c.state === 'shake' ? Math.round(Math.sin(G.t * 60)) : 0;
    ctx.drawImage(A.icicleSprite, X(c.x - 2) + wig, Y(c.y));
  }
}
