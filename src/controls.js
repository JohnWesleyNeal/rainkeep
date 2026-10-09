import { SIZE, cells } from "./simulation.js";

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
export function beginDrag(point, aim, unit) {
  return {
    lastX: point.x,
    lastY: point.y,
    x: aim.x,
    y: aim.y,
    aim: { ...aim },
    unit: Math.max(11, unit),
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
  drag.lastX = point.x;
  drag.lastY = point.y;
  const continuous = clampAim(
    {
      x: drag.x + dx / (2 * drag.unit) + dy / drag.unit,
      y: drag.y - dx / (2 * drag.unit) + dy / drag.unit,
    },
    piece,
  );
  drag.x = continuous.x;
  drag.y = continuous.y;
  // Schmitt threshold: crossing a tile border takes deliberate movement;
  // sub-pixel jitter cannot bounce a piece back and forth between tiles.
  for (const axis of ["x", "y"]) {
    const difference = drag[axis] - drag.aim[axis];
    if (difference > 0.65) drag.aim[axis] += Math.floor(difference + 0.35);
    else if (difference < -0.65) drag.aim[axis] += Math.ceil(difference - 0.35);
  }
  drag.aim = clampAim(drag.aim, piece);
  return { ...drag.aim };
}
