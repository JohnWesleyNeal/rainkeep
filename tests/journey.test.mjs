import test from "node:test";
import assert from "node:assert/strict";
import {
  tick,
  applyPiece,
  restore,
  bonuses,
  createGame,
  waterTotal,
} from "../src/simulation.js";
import {
  createStage,
  stepStage,
  stageProgress,
  STAGES,
  readProgress,
  finishStage,
} from "../src/stages.js";
import {
  REGIONS,
  regionKept,
  stageUnlocked,
  nextIsland,
  suggestedIsland,
} from "../src/journey.js";
import { createWeather, stepWeather, weatherView } from "../src/weather.js";

export function advance(s, seconds) {
  for (
    let n = 0;
    n < Math.ceil(seconds * 30) && !s.over && s.campaign?.status !== "complete";
    n++
  ) {
    const e = tick(s, 1 / 30, s.aim);
    stepStage(s, e, 1 / 30);
  }
}
export function place(s, x, y) {
  s.aim = { x, y };
  const e = applyPiece(s, x, y);
  assert.ok(e);
  stepStage(s, e, 0);
  advance(s, 2.1);
}
export function prepareMeadow(id) {
  const s = createStage(id);
  const choices = {
    12: [
      [11, 6],
      [15, 15],
      [0, 24],
    ],
    13: [
      [5, 10],
      [21, 10],
      [6, 14],
      [22, 14],
    ],
    14: [
      [12, 12],
      [11, 8],
      [15, 15],
      [2, 2],
    ],
  };
  for (const [x, y] of choices[id]) place(s, x, y);
  return s;
}
for (const id of [12, 13, 14])
  test(STAGES[id].name + " is playable through the real shower", () => {
    const s = prepareMeadow(id);
    assert.equal(s.campaign.status, "playing");
    advance(s, 40 - s.elapsed);
    if (id !== 13) place(s, 15, 15);
    advance(s, 3);
    assert.equal(
      s.campaign.status,
      "complete",
      JSON.stringify({ progress: stageProgress(s), spill: s.spill }),
    );
    assert.ok(s.campaign.keptShowers >= 1);
    assert.equal(restore(JSON.stringify(s)).campaign.status, "complete");
    assert.ok(finishStage(readProgress(null), s).stars[id] >= 2);
  });

test("Sunbreak can be completed while its pieces naturally fall", () => {
  const s = createStage(15);
  let first = true;
  for (let n = 0; n < 32 && s.campaign.status === "playing"; n++) {
    const p = s.current;
    let aim;
    if (p.type === "raise") {
      aim = first ? { x: 13, y: 13 } : { x: 22, y: 2 };
      first = false;
    } else if (p.type === "lower") aim = { x: 3, y: 3 };
    else if (p.type === "rain")
      aim = s.campaign.weatherClears ? { x: 6, y: 22 } : { x: 14, y: 14 };
    else aim = s.campaign.weatherClears ? { x: 6, y: 22 } : { x: 15, y: 15 };
    s.aim = aim;
    const turn = s.turn;
    for (
      let k = 0;
      k < 300 && s.turn === turn && s.campaign.status === "playing";
      k++
    )
      advance(s, 1 / 30);
  }
  assert.equal(
    s.campaign.status,
    "complete",
    JSON.stringify({
      progress: stageProgress(s),
      turn: s.turn,
      ducks: s.campaign.peakDucks,
      spill: s.spill,
    }),
  );
  assert.ok(
    s.campaign.peakDucks >= 1 &&
      s.campaign.weatherClears >= 2 &&
      s.quakes === 0,
  );
});

test("old medals migrate and Meadow branches directly from the seven lessons", () => {
  const old = { stars: Array(12).fill(0) };
  old.stars[0] = 3;
  old.stars[6] = 2;
  const migrated = readProgress(old);
  assert.equal(migrated.stars.length, 16);
  assert.deepEqual(migrated.stars.slice(0, 12), old.stars);
  assert.equal(stageUnlocked(migrated, 12), false);
  for (let i = 0; i < 7; i++) migrated.stars[i] = 2;
  assert.ok(regionKept(migrated, REGIONS[0]));
  assert.ok(stageUnlocked(migrated, 12));
  assert.ok(stageUnlocked(migrated, 7));
  assert.equal(stageUnlocked(migrated, 13), false);
  assert.equal(suggestedIsland(migrated), 12);
  migrated.stars[12] = 1;
  assert.ok(stageUnlocked(migrated, 13));
  assert.equal(nextIsland(6), 12);
  assert.equal(nextIsland(15), null);
  assert.equal(nextIsland(11), null);
  assert.equal(stageUnlocked(migrated, 16), false);
});

test("weather is warned, conserves its rain amount, repeats and preserves the piece seed", () => {
  const s = createGame();
  s.weather = createWeather();
  const seed = s.seed;
  assert.equal(weatherView(s).phase, "prepare");
  stepWeather(s, 18);
  assert.equal(weatherView(s).phase, "gather");
  assert.equal(waterTotal(s), 0);
  stepWeather(s, 8);
  assert.equal(weatherView(s).phase, "shower");
  stepWeather(s, 12);
  assert.equal(s.weather.showers, 1);
  assert.equal(s.weather.drops, 100);
  assert.ok(Math.abs(waterTotal(s) - 96) < 1e-8);
  assert.equal(weatherView(s).phase, "clearing");
  stepWeather(s, 64);
  assert.equal(s.weather.showers, 2);
  assert.equal(s.seed, seed);
});

test("an empty or breached island cannot claim it kept a shower", () => {
  for (const open of [false, true]) {
    const s = createStage(12);
    s.weather.clock = 37.95;
    if (open) {
      s.water[16 * 32 + 16] = 50;
    } // The unfinished bank leaks at its current water head.
    advance(s, 0.1);
    assert.equal(s.campaign.keptShowers, 0);
    assert.equal(s.campaign.status, "playing");
  }
  const s = prepareMeadow(12);
  place(s, 15, 15); // Early Fire is useful, but cannot fulfill the post-rain clear.
  assert.equal(s.campaign.weatherClears, 0);
  assert.equal(s.campaign.status, "playing");
});

test("mid-shower saves resume exactly and malformed weather is rejected", () => {
  const s = prepareMeadow(12);
  advance(s, 29 - s.elapsed);
  const restored = restore(JSON.stringify(s));
  assert.deepEqual(restored, s);
  advance(s, 9);
  advance(restored, 9);
  assert.deepEqual(restored, s);
  for (const mutate of [
    (w) => (w.clock = -1),
    (w) => (w.kind = "storm"),
    (w) => (w.drops = NaN),
    (w) => (w.rainClock = 10),
  ]) {
    const copy = structuredClone(s);
    mutate(copy.weather);
    assert.equal(restore(copy), null);
  }
  s.campaign.status = "complete";
  const before = JSON.stringify(s);
  stepWeather(s, 10);
  assert.equal(JSON.stringify(s), before);
  assert.equal(weatherView(s).rain, 0);
});
