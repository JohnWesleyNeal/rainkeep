import test from "node:test";
import assert from "node:assert/strict";
import {
  SIZE,
  cells,
  footprint,
  createGame,
  applyPiece,
  landMass,
  waterTotal,
  flow,
  restore,
  landingHeight,
} from "../src/simulation.js";

test("fractional footprints conserve area for every shape and rotation", () => {
  for (let shape = 0; shape < 8; shape++)
    for (let rotation = 0; rotation < 4; rotation++) {
      const p = { type: "raise", shape, rotation },
        c = footprint(p, 4.13, 5.71);
      assert.ok(
        c.every(
          ({ i, weight }) =>
            Number.isInteger(i) &&
            i >= 0 &&
            i < SIZE * SIZE &&
            weight > 0 &&
            weight <= 1,
        ),
      );
      assert.ok(
        Math.abs(c.reduce((n, t) => n + t.weight, 0) - cells(p).length) < 1e-9,
      );
      assert.ok(footprint(p, 4, 5).every((t) => t.weight === 1));
    }
});
test("a misplaced bank has lower seams and leaks sooner than an aligned bank", () => {
  const build = (offset) => {
    const s = createGame("daydream", 15);
    s.terrain.fill(0);
    s.water.fill(0);
    s.current = { type: "raise", shape: 7, rotation: 0 };
    applyPiece(s, 10 + offset, 10 + offset);
    for (let y = 12; y < 16; y++)
      for (let x = 12; x < 16; x++) s.water[y * SIZE + x] = 1;
    return s;
  };
  const aligned = build(0),
    misplaced = build(0.55);
  assert.ok(Math.abs(landMass(aligned) - landMass(misplaced)) < 1e-9);
  assert.ok(
    misplaced.terrain[10 * SIZE + 10] < aligned.terrain[10 * SIZE + 10],
  );
  for (let t = 0; t < 450; t++) {
    flow(aligned);
    flow(misplaced);
  }
  const inside = (s) => {
    let n = 0;
    for (let y = 12; y < 16; y++)
      for (let x = 12; x < 16; x++) n += s.water[y * SIZE + x];
    return n;
  };
  assert.ok(inside(misplaced) < inside(aligned) - 0.1);
});
test("all piece types accept fractional aim without invalid array indices or lost water", () => {
  for (const type of ["raise", "lower", "rain", "sun", "bomb"]) {
    const s = createGame("daydream", 10);
    s.current = { type, shape: 2, rotation: 1 };
    const water = waterTotal(s);
    assert.ok(Number.isFinite(landingHeight(s, { x: 12.37, y: 13.29 })));
    const event = applyPiece(s, 12.37, 13.29);
    assert.ok(event);
    assert.ok(event.targets.every(Number.isInteger));
    assert.ok(
      s.terrain.every(Number.isFinite) && s.water.every(Number.isFinite),
    );
    assert.equal(Object.keys(s.terrain).length, SIZE * SIZE);
    if (type === "rain") assert.ok(Math.abs(waterTotal(s) - water - 72) < 1e-8);
  }
});
test("partial Downers leave the uncovered water and terrain intact", () => {
  const s = createGame("classic", 5);
  s.water.fill(1);
  for (let y = 8; y < 14; y++)
    for (let x = 8; x < 14; x++) s.terrain[y * SIZE + x] = 2;
  s.terrain[8 * SIZE + 8] = 0;
  s.current = { type: "lower", shape: 2, rotation: 0 };
  applyPiece(s, 8.5, 8.5);
  assert.equal(s.water[8 * SIZE + 8], 0.75);
  assert.equal(s.terrain[8 * SIZE + 12], 1.5);
  assert.equal(s.water[0], 1);
});
test("version 2 saves upgrade losslessly and continuous version 3 aims round trip", () => {
  const old = createGame("daydream", 21);
  old.version = 2;
  old.score = 765;
  old.aim = { x: 8, y: 8 };
  old.altitude = 7.5;
  const copy = restore(old);
  assert.equal(copy.version, 3);
  assert.deepEqual(copy.terrain, old.terrain);
  assert.deepEqual(copy.water, old.water);
  assert.equal(copy.score, 765);
  assert.equal(copy.altitude, 7.5);
  copy.aim = { x: 8.173, y: 9.628 };
  assert.deepEqual(restore(JSON.stringify(copy)), copy);
  copy.aim.x = NaN;
  assert.equal(restore(copy), null);
});
