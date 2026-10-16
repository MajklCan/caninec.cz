// Particles, debris, smoke and floating text.
import { G } from './state.js';
import { solidAt } from './world.js';

export const CYAN = ['#e6fbff', '#8fe8ff', '#58d7ff', '#b07cff'];
export const FIRE = ['#fff4c9', '#ffc53d', '#ff7b2e', '#e2462c'];
const DUST = ['#8c89ab', '#6b6889', '#aeabcb'];
const SMOKE = ['#3a3358', '#4a4370', '#2a2446', '#5a5380'];
const DEBRIS = { 1: ['#aeabcb', '#8c89ab', '#6b6889', '#524f6d'], 3: ['#c08850', '#96633a', '#6b4226'], 4: ['#e6fbff', '#8fd8f2', '#4a9cc8'] };

export function burst(x, y, n, colors, speed = 60, g = 200, life = 0.6, opts = {}) {
  for (let i = 0; i < n; i++) {
    const l = life * (0.5 + Math.random() * 0.5);
    G.parts.push({
      x, y, vx: (Math.random() * 2 - 1) * speed, vy: (Math.random() * 2 - 1) * speed - speed * 0.3,
      life: l, max: l, c: colors[(Math.random() * colors.length) | 0], g, size: opts.size || 1, bounce: !!opts.bounce,
    });
  }
}
export const dust = (x, y, n) => burst(x, y - 1, n, DUST, 30, 80, 0.4);
export const gibs = (x, y, colors, n = 10) => burst(x, y, n, colors, 110, 520, 1.4, { size: 2, bounce: true });
export function debris(x, y, type) {
  burst(x, y, 6, DEBRIS[type] || DEBRIS[1], 100, 520, 1.3, { size: 2, bounce: true });
  burst(x, y, 5, DUST, 40, 40, 0.7);
}
export function smoke(x, y, n) {
  for (let i = 0; i < n; i++) {
    const l = 0.8 + Math.random() * 0.8;
    G.parts.push({ x: x + (Math.random() * 2 - 1) * 8, y: y + (Math.random() * 2 - 1) * 6, vx: (Math.random() * 2 - 1) * 14, vy: -10 - Math.random() * 20, life: l, max: l, c: SMOKE[(Math.random() * 4) | 0], g: -8, size: 2 });
  }
}
export function pop(text, x, y, color = '#f3ecd2') {
  G.pops.push({ text, x, y, t: 0, color });
}

export function updateFx(dt) {
  for (const p of G.parts) {
    p.vy += p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.bounce && solidAt(p.x, p.y)) { p.y -= p.vy * dt; p.vy *= -0.35; p.vx *= 0.6; }
    p.life -= dt;
  }
  G.parts = G.parts.filter(p => p.life > 0);
  for (const b of G.booms) b.t += dt;
  G.booms = G.booms.filter(b => b.t < 0.5);
  for (const p of G.pops) { p.t += dt; p.y -= 14 * dt; }
  G.pops = G.pops.filter(p => p.t < 0.9);
}
