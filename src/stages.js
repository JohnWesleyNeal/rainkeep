import {
  createGame,
  piece,
  bonuses,
  containedLake,
  terrainPressure,
  LIMIT,
} from "./simulation.js";

const upper = (shape = 5) => ({ type: "raise", shape, rotation: 0 });
const lower = () => ({ type: "lower", shape: 2, rotation: 0 });
const water = (waterSize = 1) => ({
  type: "rain",
  shape: 0,
  rotation: 0,
  waterSize,
});
const fire = () => ({ type: "sun", shape: 2, rotation: 0 });
export const STAGES = [
  {
    name: "First Pond",
    goal: "Close the gap, fill your pond, then evaporate 25 water.",
    hint: "The long Upper starts beside the gap. A low bank is enough. Water goes inside; Fire clears it.",
    queue: [upper(), water(), fire(), upper(), water(), fire()],
    budget: 12,
    par: 4,
    evaporated: 25,
  },
  {
    name: "Two Little Lakes",
    goal: "Hold two separate contained lakes for 2 seconds.",
    hint: "Fill the two empty basins separately. Both need a little water; leave the dividing ground intact.",
    queue: [water(), water(), upper(), water(), fire()],
    budget: 16,
    par: 4,
    holdLakes: 2,
  },
  {
    name: "Duck Pond",
    goal: "Earn a duck and evaporate 60 water.",
    hint: "Fill this deeper pond until a duck arrives, then aim Fire at the lake.",
    queue: [water(), water(0), fire(), upper(), water(), fire()],
    budget: 15,
    par: 4,
    evaporated: 60,
    ducks: 1,
  },
  {
    name: "Patchwork",
    goal: "Patch a puncture, then evaporate 25 contained water.",
    hint: "An Upper touching the opening patches the connected hole. Refill if the lake drained before your repair.",
    queue: [upper(2), water(), fire(), upper(2), water(), fire()],
    budget: 15,
    par: 4,
    repairs: 1,
    evaporated: 25,
  },
  {
    name: "Thin Ice",
    goal: "Thaw the frozen lake, then evaporate 60 water.",
    hint: "The first Fire thaws ice. The next Fire evaporates the liquid lake. This ice waits for you.",
    queue: [fire(), fire(), water(), fire()],
    budget: 12,
    par: 3,
    thaws: 1,
    evaporated: 60,
  },
  {
    name: "Steady Ground",
    goal: "Blunt both towers and evaporate 25 water.",
    hint: "Overlap a Downer with a tower AND low ground. It levels to the lowest point. Continuous banks cost less pressure than narrow towers.",
    queue: [lower(), lower(), fire(), water(), fire(), lower()],
    budget: 18,
    par: 5,
    evaporated: 25,
    noSpikes: true,
  },
  {
    name: "Rain Dance",
    goal: "Evaporate two contained lakes. Keep the drain below 50%.",
    hint: "Two lakes mean two Fire landings. Aim at each in turn; don’t flatten the banks.",
    queue: [fire(), fire(), water(), upper(), fire()],
    budget: 16,
    par: 3,
    clears: 2,
    evaporated: 40,
    maxDrain: 0.5,
  },
  {
    name: "Falling Rain",
    goal: "Evaporate 60 contained water with falling pieces.",
    hint: "Pieces now descend on their own. Keep Water inside the bank and align Fire before contact; Drop accelerates it.",
    queue: [upper(), water(), water(), fire(), upper(), water(), fire()],
    budget: 20,
    par: 5,
    evaporated: 60,
    falling: true,
  },
  {
    name: "Minefield",
    goal: "Detonate a mine, patch its crater, then evaporate 25 water.",
    hint: "Thaw the lake, then use Fire while its mine is active. Patch the opening, refill and evaporate. Pause whenever you need to plan.",
    queue: [
      fire(),
      fire(),
      upper(2),
      water(),
      fire(),
      upper(2),
      water(),
      fire(),
    ],
    budget: 20,
    par: 6,
    detonations: 1,
    repairs: 1,
    evaporated: 25,
  },
  {
    name: "Aftershock",
    goal: "Earn a recovery bonus after rebuilding the broken bank.",
    hint: "Close the damaged bank, then keep a liquid lake contained for 2 seconds. You have 45 seconds of play time; pausing stops the clock.",
    queue: [upper(), upper(), water(), upper(), fire()],
    budget: 18,
    par: 3,
    recoveries: 1,
  },
  {
    name: "Lakes Apart",
    goal: "Hold three separate contained lakes for 2 seconds.",
    hint: "Water is falling. Feed each basin separately and avoid joining them. Small bubbles are enough.",
    queue: [water(0), water(0), water(0), upper(), water(0), fire()],
    budget: 22,
    par: 5,
    holdLakes: 3,
    falling: true,
  },
  {
    name: "Rainkeeper",
    goal: "Repair a hole, earn a duck, and evaporate twice without a quake.",
    hint: "Patch the pond and blunt the nearby tower. Build depth for a duck, clear the lake, then refill and clear it again.",
    queue: [
      upper(2),
      lower(),
      water(),
      water(),
      fire(),
      water(),
      water(),
      fire(),
      upper(),
      water(),
      fire(),
    ],
    budget: 28,
    par: 10,
    repairs: 1,
    ducks: 1,
    clears: 2,
    evaporated: 160,
    falling: true,
    noQuake: true,
  },
];

function pond(s, x, y, size, height = 2.8, depth = 0, wall = 2) {
  for (let cy = y; cy < y + size; cy++)
    for (let cx = x; cx < x + size; cx++) {
      const i = cy * 32 + cx,
        edge =
          cx < x + wall ||
          cx >= x + size - wall ||
          cy < y + wall ||
          cy >= y + size - wall;
      s.terrain[i] = edge ? height : 0;
      s.water[i] = edge ? 0 : depth;
    }
}
function hole(s, x, y) {
  for (let dy = 0; dy < 3; dy++)
    for (let dx = 0; dx < 3; dx++) {
      const i = (y + dy) * 32 + x + dx;
      s.holes[i] = true;
      s.terrain[i] = 0;
    }
}
export function createStage(id) {
  if (!Number.isInteger(id) || !STAGES[id]) throw new Error("Unknown stage");
  const def = STAGES[id],
    s = createGame("daydream", 1101 + id * 37);
  s.terrain.fill(0);
  s.water.fill(0);
  let aim = { x: 15, y: 15 };
  if (id === 0) {
    pond(s, 8, 8, 16);
    for (let y = 8; y < 10; y++)
      for (let x = 12; x < 20; x++) s.terrain[y * 32 + x] = 0;
    aim = { x: 11, y: 8 };
  } else if (id === 1 || id === 6) {
    pond(s, 2, 10, 12, 2.8, id === 6 ? 0.8 : 0);
    pond(s, 18, 10, 12, 2.8, id === 6 ? 0.8 : 0);
    aim = { x: 6, y: 14 };
  } else if (id === 2) {
    pond(s, 10, 10, 12, 4.2, 1.3);
    aim = { x: 14, y: 14 };
  } else if (id === 3) {
    pond(s, 8, 8, 16, 2.8, 0.8);
    hole(s, 13, 13);
    aim = { x: 12, y: 12 };
  } else if (id === 4 || id === 8) {
    pond(s, 8, 8, 16, 2.8, 1.1);
    for (let i = 0; i < s.water.length; i++) if (s.water[i]) s.ice[i] = 60;
    if (id === 8) s.mines = [{ i: 15 * 32 + 15, ttl: 20 }];
  } else if (id === 5) {
    pond(s, 8, 8, 16, 2.8, 1.1);
    for (const [x, y] of [
      [4, 4],
      [26, 25],
    ])
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) s.terrain[(y + dy) * 32 + x + dx] = 7;
    aim = { x: 3, y: 3 };
  } else if (id === 7) {
    pond(s, 8, 8, 16);
    aim = { x: 11, y: 8 };
  } else if (id === 9) {
    pond(s, 8, 8, 16, 2.8, 1.1);
    const damaged = [];
    for (let y = 8; y < 10; y++)
      for (let x = 12; x < 20; x++) {
        const i = y * 32 + x;
        s.terrain[i] = 0.4;
        damaged.push(i);
      }
    s.quakes = 1;
    s.recovery = { until: 45, damaged, rebuilt: false, stable: 0 };
    aim = { x: 11, y: 8 };
  } else if (id === 10) {
    pond(s, 2, 2, 10, 2.8, 0.3);
    pond(s, 20, 2, 10, 2.8, 0.3);
    pond(s, 11, 20, 10, 2.8, 0.3);
    aim = { x: 5, y: 5 };
  } else {
    pond(s, 10, 10, 12, 3.8, 0.6);
    hole(s, 14, 14);
    for (let y = 4; y < 6; y++)
      for (let x = 4; x < 6; x++) s.terrain[y * 32 + x] = 7;
    aim = { x: 13, y: 13 };
  }
  s.campaign = {
    id,
    status: "playing",
    queue: def.queue.map((p) => ({ ...p })),
    budget: def.budget,
    falling: !!def.falling,
    lockIce: id === 4 || id === 8,
    evaporated: 0,
    clears: 0,
    repairs: 0,
    thaws: 0,
    detonations: 0,
    recoveries: 0,
    stable: 0,
    peakDucks: 0,
    worstDrain: 0,
    startingQuakes: s.quakes,
  };
  s.current = piece(s, 0);
  s.next = piece(s, 1);
  s.aim = aim;
  s.level = def.falling ? 2 : 1;
  return s;
}

export function stageProgress(s) {
  const c = s.campaign,
    d = STAGES[c.id],
    requirements = [];
  const add = (label, now, target) => requirements.push({ label, now, target });
  if (d.repairs) add("Repair", Math.min(d.repairs, c.repairs), d.repairs);
  if (d.thaws) add("Thaw", c.thaws, d.thaws);
  if (d.detonations) add("Mine", c.detonations, d.detonations);
  if (d.recoveries) add("Recover", c.recoveries, d.recoveries);
  if (d.noSpikes)
    add("Blunt towers", terrainPressure(s).surcharge <= 0.01 ? 1 : 0, 1);
  if (d.ducks) add("Duck", c.peakDucks, d.ducks);
  if (d.clears) add("Clear lakes", c.clears, d.clears);
  if (d.evaporated) add("Evaporate", Math.floor(c.evaporated), d.evaporated);
  if (d.holdLakes)
    add("Hold " + d.holdLakes + " lakes", Math.min(2, c.stable), 2);
  const ratio =
    requirements.reduce((n, r) => n + Math.min(1, r.now / r.target), 0) /
    requirements.length;
  return {
    requirements,
    ratio,
    text: requirements
      .map(
        (r) =>
          r.label +
          " " +
          Math.min(r.now, r.target).toFixed(
            r.label.startsWith("Hold") ? 1 : 0,
          ) +
          "/" +
          r.target,
      )
      .join(" · "),
  };
}
export function stepStage(s, event, dt) {
  const c = s.campaign;
  if (!c || c.status !== "playing") return;
  const d = STAGES[c.id];
  if (event) {
    c.repairs += event.repaired || 0;
    c.thaws += event.thawed ? 1 : 0;
    c.detonations += event.detonated ? 1 : 0;
    if (event.contained && event.removed > 0) {
      c.evaporated += event.removed;
      c.clears++;
    }
  }
  const b = bonuses(s);
  c.peakDucks = Math.max(c.peakDucks, b.ducks);
  c.worstDrain = Math.max(c.worstDrain, s.spill / LIMIT);
  if (d.holdLakes)
    c.stable =
      b.groups.filter((l) => containedLake(s, l)).length >= d.holdLakes
        ? c.stable + dt
        : 0;
  if (
    s.over ||
    (d.maxDrain && c.worstDrain >= d.maxDrain) ||
    (d.noQuake && s.quakes > c.startingQuakes)
  ) {
    c.status = "failed";
    s.over = true;
    return;
  }
  if (stageProgress(s).ratio >= 1) {
    c.status = "complete";
    return;
  }
  if (s.turn >= c.budget) {
    c.status = "failed";
    s.over = true;
  }
}
export function stageStars(s) {
  const d = STAGES[s.campaign.id];
  return (
    1 +
    (s.turn <= d.par ? 1 : 0) +
    (s.turn <= d.par &&
    s.campaign.worstDrain <= 0.15 &&
    s.quakes === s.campaign.startingQuakes
      ? 1
      : 0)
  );
}
export function readProgress(raw) {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (
      !value ||
      !Array.isArray(value.stars) ||
      value.stars.length !== 12 ||
      !value.stars.every((n) => Number.isInteger(n) && n >= 0 && n <= 3)
    )
      return { stars: Array(12).fill(0) };
    return { stars: [...value.stars] };
  } catch {
    return { stars: Array(12).fill(0) };
  }
}
export function unlockedStages(progress) {
  let n = 1;
  while (n < 12 && progress.stars[n - 1] > 0) n++;
  return n;
}
export function finishStage(progress, s) {
  const next = readProgress(progress);
  if (s.campaign?.status === "complete")
    next.stars[s.campaign.id] = Math.max(
      next.stars[s.campaign.id],
      stageStars(s),
    );
  return next;
}
