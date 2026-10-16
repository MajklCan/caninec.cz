// HUD, spell bar, title-screen controls guide, win screen.
import { W, H, text, textWidth } from './gfx.js';
import * as A from './art.js';
import { G, DIFFS } from './state.js';
import { CD, SHIELD_TIME } from './player.js';
import { FURY_TIME } from './ninja.js';
import { isTouch, padConnected } from './input.js';
import { isMuted, isMusicMuted } from './audio.js';
import { BOSS_INFO } from './boss.js';
import { buildLevel } from './level.js';
import { LV } from './world.js';

const INK = '#f3ecd2', DIM = '#8f86c0', GOLD = '#f0b541', RED = '#ff5470', CYAN = '#8fe8ff';
const center = (ctx, str, y, col, s = 1, sh) => text(ctx, str, Math.round((W - textWidth(str, s)) / 2), y, col, s, sh);
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const PANEL = A.panel(236, 92);

/** Title-screen difficulty buttons in canvas pixels — main.js hit-tests taps against these. */
export const DIFF_BUTTONS = [{ id: 'easy', x: 30, y: 120, w: 58, h: 11 }, { id: 'overkill', x: 99, y: 120, w: 58, h: 11 }, { id: 'duel', x: 168, y: 120, w: 58, h: 11 }];
const DUEL_BTN = { label: 'DUEL', color: GOLD };
/** Which title button is lit: the duel, or the campaign difficulty. */
export const titlePick = () => (G.playMode === 'duel' ? 'duel' : G.diff.id);

function diffSelector(ctx, t) {
  for (const b of DIFF_BUTTONS) {
    const d = DIFFS[b.id] || DUEL_BTN, on = titlePick() === b.id;
    ctx.fillStyle = '#120d26'; ctx.fillRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2);
    ctx.fillStyle = on ? d.color : '#3a3170'; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = on ? (b.id === 'overkill' ? '#4a0f24' : b.id === 'duel' ? '#3a2410' : '#10304a') : '#1b1638'; ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    const lx = b.x + Math.floor((b.w - textWidth(d.label)) / 2);
    text(ctx, d.label, lx, b.y + 3, on ? '#ffffff' : '#6f66a8', 1, null);
    if (on && Math.floor(t * 3) % 2 === 0) { text(ctx, '>', b.x - 7, b.y + 3, d.color, 1, null); text(ctx, '<', b.x + b.w + 3, b.y + 3, d.color, 1, null); }
  }
  if (G.playMode === 'duel') center(ctx, `1 VS 1 AGAINST AN AI RIVAL. AI: ${G.diff.label}`, 134, GOLD);
  else center(ctx, G.diff.blurb, 134, G.diff.color);
}

/** Control roles shown on the title keyboard (every hero shares the layout; Q/E/R differ per hero). */
const ROLES = {
  move: { col: '#58d7ff', label: 'MOVE' }, jump: { col: '#9ff0c0', label: 'JUMP' },
  q: { col: '#b07cff', label: 'Q ATTACK' }, e: { col: '#ffc53d', label: 'E SKILL' }, r: { col: '#ff5470', label: 'R ULTIMATE' },
};
const ROLE_ORDER = ['move', 'jump', 'q', 'e', 'r'];

/** A chunky keycap coloured by its role; the active role pulses brighter. */
function roleKey(ctx, x, y, label, role, w = 13, lit = false) {
  const c = role ? ROLES[role].col : '#8c89ab';
  ctx.fillStyle = '#120d26'; ctx.fillRect(x, y, w, 13);
  ctx.fillStyle = role ? (lit ? '#ffffff' : c) : '#3a3358'; ctx.fillRect(x + 1, y + 1, w - 2, 11);
  ctx.fillStyle = role ? (lit ? c : '#1b1638') : '#2a2446'; ctx.fillRect(x + 1, y + 10, w - 2, 2);
  text(ctx, label, x + Math.floor((w - textWidth(label)) / 2), y + 3, role ? '#120d26' : '#6f66a8', 1, null);
}

export function drawTitle(ctx) {
  const t = G.t, active = ROLE_ORDER[Math.floor(t / 0.8) % ROLE_ORDER.length];
  const a = 'MOONLIT ', b = 'WIZARD', wa = textWidth(a, 2), wb = textWidth(b, 2), x0 = Math.round((W - wa - wb) / 2);
  text(ctx, a, x0, 7, '#f7f1dc', 2);
  text(ctx, b, x0 + wa, 7, '#e0626a', 2);

  const px = 10, py = 24;
  ctx.drawImage(PANEL, px, py);
  const k = (x, y, l, r, w) => roleKey(ctx, px + x, py + y, l, r, w, r === active);
  // left block: Q W E R / A S D / Z + space
  k(8, 7, 'Q', 'q'); k(23, 7, 'W', 'jump'); k(38, 7, 'E', 'e'); k(53, 7, 'R', 'r'); k(68, 7, 'T', null);
  k(12, 21, 'A', 'move'); k(27, 21, 'S', null); k(42, 21, 'D', 'move'); k(57, 21, 'F', null);
  k(17, 35, 'Z', 'jump'); k(32, 35, 'X', null); k(47, 35, 'C', null); k(62, 35, 'J', 'q');
  k(22, 49, 'SPACE', 'jump', 56);
  // arrows
  k(118, 21, '^', 'jump'); k(103, 35, '<', 'move'); k(118, 35, 'V', null); k(133, 35, '>', 'move');
  // mouse: left = Q, right = E
  const mx = px + 168, my = py + 8, ml = active === 'q', mr = active === 'e';
  ctx.fillStyle = '#120d26'; ctx.fillRect(mx, my, 24, 36);
  ctx.fillStyle = '#3a3358'; ctx.fillRect(mx + 1, my + 13, 22, 22);
  ctx.fillStyle = ml ? '#ffffff' : ROLES.q.col; ctx.fillRect(mx + 1, my + 1, 10, 11);
  ctx.fillStyle = mr ? '#ffffff' : ROLES.e.col; ctx.fillRect(mx + 13, my + 1, 10, 11);
  ctx.fillStyle = '#120d26'; ctx.fillRect(mx + 11, my + 1, 2, 11);
  text(ctx, 'Q', mx + 5, my + 4, '#120d26', 1, null); text(ctx, 'E', mx + 17, my + 4, '#120d26', 1, null);
  text(ctx, 'MOUSE', mx + 2, my + 38, DIM, 1, null);
  // legend
  let lx = px + 8;
  for (const r of ROLE_ORDER) {
    const on = r === active;
    ctx.fillStyle = ROLES[r].col; ctx.fillRect(lx, py + 68, 5, 5);
    text(ctx, ROLES[r].label, lx + 8, py + 68, on ? '#ffffff' : DIM, 1, null);
    lx += 8 + textWidth(ROLES[r].label) + 10;
  }
  center(ctx, padConnected ? 'PAD: X JUMP  SQUARE Q  CIRCLE E  TRIANGLE R' : 'EACH HERO: OWN Q E R.  HUG WALLS TO CLIMB.', py + 80, padConnected ? '#8fe8ff' : '#ff9aa8', 1, null);   // a controller is in: show its layout

  diffSelector(ctx, t);
  if (Math.floor(t * 2) % 2 === 0) { const go = isTouch ? 'TAP' : 'SPACE'; text(ctx, go, W - 5 - textWidth(go), 134, GOLD, 1); }
  if (!isTouch) text(ctx, '< >', 5, 134, DIM, 1);
}

function spellBar(ctx) {
  const P = G.P, x0 = Math.round(W / 2 - 27);
  ['q', 'e', 'r'].forEach((k, i) => {
    const x = x0 + i * 19, y = 4, cd = P.cd[k], active = k === 'e' && P.shield > 0 || k === 'r' && P.fury > 0;
    const border = P.deny[k] > 0 ? RED : active || P.ready[k] > 0 ? CYAN : cd > 0 ? '#3a3170' : '#8c89ab';
    ctx.fillStyle = '#120d26'; ctx.fillRect(x - 1, y - 1, 19, 19);
    ctx.fillStyle = border; ctx.fillRect(x, y, 17, 17);
    ctx.fillStyle = '#1b1638'; ctx.fillRect(x + 1, y + 1, 15, 15);
    const shake = P.deny[k] > 0 ? Math.round(Math.sin(G.t * 60)) : 0;
    const set = G.hero === 'skeleton' ? A.skelIcons : G.hero === 'slime' ? A.slimeIcons : G.hero === 'monkey' ? A.monkeyIcons : G.hero === 'goblin' ? A.goblinIcons : G.hero === 'ninja' ? A.ninjaIcons : P.phase === 'blood' ? A.bloodIcons : A.icons;
    ctx.drawImage(k === 'q' && G.hero === 'slime' && P.king > 0 ? A.slimeIcons.smash : k === 'q' && G.hero === 'ninja' && P.fury > 0 ? A.ninjaIcons.slash : set[k], x + 3 + shake, y + 3);   // KING SIZE swaps Q to SMASH
    if (cd > 0) {
      const h = Math.ceil(15 * (cd / CD[k]));
      ctx.drawImage(A.cdShade, 0, 0, 15, h, x + 1, y + 1, 15, h);
      if (CD[k] >= 1) { const s = String(Math.ceil(cd)); text(ctx, s, x + 9 - Math.ceil(textWidth(s) / 2), y + 6, INK, 1); }
    }
    if (active) { ctx.fillStyle = k === 'r' ? '#ff4d6d' : CYAN; ctx.fillRect(x + 1, y + 15, Math.ceil(15 * (k === 'r' ? P.fury / FURY_TIME : P.shield / SHIELD_TIME)), 1); }
    text(ctx, k.toUpperCase(), x + 7, y + 19, cd > 0 ? '#6f66a8' : INK, 1);
  });
}

export function drawHud(ctx) {
  const P = G.P;
  for (let i = 0; i < P.maxHp; i++) {                                      // hearts fill in quarters (Sir spends health in bits)
    const f = Math.max(0, Math.min(1, P.hp - i)), x = 5 + i * 9;
    ctx.drawImage(A.heartEmpty, x, 5);
    if (f > 0) ctx.drawImage(A.heart, 0, 0, Math.ceil(7 * f), 6, x, 5, Math.ceil(7 * f), 6);
  }
  ctx.drawImage(A.crystal, 5, 14);
  text(ctx, `${G.crystalsTaken}/${G.total}`, 15, 16);
  if (G.hero === 'monkey') G.monkeys.filter(m => !m.leaving && m.enter <= 0).forEach((_, i) => ctx.drawImage(A.troopHead, 5 + i * 9, 24));   // troop still with you
  spellBar(ctx);
  const tm = fmtTime(G.time);
  text(ctx, tm, W - 5 - textWidth(tm), 6, '#c9c3ef');
  const kl = `KILLS ${G.kills}`;
  text(ctx, kl, W - 5 - textWidth(kl), 15, DIM);
  if (G.diff.id === 'overkill') text(ctx, 'OVERKILL', W - 5 - textWidth('OVERKILL'), 24, RED);
  const muteTag = isMuted() ? 'MUTED' : isMusicMuted() ? 'MUSIC OFF' : '';
  if (muteTag) text(ctx, muteTag, W - 5 - textWidth(muteTag), 33, '#6f66a8');

  if (G.banner) {
    const b = G.banner, age = b.max - b.t;
    const s = age < 0.08 ? 3 : 2;
    if (b.t > 0.25 || Math.floor(G.t * 20) % 2) center(ctx, b.text, s === 3 ? 34 : 36, b.color, s);
  }

  if (G.boss && G.boss.alive && G.boss.state !== 'sleep') bossBar(ctx, G.boss);
  if (G.hint && G.mode === 'play') {                                       // contextual tip under the spell bar
    const w = textWidth(G.hint.text) + 10, x = Math.round((W - w) / 2), y = G.banner ? 50 : 31;
    ctx.fillStyle = '#120d26'; ctx.fillRect(x - 1, y - 1, w + 2, 11);
    ctx.fillStyle = '#3a3170'; ctx.fillRect(x, y, w, 9);
    ctx.fillStyle = '#1b1638'; ctx.fillRect(x + 1, y + 1, w - 2, 7);
    text(ctx, G.hint.text, x + 5, y + 2, '#ffe29a', 1, null);
  }

  if (G.mode === 'victory') {
    ctx.drawImage(VEIL, 0, 0, W, H);
    center(ctx, 'THE ECLIPSE IS BROKEN', 26, '#faf5e2', 2);
    center(ctx, 'THE MOON SHINES FREE. THE NIGHT IS QUIET AGAIN.', 44, DIM);
    center(ctx, `CRYSTALS ${G.crystalsTaken}/${G.total}   KILLS ${G.kills}`, 60, CYAN);
    center(ctx, `TIME ${tm}   BEST STREAK ${G.combo.best}   DEATHS ${G.deaths}`, 70, '#c9c3ef');
    center(ctx, `${G.diff.label} MODE CLEARED`, 80, G.diff.color);
    center(ctx, 'THANKS FOR PLAYING', 98, GOLD, 1);
    if (G.t - G.wonAt > 2 && Math.floor(G.t * 2) % 2 === 0) center(ctx, isTouch ? 'TAP FOR TITLE' : 'PRESS SPACE', 112, INK);
    return;
  }
  if (G.mode === 'win') {
    center(ctx, G.level === 3 ? 'THE MOON IS FREE' : 'LEVEL CLEAR', 40, '#f7f1dc', 2);
    center(ctx, `CRYSTALS ${G.crystalsTaken}/${G.total}   KILLS ${G.kills}`, 60, CYAN);
    center(ctx, `TIME ${tm}   BEST STREAK ${G.combo.best}   DEATHS ${G.deaths}`, 70, '#c9c3ef');
    const nx = MAPS[mapIndexOf(nextLevelOf(LV, G.level))];
    if (nx) center(ctx, `NEXT: ${nx.name}`, 80, '#8fe8ff');
    if (G.t - G.wonAt > 1 && Math.floor(G.t * 2) % 2 === 0) center(ctx, isTouch ? 'TAP TO CONTINUE' : 'PRESS SPACE TO CONTINUE', 92, GOLD);
  }
}

const VEIL = A.panel(W, 144);
const BAR_W = 140;
function bossBar(ctx, e) {
  const name = e.type === 'moon' ? ((e.phase || 1) >= 2 ? 'THE BLOOD MOON' : 'THE MOON') : BOSS_INFO[e.type].name;
  const x = Math.round((W - BAR_W) / 2), y = 132, f = Math.max(0, e.hp / e.maxHp);
  text(ctx, name, Math.round((W - textWidth(name)) / 2), y - 8, RED);
  ctx.fillStyle = '#120d26'; ctx.fillRect(x - 1, y - 1, BAR_W + 2, 6);
  ctx.fillStyle = '#3a1024'; ctx.fillRect(x, y, BAR_W, 4);
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#ff5470'; ctx.fillRect(x, y, Math.ceil(BAR_W * f), 4);
  ctx.fillStyle = '#ff9aa8'; ctx.fillRect(x, y, Math.ceil(BAR_W * f), 1);
  for (let i = 1; i < 10; i++) { ctx.fillStyle = '#120d26'; ctx.fillRect(x + (BAR_W * i) / 10, y, 1, 4); }
}

/* ================= PAUSE MENU ================= */
export const PAUSE_ITEMS = ['RESUME', 'RESTART LEVEL', 'HERO AND MAP SELECT', 'TITLE SCREEN'];
const DUEL_PAUSE = ['RESUME', 'RESTART DUEL', 'DUEL SELECT', 'TITLE SCREEN'];
export const pauseRect = i => ({ x: Math.round(W / 2 - 60), y: 42 + i * 16, w: 120, h: 13 });
/** The last pause row: two half-width toggles side by side — 0 = music, 1 = all sound. */
export const MUTE_ROW = PAUSE_ITEMS.length;
export const muteRect = col => { const r = pauseRect(MUTE_ROW); return { x: r.x + col * 62, y: r.y, w: 58, h: r.h }; };
export function drawPause(ctx, cursor, col = 0) {
  ctx.drawImage(VEIL, 0, 0, W, H);
  center(ctx, 'PAUSED', 24, '#f7f1dc', 2);
  (G.duel ? DUEL_PAUSE : PAUSE_ITEMS).forEach((label, i) => {
    const r = pauseRect(i), on = i === cursor;
    ctx.fillStyle = '#120d26'; ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
    ctx.fillStyle = on ? CYAN : '#3a3170'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = on ? '#10304a' : '#1b1638'; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    text(ctx, label, r.x + Math.floor((r.w - textWidth(label)) / 2), r.y + 4, on ? '#ffffff' : DIM, 1, null);
    if (on && Math.floor(G.t * 3) % 2 === 0) text(ctx, '>', r.x - 8, r.y + 4, CYAN, 1, null);
  });
  [['MUTE MUSIC', 'MUSIC OFF', isMusicMuted()], ['MUTE ALL', 'ALL MUTED', isMuted()]].forEach(([label, offLabel, off], c) => {
    const r = muteRect(c), on = cursor === MUTE_ROW && col === c, shown = off ? offLabel : label;
    ctx.fillStyle = '#120d26'; ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
    ctx.fillStyle = on ? CYAN : off ? '#ff5470' : '#3a3170'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = on ? '#10304a' : off ? '#3a1628' : '#1b1638'; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    text(ctx, shown, r.x + Math.floor((r.w - textWidth(shown)) / 2), r.y + 4, on ? '#ffffff' : off ? '#ffb3c1' : DIM, 1, null);
    if (on && c === 0 && Math.floor(G.t * 3) % 2 === 0) text(ctx, '>', r.x - 8, r.y + 4, CYAN, 1, null);
  });
  const hintText = isTouch ? 'TAP AN OPTION' : 'ARROWS CHOOSE   SPACE CONFIRM   ESC RESUME';
  center(ctx, hintText, 131, '#6f66a8');
}

export function drawPops(ctx, X, Y) {
  for (const p of G.pops) {
    if (p.t > 0.6 && Math.floor(p.t * 20) % 2) continue;
    text(ctx, p.text, X(p.x), Y(p.y), p.color);
  }
}

/* ================= HERO & MAP SELECT ================= */
/** Slot 0 is always RANDOM: a "?" that rolls a hero when the game starts. */
export const HEROES = [
  { id: 'random', name: 'RANDOM HERO', desc: 'ANY OF THE SIX. FEELING LUCKY?' },
  { id: 'wizard', name: 'THE MOONLIT WIZARD', desc: 'ORBS, SHIELD. R: BLOOD MOON - BOOMERANG, HEAL', short: 'WIZARD' },
  { id: 'skeleton', name: 'SKELETON DESERTER', desc: 'PEG ARROWS, HEAD THROW, GHOST FORM', short: 'SKELETON' },
  { id: 'slime', name: 'SIR SLIMES A LOT', desc: 'SIZE IS HEALTH. GOO SHOTS, BOUNCE, KING', short: 'SIR SLIME' },
  { id: 'monkey', name: 'THE MONKEY', desc: 'DOUBLE JUMP. BANANAS, YOINK, TROOP', short: 'MONKEY' },
  { id: 'goblin', name: 'GOBLINBOMBER', desc: 'ROCKET JUMPS. STICKY BOMBS, DETONATE, BARREL', short: 'GOBLIN' },
  { id: 'ninja', name: 'THE NINJA', desc: 'PIERCING STARS, UNTOUCHABLE DASH, FURY', short: 'NINJA' },
];
/** Campaign map cards in play order; `level` = the LEVELS index. Put an unreleased map behind `PREVIEW` (localhost-only) until it ships. */
const GROVE = { level: 7, name: 'HOLLOW GROVE', short: 'GROVE', theme: 'woodland', boss: 'BOSS: THE ELDER STAG' };
export const MAPS = [
  { level: 0, name: 'MOONLIT RAMPARTS', short: 'RAMPARTS', theme: 'night', boss: 'BOSS: BONE WARDEN' },
  GROVE,                                                                   // released
  { level: 1, name: 'SUNKEN CATHEDRAL', short: 'CATHEDRAL', theme: 'sunken', boss: 'BOSS: THE DROWNED ORGANIST' },
  { level: 2, name: 'CLOCKWORK TOWER', short: 'CLOCKWORK', theme: 'clock', boss: 'BOSS: THE BRASS WIDOW' },
  { level: 3, name: 'FROST PEAKS', short: 'PEAKS', theme: 'frost', boss: 'BOSS: ???' },
  { level: 4, name: 'MOON SURFACE', short: 'MOON', theme: 'lunar', boss: 'BOSS: ???' },
];
/** Which level comes after `level` (its `next`, else the following index — skipping unreleased maps on prod). */
export function nextLevelOf(L, level) { return L.next ?? level + 1; }
export const mapIndexOf = level => MAPS.findIndex(m => m && m.level === level);
const SLOT = { w: 30, h: 34, gap: 4, y: 17 }, CARD = { w: 38, h: 34, gap: 3, y: 76 };
export const heroRect = i => ({ x: Math.round((W - (HEROES.length * SLOT.w + (HEROES.length - 1) * SLOT.gap)) / 2) + i * (SLOT.w + SLOT.gap), y: SLOT.y, w: SLOT.w, h: SLOT.h });
export const mapRect = i => ({ x: Math.round((W - (6 * CARD.w + 5 * CARD.gap)) / 2) + i * (CARD.w + CARD.gap), y: CARD.y, w: CARD.w, h: CARD.h });
export const START_BTN = { x: W - 62, y: 127, w: 54, h: 12 };
/** Campaign cards: a real thumbnail of each level's opening screens (built on first use — levels are big). */
let PREVIEWS = null;
const previews = () => PREVIEWS || (PREVIEWS = MAPS.map((m, i) => {
  if (!m) return A.lockedPreview;
  const L = buildLevel(m.level), ch = Math.min(L.rows * 16, 240);
  return A.levelThumb(L, 34, 22, { x: 0, y: L.rows * 16 - ch, w: Math.round(ch * 34 / 22), h: ch });
}));

function frame(ctx, r, border, fill) {
  ctx.fillStyle = '#120d26'; ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
  ctx.fillStyle = border; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = fill; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
}

/** A hero standing in a select slot (feet 3 px above the slot's bottom edge). */
function drawPortrait(ctx, id, r, focus, shake, t) {
  const bx = r.x + Math.round((r.w - 16) / 2) + shake, by = r.y + r.h - 27, bob = k => (Math.sin(t * 2.4 + k) > 0.35 ? -1 : 0);
  if (id === 'random') {                                                  // every hero in turn, as a shadow behind a big "?"
    const s = A.heroShadows[Math.floor(t * 4) % A.heroShadows.length];
    ctx.drawImage(s, r.x + Math.round((r.w - s.width) / 2) + shake, r.y + r.h - 3 - s.height);
    text(ctx, '?', r.x + Math.round(r.w / 2) - 3 + shake, r.y + Math.round(r.h / 2) - 7, focus ? '#ffffff' : GOLD, 2);
  } else if (id === 'ninja') {
    ctx.drawImage(A.ninjaHero.w1.r, bx, by + bob(4));
    if (focus) ctx.drawImage(A.katanaUp[Math.floor(t * 12) % 2].r, bx + 12, by + 8);
  } else if (id === 'goblin') ctx.drawImage(A.goblinHero.w1.r, bx, by + bob(3));
  else if (id === 'monkey') ctx.drawImage(A.monkeyHero.w1.r, bx, by + bob(2));
  else if (id === 'slime') {
    const spr = A.slimeHero[3][Math.sin(t * 3) > 0.5 ? 'squash' : 'idle'].r;
    ctx.drawImage(spr, r.x + Math.round((r.w - spr.width) / 2) + 2 + shake, r.y + r.h - 3 - spr.height);
  } else if (id === 'skeleton') ctx.drawImage(A.skeletonHero.w1.r, bx, by + bob(1));
  else {
    const b = bob(0);
    ctx.drawImage(A.staff, bx + 12, by - 4 + b);
    ctx.drawImage(A.wizard.w1.r, 0, 17, 16, 7, bx, by + 17, 16, 7);
    ctx.drawImage(A.wizard.w1.r, 0, 0, 16, 18, bx, by + b, 16, 18);
    if (focus) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(A.glows.gem, bx + 14.5 - A.glows.gem.width / 2 | 0, by - 2 + b - A.glows.gem.height / 2 | 0); ctx.globalCompositeOperation = 'source-over'; }
  }
}
const slotBorder = (denied, focus, on, blink) => (denied ? RED : focus ? (blink ? CYAN : '#58d7ff') : on ? '#58d7ff' : '#3a3170');   // the pick in every row stays blue; the active row blinks

export function drawSelect(ctx, sel) {
  const t = G.t, blink = Math.floor(t * 3) % 2 === 0;
  ctx.drawImage(VEIL, 0, 0, W, H);
  // --- heroes
  text(ctx, 'CHOOSE YOUR HERO', 10, 7, sel.row === 0 ? GOLD : DIM);
  HEROES.forEach((h, i) => {
    const r = heroRect(i), on = sel.hero === i, focus = on && sel.row === 0, denied = sel.deny > 0 && sel.denyRow === 0 && sel.hero === i;
    const shake = denied ? Math.round(Math.sin(t * 70)) : 0;
    frame(ctx, { ...r, x: r.x + shake }, slotBorder(denied, focus, on, blink), i === 0 ? '#241a3c' : '#1b1638');
    drawPortrait(ctx, h.id, r, focus, shake, t);
  });
  const hero = HEROES[sel.hero];
  text(ctx, hero.name, 10, 55, INK);
  text(ctx, hero.desc, W - 10 - textWidth(hero.desc), 55, DIM);

  // --- maps
  ctx.fillStyle = '#3a3170'; ctx.fillRect(10, 64, W - 20, 1);
  text(ctx, 'CHOOSE A MAP', 10, 68, sel.row === 1 ? GOLD : DIM);
  MAPS.forEach((m, i) => {
    const r = mapRect(i), on = sel.map === i, focus = on && sel.row === 1, denied = sel.deny > 0 && sel.denyRow === 1 && sel.map === i;
    const shake = denied ? Math.round(Math.sin(t * 70)) : 0;
    frame(ctx, { ...r, x: r.x + shake }, slotBorder(denied, focus, on, blink), '#0f0b20');
    ctx.drawImage(previews()[i], r.x + 2 + shake, r.y + 2);
    if (!m) text(ctx, '?', r.x + r.w / 2 - 3 + shake, r.y + 7, '#4a4370', 2);
    text(ctx, String(i + 1), r.x + 3 + shake, r.y + 3, m ? '#ffffff' : '#4a4370', 1);
    const label = m ? m.short : '???';
    text(ctx, label, r.x + Math.round((r.w - textWidth(label)) / 2) + shake, r.y + 26, m ? (on ? INK : DIM) : '#4a4370', 1, null);
  });
  const map = MAPS[sel.map];
  text(ctx, map ? map.name : 'COMING SOON', 10, 115, map ? INK : RED);
  if (map) text(ctx, map.boss, 10, 124, '#ff9aa8');

  // --- start
  frame(ctx, START_BTN, blink ? GOLD : '#b9772b', '#2a1f10');
  text(ctx, 'START', START_BTN.x + Math.round((START_BTN.w - textWidth('START')) / 2), START_BTN.y + 3, GOLD, 1, null);
  if (!isTouch) text(ctx, 'ARROWS CHOOSE  SPACE START  ESC BACK', 10, 134, '#6f66a8', 1);
}

/* ================= DUEL: SELECT, HUD, RESULT ================= */
export const DUEL_MAPS = [
  { level: 5, name: 'THE COURTYARD', desc: 'NO FALLING. THREE TIERS. BEST OF 3' },
  { level: 6, name: 'ABOVE THE CLOUDS', desc: "NO FLOOR. DON'T FALL. BEST OF 3" },
];
const DUEL_PREVIEWS = DUEL_MAPS.map(m => A.duelPreview(buildLevel(m.level)));
const DSLOT = { w: 28, h: 30, gap: 3 };
export const duelHeroRect = (row, i) => ({ x: Math.round((W - (HEROES.length * DSLOT.w + (HEROES.length - 1) * DSLOT.gap)) / 2) + i * (DSLOT.w + DSLOT.gap), y: row === 0 ? 11 : 51, w: DSLOT.w, h: DSLOT.h });
export const duelMapRect = i => ({ x: 10 + i * 84, y: 94, w: 80, h: 48 });

export function drawDuelSelect(ctx, ds) {
  const t = G.t, blink = Math.floor(t * 3) % 2 === 0;
  ctx.drawImage(VEIL, 0, 0, W, H);
  const rowTitle = (label, row, y, name) => {
    text(ctx, label, 10, y, ds.row === row ? GOLD : DIM);
    if (name) text(ctx, name, W - 10 - textWidth(name), y, ds.row === row ? INK : DIM);
  };
  [['YOU', 'h1'], [`RIVAL - AI ${G.diff.label}`, 'h2']].forEach(([label, key], row) => {
    rowTitle(label, row, row === 0 ? 3 : 43, HEROES[ds[key]].name);
    HEROES.forEach((h, i) => {
      const r = duelHeroRect(row, i), on = ds[key] === i, focus = on && ds.row === row;
      frame(ctx, r, slotBorder(false, focus, on, blink), i === 0 ? '#241a3c' : '#1b1638');
      drawPortrait(ctx, h.id, r, focus, 0, t + row * 1.3);
    });
  });
  ctx.fillStyle = '#3a3170'; ctx.fillRect(10, 84, W - 20, 1);
  text(ctx, 'ARENA', 10, 87, ds.row === 2 ? GOLD : DIM);
  DUEL_MAPS.forEach((m, i) => {
    const r = duelMapRect(i), on = ds.map === i, focus = on && ds.row === 2;
    frame(ctx, r, slotBorder(false, focus, on, blink), '#0f0b20');
    ctx.drawImage(DUEL_PREVIEWS[i], r.x + 2, r.y + 2);
    if (!on) { ctx.globalAlpha = 0.45; ctx.fillStyle = '#0f0b20'; ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4); ctx.globalAlpha = 1; }   // the pick is lit, the other dims
    text(ctx, String(i + 1), r.x + 4, r.y + 4, '#ffffff', 1);
  });
  const m = DUEL_MAPS[ds.map], ix = 184;
  text(ctx, m.name, ix, 95, INK);
  m.desc.split('. ').forEach((line, k) => text(ctx, line, ix, 104 + k * 7, k === 2 ? DIM : '#ff9aa8'));
  frame(ctx, START_BTN, blink ? GOLD : '#b9772b', '#2a1f10');
  text(ctx, 'FIGHT!', START_BTN.x + Math.round((START_BTN.w - textWidth('FIGHT!')) / 2), START_BTN.y + 3, GOLD, 1, null);
}

const heroShort = id => (HEROES.find(h => h.id === id) || {}).short || id.toUpperCase();
function hearts(ctx, P, right) {
  for (let i = 0; i < P.maxHp; i++) {
    const f = Math.max(0, Math.min(1, P.hp - i)), x = right ? W - 12 - i * 9 : 5 + i * 9;
    ctx.drawImage(A.heartEmpty, x, 5);
    if (f > 0) ctx.drawImage(A.heart, 0, 0, Math.ceil(7 * f), 6, x, 5, Math.ceil(7 * f), 6);
  }
}
/** Duel HUD: your hearts left, the rival's right, round pips, your spell bar in the middle. */
export function drawDuelHud(ctx) {
  const D = G.duel, f2 = D.f2.P;
  hearts(ctx, G.P, false); hearts(ctx, f2, true);
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = '#120d26'; ctx.fillRect(4 + i * 7, 13, 6, 6); ctx.fillRect(W - 10 - i * 7, 13, 6, 6);
    ctx.fillStyle = D.wins[0] > i ? GOLD : '#3a3170'; ctx.fillRect(5 + i * 7, 14, 4, 4);
    ctx.fillStyle = D.wins[1] > i ? GOLD : '#3a3170'; ctx.fillRect(W - 9 - i * 7, 14, 4, 4);
  }
  text(ctx, `YOU - ${heroShort(D.f1.hero)}`, 5, 22, CYAN);
  const rn = `${heroShort(D.f2.hero)} - AI`; text(ctx, rn, W - 5 - textWidth(rn), 22, '#ff9aa8');
  spellBar(ctx);
  if (isMuted()) text(ctx, 'MUTED', W - 5 - textWidth('MUTED'), 31, '#6f66a8');
  if (G.banner) {
    const b = G.banner, age = b.max - b.t, s = age < 0.08 ? 3 : 2;
    if (b.t > 0.25 || Math.floor(G.t * 20) % 2) center(ctx, b.text, s === 3 ? 50 : 52, b.color, s);
  }
  if (G.hint && G.mode === 'play' && D.phase === 'fight') {
    const w = textWidth(G.hint.text) + 10, x = Math.round((W - w) / 2), y = 31;
    ctx.fillStyle = '#120d26'; ctx.fillRect(x - 1, y - 1, w + 2, 11);
    ctx.fillStyle = '#3a3170'; ctx.fillRect(x, y, w, 9);
    ctx.fillStyle = '#1b1638'; ctx.fillRect(x + 1, y + 1, w - 2, 7);
    text(ctx, G.hint.text, x + 5, y + 2, '#ffe29a', 1, null);
  }
  if (D.phase === 'match') {
    const won = D.wins[0] > D.wins[1];
    ctx.drawImage(VEIL, 0, 0, W, H);
    center(ctx, won ? 'VICTORY!' : 'DEFEAT', 34, won ? GOLD : RED, 3);
    center(ctx, `${D.wins[0]} - ${D.wins[1]}`, 62, INK, 2);
    center(ctx, `${heroShort(D.f1.hero)} VS ${heroShort(D.f2.hero)}`, 80, DIM);
    if (D.t > 1 && Math.floor(G.t * 2) % 2 === 0) center(ctx, isTouch ? 'TAP FOR A REMATCH' : 'SPACE REMATCH   ESC DUEL SELECT', 104, GOLD);
  }
}
