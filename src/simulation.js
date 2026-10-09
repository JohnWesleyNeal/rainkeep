export const SIZE = 16;
export const LIMIT = 80;
export const SPAWN_ALTITUDE = 7;
export function fallDuration(s) {
  return Math.max(2.8, 8 - s.turn * 0.055);
}
export function landingHeight(s, aim) {
  return Math.max(
    ...cells(s.current).map(([dx, dy]) => {
      const i = (aim.y + dy) * SIZE + aim.x + dx;
      return s.terrain[i] + s.water[i];
    }),
  );
}
export function accelerateDrop(s) {
  if (s.over || s.dropping) return false;
  s.dropping = true;
  return true;
}
export const SHAPES = [
  [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [1, 1],
  ],
  [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 2],
  ],
];
export const TYPES = {
  raise: { name: "Raise", label: "Build a bank", color: "#91b36a", icon: "↑" },
  lower: { name: "Lower", label: "Carve a basin", color: "#d7a476", icon: "↓" },
  rain: { name: "Rain", label: "Fill your lakes", color: "#63c8e9", icon: "●" },
  sun: { name: "Sun", label: "Evaporate & score", color: "#f4c86b", icon: "✦" },
};
export function random(s) {
  s.seed = (Math.imul(1664525, s.seed) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
export function piece(s, turn) {
  const type =
    turn < 3
      ? "raise"
      : turn === 3
        ? "rain"
        : turn === 6
          ? "sun"
          : ["raise", "raise", "raise", "rain", "rain", "lower", "sun"][
              Math.floor(random(s) * 7)
            ];
  return { type, shape: Math.floor(random(s) * SHAPES.length), rotation: 0 };
}
export function cells(p) {
  let points = SHAPES[p.shape].map(([x, y]) => [x, y]);
  for (let r = 0; r < p.rotation; r++) points = points.map(([x, y]) => [-y, x]);
  const minX = Math.min(...points.map((p) => p[0])),
    minY = Math.min(...points.map((p) => p[1]));
  return points.map(([x, y]) => [x - minX, y - minY]);
}
export function createGame(mode = "daydream", seed = Date.now() >>> 0) {
  const s = {
    version: 1,
    mode,
    seed,
    terrain: Array(SIZE * SIZE).fill(0.15),
    water: Array(SIZE * SIZE).fill(0),
    spill: 0,
    score: 0,
    turn: 0,
    elapsed: 0,
    remaining: 8,
    altitude: SPAWN_ALTITUDE,
    dropping: false,
    over: false,
  };
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      s.terrain[i] += (Math.sin(x * 1.4 + y * 0.7) + 1) * 0.035;
      if (x >= 4 && x <= 11 && y >= 4 && y <= 11) {
        s.terrain[i] = x === 4 || x === 11 || y === 4 || y === 11 ? 1.25 : 0.15;
        if (x > 4 && x < 11 && y > 4 && y < 11) s.water[i] = 0.43;
      }
    }
  s.current = piece(s, 0);
  s.next = piece(s, 1);
  return s;
}
export function validPlacement(p, x, y) {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    cells(p).every(
      ([dx, dy]) =>
        x + dx >= 0 && y + dy >= 0 && x + dx < SIZE && y + dy < SIZE,
    )
  );
}
export function waterTotal(s) {
  return s.water.reduce((a, b) => a + b, 0);
}
export function applyPiece(s, x, y) {
  if (s.over || !validPlacement(s.current, x, y)) return null;
  const type = s.current.type,
    targets = cells(s.current).map(([dx, dy]) => (y + dy) * SIZE + x + dx);
  let removed = 0;
  if (type === "sun") {
    const affected = new Set();
    for (const i of targets) {
      const tx = i % SIZE,
        ty = Math.floor(i / SIZE);
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          if (tx + dx >= 0 && tx + dx < SIZE && ty + dy >= 0 && ty + dy < SIZE)
            affected.add((ty + dy) * SIZE + tx + dx);
    }
    for (const i of affected) {
      removed += s.water[i];
      s.water[i] = 0;
    }
    s.score += Math.round(removed * 150);
    s.spill = Math.max(0, s.spill - removed * 0.65);
  } else
    for (const i of targets) {
      if (type === "raise") s.terrain[i] = Math.min(4, s.terrain[i] + 0.7);
      if (type === "lower") s.terrain[i] = Math.max(0, s.terrain[i] - 0.65);
      if (type === "rain") s.water[i] += 2.8 + Math.min(s.turn / 30, 1.8);
    }
  s.score += type === "rain" ? Math.round(waterTotal(s) * 4) : 10;
  s.turn++;
  s.current = s.next;
  s.next = piece(s, s.turn + 1);
  s.remaining = fallDuration(s);
  s.altitude = SPAWN_ALTITUDE;
  s.dropping = false;
  return { type, targets, removed };
}
// Conservative flux: each cell's outgoing flow is scaled to its available water.
// The outside is a sink. Every drop stays on the board or enters the spill gauge.
export function flow(s, dt = 1 / 30, leak = true) {
  const delta = new Float64Array(SIZE * SIZE);
  let lost = 0;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x,
        w = s.water[i];
      if (w < 1e-8) continue;
      const surface = s.terrain[i] + w,
        outlets = [];
      let sum = 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy,
          out = nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE;
        if (out && !leak) continue;
        const j = out ? -1 : ny * SIZE + nx,
          difference = surface - (out ? 0 : s.terrain[j] + s.water[j]);
        if (difference > 0) {
          const amount = difference * dt * 2.1;
          outlets.push([j, amount]);
          sum += amount;
        }
      }
      const factor = sum > w ? w / sum : 1;
      for (const [j, a] of outlets) {
        const v = a * factor;
        delta[i] -= v;
        if (j < 0) lost += v;
        else delta[j] += v;
      }
    }
  for (let i = 0; i < delta.length; i++)
    s.water[i] = Math.max(0, s.water[i] + delta[i]);
  s.spill += lost;
  if (s.spill >= LIMIT) s.over = true;
  return lost;
}
export function tick(s, dt, aim = s.aim || { x: 4, y: 4 }) {
  if (s.over) return;
  flow(s, dt);
  s.elapsed += dt;
  if (s.over || !validPlacement(s.current, aim.x, aim.y)) return;
  if (s.mode === "classic" || s.dropping) {
    const contact = landingHeight(s, aim);
    const speed = s.dropping ? 32 : SPAWN_ALTITUDE / fallDuration(s);
    s.altitude = Math.max(contact, s.altitude - speed * dt);
    s.remaining = Math.max(
      0,
      (s.altitude - contact) / (SPAWN_ALTITUDE / fallDuration(s)),
    );
    if (s.altitude <= contact + 1e-8) return applyPiece(s, aim.x, aim.y);
  }
}
export function restore(raw) {
  try {
    const s = typeof raw === "string" ? JSON.parse(raw) : structuredClone(raw);
    const finite = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
    const okPiece = (p) =>
      p &&
      Object.hasOwn(TYPES, p.type) &&
      Number.isInteger(p.shape) &&
      p.shape >= 0 &&
      p.shape < SHAPES.length &&
      Number.isInteger(p.rotation) &&
      p.rotation >= 0 &&
      p.rotation < 4;
    if (
      !s ||
      s.version !== 1 ||
      !["classic", "daydream"].includes(s.mode) ||
      !Number.isInteger(s.seed) ||
      !finite(s.seed, 0, 4294967295) ||
      !okPiece(s.current) ||
      !okPiece(s.next)
    )
      return null;
    if (
      !["terrain", "water"].every(
        (k) =>
          Array.isArray(s[k]) &&
          s[k].length === SIZE * SIZE &&
          s[k].every((n) => finite(n, 0, k === "terrain" ? 4 : 10000)),
      )
    )
      return null;
    if (
      !finite(s.spill, 0, 10000) ||
      !finite(s.score, 0, 1e12) ||
      !Number.isInteger(s.turn) ||
      !finite(s.turn, 0, 1e8) ||
      !finite(s.remaining, 0, 12) ||
      !finite(s.elapsed, 0, 1e10) ||
      typeof s.over !== "boolean"
    )
      return null;
    if (
      s.aim &&
      (!Number.isInteger(s.aim.x) ||
        !Number.isInteger(s.aim.y) ||
        !validPlacement(s.current, s.aim.x, s.aim.y))
    )
      return null;
    // Upgrade old runs in place, preserving their board, queue, score, and aim.
    if (s.altitude === undefined) {
      s.altitude =
        SPAWN_ALTITUDE *
        Math.min(1, s.remaining / Math.max(5, 12 - s.turn * 0.08));
      s.dropping = false;
    }
    if (
      !finite(s.altitude, 0, SPAWN_ALTITUDE) ||
      typeof s.dropping !== "boolean"
    )
      return null;
    return structuredClone(s);
  } catch {
    return null;
  }
}
