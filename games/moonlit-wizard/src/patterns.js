// Slow, readable boss bullet patterns. Every one can be dodged by reading it — no instant hits.
import { G, later } from './state.js';
import { groundBelow } from './world.js';
import { sfx } from './audio.js';

/** Stones that spin outward from a point along `arms` spiral arms. */
export function spiral(cx, cy, { arms = 3, per = 5, speed = 42, spin = 0.8, gap = 0.16, dmg = 1 } = {}) {
  const dir = Math.random() < 0.5 ? 1 : -1, a0 = Math.random() * Math.PI * 2;
  for (let k = 0; k < per; k++) later(k * gap, () => {
    for (let i = 0; i < arms; i++) { const a = a0 + (i / arms) * Math.PI * 2 + k * 0.35 * dir; G.shots.push({ kind: 'spiral', cx, cy, a, r: 6, speed, spin: spin * dir, x: cx + Math.cos(a) * 6, y: cy + Math.sin(a) * 6, vx: 0, vy: 0, life: 6, friendly: false, dmg }); }
    sfx.ready();
  });
}

/** Big wobbling bubbles drifting toward the player; any shot pops them. */
export function bubbles(x, y, n = 4, speed = 38) {
  const P = G.P;
  for (let i = 0; i < n; i++) later(i * 0.25, () => {
    const a = Math.atan2(P.y + 9 - y, P.x + 4 - x) + (i - (n - 1) / 2) * 0.35;
    G.shots.push({ kind: 'bubble', x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 7, friendly: false, dmg: 1, r: 4, shootable: true, ph: Math.random() * 6 });
    sfx.hex();
  });
}

/** Crescents that roll slowly along the ground away from x — jump them. */
export function crescents(x, y, speed = 70, dirs = [-1, 1]) {
  const gy = groundBelow(x, y - 8);
  for (const d of dirs) G.shots.push({ kind: 'crescent', x: x + d * 10, y: gy - 6, vx: d * speed, vy: 0, life: 6, friendly: false, dmg: 1 });
}

/** A marching column of notes with a gap you have to slip through. */
export function chordWall(x, top, bottom, dir, speed = 55) {
  const n = Math.floor((bottom - top) / 12), gapAt = 1 + Math.floor(Math.random() * (n - 3));
  for (let i = 0; i < n; i++) {
    if (i === gapAt || i === gapAt + 1) continue;
    G.shots.push({ kind: 'note', straight: true, x, y: top + i * 12 + 6, vx: dir * speed, vy: 0, life: 9, friendly: false, dmg: 1 });
  }
  sfx.bow();
}
