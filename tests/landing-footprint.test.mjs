import assert from "node:assert/strict";
import test from "node:test";
import { cells, createGame, SHAPES, SIZE } from "../src/simulation.js";
import { createStage } from "../src/stages.js";
import { previewPlacement } from "../src/placement-preview.js";
import { landingFootprint, showLessonTarget } from "../src/landing-footprint.js";

function area(points) {
  let result = 0;
  for (let n = 0; n < points.length; n += 6) {
    const [ax, ay, bx, by, cx, cy] = points.slice(n, n + 6);
    result += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
  }
  return result;
}

test("fractional landing silhouettes preserve every piece shape and its open center", () => {
  const s = createGame("daydream", 42);
  for (const type of ["raise", "lower", "rain"]) {
    for (let shape = 0; shape < SHAPES.length; shape++) {
      for (let rotation = 0; rotation < 4; rotation++) {
        s.current = { type, shape, rotation, waterSize: 2 };
        const tiles = cells(s.current);
        for (const aim of [{ x: 10, y: 10 }, { x: 10.2, y: 10.7 }, { x: 10.999999, y: 10.000001 }]) {
          const geometry = landingFootprint(s, { indices: [] }, aim);
          assert.ok(Math.abs(area(geometry.faces) - tiles.length) < 1e-6);
          assert.ok(geometry.faces.length / 2 <= SIZE * SIZE * 6);
          assert.ok(geometry.edges.length / 2 <= SIZE * SIZE * 16);
          for (let n = 0; n < geometry.faces.length; n += 6) {
            const p = geometry.faces.slice(n, n + 6);
            const x = (p[0] + p[2] + p[4]) / 3;
            const y = (p[1] + p[3] + p[5]) / 3;
            assert.ok(tiles.some(([tx, ty]) =>
              x >= aim.x + tx - 1e-7 && x <= aim.x + tx + 1 + 1e-7 &&
              y >= aim.y + ty - 1e-7 && y <= aim.y + ty + 1 + 1e-7));
          }
          // Boundary length stays that of the piece, with no internal cell seams.
          const occupied = new Set(tiles.map(([x, y]) => `${x},${y}`));
          const perimeter = tiles.reduce((total, [x, y]) => total +
            [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
              .filter((p) => !occupied.has(p.join(","))).length, 0);
          let length = 0;
          for (let n = 0; n < geometry.edges.length; n += 4)
            length += Math.hypot(geometry.edges[n + 2] - geometry.edges[n], geometry.edges[n + 3] - geometry.edges[n + 1]);
          assert.ok(Math.abs(length - perimeter) < 1e-6);
        }
      }
    }
  }
});

test("fractional preview faces follow individual terrain triangles without bridging a crest", () => {
  const s = createStage(0), aim = { x: 11.2, y: 8.7 };
  const { faces } = landingFootprint(s, previewPlacement(s, aim), aim);
  for (let n = 0; n < faces.length; n += 6) {
    const points = [[faces[n], faces[n + 1]], [faces[n + 2], faces[n + 3]], [faces[n + 4], faces[n + 5]]];
    const ix = Math.floor(points.reduce((sum, p) => sum + p[0], 0) / 3);
    const iy = Math.floor(points.reduce((sum, p) => sum + p[1], 0) / 3);
    assert.ok(points.every(([x, y]) => x >= ix - 1e-9 && x <= ix + 1 + 1e-9 && y >= iy - 1e-9 && y <= iy + 1 + 1e-9));
    const diagonal = points.map(([x, y]) => x + y - ix - iy - 1);
    assert.ok(diagonal.every((d) => d <= 1e-9) || diagonal.every((d) => d >= -1e-9));
  }
});

test("Fire preserves the entire affected lake, including a bounded whole-board case", () => {
  const s = createStage(2);
  s.current = { type: "sun", shape: 0, rotation: 0 };
  const aim = { x: 15, y: 15 }, preview = previewPlacement(s, aim);
  assert.ok(preview.indices.length > 1);
  assert.equal(area(landingFootprint(s, preview, aim).faces), preview.indices.length);
  const wholeBoard = { indices: Array.from({ length: SIZE * SIZE }, (_, i) => i) };
  const geometry = landingFootprint(s, wholeBoard, aim);
  assert.equal(area(geometry.faces), SIZE * SIZE);
  assert.equal(geometry.faces.length / 2, SIZE * SIZE * 6);
});

test("lesson target stays visible off-target and yields to an overlapping landing", () => {
  const s = createStage(0), target = { x: 16, y: 9, radius: 3 };
  assert.equal(showLessonTarget(s, { x: 11.2, y: 8.2 }, target, true), false);
  assert.equal(showLessonTarget(s, { x: 0, y: 0 }, target, true), true);
  assert.equal(showLessonTarget(s, { x: 11.2, y: 8.2 }, target, false), true);
  assert.equal(showLessonTarget(s, { x: 0, y: 0 }, null, true), false);
});
