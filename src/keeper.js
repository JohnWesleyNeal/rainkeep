// A permanent record of best work. Monotonic records cannot be farmed by reloads.
export const KEEPER_KEY = "rainkeep.keeper.v1";
export const RANKS = [
  { xp: 0, name: "Seedling", reward: "A quiet shore", icon: "·" },
  { xp: 300, name: "Pond tender", reward: "Wildflowers", icon: "✿" },
  { xp: 800, name: "Rain gardener", reward: "Reed gardens", icon: "❧" },
  { xp: 1600, name: "Grove keeper", reward: "Willow groves", icon: "♧" },
  { xp: 3000, name: "Lantern keeper", reward: "Warm lanterns", icon: "◇" },
  { xp: 5500, name: "Haven maker", reward: "Blossom trees", icon: "❀" },
  { xp: 9000, name: "Rainkeeper", reward: "A starlit haven", icon: "✦" },
];
export const DISCOVERIES = [
  {
    id: "lake",
    name: "A lake of your own",
    hint: "Evaporate a contained lake.",
    icon: "≈",
  },
  {
    id: "duck",
    name: "Good company",
    hint: "Evaporate a lake with a duck bonus.",
    icon: "♧",
  },
  {
    id: "three",
    name: "A gentle rhythm",
    hint: "Clear three contained lakes in one new free-play run.",
    icon: "Ⅲ",
  },
  {
    id: "chain",
    name: "Careful hands",
    hint: "Make three contained clears without dry Fire, a leaking clear, detonation or a quake.",
    icon: "∞",
  },
  {
    id: "water",
    name: "Every drop matters",
    hint: "Evaporate 600 contained water in one new free-play run.",
    icon: "◌",
  },
  {
    id: "repair",
    name: "Mended earth",
    hint: "Repair a connected opening with an Upper.",
    icon: "↥",
  },
  {
    id: "thaw",
    name: "Spring returns",
    hint: "Thaw a frozen lake with Fire.",
    icon: "❄",
  },
  {
    id: "mine",
    name: "Brave little spark",
    hint: "Detonate a mine with Fire.",
    icon: "✹",
  },
  {
    id: "rain",
    name: "After the shower",
    hint: "Keep a contained lake through a Meadow shower.",
    icon: "☂",
  },
  {
    id: "islands",
    name: "Island wanderer",
    hint: "Keep every island at least once.",
    icon: "⌁",
  },
];
export function readKeeper(raw) {
  let p;
  try {
    p = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {}
  const safeScore = (n) => (Number.isFinite(n) && n >= 0 && n <= 1e12 ? n : 0);
  return {
    version: 1,
    best: {
      classic: safeScore(p?.best?.classic),
      daydream: safeScore(p?.best?.daydream),
    },
    stars: Array.from({ length: 16 }, (_, i) =>
      Number.isInteger(p?.stars?.[i])
        ? Math.max(0, Math.min(3, p.stars[i]))
        : 0,
    ),
    discoveries: DISCOVERIES.filter(
      (d) => Array.isArray(p?.discoveries) && p.discoveries.includes(d.id),
    ).map((d) => d.id),
  };
}
export function keeperView(p) {
  const medals = p.stars.reduce((a, b) => a + b, 0),
    xp =
      medals * 150 +
      Math.floor((p.best.classic + p.best.daydream) / 20) +
      p.discoveries.length * 200;
  let rank = 0;
  while (rank < RANKS.length - 1 && xp >= RANKS[rank + 1].xp) rank++;
  const next = RANKS[rank + 1];
  return {
    ...RANKS[rank],
    rank,
    xp,
    medals,
    next,
    ratio: next ? (xp - RANKS[rank].xp) / (next.xp - RANKS[rank].xp) : 1,
  };
}
export function syncKeeper(p, { state, progress, records = [], event } = {}) {
  const before = JSON.stringify(p),
    previous = keeperView(p),
    found = new Set(p.discoveries);
  for (const mode of ["classic", "daydream"]) {
    for (const record of records)
      p.best[mode] = Math.max(p.best[mode], record[mode] || 0);
    if (state && !state.campaign && state.mode === mode)
      p.best[mode] = Math.max(p.best[mode], state.score);
  }
  if (progress)
    p.stars = p.stars.map((n, i) => Math.max(n, progress.stars[i] || 0));
  if (event?.contained && event.removed >= 12) {
    found.add("lake");
    if (event.scoreParts.ducks > 1) found.add("duck");
  }
  if (event?.repaired) found.add("repair");
  if (event?.thawed) found.add("thaw");
  if (event?.detonated) found.add("mine");
  if (state?.campaign?.keptShowers > 0) found.add("rain");
  if (state?.growth?.clears >= 3) found.add("three");
  if (state?.growth?.bestChain >= 3) found.add("chain");
  if (state?.growth?.water >= 600) found.add("water");
  if (p.stars.every((n) => n > 0)) found.add("islands");
  const added = [...found].filter((id) => !p.discoveries.includes(id));
  p.discoveries = DISCOVERIES.filter((d) => found.has(d.id)).map((d) => d.id);
  return {
    changed: before !== JSON.stringify(p),
    added,
    rankUp: keeperView(p).rank > previous.rank,
  };
}
