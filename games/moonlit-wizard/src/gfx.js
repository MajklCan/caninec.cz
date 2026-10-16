// Low-level pixel helpers: canvases, palettes, ordered dithering, bitmap font.
export const TILE = 16;
/** Logical view size. 256×144 everywhere; a duel zooms out to 384×216 (`setView`). Live bindings — importers see changes. */
export let W = 256, H = 144;
export function setView(w, h) { W = w; H = h; }

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** 4x4 Bayer threshold in (0,1) — the heart of every dithered gradient. */
export const bayer = (x, y) => (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g };
}

const rgbCache = new Map();
export function rgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, v);
  }
  return v;
}

/** Deterministic PRNG (mulberry32) so baked art is identical every load. */
export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paint a canvas pixel by pixel. fn returns '#hex', ['#hex', alpha] or null. */
export function pixels(w, h, fn) {
  const { c, g } = canvas(w, h);
  const img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = fn(x, y);
    if (!v) continue;
    const [hex, a = 1] = typeof v === 'string' ? [v] : v;
    const [r, gg, b] = rgb(hex), i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** ASCII pixel-art → canvas. '.' (or any unmapped char) is transparent. */
export function sprite(rows, pal) {
  const w = Math.max(...rows.map(r => r.length));
  return pixels(w, rows.length, (x, y) => pal[rows[y][x]] || null);
}

export function flip(src) {
  const { c, g } = canvas(src.width, src.height);
  g.translate(src.width, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}

/** Radial light with stepped, dithered falloff — drawn with 'lighter' so it stays pixel-crisp. */
export function glow(r, hex, strength = 0.5) {
  return pixels(r * 2 + 1, r * 2 + 1, (x, y) => {
    const d = Math.hypot(x - r, y - r) / r;
    if (d >= 1) return null;
    const q = Math.floor(Math.pow(1 - d, 1.8) * 4 + bayer(x, y)) / 4;
    return q > 0 ? [hex, q * strength] : null;
  });
}

// ---------- 3x5 bitmap font ----------
const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '1000111011101011000110001', N: '10011101101110011001', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '1000110001101011101110001', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
  8: '111101111101111', 9: '111101111001110',
  '!': '010010010000010', '.': '000000000000010', ':': '000010000010000', '-': '000000111000000',
  '/': '001001010100100', "'": '010010000000000', '?': '110001010000010', '+': '000010111010000', '=': '000111000111000',
  '^': '010101000000000', '<': '001010100010001', '>': '100010001010100', ',': '000000000010100', '(': '010100100100010', ')': '010001001001010',
};

const gw = ch => (GLYPHS[ch] ? GLYPHS[ch].length / 5 : 3);
export const textWidth = (str, s = 1) => [...String(str).toUpperCase()].reduce((a, ch) => a + (gw(ch) + 1) * s, 0) - s;

const OUTLINE = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
export function text(g, str, x, y, color = '#f3ecd2', s = 1, shadow = '#120d26') {
  str = String(str).toUpperCase();
  const draw = (ox, oy, col) => {
    g.fillStyle = col;
    let cx = x + ox;
    for (const ch of str) {
      const bits = GLYPHS[ch], w = gw(ch);
      if (bits) for (let i = 0; i < bits.length; i++) if (bits[i] === '1') g.fillRect(cx + (i % w) * s, y + oy + ((i / w) | 0) * s, s, s);
      cx += (w + 1) * s;
    }
  };
  if (shadow) {
    for (const [dx, dy] of OUTLINE) draw(dx * s, dy * s, shadow);
    draw(0, 2 * s, shadow);
  }
  draw(0, 0, color);
}
