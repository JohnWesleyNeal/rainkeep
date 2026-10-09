import test from "node:test";
import assert from "node:assert/strict";
import {
  SIZE,
  LIMIT,
  createGame,
  cells,
  applyPiece,
  flow,
  waterTotal,
  restore,
  tick,
  SPAWN_ALTITUDE,
  accelerateDrop,
  landingHeight,
} from "../src/simulation.js";
test("water stays in the starter lake at equilibrium", () => {
  const s = createGame();
  const initial = waterTotal(s);
  for (let i = 0; i < 600; i++) flow(s);
  assert.ok(Math.abs(waterTotal(s) - initial) < 1e-8);
  assert.equal(s.spill, 0);
});
test("flow conserves water including overflow and never creates negative depths", () => {
  const s = createGame("classic", 42);
  s.water = Array.from({ length: 256 }, (_, i) => ((i * 17) % 23) / 5);
  const initial = waterTotal(s);
  for (let i = 0; i < 900; i++) flow(s);
  assert.ok(Math.abs(waterTotal(s) + s.spill - initial) < 1e-7);
  assert.ok(s.water.every((w) => w >= 0));
  assert.ok(s.spill > 0);
});
test("breaching a bank releases water", () => {
  const s = createGame();
  for (let n = 0; n < 2; n++) {
    s.current = { type: "lower", shape: 1, rotation: 1 };
    applyPiece(s, 4, 6);
  }
  for (let i = 0; i < 900; i++) flow(s);
  assert.ok(s.spill > 1);
  assert.ok(waterTotal(s) < 15);
});
test("rain adds known volume; sun removes nearby water and rewards points", () => {
  const s = createGame();
  s.current = { type: "rain", shape: 2, rotation: 0 };
  const initial = waterTotal(s);
  applyPiece(s, 6, 6);
  assert.ok(Math.abs(waterTotal(s) - initial - 11.2) < 1e-8);
  s.current = { type: "sun", shape: 2, rotation: 0 };
  const result = applyPiece(s, 6, 6);
  assert.ok(result.removed > 11);
  assert.ok(s.score > 1000);
  assert.ok(waterTotal(s) < initial);
});
test("invalid placement is atomic; every shape rotation fits a normalized box", () => {
  const s = createGame("daydream", 42),
    before = JSON.stringify(s);
  assert.equal(applyPiece(s, -1, 5), null);
  assert.equal(JSON.stringify(s), before);
  for (let shape = 0; shape < 5; shape++)
    for (let rotation = 0; rotation < 4; rotation++) {
      const p = cells({ shape, rotation });
      assert.equal(Math.min(...p.map((v) => v[0])), 0);
      assert.equal(Math.min(...p.map((v) => v[1])), 0);
      assert.equal(new Set(p.map(String)).size, p.length);
    }
});
test("run serialization preserves deterministic queue and simulation", () => {
  const a = createGame("classic", 123),
    b = restore(JSON.stringify(a));
  for (let i = 0; i < 60; i++) {
    applyPiece(a, 6, 6);
    applyPiece(b, 6, 6);
    for (let f = 0; f < 10; f++) {
      tick(a, 1 / 30);
      tick(b, 1 / 30);
    }
  }
  assert.deepEqual(a, b);
});
test("corrupt and hostile saves are rejected", () => {
  assert.equal(restore("{"), null);
  for (const mutation of [
    (s) => (s.water[0] = -1),
    (s) => s.terrain.pop(),
    (s) => (s.current.type = "__proto__"),
    (s) => (s.current.rotation = 8),
    (s) => (s.score = Infinity),
    (s) => (s.remaining = 99),
    (s) => (s.mode = "unknown"),
    (s) => (s.over = "no"),
    (s) => (s.altitude = -1),
    (s) => (s.dropping = "yes"),
  ]) {
    const s = createGame();
    mutation(s);
    assert.equal(restore(s), null);
  }
});
test("classic pieces descend while daydream suspends them; overflow ends run", () => {
  const a = createGame("classic"),
    b = createGame();
  tick(a, 1);
  tick(b, 1);
  assert.ok(a.altitude < SPAWN_ALTITUDE);
  assert.equal(b.altitude, SPAWN_ALTITUDE);
  assert.equal(a.turn, 0);
  assert.equal(b.turn, 0);
  a.spill = LIMIT;
  a.water[0] = 3;
  tick(a, 1 / 30);
  assert.equal(a.over, true);
  const before = JSON.stringify(a);
  tick(a, 1);
  assert.equal(JSON.stringify(a), before);
});
test("fast drop accelerates a visible fall and changes terrain only on contact", () => {
  const s = createGame("daydream", 42),
    aim = { x: 6, y: 6 },
    before = [...s.terrain];
  assert.equal(accelerateDrop(s), true);
  assert.equal(accelerateDrop(s), false);
  assert.deepEqual(s.terrain, before);
  assert.equal(tick(s, 1 / 30, aim), undefined);
  assert.ok(s.altitude < SPAWN_ALTITUDE);
  assert.deepEqual(s.terrain, before);
  let event;
  for (let n = 0; n < 30 && !event; n++) event = tick(s, 1 / 30, aim);
  assert.equal(event.type, "raise");
  assert.equal(s.turn, 1);
  assert.notDeepEqual(s.terrain, before);
  assert.equal(s.altitude, SPAWN_ALTITUDE);
  assert.equal(s.dropping, false);
});
test("classic lands naturally at the current footprint without a Drop command", () => {
  const s = createGame("classic", 42),
    aim = { x: 4, y: 4 };
  const before = [...s.terrain];
  let event;
  for (let n = 0; n < 300 && !event; n++) event = tick(s, 1 / 30, aim);
  assert.equal(event.type, "raise");
  assert.notDeepEqual(s.terrain, before);
  assert.ok(s.elapsed < 8);
  assert.equal(s.turn, 1);
});
test("moving a descending piece onto a higher bank makes contact earlier", () => {
  const s = createGame("classic", 42);
  s.altitude = 0.9;
  assert.ok(landingHeight(s, { x: 4, y: 4 }) > 0.9);
  assert.equal(tick(s, 1 / 30, { x: 4, y: 4 }).type, "raise");
});
test("mid-fall saves resume at the same altitude, including a committed fast drop", () => {
  const a = createGame("classic", 42);
  a.aim = { x: 6, y: 6 };
  for (let i = 0; i < 30; i++) tick(a, 1 / 30, a.aim);
  accelerateDrop(a);
  const b = restore(JSON.stringify(a));
  assert.equal(b.altitude, a.altitude);
  assert.equal(b.dropping, true);
  for (let i = 0; i < 12; i++) {
    tick(a, 1 / 30, a.aim);
    tick(b, 1 / 30, b.aim);
  }
  assert.deepEqual(a, b);
});
test("previous-version runs gain descent state without losing their board or queue", () => {
  const old = createGame("classic", 42);
  delete old.altitude;
  delete old.dropping;
  old.remaining = 6;
  old.score = 321;
  const s = restore(JSON.stringify(old));
  assert.equal(s.altitude, SPAWN_ALTITUDE / 2);
  assert.equal(s.score, 321);
  assert.deepEqual(s.current, old.current);
  assert.deepEqual(s.terrain, old.terrain);
});
test("terrain edits are bounded after repeated drops", () => {
  const s = createGame();
  for (let n = 0; n < 40; n++) {
    s.current = { type: "raise", shape: 2, rotation: 0 };
    applyPiece(s, 6, 6);
  }
  assert.equal(s.terrain[6 * SIZE + 6], 4);
  for (let n = 0; n < 40; n++) {
    s.current = { type: "lower", shape: 2, rotation: 0 };
    applyPiece(s, 6, 6);
  }
  assert.equal(s.terrain[6 * SIZE + 6], 0);
});
