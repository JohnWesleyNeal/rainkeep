import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPiece,
  tick,
  restore,
  terrainPressure,
  quakePressure,
  QUAKE_LIMIT,
  createGame,
} from "../src/simulation.js";
import {
  STAGES,
  createStage,
  stepStage,
  stageProgress,
  finishStage,
  readProgress,
  unlockedStages,
} from "../src/stages.js";

// These are normal piece landings, using each authored stage's actual queue.
export const solutions = [
  [
    [11, 8],
    [15, 15],
    [15, 15],
  ],
  [
    [6, 14],
    [22, 14],
  ],
  [
    [14, 14],
    [14, 14],
    [15, 15],
  ],
  [
    [12, 12],
    [15, 15],
    [15, 15],
  ],
  [
    [15, 15],
    [15, 15],
  ],
  [
    [3, 3],
    [25, 24],
    [15, 15],
  ],
  [
    [6, 14],
    [22, 14],
  ],
  [
    [11, 8],
    [15, 15],
    [15, 15],
    [15, 15],
  ],
  [
    [15, 15],
    [15, 15],
    [14, 14],
    [15, 15],
    [15, 15],
  ],
  [[11, 8]],
  [
    [5, 5],
    [23, 5],
    [14, 23],
  ],
  [
    [13, 13],
    [3, 3],
    [15, 15],
    [15, 15],
    [15, 15],
    [15, 15],
    [15, 15],
    [15, 15],
  ],
];
function settle(s, seconds = 2.1) {
  for (let i = 0; i < seconds * 30 && s.campaign.status === "playing"; i++) {
    const event = tick(s, 1 / 30, s.aim);
    stepStage(s, event, 1 / 30);
  }
}
for (let id = 0; id < solutions.length; id++)
  test(`stage ${id + 1}: ${STAGES[id].name} is completable with its authored queue`, () => {
    const s = createStage(id);
    assert.ok(restore(JSON.stringify(s)));
    assert.equal(stageProgress(s).ratio, 0);
    for (const [x, y] of solutions[id]) {
      if (s.campaign.status !== "playing") break;
      s.aim = { x, y };
      const event = applyPiece(s, x, y);
      assert.ok(event);
      stepStage(s, event, 0);
      settle(s);
    }
    settle(s, 3);
    assert.equal(
      s.campaign.status,
      "complete",
      JSON.stringify({
        progress: stageProgress(s),
        turn: s.turn,
        spill: s.spill,
        quakes: s.quakes,
      }),
    );
    assert.ok(s.turn <= STAGES[id].par);
    const progress = finishStage(readProgress(null), s);
    assert.ok(progress.stars[id] >= 2);
    assert.equal(restore(JSON.stringify(s)).campaign.status, "complete");
  });

test("narrow towers cost more than the same volume spread into low banks", () => {
  const tower = createGame("classic", 42),
    bank = createGame("classic", 42);
  for (let y = 10; y < 12; y++)
    for (let x = 10; x < 12; x++) tower.terrain[y * 32 + x] = 7;
  for (let x = 10; x < 20; x++) bank.terrain[10 * 32 + x] = 2.8;
  assert.ok(
    Math.abs(terrainPressure(tower).mass - terrainPressure(bank).mass) < 1e-8,
  );
  assert.ok(terrainPressure(tower).total > terrainPressure(bank).total * 1.5);
  assert.equal(terrainPressure(bank).surcharge, 0);
  bank.terrain.fill(7);
  assert.equal(
    terrainPressure(bank).surcharge,
    0,
    "broad plateaus have support, including board edges",
  );
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++)
      bank.terrain[y * 32 + x] = y >= 10 && y < 12 ? 7 : 0;
  assert.equal(
    terrainPressure(bank).surcharge,
    0,
    "a supported long bank is not an isolated peak",
  );
  tower.current = { type: "lower", shape: 2, rotation: 0 };
  const forecast = quakePressure(tower, { x: 9.2, y: 9.3 });
  assert.ok(forecast.projected < forecast.current);
  applyPiece(tower, 9.2, 9.3);
  assert.ok(
    Math.abs(forecast.projected * QUAKE_LIMIT - terrainPressure(tower).total) <
      1e-8,
  );
});
test("early stages wait, later stages fall, and campaign difficulty stays authored", () => {
  const early = createStage(0),
    later = createStage(7);
  const earlyHeight = early.altitude,
    laterHeight = later.altitude;
  tick(early, 1, early.aim);
  tick(later, 1, later.aim);
  assert.equal(early.altitude, earlyHeight);
  assert.ok(later.altitude < laterHeight);
  early.elapsed = 1000;
  tick(early, 0.1, early.aim);
  assert.equal(early.level, 1);
});

test("mid-stage save restoration retains goals, queue and deterministic future play", () => {
  const s = createStage(4);
  stepStage(s, applyPiece(s, 15, 15), 0);
  assert.equal(stageProgress(s).ratio, 0.5);
  settle(s, 0.5);
  const restored = restore(JSON.stringify(s));
  assert.deepEqual(restored, s);
  for (const current of [s, restored]) {
    stepStage(current, applyPiece(current, 15, 15), 0);
    settle(current, 0.5);
  }
  assert.deepEqual(restored, s);
  assert.equal(restored.campaign.status, "complete");
});
test("last allowed drop can complete a stage; unmet goals fail and preserve retry state", () => {
  const s = createStage(6);
  stepStage(s, applyPiece(s, 6, 14), 0);
  s.turn = s.campaign.budget - 1;
  stepStage(s, applyPiece(s, 22, 14), 0);
  assert.equal(s.campaign.status, "complete");
  const failed = createStage(0);
  failed.turn = failed.campaign.budget;
  stepStage(failed, null, 0);
  assert.equal(failed.campaign.status, "failed");
  assert.ok(failed.over);
  assert.equal(restore(JSON.stringify(failed)).campaign.status, "failed");
});
test("unlocks are sequential, best medals persist, and malformed progress resets safely", () => {
  let progress = readProgress(null);
  assert.equal(unlockedStages(progress), 1);
  const s = createStage(0);
  s.campaign.status = "complete";
  s.turn = 3;
  progress = finishStage(progress, s);
  assert.equal(unlockedStages(progress), 2);
  assert.equal(progress.stars[0], 3);
  s.turn = 10;
  assert.equal(finishStage(progress, s).stars[0], 3);
  for (const malformed of [
    "{",
    { stars: [3] },
    { stars: Array(12).fill(4) },
    { stars: Array(12).fill(0.5) },
  ])
    assert.deepEqual(readProgress(malformed), {
      stars: Array(STAGES.length).fill(0),
    });
  s.campaign.queue = [];
  assert.equal(restore(JSON.stringify(s)), null);
});

test("peak surcharge can trigger a quake below the old volume threshold", () => {
  const s = createGame("classic", 42);
  s.terrain.fill(0.66);
  for (let y = 10; y < 12; y++)
    for (let x = 10; x < 12; x++) s.terrain[y * 32 + x] = 7;
  const pressure = terrainPressure(s);
  assert.ok(pressure.mass < QUAKE_LIMIT && pressure.total >= QUAKE_LIMIT);
  s.current = { type: "rain", shape: 0, rotation: 0, waterSize: 0 };
  const event = applyPiece(s, 15, 15);
  assert.ok(event.quake);
  assert.equal(s.quakes, 1);
});

test("stage holds reset across breaches, ice waits for Fire, and drain limits fail immediately", () => {
  const hold = createStage(10);
  stepStage(hold, applyPiece(hold, 5, 5), 0);
  stepStage(hold, applyPiece(hold, 23, 5), 0);
  stepStage(hold, applyPiece(hold, 14, 23), 0);
  settle(hold, 1.5);
  assert.ok(hold.campaign.stable > 0 && hold.campaign.status === "playing");
  hold.holes[5 * 32 + 5] = true;
  stepStage(hold, null, 1 / 30);
  assert.equal(hold.campaign.stable, 0);
  const ice = createStage(4);
  tick(ice, 65, ice.aim);
  assert.ok(ice.ice.some((v) => v > 0));
  stepStage(ice, applyPiece(ice, 15, 15), 0);
  assert.equal(ice.campaign.thaws, 1);
  const drain = createStage(6);
  drain.spill = 320;
  stepStage(drain, null, 0);
  assert.equal(drain.campaign.status, "failed");
});

test("expired one-time opportunities end the stage instead of leaving an impossible objective", () => {
  const mine = createStage(8);
  mine.ice.fill(0);
  mine.mines[0].ttl = 0.001;
  stepStage(mine, tick(mine, 1 / 30, mine.aim), 1 / 30);
  assert.equal(mine.campaign.status, "failed");
  const recovery = createStage(9);
  recovery.elapsed = 45.1;
  stepStage(recovery, tick(recovery, 1 / 30, recovery.aim), 1 / 30);
  assert.equal(recovery.campaign.status, "failed");
});
