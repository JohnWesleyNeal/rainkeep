import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  applyPiece,
  waterTotal,
  waterAmount,
  waterBubbles,
  cells,
  validPlacement,
  restore,
  piece,
} from "../src/simulation.js";

test("bubble sizes release their own amounts at fractional placement", () => {
  for (const level of [1, 5, 10])
    for (const waterSize of [0, 1, 2])
      for (const rotation of [0, 1, 2, 3])
        for (const shape of [0, 1, 2]) {
          const s = createGame("classic", 42);
          s.level = level;
          s.current = { type: "rain", shape, rotation, waterSize };
          const expected = waterAmount(s.current, level);
          applyPiece(s, 14.25, 15.7);
          assert.ok(Math.abs(waterTotal(s) - expected) < 1e-8);
        }
});
test("bubble formations occupy their displayed locations and retain fill shares through rotation", () => {
  for (const waterSize of [0, 1, 2])
    for (const shape of [0, 1, 2]) {
      const p = { type: "rain", shape, rotation: 0, waterSize };
      const original = waterBubbles(p);
      assert.equal(original.length, [1, 3, 5][waterSize]);
      for (let rotation = 0; rotation < 4; rotation++) {
        p.rotation = rotation;
        assert.deepEqual(
          waterBubbles(p).map((b) => b.share),
          original.map((b) => b.share),
        );
        assert.equal(validPlacement(p, 30, 30), cells(p).length === 1);
      }
      const s = createGame("classic", 42);
      s.current = p;
      applyPiece(s, 12, 12);
      for (const b of waterBubbles(p))
        assert.ok(s.water[(12 + b.y) * 32 + 12 + b.x] > 0);
    }
});
test("old queued water retains its original medium amount and new sizes survive saves", () => {
  const s = createGame("classic", 42);
  s.current = { type: "rain", shape: 1, rotation: 0 };
  assert.equal(waterAmount(restore(JSON.stringify(s)).current, 1), 72);
  for (const waterSize of [0, 1, 2]) {
    s.current.waterSize = waterSize;
    assert.equal(restore(JSON.stringify(s)).current.waterSize, waterSize);
  }
  for (const waterSize of [-1, 3, 1.5, "1", null]) {
    s.current.waterSize = waterSize;
    assert.equal(restore(JSON.stringify(s)), null);
  }
});
test("new water queue generates all three readable sizes", () => {
  const s = createGame("classic", 42),
    sizes = new Set();
  for (let i = 0; i < 200; i++) {
    const p = piece(s, 12);
    sizes.add(p.waterSize);
  }
  assert.deepEqual([...sizes].sort(), [0, 1, 2]);
});
test("visible fill changes the delivered amount without hidden size multipliers", () => {
  const emptier = { type: "rain", shape: 0, rotation: 0, waterSize: 0 };
  const fuller = { ...emptier, shape: 2 };
  assert.ok(waterAmount(fuller, 1) > waterAmount(emptier, 1) * 2);
  assert.ok(
    Math.abs(
      waterAmount(emptier, 1) - 48 * ((2 + 3 * -0.26 - (-0.26) ** 3) / 4),
    ) < 1e-9,
  );
  assert.equal(
    waterAmount({ ...fuller, rotation: 3 }, 1),
    waterAmount(fuller, 1),
  );
});
