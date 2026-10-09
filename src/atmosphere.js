import { SIZE } from "./simulation.js";

export function evaporationProfile(event) {
  const strength = Math.min(1, Math.max(0, (event.removed || 0) / 160));
  return {
    strength,
    steam: Math.round(12 + strength * 36),
    life: 0.85 + strength * 1.45,
  };
}

// Follow the actual wet surface upstream from the strongest escape mouths.
// Paths stop where a head gradient disappears; they never invent a dry route.
export function leakPaths(s, limit = 8) {
  const heads = s.terrain.map((h, i) => h + s.water[i]);
  const sources = s.leaks
    .map((rate, i) => ({ i, rate }))
    .filter(({ rate }) => rate > 0.0005)
    .sort((a, b) => b.rate - a.rate);
  const paths = [];
  for (const { i, rate } of sources) {
    if (
      paths.some(
        (p) =>
          Math.hypot(
            (p.mouth % SIZE) - (i % SIZE),
            Math.floor(p.mouth / SIZE) - Math.floor(i / SIZE),
          ) < 3,
      )
    )
      continue;
    const route = [i],
      seen = new Set(route);
    while (route.length < 14) {
      const j = route.at(-1),
        x = j % SIZE;
      const candidates = [
        x ? j - 1 : -1,
        x < SIZE - 1 ? j + 1 : -1,
        j - SIZE,
        j + SIZE,
      ]
        .filter(
          (k) =>
            k >= 0 &&
            k < SIZE * SIZE &&
            !seen.has(k) &&
            !s.holes[k] &&
            s.ice[k] <= 0 &&
            s.water[k] > 0.025 &&
            heads[k] > heads[j] + 0.003,
        )
        .sort((a, b) => heads[b] - heads[a]);
      if (!candidates.length) break;
      route.push(candidates[0]);
      seen.add(candidates[0]);
    }
    paths.push({ mouth: i, rate, route });
    if (paths.length >= limit) break;
  }
  return paths;
}
