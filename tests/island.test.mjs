import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  quakePressure,
  landMass,
  QUAKE_LIMIT,
  applyPiece,
  earthquake,
  tick,
  restore,
  containedLake,
  lakes,
  smartBomb,
} from "../src/simulation.js";
import { leakPaths, evaporationProfile } from "../src/atmosphere.js";

test("earthquake forecast matches capped fractional Uppers and connected-hole repair", () => {
  for (const [x, y, rotation] of [
    [8.23, 10.76, 0],
    [8.91, 10.17, 1],
    [8, 10, 2],
  ]) {
    const s = createGame("classic", 42);
    s.current = { type: "raise", shape: 3, rotation };
    s.terrain[10 * 32 + 9] = 7.7;
    s.holes[11 * 32 + 10] = true;
    s.holes[11 * 32 + 11] = true;
    const forecast = quakePressure(s, { x, y });
    applyPiece(s, x, y);
    assert.ok(Math.abs(forecast.projected * QUAKE_LIMIT - landMass(s)) < 1e-8);
  }
});
test("water and ice add no pressure and non-Uppers have no added forecast", () => {
  const s = createGame("classic", 42);
  s.water.fill(5);
  s.ice.fill(16);
  assert.equal(quakePressure(s, { x: 8, y: 8 }).current, 0);
  s.current = { type: "sun", shape: 2, rotation: 0 };
  assert.deepEqual(quakePressure(s, { x: 8, y: 8 }), {
    current: 0,
    projected: 0,
  });
});
test("quake damage preserves part of the structure and starts a saved recovery window", () => {
  const s = createGame("daydream", 42),
    before = landMass(s);
  const changed = earthquake(s);
  assert.ok(changed.length > 0 && landMass(s) > 0 && landMass(s) < before);
  assert.equal(s.recovery.until, 45);
  assert.equal(s.recovery.rebuilt, false);
  assert.deepEqual(restore(JSON.stringify(s)).recovery, s.recovery);
});
const recovering = () => {
  const s = createGame("daydream", 42);
  s.recovery = { until: 45, damaged: [10 * 32 + 8], rebuilt: false, stable: 0 };
  s.terrain[10 * 32 + 8] = 0.4;
  return s;
};
test("repairing damaged land and holding a liquid enclosure earns one level-scaled recovery bonus", () => {
  const s = recovering();
  s.level = 2;
  s.current = { type: "raise", shape: 2, rotation: 0 };
  applyPiece(s, 8, 10);
  assert.equal(s.recovery.rebuilt, true);
  const before = s.score;
  // Water must first settle around the new bank, then remain safely enclosed.
  for (let n = 0; n < 180; n++) tick(s, 1 / 30, { x: 8, y: 8 });
  assert.equal(s.score - before, 1000);
  assert.equal(s.recovery, null);
  for (let n = 0; n < 120; n++) tick(s, 1 / 30, { x: 8, y: 8 });
  assert.equal(s.score - before, 1000);
});
test("dry, frozen, leaking, and untouched lakes cannot claim recovery", () => {
  for (const kind of ["dry", "frozen", "leak", "untouched"]) {
    const s = recovering();
    s.recovery.rebuilt = kind !== "untouched";
    if (kind === "dry") s.water.fill(0);
    if (kind === "frozen") s.ice.fill(16);
    if (kind === "leak") {
      s.terrain.fill(0);
      s.water.fill(0.8);
    }
    const before = s.score;
    for (let n = 0; n < 90; n++) tick(s, 1 / 30, { x: 8, y: 8 });
    assert.equal(s.score, before, kind);
  }
});

test("recovery requires damaged-ground contact and an uninterrupted hold, which survives saving", () => {
  const s = createGame("daydream", 42);
  s.terrain[4 * 32 + 4] = 0.4;
  s.recovery = { until: 45, damaged: [4 * 32 + 4], rebuilt: false, stable: 0 };
  s.current = { type: "raise", shape: 2, rotation: 0 };
  applyPiece(s, 24, 24);
  assert.equal(s.recovery.rebuilt, false);
  s.current = { type: "raise", shape: 2, rotation: 0 };
  applyPiece(s, 4, 4);
  assert.equal(s.recovery.rebuilt, true);
  for (let n = 0; n < 30; n++) tick(s, 1 / 30, { x: 8, y: 8 });
  assert.ok(s.recovery.stable > 0.9 && s.score === 0);
  const restored = restore(JSON.stringify(s));
  assert.equal(restored.recovery.stable, s.recovery.stable);
  for (let n = 0; n < 30; n++) tick(restored, 1 / 30, { x: 8, y: 8 });
  assert.equal(restored.recovery, null);
  assert.equal(restored.score, 500);
  s.holes[10 * 32 + 10] = true;
  tick(s, 0.1, { x: 8, y: 8 });
  assert.equal(s.recovery.stable, 0);
  assert.equal(s.score, 0);
});
test("containment requires a safe perimeter, volume, and no drain mouth", () => {
  const s = createGame("daydream", 42),
    l = lakes(s)[0];
  assert.equal(containedLake(s, l), true);
  s.terrain[9 * 32 + 10] = 0;
  assert.equal(containedLake(s, l), false);
  s.terrain[9 * 32 + 10] = 2.8;
  s.holes[10 * 32 + 10] = true;
  assert.equal(containedLake(s, l), false);
});
test("recovery expires, resets with Smart bomb, migrates old saves, and rejects corrupt data", () => {
  const s = recovering();
  s.elapsed = 45;
  tick(s, 0.1);
  assert.equal(s.recovery, null);
  s.recovery = recovering().recovery;
  s.smartBombs = 1;
  smartBomb(s);
  assert.equal(s.recovery, null);
  delete s.recovery;
  assert.equal(restore(JSON.stringify(s)).recovery, null);
  for (const r of [
    { until: 999, damaged: [1], rebuilt: false, stable: 0 },
    { until: 45, damaged: [-1], rebuilt: true, stable: 0 },
    { until: 45, damaged: [1], rebuilt: "yes", stable: 0 },
  ]) {
    s.recovery = r;
    assert.equal(restore(JSON.stringify(s)), null);
  }
});
test("leak traces follow wet head gradients to real escape mouths without wrapping rows", () => {
  const s = createGame("classic", 42);
  s.leaks[10 * 32] = 0.2;
  for (let x = 0; x < 8; x++) s.water[10 * 32 + x] = 0.2 + x * 0.05;
  const paths = leakPaths(s);
  assert.equal(paths.length, 1);
  assert.equal(paths[0].mouth, 10 * 32);
  assert.equal(paths[0].route.length, 8);
  s.ice[10 * 32 + 2] = 16;
  assert.equal(leakPaths(s)[0].route.length, 2);
  s.water[10 * 32 + 1] = 0;
  assert.equal(leakPaths(s)[0].route.length, 1);
});
test("evaporation feedback scales with visible volume and stays bounded", () => {
  const small = evaporationProfile({ removed: 10 }),
    large = evaporationProfile({ removed: 160 });
  assert.ok(large.life > small.life && large.steam > small.steam);
  assert.deepEqual(evaporationProfile({ removed: 16000 }), large);
});
