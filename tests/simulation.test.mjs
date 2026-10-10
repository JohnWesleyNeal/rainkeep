import test from "node:test";
import assert from "node:assert/strict";
import {
  SIZE,
  LIMIT,
  SPAWN_ALTITUDE,
  SHAPES,
  QUAKE_LIMIT,
  createGame,
  cells,
  piece,
  applyPiece,
  flow,
  waterTotal,
  restore,
  tick,
  accelerateDrop,
  landingHeight,
  lakes,
  bonuses,
  landMass,
  explode,
  freezeLake,
  smartBomb,
  fallDuration,
} from "../src/simulation.js";
const index = (x, y) => y * SIZE + x;
const use = (s, type, shape = 2, rotation = 0) => {
  s.current = { type, shape, rotation };
};
function fill(s, x, y, width, height, depth) {
  for (let dy = 0; dy < height; dy++)
    for (let dx = 0; dx < width; dx++) s.water[index(x + dx, y + dy)] = depth;
}
function land(s, aim = { x: 8, y: 8 }) {
  accelerateDrop(s);
  let event;
  for (let n = 0; n < 60 && !event; n++) event = tick(s, 1 / 30, aim);
  return event;
}
test("Classic starts flat and dry; practice has a demonstration lake", () => {
  const s = createGame();
  assert.equal(s.mode, "classic");
  assert.equal(waterTotal(s), 0);
  assert.equal(landMass(s), 0);
  assert.equal(s.spill, 0);
  assert.equal(s.current.type, "raise");
  assert.ok(waterTotal(createGame("daydream")) > 0);
});
test("opening gives time to build enclosures before water, then introduces downers, fire and bombs", () => {
  const s = createGame("classic", 42);
  assert.ok(
    Array.from({ length: 12 }, (_, i) => piece(s, i)).every(
      (p) => p.type === "raise",
    ),
  );
  assert.equal(piece(s, 12).type, "rain");
  assert.equal(piece(s, 14).type, "lower");
  assert.equal(piece(s, 16).type, "sun");
  assert.equal(piece(s, 18).type, "bomb");
});
test("fine offsets allow partial overlaps instead of coarse tile snapping", () => {
  const s = createGame("daydream", 42);
  s.terrain.fill(0);
  s.water.fill(0);
  use(s, "raise");
  applyPiece(s, 8, 8);
  use(s, "raise");
  applyPiece(s, 9, 8);
  assert.equal(s.terrain[index(8, 8)], 1.4);
  assert.equal(s.terrain[index(9, 8)], 2.8);
  assert.equal(s.terrain[index(12, 8)], 1.4);
});
test("every Upper/Downer rotation has a normalized unique footprint, including ring and long bank", () => {
  for (let shape = 0; shape < SHAPES.length; shape++)
    for (let rotation = 0; rotation < 4; rotation++) {
      const p = cells({ type: "raise", shape, rotation });
      assert.equal(Math.min(...p.map((v) => v[0])), 0);
      assert.equal(Math.min(...p.map((v) => v[1])), 0);
      assert.equal(new Set(p.map(String)).size, p.length);
    }
  assert.equal(cells({ type: "sun", shape: 7, rotation: 0 }).length, 1);
});
test("invalid placement is atomic", () => {
  const s = createGame(),
    before = JSON.stringify(s);
  assert.equal(applyPiece(s, -1, 5), null);
  assert.equal(JSON.stringify(s), before);
});
test("water remains inside a closed practice lake", () => {
  const s = createGame("daydream"),
    initial = waterTotal(s);
  for (let i = 0; i < 600; i++) flow(s);
  assert.ok(Math.abs(waterTotal(s) - initial) < 1e-8);
  assert.equal(s.spill, 0);
});
test("flow conserves water including drain and never creates negative depths", () => {
  const s = createGame("classic", 42);
  s.water = Array.from({ length: SIZE * SIZE }, (_, i) => ((i * 17) % 23) / 5);
  const initial = waterTotal(s);
  for (let i = 0; i < 300; i++) flow(s);
  assert.ok(Math.abs(waterTotal(s) + s.spill - initial) < 1e-7);
  assert.ok(s.water.every((w) => w >= 0));
  assert.ok(s.spill > 0);
});
test("downers flatten all targets to the lowest terrain, and do nothing to dry flat land", () => {
  const s = createGame();
  use(s, "lower");
  s.terrain[index(8, 8)] = 5;
  s.terrain[index(9, 8)] = 2.8;
  s.terrain[index(10, 8)] = 1.4;
  applyPiece(s, 8, 8);
  assert.equal(s.terrain[index(8, 8)], 0);
  assert.equal(landMass(s), 0);
  use(s, "lower");
  applyPiece(s, 8, 8);
  assert.equal(landMass(s), 0);
});
test("downers erase water and ice without scoring or drain relief", () => {
  const s = createGame();
  fill(s, 8, 8, 4, 4, 2);
  s.ice.fill(10);
  s.spill = 90;
  use(s, "lower");
  applyPiece(s, 8, 8);
  assert.equal(waterTotal(s), 0);
  assert.equal(s.ice[index(8, 8)], 0);
  assert.equal(s.score, 0);
  assert.equal(s.spill, 90);
});
test("bomb punches a leaking hole even in tall terrain; Upper patches the whole puncture", () => {
  const s = createGame();
  s.terrain.fill(6);
  explode(s, 12, 12);
  assert.ok(s.holes[index(12, 12)]);
  assert.equal(s.terrain[index(12, 12)], 0);
  s.water[index(12, 12)] = 5;
  const initial = waterTotal(s);
  flow(s);
  assert.ok(s.spill > 0);
  assert.ok(Math.abs(waterTotal(s) + s.spill - initial) < 1e-8);
  s.terrain.fill(0);
  use(s, "raise");
  const e = applyPiece(s, 12, 12);
  assert.ok(e.repaired > 1);
  assert.ok(s.holes.every((h) => !h));
  assert.equal(s.terrain[index(12, 12)], 0);
});
test("downer touching a hole expands it; bombing an existing hole queues three falling bombs", () => {
  const s = createGame();
  s.holes[index(8, 8)] = true;
  use(s, "lower");
  applyPiece(s, 8, 8);
  assert.ok(s.holes[index(11, 11)]);
  explode(s, 8, 8);
  assert.equal(s.hazards.length, 3);
  assert.ok(
    s.hazards.every((h) => h.type === "bomb" && h.altitude === SPAWN_ALTITUDE),
  );
});
test("fire evaporates an entire connected lake, leaves a disconnected lake, and lowers drain", () => {
  const s = createGame();
  fill(s, 3, 3, 4, 4, 2);
  fill(s, 20, 20, 4, 4, 1);
  s.spill = 80;
  use(s, "sun");
  const e = applyPiece(s, 3, 3);
  assert.equal(e.removed, 32);
  assert.equal(waterTotal(s), 16);
  assert.equal(s.spill, 48);
  assert.equal(e.multiplier, 2);
  assert.equal(s.score, 1280);
});
test("dry fire lowers land but never creates a hole", () => {
  const s = createGame();
  s.terrain.fill(4);
  use(s, "sun");
  applyPiece(s, 8, 8);
  assert.ok(s.terrain[index(8, 8)] < 4);
  assert.ok(s.holes.every((h) => !h));
});
test("Water adds known volume and does not splash straight through an enclosing wall", () => {
  const s = createGame("daydream");
  use(s, "rain");
  const before = waterTotal(s);
  applyPiece(s, 10, 10);
  assert.ok(Math.abs(waterTotal(s) - before - 72) < 1e-8);
  assert.equal(s.water[index(9, 10)], 0);
});
test("lake, deep duck, level and rainbow bonuses combine before evaporation", () => {
  const s = createGame();
  fill(s, 3, 3, 10, 10, 3);
  fill(s, 20, 20, 8, 8, 3);
  s.level = 2;
  const b = bonuses(s);
  assert.equal(b.lakes, 2);
  assert.equal(b.ducks, 2);
  assert.equal(b.rainbow, true);
  assert.equal(b.multiplier, 160);
  use(s, "sun");
  const e = applyPiece(s, 3, 3);
  assert.equal(e.earned, 300 * 20 * 160);
  assert.equal(bonuses(s).rainbow, false);
});
test("too much land triggers a damaging earthquake, while water adds no land pressure", () => {
  const s = createGame("classic", 42);
  s.terrain.fill(0.71);
  assert.ok(landMass(s) > QUAKE_LIMIT);
  fill(s, 2, 2, 4, 4, 8);
  use(s, "raise");
  const e = applyPiece(s, 8, 8);
  assert.equal(e.quake, true);
  assert.equal(s.quakes, 1);
  assert.ok(landMass(s) < QUAKE_LIMIT);
  assert.ok(s.holes.every((h) => !h));
});
test("ice freezes a connected lake and stops flow, then fire thaws without evaporating", () => {
  const s = createGame();
  fill(s, 4, 4, 4, 4, 2);
  freezeLake(s, 4, 4);
  const before = waterTotal(s);
  for (let n = 0; n < 60; n++) flow(s);
  assert.equal(waterTotal(s), before);
  assert.equal(s.spill, 0);
  use(s, "sun");
  const e = applyPiece(s, 4, 4);
  assert.equal(e.removed, 0);
  assert.equal(waterTotal(s), before);
  assert.equal(s.ice[index(4, 4)], 0);
});
test("ice on dry land earns a bonus; frozen water is excluded from rainbow and ducks", () => {
  const s = createGame();
  freezeLake(s, 4, 4);
  assert.equal(s.score, 250);
  fill(s, 3, 3, 15, 15, 3);
  freezeLake(s, 4, 4);
  assert.equal(bonuses(s).rainbow, false);
  assert.equal(bonuses(s).ducks, 0);
});
test("fire detonates a mine instead of evaporating its lake", () => {
  const s = createGame();
  fill(s, 3, 3, 8, 8, 2);
  s.mines.push({ i: index(6, 6), ttl: 20 });
  const before = waterTotal(s);
  use(s, "sun");
  applyPiece(s, 4, 4);
  assert.equal(waterTotal(s), before);
  assert.equal(s.mines.length, 0);
  assert.equal(s.holes[index(6, 6)], true);
});
test("five lakes at level-up award a Smart bomb that resets the board while preserving score", () => {
  const s = createGame();
  for (const [x, y] of [
    [3, 3],
    [12, 3],
    [21, 3],
    [3, 12],
    [12, 12],
  ])
    fill(s, x, y, 3, 3, 1);
  s.elapsed = 119.99;
  s.score = 1234;
  tick(s, 0.02);
  assert.equal(s.level, 2);
  assert.equal(s.smartBombs, 1);
  assert.ok(fallDuration(s) < 8);
  s.holes[0] = true;
  s.spill = 40;
  assert.equal(smartBomb(s), true);
  assert.equal(s.score, 1234);
  assert.equal(s.spill, 0);
  assert.equal(waterTotal(s), 0);
  assert.equal(landMass(s), 0);
  assert.equal(smartBomb(s), false);
});
test("later Classic levels spawn visible ice and mine hazards; ambient rain starts after the build phase", () => {
  const s = createGame("classic", 42);
  s.elapsed = 121;
  s.iceClock = 24;
  tick(s, 1 / 30);
  assert.ok(s.hazards.some((h) => h.type === "ice"));
  s.elapsed = 361;
  s.mineClock = 30;
  fill(s, 8, 8, 8, 8, 2);
  tick(s, 1 / 30);
  assert.ok(s.hazards.some((h) => h.type === "mine"));
  const a = createGame();
  a.elapsed = 56;
  a.turn = 12;
  tick(a, 0.25);
  assert.equal(waterTotal(a) + a.spill, 0);
  assert.ok(a.weather && a.weather.clock < 26);
  a.weather.clock = 26;
  tick(a, 0.25);
  assert.ok(waterTotal(a) + a.spill > 0);
});
test("Classic falls naturally while practice suspends; Drop changes terrain only on contact", () => {
  const a = createGame(),
    b = createGame("daydream");
  tick(a, 1);
  tick(b, 1);
  assert.ok(a.altitude < SPAWN_ALTITUDE);
  assert.equal(b.altitude, SPAWN_ALTITUDE);
  const before = [...b.terrain];
  accelerateDrop(b);
  tick(b, 1 / 30);
  assert.deepEqual(b.terrain, before);
  assert.equal(land(b).type, "raise");
  assert.notDeepEqual(b.terrain, before);
  let e;
  for (let i = 0; i < 260 && !e; i++) e = tick(a, 1 / 30);
  assert.equal(e.type, "raise");
});
test("moving a descending piece onto a high bank makes contact earlier", () => {
  const s = createGame();
  s.terrain[index(8, 8)] = 3;
  s.altitude = 2;
  assert.equal(landingHeight(s, { x: 8, y: 8 }), 3);
  assert.equal(tick(s, 1 / 30).type, "raise");
});
test("drain overflow ends the run and later ticks do not mutate it", () => {
  const s = createGame();
  s.spill = LIMIT;
  tick(s, 1 / 30);
  assert.equal(s.over, true);
  const before = JSON.stringify(s);
  tick(s, 1);
  assert.equal(JSON.stringify(s), before);
});
test("mid-fall, frozen water, hazards and deterministic future play survive save restoration", () => {
  const a = createGame("classic", 123);
  fill(a, 3, 3, 8, 8, 1);
  freezeLake(a, 3, 3);
  explode(a, 25, 25);
  explode(a, 25, 25);
  a.aim = { x: 8, y: 8 };
  tick(a, 1 / 30);
  accelerateDrop(a);
  const b = restore(JSON.stringify(a));
  assert.ok(b);
  for (let i = 0; i < 100; i++) {
    tick(a, 1 / 30);
    tick(b, 1 / 30);
  }
  assert.deepEqual(a, b);
});
test("legacy 16-cell saves migrate geometrically without losing score, aim, water or queue", () => {
  const old = {
    version: 1,
    mode: "classic",
    seed: 123,
    terrain: Array(256).fill(0.15),
    water: Array(256).fill(0),
    spill: 12,
    score: 321,
    turn: 5,
    elapsed: 10,
    remaining: 6,
    altitude: 3.5,
    dropping: true,
    over: false,
    current: { type: "raise", shape: 2, rotation: 0 },
    next: { type: "rain", shape: 3, rotation: 0 },
    aim: { x: 6, y: 7 },
  };
  old.water[6 * 16 + 7] = 1.2;
  const s = restore(old);
  assert.equal(s.version, 3);
  assert.equal(s.score, 321);
  assert.equal(s.spill / LIMIT, old.spill / 80);
  assert.deepEqual(s.aim, { x: 12, y: 14 });
  assert.deepEqual(s.current, old.current);
  assert.deepEqual(s.next, old.next);
  assert.equal(waterTotal(s), 1.2 * 8);
  assert.equal(s.terrain[index(0, 0)], 0.3);
  assert.equal(s.altitude, 7);
  assert.equal(s.dropping, true);
  assert.equal(old.version, 1);
  delete old.altitude;
  delete old.dropping;
  assert.ok(restore(old));
});
test("corrupt and malformed extended saves are rejected", () => {
  assert.equal(restore("{"), null);
  for (const mutate of [
    (s) => (s.water[0] = -1),
    (s) => s.terrain.pop(),
    (s) => (s.current.type = "__proto__"),
    (s) => (s.current.rotation = 8),
    (s) => (s.score = Infinity),
    (s) => (s.mode = "unknown"),
    (s) => (s.altitude = -1),
    (s) => (s.dropping = "yes"),
    (s) => (s.holes[0] = 1),
    (s) => (s.ice[0] = -1),
    (s) => (s.smartBombs = 100),
    (s) => (s.hazards = [{ type: "bomb", x: 100, y: 1, altitude: 3 }]),
    (s) => (s.mines = [{ i: 1, ttl: -1 }]),
  ]) {
    const s = createGame();
    mutate(s);
    assert.equal(restore(s), null);
  }
});
