import test from "node:test";
import assert from "node:assert/strict";
import { createStage, stepStage } from "../src/stages.js";
import { applyPiece, tick, restore, createGame } from "../src/simulation.js";
import { lessonFor, TAKEAWAYS } from "../src/lessons.js";

function drop(s, x, y) {
  s.aim = { x, y };
  const event = applyPiece(s, x, y);
  stepStage(s, event, 0);
  for (let n = 0; n < 70; n++) stepStage(s, tick(s, 1 / 30, { x, y }), 1 / 30);
}
test("first lesson follows the bank, liquid and actual completion", () => {
  const s = createStage(0);
  assert.equal(lessonFor(s).key, "bank");
  drop(s, 11, 8);
  assert.equal(lessonFor(s).key, "fill");
  drop(s, 15, 15);
  assert.equal(lessonFor(s).key, "clear");
  drop(s, 15, 15);
  assert.equal(lessonFor(s).key, "kept");
  assert.equal(lessonFor(s).target, null);
});
test("a missed Upper cannot advance the teaching and warns about Water in hand", () => {
  const s = createStage(0);
  drop(s, 0, 0);
  const lesson = lessonFor(s);
  assert.equal(lesson.key, "bank");
  assert.match(lesson.cue, /Upper/);
  assert.deepEqual(lesson.target, { x: 16, y: 9, radius: 3 });
});
test("separate-lake guidance moves to the unfilled basin and then waits for containment", () => {
  const s = createStage(1);
  assert.equal(lessonFor(s).target.x, 8);
  drop(s, 6, 14);
  assert.equal(lessonFor(s).target.x, 24);
  const restored = restore(JSON.stringify(s));
  assert.deepEqual(lessonFor(restored), lessonFor(s));
  drop(s, 22, 14);
  assert.equal(lessonFor(s).key, "kept");
});
test("ice, mines and repairs teach their distinct Fire outcomes", () => {
  const ice = createStage(4);
  assert.equal(lessonFor(ice).key, "thaw");
  drop(ice, 15, 15);
  assert.equal(lessonFor(ice).key, "clear");
  const mine = createStage(8);
  assert.equal(lessonFor(mine).key, "thaw");
  assert.match(lessonFor(mine).rule, /mine/);
  drop(mine, 15, 15);
  assert.equal(lessonFor(mine).key, "mine");
  drop(mine, 15, 15);
  assert.equal(lessonFor(mine).key, "patch");
  drop(mine, 14, 14);
  assert.equal(
    lessonFor(mine).key,
    "clear",
    "surviving water need not be refilled",
  );
  assert.match(lessonFor(mine).cue, /Fire/);
});
test("peak guidance moves to the remaining tower and duck goals require a real duck", () => {
  const s = createStage(5);
  assert.equal(lessonFor(s).key, "level");
  drop(s, 3, 3);
  assert.ok(lessonFor(s).target.x > 24);
  drop(s, 25, 24);
  assert.equal(lessonFor(s).key, "clear");
  const duck = createStage(2);
  assert.equal(lessonFor(duck).key, "duck");
  drop(duck, 14, 14);
  assert.ok(duck.campaign.peakDucks >= 1);
  assert.equal(lessonFor(duck).key, "clear");
});
test("every stage has a bounded read-only note; free play has none", () => {
  for (let id = 0; id < 12; id++) {
    const s = createStage(id),
      before = JSON.stringify(s),
      lesson = lessonFor(s);
    assert.ok(lesson.cue && lesson.rule && TAKEAWAYS[id]);
    assert.equal(JSON.stringify(s), before);
    if (lesson.target) {
      assert.ok(lesson.target.x >= 0 && lesson.target.x <= 32);
      assert.ok(lesson.target.y >= 0 && lesson.target.y <= 32);
      assert.ok(lesson.target.radius > 0 && lesson.target.radius <= 4);
    }
    s.campaign.status = "failed";
    assert.equal(lessonFor(s), null);
  }
  assert.equal(lessonFor(createGame()), null);
});
