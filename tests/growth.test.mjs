import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  applyPiece,
  restore,
  tick,
  freezeLake,
} from "../src/simulation.js";
import {
  advanceGrowth,
  growthView,
  useRainCharm,
  milestoneFor,
} from "../src/growth.js";
import {
  readKeeper,
  syncKeeper,
  keeperView,
  DISCOVERIES,
} from "../src/keeper.js";
import { createStage, readProgress } from "../src/stages.js";
import { previewPlacement } from "../src/placement-preview.js";

test("score chapters award once, cap stored charms and continue into endless seasons", () => {
  const s = createGame("daydream", 11);
  assert.equal(milestoneFor(0), 0);
  s.score = 1499;
  assert.equal(advanceGrowth(s), 0);
  s.score = 1500;
  assert.equal(advanceGrowth(s), 1);
  assert.equal(s.growth.charms, 1);
  assert.equal(advanceGrowth(s), 0);
  s.score = 70000;
  assert.equal(advanceGrowth(s), 5);
  assert.equal(s.growth.charms, 3);
  assert.equal(growthView(s).target, 120000);
  s.score = 120000;
  advanceGrowth(s);
  assert.equal(growthView(s).season, 2);
  assert.equal(growthView(s).target, 170000);
});
test("charms offer bounded drain relief without changing board, score, seed or queue", () => {
  const s = createGame("classic", 11);
  s.score = 5000;
  advanceGrowth(s);
  s.spill = 240;
  const before = structuredClone(s);
  assert.equal(useRainCharm(s), 160);
  assert.equal(s.spill, 80);
  assert.equal(s.growth.charms, 1);
  for (const key of [
    "current",
    "upcoming",
    "queueState",
    "seed",
    "terrain",
    "water",
    "score",
    "turn",
  ])
    assert.deepEqual(s[key], before[key]);
  assert.equal(useRainCharm(s), 80);
  assert.equal(s.spill, 0);
  assert.equal(s.growth.used, 2);
  assert.equal(useRainCharm(s), 0);
  for (const mutation of [
    (v) => (v.over = true),
    (v) => (v.dropping = true),
    (v) => (v.spill = 0),
    (v) => (v.growth.charms = 0),
  ]) {
    const v = structuredClone(before);
    mutation(v);
    const raw = JSON.stringify(v);
    assert.equal(useRainCharm(v), 0);
    assert.equal(JSON.stringify(v), raw);
  }
  assert.equal(useRainCharm(createStage(0)), 0);
});
test("new saves preserve spent rewards and reject malformed growth without changing v4 runs", () => {
  const s = createGame("daydream", 12);
  s.score = 5000;
  advanceGrowth(s);
  s.spill = 180;
  useRainCharm(s);
  const saved = restore(JSON.stringify(s));
  assert.deepEqual(saved, s);
  advanceGrowth(saved);
  assert.equal(saved.growth.charms, 1);
  for (const change of [
    (v) => delete v.growth,
    (v) => (v.growth.charms = 4),
    (v) => (v.growth.used = 9),
    (v) => (v.growth.milestone = 5),
    (v) => (v.growth.chain = 7),
    (v) => (v.growth.water = -1),
  ]) {
    const v = structuredClone(s);
    change(v);
    assert.equal(restore(JSON.stringify(v)), null);
  }
  const previous = createGame("daydream", 19, 2);
  previous.score = 20000;
  const loaded = restore(JSON.stringify(previous));
  assert.deepEqual(loaded, previous);
  assert.equal(loaded.version, 4);
  assert.equal(loaded.growth, undefined);
  const seed = loaded.queueState.seed;
  tick(loaded, 1);
  assert.equal(loaded.level, 1);
  assert.equal(loaded.queueState.seed, seed);
});
test("Classic score chapters open hazards while Daydream never escalates from waiting", () => {
  const s = createGame("classic", 3);
  s.score = 12000;
  advanceGrowth(s);
  tick(s, 0.1);
  assert.equal(s.level, 4);
  tick(s, 24.1);
  assert.ok(s.iceClock < 1); // An ice arrival was scheduled at the new level.
  const d = createGame("daydream", 3);
  tick(d, 240);
  assert.equal(d.level, 1);
  assert.equal(d.growth.milestone, 0);
  assert.equal(d.hazards.length, 0);
  d.score = 24000;
  advanceGrowth(d);
  tick(d, 0.1);
  assert.equal(d.level, 5);
  assert.equal(d.hazards.length, 0);
});
test("real contained Fire builds a chain, previews stay read-only and dry Fire breaks it", () => {
  const s = createGame("daydream", 3);
  s.current = { type: "sun", shape: 0, rotation: 0 };
  const before = JSON.stringify(s);
  previewPlacement(s, { x: 15, y: 15 });
  assert.equal(JSON.stringify(s), before);
  const e = applyPiece(s, 15, 15);
  assert.ok(e.contained);
  assert.equal(s.growth.clears, 1);
  assert.equal(s.growth.chain, 1);
  assert.ok(s.growth.water > 150);
  assert.equal(s.growth.charms, 1);
  s.current = { type: "sun", shape: 0, rotation: 0 };
  applyPiece(s, 0, 0);
  assert.equal(s.growth.chain, 0);
  assert.equal(s.growth.bestChain, 1);
  s.ice.fill(0);
  s.score = 1490;
  s.growth.milestone = 0;
  s.growth.charms = 0;
  freezeLake(s, 0, 0);
  assert.equal(s.growth.milestone, 1);
  assert.ok(restore(JSON.stringify(s)));
});
test("Keeper records import existing medals and scores without double-paying reload or retry", () => {
  const p = readKeeper(null),
    progress = readProgress(null);
  progress.stars[0] = 3;
  const change = syncKeeper(p, {
    progress,
    records: [{ classic: 5000, daydream: 1000 }],
  });
  assert.ok(change.changed);
  assert.equal(keeperView(p).xp, 750);
  const raw = JSON.stringify(p);
  syncKeeper(p, { progress, records: [{ classic: 2000, daydream: 1000 }] });
  assert.equal(JSON.stringify(p), raw);
  const loaded = readKeeper(raw);
  syncKeeper(loaded, {
    progress,
    records: [{ classic: 5000, daydream: 1000 }],
  });
  assert.deepEqual(loaded, p);
  progress.stars[0] = 1;
  syncKeeper(p, { progress });
  assert.equal(p.stars[0], 3);
});
test("discoveries require their actual outcomes and cannot be collected twice", () => {
  const p = readKeeper(null),
    s = createGame("daydream", 3);
  syncKeeper(p, {
    state: s,
    event: { removed: 50, contained: false, scoreParts: { ducks: 2 } },
  });
  assert.deepEqual(p.discoveries, []);
  const event = {
    contained: true,
    removed: 50,
    scoreParts: { ducks: 2 },
    repaired: 4,
    thawed: true,
    detonated: true,
  };
  syncKeeper(p, { state: s, event });
  const xp = keeperView(p).xp;
  syncKeeper(p, { state: s, event });
  assert.equal(keeperView(p).xp, xp);
  assert.deepEqual(p.discoveries, ["lake", "duck", "repair", "thaw", "mine"]);
  s.growth.clears = 3;
  s.growth.bestChain = 3;
  s.growth.water = 600;
  syncKeeper(p, { state: s });
  assert.ok(p.discoveries.includes("chain"));
  assert.ok(p.discoveries.includes("water"));
  const progress = readProgress(null);
  progress.stars.fill(1);
  syncKeeper(p, { progress, state: createStage(12) });
  assert.ok(p.discoveries.includes("islands"));
  assert.ok(!p.discoveries.includes("rain"));
});
test("Keeper profile sanitizes corrupt data and max rank stays bounded", () => {
  assert.deepEqual(readKeeper("not json"), readKeeper(null));
  const p = readKeeper({
    best: { classic: Infinity, daydream: -1 },
    stars: [100, -8, "2"],
    discoveries: ["lake", "lake", "unknown"],
  });
  assert.deepEqual(p.best, { classic: 0, daydream: 0 });
  assert.deepEqual(p.stars.slice(0, 3), [3, 0, 0]);
  assert.deepEqual(p.discoveries, ["lake"]);
  p.best.classic = 1e9;
  p.discoveries = DISCOVERIES.map((d) => d.id);
  assert.equal(keeperView(p).rank, 6);
  assert.equal(keeperView(p).ratio, 1);
});
