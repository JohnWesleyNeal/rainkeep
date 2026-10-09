// Two terrain samples per old tile allow half-tile offsets and thin overlapping banks.
export const SIZE = 32;
export const LIMIT = 640;
export const SPAWN_ALTITUDE = 14;
export const MAX_HEIGHT = 8;
export const QUAKE_LIMIT = 720;
export const LEVEL_SECONDS = 120;
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
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
  ],
  [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 3],
    [2, 3],
    [3, 3],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [0, 1],
    [3, 1],
    [0, 2],
    [3, 2],
    [0, 3],
    [1, 3],
    [2, 3],
    [3, 3],
  ],
];
export const TYPES = {
  raise: {
    name: "Upper",
    label: "Build & repair banks",
    color: "#dc8265",
    icon: "↑",
  },
  lower: {
    name: "Downer",
    label: "Level to the lowest point",
    color: "#91b36a",
    icon: "↓",
  },
  rain: {
    name: "Water",
    label: "Fill an enclosure",
    color: "#63c8e9",
    icon: "●",
  },
  sun: {
    name: "Fireball",
    label: "Evaporate a connected lake",
    color: "#efad54",
    icon: "✦",
  },
  bomb: {
    name: "Bomb",
    label: "Keep it away from your lakes",
    color: "#667484",
    icon: "✹",
  },
};
export function random(s) {
  s.seed = (Math.imul(1664525, s.seed) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
export function piece(s, turn) {
  const opening = [5, 6, 5, 7, 5, 6, 5, 7, 5, 6, 5, 7];
  let type;
  if (turn < opening.length) type = "raise";
  else if (turn === 12 || turn === 13 || turn === 15) type = "rain";
  else if (turn === 14) type = "lower";
  else if (turn === 16) type = "sun";
  else if (turn === 18) type = "bomb";
  else
    type = [
      "raise",
      "raise",
      "raise",
      "rain",
      "rain",
      "rain",
      "lower",
      "sun",
      "bomb",
    ][Math.floor(random(s) * 9)];
  return {
    type,
    shape:
      turn < opening.length
        ? opening[turn]
        : Math.floor(random(s) * SHAPES.length),
    rotation: 0,
  };
}
export function cells(p) {
  if (!["raise", "lower"].includes(p.type)) return [[0, 0]];
  let points = SHAPES[p.shape].flatMap(([x, y]) => [
    [x * 2, y * 2],
    [x * 2 + 1, y * 2],
    [x * 2, y * 2 + 1],
    [x * 2 + 1, y * 2 + 1],
  ]);
  for (let r = 0; r < p.rotation; r++) points = points.map(([x, y]) => [-y, x]);
  const minX = Math.min(...points.map((p) => p[0])),
    minY = Math.min(...points.map((p) => p[1]));
  return points.map(([x, y]) => [x - minX, y - minY]);
}
export function createGame(mode = "classic", seed = Date.now() >>> 0) {
  const s = {
    version: 3,
    mode,
    seed,
    terrain: Array(SIZE * SIZE).fill(0),
    water: Array(SIZE * SIZE).fill(0),
    holes: Array(SIZE * SIZE).fill(false),
    ice: Array(SIZE * SIZE).fill(0),
    leaks: Array(SIZE * SIZE).fill(0),
    spill: 0,
    score: 0,
    turn: 0,
    elapsed: 0,
    remaining: 8,
    altitude: SPAWN_ALTITUDE,
    dropping: false,
    over: false,
    level: 1,
    smartBombs: 0,
    quakes: 0,
    hazards: [],
    mines: [],
    rainClock: 0,
    iceClock: 0,
    mineClock: 0,
    notice: "",
    noticeUntil: 0,
  };
  // The optional practice mode keeps a demonstration lake. Classic starts empty.
  if (mode === "daydream")
    for (let y = 8; y <= 23; y++)
      for (let x = 8; x <= 23; x++) {
        const i = y * SIZE + x;
        s.terrain[i] = x < 10 || x > 21 || y < 10 || y > 21 ? 2.8 : 0;
        if (x >= 10 && x <= 21 && y >= 10 && y <= 21) s.water[i] = 1.1;
      }
  s.current = piece(s, 0);
  s.next = piece(s, 1);
  return s;
}
export function validPlacement(p, x, y) {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    cells(p).every(
      ([dx, dy]) =>
        x + dx >= 0 && y + dy >= 0 && x + dx + 1 <= SIZE && y + dy + 1 <= SIZE,
    )
  );
}
// Integrate the actual piece footprint over the terrain samples. A partial
// overlap raises a lower bank, so imperfect seams affect water containment.
export function footprint(p, x, y) {
  if (!validPlacement(p, x, y)) return [];
  const coverage = new Map();
  for (const [dx, dy] of cells(p)) {
    const left = x + dx,
      top = y + dy;
    for (let cy = Math.floor(top); cy < Math.ceil(top + 1); cy++)
      for (let cx = Math.floor(left); cx < Math.ceil(left + 1); cx++) {
        const weight =
          (Math.min(cx + 1, left + 1) - Math.max(cx, left)) *
          (Math.min(cy + 1, top + 1) - Math.max(cy, top));
        if (weight > 1e-9) {
          const i = cy * SIZE + cx;
          coverage.set(i, Math.min(1, (coverage.get(i) || 0) + weight));
        }
      }
  }
  return [...coverage].map(([i, weight]) => ({ i, weight }));
}
export const waterTotal = (s) => s.water.reduce((a, b) => a + b, 0);
export const landMass = (s) => s.terrain.reduce((a, b) => a + b, 0);
export const fallDuration = (s) => Math.max(2.8, 8 - (s.level - 1) * 0.55);
export function landingHeight(s, aim) {
  return Math.max(
    0,
    ...footprint(s.current, aim.x, aim.y).map(
      ({ i }) => s.terrain[i] + s.water[i],
    ),
  );
}
export function accelerateDrop(s) {
  if (s.over || s.dropping) return false;
  s.dropping = true;
  return true;
}
const neighbors = (i) =>
  [
    i % SIZE ? i - 1 : -1,
    i % SIZE < SIZE - 1 ? i + 1 : -1,
    i >= SIZE ? i - SIZE : -1,
    i < SIZE * (SIZE - 1) ? i + SIZE : -1,
  ].filter((j) => j >= 0);
export function lakes(s) {
  const seen = new Set(),
    result = [];
  for (let i = 0; i < s.water.length; i++) {
    if (seen.has(i) || s.water[i] < 0.12 || s.holes[i]) continue;
    const group = [],
      stack = [i];
    seen.add(i);
    while (stack.length) {
      const j = stack.pop();
      group.push(j);
      for (const k of neighbors(j))
        if (!seen.has(k) && s.water[k] >= 0.12 && !s.holes[k]) {
          seen.add(k);
          stack.push(k);
        }
    }
    if (group.length >= 4)
      result.push({
        cells: group,
        volume: group.reduce((n, j) => n + s.water[j], 0),
        depth: Math.max(...group.map((j) => s.water[j])),
        frozen: group.some((j) => s.ice[j] > 0),
        duck:
          group.length >= 8 &&
          group.filter((j) => s.water[j] >= 2.5).length >= 4,
      });
  }
  return result;
}
export function bonuses(s) {
  const groups = lakes(s),
    ducks = groups.filter((l) => l.duck && !l.frozen).length;
  const liquid = s.water.reduce((n, w, i) => n + (s.ice[i] > 0 ? 0 : w), 0);
  const rainbow = liquid >= 440;
  return {
    lakes: groups.length,
    ducks,
    rainbow,
    multiplier:
      s.level *
      Math.max(1, groups.length) *
      Math.max(1, ducks * 2) *
      (rainbow ? 10 : 1),
    groups,
  };
}
function announce(s, text) {
  s.notice = text;
  s.noticeUntil = s.elapsed + 3.5;
}
function area(x, y, radius) {
  const a = [];
  for (
    let cy = Math.max(0, Math.floor(y - radius));
    cy <= Math.min(SIZE - 1, Math.ceil(y + radius));
    cy++
  )
    for (
      let cx = Math.max(0, Math.floor(x - radius));
      cx <= Math.min(SIZE - 1, Math.ceil(x + radius));
      cx++
    )
      if ((cx - x) ** 2 + (cy - y) ** 2 <= radius * radius + 1)
        a.push(cy * SIZE + cx);
  return a;
}
function queueHazard(s, type, x, y) {
  s.hazards.push({ type, x, y, altitude: SPAWN_ALTITUDE });
}
export function explode(s, x, y) {
  const i =
      Math.min(SIZE - 1, Math.floor(y + 0.5)) * SIZE +
      Math.min(SIZE - 1, Math.floor(x + 0.5)),
    repeat = s.holes[i],
    targets = area(x, y, 2);
  for (const j of targets) {
    s.terrain[j] = 0;
    s.holes[j] = true;
  }
  if (repeat) {
    // Children fall over time; a hole hit can start another bounded wave.
    for (let n = 0; n < 3 && s.hazards.length < 12; n++)
      queueHazard(
        s,
        "bomb",
        Math.floor(random(s) * SIZE),
        Math.floor(random(s) * SIZE),
      );
    announce(s, "Re-bomb! Three more bombs incoming.");
  } else announce(s, "Hole opened. Patch it with an Upper.");
  return targets;
}
export function earthquake(s) {
  const targets = [];
  for (let i = 0; i < s.terrain.length; i++)
    if (s.terrain[i] > 0 && random(s) < 0.65) {
      s.terrain[i] *= 0.25;
      targets.push(i);
    }
  s.quakes++;
  announce(s, "Earthquake! Too much land. Rebuild the banks.");
  return targets;
}
export function smartBomb(s) {
  if (s.over || s.smartBombs < 1) return false;
  s.smartBombs--;
  s.terrain.fill(0);
  s.water.fill(0);
  s.holes.fill(false);
  s.ice.fill(0);
  s.leaks.fill(0);
  s.spill = 0;
  s.hazards = [];
  s.mines = [];
  announce(s, "Smart bomb: a fresh board. Your score stays.");
  return true;
}
export function applyPiece(s, x, y) {
  if (s.over || !validPlacement(s.current, x, y)) return null;
  const committedPiece = { ...s.current };
  const contactHeight = landingHeight(s, { x, y });
  const type = s.current.type,
    coverage = footprint(s.current, x, y),
    targets = coverage.map(({ i }) => i),
    center = Math.floor(y + 0.5) * SIZE + Math.floor(x + 0.5),
    bonus = bonuses(s);
  let removed = 0,
    points = 0,
    repaired = 0,
    quake = false,
    feedbackCells = targets,
    detonated = false;
  if (type === "raise") {
    // Touch any part of a connected hole and patch the whole puncture first.
    const repair = new Set(targets.filter((i) => s.holes[i])),
      stack = [...repair];
    while (stack.length)
      for (const j of neighbors(stack.pop()))
        if (s.holes[j] && !repair.has(j)) {
          repair.add(j);
          stack.push(j);
        }
    for (const i of repair) {
      s.holes[i] = false;
      repaired++;
    }
    for (const { i, weight } of coverage)
      if (!repair.has(i))
        s.terrain[i] = Math.min(MAX_HEIGHT, s.terrain[i] + 1.4 * weight);
    points = repaired ? 100 : 0;
  } else if (type === "lower") {
    const lowest = Math.min(...targets.map((i) => s.terrain[i])),
      puncture = targets.some((i) => s.holes[i]);
    for (const { i, weight } of coverage) {
      s.terrain[i] += (lowest - s.terrain[i]) * weight;
      s.water[i] *= 1 - weight;
      s.ice[i] = 0;
      if (puncture) s.holes[i] = true;
    }
  } else if (type === "rain") {
    for (const { i, weight } of coverage) {
      const patch = area(i % SIZE, Math.floor(i / SIZE), 2).filter(
        (j) => s.terrain[j] <= s.terrain[i] + 0.01,
      );
      for (const j of patch) {
        s.water[j] += ((64 + s.level * 8) * weight) / patch.length;
        if (s.ice[i] > 0) s.ice[j] = Math.max(s.ice[j], s.ice[i]);
      }
    }
  } else if (type === "sun") {
    const hit = bonus.groups.find((l) => l.cells.includes(center));
    if (hit?.frozen) {
      for (const i of hit.cells) s.ice[i] = 0;
      announce(s, "Fire thawed the lake. Water remains.");
    } else if (hit) {
      const mines = s.mines.filter((m) => hit.cells.includes(m.i));
      if (mines.length) {
        detonated = true;
        for (const m of mines) explode(s, m.i % SIZE, Math.floor(m.i / SIZE));
        s.mines = s.mines.filter((m) => !mines.includes(m));
        announce(s, "Mine detonated! Repair the hole.");
      } else {
        feedbackCells = hit.cells;
        for (const i of hit.cells) {
          removed += s.water[i];
          s.water[i] = 0;
        }
        points = Math.round(removed * 20);
        s.spill = Math.max(0, s.spill - removed);
      }
    } else {
      for (const i of area(x, y, 2))
        s.terrain[i] = Math.max(0, s.terrain[i] - 2.8);
      announce(s, "Dry fire flattened land. No hole created.");
    }
  } else if (type === "bomb") explode(s, x, y);
  if (landMass(s) >= QUAKE_LIMIT) {
    earthquake(s);
    quake = true;
  }
  if (s.dropping) points += 5;
  const earned = points * bonus.multiplier;
  s.score += earned;
  s.turn++;
  s.current = s.next;
  s.next = piece(s, s.turn + 1);
  s.remaining = fallDuration(s);
  s.altitude = SPAWN_ALTITUDE;
  s.dropping = false;
  return {
    type,
    piece: committedPiece,
    contactHeight,
    x,
    y,
    targets,
    removed,
    repaired,
    feedbackCells,
    detonated,
    quake,
    earned,
    multiplier: bonus.multiplier,
  };
}
// Conservative flux: every drop remains on the board or enters the drain.
export function flow(s, dt = 1 / 30, leak = true) {
  const delta = new Float64Array(SIZE * SIZE);
  let lost = 0;
  s.leaks.fill(0);
  for (let i = 0; i < s.water.length; i++) {
    const w = s.water[i];
    if (w < 1e-8 || s.ice[i] > 0) continue;
    if (s.holes[i] && leak) {
      const v = Math.min(w, dt * 18);
      delta[i] -= v;
      lost += v;
      s.leaks[i] += v;
      continue;
    }
    const x = i % SIZE,
      y = Math.floor(i / SIZE),
      surface = s.terrain[i] + w,
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
      const j = out ? -1 : ny * SIZE + nx;
      if (j >= 0 && s.ice[j] > 0) continue;
      const difference =
        surface - (out || (s.holes[j] && leak) ? 0 : s.terrain[j] + s.water[j]);
      if (difference > 0) {
        const amount = difference * dt * 4.2;
        outlets.push([j, amount]);
        sum += amount;
      }
    }
    const factor = sum > w ? w / sum : 1;
    for (const [j, a] of outlets) {
      const v = a * factor;
      delta[i] -= v;
      if (j < 0) {
        lost += v;
        s.leaks[i] += v;
      } else delta[j] += v;
    }
  }
  for (let i = 0; i < delta.length; i++)
    s.water[i] = Math.max(0, s.water[i] + delta[i]);
  s.spill += lost;
  if (s.spill >= LIMIT) s.over = true;
  return lost;
}
export function freezeLake(s, x, y) {
  const hit = lakes(s).find((l) => l.cells.includes(y * SIZE + x));
  if (hit) {
    for (const i of hit.cells) s.ice[i] = 16;
    announce(s, "Lake frozen. Fire thaws it; Downers erase ice.");
  } else {
    const points = 250 * bonuses(s).multiplier;
    s.score += points;
    announce(s, `Dry ice! +${points}`);
  }
}
function events(s, dt) {
  for (let i = 0; i < s.ice.length; i++) s.ice[i] = Math.max(0, s.ice[i] - dt);
  const level = Math.min(10, 1 + Math.floor(s.elapsed / LEVEL_SECONDS));
  if (level > s.level) {
    if (bonuses(s).lakes >= 5) s.smartBombs = Math.min(9, s.smartBombs + 1);
    s.level = level;
    announce(
      s,
      `Level ${level}. Faster falls${s.smartBombs ? " · Smart bomb ready" : ""}.`,
    );
  }
  if (s.mode === "classic" && s.elapsed > 55 && s.turn >= 12) {
    s.rainClock += dt;
    while (s.rainClock >= 0.24) {
      s.rainClock -= 0.24;
      const i = Math.floor(random(s) * s.water.length);
      s.water[i] += 0.12 + s.level * 0.025;
    }
  }
  if (s.mode === "classic" && s.level >= 2) {
    s.iceClock += dt;
    if (s.iceClock > 24) {
      s.iceClock = 0;
      const i = Math.floor(random(s) * s.water.length);
      queueHazard(s, "ice", i % SIZE, Math.floor(i / SIZE));
      announce(s, "Ice incoming. Build dry land under it for a bonus.");
    }
  }
  if (s.mode === "classic" && s.level >= 4) {
    s.mineClock += dt;
    if (s.mineClock > 30) {
      s.mineClock = 0;
      const biggest = lakes(s).sort((a, b) => b.volume - a.volume)[0];
      if (biggest) {
        const i = biggest.cells[Math.floor(random(s) * biggest.cells.length)];
        queueHazard(s, "mine", i % SIZE, Math.floor(i / SIZE));
        announce(s, "Mine incoming. Avoid fire until it disappears.");
      }
    }
  }
  const incoming = s.hazards;
  s.hazards = [];
  for (const h of incoming) {
    const i = h.y * SIZE + h.x;
    h.altitude -= dt * 6;
    if (h.altitude > s.terrain[i] + s.water[i]) {
      if (s.hazards.length < 24) s.hazards.push(h);
      continue;
    }
    if (h.type === "bomb") explode(s, h.x, h.y);
    if (h.type === "ice") freezeLake(s, h.x, h.y);
    if (h.type === "mine" && s.water[i] > 0.12) s.mines.push({ i, ttl: 20 });
  }
  s.mines = s.mines.filter((m) => {
    if (s.ice[m.i] <= 0) m.ttl -= dt * (s.water[m.i] > 0.12 ? 1 : 4);
    return m.ttl > 0;
  });
}
export function tick(s, dt, aim = s.aim || { x: 8, y: 8 }) {
  if (s.over) return;
  s.elapsed += dt;
  events(s, dt);
  flow(s, dt);
  if (s.over || !validPlacement(s.current, aim.x, aim.y)) return;
  if (s.mode === "classic" || s.dropping) {
    const contact = landingHeight(s, aim),
      speed = s.dropping ? 64 : SPAWN_ALTITUDE / fallDuration(s);
    s.altitude = Math.max(0, s.altitude - speed * dt);
    s.remaining = Math.max(
      0,
      (s.altitude - contact) / (SPAWN_ALTITUDE / fallDuration(s)),
    );
    if (s.altitude <= contact + 1e-8) return applyPiece(s, aim.x, aim.y);
  }
}
export function restore(raw) {
  try {
    let s = typeof raw === "string" ? JSON.parse(raw) : structuredClone(raw);
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
      ![1, 2, 3].includes(s.version) ||
      !["classic", "daydream"].includes(s.mode) ||
      !Number.isInteger(s.seed) ||
      !finite(s.seed, 0, 4294967295) ||
      !okPiece(s.current) ||
      !okPiece(s.next)
    )
      return null;
    const old = s.version === 1,
      size = old ? 16 : SIZE;
    if (
      !["terrain", "water"].every(
        (k) =>
          Array.isArray(s[k]) &&
          s[k].length === size * size &&
          s[k].every((n) =>
            finite(n, 0, k === "terrain" ? (old ? 4 : MAX_HEIGHT) : 10000),
          ),
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
    if (s.altitude === undefined && old) {
      s.altitude =
        7 * Math.min(1, s.remaining / Math.max(5, 12 - s.turn * 0.08));
      s.dropping = false;
    }
    if (
      !finite(s.altitude, 0, old ? 7 : SPAWN_ALTITUDE) ||
      typeof s.dropping !== "boolean"
    )
      return null;
    if (old) {
      if (s.aim && (!Number.isInteger(s.aim.x) || !Number.isInteger(s.aim.y)))
        return null;
      const upgraded = createGame(s.mode, s.seed),
        expand = (array) =>
          Array.from(
            { length: SIZE * SIZE },
            (_, i) =>
              array[
                Math.floor(i / SIZE / 2) * 16 + Math.floor((i % SIZE) / 2)
              ] * 2,
          );
      s = {
        ...upgraded,
        ...s,
        version: 3,
        terrain: expand(s.terrain),
        water: expand(s.water),
        spill: s.spill * 8,
        altitude: s.altitude * 2,
        aim: s.aim ? { x: s.aim.x * 2, y: s.aim.y * 2 } : undefined,
        level: Math.min(10, 1 + Math.floor(s.elapsed / LEVEL_SECONDS)),
      };
    }
    if (s.aim && !validPlacement(s.current, s.aim.x, s.aim.y)) return null;
    if (
      !Array.isArray(s.holes) ||
      s.holes.length !== SIZE * SIZE ||
      !s.holes.every((n) => typeof n === "boolean")
    )
      return null;
    for (const key of ["ice", "leaks"])
      if (
        !Array.isArray(s[key]) ||
        s[key].length !== SIZE * SIZE ||
        !s[key].every((n) => finite(n, 0, 10000))
      )
        return null;
    for (const key of ["rainClock", "iceClock", "mineClock", "noticeUntil"])
      if (!finite(s[key], 0, 1e10)) return null;
    if (
      !Number.isInteger(s.level) ||
      !finite(s.level, 1, 10) ||
      !Number.isInteger(s.smartBombs) ||
      !finite(s.smartBombs, 0, 9) ||
      !Number.isInteger(s.quakes) ||
      !finite(s.quakes, 0, 1e8) ||
      typeof s.notice !== "string" ||
      s.notice.length > 250
    )
      return null;
    if (
      !Array.isArray(s.hazards) ||
      s.hazards.length > 24 ||
      !s.hazards.every(
        (h) =>
          ["ice", "mine", "bomb"].includes(h.type) &&
          Number.isInteger(h.x) &&
          Number.isInteger(h.y) &&
          finite(h.x, 0, SIZE - 1) &&
          finite(h.y, 0, SIZE - 1) &&
          finite(h.altitude, 0, SPAWN_ALTITUDE),
      )
    )
      return null;
    if (
      !Array.isArray(s.mines) ||
      s.mines.length > 100 ||
      !s.mines.every(
        (m) =>
          Number.isInteger(m.i) &&
          finite(m.i, 0, SIZE * SIZE - 1) &&
          finite(m.ttl, 0, 20),
      )
    )
      return null;
    s.version = 3;
    return s;
  } catch {
    return null;
  }
}
