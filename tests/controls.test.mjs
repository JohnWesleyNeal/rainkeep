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
    const drag = beginDrag(point, aim, 18);
    assert.deepEqual(moveDrag(drag, point, piece), aim);
  }
});
test("relative isometric slides move exactly one cell and survive a new grip", () => {
  let drag = beginDrag({ x: 100, y: 100 }, { x: 5, y: 5 }, 18);
  const aim = moveDrag(drag, { x: 118, y: 109 }, piece);
  assert.deepEqual(aim, { x: 6, y: 5 });
  drag = beginDrag({ x: 300, y: 200 }, aim, 18);
  assert.deepEqual(moveDrag(drag, { x: 318, y: 209 }, piece), { x: 7, y: 5 });
});
test("placement is continuous while subpixel sensor noise is ignored", () => {
  const drag = beginDrag({ x: 100, y: 100 }, { x: 5, y: 5 }, 18);
  const aim = moveDrag(drag, { x: 113, y: 106.5 }, piece);
  assert.ok(Math.abs(aim.x - (5 + 13 / 18)) < 1e-10);
  assert.equal(aim.y, 5);
  assert.deepEqual(moveDrag(drag, { x: 113.1, y: 106.55 }, piece), aim);
  const next = moveDrag(drag, { x: 113.5, y: 106.75 }, piece);
  assert.ok(Math.abs(next.x - 5.75) < 1e-10);
});

test("rotated views keep thumb movement aligned with the visible board", () => {
  const expected = [
    { x: 9, y: 8 },
    { x: 8, y: 7 },
    { x: 7, y: 8 },
    { x: 8, y: 9 },
  ];
  for (let quarter = 0; quarter < 4; quarter++) {
    const drag = beginDrag({ x: 100, y: 100 }, { x: 8, y: 8 }, 18, quarter);
    assert.deepEqual(
      moveDrag(drag, { x: 118, y: 109 }, piece),
      expected[quarter],
    );
  }
});
test("overshooting a board edge does not accumulate a dead drag distance", () => {
  const drag = beginDrag({ x: 0, y: 0 }, { x: 27, y: 27 }, 18);
  assert.deepEqual(moveDrag(drag, { x: 500, y: 250 }, piece), { x: 28, y: 27 });
  assert.deepEqual(moveDrag(drag, { x: 482, y: 241 }, piece), { x: 27, y: 27 });
});
test("rotating or nudging during a drag rebases the aim without resetting the grip", () => {
  const drag = beginDrag({ x: 100, y: 100 }, { x: 5, y: 5 }, 18);
  rebaseDrag(drag, { x: 8, y: 9 });
  assert.deepEqual(moveDrag(drag, { x: 100, y: 100 }, piece), { x: 8, y: 9 });
  assert.deepEqual(moveDrag(drag, { x: 118, y: 109 }, piece), { x: 9, y: 9 });
});
