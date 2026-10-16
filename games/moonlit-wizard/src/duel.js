// Duel mode: you against an AI rival, best of three, in a one-screen arena.
// Both fighters are full heroes. Each one owns a context (body, hero, shots, charges, puddles, peels,
// monkeys, moonfall, hint); `runAs()` swaps that context into G, so every hero kit runs unchanged —
// the other fighter simply appears as the only entry in G.enemies (a proxy that routes damage back).
import { G, banner } from './state.js';
import { clamp } from './gfx.js';
import { LV } from './world.js';
import { setVirtual } from './input.js';
import { newPlayer, CD, KITS, updatePlayer } from './player.js';
import { updateShots, updateMoonfall, hurtPlayer } from './combat.js';
import { updateGoo } from './goo.js';
import { updateCharges } from './goblin.js';
import { updateMonkeyStuff } from './monkey.js';
import { makeBrain, think } from './duelai.js';
import { sfx } from './audio.js';

export const DUEL_HP = 5, WINS_NEEDED = 2, REAL_HEROES = ['wizard', 'skeleton', 'slime', 'monkey', 'goblin', 'ninja'];
const SLOTS = ['shots', 'charges', 'puddles', 'peels', 'monkeys', 'moonfall', 'hint'];

function makeFighter(hero, side, ai) {
  const sp = LV.spawns[side];
  const F = { hero, side, ai, shots: [], charges: [], puddles: [], peels: [], monkeys: [], moonfall: null, hint: null };
  F.P = newPlayer(sp.x, sp.y);
  Object.assign(F.P, { hp: DUEL_HP, maxHp: DUEL_HP, face: side ? -1 : 1, ai });
  // how this fighter looks to the other one's weapons: a single "enemy"
  F.proxy = { type: 'rival', fighter: F, boss: true, alive: true, state: 'duel', x: 0, y: 0, w: 8, h: 18, vx: 0, vy: 0, hp: 99, maxHp: 99, flash: 0, t: 0, dir: 1 };
  if (ai) { F.brain = makeBrain(F); F.ctl = F.brain.ctl; }
  return F;
}

function syncProxy(F) {
  const P = F.P, e = F.proxy;
  e.x = P.x; e.y = P.y; e.w = P.w; e.h = P.h; e.vx = P.vx; e.vy = P.vy; e.dir = P.face; e.alive = !P.dead;
}

function enter(F) {
  G.fighter = F; G.P = F.P; G.hero = F.hero; Object.assign(CD, KITS[F.hero]);
  for (const k of SLOTS) G[k] = F[k];
  G.enemies = [F.foe.proxy];
  setVirtual(F.ctl || null);
}
function leave(F) {
  F.P = G.P;
  for (const k of SLOTS) F[k] = G[k];
  G.fighter = null; setVirtual(null);
}
/** Between updates G holds your (player 1) context, so HUD and render read it as "the player". */
function rest() { enter(G.duel.f1); G.fighter = null; setVirtual(null); }

/** Run fn with fighter F's context loaded (nests safely; restores whatever was loaded before). */
export function runAs(F, fn) {
  const prev = G.fighter;
  if (prev === F) return fn();
  if (prev) leave(prev);
  enter(F);
  try { return fn(); } finally {
    leave(F);
    if (prev) enter(prev); else if (G.duel) rest();
  }
}

/** A weapon of the other fighter connected: convert enemy damage (orb 2, charge 5, skull 6...) into quarter hearts. */
export function hitFighter(F, dmg, fromX) {
  const hearts = clamp(Math.round(dmg * 0.5) / 4, 0.25, 1.5);
  runAs(F, () => hurtPlayer(fromX, hearts));
  syncProxy(F);
}

export function startDuel(h1, h2, level) {
  G.duel = { h1, h2, level, wins: [0, 0], round: 0, phase: 'intro', t: 0, winner: -1 };
  newRound();
}

function newRound() {
  const D = G.duel;
  D.round++; D.phase = 'intro'; D.t = 0; D.winner = -1;
  D.f1 = makeFighter(D.h1, 0, false); D.f2 = makeFighter(D.h2, 1, true);
  D.f1.foe = D.f2; D.f2.foe = D.f1;
  syncProxy(D.f1); syncProxy(D.f2);
  G.parts = []; G.booms = []; G.pops = []; G.pending = []; G.pegs = []; G.webs = [];
  G.banner = null; G.shake = 0;
  rest();
  banner(D.wins[0] === 1 && D.wins[1] === 1 ? 'FINAL ROUND' : `ROUND ${D.round}`, '#f7f1dc', 1.2);
  sfx.ready();
}

export function updateDuel(dt) {
  const D = G.duel;
  D.t += dt;
  if (D.phase === 'intro') {
    if (D.t > 1.2) { D.phase = 'fight'; banner('FIGHT!', '#ff5470', 0.9); sfx.alert(); }
    return;
  }
  if (D.phase === 'match') return;
  for (const F of [D.f1, D.f2]) runAs(F, () => {
    syncProxy(D.f1); syncProxy(D.f2);
    if (F.ai) { if (D.phase === 'fight') think(F, dt); else { F.ctl.held = {}; F.ctl.tap = {}; } }
    updatePlayer(dt);
    updateShots(dt); updateMoonfall(dt); updateGoo(dt); updateCharges(dt); updateMonkeyStuff(dt);
    if (F.ctl) F.ctl.tap = {};
  });
  syncProxy(D.f1); syncProxy(D.f2);
  if (D.phase === 'fight') {
    const d1 = D.f1.P.dead, d2 = D.f2.P.dead;
    if (d1 || d2) {
      D.phase = 'ko'; D.t = 0; D.winner = d1 && d2 ? -1 : d1 ? 1 : 0;
      banner('K.O.!', '#ff5470', 1.2); G.hitstop = 0.2;
    }
  } else if (D.phase === 'ko' && D.t > 1.9) {
    if (D.winner >= 0) D.wins[D.winner]++;
    if (D.wins.some(w => w >= WINS_NEEDED)) { D.phase = 'match'; D.t = 0; G.banner = null; if (D.wins[0] >= WINS_NEEDED) sfx.win(); else sfx.die(); }
    else newRound();
  }
}

/** Draw-time helper: run fn once for you, then once in the rival's context. */
export function forEachFighter(fn) {
  fn(G.P);
  if (G.duel) runAs(G.duel.f2, () => fn(G.P));
}
