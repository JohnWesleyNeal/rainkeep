import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  applyPiece,
  piece,
  restore,
  random,
  waterTotal,
  tick,
  quakePressure,
} from "../src/simulation.js";
import { peekPieces } from "../src/piece-queue.js";
import { previewPlacement } from "../src/placement-preview.js";
import { createStage, stepStage, readProgress } from "../src/stages.js";
import { stageUnlocked, suggestedIsland } from "../src/journey.js";
import {
  bringRain,
  canBringRain,
  stepWeather,
  weatherView,
} from "../src/weather.js";
import { beginDrag, moveDrag, rebaseDrag } from "../src/controls.js";
import { failureReason } from "../src/screen-content.js";

test("new openings expose the full loop early and retain the authored shapes", () => {
  const classic = createGame("classic", 42),
    daydream = createGame("daydream", 42);
  const opening = (s) =>
    Array.from({ length: 9 }, () => {
      const p = { ...s.current };
      applyPiece(s, 10, 10);
      return p;
    });
  const a = opening(classic),
    b = opening(daydream);
  assert.deepEqual(
    a.slice(0, 6).map((p) => p.shape),
    [5, 6, 5, 7, 5, 6],
  );
  assert.deepEqual(
    a.map((p) => p.type),
    [
      "raise",
      "raise",
      "raise",
      "raise",
      "raise",
      "raise",
      "rain",
      "rain",
      "sun",
    ],
  );
  assert.deepEqual(
    b.slice(0, 6).map((p) => p.type),
    ["rain", "sun", "raise", "lower", "rain", "sun"],
  );
});
test("fair queues bound Fire droughts and never emit consecutive Bombs", () => {
  const found = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const s = createGame("classic", seed);
    let gap = 0,
      previous = "";
    for (let n = 9; n < 209; n++) {
      const p = piece(s, n);
      found.add(p.type);
      assert.ok(!(previous === "bomb" && p.type === "bomb"));
      gap = p.type === "sun" ? 0 : gap + 1;
      assert.ok(gap <= 6);
      previous = p.type;
    }
  }
  assert.equal(found.size, 5);
});
test("three visible pieces survive hazard randomness, peeking, landings and reload", () => {
  const s = createGame("classic", 651);
  s.aim = { x: 10, y: 10 };
  const before = JSON.stringify(s),
    expected = peekPieces(s);
  peekPieces(s)[0].type = "bomb";
  assert.equal(JSON.stringify(s), before);
  for (let i = 0; i < 3; i++) {
    for (let n = 0; n < 20; n++) random(s);
    applyPiece(s, 10, 10);
    assert.deepEqual(s.current, expected[i]);
    assert.deepEqual(restore(JSON.stringify(s)), s);
  }
  const loaded = restore(JSON.stringify(s));
  for (let n = 0; n < 12; n++) {
    applyPiece(s, 12, 12);
    applyPiece(loaded, 12, 12);
  }
  assert.deepEqual(s, loaded);
});
test("legacy continuation keeps its seed, rules and one-piece preview", () => {
  const original = createGame("classic", 42, 1);
  original.aim = { x: 10.25, y: 8.4 };
  const restored = restore(JSON.stringify(original));
  assert.equal(restored.version, 3);
  assert.equal(restored.rulesVersion, undefined);
  assert.equal(peekPieces(restored).length, 1);
  for (let n = 0; n < 18; n++) {
    applyPiece(original, 10, 10);
    applyPiece(restored, 10, 10);
  }
  assert.deepEqual(restored, original);
});
test("new saves reject corrupt or contradictory generator state", () => {
  const clean = createGame("classic", 42);
  for (const change of [
    (s) => s.upcoming.pop(),
    (s) => (s.upcoming[0].type = "invalid"),
    (s) => (s.queueState.seed = -1),
    (s) => (s.queueState.fireGap = 9),
    (s) => (s.rulesVersion = 4),
    (s) => delete s.queueState,
    (s) => (s.next = { type: "bomb", shape: 1, rotation: 0 }),
  ]) {
    const s = structuredClone(clean);
    change(s);
    assert.equal(restore(JSON.stringify(s)), null);
  }
});
test("placement analysis is read-only and agrees with real fractional terrain landings", () => {
  for (const id of [0, 3, 5, 8, 14])
    for (const type of ["raise", "lower", "rain", "sun", "bomb"])
      for (const rotation of [0, 1, 2, 3]) {
        const s = createStage(id);
        s.current = { type, shape: 2, rotation };
        const aim = { x: 13.4, y: 12.7 };
        const before = JSON.stringify(s),
          preview = previewPlacement(s, aim),
          actual = structuredClone(s);
        const event = applyPiece(actual, aim.x, aim.y);
        assert.equal(JSON.stringify(s), before);
        assert.deepEqual(preview.terrain, actual.terrain);
        assert.deepEqual(preview.holes, actual.holes);
        assert.deepEqual(preview.event, event);
        assert.deepEqual(preview.risk, quakePressure(s, aim));
      }
});
test("Fire previews distinguish thaw, detonation, dry ground and early weather clears", () => {
  const ice = createStage(4),
    mine = createStage(8),
    dry = createStage(0),
    weather = createStage(12);
  assert.match(previewPlacement(ice, { x: 15, y: 15 }).label, /Thaws/);
  applyPiece(mine, 15, 15);
  assert.match(previewPlacement(mine, { x: 15, y: 15 }).label, /Detonates/);
  dry.current = { type: "sun", shape: 0, rotation: 0 };
  assert.match(previewPlacement(dry, { x: 1, y: 1 }).label, /Dry Fire/);
  applyPiece(weather, 11, 6);
  applyPiece(weather, 15, 15);
  weather.current = { type: "sun", shape: 0, rotation: 0 };
  for (let n = 0; n < 90; n++) tick(weather, 1 / 30, { x: 15, y: 15 });
  assert.match(
    previewPlacement(weather, { x: 15, y: 15 }).label,
    /shower first/,
  );
});
test("Bring rain skips only dry weather and preserves warning, full rainfall and counters", () => {
  const s = createStage(12),
    before = structuredClone(s);
  assert.ok(bringRain(s));
  assert.equal(s.weather.clock, 18);
  assert.equal(weatherView(s).seconds, 8);
  assert.equal(s.elapsed, before.elapsed);
  assert.equal(s.seed, before.seed);
  assert.equal(waterTotal(s), 0);
  assert.equal(bringRain(s), false);
  stepWeather(s, 8);
  assert.equal(waterTotal(s), 0);
  assert.equal(bringRain(s), false);
  stepWeather(s, 12);
  assert.equal(s.weather.showers, 1);
  assert.ok(Math.abs(waterTotal(s) - 96) < 1e-8);
  assert.ok(bringRain(s));
  assert.equal(s.weather.clock, 82);
  assert.equal(s.weather.showers, 1);
  assert.deepEqual(restore(JSON.stringify(s)), s);
  for (const id of [0, 7, 15])
    assert.equal(canBringRain(createStage(id)), false);
  s.campaign.status = "complete";
  assert.equal(bringRain(s), false);
});
test("a shortcut shower still requires actual containment to meet the island goal", () => {
  for (const sealed of [false, true]) {
    const s = createStage(12);
    if (sealed) applyPiece(s, 11, 6);
    bringRain(s);
    for (let n = 0; n < 630; n++) {
      const e = tick(s, 1 / 30, s.aim);
      stepStage(s, e, 1 / 30);
    }
    assert.equal(s.campaign.keptShowers, sealed ? 1 : 0);
  }
});
test("all islands are open from an empty save and recommendations do not gate access", () => {
  const p = readProgress(null);
  for (let i = 0; i < 16; i++) assert.ok(stageUnlocked(p, i));
  assert.equal(suggestedIsland(p), 0);
  p.stars[0] = 3;
  assert.equal(suggestedIsland(p), 1);
  for (const id of [-1, 16, 1.2, NaN])
    assert.equal(stageUnlocked(p, id), false);
});
test("camera-derived touch transforms preserve screen direction through pitch, turns and resize", () => {
  const p = { type: "raise", shape: 2, rotation: 0 };
  for (const pitch of [42, 50])
    for (let q = 0; q < 4; q++) {
      const a = (q * Math.PI) / 2,
        c = Math.round(Math.cos(a)),
        s = Math.round(Math.sin(a)),
        u = 7,
        v = u * Math.sin((pitch * Math.PI) / 180);
      const basis = [u * (c + s), v * (c - s), u * (s - c), v * (s + c)];
      const drag = beginDrag(
        { x: 100, y: 100 },
        { x: 10, y: 10 },
        11,
        q,
        basis,
      );
      const aim = moveDrag(
        drag,
        {
          x: 100 + basis[0] * 0.7 + basis[2] * 0.3,
          y: 100 + basis[1] * 0.7 + basis[3] * 0.3,
        },
        p,
      );
      assert.ok(Math.abs(aim.x - 10.7) < 1e-9 && Math.abs(aim.y - 10.3) < 1e-9);
      drag.basis = basis.map((v) => v * 1.5);
      rebaseDrag(drag, aim);
      assert.deepEqual(
        moveDrag(drag, { x: drag.lastX, y: drag.lastY }, p),
        aim,
      );
    }
});
test("failure explanation reports the actual stage-specific constraint", () => {
  const drain = createStage(14);
  drain.campaign.worstDrain = 0.45;
  assert.match(failureReason(drain), /45%/);
  const quake = createStage(15);
  quake.quakes++;
  assert.match(failureReason(quake), /earthquake/);
  const expired = createStage(8);
  expired.mines = [];
  assert.match(failureReason(expired), /mine expired/);
  const budget = createStage(0);
  budget.turn = 12;
  assert.match(failureReason(budget), /No drops left/);
});
