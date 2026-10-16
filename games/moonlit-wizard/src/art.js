// Every visual in the game is generated here, in code — no image files.
import { W, H, TILE, bayer, canvas, rgb, rng, pixels, sprite, flip, glow, smooth, clamp } from './gfx.js';

const TAU = Math.PI * 2;
/** Solid white silhouette — used for the one-frame hit flash. */
function white(src) {
  const { c, g } = canvas(src.width, src.height);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, src.width, src.height);
  return c;
}
const both = s => { const l = flip(s); return { r: s, l, wr: white(s), wl: white(l) }; };
const hash = n => { n = (n << 13) ^ n; return ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 0x7fffffff; };

/* ================= SKY ================= */
// Flat colour bands joined by Bayer-dithered transitions (the classic 16-bit night sky).
function makeSky(bands) {
  return pixels(W, H, (x, y) => {
    const v = (y / (H - 1)) * (bands.length - 1);
    const i = Math.floor(v), f = smooth(0.3, 0.7, v - i);
    return bands[Math.min(bands.length - 1, f > bayer(x, y) ? i + 1 : i)];
  });
}

export function makeStars(n = 64) {
  const R = rng(42);
  return Array.from({ length: n }, () => ({
    x: R() * W, y: Math.pow(R(), 1.3) * 96,
    big: R() < 0.08, bright: R() < 0.35, ph: R() * TAU, sp: 0.6 + R() * 2.2,
  }));
}

/* ================= MOON ================= */
export const MOON_R = 14, MOON_PAD = 12, MOON_C = MOON_R + MOON_PAD;
const CRATERS = [[-5, -4, 3.2], [4, 3, 2.4], [-2, 7, 1.8], [6, -5, 1.6], [-8, 3, 1.3], [1, -9, 1.2]];
/** Shaded, cratered moon disc of radius R with a dithered halo of `pad` px. */
export function makeMoon(tones, halo, R = MOON_R, pad = MOON_PAD) {
  const c0 = R + pad, S = c0 * 2 + 1, k = R / MOON_R;
  return pixels(S, S, (x, y) => {
    const dx = x - c0, dy = y - c0, d = Math.hypot(dx, dy);
    if (d <= R) {
      const nx = dx / R, ny = dy / R, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      let l = 0.3 + 0.7 * clamp(-0.45 * nx - 0.4 * ny + 0.75 * nz, 0, 1);
      for (const [cx, cy, cr] of CRATERS) {
        const cd = Math.hypot(dx - cx * k, dy - cy * k);
        if (cd < cr * k) l -= 0.2;
        else if (cd < cr * k + 1 && dx - cx * k + (dy - cy * k) > 0) l += 0.07;
      }
      const i = Math.floor(clamp(l, 0, 0.999) * tones.length + (bayer(x, y) - 0.5) * 0.7);
      return tones[clamp(i, 0, tones.length - 1)];
    }
    if (!pad) return null;
    const h = 1 - (d - R) / pad;
    if (h <= 0) return null;
    const q = Math.floor(h * h * 3 + bayer(x, y)) / 3;
    return q > 0 ? [halo, q * 0.3] : null;
  });
}
export const MOON_SILVER = ['#a99d86', '#cfc4a4', '#e9e0c2', '#faf5e2'], MOON_BLOOD = ['#7a1f35', '#b83a45', '#ff6a55', '#ffc9a0'];
export const moon = makeMoon(MOON_SILVER, '#8d7fd0');
export const moonRed = makeMoon(MOON_BLOOD, '#ff3a5a');
export const moonTint = pixels(W, H, (x, y) => ((x + y) & 1 ? null : ['#2a0018', 0.45]));

/* ================= FAR MOUNTAINS ================= */
export const MOUNT_W = 512;
function makeMountains({ body, deep, rim, rimDark, lit, peak, snowLine }) {
  const L = MOUNT_W;
  const r = Array.from({ length: L }, (_, x) => Math.round(
    74 + 16 * Math.abs(Math.sin(TAU * 3 * x / L + 0.6)) + 5 * Math.sin(TAU * 7 * x / L + 2) + 2 * Math.sin(TAU * 17 * x / L + 1)));
  return pixels(L, H, (x, y) => {
    const t = r[x];
    if (y < t) return null;
    const sunny = r[(x + 3) % L] > r[(x - 3 + L) % L];   // slope facing the moon (right)
    const dy = y - t;
    if (t < snowLine && dy < (snowLine - t) * 0.6 + 3 - (x & 1) - (bayer(x, y) < 0.3 ? 1 : 0)) return peak;
    if (dy === 0) return sunny ? rim : rimDark;
    if (sunny && dy < 5 && bayer(x, y) < 0.7 - dy * 0.15) return lit;
    return y > 108 && bayer(x, y) < (y - 108) / 22 ? deep : body;
  });
}

/* ================= MIST ================= */
export const MIST_W = 512;
function mist(y0, y1, hex, alpha, seed) {
  const cy = (y0 + y1) / 2, m = (y1 - y0) / 2;
  return pixels(MIST_W, H, (x, y) => {
    if (y < y0 || y > y1) return null;
    const v = (1 - Math.abs(y - cy) / m) *
      (0.55 + 0.25 * Math.sin(TAU * 3 * x / MIST_W + seed) + 0.2 * Math.sin(TAU * 8 * x / MIST_W + seed * 2));
    return v > bayer(x, y) * 1.1 ? [hex, alpha] : null;
  });
}

/* ================= CASTLE SILHOUETTE ================= */
export const CASTLE_W = 448;
function makeCastle({ body, flag, winLit, winDark, winFrame, winHot, snow }) {
  const L = CASTLE_W, { c, g } = canvas(L, H);
  g.fillStyle = body;
  for (let x = 0; x < L; x++) {
    const hy = Math.round(104 + 4 * Math.sin(TAU * 2 * x / L + 1) + 2 * Math.sin(TAU * 5 * x / L));
    g.fillRect(x, hy, 1, H - hy);
    if (snow) { g.fillStyle = snow; g.fillRect(x, hy, 1, 1); g.fillStyle = body; }
  }
  const caps = [];
  const merlons = (x, w, top) => { for (let i = 0; i < w; i += 4) { g.fillRect(x + i, top - 3, 2, 3); caps.push([x + i, top - 3, 2]); } };
  const tower = (x, w, top, roof) => {
    g.fillStyle = body;
    g.fillRect(x, top, w, H - top);
    if (roof === 'cone') {
      const h = Math.round(w * 1.4);
      for (let j = 0; j < h; j++) { const half = Math.round((j / h) * (w / 2 + 1)); g.fillRect(x + w / 2 - half, top - h + j, half * 2, 1); }
      g.fillRect(x + w / 2 - 1, top - h - 4, 1, 4);
      if (snow) caps.push([x + w / 2 - 1, top - h, 2], [x + w / 2 - 2, top - h + 2, 4]);
      g.fillStyle = flag;
      g.fillRect(x + w / 2, top - h - 4, 3, 1); g.fillRect(x + w / 2, top - h - 3, 2, 1);
    } else merlons(x, w, top);
  };
  g.fillRect(116, 84, 96, H - 84); merlons(116, 96, 84);
  [[110, 12, 64, 'cone'], [138, 10, 72, 'flat'], [156, 16, 50, 'cone'], [182, 10, 70, 'flat'], [204, 12, 60, 'cone']]
    .forEach(t => tower(...t));
  tower(330, 12, 78, 'flat');
  g.clearRect(330, 74, 5, 8); g.clearRect(335, 74, 2, 5);
  g.fillStyle = body; g.fillRect(342, 94, 30, H - 94);
  for (let i = 0; i < 30; i += 4) g.fillRect(342 + i, 91 - (i % 8 ? 0 : 2), 2, 3 + (i % 8 ? 0 : 2));
  g.clearRect(360, 94, 6, 4);
  if (snow) { g.fillStyle = snow; for (const [x, y, w] of caps) g.fillRect(x, y, w, 1); }
  const win = [[113, 74, 1], [113, 84, 0], [141, 80, 1], [161, 60, 1], [165, 60, 0], [161, 72, 1], [185, 78, 0], [207, 70, 1], [150, 92, 1], [174, 94, 1], [333, 86, 1]];
  for (const [x, y, on] of win) {
    g.fillStyle = on ? winFrame : body; g.fillRect(x - 1, y - 1, 4, 5);
    g.fillStyle = on ? winLit : winDark; g.fillRect(x, y, 2, 3);
    if (on) { g.fillStyle = winHot; g.fillRect(x, y, 1, 1); }
  }
  return c;
}

/* ================= PINE SILHOUETTES ================= */
export const PINE_W = 384;
function makePines(color, snow) {
  const L = PINE_W, R = rng(7), { c, g } = canvas(L, H);
  g.fillStyle = color;
  const base = x => Math.round(118 + 3 * Math.sin(TAU * 3 * x / L) + 2 * Math.sin(TAU * 7 * x / L + 2));
  for (let x = 0; x < L; x++) g.fillRect(x, base(x), 1, H - base(x));
  let x = 6;
  while (x < L - 10) {
    const h = 14 + Math.floor(R() * 24), by = base(x);
    for (let j = 0; j < h; j++) {
      const half = Math.max(0, Math.floor(j * 0.3) - (j % 6 < 2 ? 1 : 0));
      g.fillStyle = color;
      g.fillRect(x - half, by - h + j, half * 2 + 1, 1);
      if (snow && j % 6 === 2) { g.fillStyle = snow; g.fillRect(x - half, by - h + j, Math.max(1, half), 1); }
    }
    if (snow) { g.fillStyle = snow; g.fillRect(x, by - h, 1, 1); }
    g.fillStyle = color;
    g.fillRect(x, by - 2, 1, 3);
    x += 7 + Math.floor(R() * 18) + (R() < 0.15 ? 30 : 0);
  }
  return c;
}

/* ================= AURORA (Frost Peaks) ================= */
export const AURORA_W = 512;
const AURORA_COLS = ['#1d6b5a', '#2fbf8a', '#7dffc4', '#b48cff'];
export const aurora = Array.from({ length: 8 }, (_, f) => {
  const ph = (f / 8) * TAU;
  return pixels(AURORA_W, 90, (x, y) => {
    const u = TAU * x / AURORA_W;
    const c = 34 + 9 * Math.sin(u * 2 + ph) + 5 * Math.sin(u * 5 - ph * 2);
    const streak = 0.55 + 0.45 * Math.sin(x * 0.35 + ph * 3 + Math.sin(u * 3) * 4);
    const dy = y - c;
    if (dy > 6 || dy < -26) return null;
    const v = (dy > 0 ? 1 - dy / 6 : 1 + dy / 26) * streak;
    const i = Math.floor(v * 4 + bayer(x, y) - 0.6);
    if (i < 0) return null;
    return [dy < -16 ? AURORA_COLS[3] : AURORA_COLS[Math.min(2, i)], 0.35 + 0.15 * Math.min(i, 3)];
  });
});

/* ================= THEMES ================= */
export const THEMES = {
  night: {
    sky: makeSky(['#0a0920', '#0f0d2c', '#15123a', '#1c1748', '#241c56', '#2d2263', '#37296f', '#40307a']),
    mountains: makeMountains({ body: '#261e55', deep: '#1d1745', rim: '#4a3f86', rimDark: '#2e2662', lit: '#382f74', peak: '#6a5fae', snowLine: 74 }),
    mistFar: mist(90, 110, '#4b3f8c', 0.35, 1),
    mistNear: mist(112, 140, '#5a4c9a', 0.28, 3),
    castle: makeCastle({ body: '#1a1440', flag: '#5a2040', winLit: '#ffcf6b', winDark: '#3b2c55', winFrame: '#3a2a44', winHot: '#fff1b8' }),
    pines: makePines('#0f0b27'),
  },
  frost: {
    sky: makeSky(['#050c1c', '#081428', '#0c1d36', '#112844', '#173452', '#1f4060', '#2a4c6c', '#36587a']),
    mountains: makeMountains({ body: '#1c3552', deep: '#152a44', rim: '#9fc6e0', rimDark: '#2c4b6c', lit: '#3b6488', peak: '#dfeefa', snowLine: 84 }),
    mistFar: mist(90, 110, '#6f9cc0', 0.3, 2),
    mistNear: mist(112, 140, '#cfe6f7', 0.22, 4),
    castle: makeCastle({ body: '#0f2238', flag: '#6fd8ff', winLit: '#9ff0ff', winDark: '#1d3a58', winFrame: '#1d4462', winHot: '#ffffff', snow: '#cfe6f7' }),
    pines: makePines('#0a1726', '#b9d8ee'),
  },
};

/* ================= VIGNETTE ================= */
export const vignette = pixels(W, H, (x, y) => {
  const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
  const a = smooth(0.75, 1.4, Math.sqrt(dx * dx * 0.85 + dy * dy));
  const q = Math.floor(a * 3 + bayer(x, y)) / 3;
  return q > 0 ? ['#05040f', q * 0.5] : null;
});

/* ================= WIZARD ================= */
const WIZ_PAL = {
  k: '#1b1330', r: '#b33b48', R: '#7d2340', l: '#e0626a', y: '#f0b541', Y: '#b9772b',
  w: '#f3eddc', g: '#bfb5a8', s: '#f0bf98', S: '#c98b6c',
};
const WIZ_TOP = [
  '...kkk..........',
  '..krrrk.........',
  '..kk.krk........',
  '......krk.......',
  '......kRrk......',
  '.....kRrrk......',
  '.....kRrlrk.....',
  '....kRryrrrk....',
  '....kRrrrlrk....',
  '..kkyyyyyyyykk..',
  '....kwwssksk....',
  '....kwwwwwwSk...',
  '...kRwwwwwwwk...',
  '...kRrwwgwwwkk..',
  '...kRrrwwgwrrsk.',
  '...kRrrrwwwrrsk.',
  '...kRrrrrwwrkk..',
  '..kRRrrrrrwrrk..',
  '..kyyyyyyyyyyk..',
  '..kRRrrrrrrlrk..',
  '..kRRrrrrrrlrk..',
];
const LEGS = {
  w1: ['.kRRrrrrrrrlrrk.', '.k' + 'y'.repeat(12) + 'k.', '..kkk.....kkk...'],
  w2: ['..kRrrrrrrlrrk..', '..k' + 'y'.repeat(10) + 'k..', '...kkk..kkk.....'],
  w3: ['.kRRrrrrrrrlrrk.', '.k' + 'y'.repeat(12) + 'k.', '....kkk..kkk....'],
  jump: ['kRRrrrrrrrrlrrk.', 'k' + 'y'.repeat(13) + 'k.', '..kk.......kk...'],
  fall: ['.kRRrrrrrrrlrrk.', 'k' + 'y'.repeat(14) + 'k', '.kk..........kk.'],
};
export const wizard = Object.fromEntries(
  Object.entries(LEGS).map(([k, legs]) => [k, both(sprite([...WIZ_TOP, ...legs], WIZ_PAL))]));

export const staff = sprite(
  ['..C..', 'y.c.y', 'ycCcy', 'kycyk', '.kYk.', ...Array(22).fill('.kbk.'), '.kkk.'],
  { k: '#1b1330', y: '#f0b541', Y: '#b9772b', b: '#9a6434', c: '#58d7ff', C: '#e6fbff' });
/** Blood Moon staff: same stave, the gem burns red. */
export const staffBlood = sprite(
  ['..C..', 'y.c.y', 'ycCcy', 'kycyk', '.kYk.', ...Array(22).fill('.kbk.'), '.kkk.'],
  { k: '#1b1330', y: '#f0b541', Y: '#b9772b', b: '#9a6434', c: '#ff5470', C: '#ffd6de' });

/* ================= ENEMIES & PICKUPS ================= */
const SLIME_PAL = { k: '#0f1f2a', m: '#3fcf9a', M: '#2a8f74', h: '#c4ffe6', W: '#ffffff' };
export const slime = {
  up: both(sprite([
    '..............',
    '.....kkkk.....',
    '...kkmmmmkk...',
    '..kmmhmmmmmk..',
    '.kmhmmmmmmmmk.',
    '.kmmmWkmWkmmk.',
    'kmmmmWkmWkmmmk',
    'kMmmmmmmmmmmMk',
    'kMMmmmmmmmmMMk',
    '.kkkkkkkkkkkk.',
  ], SLIME_PAL)),
  squash: both(sprite([
    '..............',
    '..............',
    '....kkkkkk....',
    '..kkmmhmmmmkk.',
    '.kmhmmmmmmmmmk',
    'kmmmmWkmWkmmmk',
    'kmmmmWkmWkmmmk',
    'kMmmmmmmmmmmMk',
    'kMMMmmmmmmMMMk',
    'kkkkkkkkkkkkkk',
  ], SLIME_PAL)),
};

const BAT_PAL = { k: '#0d0818', D: '#2a1c42', d: '#4a3670', e: '#ff4d6d' };
export const bat = [
  both(sprite([
    'k..........k',
    'Dk........kD',
    'DDk.k..k.kDD',
    '.DDkddddkDD.',
    '...keddek...',
    '....kddk....',
    '.....kk.....',
  ], BAT_PAL)),
  both(sprite([
    '............',
    '....k..k....',
    '...kdkkdk...',
    '.kDkddddkDk.',
    'kDDkeddekDDk',
    'DD.kddddk.DD',
    'D...kddk...D',
  ], BAT_PAL)),
];

export const crystal = sprite([
  '...k...',
  '..kCk..',
  '.kCcbk.',
  'kCccbBk',
  'kCcbbBk',
  'kcbbBBk',
  '.kbbBk.',
  '..kBk..',
  '...k...',
], { k: '#141238', C: '#effdff', c: '#6fdcff', b: '#2f86d6', B: '#1d4f9a' });

const HEART = ['.kk.kk.', 'khwkhhk', 'khhhhHk', '.khhHk.', '..kHk..', '...k...'];
export const heart = sprite(HEART, { k: '#1b1330', h: '#ff5470', H: '#b82b52', w: '#ffd0da' });
export const heartEmpty = sprite(HEART, { k: '#1b1330', h: '#3a3358', H: '#2a2446', w: '#4a4370' });

export const brazier = sprite([
  'kkkkkkkk',
  'kIIIIIik',
  '.kiiiik.',
  '..kiik..',
  '..kIik..',
  '..kIik..',
  '..kIik..',
  '..kIik..',
  '.kkIikk.',
  'kIIIiiik',
], { k: '#141026', I: '#7d7898', i: '#4a4560' });

export const flames = [0, 1, 2, 3].map(f => pixels(7, 11, (x, y) => {
  const t = y / 10;
  const sway = Math.sin(f * 1.7 + y * 0.9) * (1 - t) * 1.2;
  const hw = 0.6 + 2.9 * Math.pow(t, 0.65);
  const dx = Math.abs(x + 0.5 - 3.5 - sway) / hw;
  if (dx > 1 || (y === 0 && f % 2)) return null;
  if (dx < 0.35 && t > 0.45) return '#fff4c9';
  if (dx < 0.7 && t > 0.25) return '#ffc53d';
  return t < 0.3 ? '#e2462c' : '#ff7b2e';
}));

/* ================= PORTAL ARCH ================= */
export const PORTAL_W = 32, PORTAL_H = 48;
const archIn = (x, y) => { const dx = x - 15.5; return y >= 16 ? Math.abs(dx) < 10 : Math.hypot(dx, y - 16) < 10; };
export const portalMask = Uint8Array.from({ length: PORTAL_W * PORTAL_H }, (_, i) => archIn(i % PORTAL_W, (i / PORTAL_W) | 0) ? 1 : 0);
export const portalArch = pixels(PORTAL_W, PORTAL_H, (x, y) => {
  const dx = x - 15.5;
  const rOut = y >= 16 ? 15.5 - Math.abs(dx) : 15.5 - Math.hypot(dx, y - 16);
  const rIn = y >= 16 ? Math.abs(dx) - 10 : Math.hypot(dx, y - 16) - 10;
  if (rOut <= 0 || rIn < 0) return null;
  if (rOut < 1 || rIn < 1) return '#171229';
  if (y >= 16) {
    if ((y - 16) % 8 === 7) return '#231d37';
    if ((y - 16) % 8 === 0) return '#8986a8';
    return Math.abs(dx) > 13 ? '#514e6c' : '#6b6889';
  }
  const seg = (Math.atan2(y - 16, dx) + Math.PI) / (Math.PI / 7);
  if (seg % 1 < 0.14) return '#231d37';
  if (Math.abs(dx) < 1.5 && y < 6) return '#58d7ff';              // glowing keystone rune
  return rOut < 2.5 ? '#8986a8' : '#6b6889';
});

/* ================= LIGHTS ================= */
export const glows = {
  gem: glow(18, '#58d7ff', 0.4),
  gemBig: glow(28, '#8fe8ff', 0.55),
  fire: glow(30, '#ff8a3d', 0.42),
  fire2: glow(28, '#ff8a3d', 0.38),
  ember: glow(8, '#ff5a2b', 0.35),
  crystal: glow(10, '#58d7ff', 0.4),
  portal: glow(40, '#9b6bff', 0.45),
  fly: glow(4, '#d8ff7a', 0.6),
};

Object.assign(glows, {
  orb: glow(16, '#4aa8ff', 0.55),
  dark: glow(12, '#7b4dff', 0.5),
  meteor: glow(20, '#ff7b2e', 0.55),
  boom: glow(44, '#ff9a4a', 0.6),
  shield: glow(22, '#58d7ff', 0.3),
  red: glow(40, '#ff3a5a', 0.5),
  fuse: glow(6, '#ffc53d', 0.6),
});

/* ================= BROFORCE CAST ================= */
const SKEL_PAL = { k: '#1b1330', b: '#e8e2cf', B: '#a9a18c', e: '#ff4d6d', w: '#9a6434', s: '#c9c3ef' };
const ARCHER_TOP = [
  '...kkkkk....',
  '..kbbbbbk...',
  '..kbbebek...',
  '..kbbbbbk...',
  '...kBkBk....',
  '....kbk..w..',
  '...kkbkk.ws.',
  '..kBbbbBkw.s',
  '..kbkbkbbbbs',
  '..kBbbbBkw.s',
  '...kbbbk.w.s',
  '...kBkBk..ws',
];
export const archer = [
  both(sprite([...ARCHER_TOP, '...kb.bk....', '...kb.bk....', '..kbk.kbk...', '..kk...kk...'], SKEL_PAL)),
  both(sprite([...ARCHER_TOP, '...kbbk.....', '...kbbk.....', '...kbbbk....', '...kk.kk....'], SKEL_PAL)),
];

const BRUTE_PAL = { k: '#141026', a: '#6f6a8a', A: '#4a4560', h: '#aeabcb', e: '#ff4d6d', b: '#e8e2cf', y: '#f0b541' };
const BRUTE_TOP = [
  '...kkkkk....',
  '..kaaaaak...',
  '..kahhaaak..',
  '..kakkekek..',
  '..kaaaaaak..',
  '...kAAAAk...',
  '.kkaaaaaakk.',
  'kaahaaaaaaak',
  'kaaaaAaaaaak',
  'kAkaaAaaakAk',
  'kbkaaAaaakbk',
  '.k.kAAAAk.k.',
  '...kaaaak...',
  '...kyyyyk...',
  '...kaaaak...',
  '...kakkak...',
];
export const brute = [
  both(sprite([...BRUTE_TOP, '...kak.kak..', '...kak.kak..', '..kaak.kaak.', '..kkkk.kkkk.'], BRUTE_PAL)),
  both(sprite([...BRUTE_TOP, '...kakkak...', '..kak..kak..', '..kak..kak..', '.kkkk..kkkk.'], BRUTE_PAL)),
];
export const bruteShield = both(sprite([
  'kkkkkk', 'ksSySk', 'ksyyyk', 'ksSySk', 'ksSySk', 'ksSSSk', 'ksSSSk',
  'ksSSSk', 'ksSSSk', 'ksSSSk', 'ksSSSk', '.kSSk.', '..kk..',
], { k: '#141026', s: '#d9555f', S: '#8a2a3e', y: '#f0b541' }));

const BOMBER_PAL = { k: '#141026', g: '#6ea84a', G: '#3f6e33', e: '#ffe14d', c: '#5a3a2a', b: '#2a2440', B: '#5a5578', f: '#f0b541' };
const BOMBER_TOP = [
  '.....f....',
  '....kkk...',
  '...kbBbk..',
  '...kbbbk..',
  '..gkkkkkg.',
  '..gkgggkg.',
  '...kgegek.',
  '..kggggggk',
  '...kgkkgk.',
  '...kcccck.',
  '..kcccccck',
  '...kcccck.',
];
export const bomber = [
  both(sprite([...BOMBER_TOP, '...kg..gk.', '...kk..kk.'], BOMBER_PAL)),
  both(sprite([...BOMBER_TOP, '...kgk.gk.', '....kk.kk.'], BOMBER_PAL)),
];

const CULT_PAL = { k: '#0d0818', p: '#4a2a7a', P: '#2e1a52', l: '#7b4dff', d: '#0d0818', e: '#8fe8ff' };
const CULT_TOP = [
  '.....kk.....',
  '....kppk....',
  '...kppppk...',
  '..kpPddPpk..',
  '..kPdedePk..',
  '..kPdddPpk..',
  '..kpPPPPpk..',
  '.kppplppppk.',
  'kpppplpppppk',
  'kPpppllpppPk',
  'kPppplppppPk',
  'kPPpplpppPPk',
  '.kPPplpppPk.',
];
export const cultist = [
  both(sprite([...CULT_TOP, '.kPkPPPkPk..', '..k.kPk.k...', '.....k......'], CULT_PAL)),
  both(sprite([...CULT_TOP, '..kPkPPkPk..', '...k.kPk.k..', '......k.....'], CULT_PAL)),
];

export const barrel = both(sprite([
  '..kkkkkk..',
  '.kmmmmmmk.',
  'kRrrrrrrRk',
  'kRrryyrrRk',
  'kRryrryrRk',
  'kRrryyrrRk',
  'kmmmmmmmmk',
  'kRrrrrrrRk',
  'kRrrrrrrRk',
  'kRrrrrrrRk',
  '.kmmmmmmk.',
  '..kkkkkk..',
], { k: '#141026', r: '#b83a45', R: '#7a1f35', m: '#8c89ab', y: '#f0b541' }));

/* ================= PROJECTILES & FX ================= */
const disc = (r, fn) => pixels(r * 2 + 1, r * 2 + 1, (x, y) => {
  const dx = x - r, dy = y - r, d = Math.hypot(dx, dy);
  return d > r + 0.3 ? null : fn(dx, dy, d);
});
export const orbSprite = disc(3, (dx, dy, d) => d > 2.6 ? '#123a7a' : dx + dy < -1.5 ? '#ffffff' : d < 1.5 ? '#bfe8ff' : '#3aa0ff');   // Full Moon: blue
export const darkSprite = disc(2, (dx, dy, d) => d > 1.6 ? '#b07cff' : '#1b0f45');

/** Explosion flipbook: white flash → fire bands → smoke, dithered. Cached per radius. */
const boomCache = new Map();
export function boomFrames(r) {
  r = Math.round(r);
  if (boomCache.has(r)) return boomCache.get(r);
  const N = 12, COLS = ['#fff4c9', '#ffc53d', '#ff7b2e', '#c8402a', '#5a2a3a', '#3a2448'];
  const frames = Array.from({ length: N }, (_, f) => {
    const p = f / (N - 1), R = r * (p < 0.2 ? 0.55 + (p / 0.2) * 0.45 : 1);
    return disc(r, (dx, dy, d) => {
      if (d > R) return null;
      const x = dx + r, y = dy + r;
      const v = (d / R) * 0.7 + p * 1.15 + (bayer(x, y) - 0.5) * 0.35 + (hash(x * 31 + y * 7 + f * 131) - 0.5) * 0.25;
      if (p < 0.1) return v < 0.75 ? '#ffffff' : '#fff4c9';
      const i = Math.floor(v * 4);
      return i < COLS.length ? COLS[i] : null;
    });
  });
  boomCache.set(r, frames);
  return frames;
}

export const shieldFrames = [0, 1, 2, 3].map(f => disc(15, (dx, dy, d) => {
  const a = Math.atan2(dy, dx), x = dx + 15, y = dy + 15;
  if (d > 14) return Math.sin(a * 3 + f * 1.6) > 0.3 ? '#e6fbff' : '#8fe8ff';
  if (d > 12.5) return ((x + y + f) & 3) === 0 ? ['#58d7ff', 0.8] : null;
  return ((x + y) & 1) === (f & 1) && hash(x * 13 + y * 29 + f) < 0.12 ? ['#8fe8ff', 0.6] : null;
}));

export const cracks = [0.3, 0.7].map((amt, k) => {
  const R = rng(99 + k), set = new Set();
  const lines = k ? 5 : 3;
  for (let l = 0; l < lines; l++) {
    let x = 5 + R() * 6, y = 5 + R() * 6;
    const a = R() * TAU, len = 4 + R() * 7 * (1 + k);
    for (let i = 0; i < len; i++) { set.add(`${x | 0},${y | 0}`); x += Math.cos(a) + (R() - 0.5); y += Math.sin(a) + (R() - 0.5); }
  }
  return pixels(TILE, TILE, (x, y) => set.has(`${x},${y}`) ? '#171229' : set.has(`${x - 1},${y - 1}`) ? '#9d9abc' : null);
});

/* ================= HUD ART ================= */
export const icons = {
  q: disc(5, (dx, dy, d) => d > 4.6 ? '#120d26' : dx + dy < -3 ? '#ffffff' : d < 2 ? '#bfe8ff' : d < 3.5 ? '#3aa0ff' : '#1d5fc0'),
  e: disc(5, (dx, dy, d) => d > 4.6 ? '#120d26' : d > 3.4 ? (dx + dy < 0 ? '#e6fbff' : '#58d7ff') : (Math.abs(dx) + Math.abs(dy) < 1.5 ? '#e6fbff' : ((dx + dy) & 1 ? '#1d4f9a' : '#2a2a5a'))),
  r: pixels(11, 11, (x, y) => {
    const d = Math.hypot(x - 6, y - 6), d2 = Math.hypot(x - 8, y - 4.5);
    if (d < 4.8 && d2 > 3.6) return d > 4 ? '#120d26' : '#ffc9a0';
    if (x + y === 7 && x < 4) return '#ff5470';
    if (x + y === 10 && x < 3) return '#ff7b2e';
    return null;
  }),
};
export const cdShade = pixels(15, 15, (x, y) => ((x + y) & 1 ? '#05040f' : ['#05040f', 0.55]));
export function panel(w, h) {
  return pixels(w, h, (x, y) => {
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    const corner = (x < 2 || x > w - 3) && (y < 2 || y > h - 3);
    if (corner && edge) return null;
    if (edge) return '#3a3170';
    return ((x + y) & 1) ? ['#0b0920', 0.9] : ['#0b0920', 0.72];
  });
}

/* ================= LEVEL TILES ================= */
const NIGHT_ST = { hi: '#aeabcb', hi2: '#8c89ab', body: '#6b6889', shade: '#524f6d', speckL: '#7d7a9c', speckD: '#5c5979', mortar: '#231d37', out: '#171229' };
const NIGHT_FILL = [
  { hi: '#5b5877', body: '#4d4a67', shade: '#403d58', speck: '#56536f' },
  { hi: '#47445f', body: '#3b3852', shade: '#312e46', speck: '#43405a' },
  { hi: '#3a3650', body: '#2e2a42', shade: '#252136', speck: '#34304a' },   // bedrock
];
/** Per-theme stone palettes + top/bottom decoration style. */
const TILE_PALS = {
  night: { ST: NIGHT_ST, FILL: NIGHT_FILL, deco: 'moss' },
  frost: { ST: NIGHT_ST, FILL: NIGHT_FILL, deco: 'snow' },
  sunken: {
    ST: { hi: '#9fc2b4', hi2: '#7ea596', body: '#5a7f74', shade: '#44635a', speckL: '#6d9285', speckD: '#4b6d63', mortar: '#15262a', out: '#0c181b' },
    FILL: [{ hi: '#4a6a62', body: '#3d5a53', shade: '#324b45', speck: '#45645c' }, { hi: '#39544e', body: '#2e4640', shade: '#253a35', speck: '#344e48' }, { hi: '#26363a', body: '#1d2b2f', shade: '#172326', speck: '#223236' }],
    deco: 'weed',
  },
  clock: {
    ST: { hi: '#ffe29a', hi2: '#e9b85c', body: '#c08a3a', shade: '#8f5f24', speckL: '#d6a04c', speckD: '#a8742e', mortar: '#3a2410', out: '#1e1208' },
    FILL: [{ hi: '#8a5e2c', body: '#6f4a22', shade: '#5a3b1a', speck: '#7a5226' }, { hi: '#5e3f1e', body: '#4b3218', shade: '#3d2813', speck: '#553920' }, { hi: '#4a4550', body: '#3a3640', shade: '#2e2a33', speck: '#433e4a' }],
    deco: 'rivet',
  },
  lunar: {
    ST: { hi: '#e8e4da', hi2: '#cfcac0', body: '#a8a399', shade: '#85807a', speckL: '#bdb8ae', speckD: '#8f8a82', mortar: '#4a4640', out: '#1e1c1a' },
    FILL: [{ hi: '#8a857d', body: '#77726b', shade: '#66615b', speck: '#6d6862' }, { hi: '#6a665f', body: '#5b5751', shade: '#4e4b46', speck: '#555048' }, { hi: '#3e3b38', body: '#33302e', shade: '#2a2826', speck: '#383532' }],
    deco: 'crater', rock: true,
  },
};
const WOOD = { hi: '#c08850', body: '#96633a', dark: '#6b4226', seam: '#3a2216', nail: '#c9c3ef', out: '#1d110b' };
const MOSS = ['#2f6a6a', '#4b9a8a', '#7cc7a8'];
const WEED = ['#1f5a3a', '#2f8050', '#58b070'];
const SNOW = ['#ffffff', '#e4f2fc', '#b9d8ee', '#8fb8d8'];
const IRON = { hi: '#d4dcea', body: '#7a849c', mid: '#646e86', shade: '#4a5268', dark: '#2e3446', rivet: '#f4f7fc', out: '#11141f' };
const ICE = { hi: '#e6fbff', body: '#8fd8f2', mid: '#6cc0e4', deep: '#4a9cc8', streak: '#c8f0ff', out: '#1d4462' };

/** Tile map renderer. paint() repaints a tile rectangle — used after terrain is blown up. */
export function makeTileRenderer(L) {
  const { cols, rows, grid } = L, LW = cols * TILE, LH = rows * TILE;
  const pal = TILE_PALS[L.theme] || TILE_PALS.night, ST = pal.ST, FILL = pal.FILL, deco = pal.deco;
  const { c, g } = canvas(LW, LH);
  const at = (tx, ty) => (tx < 0 || tx >= cols || ty >= rows ? 2 : ty < 0 ? 0 : grid[ty * cols + tx]);

  function drawTile(tx, ty, put) {
    const type = at(tx, ty);
    if (!type) return;
    let depth = 0;
    while (ty - depth - 1 >= 0 && grid[(ty - depth - 1) * cols + tx]) depth++;
    const top = depth === 0, openL = !at(tx - 1, ty), openR = !at(tx + 1, ty), openB = !at(tx, ty + 1);
    const R = rng(tx * 7919 + ty * 104729 + 13), X = tx * TILE, Y = ty * TILE;

    for (let py = 0; py < TILE; py++) for (let px = 0; px < TILE; px++) {
      let col, out = ST.out;
      if (pal.cloud) {                                        // cloud: puffy scalloped top, lilac belly, soft rounded ends
        const gx = X + px, gy = Y + py;
        if (top && py < 4 && py < Math.round(3 * (1 - Math.abs(Math.sin(gx * 0.26 + tx))))) continue;
        if (openB && py > 10 && py > 11 + Math.round(3 * Math.abs(Math.sin(gx * 0.31 + 1)))) continue;
        if (openL && px < 4 && (py < 4 - px || py > 11 + px)) continue;
        if (openR && px > 11 && (py < px - 11 || py > 26 - px)) continue;
        put(gx, gy, CLOUD[clamp(Math.floor(((depth * 16 + py) / 16) * 2.4 + bayer(gx, gy) * 0.9 - 0.4), 0, CLOUD.length - 1)]);
        continue;
      }
      if (type === 5) {                                       // iron: a riveted steel plate with a cross-brace — reads as "can't break this"
        out = IRON.out;
        const edge = px === 0 || py === 0 ? IRON.hi : px === 15 || py === 15 ? IRON.dark : px === 1 || py === 1 ? IRON.body : px === 14 || py === 14 ? IRON.shade : null;
        const brace = px > 2 && px < 13 && py > 2 && py < 13 && (px === py || px === 15 - py);
        const rivet = (px === 3 || px === 12) && (py === 3 || py === 12), rivetSh = (px === 4 || px === 13) && (py === 4 || py === 13);
        col = edge || (rivet ? IRON.rivet : rivetSh ? IRON.dark : brace ? IRON.shade : (px + py) % 7 === 0 ? IRON.mid : IRON.body);
      } else if (type === 4) {                                       // ice: glassy block with diagonal glints
        out = ICE.out;
        const diag = (px + py + tx * 3) % 11;
        col = py === 0 ? ICE.hi : diag === 0 ? ICE.streak : diag === 1 ? ICE.hi : py > 11 ? ICE.deep : py > 6 ? ICE.mid : ICE.body;
        if (!top && py === 0) col = ICE.mid;
      } else if (type === 3 && pal.bark) {                    // woodland: living bark (vertical grooves, moss) with a leafy crown on top
        const gx = X + px, gy = Y + py, n = hash(gx * 5 + gy * 31);
        out = BARK.out;
        const run = (dx, dy) => { let k = 1; while (k < 8 && at(tx + dx * k, ty + dy * k) === 3) k++; return k; };
        const lying = run(1, 0) + run(-1, 0) > run(0, 1) + run(0, -1);            // a fallen log: grain runs along it, end grain shows rings
        const along = lying ? px : py, across = lying ? py : px, wob = Math.round(Math.sin(along * 0.45 + tx * 1.7 + ty) * 0.8);
        const groove = (across + wob + ((lying ? ty : tx) * 3)) % 5;
        col = groove === 0 ? BARK.dark : groove === 1 ? BARK.hi : n < 0.12 ? BARK.dark : BARK.body;
        if (lying && ((openL && px < 3) || (openR && px > 12))) { const r = Math.round(Math.hypot((openL ? px : 15 - px) * 2, py - 8)); col = r % 4 === 0 ? BARK.dark : r % 4 === 2 ? '#b98a5a' : '#9a6e44'; }
        if (openL && px < 3 && n < 0.55) col = n < 0.25 ? LEAF[1] : LEAF[0];
        const walled = at(tx - 1, ty - 1) || at(tx + 1, ty - 1) || at(tx - 2, ty - 1) || at(tx + 2, ty - 1);   // a floor inside a hollow stays bare wood
        if (top && !walled) {                                 // canopy: a ragged, dithered leaf crown
          const lip = 5 + ((hash(tx * 16 + px) * 3) | 0);
          if (py < lip) col = py === 0 ? (n < 0.5 ? LEAF[3] : LEAF[2]) : py < 3 ? (bayer(gx, gy) < 0.5 ? LEAF[2] : LEAF[1]) : bayer(gx, gy) < 0.35 ? LEAF[0] : LEAF[1];
        }
      } else if (type === 3) {
        out = WOOD.out;
        const row = py >> 2, ly = py & 3, seam = (tx * 5 + row * 7) % 16;
        col = ly === 3 || px === seam ? WOOD.seam : ly === 0 ? WOOD.hi : WOOD.body;
        if (col === WOOD.body && R() < 0.1) col = WOOD.dark;
        if (ly === 1 && (px === (seam + 2) % 16 || px === (seam + 14) % 16)) col = WOOD.nail;
      } else if (pal.soil && type === 1) {                    // woodland floor: a grass lip over dark loam, pebbles and roots
        const gx = X + px, gy = Y + py, n = hash(gx * 131 + gy * 977);
        const clump = hash((gx >> 2) * 53 + (gy >> 2) * 211), stone = hash((gx >> 1) * 37 + (gy >> 1) * 409);
        out = SOIL.out;
        col = depth >= 2 ? SOIL.deep : SOIL.body;                                     // loam, darker the deeper it goes
        if (clump < 0.35 && bayer(gx, gy) < 0.55) col = depth >= 2 ? SOIL.dark : SOIL.deep; // soft darker clods, dithered
        else if (clump > 0.8 && bayer(gx, gy) < 0.3) col = SOIL.warm;                 // a few warmer patches
        if (n < 0.04) col = SOIL.dark;
        if (stone > 0.94) col = (gx & 1) === 0 && (gy & 1) === 0 ? SOIL.pebbleHi : SOIL.pebble;   // little 2×2 stones with a lit corner
        const rs = hash(tx * 7919 + ty * 104729 + 77), rx = (hash(tx * 131 + ty * 7) * 10) | 0, ry = 5 + ((hash(tx * 17 + ty * 313) * 9) | 0);
        if (rs < 0.18 && px >= rx && px < rx + 6 && py === ry + ((px - rx) >> 2)) col = SOIL.root;   // now and then a short root fragment
        const shaded = !top && ty > 0 && at(tx, ty - 1) === 3;                        // under a log or trunk: a dark, mossy lip instead of grass
        if (top) {
          const lip = 3 + ((hash(tx * 16 + px) * 3) | 0);
          if (py < lip) col = py === 0 ? GRASS[0] : py < lip - 1 ? GRASS[1] : GRASS[2];
          else if (py === lip && bayer(gx, gy) < 0.5) col = GRASS[2];
        } else if (shaded && py < 2) col = py === 0 ? LEAF[0] : bayer(gx, gy) < 0.5 ? LEAF[0] : SOIL.deep;
      } else if (pal.rock && type === 1) {                    // regolith: no bricks, just dithered dust & pebbles
        const F = FILL[depth >= 2 ? 1 : 0], n = hash((X + px) * 3 + (Y + py) * 57);
        col = top ? (py === 0 ? ST.hi : py < 3 ? ST.hi2 : n < 0.1 ? ST.speckD : n > 0.93 ? ST.speckL : ST.body) : (n < 0.12 ? F.shade : n > 0.9 ? F.hi : F.body);
        if (top && py > 8 && bayer(X + px, Y + py) < (py - 8) / 10) col = F.body;
      } else if (type === 1 && top) {
        col = py === 0 ? ST.hi : py === 1 ? ST.hi2 : py === 15 ? ST.mortar : py >= 13 ? ST.shade : ST.body;
        if (py > 0 && py < 15) {
          if (px === 15) col = ST.mortar;
          else if (px === 14 && py > 1) col = ST.shade;
          else if (px === 0 && py > 1 && py < 13) col = ST.hi2;
        }
        if (col === ST.body) { const r = R(); if (r < 0.05) col = ST.speckL; else if (r < 0.11) col = ST.speckD; }
        if (deco === 'rivet' && (px === 2 || px === 12) && (py === 3 || py === 10)) col = '#fff0c0';
        if (deco === 'rivet' && (px === 3 || px === 13) && (py === 4 || py === 11)) col = ST.shade;
      } else {
        const F = FILL[type === 2 ? 2 : depth >= 2 ? 1 : 0];
        const row = py >> 3, ly = py & 7, seam = (ty * 2 + row) & 1 ? 7 : 15;
        col = ly === 7 || px === seam ? ST.mortar
          : ly === 0 || px === (seam + 1) % 16 ? F.hi
          : ly === 6 || px === (seam + 15) % 16 ? F.shade : F.body;
        if (col === F.body && R() < 0.07) col = F.speck;
        if (top && py === 0) col = F.hi;
      }
      if (deco === 'snow' && top && type !== 4) {              // snow cap with a wavy, dithered lip
        const lip = 3 + ((hash(tx * 16 + px) * 3) | 0);
        if (py < lip) col = py === 0 ? SNOW[0] : py < lip - 1 ? SNOW[1] : SNOW[2];
        else if (py === lip && bayer(px, py) < 0.5) col = SNOW[3];
      }
      if ((openL && px === 0) || (openR && px === 15) || (openB && py === 15)) col = out;
      if (top && py === 0 && ((openL && px === 0) || (openR && px === 15))) continue;   // rounded corners
      put(X + px, Y + py, col);
    }
    if (type !== 1 || pal.cloud) return;
    if (deco === 'grass') {                                   // tall grass, ferns and a few flowers; roots under overhangs
      if (top) for (let k = 0; k < 3; k++) {
        const x = X + 1 + Math.floor(R() * 14), h = 1 + Math.floor(R() * 4), flower = R() < 0.18;
        for (let i = 1; i <= h; i++) put(x + (i > 2 && R() < 0.5 ? 1 : 0), Y - i, GRASS[i === h ? 0 : 1]);
        if (flower) put(x, Y - h - 1, R() < 0.5 ? '#ffe29a' : '#ff9aa8');
      }
      if (openB) for (let k = 0; k < 2; k++) { const x = X + 2 + Math.floor(R() * 12), len = 2 + Math.floor(R() * 5); for (let i = 0; i < len; i++) put(x + (i > 2 ? 1 : 0), Y + 16 + i, SOIL.root); }
      return;
    }
    if (deco === 'snow') {                                    // tiny icicles
      if (openB) for (let k = 0; k < 3; k++) {
        const x = X + 2 + Math.floor(R() * 12), len = 1 + Math.floor(R() * 4);
        for (let i = 0; i < len; i++) put(x, Y + 16 + i, i === len - 1 ? SNOW[0] : SNOW[2]);
      }
      return;
    }
    if (deco === 'crater') {                                  // little craters pocking the surface
      if (top && R() < 0.35) {
        const x = X + 3 + Math.floor(R() * 9);
        put(x, Y, ST.speckD); put(x + 1, Y + 1, ST.shade); put(x + 2, Y + 1, ST.shade); put(x + 3, Y, ST.speckD); put(x + 1, Y, ST.mortar); put(x + 2, Y, ST.mortar);
      }
      return;
    }
    if (deco === 'rivet') {                                   // steam pipes dripping from undersides
      if (openB && R() < 0.3) { const x = X + 4 + Math.floor(R() * 8); for (let i = 0; i < 3; i++) { put(x, Y + 16 + i, '#6f4a22'); put(x + 1, Y + 16 + i, '#c08a3a'); } put(x, Y + 19, '#3a2410'); put(x + 1, Y + 19, '#3a2410'); }
      return;
    }
    const plants = deco === 'weed' ? WEED : MOSS;
    if (top) {
      const n = Math.floor(R() * 3) + (deco === 'weed' ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const x = X + 2 + Math.floor(R() * 12), h = deco === 'weed' ? 2 + Math.floor(R() * 5) : 2;
        put(x, Y, plants[1]); put(x + 1, Y, plants[0]);
        for (let i = 1; i <= h; i++) if (deco === 'weed' || i === 1 || R() < 0.3) put(x + (deco === 'weed' && i % 3 === 2 ? 1 : 0), Y - i, plants[i === h ? 2 : 1]);
        if (R() < 0.4) put(x + 1, Y - 1, plants[1]);
      }
    }
    if (openB) {
      const n = Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        const x = X + 2 + Math.floor(R() * 12), len = 2 + Math.floor(R() * 6);
        if (deco === 'weed') { put(x, Y + 16, '#c8d8c0'); put(x + 1, Y + 16, '#8aa898'); continue; }   // barnacles
        for (let i = 0; i < len; i++) put(x + (i > 3 ? 1 : 0), Y + 16 + i, i === len - 1 ? MOSS[2] : MOSS[i % 2]);
      }
    }
  }

  function paint(tx0, ty0, tx1, ty1) {
    tx0 = Math.max(0, tx0); ty0 = Math.max(0, ty0); tx1 = Math.min(cols - 1, tx1); ty1 = Math.min(rows - 1, ty1);
    const X0 = tx0 * TILE, Y0 = ty0 * TILE, w = (tx1 - tx0 + 1) * TILE, h = (ty1 - ty0 + 1) * TILE;
    const img = g.createImageData(w, h), d = img.data;
    const put = (x, y, hex) => {
      x -= X0; y -= Y0;
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const [r, gg, b] = rgb(hex), i = (y * w + x) * 4;
      d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
    };
    // include one row above/below so plants & drips spilling into the region are redrawn too
    for (let ty = ty0 - 1; ty <= ty1 + 1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (ty >= 0 && ty < rows) drawTile(tx, ty, put);
    g.putImageData(img, X0, Y0);
  }

  paint(0, 0, cols - 1, rows - 1);
  return { canvas: c, paint };
}

/* ================= BOSSES & HAZARDS ================= */
/** Draw with plain fillRects, then wrap every opaque shape in a 1px dark outline (keeps big procedural sprites pixel-art). */
function outlined(w, h, draw, outline = '#120d26') {
  const { c, g } = canvas(w, h);
  draw(g);
  const img = g.getImageData(0, 0, w, h), d = img.data, src = new Uint8ClampedArray(d), [or, og, ob] = rgb(outline);
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (src[i + 3] || !(on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) continue;
    d[i] = or; d[i + 1] = og; d[i + 2] = ob; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
const R_ = (g, col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
function line(g, col, x0, y0, x1, y1, th = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
  g.fillStyle = col;
  for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), th, th);
}

// ---- Bone Warden (48×56, facing right, feet on the bottom row)
const WD = { a: '#4a4560', A: '#6f6a8a', h: '#aeabcb', cloak: '#52306a', cloakD: '#3a1f4a', bone: '#e8e2cf', boneD: '#a9a18c', gold: '#f0b541', red: '#b83a45', redD: '#7a1f35', blade: '#c9c3ef', edge: '#ffffff', eye: '#ff4d6d', slit: '#1b0f25' };
export const WARDEN_W = 48, WARDEN_H = 56;
function warden({ legA = 0, legB = 0, sword = 'down', brace = 0, lean = 0, stun = 0 }) {
  return outlined(WARDEN_W, WARDEN_H, g => {
    const Y = 8, ux = lean * 3, uy = lean * 2;                           // upper-body offset when charging
    // legs & boots
    R_(g, WD.a, 17, Y + 33 - legA, 5, 11); R_(g, WD.A, 18, Y + 33 - legA, 3, 11); R_(g, WD.a, 16, Y + 43 - legA, 8, 4);
    R_(g, WD.a, 25, Y + 33 - legB, 5, 11); R_(g, WD.A, 26, Y + 33 - legB, 3, 11); R_(g, WD.a, 24, Y + 43 - legB, 8, 4);
    // back arm & sword (drawn first: behind the body unless swinging forward)
    const back = sword === 'down' || sword === 'up';
    if (back) {
      if (sword === 'up') { R_(g, WD.A, 10 + ux, Y + 4 + uy, 4, 12); line(g, WD.blade, 11 + ux, Y + 3, 11 + ux, 0, 2); R_(g, WD.gold, 8 + ux, Y + 4, 8, 2); }
      else { R_(g, WD.A, 10 + ux, Y + 19 + uy, 4, 10); R_(g, WD.gold, 7 + ux, Y + 29 + uy, 9, 2); line(g, WD.blade, 10 + ux, Y + 31 + uy, 4 + ux, Y + 46, 2); line(g, WD.edge, 11 + ux, Y + 31 + uy, 5 + ux, Y + 45, 1); }
    }
    // skirt, torso, ribs, belt
    R_(g, WD.cloakD, 15 + ux, Y + 30 + uy, 18, 6);
    R_(g, WD.cloak, 15 + ux, Y + 16 + uy, 18, 15);
    for (const ry of [19, 22, 25]) { R_(g, WD.bone, 18 + ux, Y + ry + uy, 12, 1); R_(g, WD.boneD, 18 + ux, Y + ry + 1 + uy, 12, 1); }
    R_(g, WD.bone, 23 + ux, Y + 17 + uy, 2, 12);
    R_(g, WD.gold, 15 + ux, Y + 29 + uy, 18, 2);
    // pauldrons
    R_(g, WD.A, 11 + ux, Y + 14 + uy, 7, 6); R_(g, WD.h, 11 + ux, Y + 14 + uy, 7, 1);
    R_(g, WD.A, 30 + ux, Y + 14 + uy, 7, 6); R_(g, WD.h, 30 + ux, Y + 14 + uy, 7, 1);
    // head: horned helm, visor slit, jaw
    const hx = ux - stun, hy = uy + stun * 2;
    line(g, WD.bone, 18 + hx, Y + 6 + hy, 14 + hx, Y + 1 + hy, 2); line(g, WD.bone, 29 + hx, Y + 6 + hy, 33 + hx, Y + 1 + hy, 2);
    R_(g, WD.A, 18 + hx, Y + 4 + hy, 12, 10); R_(g, WD.h, 19 + hx, Y + 4 + hy, 10, 1); R_(g, WD.a, 18 + hx, Y + 12 + hy, 12, 2);
    R_(g, WD.slit, 19 + hx, Y + 8 + hy, 10, 2);
    if (!stun) { R_(g, WD.eye, 22 + hx, Y + 8 + hy, 2, 1); R_(g, WD.eye, 26 + hx, Y + 8 + hy, 2, 1); }
    else { R_(g, WD.boneD, 22 + hx, Y + 9 + hy, 2, 1); R_(g, WD.boneD, 26 + hx, Y + 9 + hy, 2, 1); }
    R_(g, WD.bone, 20 + hx, Y + 14 + hy, 8, 2); R_(g, WD.slit, 21 + hx, Y + 15 + hy, 1, 1); R_(g, WD.slit, 24 + hx, Y + 15 + hy, 1, 1); R_(g, WD.slit, 26 + hx, Y + 15 + hy, 1, 1);
    // tower shield
    const sx = 31 + ux + brace * 3 - (back ? 0 : 4), sy = Y + 18 + uy + brace * 2;
    R_(g, WD.redD, sx, sy, 9, 22); R_(g, WD.red, sx + 1, sy + 1, 7, 20);
    R_(g, WD.gold, sx + 4, sy + 3, 1, 15); R_(g, WD.gold, sx + 2, sy + 7, 5, 1);
    // front sword poses
    if (sword === 'forward') { R_(g, WD.A, 30 + ux, Y + 26 + uy, 8, 4); R_(g, WD.gold, 37 + ux, Y + 24 + uy, 2, 8); line(g, WD.blade, 38 + ux, Y + 28 + uy, 47, Y + 46, 2); line(g, WD.edge, 39 + ux, Y + 28 + uy, 47, Y + 44, 1); }
    if (sword === 'swipe') { R_(g, WD.A, 30 + ux, Y + 20 + uy, 8, 4); R_(g, WD.gold, 37 + ux, Y + 18 + uy, 2, 8); line(g, WD.blade, 39 + ux, Y + 21 + uy, 47, Y + 21 + uy, 2); }
  });
}
export const wardenPoses = Object.fromEntries(Object.entries({
  stand: {}, walk1: { legA: 2 }, walk2: { legB: 2 },
  raise: { sword: 'up' }, slam: { sword: 'forward' }, brace: { brace: 1, legA: 1 },
  charge: { lean: 1, brace: 1, legA: 2 }, swipe: { sword: 'swipe' }, stunned: { stun: 1, sword: 'down' },
}).map(([k, v]) => [k, both(warden(v))]));

// ---- The Moon (boss): big shaded disc + crack overlays; the face is drawn live so the eyes can track you
export const MOONB_R = 20;
export const moonBoss = { silver: both(makeMoon(MOON_SILVER, '#8d7fd0', MOONB_R, 0)), blood: both(makeMoon(MOON_BLOOD, '#ff3a5a', MOONB_R, 0)) };
export const moonCracks = [1, 2, 3].map(k => {
  const R = rng(500 + k), set = new Set(), S = MOONB_R * 2 + 1;
  for (let l = 0; l < 2 + k * 2; l++) {
    let x = MOONB_R + (R() - 0.5) * 10, y = MOONB_R + (R() - 0.5) * 10;
    const a = R() * TAU, len = 8 + R() * 10 * k;
    for (let i = 0; i < len; i++) { set.add(`${x | 0},${y | 0}`); x += Math.cos(a) + (R() - 0.5) * 1.2; y += Math.sin(a) + (R() - 0.5) * 1.2; }
  }
  return pixels(S, S, (x, y) => (Math.hypot(x - MOONB_R, y - MOONB_R) > MOONB_R - 0.5 ? null : set.has(`${x},${y}`) ? '#2a0a18' : set.has(`${x - 1},${y}`) ? '#ffe9c0' : null));
});

// ---- projectiles & hazards
export const rockSprite = disc(3, (dx, dy, d) => d > 2.6 ? '#3a2448' : dx + dy < -1.5 ? '#ffffff' : d < 1.5 ? '#faf5e2' : '#e9c86a');   // big & bright: easy to read
export const boneSprite = [
  sprite(['b.b', '.b.', '.b.', '.b.', 'b.b'], { b: '#e8e2cf' }),
  sprite(['b...b', '.bbb.', 'b...b'], { b: '#e8e2cf' }),
];
export const waveFrames = [0, 1].map(f => outlined(12, 11, g => {
  const spikes = f ? [[1, 5], [4, 9], [7, 6], [10, 8]] : [[1, 7], [4, 6], [7, 9], [10, 5]];
  for (const [x, h] of spikes) { R_(g, '#e8e2cf', x, 10 - h, 2, h); R_(g, '#ffffff', x, 10 - h, 1, 1); }
  R_(g, '#a9a18c', 0, 9, 12, 2);
}));
export const icicleSprite = sprite(['kiIik', 'kiIik', '.kIk.', '.kIk.', '.kik.', '.kik.', '..k..', '..i..'], { k: '#1d4462', i: '#bfeaff', I: '#ffffff' });
Object.assign(glows, { beam: glow(20, '#ffe9c0', 0.55), eye: glow(6, '#ff4d6d', 0.6) });

/* ================= SELECT SCREEN ================= */
function tint(src, hex) {
  const { c, g } = canvas(src.width, src.height);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = hex; g.fillRect(0, 0, src.width, src.height);
  return c;
}
/** Locked hero slots: dark silhouettes that hint at future characters. */
export const heroSilhouettes = [brute[0].r, archer[0].r, bomber[0].r, cultist[0].r, slime.up.r].map(s => tint(s, '#3a3068'));

export const lockedPreview = pixels(34, 22, (x, y) => (hash(x * 7 + y * 131) < 0.5 ? '#0d0a1a' : bayer(x, y) < 0.3 ? '#1b1638' : '#120d26'));

/* ================= NEW WORLDS: SUNKEN / CLOCK / LUNAR ================= */
for (const t of ['night', 'frost']) {
  const T = THEMES[t];
  T.stars = true; T.moon = true;
  T.layers = [
    { img: T.mountains, w: MOUNT_W, f: 0.1 }, { img: T.mistFar, w: MIST_W, f: 0.15, drift: 4 },
    { img: T.castle, w: CASTLE_W, f: 0.25 }, { img: T.pines, w: PINE_W, f: 0.45 }, { img: T.mistNear, w: MIST_W, f: 0.55, drift: 7 },
  ];
}

// ---- Sunken Cathedral: god rays, a drowned cathedral with stained glass, kelp
const GLASS = ['#6a2432', '#20507a', '#7a5a22', '#235e38', '#4a3380'];   // dim: it's far behind the action
function makeCathedral() {
  const L = CASTLE_W, { c, g } = canvas(L, H), body = '#0b2a33';
  g.fillStyle = body;
  for (let x = 0; x < L; x++) { const hy = Math.round(108 + 3 * Math.sin(TAU * 2 * x / L)); g.fillRect(x, hy, 1, H - hy); }
  const spire = (x, w, top, h) => { g.fillStyle = body; g.fillRect(x, top, w, H - top); for (let j = 0; j < h; j++) { const half = Math.round((j / h) * (w / 2)); g.fillRect(x + w / 2 - half, top - h + j, half * 2, 1); } g.fillRect(x + w / 2 - 1, top - h - 6, 2, 6); g.fillRect(x + w / 2 - 3, top - h - 4, 6, 2); };
  g.fillRect(120, 70, 110, H - 70);
  spire(112, 18, 52, 22); spire(222, 18, 52, 22); spire(165, 20, 40, 30);
  // pointed lancet windows with glass
  const lancet = (x, y, w, h, k) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const arch = j < w / 2 ? Math.abs(i - (w - 1) / 2) <= j * 0.9 : true;
      if (!arch) continue;
      g.fillStyle = (i === 0 || i === w - 1 || j === h - 1) ? '#062028' : ((i + j + k) % 5 === 0 ? '#062028' : GLASS[(Math.floor(j / 3) + i + k) % GLASS.length]);
      g.fillRect(x + i, y + j, 1, 1);
    }
  };
  lancet(132, 86, 6, 16, 0); lancet(146, 84, 6, 18, 2); lancet(200, 84, 6, 18, 1); lancet(214, 86, 6, 16, 3);
  // rose window
  for (let y = -13; y <= 13; y++) for (let x = -13; x <= 13; x++) {
    const d = Math.hypot(x, y); if (d > 13) continue;
    const a = Math.atan2(y, x), seg = Math.floor(((a + Math.PI) / TAU) * 12);
    g.fillStyle = d > 12 || d < 2.5 || (Math.abs(Math.sin(a * 6)) < 0.12) ? '#062028' : GLASS[(seg + (d > 7 ? 2 : 0)) % GLASS.length];
    g.fillRect(175 + x, 78 + y, 1, 1);
  }
  g.fillStyle = body; g.fillRect(330, 90, 40, H - 90); spire(340, 14, 90, 16);
  lancet(352, 100, 6, 14, 4);
  return c;
}
function makeKelp() {
  const L = PINE_W, R = rng(33), { c, g } = canvas(L, H);
  for (let k = 0; k < 26; k++) {
    const x0 = Math.floor(R() * L), h = 30 + Math.floor(R() * 60), ph = R() * TAU;
    for (let j = 0; j < h; j++) {
      const x = Math.round(x0 + Math.sin(j * 0.12 + ph) * 3), y = H - j;
      g.fillStyle = j % 9 === 4 ? '#1b6a4a' : '#0f4a36'; g.fillRect(((x % L) + L) % L, y, 2, 1);
      if (j % 9 === 4) { g.fillStyle = '#135a40'; g.fillRect(((x + 2) % L + L) % L, y - 1, 3, 1); }
    }
  }
  return c;
}
const godRays = pixels(MIST_W, H, (x, y) => {
  const u = ((x + y * 0.55) % 170 + 170) % 170, v = Math.max(0, 1 - Math.abs(u - 60) / 16) * (1 - y / H);
  return v * 0.9 > bayer(x, y) ? ['#bff0e6', 0.16] : null;
});

// ---- Clockwork Tower: dusk sky, rooftops, turning gears
function makeRooftops(color) {
  const L = CASTLE_W, R = rng(9), { c, g } = canvas(L, H);
  g.fillStyle = color;
  let x = 0;
  while (x < L) {
    const w = 14 + Math.floor(R() * 26), top = 88 + Math.floor(R() * 26);
    g.fillRect(x, top, w, H - top);
    for (let j = 0; j < 8; j++) g.fillRect(x + j, top - 8 + j, w - 2 * j, 1);             // pitched roof
    if (R() < 0.5) g.fillRect(x + w - 6, top - 12, 3, 8);                                  // chimney
    if (R() < 0.6) { g.fillStyle = '#ffb45a'; g.fillRect(x + 4, top + 6, 2, 3); g.fillStyle = color; }
    x += w + Math.floor(R() * 6);
  }
  return c;
}
function gear(Rr, teeth, phase, body, rim) {
  return disc(Rr, (dx, dy, d) => {
    const a = Math.atan2(dy, dx) + phase, tooth = Math.cos(a * teeth) > 0.2 ? 0 : 4;
    if (d > Rr - tooth) return null;
    if (d < Rr * 0.22) return null;                                                          // axle hole
    const spoke = Math.abs(Math.sin((a) * 2)) < 0.25;
    if (d > Rr * 0.34 && d < Rr * 0.66 && !spoke) return null;                               // cut-outs between spokes
    return d > Rr - tooth - 2 || (d < Rr * 0.3) ? rim : body;
  });
}
export const gearFrames = { big: Array.from({ length: 6 }, (_, f) => gear(34, 12, (f / 6) * (TAU / 12), '#5a2f24', '#7a4430')), small: Array.from({ length: 6 }, (_, f) => gear(20, 9, (f / 6) * (TAU / 9), '#6a3a28', '#8a5234')), bolt: Array.from({ length: 4 }, (_, f) => gear(5, 6, (f / 4) * (TAU / 6), '#c08a3a', '#ffe29a')) };

// ---- Moon surface: the Earth overhead, grey ridges, crater hills
export const EARTH_R = 18;
export const earth = (() => {
  const Rr = EARTH_R, pad = 8, c0 = Rr + pad;
  return pixels(c0 * 2 + 1, c0 * 2 + 1, (x, y) => {
    const dx = x - c0, dy = y - c0, d = Math.hypot(dx, dy);
    if (d > Rr) { const h = 1 - (d - Rr) / pad; if (h <= 0) return null; const q = Math.floor(h * h * 3 + bayer(x, y)) / 3; return q > 0 ? ['#6fb8ff', q * 0.3] : null; }
    const nx = dx / Rr, ny = dy / Rr, lit = -0.6 * nx - 0.3 * ny + 0.7 * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const land = Math.sin(dx * 0.42 + 1) + Math.sin(dy * 0.5 + dx * 0.21) + Math.sin((dx - dy) * 0.33) > 1.1;
    const cloud = hash(Math.floor((x + 3) / 3) * 31 + Math.floor(y / 2) * 17) > 0.78;
    if (lit < 0.05 + (bayer(x, y) - 0.5) * 0.15) return cloud ? '#1a2a48' : '#0a1830';
    if (cloud) return '#f0f6ff';
    if (land) return lit > 0.6 ? '#4fae5a' : '#2f8a4a';
    return lit > 0.6 ? '#2e6fd0' : '#1c4fa8';
  });
})();
function makeCraterHills() {
  const L = MOUNT_W, { c, g } = canvas(L, H);
  const top = x => Math.round(100 + 6 * Math.sin(TAU * 3 * x / L + 1) + 3 * Math.sin(TAU * 11 * x / L));
  for (let x = 0; x < L; x++) {
    let t = top(x);
    for (const cx of [60, 190, 330, 450]) if (Math.abs(x - cx) < 22) t += Math.round(5 * (1 - Math.abs(x - cx) / 22)) - (Math.abs(Math.abs(x - cx) - 22) < 3 ? 3 : 0);
    g.fillStyle = '#2a2826'; g.fillRect(x, t, 1, H - t);
    g.fillStyle = '#5a5650'; g.fillRect(x, t, 1, 1);
  }
  return c;
}

Object.assign(THEMES, {
  sunken: {
    sky: makeSky(['#02141c', '#03202b', '#052c38', '#073845', '#0a4552', '#0e5260', '#135f6d', '#196b78']),
    rays: godRays,
    layers: [
      { img: makeMountains({ body: '#0a3440', deep: '#082a34', rim: '#2f6a70', rimDark: '#0e3a46', lit: '#164a55', peak: '#3f7a80', snowLine: 70 }), w: MOUNT_W, f: 0.1 },
      { img: makeCathedral(), w: CASTLE_W, f: 0.22 },
      { img: mist(96, 120, '#4fa0a0', 0.22, 5), w: MIST_W, f: 0.3, drift: 3 },
      { img: makeKelp(), w: PINE_W, f: 0.45 },
    ],
  },
  clock: {
    sky: makeSky(['#1a0f24', '#2a1530', '#3d1c38', '#56243d', '#732f3f', '#8f3f3f', '#a8543f', '#c06a40']),
    gears: true,
    layers: [
      { img: makeMountains({ body: '#4a2338', deep: '#3a1b2c', rim: '#8a4a4a', rimDark: '#5a2a3a', lit: '#6a3444', peak: '#a8604a', snowLine: 70 }), w: MOUNT_W, f: 0.08 },
      { img: makeRooftops('#2a1224'), w: CASTLE_W, f: 0.2 },
      { img: mist(100, 130, '#e0a060', 0.18, 6), w: MIST_W, f: 0.35, drift: 5 },
    ],
  },
  lunar: {
    sky: makeSky(['#02010a', '#04031a', '#060524', '#08072c', '#0a0932', '#0c0b36', '#0e0d3a', '#100f3e']),
    stars: true, earth: true,
    layers: [
      { img: makeMountains({ body: '#3a3834', deep: '#2e2c29', rim: '#9a968c', rimDark: '#4a4742', lit: '#5c5952', peak: '#c9c6c0', snowLine: 80 }), w: MOUNT_W, f: 0.06 },
      { img: makeCraterHills(), w: MOUNT_W, f: 0.25 },
      { img: mist(112, 138, '#8a867c', 0.12, 7), w: MIST_W, f: 0.4, drift: 2 },
    ],
  },
});

/** Map-picker postcard, built from a theme's own layers. */
export function mapPreview(theme, w = 34, h = 22) {
  const T = THEMES[theme], { c, g } = canvas(w, h);
  g.drawImage(T.sky, 80, 40, w, h, 0, 0, w, h);
  if (theme === 'lunar') g.drawImage(earth, 0, 0, earth.width, earth.height, w - 18, -2, 16, 16);
  else if (T.moon) g.drawImage(moon, 0, 0, moon.width, moon.height, w - 16, -3, 14, 14);
  if (theme === 'frost') { g.globalCompositeOperation = 'lighter'; g.drawImage(aurora[2], 40, 20, w, h, 0, -4, w, h); g.globalCompositeOperation = 'source-over'; }
  if (theme === 'clock') g.drawImage(gearFrames.small[0], 0, 0, 41, 41, 2, 2, 20, 20);
  if (theme === 'sunken') g.drawImage(T.rays, 60, 0, w, h, 0, 0, w, h);
  for (const l of T.layers) g.drawImage(l.img, 150, 78, w, h, 0, 0, w, h);
  const P = TILE_PALS[theme] || TILE_PALS.night;
  g.fillStyle = theme === 'frost' ? '#e4f2fc' : P.ST.hi; g.fillRect(0, h - 3, w, 1);
  g.fillStyle = P.ST.body; g.fillRect(0, h - 2, w, 2);
  return c;
}

/* ================= HERO: SKELETON DESERTER ================= */
const SK = { bone: '#ece6d2', boneD: '#b3aa92', eye: '#8fe8ff', scarf: '#c8323f', scarfD: '#861f33', bow: '#9a6434', string: '#c9c3ef', dark: '#1b1330' };
/** 16×24 like the wizard (feet on row 23) so the same physics box & camera work.
 *  Two-tone bones, tattered cloak, quiver with fletchings, recurve bow, glowing sockets. */
const SKL = { B: '#f1ebd8', D: '#c2b89c', DD: '#8a8068', cloak: '#352e4c', cloakL: '#4f4670', quiver: '#6b4226', quiverL: '#96633a', grip: '#3a2216' };
function skeleton({ legs = 'w1', headless = false, flutter = 0 }) {
  return outlined(16, 24, g => {
    // tattered cloak & quiver on the back
    R_(g, SKL.cloak, 2, 9, 4, 9); R_(g, SKL.cloakL, 3, 9, 1, 8);
    R_(g, SKL.cloak, 1, 17, 1, 2); R_(g, SKL.cloak, 3, 18, 1, 2); R_(g, SKL.cloak, 5, 17, 1, 1);
    R_(g, SKL.quiver, 1, 5, 3, 8); R_(g, SKL.quiverL, 1, 5, 1, 8); R_(g, SKL.grip, 1, 8, 3, 1);
    R_(g, '#e8e2cf', 0, 3, 1, 2); R_(g, SK.scarf, 2, 2, 1, 3); R_(g, '#e8e2cf', 3, 3, 1, 2);
    // legs: thigh, knee joint, shin, foot
    const L = { w1: [[5, 20, 4, 23], [10, 20, 11, 23]], w2: [[6, 20, 6, 23], [9, 20, 9, 23]], w3: [[7, 20, 8, 23], [8, 20, 7, 23]],
      jump: [[4, 19, 5, 21], [11, 19, 10, 21]], fall: [[4, 20, 3, 23], [11, 20, 12, 23]] }[legs];
    [[6, 17], [9, 17]].forEach(([hx, hy], i) => {
      const [kx, ky, fx, fy] = L[i];
      line(g, SKL.B, hx, hy, kx, ky); line(g, SKL.D, kx, ky, fx, fy);
      R_(g, SKL.B, kx, ky, 1, 1); R_(g, SKL.D, fx, fy, 2, 1);
    });
    // pelvis, spine, curved ribs
    R_(g, SKL.B, 5, 16, 6, 1); R_(g, SKL.D, 5, 17, 2, 1); R_(g, SKL.D, 9, 17, 2, 1);
    R_(g, SKL.D, 7, 10, 2, 6); R_(g, SKL.B, 7, 10, 1, 6);
    for (const y of [11, 13]) { R_(g, SKL.B, 5, y, 2, 1); R_(g, SKL.B, 9, y, 2, 1); R_(g, SKL.D, 5, y + 1, 1, 1); R_(g, SKL.D, 10, y + 1, 1, 1); }
    R_(g, SKL.D, 6, 15, 1, 1); R_(g, SKL.D, 9, 15, 1, 1);
    // back arm (upper arm → elbow → forearm) and bow arm
    line(g, SKL.D, 5, 11, 4, 14); line(g, SKL.D, 4, 14, 5, 16); R_(g, SKL.B, 4, 14, 1, 1);
    line(g, SKL.B, 10, 11, 11, 13); line(g, SKL.B, 11, 13, 12, 12); R_(g, SKL.D, 12, 12, 1, 2);
    // recurve bow with grip and string
    R_(g, SK.bow, 13, 4, 1, 1); R_(g, SK.bow, 14, 5, 1, 5); R_(g, SKL.grip, 13, 11, 2, 3); R_(g, SK.bow, 14, 14, 1, 5); R_(g, SK.bow, 13, 19, 1, 1);
    R_(g, '#c08850', 15, 6, 1, 3); R_(g, '#c08850', 15, 15, 1, 3); R_(g, SK.bow, 12, 3, 1, 1); R_(g, SK.bow, 12, 20, 1, 1);
    line(g, SK.string, 12, 4, 12, 19);
    // scarf wrapped at the neck, tail streaming back
    R_(g, SK.scarf, 5, 8, 6, 2); R_(g, SK.scarfD, 5, 9, 6, 1); line(g, SK.scarf, 5, 9, 2, 11 + flutter); R_(g, SK.scarfD, 2, 11 + flutter, 1, 2);
    if (headless) { R_(g, SKL.DD, 7, 7, 2, 1); return; }
    // skull: cranium with side shading, deep sockets, nasal hole, cheekbones, hinged jaw
    R_(g, SKL.B, 5, 1, 6, 6); R_(g, SKL.B, 6, 0, 4, 1); R_(g, SKL.D, 5, 4, 1, 3); R_(g, SKL.D, 10, 1, 1, 2);
    R_(g, SK.dark, 6, 3, 2, 2); R_(g, SK.dark, 9, 3, 2, 2); R_(g, SK.eye, 7, 4, 1, 1); R_(g, SK.eye, 10, 4, 1, 1);
    R_(g, SK.dark, 8, 5, 1, 1);
    R_(g, SKL.D, 6, 6, 5, 1); R_(g, SKL.B, 6, 7, 4, 1); R_(g, SK.dark, 7, 7, 1, 1); R_(g, SK.dark, 9, 7, 1, 1);
  });
}
const SKEL_POSES = ['w1', 'w2', 'w3', 'jump', 'fall'];
export const skeletonHero = Object.fromEntries(SKEL_POSES.map(k => [k, both(skeleton({ legs: k, flutter: k === 'jump' ? -2 : k === 'fall' ? 1 : 0 }))]));
export const skeletonHeadless = Object.fromEntries(SKEL_POSES.map(k => [k, both(skeleton({ legs: k, headless: true }))]));
/** Ghost form: a spectral skull with a wispy flame tail (two flicker frames). */
export const ghostForm = [0, 1].map(f => both(pixels(16, 24, (x, y) => {
  const cx = 8 + (y > 12 ? Math.sin(y * 0.6 + f * 2) * (y - 12) * 0.25 : 0);
  const half = y < 2 ? 3 : y < 10 ? 5.5 : Math.max(0, 5.5 - (y - 10) * 0.42);
  const dx = Math.abs(x + 0.5 - cx);
  if (dx > half) return null;
  if (y >= 3 && y <= 5 && (x === 5 || x === 6 || x === 9 || x === 10)) return (x === 6 || x === 10) && y === 4 ? '#ffffff' : '#0a2a3a';
  if (y === 7 && x >= 6 && x <= 9 && x % 2) return '#0a2a3a';
  const edge = half - dx < 1.2 || y === 0;
  return edge ? ['#58d7ff', 0.75] : dx < half * 0.45 && y < 12 ? ['#ffffff', 0.9] : ['#bdf2ff', 0.8];
})));
export const wispSprite = disc(2, (dx, dy, d) => d > 1.6 ? ['#58d7ff', 0.8] : '#ffffff');
export const bonePile = both(outlined(16, 24, g => {
  line(g, SK.bone, 2, 22, 9, 20); line(g, SK.bone, 6, 23, 13, 21); line(g, SK.boneD, 3, 20, 7, 23); line(g, SK.bone, 10, 23, 14, 19);
  R_(g, SK.bone, 5, 16, 6, 5); R_(g, SK.dark, 6, 18, 2, 1); R_(g, SK.dark, 9, 18, 1, 1); R_(g, SK.scarf, 3, 22, 5, 1);
}));
export const skullBall = [0, 1, 2, 3].map(f => outlined(11, 11, g => {
  g.translate(5.5, 5.5); g.rotate(f * Math.PI / 2); g.translate(-5.5, -5.5);
  R_(g, SK.bone, 2, 1, 7, 8); R_(g, SK.bone, 3, 0, 5, 1); R_(g, SK.dark, 3, 3, 2, 2); R_(g, SK.dark, 6, 3, 2, 2);
  R_(g, SK.eye, 4, 4, 1, 1); R_(g, SK.eye, 7, 4, 1, 1); R_(g, SK.boneD, 3, 8, 5, 1); R_(g, SK.dark, 4, 8, 1, 1); R_(g, SK.dark, 6, 8, 1, 1);
}));
export const pegSprite = sprite(['cbbbbbb.', 'cbbbbbbf'], { c: '#c9c3ef', b: '#9a6434', f: '#e8e2cf' });
export const skelIcons = {
  q: outlined(11, 11, g => { line(g, '#9a6434', 1, 9, 8, 2); R_(g, '#c9c3ef', 7, 1, 3, 3); R_(g, '#e8e2cf', 1, 8, 2, 2); }),
  e: outlined(11, 11, g => { R_(g, SK.bone, 2, 1, 7, 7); R_(g, SK.dark, 3, 3, 2, 2); R_(g, SK.dark, 6, 3, 2, 2); R_(g, SK.eye, 4, 4, 1, 1); R_(g, SK.eye, 7, 4, 1, 1); R_(g, SK.boneD, 3, 8, 5, 2); line(g, '#ff9aa8', 0, 10, 3, 10); }),
  r: outlined(11, 11, g => { R_(g, '#bdf2ff', 2, 1, 7, 6); R_(g, '#bdf2ff', 3, 7, 5, 2); R_(g, '#58d7ff', 4, 9, 3, 1); R_(g, '#58d7ff', 6, 10, 1, 1); R_(g, '#0a2a3a', 3, 3, 2, 2); R_(g, '#0a2a3a', 6, 3, 2, 2); R_(g, '#ffffff', 4, 4, 1, 1); R_(g, '#ffffff', 7, 4, 1, 1); }),
};

/* ================= NEW BOSSES ================= */
// Drowned Organist: a hooded ghost at a sunken pipe organ
const GH = { robe: '#5f8f8c', robeD: '#3c6563', robeL: '#9fcfc8', hood: '#2a4a4a', face: '#061418', eye: '#8fe8ff', hand: '#d8e8e0' };
function organist(arms) {
  return outlined(44, 44, g => {
    for (let y = 12; y < 44; y++) {                                              // tapering ghost robe with a wavy hem
      const half = Math.round(8 + (y - 12) * 0.35 - (y > 36 ? (y - 36) * 1.2 : 0));
      if (half <= 0) continue;
      R_(g, y % 5 === 0 ? GH.robeD : GH.robe, 22 - half, y, half * 2, 1);
      R_(g, GH.robeL, 22 - half, y, 1, 1);
    }
    for (let x = 12; x < 32; x += 4) R_(g, GH.robeD, x, 38 + ((x >> 2) & 1) * 2, 2, 4);
    R_(g, GH.hood, 14, 2, 16, 14); R_(g, GH.robeD, 13, 4, 1, 12); R_(g, GH.robeD, 30, 4, 1, 12);
    R_(g, GH.face, 17, 6, 10, 8); R_(g, GH.eye, 19, 9, 2, 1); R_(g, GH.eye, 24, 9, 2, 1);
    const ay = arms === 'up' ? -10 : arms === 'wide' ? -2 : 8;
    for (const s of [-1, 1]) { line(g, GH.robe, 22 + s * 8, 16, 22 + s * 17, 22 + ay, 2); R_(g, GH.hand, 22 + s * 17 - 1, 22 + ay, 3, 3); }
  });
}
export const organistPoses = { play: both(organist('down')), raise: both(organist('up')), wide: both(organist('wide')) };
export const organSprite = outlined(110, 96, g => {
  const pipes = [40, 52, 64, 76, 88, 76, 64, 52, 40, 30, 46, 60, 74, 60, 46, 30];
  pipes.forEach((h, i) => {
    const x = 4 + i * 6.5 | 0, top = 96 - 26 - h;
    R_(g, '#8f6a2a', x, top, 5, h); R_(g, '#e9c86a', x + 1, top, 1, h); R_(g, '#5a3f18', x, top + h - 3, 5, 3);
    R_(g, '#1a1008', x + 1, top + 6, 3, 2);
  });
  R_(g, '#3a2418', 0, 70, 110, 26); R_(g, '#5a3a24', 2, 72, 106, 4);
  for (let i = 0; i < 26; i++) R_(g, i % 3 === 1 ? '#1a1008' : '#f3ecd2', 6 + i * 4, 78, 3, 6);
});
export const noteSprite = [sprite(['..cc', '..cw', '..c.', '..c.', 'ccc.', 'ccc.'], { c: '#8fe8ff', w: '#ffffff' }), sprite(['..cc', '..c.', '..c.', 'ccc.', 'ccc.', '....'], { c: '#c9a8ff', w: '#ffffff' })];



/* ================= READABLE BOSS PROJECTILES ================= */
export const bubbleSprite = disc(5, (dx, dy, d) => d > 4.3 ? '#8fe8ff' : dx + dy < -3 && d > 2.2 ? '#ffffff' : d > 3.4 ? ['#58d7ff', 0.6] : ['#bff0f6', 0.22]);
export const moonstone = disc(3, (dx, dy, d) => d > 2.6 ? '#3a2448' : dx + dy < -1 ? '#ffffff' : '#ffe9a0');
export const crescentSprite = both(pixels(14, 12, (x, y) => {
  const a = Math.hypot(x - 6, y - 6), b = Math.hypot(x - 9, y - 5);
  if (a > 6 || b < 5.2) return null;
  return a > 5.2 || b < 6 ? '#e9c86a' : '#fff4c9';
}));
Object.assign(glows, { bubble: glow(8, '#58d7ff', 0.35), crescent: glow(12, '#ffe9a0', 0.4) });

/* ================= HERO: SIR SLIMES A LOT ================= */
const SL = { body: '#4fd18a', light: '#9ff0c0', dark: '#2a8f5c', deep: '#1e6a44', eye: '#ffffff', pupil: '#0f1f2a', crown: '#f0b541', crownL: '#ffe29a', gem: '#ff5470', blade: '#e6fbff', hilt: '#b9772b' };
/** A slime knight blob `w`×`h` (feet on the bottom row), facing right; squash < 0 flattens, > 0 stretches. */
function slimeKnight(size, squash = 0, king = false) {
  const bw = king ? 26 : 8 + size * 2, bh = king ? 24 : 6 + size * 2;
  const W2 = bw + 12, H2 = bh + 12;
  return outlined(W2, H2, g => {
    const cx = W2 / 2 - 2, sq = 1 + squash * 0.15, rx = bw / 2 / sq, ry = (bh / 2) * sq, cy = H2 - 1 - ry;
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (ny > 0.55 ? Math.abs(nx) > 1 : nx * nx + ny * ny > 1) continue;         // flat-bottomed blob
      if (y >= H2 - 1) continue;
      const shade = nx * 0.5 + ny * 0.6;
      g.fillStyle = nx < -0.2 && ny < -0.25 && nx * nx + ny * ny > 0.35 ? SL.light : shade > 0.55 ? SL.deep : shade > 0.2 ? SL.dark : SL.body;
      g.fillRect(x, y, 1, 1);
    }
    const top = Math.round(cy - ry), ex = Math.round(cx + rx * 0.25), ey = Math.round(cy - ry * 0.25), es = king ? 3 : size > 2 ? 2 : 1;
    R_(g, SL.eye, ex - es - 1, ey, es + 1, es + 1); R_(g, SL.eye, ex + 2, ey, es + 1, es + 1);
    R_(g, SL.pupil, ex - 1, ey + es - (es > 1 ? 1 : 0), 1, 1); R_(g, SL.pupil, ex + 2 + es - 1, ey + es - (es > 1 ? 1 : 0), 1, 1);
    if (king || size > 1) R_(g, SL.deep, ex, ey + es + 2, 2, 1);                   // tiny determined mouth
    const cw = king ? 10 : 4 + (size > 3 ? 2 : 0), ch = king ? 5 : 3;              // crown
    const kx = Math.round(cx - cw / 2), ky = top - ch + 1;
    R_(g, SL.crown, kx, ky + ch - 2, cw, 2);
    for (let i = 0; i < cw; i += 2) R_(g, SL.crown, kx + i, ky, 1, ch - 1);
    R_(g, SL.crownL, kx, ky + ch - 2, cw, 1); R_(g, SL.gem, kx + (cw >> 1), ky + ch - 2, 1, 1);
    const sx = Math.round(cx + rx) - 1, sy = Math.round(cy);                        // wee sword
    line(g, SL.blade, sx + 1, sy - 1, sx + (king ? 8 : 4), sy - (king ? 8 : 4)); R_(g, SL.hilt, sx - 1, sy, 3, 1);
  });
}
export const slimeHero = [1, 2, 3, 4, 5].map(sz => ({ idle: both(slimeKnight(sz, 0)), squash: both(slimeKnight(sz, -1)), stretch: both(slimeKnight(sz, 1)) }));
export const slimeKing = { idle: both(slimeKnight(5, 0, true)), squash: both(slimeKnight(5, -1, true)) };
export const slimeIcons = {
  q: outlined(11, 11, g => { R_(g, SL.body, 2, 5, 7, 5); R_(g, SL.light, 3, 5, 3, 1); R_(g, SL.eye, 4, 6, 1, 1); R_(g, SL.eye, 6, 6, 1, 1); R_(g, SL.crown, 4, 3, 3, 2); }),
  e: outlined(11, 11, g => { R_(g, SL.body, 3, 3, 5, 5); R_(g, SL.light, 3, 3, 2, 1); for (const [x, y] of [[0, 0], [9, 0], [0, 9], [9, 9]]) R_(g, SL.light, x, y, 2, 2); line(g, SL.dark, 1, 1, 3, 3); line(g, SL.dark, 9, 1, 7, 3); line(g, SL.dark, 1, 9, 3, 7); line(g, SL.dark, 9, 9, 7, 7); }),
  r: outlined(11, 11, g => { R_(g, SL.crown, 1, 5, 9, 4); for (let i = 1; i < 10; i += 2) R_(g, SL.crown, i, 2, 1, 3); R_(g, SL.crownL, 1, 5, 9, 1); R_(g, SL.gem, 5, 6, 1, 2); }),
};

/* ================= HERO: MONKEY ================= */
const MK = { fur: '#8a5a34', furD: '#5e3a20', furL: '#b07a48', face: '#e8c090', faceD: '#c09060', eye: '#1b1330', band: '#c8323f', bandD: '#861f33', tooth: '#ffffff' };
/** 16×24 monkey (feet on row 23), facing right. */
function monkey({ legs = 'w1', arms = 'down', tuck = false }) {
  return outlined(16, 24, g => {
    // curly tail behind
    line(g, MK.fur, 4, 17, 1, 15); line(g, MK.fur, 1, 15, 1, 11); line(g, MK.fur, 1, 11, 3, 9); R_(g, MK.furL, 3, 9, 1, 1);
    // legs
    const L = tuck ? [[6, 18, 5, 20], [9, 18, 11, 19]] : { w1: [[6, 18, 5, 23], [9, 18, 10, 23]], w2: [[6, 18, 6, 23], [9, 18, 9, 23]], w3: [[6, 18, 7, 23], [9, 18, 8, 23]], jump: [[6, 18, 4, 21], [9, 18, 11, 21]], fall: [[6, 18, 4, 23], [9, 18, 12, 22]] }[legs];
    for (const [x0, y0, x1, y1] of L) { line(g, MK.fur, x0, y0, x1, y1, 2); R_(g, MK.faceD, x1 - 1, y1, 3, 1); }
    // body & belly
    R_(g, MK.fur, 5, 11, 7, 8); R_(g, MK.furD, 5, 17, 7, 2); R_(g, MK.face, 7, 12, 4, 5);
    // arms
    if (arms === 'up') { line(g, MK.fur, 5, 12, 4, 6, 2); line(g, MK.fur, 11, 12, 12, 6, 2); R_(g, MK.face, 3, 5, 2, 2); R_(g, MK.face, 12, 5, 2, 2); }
    else if (arms === 'throw') { line(g, MK.fur, 5, 12, 3, 16, 2); line(g, MK.fur, 11, 12, 14, 10, 2); R_(g, MK.face, 14, 9, 2, 2); }
    else { line(g, MK.fur, 5, 12, 3, 17, 2); line(g, MK.fur, 11, 12, 12, 17, 2); R_(g, MK.face, 2, 17, 2, 2); R_(g, MK.face, 12, 17, 2, 2); }
    // head: ears, bandana, face mask, eyes, grin
    R_(g, MK.fur, 3, 4, 2, 3); R_(g, MK.face, 3, 5, 1, 1); R_(g, MK.fur, 12, 4, 2, 3); R_(g, MK.face, 13, 5, 1, 1);
    R_(g, MK.fur, 5, 1, 7, 9); R_(g, MK.furL, 6, 1, 4, 1);
    R_(g, MK.band, 5, 3, 7, 2); R_(g, MK.bandD, 5, 4, 7, 1); line(g, MK.band, 5, 4, 2, 6); R_(g, MK.bandD, 1, 6, 2, 1);
    R_(g, MK.face, 7, 5, 5, 5); R_(g, MK.face, 6, 7, 1, 2);
    R_(g, MK.eye, 8, 6, 1, 1); R_(g, MK.eye, 11, 6, 1, 1); R_(g, MK.faceD, 9, 8, 2, 1);
    R_(g, MK.eye, 8, 9, 4, 1); R_(g, MK.tooth, 9, 9, 2, 1);
  });
}
const MK_POSES = ['w1', 'w2', 'w3', 'jump', 'fall'];
export const monkeyHero = Object.fromEntries(MK_POSES.map(k => [k, both(monkey({ legs: k }))]));
export const monkeyExtra = { flip: both(monkey({ legs: 'jump', tuck: true, arms: 'up' })), carry: both(monkey({ legs: 'w1', arms: 'up' })), throw: both(monkey({ legs: 'w1', arms: 'throw' })) };
/** Little helper monkeys for the ultimate (12×16). */
export const monkeyAlly = [0, 1].map(f => both(outlined(12, 16, g => {
  line(g, MK.fur, 3, 12, 0, 10); line(g, MK.fur, 0, 10, 1, 7);
  line(g, MK.fur, 4, 12, f ? 3 : 4, 15, 2); line(g, MK.fur, 7, 12, f ? 8 : 7, 15, 2);
  R_(g, MK.fur, 3, 7, 6, 6); R_(g, MK.face, 5, 8, 3, 4);
  line(g, MK.fur, 8, 8, 11, f ? 5 : 7, 1);
  R_(g, MK.fur, 3, 1, 6, 6); R_(g, MK.fur, 2, 3, 1, 2); R_(g, MK.fur, 9, 3, 1, 2);
  R_(g, '#f0b541', 3, 2, 6, 1); R_(g, MK.face, 5, 3, 4, 3); R_(g, MK.eye, 6, 4, 1, 1); R_(g, MK.eye, 8, 4, 1, 1); R_(g, MK.eye, 6, 6, 3, 1);
})));
export const bananaFrames = [0, 1, 2, 3].map(f => outlined(9, 9, g => {
  g.translate(4.5, 4.5); g.rotate(f * Math.PI / 2); g.translate(-4.5, -4.5);
  line(g, '#ffe14d', 2, 6, 5, 6); line(g, '#ffe14d', 5, 6, 7, 3); line(g, '#c9a820', 2, 7, 5, 7); R_(g, '#6b4226', 7, 2, 1, 1); R_(g, '#6b4226', 1, 6, 1, 1);
}));
export const peelSprite = outlined(10, 5, g => { R_(g, '#ffe14d', 3, 2, 4, 2); line(g, '#ffe14d', 3, 3, 0, 4); line(g, '#ffe14d', 6, 3, 9, 4); line(g, '#e8c040', 4, 2, 3, 0); R_(g, '#fff4c9', 4, 2, 2, 1); });
export const monkeyIcons = {
  q: outlined(11, 11, g => { line(g, '#ffe14d', 2, 7, 5, 8, 2); line(g, '#ffe14d', 5, 8, 8, 4, 2); R_(g, '#6b4226', 8, 3, 1, 1); }),
  e: outlined(11, 11, g => { R_(g, MK.face, 2, 4, 7, 5); for (let i = 0; i < 4; i++) R_(g, MK.face, 2 + i * 2, 2, 1, 2); R_(g, MK.faceD, 2, 8, 7, 1); R_(g, '#ff5470', 8, 0, 2, 2); }),
  r: outlined(11, 11, g => { for (const [x, y] of [[0, 3], [6, 3], [3, 6]]) { R_(g, MK.fur, x, y, 5, 5); R_(g, MK.face, x + 1, y + 2, 3, 2); R_(g, MK.eye, x + 1, y + 2, 1, 1); R_(g, MK.eye, x + 3, y + 2, 1, 1); } }),
};

/* ================= BOSS: THE BRASS WIDOW ================= */
/** Rotate a canvas by quarter turns (pixel-exact). */
function quarter(src, q) {
  q = ((q % 4) + 4) % 4;
  const sw = src.width, sh = src.height, { c, g } = canvas(q % 2 ? sh : sw, q % 2 ? sw : sh);
  g.translate(c.width / 2, c.height / 2); g.rotate(q * Math.PI / 2); g.drawImage(src, -sw / 2, -sh / 2);
  return c;
}
const BW = { brass: '#c08a3a', brassL: '#ffe29a', brassD: '#8f5f24', iron: '#4a4550', ironD: '#2e2a33', eye: '#ff4d6d', face: '#f3e6c4', hand: '#3a2410' };
/** Base pose: standing on a floor, facing right. 36×24, feet on the bottom row. */
function widow(frame) {
  return outlined(36, 24, g => {
    for (let i = 0; i < 4; i++) {                                               // 8 legs, 4 each side
      for (const side of [-1, 1]) {
        const hx = 18 + side * (2 + i * 2), kx = 18 + side * (8 + i * 3), ky = 3 + ((i + frame) % 2) * 3, fx = 18 + side * (10 + i * 3), fy = 23;
        line(g, BW.iron, hx, 13, kx, ky); line(g, BW.iron, kx, ky, fx, fy); R_(g, BW.brassL, kx, ky, 1, 1);
      }
    }
    for (let y = 0; y < 24; y++) for (let x = 0; x < 36; x++) {                // abdomen
      const d = ((x - 14) / 10) ** 2 + ((y - 11) / 7) ** 2;
      if (d > 1) continue;
      g.fillStyle = d > 0.8 ? BW.brassD : (x < 12 && y < 9) ? BW.brassL : BW.brass; g.fillRect(x, y, 1, 1);
    }
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= 10) R_(g, x * x + y * y > 7 ? BW.brassD : BW.face, 13 + x, 10 + y, 1, 1);
    line(g, BW.hand, 13, 10, 13, 8); line(g, BW.hand, 13, 10, 15, 10);           // a tiny clock face on its back
    R_(g, BW.iron, 23, 9, 7, 7); R_(g, BW.ironD, 23, 14, 7, 2);                 // head
    R_(g, BW.eye, 27, 10, 2, 2); R_(g, BW.eye, 25, 11, 1, 1); R_(g, BW.eye, 29, 12, 1, 1);
    line(g, BW.brassL, 30, 14, 32, 16); line(g, BW.brassL, 28, 15, 30, 17);     // mandibles
  });
}
const WIDOW_BASE = [widow(0), widow(1)];
/** [frame][side 0 floor,1 right wall,2 ceiling,3 left wall][dir 'r'|'l'] — legs always point at the surface. */
export const widowSprites = WIDOW_BASE.map(b => {
  const f = flip(b), wf = white(b), wff = white(f);
  const mk = (src, q) => quarter(src, q);
  return [0, 1, 2, 3].map(side => {
    const q = [0, 3, 2, 1][side];
    return { r: mk(b, q), l: mk(f, q), wr: mk(wf, q), wl: mk(wff, q) };
  });
});
export const webBall = disc(3, (dx, dy, d) => d > 2.6 ? '#8f8aa8' : (Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6 || Math.abs(dx - dy) < 0.8) ? '#ffffff' : ['#e6e2f0', 0.7]);
export const webPatch = pixels(28, 6, (x, y) => (y === 5 || (x + y * 3) % 7 === 0 || (x - y * 3 + 40) % 9 === 0) && (y > 1 || x % 3 === 0) ? ['#e6e2f0', y === 5 ? 0.8 : 0.6] : null);

/* ================= NEW FOES: SUNKEN / CLOCKWORK / MOON ================= */
const ell = (g, col, cx, cy, rx, ry) => { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x / rx) ** 2 + (y / ry) ** 2 <= 1) R_(g, col, cx + x, cy + y, 1, 1); };
// Sunken: drifting jellyfish, harpoon diver
export const jelly = [0, 1].map(f => both(outlined(13, 16, g => {
  ell(g, '#c86ab8', 6, 5, 6, 4); ell(g, '#e98ad8', 6, 4, 5, 3); R_(g, '#ffd8f6', 3, 2, 3, 1);
  R_(g, '#8a3a80', 1, 8, 11, 1);
  for (let i = 0; i < 4; i++) { const x = 2 + i * 3; line(g, '#e98ad8', x, 9, x + ((i + f) % 2 ? 1 : -1), 12); line(g, '#b86ab0', x + ((i + f) % 2 ? 1 : -1), 12, x, 15); }
  R_(g, '#1b1330', 4, 5, 1, 1); R_(g, '#1b1330', 8, 5, 1, 1);
})));
export const diver = [0, 1].map(f => both(outlined(14, 20, g => {
  R_(g, '#3a5a6a', 3, 10, 7, 6); R_(g, '#2a4250', 3, 14, 7, 2);                  // suit
  line(g, '#2a4250', 4, 16, 3 + f, 19, 2); line(g, '#2a4250', 8, 16, 9 - f, 19, 2); R_(g, '#5a3a24', 2, 19, 4, 1); R_(g, '#5a3a24', 7, 19, 4, 1);
  ell(g, '#c08a3a', 6, 5, 5, 5); ell(g, '#ffe29a', 5, 3, 2, 1);                  // brass helmet
  ell(g, '#1d4462', 7, 5, 3, 2); R_(g, '#8fe8ff', 6, 4, 2, 1); R_(g, '#ff4d6d', 8, 5, 1, 1);
  R_(g, '#6a6a6a', 9, 12, 5, 2); R_(g, '#c9c3ef', 13, 12, 1, 2);                 // harpoon gun
})));
// Clockwork: wind-up tin soldier, propeller drone
export const tinSoldier = [0, 1].map(f => both(outlined(12, 20, g => {
  R_(g, '#b83a45', 3, 0, 6, 5); R_(g, '#f0b541', 4, 2, 4, 2); R_(g, '#1b1330', 2, 4, 8, 1);   // shako
  R_(g, '#f0c090', 4, 5, 5, 3); R_(g, '#1b1330', 6, 6, 1, 1); R_(g, '#b83a45', 5, 7, 3, 1);
  R_(g, '#2f4a8a', 3, 8, 6, 7); line(g, '#ffffff', 3, 8, 8, 14); line(g, '#ffffff', 8, 8, 3, 14);
  R_(g, '#c08a3a', 0, 9, 3, 1); R_(g, '#c08a3a', 0, 8, 1, 3);                    // wind-up key
  R_(g, '#9a6434', 8, 10, 4, 1); R_(g, '#c9c3ef', 11, 9, 1, 2);                  // musket
  R_(g, '#1b1330', 4, 15, 2, 4 - f); R_(g, '#1b1330', 7, 15, 2, 3 + f); R_(g, '#2e2a33', 3, 19, 7, 1);
})));
export const drone = [0, 1].map(f => both(outlined(14, 12, g => {
  line(g, '#aeabcb', f ? 1 : 4, 1, f ? 12 : 9, 1); R_(g, '#6a6a6a', 6, 1, 2, 3);
  ell(g, '#c08a3a', 7, 7, 4, 4); for (let a = 0; a < 8; a++) R_(g, '#8f5f24', 7 + Math.round(Math.cos(a) * 5), 7 + Math.round(Math.sin(a) * 5), 1, 1);
  R_(g, '#ffe29a', 5, 5, 2, 1); R_(g, '#1b1330', 7, 6, 3, 3); R_(g, '#ff4d6d', 8, 7, 1, 1);
})));
// Moon: crater hopper, crystal sentry
export const hopper = [0, 1].map(f => both(outlined(14, 16, g => {
  const up = f ? -2 : 0;
  line(g, '#dcd8cc', 5, 5 + up, 4, 0 + up); line(g, '#dcd8cc', 8, 5 + up, 9, 0 + up); R_(g, '#ff9aa8', 4, 1 + up, 1, 2); R_(g, '#ff9aa8', 9, 1 + up, 1, 2);
  ell(g, '#dcd8cc', 7, 10 + (f ? -1 : 1), 5, f ? 4 : 3); ell(g, '#fffaf0', 6, 9 + (f ? -1 : 1), 3, 2);
  R_(g, '#ff4d6d', 8, 7 + up, 1, 1); R_(g, '#1b1330', 11, 9 + up, 1, 1);
  R_(g, '#a8a399', 3, 14, 4, 1); R_(g, '#a8a399', 8, 14, 4, 1);
})));
export const sentry = [0, 1].map(f => both(outlined(14, 16, g => {
  for (let y = 0; y < 16; y++) { const hw = Math.round(6 - Math.abs(y - 7.5) * 0.8); if (hw > 0) R_(g, y < 7 ? '#bff4ff' : '#6fcbe8', 7 - hw, y, hw * 2, 1); }
  R_(g, '#ffffff', 5, 3, 2, 3); R_(g, '#1d4462', 5, 7, 4, 3); R_(g, f ? '#ffe14d' : '#ff9a4d', 6, 8, 2, 1);
})));
export const starShot = sprite(['..y..', '.yWy.', 'yWWWy', '.yWy.', '..y..'], { y: '#ffe14d', W: '#fff4c9' });
Object.assign(glows, { star: glow(7, '#ffe14d', 0.5), jelly: glow(12, '#e98ad8', 0.35) });

/* ================= MOON ALIENS (reskins + new) ================= */
const AL = { grey: '#b8c0c8', greyD: '#7e8894', eye: '#0a0a14', green: '#6ee07a', greenD: '#2f8a4a', greenL: '#b8ffc0', suit: '#e6e8f0', suitD: '#9aa0b4', glass: '#8fe8ff', glassD: '#3f9fc0', plasma: '#9dff6a', purple: '#9b5cff', purpleD: '#5a2fb0', red: '#ff4d6d', metal: '#a8b0c0', metalD: '#606878', light: '#ffe14d' };
const legPair = (g, f, col, x = 4, y = 12, len = 3) => { R_(g, col, x, y, 2, len - (f ? 1 : 0)); R_(g, col, x + 3, y, 2, len - (f ? 0 : 1)); };
export const alien = {
  // archer → grey gunner with a ray gun
  archer: [0, 1].map(f => both(outlined(12, 16, g => {
    ell(g, AL.grey, 5, 4, 4, 4); R_(g, AL.grey, 3, 7, 5, 2);
    R_(g, AL.eye, 3, 3, 2, 3); R_(g, AL.eye, 6, 3, 2, 3); R_(g, '#ffffff', 3, 3, 1, 1); R_(g, '#ffffff', 6, 3, 1, 1);
    R_(g, AL.suit, 3, 9, 5, 4); R_(g, AL.suitD, 3, 12, 5, 1);
    R_(g, AL.metalD, 7, 10, 4, 2); R_(g, AL.plasma, 11, 10, 1, 2);
    legPair(g, f, AL.grey, 3, 13, 3);
  }))),
  // brute → armoured trooper in a glass dome
  brute: [0, 1].map(f => both(outlined(12, 20, g => {
    ell(g, AL.glass, 6, 4, 4, 4); ell(g, AL.green, 6, 5, 2, 2); R_(g, AL.eye, 5, 4, 1, 1); R_(g, AL.eye, 7, 4, 1, 1); R_(g, '#ffffff', 4, 1, 2, 1);
    R_(g, AL.metal, 2, 8, 8, 8); R_(g, AL.metalD, 2, 13, 8, 3); R_(g, AL.light, 5, 10, 2, 1);
    R_(g, AL.metal, 0, 9, 2, 5); R_(g, AL.metal, 10, 9, 2, 5);
    legPair(g, f, AL.metalD, 3, 16, 4);
  }))),
  bruteShield: both(pixels(6, 13, (x, y) => (x === 0 || x === 5 || y === 0 || y === 12) ? ['#8fe8ff', 0.9] : ((x + y) % 3 === 0 ? ['#bff4ff', 0.5] : ['#58d7ff', 0.28]))),
  // bomber → little green carrying a plasma charge
  bomber: [0, 1].map(f => both(outlined(10, 14, g => {
    ell(g, AL.plasma, 5, 2, 2, 2); R_(g, '#ffffff', 4, 1, 1, 1);
    R_(g, AL.green, 2, 3, 1, 3); R_(g, AL.green, 7, 3, 1, 3);
    ell(g, AL.green, 5, 7, 3, 3); R_(g, AL.eye, 3, 6, 2, 2); R_(g, AL.eye, 6, 6, 2, 2);
    line(g, AL.greenD, 4, 3, 3, 1); line(g, AL.greenD, 6, 3, 7, 1);
    R_(g, AL.greenD, 3, 10, 4, 2); legPair(g, f, AL.green, 3, 12, 2);
  }))),
  // slime → violet alien goo on eye stalks
  slime: {
    up: both(outlined(14, 12, g => { ell(g, AL.purple, 7, 8, 6, 3); R_(g, AL.purpleD, 2, 10, 10, 1); line(g, AL.purple, 5, 6, 4, 2); line(g, AL.purple, 9, 6, 10, 2); ell(g, '#ffffff', 4, 2, 1, 1); ell(g, '#ffffff', 10, 2, 1, 1); R_(g, AL.eye, 4, 2, 1, 1); R_(g, AL.eye, 10, 2, 1, 1); })),
    squash: both(outlined(14, 12, g => { ell(g, AL.purple, 7, 9, 6, 2); R_(g, AL.purpleD, 2, 10, 10, 1); line(g, AL.purple, 5, 8, 4, 5); line(g, AL.purple, 9, 8, 10, 5); ell(g, '#ffffff', 4, 5, 1, 1); ell(g, '#ffffff', 10, 5, 1, 1); R_(g, AL.eye, 4, 5, 1, 1); R_(g, AL.eye, 10, 5, 1, 1); })),
  },
  // bat → mini flying saucer
  bat: [0, 1].map(f => both(outlined(12, 7, g => {
    ell(g, AL.glass, 6, 2, 2, 2); ell(g, AL.metal, 6, 4, 5, 1); R_(g, AL.metalD, 2, 5, 8, 1);
    for (let i = 0; i < 3; i++) R_(g, (i + f) % 2 ? AL.light : AL.red, 3 + i * 3, 4, 1, 1);
  }))),
  // cultist → floating psychic brain
  cultist: [0, 1].map(f => both(outlined(12, 16, g => {
    ell(g, '#ff9ad0', 6, 4, 5, 4); line(g, '#c85a98', 3, 3, 6, 5); line(g, '#c85a98', 8, 2, 7, 6); R_(g, '#ffd0ea', 3, 1, 3, 1);
    ell(g, AL.grey, 6, 9, 2, 2); R_(g, AL.eye, 5, 9, 1, 1); R_(g, AL.eye, 7, 9, 1, 1);
    R_(g, AL.purpleD, 3, 11, 6, 3); R_(g, AL.purple, 4, 14, 1, 1 + f); R_(g, AL.purple, 7, 14, 1, 2 - f);
  }))),
  // barrel → fuel canister
  barrel: both(outlined(10, 12, g => { R_(g, AL.suit, 1, 1, 8, 10); R_(g, AL.suitD, 7, 1, 2, 10); for (let y = 3; y < 9; y += 2) R_(g, AL.red, 1, y, 8, 1); R_(g, AL.metalD, 3, 0, 4, 1); })),
};
// new: UFO & alien egg
export const ufo = [0, 1, 2].map(f => both(outlined(28, 14, g => {
  ell(g, AL.glass, 14, 4, 5, 4); ell(g, AL.green, 14, 5, 2, 2); R_(g, AL.eye, 13, 4, 1, 1); R_(g, AL.eye, 15, 4, 1, 1); R_(g, '#ffffff', 12, 1, 2, 1);
  ell(g, AL.metal, 14, 9, 13, 3); R_(g, AL.metalD, 3, 10, 22, 2); R_(g, '#d8dde8', 6, 7, 16, 1);
  for (let i = 0; i < 6; i++) R_(g, (i + f) % 3 === 0 ? AL.light : (i + f) % 3 === 1 ? AL.red : AL.plasma, 4 + i * 4, 9, 2, 1);
  R_(g, AL.metalD, 10, 12, 8, 2);
})));
export const alienEgg = [0, 1].map(f => both(outlined(12, 14, g => {
  ell(g, AL.purpleD, 6, 8, 5, 6); ell(g, AL.purple, 6, 7, 4, 5); R_(g, '#d0b0ff', 3, 4, 2, 2);
  R_(g, AL.plasma, 5, 6 + f, 2, 2); line(g, '#2e1a52', 4, 11, 8, 9);
  R_(g, '#3a2458', 1, 13, 10, 1);
})));
export const plasmaBall = disc(3, (dx, dy, d) => d > 2.6 ? AL.greenD : dx + dy < -1 ? '#ffffff' : AL.plasma);
Object.assign(glows, { plasma: glow(10, '#9dff6a', 0.45), tractor: glow(18, '#9dff6a', 0.25) });
export const puddleSprite = outlined(12, 4, g => { R_(g, '#4fd18a', 1, 1, 10, 2); R_(g, '#9ff0c0', 2, 1, 4, 1); R_(g, '#2a8f5c', 1, 2, 10, 1); R_(g, '#4fd18a', 4, 0, 3, 1); });
export const gooShot = disc(3, (dx, dy, d) => d > 2.6 ? '#2a8f5c' : dx + dy < -1 ? '#d8ffe6' : d < 1.5 ? '#9ff0c0' : '#4fd18a');
Object.assign(slimeIcons, {
  q: outlined(11, 11, g => { for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) { const d = Math.hypot(x - 5, y - 6); if (d < 3.6 || (y < 6 && Math.abs(x - 5) < (6 - y) * 0.5)) R_(g, d < 2 && y > 4 ? '#9ff0c0' : '#4fd18a', x, y, 1, 1); } R_(g, '#ffffff', 4, 5, 1, 1); }),
  e: outlined(11, 11, g => { ell(g, '#4fd18a', 5, 7, 4, 3); R_(g, '#9ff0c0', 3, 5, 2, 1); line(g, '#ffe29a', 5, 3, 5, 0); line(g, '#ffe29a', 5, 0, 3, 2); line(g, '#ffe29a', 5, 0, 7, 2); }),
});
slimeIcons.smash = outlined(11, 11, g => { ell(g, '#4fd18a', 5, 6, 4, 4); R_(g, '#9ff0c0', 3, 3, 3, 1); for (let i = 0; i < 3; i++) R_(g, '#2a8f5c', 3 + i * 2, 4, 1, 3); line(g, '#ffffff', 9, 1, 10, 3); line(g, '#ffffff', 10, 6, 10, 8); });

/* ================= HERO: GOBLINBOMBER ================= */
const GB = { skin: '#79b84e', skinD: '#3f6e33', skinL: '#b5e08a', vest: '#b8452f', vestL: '#e0694a', boot: '#2e1d14', goggle: '#d9a441', lens: '#8fe8ff', bomb: '#2a2440', bombL: '#5a5578', fuse: '#ff7b2e' };
const GB_PAL = {
  c: '#5a3a22', C: '#8a5a34', y: GB.goggle, b: GB.lens, w: '#ffffff', G: GB.skinD, g: GB.skin, l: GB.skinL, n: '#5d9440', N: GB.skinD,
  k: '#1b1330', t: '#fff4c9', s: '#9a7a4e', S: '#6a4e30', B: GB.bomb, h: GB.bombL, v: GB.vest, V: GB.vestL, L: '#3a2216', Y: '#ffe14d',
  p: '#4a3a5a', o: GB.boot, r: GB.fuse, f: '#c9a820', R: '#e8452f', Q: '#ffb04d',
};
// aviator cap + goggles, big ears, hooked nose, toothy grin; bomb sack on his back with lit fuses (faces right)
const GB_TOP = [
  '.....cccc.......',
  '....cCCCCc......',
  '...cCCCCCCc.....',
  'GG.yyyyyyyyy..GG',
  '.Glywbyywbyglgg.',
  'Y.Gyyyyyyyyyggg.',
  'rf.Gggggggggnn..',
  '.f.GgggggggggnN.',
  'sss.GgktktkggG..',
  'sSss.GGgggggg...',
];
const GB_BODY = {
  hold: [
    'sRRsvVvvvg......',
    'sQRsvVvvvggg....',
    'sssSvVvvv..gg.Y.',
    'sRssvVvvv..gRRr.',
    'ssssLLyLL.RQQRR.',
    '.sss.pppp..RRR..',
  ],
  throw: [
    'sRRsvVvvvggggggl',
    'sQRsvVvvv.......',
    'sssSvVvvv.......',
    'sRssvVvvv.......',
    'ssssLLyLL.......',
    '.sss.pppp.......',
  ],
};
const GB_HIPS = ['..s..pppp.......', '.....pp.pp......'];
const GB_LEGS = {
  w1:   ['....gg...gg.....', '....gg....gg....', '...gg.....gg....', '...gg......gg...', '..oooo.....oooo.', '..oooo.....oooo.'],
  w2:   ['.....gg.gg......', '.....gg.gg......', '.....gg.gg......', '.....gg.gg......', '.....ooooooooo..', '.....ooooooooo..'],
  w3:   ['.....gg..gg.....', '....gg....gg....', '....gg.....gg...', '...gg......gg...', '..oooo.....oooo.', '..oooo.....oooo.'],
  jump: ['....gg...gg.....', '...gg.....gg....', '..oooo....oooo..', '..oooo....oooo..', '................', '................'],
  fall: ['....gg...gg.....', '...gg.....gg....', '...gg.....gg....', '..gg.......gg...', '.ooo.......ooo..', '................'],
};
function goblin({ legs = 'w1', arm = 'hold' }) {
  const art = sprite([...GB_TOP, ...GB_BODY[arm], ...GB_HIPS, ...GB_LEGS[legs]], GB_PAL);
  return outlined(16, 24, g => g.drawImage(art, 0, 0));
}
const GB_POSES = ['w1', 'w2', 'w3', 'jump', 'fall'];
export const goblinHero = Object.fromEntries(GB_POSES.map(k => [k, both(goblin({ legs: k }))]));
export const goblinThrow = both(goblin({ legs: 'w1', arm: 'throw' }));
/** Barrel Rider: the goblin surfing a huge rolling barrel (22×28). */
export const goblinRide = [0, 1, 2, 3].map(f => both(outlined(22, 28, g => {
  ell(g, '#b83a45', 11, 20, 9, 7); R_(g, '#7a1f35', 2, 22, 18, 3);
  for (const x of [5, 11, 17]) R_(g, '#8c89ab', ((x + f * 2) % 18) + 2, 14, 1, 13);          // rolling hoops
  R_(g, '#f0b541', 9, 19, 4, 3); R_(g, '#1b1330', 10, 20, 2, 1);
  line(g, GB.skin, 9, 12, 8, 14, 2); line(g, GB.skin, 13, 12, 14, 14, 2); R_(g, GB.vest, 8, 7, 6, 5);
  line(g, GB.skin, 8, 8, 4, 5, 2); line(g, GB.skin, 14, 8, 18, 5, 2);                          // arms out for balance
  line(g, GB.skin, 8, 3, 4, 0, 2); line(g, GB.skin, 14, 3, 18, 0, 2); ell(g, GB.skin, 11, 3, 3, 3);
  R_(g, GB.goggle, 8, 1, 7, 2); R_(g, GB.lens, 9, 1, 2, 2); R_(g, GB.lens, 12, 1, 2, 2); R_(g, '#1b1330', 11, 5, 3, 1);
})));
/** Sticky charge: bright casing + blinking beacon so it reads on any background (9×9). */
export const chargeSprite = [0, 1].map(f => outlined(9, 9, g => {
  ell(g, '#e8452f', 4, 5, 3, 3); R_(g, '#ffb04d', 1, 5, 7, 1); R_(g, '#ff8a6a', 3, 3, 1, 1);
  R_(g, '#5a5578', 3, 1, 3, 1); R_(g, f ? '#ffffff' : '#ff4d6d', 4, 0, 1, 1); R_(g, f ? '#fff4c9' : '#8a1a2a', 4, 5, 1, 1);
}));
glows.charge = glow(12, '#ff6a3a', 0.55);
export const goblinIcons = {
  q: outlined(11, 11, g => { ell(g, '#e8452f', 5, 6, 3, 3); R_(g, '#ffb04d', 2, 6, 7, 1); R_(g, '#ff8a6a', 4, 4, 1, 1); line(g, '#c9a820', 7, 3, 9, 1); R_(g, '#ffe14d', 9, 0, 2, 2); }),
  e: outlined(11, 11, g => { R_(g, '#6b4226', 2, 6, 7, 4); R_(g, '#c08a3a', 5, 1, 1, 5); R_(g, '#c08a3a', 3, 1, 5, 1); R_(g, '#ff4d6d', 3, 7, 2, 1); }),
  r: outlined(11, 11, g => { ell(g, '#b83a45', 5, 6, 4, 4); R_(g, '#8c89ab', 1, 6, 9, 1); R_(g, '#8c89ab', 5, 2, 1, 8); R_(g, '#f0b541', 4, 5, 3, 3); }),
};

/* ================= HERO: THE NINJA ================= */
const NJ_PAL = {
  n: '#3b3566', N: '#5a5294', d: '#26213f', s: '#e8c090', w: '#ffffff', R: '#e8364f', r: '#a61e3a',
};
// hooded, eye slit, red headband + scarf trailing behind (faces right). Chunky head, short legs — the house proportions.
const NJ_TOP = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....nnnnn......',
  '...nnNNNNNnn....',
  '..nNNNNNNNNNn...',
  'rRRRRRRRRRRRR...',
  'r.nnssswssswn...',
  '.rnnnnnnnnnnn...',
  '..nnnnnnnnnnn...',
  '...nnnnnnnnn....',
  'rR.RRRRRRRRr....',
];
const NJ_BODY = {
  hold: ['.r.dnNNNnnnnd...', '...dnNNnnnnnd...', '..dnnNnnnnnnnd..', '..dnnNnnnnnnnd..', '..snRRRRRRRRns..', '...nNnnnnnnn....', '...nnnnnnnnn....'],
  throw: ['.r.dnNNNnnnnd...', '...dnNNnnnnnnnns', '..dnnNnnnnnnn...', '..dnnNnnnnnnn...', '..snRRRRRRRRn...', '...nNnnnnnnn....', '...nnnnnnnnn....'],
  dash: ['r..dnNNNnnnnd...', 'snndnNNnnnnnd...', '..dnnNnnnnnnnd..', '..dnnNnnnnnnnd..', '..dnRRRRRRRRnd..', '...nNnnnnnnn....', '...nnnnnnnnn....'],
};
const E16 = '................';
const NJ_LEGS = {                                   // short, bent, low to the ground
  w1: ['...nnn...nnn....', '...nnn...nnn....', '...dddd..dddd...'],             // idle: straight legs, feet forward
  w2: ['....nnnnnn......', '....nnn.nnn.....', '...dddd.dddd....'],
  w3: ['...nnn...nnn....', '..nnn.....nnn...', '..dddd....dddd..'],             // stride: one leg back, one forward
  jump: ['..nnn...nnn.....', '..ddd...ddd.....', E16],
  fall: ['...nn...nn......', '..nnn...nnn.....', '.ddd.....ddd....'],
};
function ninja(legs, arm = 'hold') {
  const art = sprite([...NJ_TOP, ...NJ_BODY[arm], ...NJ_LEGS[legs]], NJ_PAL);
  return outlined(16, 24, g => g.drawImage(art, 0, 0));
}
export const ninjaHero = Object.fromEntries(['w1', 'w2', 'w3', 'jump', 'fall'].map(k => [k, both(ninja(k))]));
export const ninjaThrow = both(ninja('w1', 'throw'));
export const ninjaDash = both(ninja('w3', 'dash'));
/** Spinning shuriken (2 frames: + and ×). */
export const shurikenFrames = [0, 1].map(f => outlined(7, 7, g => {
  if (f) { line(g, '#c9c3ef', 1, 1, 5, 5); line(g, '#c9c3ef', 5, 1, 1, 5); R_(g, '#ffffff', 1, 1, 1, 1); R_(g, '#ffffff', 5, 5, 1, 1); }
  else { R_(g, '#c9c3ef', 3, 0, 1, 7); R_(g, '#c9c3ef', 0, 3, 7, 1); R_(g, '#ffffff', 3, 0, 1, 2); R_(g, '#ffffff', 5, 3, 2, 1); }
  R_(g, '#3b3566', 3, 3, 1, 1);
}));
/** FURY katana: held up-forward (handle anchor 1,10) and levelled for the slash (handle anchor 0,2). Two frames = blade shimmer. */
export const katanaUp = [0, 1].map(f => both(outlined(12, 12, g => {
  line(g, '#2a1428', 0, 11, 2, 9); R_(g, '#e8364f', 1, 10, 1, 1);
  R_(g, '#f0b541', 2, 8, 2, 2);
  line(g, f ? '#ffffff' : '#ffd6de', 4, 7, 11, 0); line(g, '#ff4d6d', 4, 8, 10, 2);
})));
export const katanaFwd = [0, 1].map(f => both(outlined(16, 4, g => {
  R_(g, '#2a1428', 0, 1, 4, 2); R_(g, '#e8364f', 1, 1, 1, 2);
  R_(g, '#f0b541', 4, 0, 1, 4);
  R_(g, f ? '#ffffff' : '#ffd6de', 5, 1, 10, 1); R_(g, '#ff4d6d', 5, 2, 9, 1); R_(g, '#ffffff', 15, 1, 1, 1);
})));
glows.katana = glow(14, '#ff3a5c', 0.5);
glows.fury = glow(20, '#ff3a5c', 0.28);
export const ninjaIcons = {
  q: outlined(11, 11, g => { R_(g, '#c9c3ef', 5, 1, 1, 9); R_(g, '#c9c3ef', 1, 5, 9, 1); line(g, '#8c89ab', 3, 3, 7, 7); line(g, '#8c89ab', 7, 3, 3, 7); R_(g, '#ffffff', 5, 1, 1, 2); R_(g, '#3b3566', 5, 5, 1, 1); }),
  e: outlined(11, 11, g => { R_(g, '#5a5294', 6, 3, 3, 5); R_(g, '#e8364f', 6, 4, 3, 1); for (let i = 0; i < 3; i++) R_(g, i === 1 ? '#ffffff' : '#8fe8ff', 0 + i, 3 + i * 2, 4 - i, 1); }),
  r: outlined(11, 11, g => { line(g, '#2a1428', 1, 10, 3, 8); R_(g, '#f0b541', 3, 7, 2, 2); line(g, '#ffffff', 5, 6, 10, 1); line(g, '#ff4d6d', 5, 7, 10, 2); }),
  slash: outlined(11, 11, g => { for (let a = -1.2; a <= 1.2; a += 0.15) R_(g, Math.abs(a) < 0.6 ? '#ffffff' : '#ff4d6d', 3 + Math.round(Math.cos(a) * 6), 5 + Math.round(Math.sin(a) * 5), 1, 1); R_(g, '#ffd6de', 2, 5, 3, 1); }),
};
/** Red FURY afterimage of the dash pose. */
export const ninjaRed = (() => {
  const s = ninja('w3', 'dash');
  const tint = src => { const { c, g } = canvas(16, 24); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ff4d6d'; g.fillRect(0, 0, 16, 24); return c; };
  return { r: tint(s), l: tint(flip(s)) };
})();

/* ================= DUEL: SKY THEME, CLOUD TILES, PREVIEWS ================= */
const CLOUD = ['#ffffff', '#f3efff', '#dcd6f6', '#bdb4e8', '#9d92d4'];
TILE_PALS.sky = { ST: NIGHT_ST, FILL: NIGHT_FILL, deco: 'cloud', cloud: true };
/** A far bank of cloud tops (tileable), drawn flat with a dithered crown. */
function cloudBank(y0, hex, alpha, seed) {
  return pixels(MIST_W, H, (x, y) => {
    const top = y0 - (9 * Math.abs(Math.sin(TAU * 4 * x / MIST_W + seed)) + 5 * Math.abs(Math.sin(TAU * 11 * x / MIST_W + seed * 2)) + 2 * Math.abs(Math.sin(TAU * 23 * x / MIST_W + seed)));
    if (y < top) return null;
    return y - top < 2 && bayer(x, y) < 0.5 ? null : [hex, alpha];
  });
}
THEMES.sky = {
  sky: makeSky(['#171640', '#1f225a', '#2a3172', '#384489', '#4d5b9f', '#6b74b0', '#9687b8', '#c79ab4']),
  stars: true, moon: true,
  layers: [
    { img: cloudBank(100, '#5c64a6', 0.6, 1), w: MIST_W, f: 0.02, drift: 2 },
    { img: cloudBank(118, '#7c7fbc', 0.65, 2.3), w: MIST_W, f: 0.04, drift: 5 },
    { img: cloudBank(134, '#a9a4d6', 0.7, 4.1), w: MIST_W, f: 0.06, drift: 9 },
  ],
};
/** Map card: the real level — sky, moon, scenery and the actual tiles — painted at full size over a crop
 *  (default: the whole map; campaign cards use the opening two screens) and shrunk to a thumbnail. */
export function levelThumb(L, w, h, crop = { x: 0, y: 0, w: L.cols * TILE, h: L.rows * TILE }) {
  const T = THEMES[L.theme], FW = crop.w, FH = crop.h, full = canvas(FW, FH), g = full.g;
  g.drawImage(T.sky, 0, 0, FW, FH);
  if (T.stars) for (const s of makeStars(90)) { g.fillStyle = s.bright ? '#ffffff' : '#8b84c0'; g.fillRect(Math.round(s.x * FW / W), Math.round(s.y), 2, 2); }
  if (T.earth) g.drawImage(earth, 50, 14);
  if (T.moon) g.drawImage(moon, FW - 70 - MOON_C, 34 - MOON_C);
  for (const l of T.layers) for (let x = -((l.w * 0.37) | 0); x < FW; x += l.w) g.drawImage(l.img, x, FH - l.img.height);
  g.drawImage(makeTileRenderer(L).canvas, crop.x, crop.y, FW, FH, 0, 0, FW, FH);
  const { c, g: t } = canvas(w, h);
  t.imageSmoothingEnabled = true; t.imageSmoothingQuality = 'high';
  t.filter = 'brightness(1.3) saturate(1.15)';                           // thumbnails read a touch brighter than the live scene
  t.drawImage(full.c, 0, 0, FW, FH, 0, 0, w, h);
  return c;
}
export const duelPreview = (L, w = 76, h = 44) => levelThumb(L, w, h);
/** Random-pick slot: every hero as a dark silhouette, shuffled behind a big "?". */
export const heroShadows = [wizard.w1.r, skeletonHero.w1.r, slimeHero[3].idle.r, monkeyHero.w1.r, goblinHero.w1.r, ninjaHero.w1.r].map(sp => tint(sp, '#3a3068'));

/* ================= WIZARD: BLOOD MOON PHASE ================= */
export const bloodOrbSprite = disc(3, (dx, dy, d) => d > 2.6 ? '#5a1024' : dx + dy < -1.5 ? '#ffffff' : d < 1.5 ? '#ffd6de' : '#ff5470');
Object.assign(glows, { gemRed: glow(18, '#ff5470', 0.4), gemBigRed: glow(28, '#ff8aa0', 0.55), bloodorb: glow(10, '#ff3a5c', 0.5) });
export const bloodIcons = {
  q: disc(5, (dx, dy, d) => d > 4.6 ? '#120d26' : dx + dy < -3 ? '#ffffff' : d < 2 ? '#ffd6de' : d < 3.5 ? '#ff5470' : '#8a1a3a'),
  e: pixels(11, 11, (x, y) => {                                            // a heart with a plus
    const heart = ['..XX...XX..', '.XXXX.XXXX.', 'XXXXXXXXXXX', 'XXXXXXXXXXX', 'XXXXXXXXXXX', '.XXXXXXXXX.', '..XXXXXXX..', '...XXXXX...', '....XXX....', '.....X.....', '...........'][y][x];
    if (heart !== 'X') return null;
    if ((x === 5 && y >= 2 && y <= 6) || (y === 4 && x >= 3 && x <= 7)) return '#ffffff';
    return y < 2 || x === 0 ? '#ff8aa0' : '#e8364f';
  }),
  r: pixels(11, 11, (x, y) => {                                            // a moon, half blue half red: the switch
    const d = Math.hypot(x - 5, y - 5);
    if (d > 5.2) return null;
    if (d > 4.3) return '#120d26';
    return x < 5 ? '#58d7ff' : x > 5 ? '#ff5470' : '#ffffff';
  }),
};
icons.r = bloodIcons.r;

/** HUD: one little face per troop monkey still with you (7×7). */
export const troopHead = outlined(7, 7, g => {
  R_(g, '#8a5a34', 1, 1, 5, 5); R_(g, '#8a5a34', 0, 2, 1, 2); R_(g, '#8a5a34', 6, 2, 1, 2);
  R_(g, '#e8c090', 2, 3, 3, 3); R_(g, '#1b1330', 2, 3, 1, 1); R_(g, '#1b1330', 4, 3, 1, 1); R_(g, '#b07a48', 2, 1, 3, 1);
});

/** Bone Warden's boulder (15×15): big, craggy, light-rimmed so it reads against night skies. */
export const boulderSprite = disc(7, (dx, dy, d) => {
  if (d > 6.4) return '#1b1330';
  if (dx + dy < -6) return '#e8e2cf';
  const n = hash((dx + 9) * 31 + (dy + 9) * 7);
  if (d > 5 && dx + dy > 3) return '#3a3656';
  return n < 0.12 ? '#524f6d' : n > 0.9 ? '#c9c3ef' : dx + dy < -2 ? '#aeabcb' : '#8c89ab';
});

/* ================= WOODLAND: HOLLOW GROVE ================= */
const BARK = { hi: '#8a5e38', body: '#5e3e24', dark: '#3a2416', out: '#1a0f08' };
const LEAF = ['#2f5a2e', '#3f7a3a', '#6ea84a', '#a8d86a'];
const GRASS = ['#a8d86a', '#6ea84a', '#3f7a3a'];
const SOIL = { body: '#4a3222', deep: '#3a261a', dark: '#2a1a10', warm: '#5a3c26', pebble: '#6f655a', pebbleHi: '#9a8e7e', root: '#6a4a2e', out: '#140c06' };
TILE_PALS.woodland = { ST: NIGHT_ST, FILL: NIGHT_FILL, deco: 'grass', soil: true, bark: true };

/** A tileable line of broadleaf trees: trunks + lumpy crowns lit from the setting sun (upper right). */
function makeTreeLine({ trunk, crown, lit, base, minR, maxR, gap, seed }) {
  const L = MOUNT_W, Rn = rng(seed), { c, g } = canvas(L, H);
  const dot = (x, y, col) => { g.fillStyle = col; g.fillRect(((x % L) + L) % L, y, 1, 1); };
  const blob = (cx, cy, r) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) / r;
      if (d > 1 || y < 0 || y >= H) continue;
      const rim = (dx * 0.7 - dy * 0.7) / r;
      dot(x, y, rim > 0.45 && bayer(x, y) < (rim - 0.35) * 1.6 ? lit : crown);
    }
  };
  let x = 0;
  while (x < L) {
    const r = minR + Rn() * (maxR - minR), cy = base - r * 1.25 - Rn() * 8, tw = Math.max(2, Math.round(r * 0.22));
    g.fillStyle = trunk;
    for (const ox of [0, -L, L]) g.fillRect(Math.round(x - tw / 2) + ox, Math.round(cy), tw, H - cy);
    for (let k = 0; k < 4; k++) blob(x + (Rn() - 0.5) * r * 1.2, cy + (Rn() - 0.5) * r * 0.7, r * (0.5 + Rn() * 0.35));
    x += gap * (0.6 + Rn() * 0.8);
  }
  g.fillStyle = trunk; g.fillRect(0, base, L, H - base);
  return c;
}
const warmRays = pixels(MIST_W, H, (x, y) => {
  const u = ((x - y * 0.65) % 150 + 150) % 150, v = Math.max(0, 1 - Math.abs(u - 50) / 14) * (1 - y / H);
  return v * 0.9 > bayer(x, y) ? ['#ffd89a', 0.14] : null;
});
function makeFerns(color) {
  const L = PINE_W, Rn = rng(19), { c, g } = canvas(L, H);
  g.fillStyle = color;
  for (let x = 0; x < L; x++) { const top = Math.round(130 + 3 * Math.sin(TAU * 5 * x / L) + 2 * Math.sin(TAU * 13 * x / L + 1)); g.fillRect(x, top, 1, H - top); }
  for (let k = 0; k < 60; k++) {                                          // fronds
    const x0 = Rn() * L, len = 6 + Rn() * 10, dir = Rn() < 0.5 ? -1 : 1;
    for (let i = 0; i < len; i++) g.fillRect(Math.round(x0 + dir * i * 0.8) % L, Math.round(130 - i * 0.9 + (i * i) / (len * 1.6)), 1, 2);
  }
  return c;
}
THEMES.woodland = {
  sky: makeSky(['#101a33', '#172a45', '#223b52', '#34505a', '#526457', '#806e52', '#b8844c', '#e0a458']),
  rays: warmRays, stars: true, moon: true,
  layers: [
    { img: makeMountains({ body: '#28403e', deep: '#203432', rim: '#5f7a5a', rimDark: '#34504a', lit: '#46604c', peak: '#7f966a', snowLine: 60 }), w: MOUNT_W, f: 0.06 },
    { img: makeTreeLine({ trunk: '#1e3230', crown: '#243c36', lit: '#48604a', base: 118, minR: 9, maxR: 15, gap: 22, seed: 5 }), w: MOUNT_W, f: 0.13 },
    { img: mist(98, 124, '#c9a870', 0.2, 8), w: MIST_W, f: 0.2, drift: 3 },
    { img: makeTreeLine({ trunk: '#122018', crown: '#16261c', lit: '#34502c', base: 132, minR: 14, maxR: 24, gap: 34, seed: 9 }), w: MOUNT_W, f: 0.3 },
    { img: makeFerns('#0b140e'), w: PINE_W, f: 0.5 },
  ],
};

/* ---- Treant: a slow, tanky walking tree ---- */
const TRE = { bark: '#5e3e24', barkL: '#8a5e38', barkD: '#3a2416', moss: '#4f7a3a', leaf: '#2f5a2e', leafM: '#3f7a3a', leafL: '#6ea84a', eye: '#ffc53d', hole: '#140c06' };
function treant(f) {
  return outlined(28, 36, g => {
    const legs = { w1: [[10, 27, 7, 34], [17, 27, 20, 34]], w2: [[10, 27, 11, 34], [17, 27, 16, 34]], raise: [[10, 27, 7, 34], [17, 27, 20, 34]], slam: [[10, 27, 6, 34], [17, 27, 21, 34]] }[f];
    for (const [x0, y0, x1, y1] of legs) { line(g, TRE.barkD, x0, y0, x1, y1, 3); R_(g, TRE.barkD, x1 - 2, 34, 6, 2); R_(g, TRE.bark, x1 - 1, 34, 1, 1); }
    // arms (branches) behind or above the body
    const arm = (x0, y0, x1, y1) => { line(g, TRE.barkD, x0, y0, x1, y1, 2); line(g, TRE.barkD, x1, y1, x1 + Math.sign(x1 - x0) * 2, y1 - 3, 1); ell(g, TRE.leafM, x1, y1 - 2, 2, 2); };
    if (f === 'raise') { arm(8, 14, 2, 3); arm(20, 14, 26, 3); }
    else if (f === 'slam') { arm(8, 15, 3, 28); arm(20, 15, 26, 29); }
    else { const s = f === 'w2' ? 1 : 0; arm(8, 14, 2, 22 - s); arm(20, 14, 26, 21 + s); }
    // trunk body: bark with grooves, a knothole face
    R_(g, TRE.bark, 8, 11, 12, 18); R_(g, TRE.barkL, 9, 11, 2, 17); R_(g, TRE.barkD, 18, 11, 2, 18);
    for (const [x, y] of [[13, 12], [15, 22], [12, 25], [16, 14]]) R_(g, TRE.barkD, x, y, 1, 3);
    R_(g, TRE.moss, 8, 23, 3, 2); R_(g, TRE.moss, 17, 18, 2, 3);
    R_(g, TRE.hole, 10, 15, 3, 2); R_(g, TRE.hole, 15, 15, 3, 2); R_(g, TRE.eye, 11, 15, 1, 1); R_(g, TRE.eye, 16, 15, 1, 1);
    R_(g, TRE.hole, 11, 20, 6, 2); R_(g, TRE.barkD, 12, 22, 4, 1);
    // leafy crown
    ell(g, TRE.leaf, 14, 7, 11, 7); ell(g, TRE.leafM, 13, 6, 9, 5); ell(g, TRE.leafL, 11, 4, 5, 3);
    for (const [x, y] of [[5, 7], [20, 4], [16, 9], [8, 3], [22, 8]]) R_(g, TRE.leafL, x, y, 2, 1);
  });
}
export const treantSprites = { w1: both(treant('w1')), w2: both(treant('w2')), raise: both(treant('raise')), slam: both(treant('slam')) };

/* ---- Squirrel: hops about and lobs acorns ---- */
const SQ = { fur: '#c0642e', furL: '#e89a58', furD: '#7a3a1a', belly: '#f3d2a2', eye: '#1b1106' };
function squirrel(pose) {
  return outlined(13, 12, g => {
    const hop = pose === 'hop';
    // big tail curling up behind (left)
    ell(g, SQ.fur, 3, hop ? 5 : 4, 3, 4); ell(g, SQ.furL, 2, hop ? 4 : 3, 1, 2);
    ell(g, SQ.fur, 7, hop ? 8 : 8, 3, 3); R_(g, SQ.belly, 8, 8, 2, 3);
    ell(g, SQ.fur, 10, hop ? 4 : 5, 2, 2); R_(g, SQ.furD, 9, hop ? 2 : 3, 1, 1); R_(g, SQ.eye, 11, hop ? 4 : 5, 1, 1);
    R_(g, SQ.furD, 6, 11, 2, 1); R_(g, SQ.furD, 9, 11, 2, 1);
    if (pose === 'throw') { R_(g, SQ.fur, 11, 6, 2, 1); R_(g, '#8a5a2a', 12, 5, 1, 1); }
  });
}
export const squirrelSprites = { sit: both(squirrel('sit')), hop: both(squirrel('hop')), throw: both(squirrel('throw')) };
export const acornSprite = sprite(['.kk.', 'kCCk', 'kaak', 'kaak', '.kk.'], { k: '#2a1a10', C: '#7a5230', a: '#c08a3a' });

/* ---- Wasp nest & wasps ---- */
export const nestSprites = [0, 1].map(f => both(outlined(12, 16, g => {
  line(g, '#6a4a2e', 6, 0, 6, 2);
  ell(g, '#b9a88a', 6, 9, 5, 6); for (let y = 5; y < 15; y += 3) R_(g, '#8a7a62', 1, y, 11, 1);
  R_(g, '#d8caa8', 3, 5, 2, 6); R_(g, '#1b1106', 5, 11 + f, 3, 2);
}))) ;
export const waspSprites = [0, 1].map(f => both(outlined(8, 7, g => {
  R_(g, '#ffd23d', 1, 3, 5, 3); R_(g, '#1b1106', 3, 3, 1, 3); R_(g, '#1b1106', 5, 3, 1, 3); R_(g, '#1b1106', 7, 4, 1, 1);
  R_(g, f ? '#e6fbff' : '#b9d8ee', 2, f ? 0 : 1, 3, 2);
})));

/* ---- The Elder Stag ---- */
const ST_ = { hide: '#6e4a2e', hideD: '#43291a', hideL: '#9a6a42', belly: '#bf9a6c', mane: '#3a2a1c', maneL: '#5a4430', hoof: '#1a100a', antler: '#e9dcb8', antlerD: '#a8966e', moss: '#4f8a3a', mossL: '#8ac85a', glow: '#9ff0c0', eye: '#ffe14d' };
/** The Elder Stag (60×56, faces right): shaggy mane, a vast moss-hung crown of antlers with glowing caps. */
function stag(pose) {
  return outlined(72, 64, g => {
    const O = 16, low = pose === 'brace' || pose === 'charge' || pose === 'stun', rear = pose === 'rear';
    const bodyY = O + (rear ? 28 : 32);
    const L = pose === 'walk1' ? [[16, 6, 12], [20, 4, 23], [36, 6, 32], [40, 4, 43]]
      : pose === 'walk2' ? [[16, 6, 20], [20, 4, 16], [36, 6, 40], [40, 4, 35]]
      : pose === 'charge' ? [[16, 6, 8], [20, 4, 14], [36, 6, 44], [40, 4, 50]]
      : [[16, 6, 15], [20, 4, 21], [36, 6, 35], [40, 4, 41]];
    L.forEach(([hx, dy, fx], i) => {
      const front = i >= 2, hy = bodyY + dy;
      if (rear && front) { line(g, ST_.hideD, hx, hy - 4, hx + 7, hy - 15, 3); R_(g, ST_.hoof, hx + 6, hy - 18, 4, 3); return; }
      line(g, i % 2 ? ST_.hide : ST_.hideD, hx, hy, fx, 61, 3); R_(g, ST_.hoof, fx - 1, 61, 4, 3);
    });
    ell(g, ST_.hide, 28, bodyY, 17, 10); ell(g, ST_.hideL, 25, bodyY - 4, 12, 3); ell(g, ST_.belly, 28, bodyY + 6, 11, 2);
    for (const [x, y] of [[18, -2], [31, 1], [24, 3]]) R_(g, ST_.hideD, x, bodyY + y, 3, 1);   // old scars in the hide
    R_(g, '#f3ecd2', 10, bodyY - 6, 3, 4);
    const hx = low ? 48 : 45, hy = low ? bodyY + 5 : rear ? O + 10 : O + 14;
    line(g, ST_.hide, 38, bodyY - 5, hx - 2, hy + 3, 7);
    for (let i = 0; i < 6; i++) line(g, i % 2 ? ST_.maneL : ST_.mane, 36 + i, bodyY - 2 + (i % 3), hx - 5 + i * 0.6, hy + 8 + (i % 2) * 2, 1);   // shaggy mane
    ell(g, ST_.hide, hx, hy, 6, 5); R_(g, ST_.hideL, hx + 1, hy - 4, 4, 1);
    R_(g, ST_.hideD, hx + 4, hy + 1, 5, 3); R_(g, ST_.hoof, hx + 8, hy + 1, 1, 1);
    R_(g, ST_.hideD, hx - 5, hy - 5, 3, 3);
    if (pose === 'stun') R_(g, '#1b1106', hx + 1, hy - 1, 2, 1); else { R_(g, ST_.eye, hx + 1, hy - 2, 2, 2); R_(g, '#ffffff', hx + 2, hy - 2, 1, 1); }
    // the crown: two huge beams spreading up and out like bare oak limbs — tines, hanging moss, glowing caps
    const ax = hx - 1, ay = hy - 5, lift = low ? 12 : 0;
    const beam = (sx, col) => {                                             // sx: -1 = the far beam sweeping back, +1 = the near one reaching forward
      const pts = [[ax, ay], [ax + sx * 4 - 2, ay - 6 + lift * 0.3], [ax + sx * 9 - 3, ay - 12 + lift * 0.6], [ax + sx * 12 - 2, ay - 19 + lift * 0.85], [ax + sx * 11, ay - 26 + lift]];
      for (let i = 0; i < pts.length - 1; i++) line(g, col, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], i < 2 ? 3 : 2);
      const tines = [[1, -sx * 5, -6], [2, sx * 6, -4], [2, -sx * 3, -8], [3, sx * 6, -6], [3, -sx * 5, -5], [4, sx * 3, -4], [4, -sx * 3, -4]];
      for (const [k, tx, ty] of tines) { const [px, py] = pts[k]; line(g, col, px, py, px + tx, py + ty, 1); R_(g, ST_.glow, px + tx, py + ty - 1, 1, 1); }
      for (const k of [1, 2, 3]) { const [px, py] = pts[k]; R_(g, ST_.moss, px - 1, py, 3, 1); line(g, ST_.moss, px, py + 1, px - 1, py + 5); R_(g, ST_.mossL, px, py, 1, 1); }
    };
    beam(-1, ST_.antlerD); beam(1, ST_.antler);
  });
}
export const stagSprites = Object.fromEntries(['idle', 'walk1', 'walk2', 'brace', 'charge', 'rear', 'stun'].map(k => [k, both(stag(k))]));
export const stagIcon = null;
Object.assign(glows, { stagEye: glow(8, '#ffe14d', 0.5), antler: glow(10, '#9ff0c0', 0.35) });
