import test from "node:test";
import assert from "node:assert/strict";
import { beginDrag, moveDrag, rebaseDrag } from "../src/controls.js";
const piece = { type: "raise", shape: 2, rotation: 0 };
test("touching and re-touching anywhere keeps the existing aim", () => {
  const aim = { x: 7, y: 5 };
  for (const point of [
    { x: 20, y: 40 },
    { x: 300, y: 250 },
  ]) {
    const drag = beginDrag(point, aim, 10);
    assert.deepEqual(moveDrag(drag, point, piece), aim);
  }
});
test("relative isometric slides move exactly one cell and survive a new grip", () => {
  let drag = beginDrag({ x: 100, y: 100 }, { x: 5, y: 5 }, 10);
  const aim = moveDrag(drag, { x: 118, y: 109 }, piece);
  assert.deepEqual(aim, { x: 6, y: 5 });
  drag = beginDrag({ x: 300, y: 200 }, aim, 10);
  assert.deepEqual(moveDrag(drag, { x: 318, y: 209 }, piece), { x: 7, y: 5 });
});
test("small finger jitter does not flip tile placement at a crossed boundary", () => {
  const drag = beginDrag({ x: 100, y: 100 }, { x: 5, y: 5 }, 18);
  assert.deepEqual(moveDrag(drag, { x: 113, y: 106.5 }, piece), { x: 6, y: 5 });
  for (const amount of [12, 13, 11, 12.5, 13])
    assert.deepEqual(
      moveDrag(drag, { x: 100 + amount, y: 100 + amount / 2 }, piece),
      { x: 6, y: 5 },
    );
});
test("overshooting a board edge does not accumulate a dead drag distance", () => {
  const drag = beginDrag({ x: 0, y: 0 }, { x: 13, y: 13 }, 18);
  assert.deepEqual(moveDrag(drag, { x: 500, y: 250 }, piece), { x: 14, y: 13 });
  assert.deepEqual(moveDrag(drag, { x: 482, y: 241 }, piece), { x: 13, y: 13 });
});
test("rotating or nudging during a drag rebases the aim without resetting the grip", () => {
  const drag = beginDrag({ x: 100, y: 100 }, { x: 5, y: 5 }, 18);
  rebaseDrag(drag, { x: 8, y: 9 });
  assert.deepEqual(moveDrag(drag, { x: 100, y: 100 }, piece), { x: 8, y: 9 });
  assert.deepEqual(moveDrag(drag, { x: 118, y: 109 }, piece), { x: 9, y: 9 });
});
