// Enemy roster & AI. Ground units run on gravity + tile physics; flyers move freely.
import { W, H, clamp } from './gfx.js';
import { G, GRAV, MAX_FALL } from './state.js';
import { LV, move, solidAt, hitsWall, lineOfSight, groundBelow, WORLD_W, WORLD_H } from './world.js';
import { wardenAI, moonAI, drawBoss } from './boss.js';
import { organistAI, widowAI, eclipseAI, drawBoss2 } from './boss2.js';
import { stagAI, drawBoss3 } from './boss3.js';
import { inWater } from './mechanics.js';
import { burst } from './fx.js';
import { sfx } from './audio.js';
import { hurtPlayer, damageEnemy, killEnemy } from './combat.js';
import { held } from './input.js';
import { SHIELD_R } from './player.js';
import * as A from './art.js';

// Flyers' boxes are a touch bigger than their sprites (easier to hit). HP is tuned against Q damage (weakest flat shot: peg arrow 1.4): 1 = one hit for everyone, 2.7 = two hits for everyone.
const DEF = {
  slime: { w: 12, h: 9, hp: 1 }, bat: { w: 16, h: 11, hp: 1, fly: true },
  archer: { w: 8, h: 15, hp: 1 }, brute: { w: 10, h: 19, hp: 7 },
  bomber: { w: 8, h: 13, hp: 1 }, cultist: { w: 12, h: 16, hp: 2.7, fly: true },
  barrel: { w: 10, h: 12, hp: 1 },
  jelly: { w: 12, h: 12, hp: 1, fly: true }, diver: { w: 9, h: 18, hp: 2.7 },
  tinsoldier: { w: 8, h: 19, hp: 2.7 }, drone: { w: 16, h: 14, hp: 1, fly: true },
  hopper: { w: 10, h: 10, hp: 1 }, sentry: { w: 12, h: 16, hp: 2.7, fly: true },
  ufo: { w: 28, h: 14, hp: 2, fly: true }, egg: { w: 10, h: 13, hp: 2.7 },
  treant: { w: 16, h: 30, hp: 12, heavy: true }, squirrel: { w: 9, h: 10, hp: 1 },   // Hollow Grove: a slow, tanky walking tree; an acorn-lobbing squirrel
  nest: { w: 12, h: 14, hp: 2.7, fly: true }, wasp: { w: 8, h: 8, hp: 1, fly: true },
  stag: { w: 34, h: 30, hp: 100, boss: true },
  warden: { w: 20, h: 34, hp: 70, boss: true }, moon: { w: 40, h: 40, hp: 90, fly: true, boss: true },
  organist: { w: 26, h: 36, hp: 100, fly: true, boss: true }, widow: { w: 20, h: 20, hp: 110, fly: true, boss: true }, eclipse: { w: 8, h: 18, hp: 90, boss: true },
};

export function makeEnemy(s) {
    const d = DEF[s.type];
    const e = {
      type: s.type, w: d.w, h: d.h, heavy: !!d.heavy, hp: Math.round(d.hp * (d.boss ? G.diff.bossHp : G.diff.hpMul) * 10) / 10, flying: !!d.fly,   // bosses scale on their own HP dial
      x: s.cx - d.w / 2, y: d.fly ? s.cy - d.h / 2 : s.feet - d.h,
      vx: 0, vy: 0, dir: Math.random() < 0.5 ? -1 : 1, alive: true, onGround: false,
      flash: 0, stun: 0, t: Math.random() * 6, state: 'patrol', timer: 0, mark: null,
      hop: 0.4 + Math.random(), swing: 0, swingCd: 0, bumped: false,
    };
    e.home = e.x; e.homeY = e.y; e.maxHp = e.hp;
    if (d.boss) Object.assign(e, { boss: true, state: 'sleep', dir: -1, spawnX: e.x, spawnY: e.y, phase: 1 });
    if (e.type === 'bat') { e.ax = s.cx; e.ay = s.cy; }
    if (e.type === 'nest') e.onDeath = n => { for (let i = 0; i < 2; i++) spawnWasp(n, true); };   // knock it down and the swarm comes out angry
    if (e.type === 'cultist') { e.baseY = e.y; e.castCd = 1 + Math.random() * 2; e.tp = 3 + Math.random() * 2; }
    return e;
}

const START_CLEAR = 176;
export function spawnEnemies() {
  const list = [...LV.enemies];
  if (G.diff.extra) for (const s of LV.enemies) {            // Overkill: every foe brings a friend
    if (s.type === 'barrel' || DEF[s.type].boss) continue;
    if (s.cy !== undefined) { list.push({ ...s, cx: s.cx + 20, cy: s.cy + 10 }); continue; }
    for (const off of [22, -22]) {
      const cx = s.cx + off;
      if (solidAt(cx, s.feet + 4) && !solidAt(cx, s.feet - 4)) { list.push({ ...s, cx }); break; }
    }
  }
  // a quiet start: nothing that attacks spawns within ~a screen of where you begin (barrels are just scenery)
  const S = LV.start, calm = s => s.type === 'barrel' || Math.abs(s.cx - (S.x + 4)) > START_CLEAR || Math.abs((s.cy ?? s.feet) - (S.y + 18)) > 140;
  G.enemies = list.filter(calm).map(makeEnemy);
  if (LV.boss) G.enemies.push(makeEnemy(LV.boss));
}

/** Overkill reinforcements: a random foe drops out of the sky ahead of the player. */
export function dropReinforcement() {
  const P = G.P, types = ['archer', 'archer', 'slime', 'slime', 'bomber', 'brute', 'cultist'];
  const type = types[(Math.random() * types.length) | 0];
  for (let i = 0; i < 8; i++) {
    const cx = P.x + P.face * (100 + Math.random() * 60);
    if (cx < 24 || cx > WORLD_W - 24) continue;
    if (type === 'cultist') { const e = makeEnemy({ type, cx, cy: G.cam.y + 24 + Math.random() * 30 }); e.mark = { ch: '!', t: 0.9 }; G.enemies.push(e); return; }
    const feet = groundBelow(cx, G.cam.y + 8);
    if (feet > WORLD_H) continue;                                                  // no floor here
    const e = makeEnemy({ type, cx, feet });
    e.y = G.cam.y - 24; e.dropping = true; e.stun = 99; e.mark = { ch: '!', t: 1.2 };     // helpless until it lands
    G.enemies.push(e);
    burst(cx, 2, 10, ['#ff5470', '#b07cff', '#fff4c9'], 40, 60, 0.6);
    sfx.shriek();
    return;
  }
}

/* ================= SENSES ================= */
const ecx = e => e.x + e.w / 2;
function sees(e, range, dyMax, needFacing) {
  const P = G.P;
  if (P.dead || G.mode !== 'play' || P.ghost > 0 || !armed(e)) return false;  // ghosts go unseen; off-screen foes hold fire
  const dx = P.x + 4 - ecx(e), dy = P.y + 9 - (e.y + 4);
  if (Math.abs(dx) > range || Math.abs(dy) > dyMax) return false;
  range *= G.diff.sight;
  if (Math.abs(dx) > range) return false;
  if (needFacing && G.diff.facing && Math.sign(dx) !== e.dir && Math.abs(dx) > 36) return false;
  return lineOfSight(ecx(e), e.y + 4, P.x + 4, P.y + 8);
}
/** Fair-play rule: a foe may only open fire once it has been fully on screen for a moment (`e.vis`, ticked in updateEnemies). */
const onScreen = (e, m = 4) => e.x >= G.cam.x + m && e.x + e.w <= G.cam.x + W - m && e.y + e.h >= G.cam.y + m && e.y <= G.cam.y + H - m;
const armed = e => e.vis > 0.5;
const mark = (e, ch) => { e.mark = { ch, t: 0.9 }; };
function edgeAhead(e) {
  const ax = e.dir > 0 ? e.x + e.w + 3 : e.x - 3;
  return !solidAt(ax, e.y + e.h + 4) || solidAt(ax, e.y + e.h - 4);
}
function patrol(e, speed, range) {
  if (!e.onGround) return;
  if (edgeAhead(e) || (Math.abs(e.x - e.home) > range && Math.sign(e.x - e.home) === e.dir)) e.dir *= -1;
  e.vx = e.dir * speed;
}

/* ================= AI ================= */
const AI = {
  slime(e, dt) {
    if (!e.onGround) return;
    e.vx = 0; e.hop -= dt;
    if (e.hop <= 0) {
      const ax = e.dir > 0 ? e.x + e.w + 16 : e.x - 16;
      if (!solidAt(ax, e.y + e.h + 4) || solidAt(ax, e.y + e.h - 4)) e.dir *= -1;
      e.vx = e.dir * 42; e.vy = -150; e.hop = 0.8 + Math.random() * 0.6;
    }
  },

  bat(e, dt) {
    const P = G.P, dx = P.x + 4 - e.ax, dy = P.y + 2 - e.ay;
    if (!P.dead && Math.abs(dx) < 110 && Math.abs(dy) < 80) { e.ax += Math.sign(dx) * 24 * dt; e.ay = clamp(e.ay + clamp(dy, -1, 1) * 16 * dt, Math.max(12, e.homeY - 70), e.homeY + 60); }
    e.x = e.ax + Math.sin(e.t * 1.3) * 26 - e.w / 2;
    e.y = e.ay + Math.sin(e.t * 2.7) * 7 - e.h / 2;
    e.dir = Math.sign(dx) || 1;
  },

  archer(e, dt) {
    const dx = G.P.x + 4 - ecx(e);
    if (e.state === 'patrol') {
      patrol(e, 16, 28);
      if (sees(e, 150, 72, true)) { e.state = 'aim'; e.timer = 0.6 * G.diff.react; e.dir = Math.sign(dx) || e.dir; mark(e, '!'); sfx.alert(); }
    } else if (e.state === 'aim') {
      e.vx = 0; e.dir = Math.sign(dx) || e.dir; e.timer -= dt;
      if (e.timer <= 0) { if (armed(e)) shootArrow(e); e.state = 'reload'; e.timer = 1.15 * G.diff.react; }
    } else {
      e.vx = 0; e.timer -= dt;
      if (e.timer <= 0) {
        if (sees(e, 170, 80, false)) { e.state = 'aim'; e.timer = 0.35 * G.diff.react; }
        else { e.state = 'patrol'; mark(e, '?'); }
      }
    }
  },

  brute(e, dt) {
    const P = G.P, dx = P.x + 4 - ecx(e), dy = P.y + 9 - (e.y + e.h / 2);
    e.swingCd -= dt;
    if (e.swing > 0) {
      e.vx = 0; e.swing -= dt;
      if (e.swing <= 0) {
        if (Math.abs(dx) < 24 && Math.abs(dy) < 22 && Math.sign(dx) === e.dir) hurtPlayer(ecx(e));
        burst(ecx(e) + e.dir * 14, e.y + 8, 8, ['#ffffff', '#e6fbff', '#aeabcb'], 50, 0, 0.2);
        sfx.swing(); e.swingCd = 1.1;
      }
      return;
    }
    if (sees(e, 130, 40, false)) {
      if (!e.alerted) { e.alerted = true; mark(e, '!'); sfx.alert(); }
      e.dir = Math.sign(dx) || e.dir;
      e.vx = e.onGround && !edgeAhead(e) ? e.dir * G.diff.bruteSpeed : 0;
      if (Math.abs(dx) < 22 && Math.abs(dy) < 22 && e.swingCd <= 0) e.swing = 0.4 * (G.diff.react < 1 ? 0.75 : 1);
    } else { e.alerted = false; patrol(e, 14, 32); }
  },

  bomber(e, dt) {
    const dx = G.P.x + 4 - ecx(e);
    if (e.state === 'patrol') {
      patrol(e, 22, 30);
      if (sees(e, 140, 60, true)) { e.state = 'windup'; e.timer = 0.5; mark(e, '!'); sfx.shriek(); }
    } else if (e.state === 'windup') {                          // shriek & light the fuse — your cue to react
      e.vx = 0; e.timer -= dt;
      if (!G.P.dead) e.dir = Math.sign(dx) || e.dir;
      if (e.timer <= 0) { e.state = 'charge'; e.timer = 3.2; }
    } else {
      if (!G.P.dead) e.dir = Math.sign(dx) || e.dir;
      e.vx = e.dir * G.diff.bomberSpeed;
      if (e.bumped && e.onGround) e.vy = -240;
      e.timer -= dt;
      if (e.timer <= 0) killEnemy(e);
    }
    e.bumped = false;
  },

  cultist(e, dt) {
    const P = G.P;
    e.y = e.baseY + Math.sin(e.t * 2) * 4;
    e.dir = Math.sign(P.x + 4 - ecx(e)) || 1;
    e.castCd -= dt; e.tp -= dt; e.casting = Math.max(0, (e.casting || 0) - dt);
    if (e.castCd <= 0 && sees(e, 170, 110, false)) {
      const a = Math.atan2(P.y + 9 - (e.y + 6), P.x + 4 - ecx(e));
      G.shots.push({ kind: 'dark', x: ecx(e), y: e.y + 6, vx: Math.cos(a) * G.diff.hexSpeed, vy: Math.sin(a) * G.diff.hexSpeed, life: 4.5, friendly: false, dmg: 1 });
      e.castCd = G.diff.castCd; e.casting = 0.3;
      sfx.hex();
    }
    if (e.tp <= 0) teleport(e);
  },

  barrel() {},

  /* Sunken: drifts in a slow sine, pulses a ring of bubbles when you're near */
  jelly(e, dt) {
    const P = G.P;
    e.x += clamp(P.x + 4 - ecx(e), -1, 1) * 14 * dt;
    e.y = e.homeY + Math.sin(e.t * 1.2) * 18;
    e.pulse = (e.pulse ?? 2) - dt;
    if (e.pulse <= 0 && armed(e) && Math.abs(P.x - e.x) < 110 && Math.abs(P.y - e.y) < 90 && !P.dead && !P.ghost) {
      e.pulse = 3.2;
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; G.shots.push({ kind: 'bubble', x: ecx(e), y: e.y + 5, vx: Math.cos(a) * 34, vy: Math.sin(a) * 34, life: 4, friendly: false, dmg: 1, r: 4, shootable: true, ph: i }); }
      sfx.hex();
    }
  },
  /* Sunken: plods slowly, braces, then fires a slow straight harpoon */
  diver(e, dt) {
    const dx = G.P.x + 4 - ecx(e);
    if (e.state === 'patrol') { patrol(e, 14, 40); if (sees(e, 160, 50, true)) { e.state = 'aim'; e.timer = 0.9 * G.diff.react; mark(e, '!'); sfx.alert(); } }
    else if (e.state === 'aim') { e.vx = 0; e.dir = Math.sign(dx) || e.dir; if ((e.timer -= dt) <= 0) { if (armed(e)) G.shots.push({ kind: 'harpoon', x: ecx(e) + e.dir * 8, y: e.y + 12, vx: e.dir * 125, vy: 0, life: 3, friendly: false, dmg: 1 }); sfx.bow(); e.state = 'reload'; e.timer = 2.2 * G.diff.react; } }
    else { e.vx = 0; if ((e.timer -= dt) <= 0) e.state = sees(e, 170, 60, false) ? 'aim' : 'patrol', e.timer = 0.6; }
  },
  /* Clockwork: marches, shoots ahead, and has to stop to wind itself up (hit it then — double damage) */
  tinsoldier(e, dt) {
    e.wind = (e.wind ?? 5 + Math.random() * 2) - dt;
    if (e.state === 'dazed') { e.vx = 0; if ((e.timer -= dt) <= 0) { e.state = 'patrol'; e.wind = 6; } return; }
    if (e.wind <= 0) { e.state = 'dazed'; e.timer = 1.6; mark(e, '?'); return; }
    if (e.onGround) { if (edgeAhead(e)) e.dir *= -1; e.vx = e.dir * 32; }
    e.shoot = (e.shoot ?? 1.5) - dt;
    const P = G.P, ahead = Math.sign(P.x + 4 - ecx(e)) === e.dir;
    if (e.shoot <= 0 && ahead && sees(e, 170, 30, true)) { e.shoot = 2.4 * G.diff.react; G.shots.push({ kind: 'tick', x: ecx(e) + e.dir * 8, y: e.y + 10, vx: e.dir * 110, vy: 0, life: 3, friendly: false, dmg: 1 }); sfx.bow(); }
  },
  /* Clockwork: patrols the air, drops a rolling cog when you're underneath */
  drone(e, dt) {
    e.x = e.home + Math.sin(e.t * 0.8) * 60; e.y = e.homeY + Math.sin(e.t * 2.3) * 3;
    e.dir = Math.cos(e.t * 0.8) > 0 ? 1 : -1;
    e.drop = (e.drop ?? 1) - dt;
    const P = G.P;
    if (e.drop <= 0 && armed(e) && Math.abs(P.x + 4 - ecx(e)) < 24 && P.y > e.y && !P.dead && !P.ghost) { e.drop = 2.2; G.shots.push({ kind: 'gearshot', x: ecx(e), y: e.y + 10, vx: e.dir * 40, vy: 0, g: 500, life: 4, friendly: false, dmg: 1 }); sfx.stomp(); }
  },
  /* Moon: a saucer that shadows you, drops slow plasma, and (with a warning) tractor-beams you upward */
  ufo(e, dt) {
    const P = G.P, dx = P.x + 4 - ecx(e);
    e.drop = (e.drop ?? 1.5) - dt; e.beamCd = (e.beamCd ?? 3) - dt;
    if (e.state === 'beamWind' || e.state === 'beam') {
      e.timer -= dt;
      if (e.state === 'beamWind' && e.timer <= 0) { e.state = 'beam'; e.timer = 1.6; sfx.hex(); }
      if (e.state === 'beam') {
        const halfW = 10 + Math.max(0, P.y - e.y) * 0.16;
        if (!P.dead && !P.ghost && P.y > e.y && Math.abs(P.x + 4 - ecx(e)) < halfW) {
          P.vy = Math.max(P.vy - 900 * dt, -110);                          // lifted — step out sideways
          if (P.y < e.y + e.h + 4) { hurtPlayer(ecx(e)); P.vy = 120; e.timer = 0; }
        }
        if (e.timer <= 0) { e.state = 'patrol'; e.beamCd = 6 + Math.random() * 2; }
      }
      return;
    }
    e.x += clamp(dx, -1, 1) * 38 * dt; e.y = e.homeY + Math.sin(e.t * 1.5) * 3;
    e.dir = Math.sign(dx) || e.dir;
    if (G.P.dead || G.P.ghost || Math.abs(dx) > 180) return;
    if (e.beamCd <= 0 && armed(e) && Math.abs(dx) < 16) { e.state = 'beamWind'; e.timer = 0.9 * G.diff.react; mark(e, '!'); sfx.alert(); return; }
    if (e.drop <= 0 && armed(e)) { e.drop = 2.4 * G.diff.react; G.shots.push({ kind: 'plasma', x: ecx(e), y: e.y + e.h + 2, vx: clamp(dx, -40, 40), vy: 10, g: 110, life: 5, friendly: false, dmg: 1, r: 2, shootable: true }); sfx.orb(); }
  },
  /* Moon: an egg pod that hatches goo while you hang around — pop it first */
  egg(e, dt) {
    e.vx = 0;
    e.hatch = (e.hatch ?? 2) - dt;
    const P = G.P;
    e.kids = (e.kids || []).filter(k => k.alive);
    if (e.hatch <= 0 && e.kids.length < 2 && Math.abs(P.x - e.x) < 120 && !P.dead) {
      e.hatch = 4 * G.diff.react;
      const k = makeEnemy({ type: 'slime', cx: ecx(e) + (Math.random() < 0.5 ? -8 : 8), feet: e.y + e.h });
      k.vy = -160; e.kids.push(k); G.enemies.push(k);
      burst(ecx(e), e.y + 2, 10, ['#9b5cff', '#9dff6a', '#d0b0ff'], 50, 200, 0.4); sfx.pop();
    }
  },
  /* Moon: big floaty hops toward you */
  hopper(e, dt) {
    if (!e.onGround) return;
    e.vx = 0; e.hop = (e.hop ?? 1) - dt;
    if (e.hop <= 0) { const P = G.P; e.dir = Math.sign(P.x + 4 - ecx(e)) || e.dir; if (Math.abs(P.x - e.x) > 220) e.dir = Math.random() < 0.5 ? -1 : 1; e.vx = e.dir * 70; e.vy = -250; e.hop = 1 + Math.random() * 0.6; }
  },
  /* Moon: a floating crystal that fires a slow three-star spread */
  sentry(e, dt) {
    e.y = e.homeY + Math.sin(e.t * 1.6) * 3;
    e.dir = Math.sign(G.P.x + 4 - ecx(e)) || 1;
    e.fire = (e.fire ?? 1.5) - dt;
    if (e.fire <= 0 && sees(e, 170, 120, false)) {
      e.fire = 2.4 * G.diff.react;
      const P = G.P, a0 = Math.atan2(P.y + 9 - e.y - 7, P.x + 4 - ecx(e));
      for (const k of [-1, 0, 1]) G.shots.push({ kind: 'star', x: ecx(e), y: e.y + 7, vx: Math.cos(a0 + k * 0.28) * 62, vy: Math.sin(a0 + k * 0.28) * 62, life: 5, friendly: false, dmg: 1, r: 1 });
      sfx.hex();
    }
  },
  /* Hollow Grove: the walking tree — slow, tough, telegraphs a two-armed slam that sends ripples along the ground */
  treant(e, dt) {
    const P = G.P, dx = P.x + 4 - ecx(e), adx = Math.abs(dx), dy = P.y + 9 - (e.y + e.h / 2);
    e.swingCd = (e.swingCd || 0) - dt; e.recover = Math.max(0, (e.recover || 0) - dt);
    if (e.swing > 0) { e.vx = 0; if ((e.swing -= dt) <= 0) treantSlam(e, dx, dy); return; }
    if (e.recover > 0) { e.vx = 0; return; }
    if (sees(e, 150, 60, false)) {
      if (!e.alerted) { e.alerted = true; mark(e, '!'); sfx.alert(); }
      e.dir = Math.sign(dx) || e.dir;
      e.vx = e.onGround && !edgeAhead(e) && adx > 22 ? e.dir * 16 : 0;
      if (adx < 36 && Math.abs(dy) < 30 && e.swingCd <= 0) { e.swing = 0.7 * G.diff.react; mark(e, '!'); }
    } else { e.alerted = false; patrol(e, 10, 30); }
  },
  /* the squirrel: skitters about, keeps its distance and lobs acorns */
  squirrel(e, dt) {
    const P = G.P, dx = P.x + 4 - ecx(e), adx = Math.abs(dx), dy = P.y + 9 - (e.y + 4);
    e.throwCd = (e.throwCd ?? 1) - dt; e.throwT = Math.max(0, (e.throwT || 0) - dt);
    if (!e.onGround) return;
    e.vx = 0; e.hop -= dt;
    const seen = sees(e, 150, 70, false);
    if (seen) e.dir = Math.sign(dx) || e.dir;
    if (seen && e.throwCd <= 0 && adx > 28) {
      e.throwCd = 1.7 * G.diff.react + Math.random() * 0.5; e.throwT = 0.25;
      const T = clamp(adx / 130, 0.45, 0.9), sx = ecx(e) + e.dir * 4, sy = e.y + 3;
      G.shots.push({ kind: 'acorn', x: sx, y: sy, vx: (P.x + 4 - sx) / T, vy: (P.y + 8 - sy) / T - 0.5 * 300 * T, g: 300, life: 3, friendly: false, dmg: 1 });
      sfx.bow();
      return;
    }
    if (e.hop <= 0) {
      let d = seen ? (adx < 56 ? -Math.sign(dx) : (Math.random() < 0.5 ? 1 : -1)) : e.dir;
      const ax = d > 0 ? e.x + e.w + 10 : e.x - 10;
      if (!solidAt(ax, e.y + e.h + 4) || solidAt(ax, e.y + e.h - 4)) d = -d;
      if (!seen) e.dir = d;
      e.vx = d * 70; e.vy = -170; e.hop = 0.5 + Math.random() * 0.6;
    }
  },
  /* a paper wasp nest hanging from a bough: sends out a couple of wasps while you're near */
  nest(e, dt) {
    e.x = e.home; e.y = e.homeY + Math.round(Math.sin(e.t * 2) * 0.6);
    e.spawnCd = (e.spawnCd ?? 1) - dt;
    const P = G.P, near = !P.dead && Math.abs(P.x + 4 - ecx(e)) < 140 && Math.abs(P.y - e.y) < 110;
    if (near && armed(e) && e.spawnCd <= 0 && G.enemies.filter(w => w.alive && w.nest === e).length < 2) { e.spawnCd = 3.2 * G.diff.react; spawnWasp(e); }
  },
  /* a wasp: stays on a short leash around its nest — circles you if you come close, buzzes (the tell), then darts */
  wasp(e, dt) {
    const P = G.P, n = e.nest, hx = n ? n.x + n.w / 2 : e.home, hy = n ? n.y + n.h : e.homeY;
    const near = !P.dead && Math.hypot(P.x + 4 - hx, P.y + 6 - hy) < WASP_LEASH + 24;
    const leash = (x, y) => { const dx = x - hx, dy = y - hy, d = Math.hypot(dx, dy); return d <= WASP_LEASH ? [x, y] : [hx + (dx / d) * WASP_LEASH, hy + (dy / d) * WASP_LEASH]; };
    e.state = e.state === 'patrol' ? 'hover' : e.state; e.timer -= dt;
    if (e.state === 'hover') {
      e.ang = (e.ang ?? Math.random() * 6.28) + dt * 1.1;
      const [gx, gy] = near ? leash(P.x + 4 + Math.cos(e.ang) * 30, P.y - 10 + Math.sin(e.ang * 1.7) * 10) : [hx + Math.cos(e.ang) * 14, hy + 6 + Math.sin(e.ang * 1.7) * 6];
      e.x += clamp((gx - ecx(e)) * dt * 1.4, -45 * dt, 45 * dt); e.y += clamp((gy - e.y) * dt * 1.4, -35 * dt, 35 * dt);   // lazy drift, never faster than 45 px/s
      e.dir = Math.sign(P.x + 4 - ecx(e)) || 1;
      if (near && e.timer <= 0 && armed(e)) { e.state = 'buzz'; e.timer = 0.75; sfx.hex(); }
    } else if (e.state === 'buzz') {
      e.x += (Math.random() - 0.5) * 2;
      if (e.timer <= 0) { const ddx = P.x + 4 - ecx(e), ddy = P.y + 6 - e.y, d = Math.hypot(ddx, ddy) || 1; e.vx = (ddx / d) * 85; e.vy = (ddy / d) * 85; e.state = 'dart'; e.timer = 0.8; }
    } else {
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.timer <= 0 || Math.hypot(ecx(e) - hx, e.y - hy) > WASP_LEASH) { e.state = 'hover'; e.timer = 2.2 + Math.random() * 1.2; e.vx = 0; e.vy = 0; }   // the dart ends at the leash
    }
  },
  stag: stagAI,
  warden: wardenAI,
  moon: moonAI,
  organist: organistAI,
  widow: widowAI,
  eclipse: eclipseAI,
};

function treantSlam(e, dx, dy) {
  if (Math.abs(dx) < 38 && Math.abs(dy) < 30 && Math.sign(dx) === e.dir) hurtPlayer(ecx(e));
  for (const d of [-1, 1]) G.shots.push({ kind: 'wave', x: ecx(e) + d * 14, y: e.y + e.h - 4, vx: d * 95, vy: 0, life: 1.1, friendly: false, dmg: 1 });
  G.shake = Math.max(G.shake, 0.25); sfx.boom(20);
  burst(ecx(e) + e.dir * 12, e.y + e.h - 2, 12, ['#6ea84a', '#5e3e24', '#8a5e38'], 70, 300, 0.5);
  e.swingCd = 2.2; e.recover = 0.5;
}
const WASP_LEASH = 56;                                                   // how far a wasp strays from its nest (px)
export function spawnWasp(n, angry = false) {
  const w = makeEnemy({ type: 'wasp', cx: ecx(n) + (Math.random() - 0.5) * 6, cy: n.y + n.h });
  w.nest = n; w.vis = 1; w.timer = angry ? 0.2 : 1;
  G.enemies.push(w);
}

function shootArrow(e) {
  const P = G.P, sx = ecx(e) + e.dir * 6, sy = e.y + 7;
  const { volley, arrowSpeed } = G.diff;
  for (let i = 0; i < volley; i++) {
    const aim = 1 + (Math.random() - 0.5) * 0.3 + (i - (volley - 1) / 2) * 0.18;   // sloppy shots; volleys fan out
    const dx = (P.x + 4 - sx) * aim, dy = P.y + 8 - sy, T = Math.max(0.45, Math.abs(dx) / arrowSpeed);   // close shots lob instead of snapping
    G.shots.push({ kind: 'arrow', x: sx, y: sy, vx: dx / T, vy: dy / T - 0.5 * 150 * T, g: 150, life: 3, friendly: false, dmg: 1 });
  }
  sfx.bow();
}

function teleport(e) {
  const poof = () => burst(ecx(e), e.y + e.h / 2, 14, ['#7b4dff', '#b07cff', '#2e1a52'], 50, 0, 0.5);
  for (let i = 0; i < 12; i++) {
    const nx = e.x + (Math.random() * 2 - 1) * 70, ny = clamp(e.homeY - 40 + Math.random() * 70, 8, WORLD_H - 40);
    if (nx < 16 || nx > WORLD_W - 32 || hitsWall(nx, ny - 5, e.w, e.h + 10)) continue;
    poof(); e.x = nx; e.baseY = ny; e.y = ny; poof();
    sfx.teleport();
    break;
  }
  e.tp = 3 + Math.random() * 2;
}

/* ================= UPDATE ================= */
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const CONTACT = new Set(['slime', 'bat', 'cultist', 'jelly', 'hopper', 'drone', 'ufo', 'wasp', 'squirrel']);

export function updateEnemies(dt) {
  const P = G.P, pcx = P.x + 4, pcy = P.y + 9;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    if (e.carried) continue;                                               // hoisted overhead by the Monkey
    e.t += dt; e.flash -= dt;
    e.vis = onScreen(e) ? (e.vis || 0) + dt : 0;
    if (e.mark && (e.mark.t -= dt) <= 0) e.mark = null;
    if (e.flying) AI[e.type](e, dt);
    else {
      const wet = inWater(e.y + e.h / 2);
      e.vy = Math.min(e.vy + GRAV * (LV.grav || 1) * (wet ? 0.35 : 1) * dt, wet ? 60 : MAX_FALL);
      if (e.stun > 0) { e.stun -= dt; if (e.onGround) e.vx *= 0.85; }
      else AI[e.type](e, dt);
      if (!e.alive) continue;
      if (move(e, dt)) e.bumped = true;
      if (e.dropping && e.onGround) { e.dropping = false; e.stun = 0.7; burst(ecx(e), e.y + e.h, 8, ['#8c89ab', '#aeabcb'], 50, 120, 0.4); G.shake = Math.max(G.shake, 0.08); }
      if (e.y > WORLD_H + 20) { killEnemy(e, true); continue; }
    }
    if (e.type === 'bomber' && e.state !== 'patrol' && Math.random() < 0.6)
      G.parts.push({ x: ecx(e) + (Math.random() * 2 - 1), y: e.y - 1, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 20, life: 0.3, max: 0.3, c: ['#fff4c9', '#ffc53d'][(Math.random() * 2) | 0], g: 60, size: 1 });

    if (G.mode !== 'play' || P.dead || e.type === 'barrel' || e.boss) continue;   // bosses handle their own contact
    if (P.shield > 0 && Math.hypot(ecx(e) - pcx, e.y + e.h / 2 - pcy) < SHIELD_R + e.w / 2) {   // shield bash
      const k = Math.sign(ecx(e) - pcx) || 1;
      if (e.type === 'bat') e.ax += k * 30;
      else if (e.type === 'cultist') e.tp = 0;
      else { e.vx = k * 150; e.vy = -130; e.stun = 0.4; }
      if (e.type === 'bomber') killEnemy(e);
      continue;
    }
    if (!overlap(P, e)) continue;
    if (P.vy > 40 && P.y + P.h - e.y < 9) {
      const heavy = G.hero === 'slime' ? (P.bounce > 0 ? 3 : 2) : 1;                           // Sir Slimes a Lot lands like a pudding
      damageEnemy(e, (e.type === 'brute' ? 2 : 3) * heavy, pcx, 'stomp');
      P.vy = (held('jump') ? -300 : -230) * (heavy > 1 ? 1.2 : 1); sfx.stomp();
    } else if (e.type === 'bomber') killEnemy(e);
    else if (CONTACT.has(e.type)) hurtPlayer(ecx(e));
  }
}

/* ================= DRAW ================= */
export function drawEnemies(ctx, X, Y) {
  for (const e of G.enemies) {
    if (!e.alive) continue;
    if (e.boss) { (e.type === 'warden' || e.type === 'moon' ? drawBoss : e.type === 'stag' ? drawBoss3 : drawBoss2)(ctx, e, X, Y); continue; }
    const side = e.dir > 0 ? 'r' : 'l', wf = e.flash > 0 ? 'w' : '';
    const pick = set => set[wf + side];
    const skin = LV.theme === 'lunar' ? A.alien : A;                       // on the Moon the usual suspects are aliens
    const walking = Math.abs(e.vx) > 4 && e.onGround;
    let spr;
    switch (e.type) {
      case 'slime': spr = pick(skin.slime[e.onGround && e.hop < 0.25 ? 'squash' : 'up']); break;
      case 'bat': spr = pick(skin.bat[Math.floor(e.t * 8) % 2]); break;
      case 'archer': spr = pick(skin.archer[walking ? Math.floor(e.t * 6) % 2 : 0]); break;
      case 'brute': spr = pick(skin.brute[walking ? Math.floor(e.t * 4) % 2 : 0]); break;
      case 'bomber': spr = pick(skin.bomber[walking ? Math.floor(e.t * (e.state === 'charge' ? 14 : 6)) % 2 : 0]); break;
      case 'cultist': spr = pick(skin.cultist[Math.floor(e.t * 3) % 2]); break;
      case 'barrel': spr = pick(skin.barrel); break;
      case 'ufo': spr = pick(A.ufo[Math.floor(e.t * 6) % 3]); break;
      case 'egg': spr = pick(A.alienEgg[Math.floor(e.t * 2) % 2]); break;
      case 'jelly': spr = pick(A.jelly[Math.floor(e.t * 3) % 2]); break;
      case 'diver': spr = pick(A.diver[walking ? Math.floor(e.t * 4) % 2 : 0]); break;
      case 'tinsoldier': spr = pick(A.tinSoldier[walking ? Math.floor(e.t * 6) % 2 : 0]); break;
      case 'drone': spr = pick(A.drone[Math.floor(e.t * 16) % 2]); break;
      case 'hopper': spr = pick(A.hopper[e.onGround ? 0 : 1]); break;
      case 'sentry': spr = pick(A.sentry[Math.floor(e.t * 4) % 2]); break;
      case 'treant': spr = pick(A.treantSprites[e.swing > 0 ? 'raise' : e.recover > 0 ? 'slam' : walking && Math.floor(e.t * 3) % 2 ? 'w2' : 'w1']); break;
      case 'squirrel': spr = pick(A.squirrelSprites[e.throwT > 0 ? 'throw' : e.onGround ? 'sit' : 'hop']); break;
      case 'nest': spr = pick(A.nestSprites[Math.floor(e.t * 3) % 2]); break;
      case 'wasp': spr = pick(A.waspSprites[Math.floor(e.t * 20) % 2]); break;
    }
    const sx = X(ecx(e) - spr.width / 2), sy = Y(e.y + e.h - spr.height);
    if (e.type === 'ufo' && (e.state === 'beamWind' || e.state === 'beam')) {   // tractor beam: dotted warning, then a glowing cone
      const gy = Y(groundBelow(ecx(e), e.y + e.h)), top = Y(e.y + e.h), cx0 = X(ecx(e));
      for (let y = top; y < gy; y += e.state === 'beam' ? 1 : 4) {
        const hw = Math.round(10 + (y - top) * 0.16);
        if (e.state === 'beam') { ctx.fillStyle = (y + Math.floor(G.t * 30)) % 4 < 2 ? 'rgba(157,255,106,0.28)' : 'rgba(157,255,106,0.14)'; ctx.fillRect(cx0 - hw, y, hw * 2, 1); }
        else if (Math.floor(G.t * 10) % 2) { ctx.fillStyle = '#9dff6a'; ctx.fillRect(cx0 - hw, y, 1, 2); ctx.fillRect(cx0 + hw, y, 1, 2); }
      }
    }
    ctx.drawImage(spr, sx, sy);
    if (e.type === 'brute') {
      const sh = pick(skin.bruteShield), raise = e.swing > 0 ? -3 : 0;
      ctx.drawImage(sh, e.dir > 0 ? sx + 8 : sx - 2, sy + 5 + raise);
    }
    if (e.mark) {
      const bounce = e.mark.t > 0.75 ? -2 : 0;
      ctx.fillStyle = '#120d26';
      ctx.fillRect(X(ecx(e)) - 2, sy - 9 + bounce, 5, 7);
      ctx.fillStyle = e.mark.ch === '!' ? '#ff5470' : '#f0b541';
      if (e.mark.ch === '!') { ctx.fillRect(X(ecx(e)), sy - 8 + bounce, 1, 3); ctx.fillRect(X(ecx(e)), sy - 4 + bounce, 1, 1); }
      else { ctx.fillRect(X(ecx(e)) - 1, sy - 8 + bounce, 2, 1); ctx.fillRect(X(ecx(e)) + 1, sy - 7 + bounce, 1, 1); ctx.fillRect(X(ecx(e)), sy - 6 + bounce, 1, 1); ctx.fillRect(X(ecx(e)), sy - 4 + bounce, 1, 1); }
    }
  }
}
