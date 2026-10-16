// Duel AI: plays any hero by pressing the same virtual keys a player would (held / tapped).
// Movement runs on a platform graph read from the tile map (jump up, drop down, hop across);
// combat keeps a hero-specific range, lines up shots, dodges what's incoming and uses E / R when they pay off.
import { G } from './state.js';
import { TILE } from './gfx.js';
import { LV, WORLD_W, WORLD_H, solidTile, solidAt, groundBelow } from './world.js';

const RANGE = { wizard: 80, skeleton: 105, slime: 70, monkey: 105, goblin: 58, ninja: 95 };
const SHOT_REACH = { wizard: 150, skeleton: 165, slime: 240, monkey: 260, goblin: 90, ninja: 160 };

export function makeBrain() {
  const hard = G.diff.id === 'overkill';
  return {
    ctl: { held: {}, tap: {} },
    skill: hard ? 0.85 : 0.55,          // chance to react to a threat at all
    fire: hard ? 1 : 0.65,              // share of the time a lined-up shot is actually taken
    hopEvery: hard ? [0.9, 2] : [1.4, 3],
    jumpHold: 0, dodgeCd: 0, hopT: 1.5, stuckT: 0, lastX: 0, fireT: 0, burst: true, qHold: 0, ghostLift: 0,
  };
}

/* ---------------- platform graph (cached per level) ---------------- */
let plats = null, platsLV = null;
function platforms() {
  if (platsLV === LV) return plats;
  plats = [];
  for (let ty = 0; ty < LV.rows; ty++) {
    let run = null;
    for (let tx = 0; tx <= LV.cols; tx++) {
      const ok = tx < LV.cols && solidTile(tx, ty) && !solidTile(tx, ty - 1) && !solidTile(tx, ty - 2);
      if (ok) { if (!run) run = { x0: tx * TILE, y: ty * TILE }; run.x1 = (tx + 1) * TILE; }
      else if (run) { plats.push(run); run = null; }
    }
  }
  plats.forEach((p, i) => { p.id = i; p.cx = (p.x0 + p.x1) / 2; });
  platsLV = LV;
  return plats;
}
/** The platform a body stands on — or, in the air, the one it would land on (null over a pit). */
function platformOf(b) {
  const feet = b.y + b.h;
  let best = null;
  for (const p of platforms()) {
    if (b.x + b.w <= p.x0 || b.x >= p.x1 || p.y < feet - 3) continue;
    if (!best || p.y < best.y) best = p;
  }
  return best;
}
function edges(A, rise) {
  const out = [];
  for (const B of platforms()) {
    if (B === A) continue;
    const dy = A.y - B.y, gap = Math.max(0, B.x0 - A.x1, A.x0 - B.x1);
    if (dy > 0) {                                                           // B is higher: jump up
      const overlap = gap === 0, roomL = B.x0 - A.x0 >= 22, roomR = A.x1 - B.x1 >= 22;
      if (dy <= rise && gap <= 40 && (!overlap || roomL || roomR)) out.push({ B, type: 'up' });
    } else if (dy < 0) {                                                    // B is lower: walk off an edge above it
      if ((B.x0 < A.x0 - 4 && A.x0 - B.x1 <= 72) || (B.x1 > A.x1 + 4 && B.x0 - A.x1 <= 72)) out.push({ B, type: 'down' });
    } else if (gap > 0 && gap <= 56) out.push({ B, type: 'across' });
  }
  return out;
}
/** First step of the shortest platform route A → T (BFS). */
function route(A, T, rise) {
  if (!A || !T || A === T) return null;
  const prev = new Map([[A, null]]), q = [A];
  while (q.length) {
    const cur = q.shift();
    if (cur === T) break;
    for (const ed of edges(cur, rise)) if (!prev.has(ed.B)) { prev.set(ed.B, { from: cur, ed }); q.push(ed.B); }
  }
  if (!prev.has(T)) return null;
  let node = T, step = null;
  while (prev.get(node)) { step = prev.get(node).ed; node = prev.get(node).from; }
  return step;
}

/* ---------------- the brain ---------------- */
export function think(F, dt) {
  const b = F.brain, c = b.ctl, P = F.P, foe = F.foe, Q = foe.P, hero = F.hero;
  c.held = {}; c.tap = {};
  if (P.dead) return;
  b.dodgeCd -= dt; b.hopT -= dt; b.fireT -= dt; b.qHold -= dt; b.ghostLift -= dt;
  const me = { x: P.x + P.w / 2, y: P.y + 9 }, it = { x: Q.x + Q.w / 2, y: Q.y + 9 };
  const dx = it.x - me.x, dy = it.y - me.y, adx = Math.abs(dx), toFoe = Math.sign(dx) || P.face;
  const rise = hero === 'monkey' || (hero === 'ninja' && P.fury > 0) ? 88 : 50;   // 3 tiles: a full jump (+ a wall-climb tap if it clips the edge)
  const press = d => { if (d > 0) c.held.right = true; else if (d < 0) c.held.left = true; };
  const jump = (hold = 0.34) => { c.tap.jump = true; b.jumpHold = hold; };
  if (b.jumpHold > 0) { c.held.jump = true; b.jumpHold -= dt; }
  const myPlat = platformOf(P), itPlat = platformOf(Q);
  const pit = x => groundBelow(x, P.y + P.h) > WORLD_H;
  const edgeSafe = d => { const ax = d > 0 ? P.x + P.w + 3 : P.x - 3; return solidAt(ax, P.y + P.h + 3) || !pit(ax); };
  /** Is there floor under every step from here to x (no pit in between)? */
  b.floorTo = x => { for (let sx = me.x; Math.abs(sx - x) > 4; sx += Math.sign(x - sx) * 6) if (pit(sx)) return false; return !pit(x); };
  b.pit = pit;

  /* ---- ghost (skeleton R): float at the rival's height and pour wisps */
  if (P.ghost > 0) {
    if (P.ghost < 1.3 && pit(me.x)) {                                      // about to turn back into bones: get over solid ground
      let best = null;
      for (const p of platforms()) if (!best || Math.abs(p.cx - me.x) < Math.abs(best.cx - me.x)) best = p;
      if (best) press(Math.sign(best.cx - me.x));
      return;
    }
    press(adx > 70 ? toFoe : adx < 40 ? -toFoe : 0);
    if (dy < -4 && b.ghostLift <= 0) { c.tap.jump = true; b.ghostLift = 0.28; }
    if (P.face !== toFoe) press(toFoe);
    if (Math.abs(dy) < 12) c.held.q = true;
    return;
  }
  if (P.pile > 0) return;

  /* ---- recovery: airborne over a pit — steer to the nearest cloud, burn whatever saves you */
  if (!P.onGround && pit(me.x) && !P.hug) {
    let best = null;
    for (const p of platforms()) if (p.y > P.y - 30 && (!best || Math.abs(p.cx - me.x) < Math.abs(best.cx - me.x))) best = p;
    const d = best ? Math.sign(best.cx - me.x) : -Math.sign(me.x - WORLD_W / 2);
    press(d);
    if (P.vy > 0) {
      if ((hero === 'monkey' || (hero === 'ninja' && P.fury > 0)) && P.airJumps > 0) jump(0.3);
      else if (hero === 'ninja' && P.cd.e <= 0 && best && Math.abs(best.cx - me.x) > 30) { if (P.face === d) c.tap.e = true; }
      else if (hero === 'skeleton' && P.cd.r <= 0) c.tap.r = true;
      else if (hero === 'slime' && P.cd.e <= 0 && best && best.y < P.y + P.h + 20) c.tap.e = true;
    }
    return;
  }

  /* ---- dodge what's coming */
  const threat = foe.shots.some(s => {
    if (s.dead) return false;
    const rx = me.x - s.x, ry = me.y - s.y;
    if (Math.abs(ry) > 16 || Math.abs(rx) > 80 || Math.sign(s.vx || 0) !== Math.sign(rx)) return false;
    return Math.abs(rx) / Math.max(40, Math.abs(s.vx)) < 0.4;
  });
  const bombed = foe.charges.some(ch => ch.foe === F.proxy || Math.hypot(ch.x - me.x, ch.y - me.y) < 30);
  const brute = Q.king > 0 || Q.ride > 0 || Q.fury > 0;                   // something big is charging
  if ((threat || bombed || (brute && adx < 44)) && b.dodgeCd <= 0) {
    b.dodgeCd = 0.5;
    if (Math.random() < b.skill) {
      if (hero === 'wizard' && P.phase !== 'blood' && P.cd.e <= 0 && threat) c.tap.e = true;   // mirror it back (Full Moon only)
      else if (hero === 'ninja' && P.cd.e <= 0 && !pit(me.x + toFoe * 75)) { if (P.face !== toFoe) press(toFoe); c.tap.e = true; }   // dash through
      else if (P.onGround) jump(bombed || brute ? 0.34 : 0.2);
      else if (hero === 'monkey' && P.airJumps > 0) jump(0.25);
      if (bombed || brute) b.fleeT = 0.6;
    }
  }
  b.fleeT = (b.fleeT || 0) - dt;

  /* ---- where to stand */
  const melee = P.king > 0 || P.fury > 0;
  let want = melee ? 14 : RANGE[hero];
  if (b.fleeT > 0 || (brute && !melee)) want = 120;
  const sameLevel = Math.abs(dy) < 14;
  let goalX = null, plan = null;
  if (P.ride > 0) goalX = it.x;                                            // barrel: just roll at them
  else if (!myPlat || myPlat === itPlat || (sameLevel && (adx < SHOT_REACH[hero] * 0.75 || !itPlat))) {   // same level but out of reach → go over there
    const lo = Math.max(8, (myPlat ? myPlat.x0 : 0) + 6), hi = Math.min(WORLD_W - 8, (myPlat ? myPlat.x1 : WORLD_W) - 6);
    goalX = it.x - toFoe * want;
    if (goalX < lo || goalX > hi) goalX = it.x - toFoe * Math.min(want, 44);   // cornered: fight closer instead of hugging the wall
    goalX = Math.max(lo, Math.min(hi, goalX));
  } else {
    plan = route(myPlat, itPlat, rise);
    if (!plan) { goalX = it.x; if (P.onGround && b.hopT > 0.4) b.hopT = 0.4; }   // no route: close in and hop toward them
  }

  /* slime: soak your puddles back up when there's a breather */
  if (hero === 'slime' && P.king <= 0 && P.hp < P.maxHp - 0.5 && !threat && adx > 60) {
    const pud = G.puddles.filter(p => myPlat && Math.abs(p.y - myPlat.y) < 3 && p.x > myPlat.x0 - 4 && p.x < myPlat.x1).sort((a, z) => Math.abs(a.x - me.x) - Math.abs(z.x - me.x))[0];
    if (pud && Math.abs(pud.x + 6 - me.x) < 90) { goalX = pud.x + 6; plan = null; }
  }

  if (plan) {
    const B = plan.B;
    if (plan.type === 'up') {
      const overlap = Math.max(0, B.x0 - myPlat.x1, myPlat.x0 - B.x1) === 0;
      let take, dir;
      if (!overlap) { dir = Math.sign(B.cx - myPlat.cx); take = dir > 0 ? myPlat.x1 - 8 : myPlat.x0 + 8; }
      else {
        const L = B.x0 - 24, R = B.x1 + 24, canL = L - myPlat.x0 >= 4, canR = myPlat.x1 - R >= 4;
        const useL = canL && (!canR || Math.abs(me.x - L) <= Math.abs(me.x - R));
        take = useL ? L : R; dir = useL ? 1 : -1;
      }
      if (P.onGround) {
        if (Math.abs(me.x - take) > 5) press(Math.sign(take - me.x));
        else { press(dir); jump(0.4); }
      } else { press(Math.sign(B.cx - me.x)); if (P.hug) c.tap.jump = true; else if (rise > 46 && P.vy > 20 && P.y + P.h > B.y && P.airJumps > 0) jump(0.3); }
    } else if (plan.type === 'down') {
      const dir = B.x0 < myPlat.x0 - 4 && (me.x < myPlat.cx || !(B.x1 > myPlat.x1 + 4)) ? -1 : 1;
      if (P.onGround) press(dir); else press(Math.sign(Math.max(B.x0 + 10, Math.min(B.x1 - 10, me.x + dir * 20)) - me.x));
    } else {
      const dir = Math.sign(B.cx - myPlat.cx);
      if (P.onGround) { press(dir); const edge = dir > 0 ? myPlat.x1 - me.x : me.x - myPlat.x0; if (edge < 12) jump(0.4); }
      else press(dir);
    }
  } else if (goalX !== null) {
    const d = goalX - me.x;
    if (Math.abs(d) > 8) { const dir = Math.sign(d); if (P.hug === dir && !(dy < -10)) { /* let go of the wall */ } else if (!P.onGround || edgeSafe(dir) || P.ride > 0) press(dir); }
    else if (P.face !== toFoe && !melee) press(toFoe);                   // turn to face
    if (!P.onGround && P.hug && dy < -10) c.tap.jump = true;              // climb toward them
  }

  /* ---- unstuck & keep moving */
  const moving = c.held.left || c.held.right;
  if (P.onGround && moving && Math.abs(P.x - b.lastX) < 0.3) { if ((b.stuckT += dt) > 0.6) { jump(0.4); b.stuckT = 0; } } else b.stuckT = 0;
  b.lastX = P.x;
  if (P.onGround && b.hopT <= 0 && !plan) { b.hopT = b.hopEvery[0] + Math.random() * (b.hopEvery[1] - b.hopEvery[0]); if (Math.random() < 0.6) jump(0.18 + Math.random() * 0.2); }

  /* ---- attack */
  if (b.fireT <= 0) { b.fireT = 0.4 + Math.random() * 0.5; b.burst = Math.random() < b.fire; }
  const facing = P.face === toFoe, lined = Math.abs(dy) < (hero === 'wizard' ? 16 : 11);
  const alive = !Q.dead && !(Q.ghost > 0) && !(Q.dash > 0);
  if (!alive) return;
  kit(F, b, c, P, Q, { dx, dy, adx, toFoe, facing, lined, press, jump, me, it });
}

function kit(F, b, c, P, Q, v) {
  const { adx, dy, toFoe, facing, lined, press } = v, hero = F.hero, shoot = b.burst;
  const reach = SHOT_REACH[hero];
  switch (hero) {
    case 'wizard': {
      const blood = P.phase === 'blood';
      if (lined && facing && adx < reach && shoot) c.held.q = true;
      if (blood && P.cd.e <= 0 && P.hp < P.maxHp) c.tap.e = true;                  // Blood Moon: mend
      if (P.cd.r <= 0 && (blood ? P.hp >= P.maxHp || P.cd.e > 2 : P.hp <= P.maxHp - 1 && P.cd.e <= 0)) c.tap.r = true;   // hurt → go red and heal; healed → back to the shield
      break;
    }
    case 'skeleton': {
      if (lined && facing && adx < reach && shoot) c.held.q = true;
      const head = P.headless && G.shots.find(s => s.kind === 'skull' && !s.dead);
      if (head) { if (!head.recall && head.age > 0.9) c.tap.e = true; }
      else if (!P.headless && P.cd.e <= 0 && Math.abs(dy) < 20 && facing && adx < 110) c.tap.e = true;
      if (P.cd.r <= 0 && P.hp <= 2 && adx < 120) c.tap.r = true;
      break;
    }
    case 'slime':
      if (P.king > 0) { if (adx < 34 && Math.abs(dy) < 26) { if (!facing) press(toFoe); c.held.q = true; } }
      else {
        if (lined && facing && adx < reach && shoot && P.hp > 2.25) c.held.q = true;
        if (P.cd.r <= 0 && adx < 90 && Math.abs(dy) < 30) c.tap.r = true;
        else if (P.cd.e <= 0 && dy < -40 && P.onGround) c.tap.e = true;   // bounce up after them
      }
      break;
    case 'monkey':
      if (lined && facing && adx < reach && shoot) c.held.q = true;
      if (P.cd.e <= 0 && adx < 38 && Math.abs(dy) < 24 && !P.carry) c.tap.e = true;
      if (P.cd.r <= 0 && adx < 180) c.tap.r = true;
      break;
    case 'goblin': {
      if (P.ride > 0) { press(b.pit(v.me.x + toFoe * 22) ? -toFoe : toFoe); break; }   // never roll the barrel off a cloud
      if (facing && adx > 14 && adx < (P.onGround ? 80 : 150) && Math.abs(dy) < 30 && G.charges.length < 3 && shoot) c.held.q = true;
      const armed = G.charges.filter(ch => ch.age >= 0.35);
      if (P.cd.e <= 0 && armed.some(ch => ch.foe === F.foe.proxy || Math.hypot(ch.x - v.it.x, ch.y - v.it.y) < 24)) c.tap.e = true;
      if (P.cd.r <= 0 && Math.abs(dy) < 12 && adx < 140 && facing && b.floorTo(v.it.x)) c.tap.r = true;
      break;
    }
    case 'ninja':
      if (P.fury > 0) { if (adx < 34 && Math.abs(dy) < 22) { if (!facing) press(toFoe); c.held.q = true; } }
      else if (lined && facing && adx < reach && shoot) c.held.q = true;
      if (P.cd.r <= 0 && adx < 120) c.tap.r = true;
      else if (P.cd.e <= 0 && lined && facing && adx > 60 && adx < 150 && b.floorTo(v.me.x + toFoe * 80) && Math.random() < 0.02) c.tap.e = true;
      break;
  }
}
