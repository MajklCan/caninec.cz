// Level mechanics: moving platforms (Clockwork Tower), arrow pegs (Skeleton), the tide (Sunken Cathedral).
import { W, H } from './gfx.js';
import { G } from './state.js';
import { LV } from './world.js';
import * as A from './art.js';

const TAU = Math.PI * 2;

export function spawnMechanics() {
  G.movers = (LV.movers || []).map(m => ({ ...m, x: m.ax, y: m.ay, t: 0, dx: 0, dy: 0 }));
  G.pegs = [];
  G.branches = (LV.branches || []).map(b => ({ ...b, baseY: b.y, off: 0, v: 0, dx: 0, dy: 0, branch: true }));
  G.water = LV.water ? { y: LV.water.base, flood: 0, off: 0, t: 0 } : null;
}

export function updateMechanics(dt) {
  for (const m of G.movers) {
    const px = m.x, py = m.y;
    m.t += dt;
    const k = 0.5 - 0.5 * Math.cos((TAU * m.t) / m.period);
    m.x = m.ax + (m.bx - m.ax) * k; m.y = m.ay + (m.by - m.ay) * k;
    m.dx = m.x - px; m.dy = m.y - py;
  }
  for (const b of G.branches) {                                          // springy branches: sag under you, whip back when you jump
    const py = b.y, target = G.P && G.P.riding === b ? 3 : 0;
    b.v += ((target - b.off) * 260 - b.v * 9) * dt;
    b.off += b.v * dt;
    b.y = b.baseY + Math.round(b.off * 0.7); b.dy = b.y - py;
  }
  for (const p of G.pegs) p.t -= dt;
  G.pegs = G.pegs.filter(p => p.t > 0);
  const w = G.water;
  if (w) {
    w.t += dt;
    w.off += (w.flood - w.off) * Math.min(1, dt * 0.8);                    // bosses can flood the hall
    w.y = LV.water.base + Math.sin((TAU * w.t) / LV.water.period) * LV.water.amp + w.off;
  }
}

/** Stick an arrow in a wall as a tiny ledge. */
export function addPeg(x, y) {
  G.pegs.push({ x: x - 4, y, w: 8, t: 9, dx: 0, dy: 0 });
  if (G.pegs.length > 14) G.pegs.shift();
}

/** One-way platforms: call right after the entity moved, with its feet position from before the move. */
export function landOnPlatforms(e, prevBottom) {
  if (e.vy < 0) { e.riding = null; return; }
  for (const m of G.movers.concat(G.pegs, G.branches || [])) {
    if (e.x + e.w <= m.x || e.x >= m.x + m.w) continue;
    const bottom = e.y + e.h, slack = Math.abs(m.dy) + (e.riding === m ? 3 : 1.5);
    if (prevBottom <= m.y + slack && bottom >= m.y - (e.riding === m ? 3 : 0.5)) {
      if (m.branch && e.riding !== m) { m.v += Math.min(260, e.vy) * 0.9; leafPuff(e.x + e.w / 2, m.y, 3); }   // touch down: the branch dips
      e.y = m.y - e.h; e.vy = 0; e.onGround = true; e.x += m.dx; e.riding = m;
      return;
    }
  }
  e.riding = null;
}

/** Jumping off a branch: it flings you higher and whips back. Returns the jump multiplier. */
export const BRANCH_BOOST = 1.3;
export function branchKick(b) {
  b.v += 230;                                                               // pressed down hard, then springs up past rest
  leafPuff(b.x + b.w / 2, b.y, 7);
}
const LEAVES = ['#6ea84a', '#a8d86a', '#3f7a3a', '#5f9a44'];
function leafPuff(x, y, n) {
  for (let i = 0; i < n; i++) G.parts.push({ x: x + (Math.random() - 0.5) * 16, y: y - 2, vx: (Math.random() - 0.5) * 50, vy: -30 - Math.random() * 40, life: 0.9, max: 0.9, c: LEAVES[(Math.random() * 4) | 0], g: 60, size: 1 });
}

export const inWater = y => !!G.water && y > G.water.y;

export function drawMechanics(ctx, X, Y) {
  for (const m of G.movers) {
    const x = X(m.x), y = Y(m.y), w = m.w;
    ctx.fillStyle = '#1e1208'; ctx.fillRect(x - 1, y - 1, w + 2, 8);
    ctx.fillStyle = '#c08a3a'; ctx.fillRect(x, y, w, 6);
    ctx.fillStyle = '#ffe29a'; ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = '#8f5f24'; ctx.fillRect(x, y + 5, w, 1);
    const f = A.gearFrames.bolt[Math.floor(G.t * 8) % 4];
    ctx.drawImage(f, x - 5, y - 2); ctx.drawImage(f, x + w - 6, y - 2);
    ctx.fillStyle = '#3a2410';                                              // chain up to the pulleys
    for (let cy = y - 6; cy > y - 40; cy -= 4) { ctx.fillRect(x + 3, cy, 1, 2); ctx.fillRect(x + w - 4, cy, 1, 2); }
  }
  for (const p of G.pegs) if (p.t > 1.5 || Math.floor(p.t * 10) % 2) ctx.drawImage(A.pegSprite, X(p.x), Y(p.y));
  for (const b of G.branches) drawBranch(ctx, X, Y, b);
}

/** A bark limb, thick at the trunk and tapering to a leafy tip; it bends more the further out it goes. */
function drawBranch(ctx, X, Y, b) {
  const n = b.w, left = b.root === 'l', x0 = X(b.x), y0 = Y(b.baseY);
  const sagAt = i => { const t = left ? i / n : (n - 1 - i) / n; return Math.round(b.off * t * 1.4 + t * 2); };
  for (let i = 0; i < n; i++) {
    const t = left ? i / n : (n - 1 - i) / n, th = Math.max(2, Math.round(5 - t * 3)), y = y0 + sagAt(i);
    ctx.fillStyle = '#1a0f08'; ctx.fillRect(x0 + i, y - 1, 1, th + 2);
    ctx.fillStyle = i % 9 === 4 ? '#3a2416' : '#5e3e24'; ctx.fillRect(x0 + i, y, 1, th);
    ctx.fillStyle = '#8a5e38'; ctx.fillRect(x0 + i, y, 1, 1);
  }
  const sway = Math.round(Math.sin(G.t * 2 + b.x) * 1);
  for (const f of [0.45, 0.8, 1]) {                                        // leaf clusters along the outer half
    const i = Math.round((left ? f : 1 - f) * (n - 1)), cx = x0 + i, cy = y0 + sagAt(i) - 2 + sway;
    ctx.fillStyle = '#16261c'; ctx.fillRect(cx - 4, cy - 2, 9, 5);
    ctx.fillStyle = '#3f7a3a'; ctx.fillRect(cx - 3, cy - 2, 7, 4);
    ctx.fillStyle = '#6ea84a'; ctx.fillRect(cx - 2, cy - 2, 4, 2);
    ctx.fillStyle = '#a8d86a'; ctx.fillRect(cx - 1, cy - 2, 1, 1);
  }
}

const WATER = (() => {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x + y) & 1) { g.fillStyle = y % 7 === 0 ? 'rgba(80,200,210,0.32)' : 'rgba(10,90,110,0.34)'; g.fillRect(x, y, 1, 1); }
  return c;
})();
/** Tide overlay: dithered water below the surface line, with a shimmering edge. */
export function drawWater(ctx) {
  const w = G.water;
  if (!w) return;
  const sy = Math.round(w.y - G.cam.y);
  if (sy >= H) return;
  const top = Math.max(0, sy);
  ctx.drawImage(WATER, 0, top, W, H - top, 0, top, W, H - top);
  if (sy >= 0) for (let x = 0; x < W; x++) {
    const o = Math.round(Math.sin(x * 0.2 + G.t * 3) * 1.2);
    ctx.fillStyle = (x + Math.floor(G.t * 8)) % 6 < 2 ? '#e6fbff' : '#8fe8e0';
    ctx.fillRect(x, sy + o, 1, 1);
  }
}
