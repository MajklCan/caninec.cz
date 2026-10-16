// Level layouts, authored with builder helpers. Levels are two screens tall (multi-storey, Broforce-style).
// Tile types: 1 stone, 2 bedrock (indestructible), 3 wood, 4 ice (slippery, brittle), 5 iron (indestructible,
// riveted steel — placed where breaking the terrain would cut the route: tower floors, bridges, stepping stones, pit lips).
import { TILE } from './gfx.js';

export const STONE = 1, BEDROCK = 2, WOOD = 3, ICE = 4, IRON = 5;
const FLYERS = new Set(['bat', 'cultist', 'jelly', 'drone', 'sentry', 'ufo', 'nest', 'wasp']);

function builder(cols, rows) {
  const grid = new Uint8Array(cols * rows);
  const fill = (type, x0, x1, y0, y1 = y0) => {
    for (let x = Math.max(0, x0); x <= Math.min(cols - 1, x1); x++)
      for (let y = Math.max(0, y0); y <= Math.min(rows - 1, y1); y++) grid[y * cols + x] = type;
  };
  const surface = tx => { for (let y = 0; y < rows; y++) if (grid[y * cols + tx]) return y; return rows; };
  const crystals = [], spawns = [], torches = [], icicles = [], movers = [], branches = [];
  return {
    stone: (x0, x1, y0, y1) => fill(STONE, x0, x1, y0, y1),
    wood: (x0, x1, y0, y1) => fill(WOOD, x0, x1, y0, y1),
    ice: (x0, x1, y0, y1) => fill(ICE, x0, x1, y0, y1),
    /** Solid ground from `top` down, with an indestructible bedrock floor row. */
    ground: (x0, x1, top) => { fill(STONE, x0, x1, top, rows - 2); fill(BEDROCK, x0, x1, rows - 1); },
    wall: x => fill(BEDROCK, x, x, 0, rows - 1),
    bedrock: (x0, x1, y0, y1) => fill(BEDROCK, x0, x1, y0, y1),
    iron: (x0, x1, y0, y1) => fill(IRON, x0, x1, y0, y1),
    clear: (x0, x1, y0, y1) => fill(0, x0, x1, y0, y1),
    gem: (tx, ty) => crystals.push({ x: tx * TILE + 8, y: ty * TILE + 8 }),
    gems(x0, x1, ty, step = 1) { for (let x = x0; x <= x1; x += step) this.gem(x, ty); },
    /** Ground foes stand ON tile `row` (default: topmost surface); flyers hover at `row`. */
    foe: (type, tx, row) => spawns.push({ type, tx, row }),
    torch: (tx, row) => torches.push({ tx, row }),
    /** An icicle hanging under tile (tx, ty). */
    icicle: (tx, ty) => icicles.push({ x: tx * TILE + 8, y: (ty + 1) * TILE, tx, ty }),
    /** Moving platform `w` tiles wide whose top travels between rows/cols (x0,y0) ↔ (x1,y1). */
    mover: (x0, y0, x1, y1, w, period) => movers.push({ ax: x0 * TILE, ay: y0 * TILE, bx: x1 * TILE, by: y1 * TILE, w: w * TILE, period }),
    /** A springy tree branch (one-way, bouncy): walk surface on top of tile row `row`, from col x0 to x1; `root` = the trunk side ('l' or 'r'). */
    branch: (x0, x1, row, root) => branches.push({ x: x0 * TILE, y: row * TILE, w: (x1 - x0 + 1) * TILE, root: root || 'l' }),
    surface,
    finish(meta) {
      // Pit lips are iron: blasting the edge of a pit must never widen it past a jump.
      const openBottom = x => x >= 0 && x < cols && !grid[(rows - 1) * cols + x];
      const groundTop = x => { let y = rows - 1; while (y > 0 && grid[(y - 1) * cols + x]) y--; return grid[y * cols + x] ? y : rows; };
      for (let x = 1; x < cols - 1; x++) {
        if (openBottom(x)) continue;
        if (!(openBottom(x - 1) || openBottom(x + 1) || openBottom(x - 2) || openBottom(x + 2))) continue;
        const top = groundTop(x);
        for (let y = top; y <= Math.min(rows - 2, top + 1); y++) if (grid[y * cols + x] !== BEDROCK) grid[y * cols + x] = IRON;
      }
      const enemies = spawns.map(s => FLYERS.has(s.type)
        ? { type: s.type, cx: s.tx * TILE + 8, cy: s.row * TILE + 8 }
        : { type: s.type, cx: s.tx * TILE + 8, feet: (s.row ?? surface(s.tx)) * TILE });
      return {
        cols, rows, grid, crystals, enemies, icicles, movers, branches, grav: 1, jumpMul: 1, water: null,
        torches: torches.map(t => ({ x: t.tx * TILE + 8, y: (t.row ?? surface(t.tx)) * TILE })),
        ...meta,
      };
    },
  };
}

/* ======================= LEVEL 1 — MOONLIT RAMPARTS ======================= */
function ramparts() {
  const b = builder(240, 18), G = 16;
  b.wall(0);
  // ---- training yard + a high bridge over the first pit
  b.ground(1, 26, G);
  b.torch(3);
  b.gem(7, 14); b.gem(8, 13); b.gem(9, 14);
  b.wood(12, 12, 14, 15);
  b.foe('barrel', 15); b.foe('slime', 18); b.foe('slime', 21); b.foe('barrel', 22);
  b.foe('bat', 24, 11);
  b.wood(14, 16, 13); b.stone(19, 21, 11); b.gem(20, 10);
  b.wood(24, 32, 9); b.gems(25, 31, 8, 2); b.foe('bat', 29, 5);
  // ---- three-storey watchtower
  b.ground(30, 64, G);
  b.wood(33, 33, 15);
  b.wood(35, 41, 13); b.wood(36, 36, 14, 15); b.wood(40, 40, 14, 15);
  b.wood(36, 36, 10, 12); b.wood(40, 40, 10, 12); b.wood(35, 41, 9);
  b.wood(36, 36, 6, 8); b.wood(40, 40, 6, 8); b.wood(36, 40, 5);
  b.foe('archer', 38, 5); b.foe('archer', 37, 9); b.foe('archer', 39, 13);
  b.gem(38, 4); b.gem(38, 11);
  b.foe('barrel', 38, G);
  b.foe('barrel', 34, G); b.foe('barrel', 42, G);        // outside the tower too: grab one and hurl it at the wood
  b.foe('archer', 47, G);
  b.gems(50, 52, 14);
  b.foe('brute', 52, G);
  // ---- bunker, and the high rampart walkway on pillars above it
  b.stone(55, 55, 13, 15); b.stone(60, 60, 13, 15); b.stone(55, 60, 12);
  b.foe('archer', 57, G); b.foe('barrel', 58, G);
  b.stone(58, 72, 7); b.stone(76, 88, 7); b.stone(92, 100, 7);
  b.stone(64, 64, 8, 15); b.stone(84, 84, 8, 15); b.stone(96, 96, 8, 15);
  b.foe('archer', 62, 7); b.foe('archer', 80, 7); b.foe('barrel', 86, 7); b.foe('bomber', 94, 7); b.foe('cultist', 78, 3);
  b.gem(66, 6); b.gem(68, 6); b.gem(82, 6); b.gem(98, 6);
  b.torch(63, G);
  // ---- rickety bridge (it breaks)
  b.iron(65, 69, G);                                   // iron bridge — the pit is too wide to jump
  b.foe('brute', 67, G);
  // ---- bomber field under the walkway
  b.ground(70, 98, G);
  b.foe('bomber', 78, G); b.foe('bomber', 86, G);
  b.foe('barrel', 81, G); b.foe('barrel', 82, G);
  b.foe('bat', 80, 11); b.foe('bat', 88, 12);
  b.gem(80, 13); b.gem(87, 13);
  b.stone(90, 91, 14, 15);
  b.foe('barrel', 94, G);                               // blow (or throw) it into the pillar ahead
  b.foe('archer', 95, G); b.foe('cultist', 93, 11);
  b.torch(97, G);
  b.iron(101, 101, 14);                                // stepping stone over a 5-wide pit
  // ---- five-storey cultist tower — blast your way up
  b.ground(104, 156, G);
  b.stone(110, 110, 3, 15); b.stone(118, 118, 3, 15);
  b.stone(110, 118, 2); b.wood(111, 117, 7); b.stone(111, 117, 10); b.wood(111, 117, 13);
  b.foe('archer', 113, G); b.foe('archer', 116, 13); b.foe('bomber', 112, 10); b.foe('archer', 115, 7); b.foe('cultist', 114, 4);
  b.gem(114, 12); b.gem(116, 5); b.gem(114, 1);
  b.foe('slime', 122); b.foe('slime', 125); b.foe('barrel', 128); b.foe('bomber', 130);
  // ---- fortress: ground hall, upper hall, roof
  b.stone(132, 133, 6, 15); b.stone(147, 148, 6, 15); b.stone(132, 148, 5);
  b.wood(134, 146, 12); b.wood(134, 146, 9);
  b.foe('archer', 136, 12); b.foe('archer', 142, 12);
  b.foe('brute', 140, G); b.foe('barrel', 138, G); b.foe('barrel', 139, G); b.foe('barrel', 144, G); b.foe('bomber', 143, G);
  b.foe('archer', 137, 9); b.foe('bomber', 144, 9); b.gem(140, 8);
  b.foe('brute', 140, 5); b.foe('bat', 144, 2);
  b.gem(140, 11); b.gem(141, 11);
  b.torch(152, G);
  b.iron(158, 158, 14);                                // stepping stone
  // ---- approach & boss arena
  b.ground(161, 238, G);
  b.foe('cultist', 168, 11); b.foe('archer', 172, G); b.foe('bomber', 175, G);
  b.gem(170, 14); b.gem(172, 13); b.gem(174, 14);
  b.stone(164, 166, 12); b.stone(168, 170, 9); b.gem(169, 8);
  b.torch(182, G);
  b.stone(200, 200, 14, 15); b.stone(214, 214, 14, 15);
  b.wood(204, 208, 12); b.wood(220, 224, 11);
  b.wall(239);

  return b.finish({
    id: 0, name: 'MOONLIT RAMPARTS', theme: 'night', next: 7,
    portal: { x: 232 * TILE, y: G * TILE - 48, sealed: true },
    start: { x: 5 * TILE + 4, y: G * TILE - 18 },
    boss: { type: 'warden', cx: 224 * TILE, feet: G * TILE, gate: { x0: 188, x1: 188, y0: 0, y1: 15 }, trigger: { x0: 192 * TILE, y0: 0, x1: 240 * TILE, y1: 18 * TILE }, arenaL: 189 * TILE, arenaR: 238 * TILE },
  });
}

/* ======================= LEVEL 2 — FROST PEAKS ======================= */
function peaks() {
  const b = builder(200, 18);
  b.wall(0);
  // ---- foothills: icicle overhang
  b.ground(1, 22, 15);
  b.torch(3);
  b.gem(7, 13); b.gem(8, 12); b.gem(9, 13);
  b.stone(11, 18, 11, 12);
  b.icicle(12, 12); b.icicle(14, 12); b.icicle(16, 12); b.icicle(18, 12);
  b.foe('slime', 14, 15); b.foe('slime', 20, 15); b.gem(15, 10);
  b.foe('bat', 20, 10);
  b.iron(23, 26, 15);                                  // iron bridge over a pit too wide to jump
  // ---- first cliff (icy steps)
  b.ground(27, 39, 15);
  b.ice(35, 36, 14); b.ice(37, 38, 13);
  b.ground(40, 60, 12);
  b.ice(50, 56, 12);                                   // slippery ice field
  b.torch(41, 12);
  b.foe('archer', 44, 12); b.foe('barrel', 47, 12); b.foe('bomber', 53, 12);
  b.foe('bat', 55, 8);
  b.gem(48, 10); b.gem(54, 9);
  b.iron(62, 63, 11);                                  // stepping stone across the chasm
  // ---- second shelf: shelter with icicles
  b.ground(65, 95, 10);
  b.torch(67, 10);
  b.stone(72, 78, 6); b.stone(72, 72, 7, 9);
  b.icicle(74, 6); b.icicle(76, 6); b.icicle(78, 6);
  b.foe('archer', 75, 10); b.foe('barrel', 77, 10);
  b.foe('cultist', 84, 5);
  b.foe('slime', 88, 10); b.foe('slime', 91, 10);
  b.gem(80, 8); b.gem(82, 7); b.gem(84, 8);
  b.iron(93, 94, 8);                                   // the step up to the great wall
  // ---- the great wall — climb it
  b.ground(96, 120, 6);
  b.torch(98, 6);
  b.foe('archer', 100, 6); b.foe('brute', 108, 6); b.foe('bomber', 116, 6);
  b.stone(110, 114, 2); b.icicle(111, 2); b.icicle(113, 2);
  b.gem(104, 4); b.gem(112, 4);
  b.iron(122, 123, 6);                                 // stepping stone across the chasm
  // ---- plateau with a frozen watchtower
  b.ground(125, 152, 6);
  b.wood(132, 138, 2); b.wood(133, 133, 3, 5); b.wood(137, 137, 3, 5);
  b.icicle(134, 2); b.icicle(136, 2);
  b.foe('archer', 135, 2); b.foe('cultist', 142, 1);
  b.foe('bomber', 145, 6); b.foe('bomber', 148, 6); b.foe('brute', 140, 6); b.foe('barrel', 130, 6);
  b.gem(135, 1); b.gem(144, 3);
  b.torch(151, 6);
  b.iron(154, 155, 6);                                 // stepping stone to the summit
  // ---- the summit
  b.ground(157, 198, 7);
  b.bedrock(157, 198, 8, 16);                          // the summit can be scarred, never dug out
  b.stone(168, 169, 4, 6); b.stone(180, 181, 3, 6); b.stone(191, 192, 4, 6);
  b.wall(199);

  return b.finish({
    id: 3, name: 'FROST PEAKS', theme: 'frost',
    portal: null,
    start: { x: 4 * TILE + 4, y: 15 * TILE - 18 },
    boss: { type: 'moon', cx: 180 * TILE, cy: 2 * TILE, gate: { x0: 158, x1: 158, y0: 0, y1: 6 }, trigger: { x0: 162 * TILE, y0: 0, x1: 200 * TILE, y1: 18 * TILE }, arenaL: 159 * TILE, arenaR: 198 * TILE, hoverY: 40 },
  });
}

/* ======================= LEVEL 2 — SUNKEN CATHEDRAL ======================= */
function sunken() {
  const b = builder(200, 18), G = 16;
  b.wall(0);
  b.ground(1, 198, G);
  b.torch(3);
  // ---- first nave: pews, pillars, a gallery on the arch
  b.wood(8, 10, 15); b.wood(14, 16, 15); b.wood(20, 22, 15);
  b.gem(9, 13); b.gem(15, 13); b.gem(21, 13);
  b.foe('slime', 12); b.foe('slime', 18); b.foe('bat', 24, 12);
  b.stone(26, 27, 6, 11); b.stone(38, 39, 6, 11); b.stone(26, 39, 5);
  b.wood(28, 37, 10); b.gems(29, 36, 9, 2);
  b.foe('archer', 30, 5); b.foe('archer', 35, 5); b.foe('archer', 33, 10); b.foe('barrel', 32, G);
  // ---- the drowned altar
  b.torch(44, G);
  b.stone(48, 60, 14, 15); b.stone(52, 56, 13);
  b.foe('brute', 54, 13); b.foe('barrel', 49, 14); b.foe('barrel', 59, 14);
  // ---- bell tower (walk under it, or climb it)
  b.stone(64, 65, 3, 11); b.stone(75, 76, 3, 11); b.stone(64, 76, 2); b.wood(66, 74, 9); b.wood(66, 74, 6);
  b.foe('cultist', 70, 4); b.foe('archer', 70, 9); b.foe('bomber', 72, G); b.gem(70, 7); b.gem(70, 4);
  // ---- flooded crypt tunnel
  b.stone(84, 98, 6, 12);
  b.foe('bat', 88, 14); b.foe('bat', 94, 14); b.gems(86, 96, 14, 3);
  b.torch(102, G);
  // ---- second nave
  b.stone(110, 111, 6, 11); b.stone(124, 125, 6, 11); b.stone(110, 125, 5); b.wood(112, 123, 11);
  b.foe('archer', 114, 5); b.foe('archer', 121, 5); b.foe('bomber', 117, 11); b.foe('cultist', 118, 8);
  b.gems(113, 122, 10, 3);
  b.wood(132, 134, 15); b.wood(140, 142, 15);
  b.foe('slime', 137); b.foe('brute', 146); b.foe('barrel', 150, G); b.foe('bomber', 154);
  b.stone(150, 152, 9); b.stone(156, 158, 12); b.gem(151, 8); b.gem(157, 11);
  b.torch(162, G);
  // ---- the organ loft
  // drifting jellies & harpoon divers
  for (const [x, y] of [[18, 12], [44, 11], [90, 13], [95, 14], [130, 12], [152, 10]]) b.foe('jelly', x, y);
  for (const x of [35, 80, 106, 145]) b.foe('diver', x, G);
  b.wood(172, 176, 12); b.wood(178, 182, 8); b.wood(184, 188, 12);
  b.wall(199);
  return { ...b.finish({
    id: 1, name: 'SUNKEN CATHEDRAL', theme: 'sunken',
    portal: { x: 194 * TILE, y: G * TILE - 48, sealed: true },
    start: { x: 5 * TILE + 4, y: G * TILE - 18 },
    boss: { type: 'organist', cx: 190 * TILE, cy: 5 * TILE, gate: { x0: 166, x1: 166, y0: 0, y1: 15 }, trigger: { x0: 170 * TILE, y0: 0, x1: 200 * TILE, y1: 18 * TILE }, arenaL: 167 * TILE, arenaR: 198 * TILE },
  }), water: { base: 13 * TILE, amp: 34, period: 14 } };
}

/* ======================= LEVEL 3 — CLOCKWORK TOWER ======================= */
function clockwork() {
  const b = builder(36, 40), F = 38;
  b.wall(0); b.wall(35);
  b.ground(1, 34, F);
  b.torch(3, F);
  // ground hall → floor 1 (row 33, opening on the right)
  b.foe('slime', 12, F); b.foe('barrel', 20, F); b.foe('archer', 31, F);
  b.iron(1, 24, 33); b.mover(28, 37, 28, 33, 3, 4);   // tower floors are iron: you climb them, you can't dig through them
  b.gem(8, 36); b.gem(16, 36);
  // floor 1 → floor 2 (row 28, opening on the left)
  b.foe('archer', 18, 33); b.foe('bomber', 10, 33); b.gems(4, 8, 31, 2);
  b.iron(11, 34, 28); b.mover(4, 32, 4, 28, 3, 4);
  b.torch(22, 33);
  // floor 2 → floor 3
  b.foe('brute', 20, 28); b.foe('archer', 31, 28); b.foe('barrel', 26, 28);
  b.iron(1, 24, 23); b.mover(28, 27, 28, 23, 3, 3.5);
  b.gem(15, 26); b.gem(29, 21);
  // floor 3 → floor 4
  b.foe('archer', 8, 23); b.foe('bomber', 16, 23); b.foe('cultist', 12, 20);
  b.iron(11, 34, 18); b.mover(4, 22, 4, 18, 3, 3.5);
  b.torch(3, 23);
  // floor 4 → floor 5
  b.foe('archer', 14, 18); b.foe('archer', 30, 18); b.foe('brute', 24, 18); b.foe('barrel', 20, 18);
  b.iron(1, 24, 13); b.mover(28, 17, 28, 13, 3, 3);
  b.gems(14, 22, 16, 4);
  // floor 5 → the clock chamber
  b.foe('bomber', 10, 13); b.foe('archer', 18, 13); b.foe('cultist', 20, 10);
  b.torch(4, 13);
  b.iron(1, 26, 9); b.iron(32, 34, 9); b.mover(28, 12, 28, 9, 3, 3);
  // wind-up soldiers march every floor; cog drones hum above
  for (const [x, row] of [[8, 38], [22, 33], [18, 28], [14, 23], [26, 18], [8, 13]]) b.foe('tinsoldier', x, row);
  for (const [x, y] of [[16, 30], [20, 25], [18, 20], [12, 15]]) b.foe('drone', x, y);
  b.stone(4, 7, 5); b.stone(28, 31, 5);
  b.bedrock(1, 34, 0);                                  // the chamber's ceiling — the Widow walks on it
  return b.finish({
    id: 2, name: 'CLOCKWORK TOWER', theme: 'clock',
    portal: { x: 16 * TILE, y: 9 * TILE - 48, sealed: true },
    start: { x: 3 * TILE + 4, y: F * TILE - 18 },
    boss: { type: 'widow', cx: 18 * TILE, cy: 1 * TILE + 11, floorY: 9 * TILE, ceilY: 1 * TILE, gate: { x0: 27, x1: 31, y0: 9, y1: 9 }, trigger: { x0: 0, y0: 0, x1: 36 * TILE, y1: 9 * TILE - 4 }, arenaL: 1 * TILE, arenaR: 35 * TILE },
  });
}

/* ======================= LEVEL 5 — THE MOON'S SURFACE ======================= */
function lunar() {
  const b = builder(210, 18);
  b.wall(0);
  const chasms = [[40, 47], [88, 96], [140, 146]];
  const inChasm = x => chasms.some(([a, c]) => x >= a && x <= c);
  const craters = [[18, 3], [62, 4], [112, 3], [160, 4]];                 // [centre, radius]
  for (let x = 1; x < 180; x++) {
    if (inChasm(x)) continue;
    let top = 13 + Math.round(1.6 * Math.sin(x * 0.15) + 1.1 * Math.sin(x * 0.37 + 1));
    for (const [c, r] of craters) if (Math.abs(x - c) <= r) top += Math.round(2.2 * (1 - Math.abs(x - c) / (r + 1)));
    b.ground(x, x, Math.min(15, top));
  }
  b.torch(3);
  const lid = x => b.surface(x);
  // spires with archers, floating asteroids with gems
  for (const [x, h] of [[26, 4], [72, 5], [120, 4], [168, 5]]) { b.stone(x, x + 1, lid(x) - h, lid(x) - 1); b.foe('archer', x, lid(x)); }
  for (const [x, y, w] of [[42, 9, 3], [45, 6, 2], [90, 12, 3], [94, 5, 2], [141, 12, 3], [36, 6, 2], [100, 4, 3], [150, 5, 3]]) { (x > 40 && x < 48 || x > 88 && x < 97 || x > 140 && x < 147 ? b.iron : b.stone)(x, x + w - 1, y); b.gem(x + 1, y - 1); }   // chasm stepping stones are iron, and low enough (≤3 tiles up) for a single jump
  for (const x of [12, 30, 55, 66, 80, 104, 126, 134, 156, 172]) b.foe(['slime', 'bomber', 'brute', 'slime', 'bomber'][x % 5], x);
  for (const [x, y] of [[50, 6], [98, 7], [130, 5], [175, 6]]) b.foe(x % 2 ? 'cultist' : 'bat', x, y);
  b.foe('barrel', 58); b.foe('barrel', 116); b.foe('barrel', 164);
  for (const x of [22, 52, 76, 102, 124, 152, 171]) b.foe('hopper', x);
  for (const [x, y] of [[34, 8], [68, 7], [108, 6], [148, 7], [165, 8]]) b.foe('sentry', x, y);
  for (const [x, y] of [[60, 5], [118, 4], [160, 5]]) b.foe('ufo', x, y);
  for (const x of [30, 84, 132, 157]) b.foe('egg', x);
  b.torch(84); b.torch(136); b.torch(176);
  // the arena — a flat mare under the Earth
  b.ground(180, 208, 13);
  b.stone(188, 190, 9); b.stone(198, 200, 9);
  b.wall(209);
  return { ...b.finish({
    id: 4, name: 'MOON SURFACE', theme: 'lunar',
    portal: null,
    start: { x: 5 * TILE + 4, y: b.surface(5) * TILE - 18 },
    boss: { type: 'eclipse', cx: 203 * TILE, feet: 13 * TILE, gate: { x0: 180, x1: 180, y0: 0, y1: 12 }, trigger: { x0: 184 * TILE, y0: 0, x1: 210 * TILE, y1: 18 * TILE }, arenaL: 181 * TILE, arenaR: 208 * TILE },
  }), grav: 0.45, jumpMul: 0.82 };
}

/* ======================= DUEL ARENAS — one screen (16×9), terrain can't be destroyed ======================= */
/** The Courtyard: a floor you can't fall off, two ledges, one small crown ledge on top. */
function duelCourtyard() {
  const b = builder(24, 14);
  b.stone(0, 23, 12, 13);                               // the floor
  b.wood(2, 7, 9); b.wood(16, 21, 9);                   // tier 2: two ledges (a full body of headroom beneath)
  b.stone(10, 13, 6);                                   // tier 3: the crown, smaller, in the middle
  return b.finish({ id: 5, name: 'THE COURTYARD', theme: 'night', portal: null, duel: true, solid: true,
    start: { x: 3 * TILE + 4, y: 12 * TILE - 18 }, spawns: [{ x: 3 * TILE + 4, y: 12 * TILE - 18 }, { x: 20 * TILE + 4, y: 12 * TILE - 18 }] });
}
/** Above the Clouds: no floor — miss a jump and you fall to your death. */
function duelClouds() {
  const b = builder(24, 14);
  b.stone(1, 5, 9); b.stone(18, 22, 9);                 // home clouds
  b.stone(8, 15, 7);                                    // the big middle cloud
  b.stone(6, 7, 11); b.stone(16, 17, 11);               // low stepping puffs
  b.stone(4, 6, 5); b.stone(17, 19, 5);                 // high puffs
  b.stone(11, 12, 3);                                   // the summit puff
  return b.finish({ id: 6, name: 'ABOVE THE CLOUDS', theme: 'sky', portal: null, duel: true, solid: true,
    start: { x: 3 * TILE + 4, y: 9 * TILE - 18 }, spawns: [{ x: 3 * TILE + 4, y: 9 * TILE - 18 }, { x: 20 * TILE + 4, y: 9 * TILE - 18 }] });
}
export const DUEL_LEVELS = [5, 6];

/* ======================= HOLLOW GROVE — the old wood between the castle and the cathedral ======================= */
function grove() {
  const b = builder(220, 18), G = 16;
  b.wall(0);
  b.ground(1, 218, G);
  b.torch(3);
  b.gem(7, 14); b.gem(8, 13); b.gem(9, 14);
  // ---- Oak A: climb the springy branches to its crown; a crystal sleeps in the hollow trunk
  b.wood(16, 18, 5, 15);
  b.branch(19, 23, 13, 'l'); b.branch(11, 15, 9, 'r'); b.branch(19, 24, 5, 'l');
  b.wood(12, 22, 4);
  b.gem(21, 12); b.gem(13, 8); b.gems(14, 20, 3, 2);
  b.foe('squirrel', 26); b.foe('slime', 30);
  // ---- the knoll and the first walking tree
  b.stone(36, 44, 14, 15);
  b.foe('squirrel', 40, 14); b.gem(40, 12);
  b.torch(47, G);
  b.foe('treant', 52);
  // ---- Oak B: a wasp nest under its crown, an archer on top
  b.wood(58, 60, 4, 15);
  b.branch(53, 57, 13, 'r'); b.branch(61, 66, 10, 'l'); b.branch(52, 57, 7, 'r');
  b.wood(55, 68, 3);
  b.foe('nest', 66, 4); b.foe('archer', 63, 3);
  b.gems(56, 67, 2, 3); b.gem(64, 9);
  // ---- a fallen log (hop it or blast it), then the deep wood
  b.wood(74, 82, 14, 15);
  b.gems(75, 81, 13, 2);
  b.foe('bat', 84, 10); b.foe('treant', 88); b.foe('squirrel', 94);
  // ---- Oak C
  b.wood(98, 100, 6, 15);
  b.branch(92, 97, 12, 'r'); b.branch(101, 106, 9, 'l');
  b.wood(95, 104, 5);
  b.foe('nest', 97, 6); b.gems(96, 103, 4, 3);
  b.torch(108, G);
  // ---- THE GREAT HOLLOW: a giant trunk with chambers stacked inside — blast your way up
  b.wood(124, 130, 1, 15);
  b.clear(124, 125, 13, 15); b.clear(126, 128, 12, 15);                  // a doorway into the root chamber
  b.clear(126, 128, 8, 10); b.clear(126, 128, 4, 6);                      // chambers above (blast the floors)
  b.gem(127, 14); b.gem(127, 10); b.gem(127, 6); b.gem(127, 0);
  b.foe('squirrel', 127, 16);
  b.branch(131, 137, 13, 'l'); b.branch(117, 123, 10, 'r'); b.branch(131, 136, 7, 'l'); b.branch(118, 123, 4, 'r');
  b.foe('archer', 126, 1); b.foe('nest', 134, 9);
  b.foe('treant', 142);
  b.torch(146, G);
  // ---- approach
  b.stone(156, 160, 14, 15); b.gem(158, 12);
  b.foe('treant', 154); b.foe('squirrel', 158, 14); b.foe('bat', 164, 9); b.foe('squirrel', 168);
  b.torch(172, G);
  // ---- the Elder Stag's clearing
  b.wood(182, 188, 11); b.wood(207, 213, 11);
  b.branch(193, 202, 7, 'l');
  b.wall(219);
  return b.finish({
    id: 7, name: 'HOLLOW GROVE', theme: 'woodland', next: 1,
    portal: { x: 214 * TILE, y: G * TILE - 48, sealed: true },
    start: { x: 5 * TILE + 4, y: G * TILE - 18 },
    boss: { type: 'stag', cx: 204 * TILE, feet: G * TILE, gate: { x0: 176, x1: 176, y0: 0, y1: 15 }, trigger: { x0: 180 * TILE, y0: 0, x1: 219 * TILE, y1: 18 * TILE }, arenaL: 177 * TILE, arenaR: 218 * TILE },
  });
}

export const LEVELS = [ramparts, sunken, clockwork, peaks, lunar, duelCourtyard, duelClouds, grove];
export const buildLevel = i => LEVELS[i]();
