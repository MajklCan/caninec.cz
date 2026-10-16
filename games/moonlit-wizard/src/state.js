// Shared mutable game state. Every module reads/writes through G — no hidden globals elsewhere.
/** Localhost-only preview of unreleased content (Hollow Grove) — prod never sees it until it ships. */
export const PREVIEW = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const GRAV = 820, JUMP = 290, RUN = 88, MAX_FALL = 320;

/** Difficulty knobs. Easy = the original tuning; Overkill turns every dial up. */
export const DIFFS = {
  easy: {
    id: 'easy', label: 'EASY', color: '#8fe8ff', blurb: '5 HEARTS. A MOONLIT STROLL.',
    hp: 5, heal: 5, hpMul: 1, bossHp: 0.6,                                  // bosses: 40 % less health on Easy
    extra: false, sight: 1, facing: true, react: 1,
    arrowSpeed: 120, volley: 1, bruteSpeed: 28, bomberSpeed: 105, castCd: 2.6, hexSpeed: 58, reinforce: 0, reinforceCap: 0,
  },
  overkill: {
    id: 'overkill', label: 'OVERKILL', color: '#ff5470', blurb: '4 HEARTS. 2X FOES. THEY FALL FROM THE SKY.',
    hp: 4, heal: 2, hpMul: 1.3, bossHp: 1,                                 // Overkill bosses = the base table (70 / 100 / 110 / 90 / 90)
    extra: true, sight: 1.2, facing: false, react: 0.7,
    arrowSpeed: 145, volley: 2, bruteSpeed: 36, bomberSpeed: 118, castCd: 1.9, hexSpeed: 72,
    reinforce: 9, reinforceCap: 6,
  },
};
const saved = (() => { try { return localStorage.getItem('moonlit.diff'); } catch { return null; } })();

export const G = {
  diff: DIFFS[saved] || DIFFS.easy,
  mode: 'title', t: 0, time: 0,
  shake: 0, hitstop: 0, flash: 0,
  P: null,
  enemies: [], shots: [], parts: [], booms: [], pops: [],
  crystals: [], torches: [], checkpoint: null,
  cam: { x: 0, y: 0 },
  crystalsTaken: 0, total: 0, deaths: 0, kills: 0,
  combo: { n: 0, t: 0, best: 0 },
  banner: null, moonfall: null, pending: [], wonAt: 0,
  hero: 'wizard', dt: 1 / 60, movers: [], pegs: [], water: null,
  level: 0, boss: null, beams: [], icicles: [], moonAwake: false, moonFreed: false,
  duel: null, fighter: null,                                             // duel mode: match state + the fighter whose context is loaded
};

export function setDiff(id) {
  G.diff = DIFFS[id];
  try { localStorage.setItem('moonlit.diff', id); } catch { /* private mode — fine */ }
}

/** Run fn after t seconds of game time (chain reactions, respawn). */
export const later = (t, fn) => G.pending.push({ t, fn, f: G.fighter });   // remembers whose turn it was (duel)

/** Short contextual tip under the spell bar (e.g. what to press next). */
export function hint(text, t = 2.2) { G.hint = { text, t }; }

export function banner(text, color = '#f0b541', t = 1.3) {
  G.banner = { text, color, t, max: t };
}
