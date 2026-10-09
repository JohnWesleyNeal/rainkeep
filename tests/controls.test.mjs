import test from "node:test";
import assert from "node:assert/strict";
import {
  beginDrag,
  moveDrag,
  rebaseDrag,
  rotateAim,
  pieceBounds,
} from "../src/controls.js";
const piece = { type: "raise", shape: 2, rotation: 0 };

test("rotation preserves the center of asymmetric pieces through all four turns", () => {
  for (let shape = 0; shape < 8; shape++) {
    let p = { type: "raise", shape, rotation: 0 },
      aim = { x: 10.37, y: 11.23 };
    const initial = { ...aim },
      bounds = pieceBounds(p),
      center = { x: aim.x + bounds.width / 2, y: aim.y + bounds.height / 2 };
    for (let n = 0; n < 4; n++) {
      const next = { ...p, rotation: (p.rotation + 1) % 4 };
      aim = rotateAim(aim, p, next);
      p = next;
      const b = pieceBounds(p);
      assert.ok(Math.abs(aim.x + b.width / 2 - center.x) < 1e-9);
      assert.ok(Math.abs(aim.y + b.height / 2 - center.y) < 1e-9);
    }
    assert.ok(
      Math.abs(aim.x - initial.x) < 1e-9 && Math.abs(aim.y - initial.y) < 1e-9,
    );
  }
});

test("edge rotation clamps safely and the held grip continues from its new origin", () => {
  const p = { type: "raise", shape: 5, rotation: 0 },
    next = { ...p, rotation: 1 };
  const aim = rotateAim({ x: 22, y: 0 }, p, next);
  const b = pieceBounds(next);
  assert.ok(
    aim.x >= 0 && aim.y >= 0 && aim.x + b.width <= 32 && aim.y + b.height <= 32,
  );
  const drag = beginDrag({ x: 100, y: 100 }, { x: 22, y: 0 }, 18);
  rebaseDrag(drag, aim);
  assert.deepEqual(moveDrag(drag, { x: 100, y: 100 }, next), aim);
});
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
