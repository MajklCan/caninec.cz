// Tile map: collision, line of sight and destructible terrain. `loadLevel()` swaps the whole world.
import { TILE } from './gfx.js';
import { buildLevel, BEDROCK, ICE, IRON } from './level.js';
import { makeTileRenderer } from './art.js';
import { debris } from './fx.js';

const MAX_HP = { 1: 4, 2: Infinity, 3: 2, 4: 2, 5: Infinity };
// Live bindings — importers always see the current level.
export let LV, WORLD_W, WORLD_H, tiles, tileHp;
let original, dirty = null;

export function loadLevel(i) {
  LV = buildLevel(i);
  WORLD_W = LV.cols * TILE;
  WORLD_H = LV.rows * TILE;
  original = LV.grid.slice();
  tileHp = new Float32Array(LV.grid.length);
  tiles = makeTileRenderer(LV);
  resetWorld();
}

export function resetWorld() {
  LV.grid.set(original);
  original.forEach((t, i) => (tileHp[i] = MAX_HP[t] ?? 0));
  tiles.paint(0, 0, LV.cols - 1, LV.rows - 1);
  dirty = null;
}
loadLevel(0);

export const tileAt = (tx, ty) => (tx < 0 || tx >= LV.cols ? BEDROCK : ty < 0 || ty >= LV.rows ? 0 : LV.grid[ty * LV.cols + tx]);
export const solidTile = (tx, ty) => tileAt(tx, ty) !== 0;
export const solidAt = (x, y) => solidTile(Math.floor(x / TILE), Math.floor(y / TILE));
export const iceAt = (x, y) => tileAt(Math.floor(x / TILE), Math.floor(y / TILE)) === ICE;
/** 0 = pristine … 1 = about to break (for crack overlays). */
export const tileWear = (tx, ty) => { const t = tileAt(tx, ty), m = MAX_HP[t]; return t && m !== Infinity ? 1 - tileHp[ty * LV.cols + tx] / m : 0; };
/** First solid tile row at or below world y in column x (for ground-finding). */
export function groundBelow(x, y = 0) {
  const tx = Math.floor(x / TILE);
  for (let ty = Math.max(0, Math.floor(y / TILE)); ty < LV.rows; ty++) if (solidTile(tx, ty)) return ty * TILE;
  return WORLD_H + 32;
}

export function hitsWall(x, y, w, h) {
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE);
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidTile(tx, ty)) return true;
  return false;
}

/** Axis-separated AABB move against the tile grid. Returns true on a wall hit. */
export function move(e, dt) {
  let hx = false;
  e.x += e.vx * dt;
  if (e.vx !== 0 && hitsWall(e.x, e.y, e.w, e.h)) {
    e.x = e.vx > 0 ? Math.floor((e.x + e.w) / TILE) * TILE - e.w : Math.floor(e.x / TILE) * TILE + TILE;
    e.vx = 0; hx = true;
  }
  e.y += e.vy * dt;
  e.onGround = false;
  if (e.vy !== 0 && hitsWall(e.x, e.y, e.w, e.h)) {
    if (e.vy > 0) { e.y = Math.floor((e.y + e.h) / TILE) * TILE - e.h; e.onGround = true; }
    else e.y = Math.floor(e.y / TILE) * TILE + TILE;
    e.vy = 0;
  }
  return hx;
}

export function lineOfSight(x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
  for (let i = 1; i < n; i++) if (solidAt(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)) return false;
  return true;
}

function markDirty(tx, ty) {
  if (!dirty) dirty = { x0: tx, y0: ty, x1: tx, y1: ty };
  else { dirty.x0 = Math.min(dirty.x0, tx); dirty.y0 = Math.min(dirty.y0, ty); dirty.x1 = Math.max(dirty.x1, tx); dirty.y1 = Math.max(dirty.y1, ty); }
}

/** Chip a tile; returns true if it broke. Bedrock and out-of-map tiles are immune. */
export function damageTile(tx, ty, dmg) {
  if (tx < 0 || tx >= LV.cols || ty < 0 || ty >= LV.rows) return false;
  const i = ty * LV.cols + tx, t = LV.grid[i];
  if (!t || t === BEDROCK || t === IRON || LV.solid) return false;                       // duel arenas can't be dug
  tileHp[i] -= dmg;
  if (tileHp[i] > 0) return false;
  LV.grid[i] = 0;
  debris(tx * TILE + 8, ty * TILE + 8, t);
  markDirty(tx, ty);
  return true;
}

/** Place or clear a tile at runtime (boss arena gates). */
export function setTile(tx, ty, type) {
  const i = ty * LV.cols + tx;
  LV.grid[i] = type;
  tileHp[i] = MAX_HP[type] ?? 0;
  markDirty(tx, ty);
}

/** Put tile columns tx0..tx1 back exactly as the level was built (boss arena reset after a death). */
export function restoreColumns(tx0, tx1) {
  tx0 = Math.max(0, tx0); tx1 = Math.min(LV.cols - 1, tx1);
  for (let ty = 0; ty < LV.rows; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const i = ty * LV.cols + tx;
    LV.grid[i] = original[i]; tileHp[i] = MAX_HP[original[i]] ?? 0;
  }
  markDirty(tx0, 0); markDirty(tx1, LV.rows - 1);
}

/** Repaint everything that changed since the last frame (neighbours re-edge too). */
export function flushTiles() {
  if (!dirty) return;
  tiles.paint(dirty.x0 - 1, dirty.y0 - 1, dirty.x1 + 1, dirty.y1 + 1);
  dirty = null;
}
