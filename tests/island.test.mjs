import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  quakePressure,
  landMass,
  terrainPressure,
  QUAKE_LIMIT,
  applyPiece,
  earthquake,
  tick,
  restore,
  containedLake,
  lakes,
  smartBomb,
  footprint,
} from "../src/simulation.js";
import { leakPaths, evaporationProfile } from "../src/atmosphere.js";

test("fractional Downers widening a hole remove all pierced land and forecast exact relief", () => {
  for (let rotation = 0; rotation < 4; rotation++) {
    const s = createGame("classic", 42);
    s.current = { type: "lower", shape: 3, rotation };
    const x = 8.23,
      y = 10.76;
    const covered = footprint(s.current, x, y);
    for (const { i } of covered) s.terrain[i] = 7;
    s.holes[covered[0].i] = true;
    s.terrain[covered[0].i] = 0;
    s.terrain[28 * 32 + 28] = 6;
    const untouched = terrainPressure({
      terrain: s.terrain.map((h, i) =>
        covered.some((c) => c.i === i) ? 0 : h,
      ),
    });
    const forecast = quakePressure(s, { x, y });
    assert.ok(forecast.projected < forecast.current);
    applyPiece(s, x, y);
    assert.ok(covered.some(({ weight }) => weight < 1));
    assert.ok(covered.every(({ i }) => s.holes[i] && s.terrain[i] === 0));
    assert.deepEqual(terrainPressure(s), untouched);
    assert.ok(Math.abs(forecast.projected * QUAKE_LIMIT - untouched.total) < 1e-8);
    assert.equal(s.quakes, 0);
  }
});

test("widening an empty hole gives no negative credit against distant peaks", () => {
  const s = createGame("classic", 42);
  s.current = { type: "lower", shape: 2, rotation: 0 };
  s.holes[8 * 32 + 8] = true;
  s.terrain[28 * 32 + 28] = 7;
  const before = terrainPressure(s);
  assert.equal(
    quakePressure(s, { x: 8.2, y: 8.2 }).projected,
    before.total / QUAKE_LIMIT,
  );
  applyPiece(s, 8.2, 8.2);
  assert.ok(s.holes.filter(Boolean).length > 1);
  assert.deepEqual(terrainPressure(s), before);
});

test("cutting away a raised rim can prevent a quake at the pressure limit", () => {
  const s = createGame("classic", 42);
  s.terrain.fill(0.705);
  s.current = { type: "lower", shape: 3, rotation: 0 };
  const aim = { x: 8.23, y: 10.76 };
  const covered = footprint(s.current, aim.x, aim.y);
  for (const { i } of covered) s.terrain[i] = 7;
  s.holes[covered[0].i] = true;
  s.terrain[covered[0].i] = 0;
  const forecast = quakePressure(s, aim);
  assert.ok(forecast.current > 1 && forecast.projected < 1);
  const event = applyPiece(s, aim.x, aim.y);
  assert.equal(event.quake, false);
  assert.equal(s.quakes, 0);
  assert.ok(terrainPressure(s).total < QUAKE_LIMIT);
});

test("missing land contributes neither mass, spikes nor support to nearby peaks", () => {
  const s = createGame("classic", 42);
  const peak = 10 * 32 + 10;
  s.terrain[peak] = 7;
  for (const i of [peak - 2, peak + 2, peak - 64, peak + 64]) {
    s.terrain[i] = 7;
    s.holes[i] = true;
  }
  const clean = { terrain: s.terrain.map((h, i) => (s.holes[i] ? 0 : h)) };
  assert.deepEqual(terrainPressure(s), terrainPressure(clean));
  assert.equal(landMass(s), 7);
  assert.ok(terrainPressure(s).surcharge > 0);
});

test("old hole remnants are removed on restore and cannot reappear through repair", () => {
  const s = createGame("classic", 42);
  s.current = { type: "raise", shape: 2, rotation: 0 };
  const i = 10 * 32 + 10;
  s.holes[i] = s.holes[i + 1] = true;
  s.terrain[i] = s.terrain[i + 1] = 7;
  s.score = 321;
  const restored = restore(JSON.stringify(s));
  assert.ok(restored);
  assert.equal(restored.terrain[i], 0);
  assert.equal(restored.terrain[i + 1], 0);
  assert.equal(restored.score, 321);
  assert.ok(restored.holes[i]);
  const forecast = quakePressure(s, { x: 10.2, y: 10.2 });
  applyPiece(s, 10.2, 10.2);
  assert.equal(s.holes[i], false);
  assert.equal(s.terrain[i], 0);
  assert.ok(
    Math.abs(forecast.projected * QUAKE_LIMIT - terrainPressure(s).total) < 1e-8,
  );
});

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
    assert.ok(
      Math.abs(forecast.projected * QUAKE_LIMIT - terrainPressure(s).total) <
        1e-8,
    );
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
    spikeRatio: 0,
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
  assert.equal(containedLake(s, l), true);
  s.terrain[8 * 32 + 10] = 0;
  assert.equal(containedLake(s, l), false);
  s.terrain[9 * 32 + 10] = 2.8;
  s.terrain[8 * 32 + 10] = 2.8;
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
