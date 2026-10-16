import { W, H, TILE, clamp, bayer, rgb, setView } from './gfx.js';
import * as A from './art.js';
import { G, setDiff } from './state.js';
import { initInput, hit, tapped, pollPads } from './input.js';
import { LV, WORLD_W, WORLD_H, tiles, tileWear, loadLevel, flushTiles } from './world.js';
import { burst, updateFx, FIRE, CYAN } from './fx.js';
import { newPlayer, pose, staffPos, updatePlayer, chargeMoon, setHero } from './player.js';
import { spawnMechanics, updateMechanics, drawMechanics, drawWater } from './mechanics.js';
import { updateGoo, drawGoo } from './goo.js';
import { resetGoblin, updateCharges, drawCharges } from './goblin.js';
import { drawNinja, glowNinja } from './ninja.js';
import { resetMonkey, updateMonkeyStuff, drawMonkeyStuff } from './monkey.js';
import { spawnEnemies, updateEnemies, drawEnemies, dropReinforcement } from './enemies.js';
import { updateShots, updateMoonfall } from './combat.js';
import { updateBeams, drawBeams, drawTelegraphs, drawFreedFace, BOSS_INFO } from './boss.js';
import { spawnIcicles, updateIcicles, drawIcicles } from './hazards.js';
import { nextLevelOf, mapIndexOf } from './hud.js';
import { drawHud, drawTitle, drawPops, drawSelect, drawPause, DIFF_BUTTONS, HEROES, MAPS, heroRect, mapRect, START_BTN, PAUSE_ITEMS, pauseRect, MUTE_ROW, muteRect, titlePick, drawDuelSelect, drawDuelHud, DUEL_MAPS, duelHeroRect, duelMapRect } from './hud.js';
import { startDuel, updateDuel, runAs, forEachFighter, REAL_HEROES } from './duel.js';
import { sfx, toggleMute, toggleMusicMute } from './audio.js';
import { playMusic } from './music.js';

const cv = document.getElementById('screen');
cv.width = W; cv.height = H;
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;
initInput(cv);

let tapPick = null, tapAt = null;
const inside = (p, r, pad = 0) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
cv.addEventListener('pointerdown', e => {
  const r = cv.getBoundingClientRect(), p = { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  tapPick = DIFF_BUTTONS.find(b => inside(p, b, 5))?.id || null;
  tapAt = p;
});
const saved = k => { try { return +localStorage.getItem(k) || 0; } catch { return 0; } };
const sel = { row: 0, hero: Math.min(saved('moonlit.hero'), HEROES.length - 1), map: Math.min(saved('moonlit.map'), MAPS.length - 2), deny: 0, denyRow: 0 };
const dsel = { row: 0, h1: Math.min(saved('moonlit.duel.h1'), HEROES.length - 1), h2: Math.min(saved('moonlit.duel.h2'), HEROES.length - 1), map: Math.min(saved('moonlit.duel.map'), DUEL_MAPS.length - 1) };
/** Slot 0 of every hero row is RANDOM: roll a real hero when the game starts. */
const rollHero = id => (id === 'random' ? REAL_HEROES[(Math.random() * REAL_HEROES.length) | 0] : id);
const bubbles = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, sp: 6 + Math.random() * 14, ph: Math.random() * 6 }));

const stars = A.makeStars();
const flakes = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, sp: 10 + Math.random() * 22, dr: Math.random() * 6.28, big: Math.random() < 0.2 }));
let flies = [], shoot = null;

/** Load level i. `fresh` resets run stats (new game); otherwise kills/time carry over between levels. */
function reset(i = 0, fresh = true) {
  loadLevel(i);
  G.level = i;
  G.crystals = LV.crystals.map(c => ({ ...c, taken: false, ph: Math.random() * 6.28 }));
  G.torches = LV.torches.map((t, k) => ({ ...t, lit: k === 0, f: Math.random() * 4 }));
  G.checkpoint = { ...LV.start };
  G.P = newPlayer(LV.start.x, LV.start.y);
  spawnEnemies();
  spawnIcicles();
  spawnMechanics();
  G.puddles = [];
  resetGoblin();
  resetMonkey();
  G.webs = [];
  G.shots = []; G.parts = []; G.booms = []; G.pops = []; G.pending = []; G.beams = [];
  G.moonfall = null; G.banner = null; G.hint = null; G.boss = null; G.moonAwake = false; G.moonFreed = false;
  G.cam.x = 0; G.cam.y = WORLD_H - H;
  if (fresh) { G.crystalsTaken = 0; G.total = 0; G.time = 0; G.deaths = 0; G.kills = 0; G.combo = { n: 0, t: 0, best: 0 }; }
  G.total += G.crystals.length;
  G.reinforceT = 8;                                                       // Overkill drops wait until you're under way
  flies = LV.theme === 'night' || LV.theme === 'woodland' ? Array.from({ length: 40 }, () => ({ x: Math.random() * WORLD_W, y: 40 + Math.random() * (WORLD_H - 60), ph: Math.random() * 6.28, sp: 0.5 + Math.random() })) : [];
}

function startRun(level = 0) {
  reset(level);                                   // rebuild with the chosen difficulty (HP, extra foes)
  G.mode = 'play';
  introBanner();
  if (G.diff.id === 'overkill') sfx.moonfall();
}
function introBanner() {
  G.banner = { text: `${mapIndexOf(G.level) + 1} - ${LV.name}`, color: G.diff.id === 'overkill' ? '#ff5470' : '#f7f1dc', t: 2.2, max: 2.2 };
}

/* ================= UPDATE ================= */
function update(dt) {
  G.t += dt; G.dt = dt;
  G.shake = Math.max(0, G.shake - dt);
  G.flash = Math.max(0, G.flash - dt);
  if (tapped('mute')) toggleMute();

  if (G.mode === 'title') {
    const pick = id => {
      if (titlePick() === id) return;
      G.playMode = id === 'duel' ? 'duel' : 'campaign';
      if (id !== 'duel') setDiff(id);
      sfx.ready();
    };
    const ids = DIFF_BUTTONS.map(b => b.id), at = ids.indexOf(titlePick());
    if (tapped('left')) pick(ids[Math.max(0, at - 1)]);
    if (tapped('right')) pick(ids[Math.min(ids.length - 1, at + 1)]);
    const toSelect = () => { G.mode = G.playMode === 'duel' ? 'dselect' : 'select'; sel.row = 0; dsel.row = 0; sfx.ready(); };
    if (tapPick) { pick(tapPick); tapPick = null; toSelect(); }
    else if (tapped('start') || (hit.has('touch:start') && !hit.has('touch:left') && !hit.has('touch:right'))) toSelect();
    tapAt = null;
  } else if (G.mode === 'select') {
    updateSelect(dt);
  } else if (G.mode === 'dselect') {
    updateDuelSelect();
  } else if (G.mode === 'pause') {
    updatePause();
    return;                                                                // the world stays frozen
  } else if (G.mode === 'win') {                  // level cleared → next level
    if (G.t - G.wonAt > 1 && (tapped('start') || hit.has('touch:start'))) {
      reset(nextLevelOf(LV, G.level), false); G.mode = 'play'; introBanner();
    }
  } else if (G.mode === 'victory') {
    if (G.t - G.wonAt > 2 && (tapped('start') || hit.has('touch:start'))) { reset(0); G.mode = 'title'; }
  } else {
    if (G.duel && G.duel.phase === 'match' && G.duel.t > 1) {             // result screen: rematch or back to the picker
      if (hit.has('Escape')) { toDuelSelect(); return; }
      if (tapped('start') || hit.has('touch:start')) { beginDuel(G.duel.h1, G.duel.h2, G.duel.level); return; }
    }
    if (tapped('pause') || hit.has('touch:pause')) { G.mode = 'pause'; G.pauseAt = 0; sfx.ready(); return; }
    G.time += dt;
    if (G.duel) updateDuel(dt);
    else {
    updatePlayer(dt);
    updateItems();
    if (G.diff.reinforce && !G.P.dead && !G.boss && (G.reinforceT -= dt) <= 0) {
      G.reinforceT = G.diff.reinforce * (0.7 + Math.random() * 0.6);
      if (G.enemies.filter(e => e.alive && e.type !== 'barrel' && Math.abs(e.x - G.P.x) < W).length < G.diff.reinforceCap) dropReinforcement();
    }
    }
  }

  if (!G.duel) {                                                           // (a duel updates each fighter's world inside updateDuel)
    updateMechanics(dt);
    updateEnemies(dt);
    updateGoo(dt);
    updateCharges(dt);
    updateMonkeyStuff(dt);
    for (const w of G.webs) w.t -= dt;
    G.webs = G.webs.filter(w => w.t > 0);
    updateShots(dt);
    updateBeams(dt);
    updateIcicles(dt);
    updateMoonfall(dt);
  }
  updateFx(dt);
  for (const p of G.pending) p.t -= dt;
  const due = G.pending.filter(p => p.t <= 0);
  G.pending = G.pending.filter(p => p.t > 0);
  due.forEach(p => (p.f && G.duel ? runAs(p.f, p.fn) : p.fn()));        // duel timers run as the fighter who set them
  if (G.banner && (G.banner.t -= dt) <= 0) G.banner = null;
  if (G.hint && (G.hint.t -= dt) <= 0) G.hint = null;
  G.combo.t = Math.max(0, G.combo.t - dt);
  for (const t of G.torches) t.f += dt * (t.lit ? 9 : 3);
  for (const bb of bubbles) { bb.y -= bb.sp * dt; bb.x += Math.sin(G.t * 2 + bb.ph) * 6 * dt; if (bb.y < -2) { bb.y = H + 2; bb.x = Math.random() * W; } }
  for (const f of flakes) { f.y += f.sp * dt; f.x += Math.sin(G.t + f.dr) * 8 * dt; if (f.y > H) { f.y = -2; f.x = Math.random() * W; } }

  if (!shoot && Math.random() < 0.0025) shoot = { x: 30 + Math.random() * 160, y: 6 + Math.random() * 36, life: 0.8 };
  if (shoot) { shoot.x += 170 * dt; shoot.y += 60 * dt; if ((shoot.life -= dt) <= 0) shoot = null; }

  // camera: horizontal look-ahead, vertical follow biased so you see more above than below
  const P = G.P;
  let tx = G.mode === 'title' ? 0 : P.x + 4 - W / 2 + P.face * 24;
  const bo = G.boss;
  if (bo && bo.alive && G.mode === 'play' && !P.dead) {                   // frame the duel, but keep the wizard on screen
    tx = clamp((P.x + 4 + bo.x + bo.w / 2) / 2 - W / 2, P.x + 4 - W + 40, P.x + 4 - 40);
  }
  const ty = G.mode === 'title' ? WORLD_H - H : P.y + 9 - H * 0.58;
  G.cam.x += (tx - G.cam.x) * Math.min(1, dt * 5);
  G.cam.y += (ty - G.cam.y) * Math.min(1, dt * 4);
  G.cam.x = clamp(G.cam.x, 0, WORLD_W - W);
  G.cam.y = clamp(G.cam.y, 0, WORLD_H - H);
  if (G.duel) { applyView(); G.cam.x = 0; G.cam.y = Math.max(0, WORLD_H - H); }   // one fixed, zoomed-out shot of the arena

  playMusic(G.mode === 'title' || G.mode === 'select' || G.mode === 'dselect' ? 'title' : G.duel ? (LV.theme === 'sky' ? 'eclipse' : 'boss')
    : G.mode === 'victory' || G.moonFreed ? 'victory' : G.boss ? BOSS_INFO[G.boss.type].music : LV.theme);
}

const LEAF_SHAPES = [[[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 1]], [[1, 0], [0, 1], [1, 1], [2, 1]], [[0, 0], [0, 1]], [[0, 1], [1, 0], [2, 0]], [[1, 0], [0, 1], [1, 1], [1, 2]]];
const LEAF_COLS = ['#3f7a3a', '#6ea84a', '#a8d86a', '#5f9a44', '#2f5a2e'];
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
/** Pause menu: resume, restart the level, back to hero & map select, or the title. */
function updatePause() {
  const n = PAUSE_ITEMS.length + 1;                                         // + the mute row
  if (tapped('up')) { G.pauseAt = (G.pauseAt + n - 1) % n; sfx.ready(); }
  if (tapped('down')) { G.pauseAt = (G.pauseAt + 1) % n; sfx.ready(); }
  if (G.pauseAt === MUTE_ROW && (tapped('left') || tapped('right'))) { G.pauseCol = 1 - (G.pauseCol || 0); sfx.ready(); }
  let pick = hit.has('Space') || hit.has('Enter') ? G.pauseAt : -1;
  if (tapAt) {
    const i = PAUSE_ITEMS.findIndex((_, k) => inside(tapAt, pauseRect(k), 2)), c = [0, 1].find(k => inside(tapAt, muteRect(k), 1));
    if (i >= 0) { G.pauseAt = i; pick = i; } else if (c !== undefined) { G.pauseAt = MUTE_ROW; G.pauseCol = c; pick = MUTE_ROW; }
    tapAt = null;
  }
  if (pick === MUTE_ROW) {                                                   // toggles stay in the menu
    hit.clear();
    if (G.pauseCol) toggleMute(); else toggleMusicMute();
    sfx.ready();
    return;
  }
  if (tapped('pause') || hit.has('touch:pause')) pick = 0;
  if (pick < 0) return;
  hit.clear();                                                             // don't let the confirm key leak into gameplay
  if (pick === 0) G.mode = 'play';
  else if (G.duel) {
    if (pick === 1) beginDuel(G.duel.h1, G.duel.h2, G.duel.level);
    else if (pick === 2) toDuelSelect();
    else { G.duel = null; reset(0); G.mode = 'title'; }
  }
  else if (pick === 1) startRun(G.level);
  else if (pick === 2) { sel.map = Math.max(0, mapIndexOf(G.level)); reset(G.level); G.mode = 'select'; sel.row = 0; }
  else { reset(0); G.mode = 'title'; }
  sfx.ready();
}

/** Hero & map picker: arrows move within a row, up/down switch rows, Space starts, taps pick directly. */
function updateSelect(dt) {
  sel.deny = Math.max(0, sel.deny - dt);
  const deny = row => { sel.deny = 0.35; sel.denyRow = row; sfx.denied(); };
  const move = d => {
    if (sel.row === 0) sel.hero = (sel.hero + d + HEROES.length) % HEROES.length;
    else sel.map = (sel.map + d + MAPS.length) % MAPS.length;
    sfx.ready();
  };
  if (tapped('up')) sel.row = 0;
  if (tapped('down')) sel.row = 1;
  if (tapped('left')) move(-1);
  if (tapped('right')) move(1);
  if (hit.has('Escape')) { G.mode = 'title'; return; }
  let go = hit.has('Space') || hit.has('Enter');
  if (tapAt) {
    const hi = HEROES.findIndex((_, i) => inside(tapAt, heroRect(i))), mi = MAPS.findIndex((_, i) => inside(tapAt, mapRect(i)));
    if (hi >= 0) { sel.row = 0; sel.hero = hi; if (!HEROES[hi]) deny(0); else sfx.ready(); }
    if (mi >= 0) { sel.row = 1; sel.map = mi; if (!MAPS[mi]) deny(1); else sfx.ready(); }
    if (inside(tapAt, START_BTN, 4)) go = true;
    tapAt = null;
  }
  if (!go) return;
  if (!HEROES[sel.hero]) { sel.row = 0; deny(0); return; }
  if (!MAPS[sel.map]) { sel.row = 1; deny(1); return; }
  try { localStorage.setItem('moonlit.map', String(sel.map)); localStorage.setItem('moonlit.hero', String(sel.hero)); } catch { /* fine */ }
  setHero(rollHero(HEROES[sel.hero].id));
  startRun(MAPS[sel.map].level);
}

/* ---------------- duel picker: your hero, the AI rival, the arena ---------------- */
function updateDuelSelect() {
  const keys = ['h1', 'h2', 'map'], n = [HEROES.length, HEROES.length, DUEL_MAPS.length];
  if (tapped('up')) { dsel.row = Math.max(0, dsel.row - 1); sfx.ready(); }
  if (tapped('down')) { dsel.row = Math.min(2, dsel.row + 1); sfx.ready(); }
  const k = keys[dsel.row];
  if (tapped('left')) { dsel[k] = (dsel[k] - 1 + n[dsel.row]) % n[dsel.row]; sfx.ready(); }
  if (tapped('right')) { dsel[k] = (dsel[k] + 1) % n[dsel.row]; sfx.ready(); }
  if (hit.has('Escape')) { G.mode = 'title'; sfx.ready(); return; }
  let go = hit.has('Space') || hit.has('Enter');
  if (tapAt) {
    for (const row of [0, 1]) { const i = HEROES.findIndex((_, j) => inside(tapAt, duelHeroRect(row, j))); if (i >= 0) { dsel.row = row; dsel[keys[row]] = i; sfx.ready(); } }
    const mi = DUEL_MAPS.findIndex((_, j) => inside(tapAt, duelMapRect(j)));
    if (mi >= 0) { dsel.row = 2; dsel.map = mi; sfx.ready(); }
    if (inside(tapAt, START_BTN, 4)) go = true;
    tapAt = null;
  }
  if (!go) return;
  try { localStorage.setItem('moonlit.duel.h1', String(dsel.h1)); localStorage.setItem('moonlit.duel.h2', String(dsel.h2)); localStorage.setItem('moonlit.duel.map', String(dsel.map)); } catch { /* fine */ }
  beginDuel(rollHero(HEROES[dsel.h1].id), rollHero(HEROES[dsel.h2].id), DUEL_MAPS[dsel.map].level);
}
function beginDuel(h1, h2, level) {
  hit.clear();
  G.duel = null;
  reset(level);
  startDuel(h1, h2, level);
  G.mode = 'play';
}
function toDuelSelect() { G.duel = null; setHero('wizard'); reset(0); G.mode = 'dselect'; dsel.row = 0; hit.clear(); sfx.ready(); }

function updateItems() {
  const P = G.P;
  if (P.dead) return;
  for (const c of G.crystals) {
    if (c.taken || !overlap(P, { x: c.x - 4, y: c.y - 5, w: 8, h: 10 })) continue;
    c.taken = true; G.crystalsTaken++;
    burst(c.x, c.y, 12, CYAN, 55, 60, 0.5); sfx.collect();
    chargeMoon(P);
  }
  for (const t of G.torches) {
    if (t.lit || Math.abs(P.x + 4 - t.x) > 10 || Math.abs(P.y + P.h - t.y) > 24) continue;
    t.lit = true; G.checkpoint = { x: t.x - 4, y: t.y - 18 };
    P.hp = Math.min(P.maxHp, P.hp + G.diff.heal);
    burst(t.x, t.y - 14, 18, FIRE, 50, -30, 0.8); sfx.light();
    G.pops.push({ text: 'CHECKPOINT', x: t.x - 19, y: t.y - 30, t: 0, color: '#ffc53d' });
  }
  const pr = LV.portal;
  if (!pr) return;
  const px = P.x + 4, inside = px > pr.x + 10 && px < pr.x + 22 && P.y + P.h > pr.y + 20 && P.y < pr.y + 48;
  if (inside && pr.sealed) { if (!G.pops.some(p => p.text === 'SEALED')) G.pops.push({ text: 'SEALED', x: pr.x + 4, y: pr.y - 6, t: 0, color: '#ff5470' }); }
  else if (inside) {
    G.mode = 'win'; G.wonAt = G.t; P.vx = 0; G.banner = null;
    burst(pr.x + 16, pr.y + 28, 50, ['#b07cff', '#8fe8ff', '#e6fbff', '#f0b541'], 90, 0, 1.2); sfx.win();
  }
}

/* ================= RENDER ================= */
const PW = A.PORTAL_W, PH = A.PORTAL_H;
const portalCv = document.createElement('canvas');
portalCv.width = PW; portalCv.height = PH;
const pctx = portalCv.getContext('2d'), pimg = pctx.createImageData(PW, PH);
const SWIRL = ['#140a38', '#2a1670', '#5a2fd0', '#9b6bff', '#c9a8ff', '#9ff0ff'].map(rgb);
const SEALED = ['#0d0a18', '#1a1528', '#2a2238', '#3a3050', '#4a4060', '#5a5070'].map(rgb);
function paintPortal(t, sealed) {
  const d = pimg.data, pal = sealed ? SEALED : SWIRL, spin = sealed ? 0.8 : 4;
  for (let i = 0; i < A.portalMask.length; i++) {
    if (!A.portalMask[i]) continue;
    const x = i % PW, y = (i / PW) | 0, dx = x - 15.5, dy = y - 28;
    const r = Math.hypot(dx, dy * 0.7), a = Math.atan2(dy, dx);
    const v = 0.65 * (0.5 + 0.5 * Math.sin(a * 2 + r * 0.55 - t * spin)) + 0.45 * Math.max(0, 1 - r / 9);
    const [cr, cg, cb] = pal[clamp(Math.floor(v * (pal.length - 1) + bayer(x, y) - 0.25), 0, pal.length - 1)];
    d[i * 4] = cr; d[i * 4 + 1] = cg; d[i * 4 + 2] = cb; d[i * 4 + 3] = 255;
  }
  pctx.putImageData(pimg, 0, 0);
}

/** Parallax layer: scrolls with `factor` horizontally and sinks as the camera climbs. */
function layer(img, lw, factor, drift = 0, vf = factor) {
  const dy = Math.round((WORLD_H - H - G.cam.y) * vf * 0.6) + (H - img.height);   // a taller view: scenery stays on the horizon
  let x = -Math.round(G.cam.x * factor + drift) % lw;
  if (x > 0) x -= lw;
  for (; x < W; x += lw) ctx.drawImage(img, x, dy);
}

/** Clockwork sky: great gears turning at different speeds behind the rooftops. */
const GEARS = [{ x: 40, y: 70, big: 1, sp: 1 }, { x: 150, y: 40, big: 0, sp: -1.6 }, { x: 250, y: 90, big: 1, sp: -0.8 }, { x: 330, y: 55, big: 0, sp: 1.4 }, { x: 420, y: 80, big: 1, sp: 1.1 }];
function drawGears(t) {
  for (const gr of GEARS) {
    const fr = gr.big ? A.gearFrames.big : A.gearFrames.small, img = fr[Math.floor(Math.abs(t * gr.sp * 4)) % fr.length];
    const x = ((gr.x - G.cam.x * 0.14) % 480 + 480) % 480 - 60, y = gr.y + Math.round((WORLD_H - H - G.cam.y) * 0.1);
    ctx.drawImage(img, Math.round(x) - (img.width >> 1), y - (img.height >> 1));
  }
}

function render() {
  applyView();
  flushTiles();
  const t = G.t, P = G.P, m = G.moonfall || (G.duel && G.duel.f2.moonfall), TH = A.THEMES[LV.theme];
  const sx = G.shake > 0 ? Math.round((Math.random() * 2 - 1) * Math.min(3, 1 + G.shake * 6)) : 0;
  const sy = G.shake > 0 ? Math.round((Math.random() * 2 - 1) * Math.min(3, 1 + G.shake * 6)) : 0;
  const cx = Math.round(G.cam.x) + sx, cy = Math.round(G.cam.y) - sy;
  const X = x => Math.round(x) - cx, Y = y => Math.round(y) - cy;

  // --- sky & distant scenery
  ctx.drawImage(TH.sky, 0, 0, W, H);
  if (TH.rays) { ctx.globalCompositeOperation = 'lighter'; let rx = -Math.round(G.cam.x * 0.1 + t * 4) % A.MIST_W; if (rx > 0) rx -= A.MIST_W; for (; rx < W; rx += A.MIST_W) ctx.drawImage(TH.rays, rx, 0); ctx.globalCompositeOperation = 'source-over'; }
  if (TH.earth) ctx.drawImage(A.earth, Math.round(66 - G.cam.x * 0.01) - A.earth.width / 2, 36 - A.earth.height / 2);
  if (LV.theme === 'frost') {
    ctx.globalCompositeOperation = 'lighter';
    const fr = A.aurora[Math.floor(t * 3) % A.aurora.length];
    let ax = -Math.round(G.cam.x * 0.05 + t * 3) % A.AURORA_W; if (ax > 0) ax -= A.AURORA_W;
    for (; ax < W; ax += A.AURORA_W) ctx.drawImage(fr, ax, 0);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (TH.stars) for (const s of stars) {
    const v = Math.sin(t * s.sp + s.ph);
    const x = Math.round(((s.x * W / 256 - G.cam.x * 0.02) % W + W) % W), y = Math.round(s.y);
    ctx.fillStyle = v > 0.3 ? (s.bright ? '#ffffff' : '#c9c3ef') : v > -0.5 ? '#8b84c0' : '#4c4488';
    ctx.fillRect(x, y, 1, 1);
    if (s.big && v > 0) { ctx.fillStyle = '#8b84c0'; ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); ctx.fillRect(x, y - 1, 1, 1); ctx.fillRect(x, y + 1, 1, 1); }
  }
  if (shoot) for (let i = 0; i < 12 && i <= shoot.life * 18; i++) {
    ctx.fillStyle = i < 2 ? '#ffffff' : i < 6 ? '#c9c3ef' : '#6f66a8';
    ctx.fillRect(Math.round(shoot.x - i * 2.6), Math.round(shoot.y - i), 1, 1);
  }
  const moonX = Math.round(W - 56 - G.cam.x * 0.015), moonShake = m && m.t < 0.7 ? Math.round(Math.random() * 2 - 1) : 0;
  if (TH.moon && !G.moonAwake) {
    const red = !G.moonFreed && (m || G.diff.id === 'overkill');
    ctx.drawImage(red ? A.moonRed : A.moon, moonX - A.MOON_C + moonShake, 30 - A.MOON_C);
    if (G.moonFreed) drawFreedFace(ctx, moonX, 30);
  }
  TH.layers.forEach((l, i) => {
    layer(l.img, l.w, l.f, -t * (l.drift || 0));
    if (TH.gears && i === 0) drawGears(t);
  });
  if (m) ctx.drawImage(A.moonTint, 0, 0, W, H);

  // --- level + damage cracks
  ctx.drawImage(tiles.canvas, -cx, -cy);
  const tx0 = Math.max(0, Math.floor(cx / TILE)), tx1 = Math.min(LV.cols - 1, tx0 + W / TILE + 1);
  const ty0 = Math.max(0, Math.floor(cy / TILE)), ty1 = Math.min(LV.rows - 1, ty0 + H / TILE + 1);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const w = tileWear(tx, ty);
    if (w > 0.2) ctx.drawImage(A.cracks[w > 0.6 ? 1 : 0], tx * TILE - cx, ty * TILE - cy);
  }

  const pr = LV.portal;
  if (pr) {
    paintPortal(t, pr.sealed);
    ctx.drawImage(portalCv, X(pr.x), Y(pr.y));
    ctx.drawImage(A.portalArch, X(pr.x), Y(pr.y));
  }
  for (const tr of G.torches) {
    if (tr.lit) ctx.drawImage(A.flames[Math.floor(tr.f) % 4], X(tr.x - 3), Y(tr.y - 20));
    ctx.drawImage(A.brazier, X(tr.x - 4), Y(tr.y - 10));
    if (!tr.lit) { ctx.fillStyle = Math.sin(tr.f) > 0 ? '#c2412a' : '#6e2a2a'; ctx.fillRect(X(tr.x - 1), Y(tr.y - 11), 2, 1); }
  }
  for (const c of G.crystals) {
    if (c.taken) continue;
    const bob = Math.round(Math.sin(t * 3 + c.ph) * 1.5);
    ctx.drawImage(A.crystal, X(c.x - 3), Y(c.y - 4 + bob));
    if (Math.sin(t * 2 + c.ph * 3) > 0.92) { ctx.fillStyle = '#ffffff'; ctx.fillRect(X(c.x - 3), Y(c.y - 5 + bob), 1, 1); }
  }
  drawIcicles(ctx, X, Y);
  drawMechanics(ctx, X, Y);
  for (const w of G.webs) if (w.t > 1.5 || Math.floor(w.t * 8) % 2) ctx.drawImage(A.webPatch, X(w.x), Y(w.y) - 6);
  if (!G.duel) { drawTelegraphs(ctx, X, Y); drawEnemies(ctx, X, Y); }
  forEachFighter(() => { drawGoo(ctx, X, Y); drawCharges(ctx, X, Y); drawMonkeyStuff(ctx, X, Y); });
  forEachFighter(F => drawHero(F, t, X, Y));
  forEachFighter(() => drawShots(t, X, Y));
  if (G.duel) forEachFighter(F => fighterMarker(F, X, Y));
  drawBeams(ctx, X, Y);

  for (const p of G.parts) {
    if (p.life < p.max * 0.3 && Math.floor(p.life * 30) % 2) continue;
    ctx.fillStyle = p.c;
    ctx.fillRect(X(p.x), Y(p.y), p.size, p.size);
  }
  for (const b of G.booms) {
    const fr = A.boomFrames(b.r), img = fr[Math.min(fr.length - 1, Math.floor((b.t / 0.5) * fr.length))];
    ctx.drawImage(img, X(b.x) - (img.width >> 1), Y(b.y) - (img.height >> 1));
  }
  drawWater(ctx);
  if (LV.theme === 'sunken') for (const bb of bubbles) { ctx.fillStyle = '#bff0f6'; ctx.fillRect(Math.round(bb.x), Math.round(bb.y), 1, 1); }
  if (LV.theme === 'woodland') for (const f of flakes) {                 // drifting leaves: green only, little irregular shapes that tumble as they fall
    if (f.big) continue;
    const k = Math.floor(f.dr * 10), shape = LEAF_SHAPES[(k + Math.floor(t * 3 + f.dr * 5)) % LEAF_SHAPES.length];
    const x = Math.round(f.x + Math.sin(t * 1.5 + f.dr) * 3), y = Math.round(f.y * 0.8);
    ctx.fillStyle = LEAF_COLS[k % LEAF_COLS.length];
    for (const [dx, dy] of shape) ctx.fillRect(x + dx, y + dy, 1, 1);
  }
  if (LV.theme === 'frost') for (const f of flakes) { ctx.fillStyle = f.big ? '#ffffff' : '#b9d8ee'; ctx.fillRect(Math.round(f.x), Math.round(f.y), f.big ? 2 : 1, f.big ? 2 : 1); }

  // --- light pass
  ctx.globalCompositeOperation = 'lighter';
  const gl = (img, x, y) => ctx.drawImage(img, X(x) - (img.width >> 1), Y(y) - (img.height >> 1));
  forEachFighter(F => {
    const sp = staffPos(F);
    if (!F.dead && F.king > 0) gl(A.glows.crescent, F.x + F.w / 2, F.y + 4);
    if (!F.dead && G.hero === 'ninja') glowNinja(gl, F);
    if (!F.dead && G.hero === 'wizard') gl(F.phase === 'blood' ? (F.castT > 0 ? A.glows.gemBigRed : A.glows.gemRed) : F.castT > 0 ? A.glows.gemBig : A.glows.gem, sp.gx, sp.gy);
    if (!F.dead && F.shield > 0) gl(A.glows.shield, F.x + 4, F.y + 9);
    if (!F.dead && F.ghost > 0) gl(A.glows.shield, F.x + 4, F.y + 6);
    for (const s of G.shots) {
      const g = { orb: A.glows.orb, dark: A.glows.dark, meteor: A.glows.meteor, note: A.glows.crystal, tick: A.glows.fuse, wisp: A.glows.crystal, bloodorb: A.glows.bloodorb, star: A.glows.star, plasma: A.glows.plasma, bubble: A.glows.bubble, crescent: A.glows.crescent, spiral: A.glows.crescent, rock: A.glows.crescent }[s.kind];
      if (g) gl(g, s.x, s.y);
    }
  });
  lights(gl, t, X, Y, pr, m, moonX);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(A.vignette, 0, 0, W, H);
  if (G.flash > 0) { ctx.fillStyle = '#fff4c9'; ctx.globalAlpha = 0.35; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }

  drawPops(ctx, X, Y);
  const hud = () => (G.duel ? drawDuelHud(ctx) : drawHud(ctx));
  if (G.mode === 'title') drawTitle(ctx);
  else if (G.mode === 'select') drawSelect(ctx, sel);
  else if (G.mode === 'dselect') drawDuelSelect(ctx, dsel);
  else if (G.mode === 'pause') { const bn = G.banner; G.banner = null; hud(); G.banner = bn; drawPause(ctx, G.pauseAt, G.pauseCol || 0); }   // no banner under the menu
  else hud();
}

/** Duel: a little tag over each fighter (cyan = you, red = the AI) — also points up when they're above the screen. */
function fighterMarker(P, X, Y) {
  if (P.dead) return;
  const you = !P.ai, x = X(P.x + P.w / 2), y = Math.max(1, Y(P.y) - 7);
  ctx.fillStyle = '#120d26'; ctx.fillRect(x - 3, y - 1, 7, 5);
  ctx.fillStyle = you ? '#8fe8ff' : '#ff5470';
  if (Y(P.y) - 7 < 1) { ctx.fillRect(x, y, 1, 1); ctx.fillRect(x - 1, y + 1, 3, 1); ctx.fillRect(x - 2, y + 2, 5, 1); }   // above the top: an up arrow
  else { ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x - 1, y + 1, 3, 1); ctx.fillRect(x, y + 2, 1, 1); }
}

/** The hero whose context is loaded (G.hero) — your one in the campaign, either fighter in a duel. */
function drawHero(P, t, X, Y) {
  const ps = pose(P), sp = staffPos(P, ps.bob);
  if (!P.dead && G.hero === 'ninja' && !(P.inv > 0 && Math.floor(P.inv * 14) % 2 === 0)) {
    const side = P.face > 0 ? 'r' : 'l';
    const spr = P.dash > 0 ? A.ninjaDash[side] : P.throwT > 0 || P.slashT > 0 ? A.ninjaThrow[side] : A.ninjaHero[ps.legs][side];
    if (P.flip > 0) {                                                       // FURY double jump: a quick salto
      ctx.save(); ctx.translate(X(P.x + 4), Y(P.y + 11)); ctx.rotate(Math.round((1 - P.flip / 0.35) * 4) * (Math.PI / 2) * P.face);
      ctx.drawImage(spr, -8, -17); ctx.drawImage(A.katanaUp[Math.floor(t * 12) % 2][side], P.face > 0 ? 4 : -16, -9); ctx.restore();
    } else drawNinja(ctx, X, Y, P, spr, X(P.x - 4), Y(P.y - 6) + (P.dash > 0 ? 0 : ps.bob));
  } else if (!P.dead && G.hero === 'goblin' && !(P.inv > 0 && P.ride <= 0 && Math.floor(P.inv * 14) % 2 === 0)) {
    const side = P.face > 0 ? 'r' : 'l';
    if (P.ride > 0) { const f = A.goblinRide[Math.floor(t * 14) % 4][side]; ctx.drawImage(f, X(P.x + P.w / 2) - 11, Y(P.y + P.h) - 28); }
    else ctx.drawImage(P.throwT > 0 ? A.goblinThrow[side] : A.goblinHero[ps.legs][side], X(P.x - 4), Y(P.y - 6) + ps.bob);
  } else if (!P.dead && G.hero === 'monkey' && !(P.inv > 0 && Math.floor(P.inv * 14) % 2 === 0)) {
    const side = P.face > 0 ? 'r' : 'l';
    const spr = P.carry ? A.monkeyExtra.carry[side] : P.throwT > 0 ? A.monkeyExtra.throw[side] : P.flip > 0 ? A.monkeyExtra.flip[side] : A.monkeyHero[ps.legs][side];
    if (P.flip > 0) {                                                       // salto on the double jump
      ctx.save(); ctx.translate(X(P.x + 4), Y(P.y + 9)); ctx.rotate(Math.round((1 - P.flip / 0.35) * 4) * (Math.PI / 2) * P.face);
      ctx.drawImage(spr, -8, -15); ctx.restore();
    } else ctx.drawImage(spr, X(P.x - 4), Y(P.y - 6) + ps.bob);
  } else if (!P.dead && G.hero === 'slime' && !(P.inv > 0 && Math.floor(P.inv * 14) % 2 === 0)) {
    const set = P.king > 0 ? A.slimeKing : A.slimeHero[clamp(Math.ceil(P.hp), 1, 5) - 1];
    const f = P.smash > 0 ? set.squash : !P.onGround ? (P.vy < 0 ? set.stretch || set.idle : set.squash) : Math.abs(P.vx) > 8 ? (Math.floor(P.walk) % 2 ? set.squash : set.idle) : (Math.sin(t * 3) > 0.6 ? set.squash : set.idle);
    if (P.hug && P.king <= 0 && !P.onGround) {                              // clinging: belly flat on the wall, eyes up
      const s = P.hug, c = P.splat > 0.1 ? set.squash : Math.sin(t * 2.5) > 0.7 ? set.squash : set.idle, spr = c[s > 0 ? 'r' : 'l'];
      ctx.save(); ctx.translate(X(s > 0 ? P.x + P.w : P.x) + (s > 0 ? 1 : 0), Y(P.y + P.h / 2)); ctx.rotate(-s * Math.PI / 2);
      ctx.drawImage(spr, -Math.floor(spr.width / 2), -spr.height + 1); ctx.restore();
    } else {
      const spr = f[P.face > 0 ? 'r' : 'l'], off = spr.width / 2 + (P.face > 0 ? -2 : 2);
      ctx.drawImage(spr, X(P.x + P.w / 2) - Math.round(off), Y(P.y + P.h) - (spr.height - 1));
    }
    if (P.smash > 0) {                                                     // the SMASH arc
      const cx0 = X(P.x + P.w / 2 + P.face * 16), cy0 = Y(P.y + P.h / 2), k = 1 - P.smash / 0.18;
      for (let a = -1.2; a <= 1.2; a += 0.12) {
        const r = 14 + k * 6, px = Math.round(cx0 + Math.cos(a) * r * P.face), py = Math.round(cy0 + Math.sin(a) * r);
        ctx.fillStyle = Math.abs(a) < 0.6 ? '#ffffff' : '#9ff0c0'; ctx.fillRect(px, py, 2, 2);
      }
    }
  } else if (!P.dead && G.hero === 'skeleton' && P.ghost > 0) {
    if (P.ghost > 1 || Math.floor(t * 14) % 2) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(A.ghostForm[Math.floor(t * 8) % 2][P.face > 0 ? 'r' : 'l'], X(P.x - 4), Y(P.y - 6) + Math.round(Math.sin(t * 5)));
      ctx.globalAlpha = 1;
    }
  } else if (!P.dead && G.hero === 'skeleton' && !(P.inv > 0 && P.pile <= 0 && Math.floor(P.inv * 14) % 2 === 0)) {
    const set = P.pile > 0 ? null : P.headless ? A.skeletonHeadless : A.skeletonHero;
    const spr = set ? set[ps.legs][P.face > 0 ? 'r' : 'l'] : A.bonePile[P.face > 0 ? 'r' : 'l'];
    ctx.drawImage(spr, X(P.x - 4), Y(P.y - 6) + (set ? ps.bob : 0));
  } else if (!P.dead && !(P.inv > 0 && Math.floor(P.inv * 14) % 2 === 0)) {
    const spr = A.wizard[ps.legs][P.face > 0 ? 'r' : 'l'];
    const bx = X(P.x - 4), by = Y(P.y - 6);
    ctx.drawImage(P.phase === 'blood' ? A.staffBlood : A.staff, X(sp.x), Y(sp.y));
    ctx.drawImage(spr, 0, 17, 16, 7, bx, by + 17, 16, 7);
    ctx.drawImage(spr, 0, 0, 16, 18, bx, by + ps.bob, 16, 18);
  }
  if (!P.dead && P.shield > 0 && (P.shield > 0.4 || Math.floor(t * 16) % 2)) {
    ctx.drawImage(A.shieldFrames[Math.floor(t * 12) % 4], X(P.x + 4) - 15, Y(P.y + 9) - 15);
  }
}

function drawShots(t, X, Y) {
  for (const s of G.shots) {
    if (s.kind === 'orb') ctx.drawImage(A.orbSprite, X(s.x) - 3, Y(s.y) - 3);
    else if (s.kind === 'bloodorb') ctx.drawImage(A.bloodOrbSprite, X(s.x) - 3, Y(s.y) - 3);
    else if (s.kind === 'dark' && LV.theme === 'lunar' && !s.friendly) { ctx.fillStyle = '#2f8a4a'; ctx.fillRect(X(s.x) - 2, Y(s.y) - 2, 5, 5); ctx.fillStyle = '#9dff6a'; ctx.fillRect(X(s.x) - 1, Y(s.y) - 1, 3, 3); }   // psychic bolts
    else if (s.kind === 'dark') ctx.drawImage(A.darkSprite, X(s.x) - 2, Y(s.y) - 2);
    else if (s.kind === 'rock') ctx.drawImage(A.rockSprite, X(s.x) - 3, Y(s.y) - 3);
    else if (s.kind === 'spiral') ctx.drawImage(A.moonstone, X(s.x) - 3, Y(s.y) - 3);
    else if (s.kind === 'bubble') ctx.drawImage(A.bubbleSprite, X(s.x) - 5, Y(s.y) - 5);
    else if (s.kind === 'crescent') ctx.drawImage(A.crescentSprite[s.vx > 0 ? 'r' : 'l'], X(s.x) - 7, Y(s.y) - 6);
    else if (s.kind === 'plasma') ctx.drawImage(A.plasmaBall, X(s.x) - 3, Y(s.y) - 3);
    else if (s.kind === 'star') ctx.drawImage(A.starShot, X(s.x) - 2, Y(s.y) - 2);
    else if (s.kind === 'shuriken') ctx.drawImage(A.shurikenFrames[Math.floor(t * 20) % 2], X(s.x) - 3, Y(s.y) - 3);
    else if (s.kind === 'acorn') ctx.drawImage(A.acornSprite, X(s.x) - 2, Y(s.y) - 2);
    else if (s.kind === 'bigacorn') { const k = A.acornSprite; ctx.drawImage(k, 0, 0, k.width, k.height, X(s.x) - 4, Y(s.y) - 5, k.width * 2, k.height * 2); }
    else if (s.kind === 'harpoon') { const d = Math.sign(s.vx); ctx.fillStyle = '#6a6a6a'; ctx.fillRect(X(s.x) - d * 9, Y(s.y), 9, 1); ctx.fillStyle = '#c9c3ef'; ctx.fillRect(X(s.x) - (d > 0 ? 1 : 0), Y(s.y) - 1, 2, 3); }
    else if (s.kind === 'web') ctx.drawImage(A.webBall, X(s.x) - 3, Y(s.y) - 3);
    else if (s.kind === 'banana') ctx.drawImage(A.bananaFrames[Math.floor(t * 14) % 4], X(s.x) - 4, Y(s.y) - 4);
    else if (s.kind === 'glob') ctx.drawImage(A.gooShot, X(s.x) - 3, Y(s.y) - 3);
    else if (s.kind === 'wisp') ctx.drawImage(A.wispSprite, X(s.x) - 2, Y(s.y) - 2);
    else if (s.kind === 'skull') ctx.drawImage(A.skullBall[Math.floor(s.spin || 0) % 4], X(s.x) - 5, Y(s.y) - 5);
    else if (s.kind === 'gearshot') ctx.drawImage(A.gearFrames.bolt[Math.floor(s.spin || 0) % 4], X(s.x) - 5, Y(s.y) - 5);
    else if (s.kind === 'note') ctx.drawImage(A.noteSprite[Math.floor(t * 6) % 2], X(s.x) - 2, Y(s.y) - 3);
    else if (s.kind === 'tick') { ctx.fillStyle = '#3a2410'; ctx.fillRect(X(s.x) - 2, Y(s.y) - 2, 4, 4); ctx.fillStyle = '#ffe29a'; ctx.fillRect(X(s.x) - 1, Y(s.y) - 1, 2, 2); }
    else if (s.kind === 'boulder') ctx.drawImage(A.boulderSprite, X(s.x) - 7, Y(s.y) - 7);
    else if (s.kind === 'bone') { const b = A.boneSprite[Math.floor(t * 12) % 2]; ctx.drawImage(b, X(s.x) - (b.width >> 1), Y(s.y) - (b.height >> 1)); }
    else if (s.kind === 'wave') { const f = A.waveFrames[Math.floor(t * 14) % 2]; ctx.drawImage(f, X(s.x) - 6, Y(s.y) - 6); }
    else if (s.kind === 'meteor') {
      ctx.fillStyle = s.friendly ? '#ff7b2e' : '#b83a45'; ctx.fillRect(X(s.x) - 2, Y(s.y) - 2, 5, 5);
      ctx.fillStyle = s.friendly ? '#fff4c9' : '#ffc9a0'; ctx.fillRect(X(s.x) - 1, Y(s.y) - 1, 3, 3);
    } else {                                                           // arrow
      const sp2 = Math.hypot(s.vx, s.vy), ux = s.vx / sp2, uy = s.vy / sp2;
      if (LV.theme === 'lunar' && s.kind === 'arrow' && !s.friendly) {       // alien ray-gun bolt
        for (let i = 0; i < 6; i++) { ctx.fillStyle = i < 2 ? '#ffffff' : '#9dff6a'; ctx.fillRect(X(s.x - ux * i), Y(s.y - uy * i), 1, 1); }
        continue;
      }
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = i === 0 ? '#c9c3ef' : i > 5 ? '#e8e2cf' : s.kind === 'parrow' ? '#c08850' : s.friendly ? '#8fe8ff' : '#9a6434';
        ctx.fillRect(X(s.x - ux * i), Y(s.y - uy * i), 1, 1);
      }
    }
  }
}

/** Additive lights for the scenery: torches, crystals, booms, beams, glowing foes, portal, fireflies. */
function lights(gl, t, X, Y, pr, m, moonX) {
  for (const tr of G.torches) {
    if (tr.lit) gl(Math.floor(tr.f * 0.7) % 3 ? A.glows.fire : A.glows.fire2, tr.x, tr.y - 15);
    else gl(A.glows.ember, tr.x, tr.y - 11);
  }
  for (const c of G.crystals) if (!c.taken) gl(A.glows.crystal, c.x, c.y);
  for (const bm of G.beams) for (let y = bm.top; y < G.cam.y + H; y += 24) gl(A.glows.beam, bm.x, y);
  for (const b of G.booms) if (b.t < 0.25) gl(A.glows.boom, b.x, b.y);
  for (const e of G.enemies) {
    if (!e.alive) continue;
    if (e.type === 'bomber' && e.state !== 'patrol') gl(A.glows.fuse, e.x + e.w / 2, e.y);
    if (e.type === 'moon' && e.state !== 'sleep') gl(A.glows.red, e.x + e.w / 2, e.y + e.h / 2);
  }
  if (pr) gl(pr.sealed ? A.glows.ember : A.glows.portal, pr.x + 16, pr.y + 28);
  if (m && m.t < 3) ctx.drawImage(A.glows.red, moonX - A.glows.red.width / 2, 30 - A.glows.red.height / 2);
  for (const f of flies) {
    const fx = f.x + Math.sin(t * f.sp + f.ph) * 14, fy = f.y + Math.sin(t * f.sp * 1.3 + f.ph * 2) * 7;
    if (fx - G.cam.x < -8 || fx - G.cam.x > W + 8 || fy - G.cam.y < -8 || fy - G.cam.y > H + 8 || Math.sin(t * 2 * f.sp + f.ph) < -0.2) continue;
    gl(A.glows.fly, fx, fy);
    ctx.fillStyle = '#e9ff9a'; ctx.fillRect(X(fx), Y(fy), 1, 1);
  }
}

/** A duel zooms out: a bigger logical canvas (1.5×) so the whole arena fits; everything else stays 256×144. */
function applyView() {
  const big = G.duel && G.mode !== 'dselect', w = big ? 384 : 256, h = big ? 216 : 144;
  if (W === w && H === h) return;
  setView(w, h);
  cv.width = w; cv.height = h;
  ctx.imageSmoothingEnabled = false;
  fit();
}

/* ================= LOOP ================= */
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  const k = s >= 2 ? Math.floor(s) : s;
  cv.style.width = `${Math.floor(W * k)}px`;
  cv.style.height = `${Math.floor(H * k)}px`;
}
addEventListener('resize', fit);
fit();

reset(0);
const STEP = 1 / 60;
let last = performance.now(), acc = 0;
function step() {
  if (G.hitstop > 0) { G.hitstop -= STEP; return; }
  update(STEP);
  hit.clear();
}
function frame(now) {
  pollPads();                                                              // gamepad buttons become key presses
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (acc >= STEP) { if (!QA.paused) step(); acc -= STEP; }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// QA hook — lets agents drive and inspect the game from the console.
const QA = (window.__GAME__ = { G, get LV() { return LV; }, render, step, reset, startRun, setHero, beginDuel, paused: false });
