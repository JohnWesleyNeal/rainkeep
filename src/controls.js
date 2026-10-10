import { SIZE, cells } from "./simulation.js";

export function pieceBounds(piece) {
  const shape = cells(piece);
  return {
    width: Math.max(...shape.map((p) => p[0])) + 1,
    height: Math.max(...shape.map((p) => p[1])) + 1,
  };
}

// Keep the visible center under the hand when a long shape turns. Only the
// board boundary may push it inward; rotation must not relocate it arbitrarily.
export function rotateAim(aim, before, after) {
  const a = pieceBounds(before),
    b = pieceBounds(after);
  return clampAim(
    {
      x: aim.x + (a.width - b.width) / 2,
      y: aim.y + (a.height - b.height) / 2,
    },
    after,
  );
}

export function clampAim(aim, piece) {
  const shape = cells(piece);
  return {
    x: Math.max(
      0,
      Math.min(SIZE - 1 - Math.max(...shape.map((p) => p[0])), aim.x),
    ),
    y: Math.max(
      0,
      Math.min(SIZE - 1 - Math.max(...shape.map((p) => p[1])), aim.y),
    ),
  };
}

// A touch is a clutch: touching anywhere continues from the current aim.
// Movement is measured in a fixed plane, never against moving water/terrain.
export function beginDrag(point, aim, unit, quarter = 0, basis = null) {
  return {
    lastX: point.x,
    lastY: point.y,
    x: aim.x,
    y: aim.y,
    aim: { ...aim },
    unit: Math.max(11, unit),
    quarter,
    basis,
  };
}
export function rebaseDrag(drag, aim) {
  if (drag) {
    drag.x = aim.x;
    drag.y = aim.y;
    drag.aim = { ...aim };
  }
}
export function moveDrag(drag, point, piece) {
  const dx = point.x - drag.lastX,
    dy = point.y - drag.lastY;
  // Ignore sensor noise, accumulating it against the last meaningful sample.
  if (Math.hypot(dx, dy) < 0.3) return { ...drag.aim };
  drag.lastX = point.x;
  drag.lastY = point.y;
  const a = dx / (2 * drag.unit) + dy / drag.unit,
    b = -dx / (2 * drag.unit) + dy / drag.unit,
    angle = (drag.quarter * Math.PI) / 2,
    c = Math.round(Math.cos(angle)),
    s = Math.round(Math.sin(angle));
  let deltaX = c * a + s * b,
    deltaY = -s * a + c * b;
  if (drag.basis) {
    const [xx, xy, yx, yy] = drag.basis;
    const determinant = xx * yy - xy * yx;
    if (Math.abs(determinant) > 1e-8) {
      deltaX = (yy * dx - yx * dy) / determinant;
      deltaY = (-xy * dx + xx * dy) / determinant;
    }
  }
  const continuous = clampAim(
    {
      x: drag.x + deltaX,
      y: drag.y + deltaY,
    },
    piece,
  );
  drag.x = continuous.x;
  drag.y = continuous.y;
  drag.aim = continuous;
  return { ...drag.aim };
}
