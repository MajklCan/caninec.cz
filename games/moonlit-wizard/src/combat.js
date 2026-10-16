// Damage, death, explosions, projectiles and the Moonfall special.
import { W, H, TILE, clamp } from './gfx.js';
import { startBossDeath, resetBoss, wakeBoss, inArena } from './boss.js';
import { dropIcicle } from './hazards.js';
import { addPeg } from './mechanics.js';
import { puddleAt } from './goo.js';
import { rocketPush } from './goblin.js';
import { starHits } from './ninja.js';
import { updateBloodOrb } from './lunar.js';
import { dropPeel, troopTakesHit } from './monkey.js';
import { G, later, banner } from './state.js';
import { LV, solidTile, solidAt, damageTile, groundBelow, move, WORLD_H } from './world.js';
import { burst, smoke, gibs, pop, CYAN, FIRE } from './fx.js';
import { sfx } from './audio.js';
import { newPlayer, SHIELD_R, ORB, CD } from './player.js';
import { hitFighter } from './duel.js';

const GIBS = {
  slime: ['#3fcf9a', '#c4ffe6', '#2a8f74'], bat: ['#4a3670', '#ff4d6d', '#2a1c42'],
  archer: ['#e8e2cf', '#a9a18c', '#1b1330'], brute: ['#6f6a8a', '#aeabcb', '#d9555f', '#e8e2cf'],
  bomber: ['#6ea84a', '#3f6e33', '#5a3a2a'], cultist: ['#4a2a7a', '#7b4dff', '#8fe8ff'],
  barrel: ['#b83a45', '#8c89ab', '#7a1f35'],
  jelly: ['#e98ad8', '#ffd8f6', '#8a3a80'], diver: ['#c08a3a', '#3a5a6a', '#8fe8ff'], tinsoldier: ['#b83a45', '#2f4a8a', '#f0b541'],
  drone: ['#c08a3a', '#ffe29a', '#6a6a6a'], hopper: ['#dcd8cc', '#fffaf0', '#ff9aa8'], ufo: ['#a8b0c0', '#9dff6a', '#8fe8ff'], egg: ['#9b5cff', '#9dff6a', '#5a2fb0'], sentry: ['#bff4ff', '#6fcbe8', '#ffffff'],
  warden: ['#e8e2cf', '#aeabcb', '#6f6a8a'], moon: ['#faf5e2', '#cfc4a4', '#ff6a55'],
  treant: ['#5e3e24', '#8a5e38', '#6ea84a', '#3f7a3a'], squirrel: ['#c0642e', '#e89a58', '#f3d2a2'], nest: ['#b9a88a', '#8a7a62', '#ffd23d'], wasp: ['#ffd23d', '#1b1106', '#e6fbff'], stag: ['#6e4a2e', '#e9dcb8', '#4f8a3a', '#9ff0c0'],
  organist: ['#5f8f8c', '#9fcfc8', '#8fe8ff'], widow: ['#ffe29a', '#c08a3a', '#4a4550'], eclipse: ['#20113a', '#7b4dff', '#ffffff'],
};
const STREAK = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'MULTI KILL', 'MEGA KILL'];

/* ================= PLAYER ================= */
export function hurtPlayer(fromX, dmg = 1) {
  const P = G.P;
  if (G.mode !== 'play' || P.dead || P.inv > 0) return;
  if (P.shield > 0) { burst(P.x + 4, P.y + 9, 8, CYAN, 60, 0, 0.3); sfx.reflect(); return; }
  if (P.pile > 0 || P.ghost > 0 || P.king > 0 || P.ride > 0 || P.dash > 0) return;
  if (G.hero === 'monkey' && troopTakesHit(P, fromX)) return;              // a troop monkey jumps in front of it                                  // a heap of bones — or a ghost — can't be hurt
  if (G.hero === 'skeleton' && P.hp - dmg <= 0 && !P.revived) {           // passive: cheat death once per checkpoint
    P.revived = true; P.hp = 1; P.pile = 1.2; P.inv = 2.2;
    burst(P.x + 4, P.y + 8, 20, ['#ece6d2', '#b3aa92', '#8fe8ff'], 80, 300, 0.6);
    pop('NOT TODAY!', P.x - 16, P.y - 14, '#8fe8ff'); sfx.pop(); G.shake = 0.3;
    return;
  }
  const k = G.duel ? 0.45 + dmg * 0.5 : 1;                               // duel: small hits, small shoves, short mercy frames
  P.hp -= dmg; P.inv = G.duel ? 0.25 : 1.1;
  P.vx = Math.sign(P.x + 4 - fromX || -P.face) * 130 * k; P.vy = -170 * k;
  G.shake = Math.max(G.shake, 0.25);
  sfx.hurt();
  burst(P.x + 4, P.y + 8, 14, ['#ff5470', '#ffd0da', '#b82b52'], 70);
  if (P.hp <= 0) killPlayer();
}

export function killPlayer() {
  const P = G.P;
  if (P.dead) return;
  P.dead = true; P.hp = 0;
  G.deaths++; G.shake = 0.4;
  sfx.die();
  gibs(P.x + 4, P.y + 8, ['#b33b48', '#f3eddc', '#f0b541', '#7d2340'], 18);
  burst(P.x + 4, P.y + 8, 24, CYAN, 80, 0, 0.8);
  if (!G.duel) later(1.2, respawn);                                       // duel: the round is over instead
}

/** The sleeping Moon is still just scenery — nothing can touch it yet. */
export const ghost = e => e.boss && e.type === 'moon' && e.state === 'sleep' || (e.fighter && untouchable(e.fighter.P));
/** Duel rival states that weapons pass straight through (bone pile, ghost, dash, dead). */
const untouchable = P => P.dead || P.pile > 0 || P.ghost > 0 || P.dash > 0;

function respawn() {
  resetBoss();
  const cd = G.P.cd, cp = G.checkpoint;
  G.P = newPlayer(cp.x, cp.y);
  G.P.cd = cd;
  G.P.inv = 1.5;
  burst(cp.x + 4, cp.y + 8, 20, CYAN, 50, -40, 0.8);
}

/* ================= ENEMIES ================= */
export function damageEnemy(e, dmg, fromX, kind = 'shot') {
  if (e.fighter) { if (!ghost(e)) hitFighter(e.fighter, dmg, fromX); return; }   // duel rival: hurt the hero behind the proxy
  if (!e.alive || ghost(e) || e.state === 'dying') return;
  if (e.boss && e.state === 'sleep') {                                     // shooting the warden from inside the arena wakes it
    if (inArena(G.P)) wakeBoss(e); else return;
  }
  if (e.boss && e.state === 'stunned' || e.state === 'dazed') dmg *= 2;    // punish the opening
  const cx = e.x + e.w / 2, side = Math.sign(fromX - cx) || 1;
  if (e.type === 'brute' && kind === 'shot' && side === e.dir && !(e.swing > 0)) {
    burst(cx + e.dir * 7, e.y + 10, 5, ['#f0b541', '#fff4c9'], 60, 100, 0.25);
    sfx.tink();
    return;
  }
  e.hp -= dmg; e.flash = 0.08;
  if (kind === 'shot' && !e.flying && e.type !== 'barrel' && !e.boss && !e.heavy) e.vx -= side * 30;
  if (e.type === 'cultist') e.tp = Math.min(e.tp, 0.25);
  if (e.type === 'archer' && e.state === 'patrol') { e.state = 'aim'; e.timer = 0.45; e.dir = side; e.mark = { ch: '!', t: 0.8 }; }
  if (e.type === 'bomber' && e.state === 'patrol') { e.state = 'windup'; e.timer = 0.5; e.mark = { ch: '!', t: 0.8 }; }
  if (e.type === 'brute') e.dir = side;
  if (e.hp <= 0) killEnemy(e);
  else burst(cx, e.y + e.h / 2, 3, GIBS[e.type] || GIBS.slime, 40, 200, 0.3);
}

export function killEnemy(e, fell = false) {
  if (!e.alive) return;
  if (e.boss) { startBossDeath(e); return; }
  e.alive = false;
  if (e.onDeath) e.onDeath(e);
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  if (!fell) { gibs(cx, cy, GIBS[e.type], e.type === 'brute' ? 16 : 10); sfx.pop(); }
  if (e.type === 'barrel') {
    if (!fell) later(0.05 + Math.random() * 0.08, () => explode(cx, cy, 36, { dmg: 5, hurtsPlayer: true }));
    return;
  }
  if (e.type === 'bomber' && !fell) explode(cx, cy, 30, { dmg: 4, hurtsPlayer: true });
  G.kills++;
  const c = G.combo;
  c.n = c.t > 0 ? c.n + 1 : 1;
  c.t = 1.6;
  c.best = Math.max(c.best, c.n);
  if (c.n >= 2) banner(STREAK[c.n] || `RAMPAGE X${c.n}`, c.n >= 5 ? '#ff5470' : '#f0b541');
}

/* ================= EXPLOSIONS ================= */
export function explode(x, y, r, { dmg = 4, hurtsPlayer = false, tileDmg = 1, spare = null } = {}) {
  G.booms.push({ x, y, r, t: 0 });
  sfx.boom(r);
  G.shake = Math.max(G.shake, r < 24 ? 0.07 : 0.18 + r / 110);
  if (r >= 24) G.hitstop = Math.max(G.hitstop, 0.035);
  if (r >= 30) G.flash = 0.05;

  for (let ty = Math.floor((y - r) / TILE); ty <= Math.floor((y + r) / TILE); ty++)
    for (let tx = Math.floor((x - r) / TILE); tx <= Math.floor((x + r) / TILE); tx++) {
      const d = Math.hypot(tx * TILE + 8 - x, ty * TILE + 8 - y);
      if (d < r) damageTile(tx, ty, (1 + (1 - d / r) * 5) * tileDmg);
    }

  for (const e of G.enemies) {
    if (!e.alive || e === spare || ghost(e)) continue;
    const ex = e.x + e.w / 2, ey = e.y + e.h / 2, d = Math.hypot(ex - x, ey - y);
    if (d > r + Math.max(e.w, e.h) / 2) continue;
    if (!e.flying && e.type !== 'barrel' && !e.boss && !e.heavy) { e.vx = (Math.sign(ex - x) || 1) * 150; e.vy = -200; e.stun = 0.5; }
    damageEnemy(e, dmg, x, 'boom');
  }

  const P = G.P;
  if (hurtsPlayer && !P.dead && Math.hypot(P.x + 4 - x, P.y + 9 - y) < r + 8) {
    if (P.shield > 0) sfx.reflect();
    else if (P.ghost > 0 || P.pile > 0) { /* passes right through */ }
    else if (G.hero === 'goblin') rocketPush(x, y);                          // Goblinbomber is blast-proof: any boom just launches him
    else { hurtPlayer(x); P.vx = (Math.sign(P.x + 4 - x) || 1) * 200; P.vy = -230; }
  }
  for (const c of G.icicles) if (Math.hypot(c.x - x, c.y - y) < r + 12) dropIcicle(c);
  smoke(x, y, Math.round(r / 3));
  burst(x, y, Math.round(r / 2), FIRE, r * 3, 150, 0.6);
}

/* ================= PROJECTILES ================= */
export function finish(s, tx, ty) {
  s.dead = true;
  if (s.kind === 'orb') explode(s.x, s.y, ORB.radius, { dmg: ORB.dmg, tileDmg: ORB.tileDmg });
  else if (s.kind === 'meteor') explode(s.x, s.y, s.friendly ? 26 : 22, s.friendly ? { dmg: 5 } : { dmg: 2, hurtsPlayer: true, spare: G.boss });
  else if (s.kind === 'bubble') burst(s.x, s.y, 8, ['#bff0f6', '#8fe8ff', '#ffffff'], 40, -20, 0.4);
  else if (s.kind === 'wave' || s.kind === 'bone' || s.kind === 'rock' || s.kind === 'crescent' || s.kind === 'spiral') burst(s.x, s.y, 6, ['#e8e2cf', '#aeabcb', '#faf5e2'], 50, 200, 0.4);
  else if (s.kind === 'boulder') { burst(s.x, s.y, 16, ['#8c89ab', '#aeabcb', '#524f6d', '#e8e2cf'], 90, 400, 0.6, { size: 2, bounce: true }); G.shake = Math.max(G.shake, 0.25); sfx.stomp(); }
  else if (s.kind === 'dark') burst(s.x, s.y, 8, ['#b07cff', '#7b4dff', '#2a1670'], 40, 0, 0.4);
  else if (s.kind === 'plasma') burst(s.x, s.y, 8, ['#9dff6a', '#ffffff', '#2f8a4a'], 50, 100, 0.4);
  else if (s.kind === 'star' || s.kind === 'harpoon') burst(s.x, s.y, 5, s.kind === 'star' ? ['#ffe14d', '#fff4c9'] : ['#c9c3ef', '#6a6a6a'], 40, 100, 0.3);
  else if (s.kind === 'web') burst(s.x, s.y, 6, ['#ffffff', '#e6e2f0'], 40, 0, 0.3);
  else if (s.kind === 'banana') burst(s.x, s.y, 5, ['#ffe14d', '#fff4c9'], 40, 200, 0.3);
  else if (s.kind === 'glob') burst(s.x, s.y, 6, ['#4fd18a', '#9ff0c0', '#2a8f5c'], 40, 200, 0.4);
  else if (s.kind === 'wisp') burst(s.x, s.y, 5, ['#ffffff', '#bdf2ff', '#58d7ff'], 40, 0, 0.3);
  else if (s.kind === 'note' || s.kind === 'tick') burst(s.x, s.y, 5, s.kind === 'note' ? ['#8fe8ff', '#c9a8ff'] : ['#ffe29a', '#c08a3a'], 40, 0, 0.3);
  else burst(s.x, s.y, 3, ['#9a6434', '#e8e2cf'], 30, 200, 0.3);
}

/** Recalled skull: flies straight home through walls, bowling over anything on the way. */
function recallSkull(s, dt) {
  const P = G.P, tx = P.x + 4, ty = P.y + 3, dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy), sp = 340 * dt;
  s.spin = (s.spin || 0) + dt * 20;
  if (Math.random() < 0.6) G.parts.push({ x: s.x, y: s.y, vx: 0, vy: 0, life: 0.3, max: 0.3, c: '#8fe8ff', g: 0, size: 1 });
  for (const e of G.enemies) {
    if (!e.alive || ghost(e) || s.hitSet.has(e) || s.x < e.x - 5 || s.x > e.x + e.w + 5 || s.y < e.y - 5 || s.y > e.y + e.h + 5) continue;
    s.hitSet.add(e); damageEnemy(e, s.dmg, s.x - dx, 'boom'); s.strikes++; sfx.stomp();
    burst(s.x, s.y, 8, ['#ece6d2', '#ffffff'], 70, 200, 0.4);
  }
  if (P.dead || d <= sp + 4) {
    s.dead = true; P.headless = false; P.cd.e = 1;   // caught it: quick re-throw
    burst(P.x + 4, P.y + 2, 10, ['#ece6d2', '#8fe8ff'], 40, 0, 0.4);
    if (s.strikes >= 2) pop(s.strikes >= 3 ? 'STRIKE!' : 'SPARE!', P.x - 12, P.y - 12, '#f0b541');
    sfx.collect();
    return;
  }
  s.x += (dx / d) * sp; s.y += (dy / d) * sp;
}

/** Skull bowling ball & clockwork gears: they roll, bounce off walls and bowl through whatever they meet. */
function rollShot(s, dt) {
  if (s.recall) return recallSkull(s, dt);
  const P = G.P, box = { x: s.x - 5, y: s.y - 5, w: 10, h: 10, vx: s.vx, vy: s.vy + (s.g || 600) * (LV.grav || 1) * dt };
  const fall = box.vy, hitWall = move(box, dt);
  if (hitWall) {
    const tx = Math.floor((s.vx > 0 ? box.x + box.w + 2 : box.x - 2) / TILE);
    for (let ty = Math.floor(box.y / TILE); ty <= Math.floor((box.y + box.h - 1) / TILE); ty++) damageTile(tx, ty, s.friendly ? 4 : 1);
    s.vx = -s.vx * 0.85; G.shake = Math.max(G.shake, 0.12); sfx.stomp();
  }
  const skull = s.kind === 'skull';
  if (box.onGround) {
    s.vy = skull ? (Math.abs(fall) > 120 ? -Math.abs(fall) * 0.45 : 0) : -Math.max(60, Math.abs(fall) * 0.45);
    if (skull) { s.vx -= Math.sign(s.vx) * Math.min(Math.abs(s.vx), 170 * dt); }   // rolls to a stop, waits for you
  } else s.vy = box.vy;
  s.x = box.x + 5; s.y = box.y + 5; s.life -= dt; s.age = (s.age || 0) + dt; s.spin = (s.spin || 0) + dt * Math.abs(s.vx) * 0.08;
  if (skull && s.age > 0.35 && !P.dead && s.x > P.x - 6 && s.x < P.x + P.w + 6 && s.y > P.y - 6 && s.y < P.y + P.h + 4) {   // caught!
    s.dead = true; P.headless = false; P.cd.e = 1;   // caught it: quick re-throw
    burst(P.x + 4, P.y + 2, 10, ['#ece6d2', '#8fe8ff'], 40, 0, 0.4);
    pop(s.strikes >= 3 ? 'STRIKE!' : s.strikes === 2 ? 'SPARE!' : 'CAUGHT!', P.x - 12, P.y - 12, s.strikes >= 2 ? '#f0b541' : '#ece6d2');
    sfx.collect();
    return;
  }
  if (s.friendly) {
    for (const e of G.enemies) {
      if (Math.abs(s.vx) < 40 && Math.abs(s.vy) < 40) break;                 // a resting skull is harmless
      if (!e.alive || ghost(e) || s.hitSet.has(e) || s.x < e.x - 5 || s.x > e.x + e.w + 5 || s.y < e.y - 5 || s.y > e.y + e.h + 5) continue;
      s.hitSet.add(e);
      damageEnemy(e, s.dmg, s.x - Math.sign(s.vx) * 10, 'boom');
      if (!e.boss && !e.flying && e.type !== 'barrel') { e.vx = Math.sign(s.vx || 1) * 240; e.vy = -280; e.stun = 0.9; }
      s.strikes++; sfx.stomp(); burst(s.x, s.y, 8, ['#ece6d2', '#ffffff'], 70, 200, 0.4);
      if (s.strikes === 3) { banner('STRIKE!', '#f0b541', 1.4); G.shake = 0.3; }
    }
  } else if (!P.dead && s.x > P.x - 4 && s.x < P.x + P.w + 4 && s.y > P.y - 2 && s.y < P.y + P.h + 4) {
    if (P.shield > 0) { s.vx = -s.vx; sfx.reflect(); } else { hurtPlayer(s.x, s.dmg); s.life = 0; }
  }
  if (s.life <= 0 || s.y > WORLD_H + 20) {
    s.dead = true;
    if (s.kind === 'skull') {                                               // lost or left too long: it finds its way home
      P.headless = false; P.cd.e = CD.e;
      burst(s.x, Math.min(s.y, G.cam.y + H), 10, ['#ece6d2', '#8fe8ff'], 50, 0, 0.4);
      burst(P.x + 4, P.y + 2, 10, ['#ece6d2', '#8fe8ff'], 40, 0, 0.4);
      sfx.ready();
    } else burst(s.x, s.y, 6, ['#ffe29a', '#c08a3a'], 50, 200, 0.4);
  }
}

export function updateShots(dt) {
  const P = G.P, pcx = P.x + 4, pcy = P.y + 9;
  for (const s of G.shots) {
    if (s.dead) continue;
    if (s.kind === 'skull' || s.kind === 'gearshot') { rollShot(s, dt); continue; }
    if (s.kind === 'bloodorb') { updateBloodOrb(s, dt); continue; }        // Blood Moon boomerang
    if (s.kind === 'note' && !s.straight) { s.ph = (s.ph || 0) + dt * 9; s.vy += Math.cos(s.ph) * 90 * dt; }
    if (s.kind === 'bubble') { s.ph += dt * 3; s.vy += Math.cos(s.ph) * 30 * dt; }
    if (s.kind === 'spiral') {                                             // rides its arm outward from the centre
      s.r += s.speed * dt; s.a += s.spin * dt;
      const nx = s.cx + Math.cos(s.a) * s.r, ny = s.cy + Math.sin(s.a) * s.r;
      s.vx = (nx - s.x) / dt; s.vy = (ny - s.y) / dt;
    }
    if (s.kind === 'dark' && !s.friendly && !P.dead && s.home !== false) {               // homing hex
      const cur = Math.atan2(s.vy, s.vx), want = Math.atan2(pcy - s.y, pcx - s.x);
      const da = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI, a = cur + clamp(da, -1.8 * dt, 1.8 * dt);
      const sp = Math.hypot(s.vx, s.vy);
      s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp;
    }
    s.vy += (s.g || 0) * dt;
    if (s.vmax && s.vy > s.vmax) s.vy = s.vmax;                          // readable: falling shots stop speeding up
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    trail(s);
    if (s.life <= 0) { if (s.kind === 'glob') puddleAt(s.x, s.y, s.value); finish(s); continue; }
    if ((s.kind === 'wave' || s.kind === 'crescent') && !solidAt(s.x, s.y + (s.kind === 'wave' ? 8 : 10))) { finish(s); continue; }   // ground-huggers need ground
    if (s.y > WORLD_H + 8 || s.x < -20 || s.y < G.cam.y - 220) { if (s.kind === 'meteor') finish(s); else s.dead = true; continue; }
    const tx = Math.floor(s.x / TILE), ty = Math.floor(s.y / TILE);
    if (s.y >= 0 && solidTile(tx, ty)) {
      if (s.kind === 'glob') puddleAt(s.x - Math.sign(s.vx) * 4, s.y, s.value);   // goo pools where it lands
      if (s.kind === 'web' && !s.friendly && solidTile(tx, ty) && !solidTile(tx, ty - 1)) G.webs.push({ x: s.x - 14, y: ty * TILE, t: 8 });   // sticky patch
      if (s.kind === 'banana' && s.friendly && !s.troop && s.vy > 0 && ty * TILE >= s.y - 16) dropPeel(s.x, s.y);   // a missed banana becomes a peel
      if (s.kind === 'parrow') addPeg(s.vx > 0 ? tx * TILE : tx * TILE + TILE, s.y - 1);   // arrows stick in walls → footholds
      finish(s, tx, ty); continue;
    }
    const mirror = G.boss && G.boss.mirror > 0 && G.boss.alive ? G.boss : null;
    if (s.friendly && mirror && Math.hypot(s.x - (mirror.x + mirror.w / 2), s.y - (mirror.y + mirror.h / 2)) < 17) {   // Eclipse's mirror
      s.friendly = false; s.vx = -s.vx * 1.2; s.vy = -s.vy; s.dmg = 1; if (s.kind === 'orb') { s.kind = 'dark'; s.home = false; }
      burst(s.x, s.y, 6, ['#b07cff', '#ffffff'], 50, 0, 0.3); sfx.reflect();
      continue;
    }

    if (s.friendly && s.kind === 'shuriken') { starHits(s); continue; }   // pierces: never stops on a foe
    if (s.friendly) {
      for (const e of G.enemies) {
        if (!e.alive || ghost(e) || s.x < e.x - 2 || s.x > e.x + e.w + 2 || s.y < e.y - 2 || s.y > e.y + e.h + 2) continue;
        if (e.fighter && e.fighter.P.shield > 0) { mirrorTo(e.fighter, s); break; }   // duel: the rival's mirror shield sends it back
        if (s.kind === 'meteor' || s.kind === 'orb') finish(s);
        else if (s.kind === 'glob') { damageEnemy(e, s.dmg, s.x - Math.sign(s.vx) * 10, 'shot'); s.dead = true; puddleAt(s.x, e.y + e.h - 2, s.value); burst(s.x, s.y, 6, ['#4fd18a', '#9ff0c0'], 40, 200, 0.3); }
        else if (s.kind === 'wisp') { damageEnemy(e, s.dmg, s.x, 'boom'); s.dead = true; burst(s.x, s.y, 5, ['#ffffff', '#bdf2ff', '#58d7ff'], 40, 0, 0.3); }   // spectral: slips past shields
        else if (s.kind === 'parrow') { damageEnemy(e, s.dmg, s.x - Math.sign(s.vx) * 10, 'shot'); s.dead = true; burst(s.x, s.y, 3, ['#9a6434', '#e8e2cf'], 30, 200, 0.3); }
        else { damageEnemy(e, s.dmg, s.x - Math.sign(s.vx) * 10, 'shot'); finish(s); }
        break;
      }
      if (!s.dead && s.kind === 'orb') for (const c of G.icicles) {
        if ((c.state === 'hang' || c.state === 'shake') && Math.abs(c.x - s.x) < 5 && s.y > c.y - 2 && s.y < c.y + 10) { dropIcicle(c); finish(s); break; }
      }
      if (!s.dead) for (const o of G.shots) {                              // shoot hexes & bubbles out of the air
        if (o.dead || o.friendly || !(o.kind === 'dark' || o.shootable) || Math.abs(o.x - s.x) > 6 || Math.abs(o.y - s.y) > 6) continue;
        finish(o); finish(s); break;
      }
    } else if (!P.dead) {
      if (P.shield > 0 && (s.kind === 'wave' || s.kind === 'crescent') && Math.abs(s.x - pcx) < SHIELD_R) { finish(s); sfx.reflect(); }
      else if (P.shield > 0 && Math.hypot(s.x - pcx, s.y - pcy) < SHIELD_R + 2) {      // mirror!
        const a = Math.atan2(s.y - pcy, s.x - pcx), sp = Math.hypot(s.vx, s.vy) * 1.5 + 60;
        if (s.kind === 'spiral') s.kind = 'rock';
        s.friendly = true; s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp; s.g = 0; s.life = 1.5; s.dmg = 2;
        burst(s.x, s.y, 8, CYAN, 60, 0, 0.35); sfx.reflect();
        pop('REFLECT', pcx - 13, pcy - 22, '#8fe8ff');
      } else if (!(P.dash > 0) && s.x > P.x - (s.r || 0) && s.x < P.x + P.w + (s.r || 0) && s.y > P.y - (s.r || 0) && s.y < P.y + P.h + (s.r || 0)) {
        hurtPlayer(s.x - s.vx * 0.05, s.dmg);
        finish(s);
      }
    }
  }
  G.shots = G.shots.filter(s => !s.dead);
}

/** Duel: a shot bounces off the rival's mirror shield and becomes theirs. */
function mirrorTo(F, s) {
  s.dead = true;
  const P = F.P, a = Math.atan2(s.y - (P.y + 9), s.x - (P.x + 4)), sp = Math.hypot(s.vx, s.vy) * 1.2 + 40;
  F.shots.push({ ...s, dead: false, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0, life: 1.2, hitSet: new Set(), recall: false });
  burst(s.x, s.y, 8, CYAN, 60, 0, 0.35); sfx.reflect();
  pop('REFLECT', P.x - 9, P.y - 13, '#8fe8ff');
}

function trail(s) {
  const r = Math.random();
  if (s.kind === 'wisp') G.parts.push({ x: s.x, y: s.y + (r * 2 - 1), vx: -s.vx * 0.05, vy: 0, life: 0.3, max: 0.3, c: r < 0.5 ? '#bdf2ff' : '#58d7ff', g: 0, size: 1 });
  else if (s.kind === 'orb') G.parts.push({ x: s.x + (r * 4 - 2), y: s.y + (Math.random() * 4 - 2), vx: 0, vy: -10, life: 0.4, max: 0.4, c: ['#3aa0ff', '#bfe8ff', '#1d5fc0'][(r * 3) | 0], g: 0, size: 1 });
  else if (s.kind === 'meteor') { for (let i = 0; i < 2; i++) G.parts.push({ x: s.x + (Math.random() * 4 - 2), y: s.y + (Math.random() * 4 - 2), vx: -s.vx * 0.1, vy: -s.vy * 0.1, life: 0.35, max: 0.35, c: FIRE[(Math.random() * 4) | 0], g: -20, size: 2 }); }
  else if (s.kind === 'dark' && r < 0.5) G.parts.push({ x: s.x, y: s.y, vx: 0, vy: 0, life: 0.35, max: 0.35, c: s.friendly ? '#8fe8ff' : '#7b4dff', g: 0, size: 1 });
}

/* ================= MOONFALL ================= */
export function startMoonfall() {
  G.moonfall = { t: 0, n: 0, dir: G.P.face };
  banner('MOONFALL!', '#ff5470', 1.6);
  sfx.moonfall();
}
export function updateMoonfall(dt) {
  const m = G.moonfall;
  if (!m) return;
  m.t += dt;
  while (m.n < 14 && m.t > 0.7 + m.n * 0.13) {
    const tx = G.cam.x + 20 + Math.random() * (W - 40) + m.dir * 20;
    const sx = tx - 90 * m.dir * (0.5 + Math.random() * 0.5), sy = G.cam.y - 20 - Math.random() * 30;
    const dx = tx - sx, dy = Math.min(groundBelow(tx, G.cam.y + 10), G.cam.y + H) - sy, d = Math.hypot(dx, dy), sp = 300;
    G.shots.push({ kind: 'meteor', x: sx, y: sy, vx: (dx / d) * sp, vy: (dy / d) * sp, life: 3, friendly: true, dmg: 5 });
    m.n++;
  }
  if (m.t > 0.4 && m.t < 2.8) G.shake = Math.max(G.shake, 0.06);
  if (m.t > 3.4) G.moonfall = null;
}
