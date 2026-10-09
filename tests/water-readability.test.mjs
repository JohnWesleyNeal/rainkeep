import test from "node:test";
import assert from "node:assert/strict";
import { createGame, flow } from "../src/simulation.js";
import { waterlineField, bankSpills } from "../src/atmosphere.js";

test("bank waterlines reflect liquid level and approach the rim only when nearly full", () => {
  const s = createGame("daydream", 42),
    i = 9 * 32 + 15;
  let field = waterlineField(s);
  assert.ok(Math.abs(field[i * 4] - 1.1) < 1e-6);
  assert.equal(field[i * 4 + 1], 1);
  assert.equal(field[i * 4 + 2], 0);
  for (let j = 0; j < s.water.length; j++) if (s.water[j]) s.water[j] = 2.6;
  field = waterlineField(s);
  assert.ok(field[i * 4 + 2] > 0.5);
  s.ice.fill(16);
  assert.equal(
    waterlineField(s)[i * 4 + 2],
    0,
    "frozen water does not warn of flowing overflow",
  );
});
test("a weak bank uses its own headroom despite a taller neighbor, and films do not raise the pond reference", () => {
  const s = createGame("daydream", 42),
    i = 9 * 32 + 15;
  s.terrain[i] = 1.4;
  s.terrain[i - 1] = 5;
  s.water[i] = 0.2;
  const field = waterlineField(s);
  assert.ok(Math.abs(field[i * 4] - 1.1) < 1e-6);
  assert.ok(field[i * 4 + 2] > 0.45);
});
test("closed water has no crest cascades, while actual over-bank flow does", () => {
  const s = createGame("daydream", 42);
  for (let j = 0; j < s.water.length; j++) if (s.water[j]) s.water[j] = 2.6;
  assert.equal(bankSpills(s).length, 0);
  for (let x = 12; x < 20; x++)
    for (let y = 22; y < 24; y++) s.terrain[y * 32 + x] = 1.1;
  for (let n = 0; n < 12; n++) flow(s, 1 / 30);
  const spills = bankSpills(s);
  assert.ok(spills.length > 0);
  assert.ok(spills.every((p) => p.top > p.bottom && p.rate > 0));
  s.ice.fill(16);
  assert.equal(bankSpills(s).length, 0);
});
test("presentation reads preserve physics, cap geometry, and cannot wrap rows", () => {
  const s = createGame("classic", 42);
  for (let i = 0; i < s.terrain.length; i++) {
    s.terrain[i] = i % 2 ? 2 : 0;
    s.water[i] = 0.2;
  }
  const before = JSON.stringify(s);
  const spills = bankSpills(s, 17);
  waterlineField(s);
  assert.equal(JSON.stringify(s), before);
  assert.equal(spills.length, 17);
  assert.ok(
    spills.every(
      (p) =>
        Math.abs((p.from % 32) - (p.to % 32)) +
          Math.abs(Math.floor(p.from / 32) - Math.floor(p.to / 32)) ===
        1,
    ),
  );
  s.holes.fill(true);
  assert.equal(bankSpills(s).length, 0);
  assert.ok(waterlineField(s).every((n) => n === 0));
});
