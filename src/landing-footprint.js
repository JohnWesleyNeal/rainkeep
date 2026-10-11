import { cells, SIZE } from "./simulation.js";

export function landingColor(s, preview) {
  if (preview.kind === "danger") return "#f39172";
  return {
    raise: "#ffc28b",
    lower: "#83dfcc",
    rain: "#8ce8ff",
    sun: "#ffe19a",
    bomb: "#f39172",
  }[s.current.type];
}

// Guidance points out a destination until the piece reaches it. Once there,
// the landing silhouette is the only aiming mark on the ground.
export function showLessonTarget(s, aim, target, showPiece) {
  if (!target) return false;
  if (!showPiece || s.over) return true;
  return !cells(s.current).some(([x, y]) => {
    const dx = Math.max(aim.x + x - target.x, 0, target.x - aim.x - x - 1);
    const dy = Math.max(aim.y + y - target.y, 0, target.y - aim.y - y - 1);
    return Math.hypot(dx, dy) <= target.radius;
  });
}

function clipDiagonal(points, diagonal, side) {
  const result = [];
  for (let n = 0; n < points.length; n++) {
    const a = points[n],
      b = points[(n + 1) % points.length];
    const da = (a[0] + a[1] - diagonal) * side;
    const db = (b[0] + b[1] - diagonal) * side;
    if (da <= 0) result.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}

// Split at the displayed terrain's grid and triangle boundaries. This keeps
// fractional aiming exact without floating steps or faces cutting into banks.
export function landingFootprint(s, preview, aim) {
  const exact = ["raise", "lower", "rain"].includes(s.current.type);
  const tiles = exact
    ? cells(s.current)
    : preview.indices.map((i) => [i % SIZE, Math.floor(i / SIZE)]);
  const ox = exact ? aim.x : 0,
    oy = exact ? aim.y : 0;
  const occupied = new Set(tiles.map(([x, y]) => `${x},${y}`));
  const faces = [],
    edges = [];
  for (const [tx, ty] of tiles) {
    const x = tx + ox,
      y = ty + oy;
    for (let iy = Math.floor(y); iy < Math.ceil(y + 1); iy++) {
      for (let ix = Math.floor(x); ix < Math.ceil(x + 1); ix++) {
        const l = Math.max(x, ix),
          r = Math.min(x + 1, ix + 1),
          t = Math.max(y, iy),
          b = Math.min(y + 1, iy + 1);
        for (const side of [1, -1]) {
          const polygon = clipDiagonal(
            [[l, t], [r, t], [r, b], [l, b]],
            ix + iy + 1,
            side,
          );
          for (let n = 1; n + 1 < polygon.length; n++) {
            const [a, b, c] = [polygon[0], polygon[n], polygon[n + 1]];
            const area = (b[0] - a[0]) * (c[1] - a[1]) -
              (c[0] - a[0]) * (b[1] - a[1]);
            if (Math.abs(area) > 1e-9)
              faces.push(...a, ...b, ...c);
          }
        }
      }
    }
    const corners = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
    const neighbors = [[tx, ty - 1], [tx + 1, ty], [tx, ty + 1], [tx - 1, ty]];
    for (let n = 0; n < 4; n++) {
      if (occupied.has(neighbors[n].join(","))) continue;
      const a = corners[n],
        b = corners[(n + 1) % 4],
        stops = [0, 1];
      // Axis-aligned edges cross both grid lines and terrain diagonals.
      for (const [start, end] of [
        [a[0], b[0]],
        [a[1], b[1]],
        [a[0] + a[1], b[0] + b[1]],
      ]) {
        if (start === end) continue;
        for (
          let k = Math.floor(Math.min(start, end)) + 1;
          k < Math.max(start, end);
          k++
        )
          stops.push((k - start) / (end - start));
      }
      stops.sort((a, b) => a - b);
      for (let k = 1; k < stops.length; k++) {
        if (stops[k] - stops[k - 1] < 1e-9) continue;
        for (const t of [stops[k - 1], stops[k]])
          edges.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      }
    }
  }
  return { faces, edges };
}
