import { SIZE } from "./simulation.js";

// Presentation only: liquid level beside a bank and its remaining headroom.
// Keep this independent of the water solver and the saved game format.
export function waterlineField(s) {
  const field = new Float32Array(SIZE * SIZE * 4);
  for (let i = 0; i < s.water.length; i++) {
    if (s.holes[i]) continue;
    const x = i % SIZE,
      y = Math.floor(i / SIZE);
    let candidates = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx,
          ny = y + dy,
          j = ny * SIZE + nx;
        if (
          nx < 0 ||
          ny < 0 ||
          nx >= SIZE ||
          ny >= SIZE ||
          s.holes[j] ||
          s.water[j] < 0.08
        )
          continue;
        candidates.push(j);
      }
    if (!candidates.length) continue;
    // Shore films must not pull the bank's reference level up above its pond.
    const bed = Math.min(...candidates.map((j) => s.terrain[j]));
    candidates = candidates.filter((j) => s.terrain[j] <= bed + 0.25);
    const level =
      candidates.reduce((n, j) => n + s.terrain[j] + s.water[j], 0) /
      candidates.length;
    const onBank = s.terrain[i] > bed + 0.3;
    let crest = onBank ? s.terrain[i] : Infinity;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx,
          ny = y + dy;
        if (!onBank && nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE) {
          const h = s.terrain[ny * SIZE + nx];
          if (h > bed + 0.3) crest = Math.min(crest, h);
        }
      }
    if (!Number.isFinite(crest)) crest = 0;
    const frozen = candidates.some((j) => s.ice[j] > 0);
    field.set(
      [
        level,
        1,
        frozen || crest <= bed + 0.3
          ? 0
          : Math.min(1, Math.max(0, 1 - (crest - level) / 0.6)),
        frozen ? 1 : 0,
      ],
      i * 4,
    );
  }
  return field;
}

// Raised, wet crests with a downhill head gradient are actively pouring.
// These are local bank crossings, separate from the island's drain mouths.
export function bankSpills(s, limit = 48) {
  const result = [];
  for (let i = 0; i < s.water.length; i++) {
    if (s.holes[i] || s.ice[i] > 0 || s.water[i] < 0.025 || s.terrain[i] < 0.45)
      continue;
    const x = i % SIZE,
      y = Math.floor(i / SIZE),
      head = s.terrain[i] + s.water[i];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy,
        j = ny * SIZE + nx;
      if (
        nx < 0 ||
        ny < 0 ||
        nx >= SIZE ||
        ny >= SIZE ||
        s.ice[j] > 0 ||
        s.terrain[i] - s.terrain[j] < 0.45
      )
        continue;
      const difference = head - s.terrain[j] - s.water[j];
      if (difference > 0.025)
        result.push({
          from: i,
          to: j,
          rate: Math.min(s.water[i], difference * 0.14),
          top: head,
          bottom: s.terrain[j] + s.water[j],
        });
    }
  }
  return result.sort((a, b) => b.rate - a.rate).slice(0, limit);
}

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
