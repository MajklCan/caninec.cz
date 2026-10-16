// The hero: movement (wall climbing, ice, tide, low gravity, moving platforms) and each hero's Q / E / R kit.
import { H, clamp } from './gfx.js';
import { G, GRAV, JUMP, RUN, MAX_FALL, hint } from './state.js';
import { held, tapped } from './input.js';
import { LV, move, hitsWall, iceAt, WORLD_H } from './world.js';
import { burst, dust, pop, CYAN } from './fx.js';
import { sfx } from './audio.js';
import { killPlayer, startMoonfall } from './combat.js';
import { landOnPlatforms, inWater, BRANCH_BOOST, branchKick } from './mechanics.js';
import { GOO_COST } from './goo.js';
import { throwCharge, detonateAll, rocketPush, MAX_CHARGES } from './goblin.js';
import { throwStar, startDash, updateNinja, startFury, slash, DASH_SPEED, FURY_E_CD, FURY_Q_CD } from './ninja.js';
import { explode } from './combat.js';
import { isBlood, switchPhase, throwBloodOrb, bloodHeal, BLOOD } from './lunar.js';
import { lobBanana, yoink, updateCarry, callTroop, troopThrow, BANANA_G } from './monkey.js';
import { damageTile } from './world.js';
import { damageEnemy } from './combat.js';

/** Cooldowns per hero. `CD` always holds the active hero's numbers (HUD & guide read it). */
export const KITS = {
  wizard: { q: 0.55, e: 7, r: 1 },                                      // R = lunar phase switch (1 s). Q ≈ 1.67× the first tuning: aimed shots, not a hose
  skeleton: { q: 0.43, e: 3, r: 18 },
  slime: { q: 0.47, e: 6, r: 20 },
  monkey: { q: 0.5, e: 2, r: 22 },
  goblin: { q: 0.58, e: 0.5, r: 22 },
  ninja: { q: 0.5, e: 2, r: 20 },
};
export const CD = { ...KITS.wizard };
export function setHero(id) { G.hero = id; Object.assign(CD, KITS[id]); }

/** Q is a spammable mini-blast: weaker than a barrel, but it ignores brute shields and chews terrain. */
const BLOOD_Q_CD = 0.45;
export const ORB = { radius: 16, dmg: 2, tileDmg: 0.45, speed: 190 };
const WALL_SLIDE = 45, CLIMB_JUMP = 235, KICK_X = 110;
export const SHIELD_TIME = 1.6, SHIELD_R = 15, MOON_PER_CRYSTAL = 2, GHOST_TIME = 5, CRUMBLE = 0.45, KING_TIME = 5, RIDE_TIME = 5;

export function newPlayer(x, y) {
  return {
    x, y, w: 8, h: 18, vx: 0, vy: 0, face: 1, onGround: false, coyote: 0, buffer: 0,
    hp: G.diff.hp, maxHp: G.diff.hp, inv: 0, castT: 0, walk: 0, spark: 0, shield: 0, dead: false,
    cd: { q: 0, e: 0, r: 0 }, ready: { q: 0, e: 0, r: 0 }, deny: { q: 0, e: 0, r: 0 }, hug: 0, hugT: 0, scrape: 0,
    pile: 0, headless: false, revived: false, riding: null, ghost: 0, ghostNext: false, king: 0, bounce: 0, smash: 0, ride: 0, crushed: new Map(), airJumps: 1, flip: 0, carry: null, throwT: 0, dash: 0, fury: 0, slashT: 0,
  };
}

export function pose(P) {
  if (P.hug) return { legs: 'jump', bob: 0 };
  if (!P.onGround) return { legs: P.vy < 0 ? 'jump' : 'fall', bob: 0 };
  if (Math.abs(P.vx) > 8) { const i = Math.floor(P.walk) % 4; return { legs: ['w1', 'w2', 'w3', 'w2'][i], bob: i % 2 ? -1 : 0 }; }
  return { legs: 'w1', bob: Math.sin(G.t * 2.4) > 0.35 ? -1 : 0 };
}

export function staffPos(P, bob = pose(P).bob) {
  const bx = Math.round(P.x) - 4, by = Math.round(P.y) - 6, casting = P.castT > 0;
  const x = (P.face > 0 ? bx + 12 : bx - 1) + (casting ? P.face : 0);
  const y = by - 4 + bob - (casting ? 2 : 0);
  return { x, y, gx: x + 2.5, gy: y + 2 };
}

function trySpell(P, k, cast, auto = false) {
  if (auto ? !held(k) || P.cd[k] > 0 : !tapped(k)) return;
  if (P.cd[k] > 0) { P.deny[k] = 0.3; if (!P.ai) sfx.denied(); return; }
  P.cd[k] = CD[k];
  cast();
}

export function updatePlayer(dt) {
  const P = G.P;
  for (const k in P.cd) {
    const was = P.cd[k];
    P.cd[k] = Math.max(0, P.cd[k] - dt);
    if (was > 0 && P.cd[k] === 0 && CD[k] >= 1) { P.ready[k] = 0.5; if (!P.ai) sfx.ready(); }   // the duel AI charges up silently
    P.ready[k] = Math.max(0, P.ready[k] - dt);
    P.deny[k] = Math.max(0, P.deny[k] - dt);
  }
  if (P.dead) return;
  const grav = GRAV * (LV.grav || 1), swim = inWater(P.y + 10);

  // --- skeleton crumbled into a bone pile: can't act, can't be hurt (also the ghost transition)
  if (P.pile > 0) {
    P.pile -= dt;
    P.vx *= 0.8;
    P.vy = Math.min(P.vy + grav * dt, MAX_FALL);
    move(P, dt);
    if (P.pile <= 0) {
      if (P.ghostNext) { P.ghostNext = false; P.ghost = GHOST_TIME; burst(P.x + 4, P.y + 6, 24, ['#ffffff', '#bdf2ff', '#58d7ff'], 70, -40, 0.8); sfx.shield(); }
      else { burst(P.x + 4, P.y + 12, 12, ['#ece6d2', '#b3aa92'], 60, 200, 0.4); sfx.ready(); }
    }
    return;
  }
  if (P.ghost > 0) { ghostUpdate(P, dt, grav); return; }
  if (G.hero === 'slime') fitSlime(P);

  // --- movement
  const ax = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
  const slick = P.onGround && iceAt(P.x + 4, P.y + P.h + 1);             // ice: slow to start, slow to stop
  const webbed = P.onGround && (G.webs || []).some(w => P.x + P.w > w.x && P.x < w.x + 28 && Math.abs(P.y + P.h - w.y) < 3);   // Widow silk
  const top = RUN * (slick ? 1.2 : 1) * (swim ? 0.75 : 1) * (webbed ? 0.4 : 1);
  if (P.ride > 0) { if (ax) P.face = ax; P.vx = P.face * 150; }
  else if (P.dash > 0) { P.face = P.dashDir; P.vx = P.dashDir * DASH_SPEED; }        // Ninja dash: locked, straight line                // Barrel Rider rolls on its own; arrows steer
  else if (ax) {
    const acc = (P.onGround ? 1000 : 700) * (Math.sign(P.vx) === -ax ? 1.8 : 1) * (slick ? 0.3 : 1);
    P.vx = clamp(P.vx + ax * acc * dt, -top, top);
    P.face = ax;
  } else {
    const f = (P.onGround ? 1100 : 250) * dt * (slick ? 0.1 : 1);
    P.vx = Math.abs(P.vx) <= f ? 0 : P.vx - Math.sign(P.vx) * f;
  }
  P.coyote = P.onGround ? 0.1 : P.coyote - dt;
  P.buffer = tapped('jump') ? 0.12 : P.buffer - dt;

  // --- wall hug (Broforce): airborne + pushing into a wall = cling & slide; jump = climb up it
  const sticky = G.hero === 'slime' && P.king <= 0;                       // Sir sticks to walls on touch
  const touchR = hitsWall(P.x + 1, P.y + 2, P.w, P.h - 4), touchL = hitsWall(P.x - 1, P.y + 2, P.w, P.h - 4);
  // Sir only glues on when he actually heads into the wall (pressing, flying at it, or already stuck) — never when he just walks off a ledge beside it
  const into = d => held(d > 0 ? 'right' : 'left') || sticky && (P.hug === d || (P.pushVx || 0) * d > 20);
  let side = into(1) && touchR ? 1 : into(-1) && touchL ? -1 : 0;
  if (sticky && side && held(side > 0 ? 'left' : 'right') && !P.buffer) side = 0;   // push away to let go
  const wasHug = P.hug;
  P.hug = !P.onGround && side ? side : 0;
  if (P.hug) { P.hugT = 0.12; P.hugSide = P.hug; P.face = P.hug; } else P.hugT -= dt;
  if (sticky && P.hug && !wasHug) {                                        // SPLAT onto the wall
    P.splat = 0.22; sfx.pop();
    burst(P.hug > 0 ? P.x + P.w : P.x, P.y + P.h / 2, 7, ['#4fd18a', '#9ff0c0', '#2a8f5c'], 45, 120, 0.35);
  }
  P.splat = Math.max(0, (P.splat || 0) - dt);
  if (sticky && P.hug && Math.random() < dt * 1.6)                          // slow goo drips while clinging
    G.parts.push({ x: P.hug > 0 ? P.x + P.w - 1 : P.x, y: P.y + P.h - 2, vx: 0, vy: 10, life: 0.8, max: 0.8, c: '#4fd18a', g: 160, size: 1 });

  const jump = JUMP * (LV.jumpMul || 1) * (webbed ? 0.7 : 1);
  if (swim && P.buffer > 0) {                                              // swimming: every tap is a stroke
    P.vy = -165; P.buffer = 0; sfx.jump();
    burst(P.x + 4, P.y + 14, 4, ['#bff0f6', '#8fe8e0'], 20, -60, 0.6);
  } else if (P.buffer > 0 && P.coyote > 0) {
    const br = P.riding && P.riding.branch ? P.riding : null;              // a springy branch flings you higher
    P.vy = -jump * (br ? BRANCH_BOOST : 1); P.buffer = 0; P.coyote = 0; P.riding = null;
    if (br) { branchKick(br); P.climbT = 0.12; }
    sfx.jump(); dust(P.x + 4, P.y + P.h, 5);
  } else if ((G.hero === 'monkey' || G.hero === 'ninja' && P.fury > 0) && P.buffer > 0 && P.airJumps > 0 && !P.hug) {   // Monkey passive / Ninja in FURY: double jump with a flip
    P.vy = -jump * 0.92; P.buffer = 0; P.airJumps--; P.flip = 0.35;
    sfx.jump(); burst(P.x + 4, P.y + P.h, 6, G.hero === 'ninja' ? ['#ff4d6d', '#ffb3c1', '#ffffff'] : ['#e8c090', '#b07a48'], 30, 60, 0.3);
  } else if (P.buffer > 0 && P.hugT > 0) {
    const s = P.hugSide, away = held(s > 0 ? 'left' : 'right');
    P.vy = -CLIMB_JUMP; P.buffer = 0; P.hugT = 0; P.climbT = 0.2;   // a tap is enough to climb
    if (away) { P.vx = -s * KICK_X; P.face = -s; }            // kick off the wall
    sfx.jump();
    burst(s > 0 ? P.x + P.w : P.x, P.y + P.h - 4, 4, ['#8c89ab', '#6b6889', '#aeabcb'], 30, 60, 0.3);
  }
  P.climbT = (P.climbT || 0) - dt;
  const gm = swim ? 0.3 : P.vy < 0 && !held('jump') && P.climbT <= 0 && P.bounce <= 0 ? 2.4 : P.vy > 0 ? 1.3 : 1;
  P.vy = Math.min(P.vy + grav * gm * dt, swim ? 70 : P.hug && P.vy > 0 ? (sticky ? 0 : WALL_SLIDE) : MAX_FALL);
  if (sticky && P.hug && P.vy > 0) P.vy = 0;
  if (P.dash > 0) P.vy = 0;
  if (P.hug && !sticky && P.vy > 0 && (P.scrape -= dt) <= 0) {
    P.scrape = 0.07;
    G.parts.push({ x: P.hug > 0 ? P.x + P.w : P.x, y: P.y + 4 + Math.random() * 10, vx: -P.hug * 10, vy: -8, life: 0.35, max: 0.35, c: ['#8c89ab', '#aeabcb'][(Math.random() * 2) | 0], g: 40, size: 1 });
  }
  const wasGround = P.onGround, fallV = P.vy, prevBottom = P.y + P.h, pushing = P.vx;
  move(P, dt);
  P.pushVx = pushing;
  if (P.king > 0 || P.ride > 0) kingSmash(P, dt, pushing, wasGround, fallV);
  if (P.bounce > 0 && !wasGround && P.onGround && fallV > 40) {             // E: boing — every landing springs you higher
    P.vy = -Math.min(390, Math.max(250, fallV * 0.95 + 40)); P.onGround = false;
    burst(P.x + P.w / 2, P.y + P.h, 6, ['#4fd18a', '#9ff0c0'], 40, 80, 0.3); sfx.jump();
  }
  P.bounce = Math.max(0, P.bounce - dt); P.smash = Math.max(0, P.smash - dt);
  landOnPlatforms(P, prevBottom);
  if (!wasGround && P.onGround && fallV > 180) { dust(P.x + 4, P.y + P.h, 6); sfx.land(); }
  if (P.onGround) { P.walk += (dt * Math.abs(P.vx)) / 11; P.airJumps = 1; }
  if (P.hug) P.airJumps = 1;
  P.flip -= dt; P.throwT -= dt;
  if (swim && Math.random() < 0.04) G.parts.push({ x: P.x + 4, y: P.y + 2, vx: 0, vy: -25, life: 1, max: 1, c: '#bff0f6', g: 0, size: 1 });
  P.inv -= dt; P.castT -= dt;
  P.shield = Math.max(0, P.shield - dt);

  // projectiles leave at chest height so they hit short foes too
  const sp = staffPos(P), muzzle = { x: sp.gx + P.face * 3, y: P.y + 9 };
  if (G.hero === 'skeleton') skeletonKit(P, muzzle);
  else if (G.hero === 'slime') slimeKit(P, muzzle);
  else if (G.hero === 'monkey') monkeyKit(P, dt);
  else if (G.hero === 'goblin') goblinKit(P);
  else if (G.hero === 'ninja') ninjaKit(P, dt);
  else wizardKit(P, muzzle, sp);

  if (P.y > WORLD_H + 24) killPlayer();
}

function wizardKit(P, muzzle, sp) {
  const blood = isBlood(P);
  trySpell(P, 'q', () => {
    if (blood) { P.cd.q = BLOOD_Q_CD; return throwBloodOrb(P, muzzle); }   // Blood Moon Q fires a touch faster
    P.castT = 0.15;
    G.shots.push({ kind: 'orb', x: muzzle.x + P.face, y: muzzle.y - 1, vx: P.face * ORB.speed, vy: (Math.random() - 0.5) * 10, life: 0.85, friendly: true, dmg: ORB.dmg });   // Full Moon orb: a little more reach (~160 px) than the other flat shots
    burst(muzzle.x, muzzle.y, 5, ['#3aa0ff', '#bfe8ff'], 40, 0, 0.25);
    sfx.orb();
  }, true);
  trySpell(P, 'e', () => {
    if (blood) { if (!bloodHeal(P)) P.cd.e = 0; return; }                // Blood Moon: heal instead of shield
    P.shield = SHIELD_TIME;
    burst(P.x + 4, P.y + 9, 16, CYAN, 70, 0, 0.4);
    sfx.shield();
  });
  trySpell(P, 'r', () => switchPhase(P, sp));
  P.spark -= G.dt;
  if (P.spark <= 0) {
    P.spark = 0.15 + Math.random() * 0.3;
    G.parts.push({ x: sp.gx + (Math.random() * 4 - 2), y: sp.gy, vx: (Math.random() - 0.5) * 8, vy: -12 - Math.random() * 10, life: 0.7, max: 0.7, c: blood ? BLOOD[(Math.random() * 3) | 0] : CYAN[(Math.random() * 4) | 0], g: 0, size: 1 });
  }
}

/** Skeleton Deserter — Q: arrows that stick in walls as footholds. E: throw your head (catch it to put it back).
 *  R: crumble into a ghost for 5 s — untargetable, floats, Q fires wisps. Passive: cheats death once per checkpoint. */
function skeletonKit(P, muzzle) {
  trySpell(P, 'q', () => {
    P.castT = 0.12;
    G.shots.push({ kind: 'parrow', x: P.x + 4 + P.face * 8, y: muzzle.y - 1, vx: P.face * 340, vy: 0, life: 0.5, friendly: true, dmg: 1.4 });   // ~170 px
    sfx.bow();
  }, true);
  if (tapped('e')) {
    const head = P.headless && G.shots.find(s => s.kind === 'skull' && !s.dead);
    if (head) { if (!head.recall) { head.recall = true; head.hitSet.clear(); sfx.hex(); } }   // E again: call it home
    else if (P.headless || P.cd.e > 0) { P.deny.e = 0.3; sfx.denied(); }
    else {                                                                // the cooldown starts when you catch it
      P.headless = true;
      G.shots.push({ kind: 'skull', x: P.x + 4, y: P.y + 2, vx: P.face * 180, vy: -150, g: 600, life: 12, age: 0, friendly: true, dmg: 6, strikes: 0, hitSet: new Set() });
      pop('HEADS UP!', P.x - 14, P.y - 12, '#ece6d2');
      sfx.shriek();
    }
  }
  const out = P.headless && G.shots.find(s => s.kind === 'skull' && !s.dead);
  if (out && !out.recall && out.age > 0.6) hint('PRESS E TO CALL YOUR HEAD BACK', 0.1);   // stays up while the head is away
  trySpell(P, 'r', () => {
    P.pile = CRUMBLE; P.ghostNext = true; P.hug = 0;
    burst(P.x + 4, P.y + 8, 14, ['#ece6d2', '#b3aa92', '#c8323f'], 70, 300, 0.5);
    sfx.pop();
  });
}

/** Ghost form: sink slowly, every jump tap lifts you, Q fires wisps; nothing can touch you. */
function ghostUpdate(P, dt, grav) {
  P.ghost -= dt;
  const ax = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
  P.vx += (ax * RUN - P.vx) * Math.min(1, dt * 8);
  if (ax) P.face = ax;
  if (tapped('jump')) { P.vy = -120; burst(P.x + 4, P.y + 18, 5, ['#bdf2ff', '#58d7ff'], 25, 30, 0.4); sfx.jump(); }
  P.vy = Math.min(P.vy + grav * 0.22 * dt, 38);
  move(P, dt);
  P.hug = 0; P.castT -= dt;
  if (Math.random() < 0.5) G.parts.push({ x: P.x + 4 + (Math.random() - 0.5) * 6, y: P.y + 16, vx: 0, vy: 12, life: 0.5, max: 0.5, c: ['#bdf2ff', '#58d7ff'][(Math.random() * 2) | 0], g: 0, size: 1 });
  if (tapped('e') || tapped('r')) { P.deny[tapped('e') ? 'e' : 'r'] = 0.3; sfx.denied(); }
  if (held('q') && P.cd.q <= 0) {
    P.cd.q = 0.33; P.castT = 0.1;
    G.shots.push({ kind: 'wisp', x: P.x + 4 + P.face * 6, y: P.y + 7, vx: P.face * 260, vy: (Math.random() - 0.5) * 20, life: 0.5, friendly: true, dmg: 1 });   // ~130 px
    sfx.orb();
  }
  if (P.ghost <= 0) { P.pile = CRUMBLE; burst(P.x + 4, P.y + 8, 16, ['#ffffff', '#bdf2ff'], 60, 0, 0.5); }   // reassemble
  if (P.y > WORLD_H + 24) killPlayer();
}

/** Sir Slimes a Lot — size is health. Q: a fast goo shot costing a quarter heart; it pools into a puddle that stings
 *  foes and that Sir can soak back up. E: BOUNCE for 3 s (every landing springs higher, stomps hit harder).
 *  R: KING SIZE for 5 s. Passive: sticks to walls. */
function slimeKit(P, muzzle) {
  if (P.king > 0) { kingQ(P); } else trySpell(P, 'q', () => {
    if (P.hp <= 1) { P.cd.q = 0.5; hint('TOO SMALL - SOAK UP YOUR GOO PUDDLES'); sfx.denied(); return; }
    P.hp -= GOO_COST;
    G.shots.push({ kind: 'glob', x: P.x + P.w / 2 + P.face * 6, y: P.y + P.h * 0.45, vx: P.face * 270, vy: -25, g: 150, life: 1.4, friendly: true, dmg: 2, r: 1, value: GOO_COST });
    sfx.pop();
  }, true);
  trySpell(P, 'e', () => { P.bounce = 3; P.vy = Math.min(P.vy, -260); P.onGround = false; pop('BOING!', P.x - 8, P.y - 12, '#9ff0c0'); sfx.jump(); });
  trySpell(P, 'r', () => {
    P.king = KING_TIME; P.crushed.clear();
    fitSlime(P, true);
    G.shake = 0.4; G.flash = 0.1; sfx.moonfall();
    pop('KING SIZE!', P.x - 12, P.y - 14, '#f0b541');
    burst(P.x + P.w / 2, P.y + P.h / 2, 30, ['#4fd18a', '#9ff0c0', '#f0b541'], 90, 200, 0.6);
  });
  if (P.king > 0 && (P.king -= G.dt) <= 0) { P.king = 0; fitSlime(P); burst(P.x + 4, P.y + P.h / 2, 16, ['#4fd18a', '#9ff0c0'], 60, 200, 0.5); }
}

/** Monkey — passive double jump. Q: a flat, fast banana (misses leave slippery peels). E: YOINK — grab & hurl the
 *  nearest foe or barrel (bosses get punched). R: the monkey gang drops in for 8 s. */
function monkeyKit(P, dt) {
  updateCarry(P, dt);
  trySpell(P, 'q', () => {
    P.throwT = 0.15;
    G.shots.push({ kind: 'banana', x: P.x + 4 + P.face * 6, y: P.y + 8, vx: P.face * 290, vy: -30, g: 140, life: 1.4, friendly: true, dmg: 1.5 });   // a flat, fast throw — aim like a projectile
    troopThrow(P);
    sfx.bow();
  }, true);
  if (tapped('e')) {
    if (P.cd.e > 0 || P.carry) { P.deny.e = 0.3; sfx.denied(); }
    else if (yoink(P)) P.cd.e = CD.e;
    else { P.deny.e = 0.3; sfx.denied(); hint('NOTHING TO GRAB - GET CLOSER TO A FOE OR BARREL'); }
  }
  trySpell(P, 'r', () => { if (!callTroop(P)) { P.cd.r = 0; P.deny.r = 0.3; sfx.denied(); hint('THE TROOP IS ALREADY WITH YOU'); } });
}

/** KING SIZE Q: no projectiles — a huge melee SMASH in front (breaks walls, flings foes). */
function kingQ(P) {
  if (!held('q') || P.cd.q > 0) return;
  P.cd.q = 0.45; P.smash = 0.18;                                       // melee keeps its quick swing
  const dir = P.face, hx = dir > 0 ? P.x + P.w : P.x - 30, hy = P.y - 4, hw = 30, hh = P.h + 8;
  for (const e of G.enemies) {
    if (!e.alive || (e.boss && e.state === 'sleep')) continue;
    if (e.x > hx + hw || e.x + e.w < hx || e.y > hy + hh || e.y + e.h < hy) continue;
    damageEnemy(e, 5, P.x + P.w / 2, 'boom');
    if (!e.boss && !e.flying && e.type !== 'barrel') { e.vx = dir * 260; e.vy = -240; e.stun = 0.9; }
  }
  for (let ty = Math.floor(hy / 16); ty <= Math.floor((P.y + P.h - 1) / 16); ty++)          // walls in front, never the floor you stand on
    for (let tx = Math.floor(hx / 16); tx <= Math.floor((hx + hw - 1) / 16); tx++) damageTile(tx, ty, 3);
  burst(P.x + P.w / 2 + dir * 22, P.y + P.h / 2, 16, ['#ffffff', '#9ff0c0', '#4fd18a'], 90, 150, 0.35);
  G.shake = Math.max(G.shake, 0.2); sfx.stomp(); sfx.swing();
}

/** Goblinbomber — passive: his own blasts launch him instead of hurting him. Q: sticky charge (max 5).
 *  E: detonate them all in sequence. R: Barrel Rider for 5 s, ending (or on R again) in a huge blast. */
function goblinKit(P) {
  if (P.ride > 0) {
    P.ride -= G.dt;
    if (P.ride <= 0 || (tapped('r') && P.ride < RIDE_TIME - 0.3)) endRide(P);
    return;
  }
  trySpell(P, 'q', () => {
    if (!throwCharge(P)) { P.cd.q = 0.3; hint(`MAX ${MAX_CHARGES} CHARGES - PRESS E TO BLOW THEM`); sfx.denied(); return; }
    P.throwT = 0.15; sfx.bow();
  }, true);
  if (tapped('e')) {
    if (P.cd.e > 0) { P.deny.e = 0.3; sfx.denied(); }
    else {
      const n = detonateAll();
      if (n > 0) { P.cd.e = CD.e; sfx.alert(); }
      else if (n < 0) { P.deny.e = 0.15; sfx.denied(); }                          // still arming — press again in a blink
      else { P.deny.e = 0.3; sfx.denied(); hint('NO CHARGES OUT - PRESS Q TO STICK ONE'); }
    }
  }
  trySpell(P, 'r', () => {
    P.ride = RIDE_TIME; P.crushed.clear();
    fitBox(P, 16, 26, true);
    P.vy = -150; G.shake = 0.3; sfx.shriek();
    pop('BARREL RIDER!', P.x - 20, P.y - 14, '#ff9a4d');
  });
}
/** The Ninja — Q: shuriken that pass through foes. E: dash, untargetable. R: FURY — Q becomes a katana slash, E recharges fast. */
function ninjaKit(P, dt) {
  updateNinja(P, dt);
  const fury = P.fury > 0;
  trySpell(P, 'q', () => {
    if (fury) { slash(P); P.cd.q = FURY_Q_CD; }
    else { throwStar(P); P.throwT = 0.15; sfx.bow(); }
  }, true);
  trySpell(P, 'e', () => { startDash(P); if (fury) P.cd.e = FURY_E_CD; });
  trySpell(P, 'r', () => startFury(P));
}
function endRide(P) {
  P.ride = 0;
  const x = P.x + P.w / 2, y = P.y + P.h - 8;
  fitBox(P, 8, 18);
  explode(x, y, 44, { dmg: 8 });
  rocketPush(x, y + 10, 1.25);
  pop('KABOOM!', x - 14, y - 26, '#ff9a4d');
}

/** Resize the hitbox from the feet up; `force` smashes through tiles that are in the way. */
export function fitBox(P, w, h, force = false) {
  if (w === P.w && h === P.h) return;
  const nx = P.x + P.w / 2 - w / 2, ny = P.y + P.h - h;
  if (hitsWall(nx, ny, w, h) && force) {
    for (let ty = Math.floor(ny / 16); ty <= Math.floor((ny + h - 1) / 16); ty++)
      for (let tx = Math.floor(nx / 16); tx <= Math.floor((nx + w - 1) / 16); tx++) damageTile(tx, ty, 99);
  }
  if (!hitsWall(nx, ny, w, h) || h < P.h) { P.x = nx; P.y = ny; P.w = w; P.h = h; }
}

/** Size follows health (and KING SIZE); the body grows from the feet, breaking tiles only as king. */
export function fitSlime(P, force = false) {
  fitBox(P, P.king > 0 ? 16 : 8, P.king > 0 ? 26 : 8 + clamp(Math.ceil(P.hp), 1, 5) * 2, force);
}

function kingSmash(P, dt, pushing, wasGround, fallV) {
  if (pushing && !P.vx) {                                                  // walked into a wall: through it
    const tx = Math.floor((pushing > 0 ? P.x + P.w + 2 : P.x - 2) / 16);
    for (let ty = Math.floor(P.y / 16); ty <= Math.floor((P.y + P.h - 1) / 16); ty++) damageTile(tx, ty, 6);
    G.shake = Math.max(G.shake, 0.1);
  }
  if (!wasGround && P.onGround && fallV > 200) {                          // belly flop
    G.shake = 0.35; sfx.boom(24);
    burst(P.x + P.w / 2, P.y + P.h, 20, ['#4fd18a', '#9ff0c0', '#8c89ab'], 90, 300, 0.5);
    for (const e of G.enemies) if (e.alive && Math.abs(e.x + e.w / 2 - P.x - P.w / 2) < 52 && Math.abs(e.y + e.h - P.y - P.h) < 30) damageEnemy(e, 4, P.x + P.w / 2, 'boom');
  }
  for (const e of G.enemies) {                                             // crush whatever it touches
    if (!e.alive || (e.boss && e.state === 'sleep')) continue;
    if (P.x >= e.x + e.w || P.x + P.w <= e.x || P.y >= e.y + e.h || P.y + P.h <= e.y) continue;
    if ((P.crushed.get(e) || 0) > G.t) continue;
    P.crushed.set(e, G.t + 0.5);
    damageEnemy(e, 6, P.x + P.w / 2, 'boom');
    if (!e.boss && !e.flying && e.type !== 'barrel') { e.vx = Math.sign(e.x - P.x || 1) * 220; e.vy = -250; e.stun = 0.8; }
    sfx.stomp();
  }
}

/** Crystals feed the ultimate: each one knocks seconds off R. */
export function chargeMoon(P) {
  if (P.cd.r > 0) { P.cd.r = Math.max(0, P.cd.r - MOON_PER_CRYSTAL); pop(`-${MOON_PER_CRYSTAL}S`, P.x - 2, P.y - 10, '#ff9aa8'); }
}
