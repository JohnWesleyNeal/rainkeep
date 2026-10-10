// Weather owns its own counter, so showers never change the piece queue's seed.
export const WEATHER_CYCLE = 64;
export const WEATHER_RAIN_START = 26;
export const WEATHER_RAIN_END = 38;
export const WEATHER_KINDS = ["meadow", "meadow-heavy", "classic"];
export function createWeather(kind = "meadow", clock = 0) {
  return { kind, clock, drops: 0, rainClock: 0, showers: 0 };
}
export function validWeather(w) {
  return (
    w &&
    WEATHER_KINDS.includes(w.kind) &&
    ["clock", "rainClock"].every(
      (k) => Number.isFinite(w[k]) && w[k] >= 0 && w[k] < 1e10,
    ) &&
    ["drops", "showers"].every(
      (k) => Number.isInteger(w[k]) && w[k] >= 0 && w[k] < 1e10,
    ) &&
    w.rainClock < 0.121
  );
}
export function weatherView(s) {
  const w = s.weather;
  if (!w)
    return {
      phase: "fair",
      cloud: 0,
      rain: 0,
      seconds: 0,
      label: "Fair skies",
    };
  if (s.campaign?.status === "complete")
    return {
      phase: "kept",
      cloud: 0,
      rain: 0,
      seconds: 0,
      label: "Sunshine · island kept",
    };
  const t = w.clock % WEATHER_CYCLE;
  if (t < 18)
    return {
      phase: "prepare",
      cloud: 0.08,
      rain: 0,
      seconds: Math.ceil(26 - t),
      label: "Shower in " + Math.ceil(26 - t) + "s",
    };
  if (t < 26)
    return {
      phase: "gather",
      cloud: 0.08 + ((t - 18) / 8) * 0.8,
      rain: 0,
      seconds: Math.ceil(26 - t),
      label: "Clouds gathering · " + Math.ceil(26 - t) + "s",
    };
  if (t < 38)
    return {
      phase: "shower",
      cloud: 0.88,
      rain: w.kind === "meadow-heavy" ? 1 : 0.7,
      seconds: Math.ceil(38 - t),
      label: "Shower · " + Math.ceil(38 - t) + "s",
    };
  if (t < 48)
    return {
      phase: "clearing",
      cloud: (0.88 * (48 - t)) / 10,
      rain: 0,
      seconds: Math.ceil(48 - t),
      label: "Clouds parting",
    };
  return {
    phase: "sunshine",
    cloud: 0,
    rain: 0,
    seconds: Math.ceil(90 - t),
    label: "Sunshine · shower in " + Math.ceil(90 - t) + "s",
  };
}
export function rainPoint(drop, kind = "meadow") {
  const hash = (n) =>
    ((Math.imul(n ^ 0x45d9f3b, 0x45d9f3b) >>> 0) % 100003) / 100003;
  const margin = kind === "classic" ? 1 : 6,
    span = 32 - margin * 2;
  return {
    x: margin + hash(drop * 2 + 1) * span,
    y: margin + hash(drop * 2 + 2) * span,
  };
}
export function stepWeather(s, dt) {
  const w = s.weather;
  if (!w || dt <= 0 || s.over || s.campaign?.status === "complete") return;
  const end = w.clock + dt;
  let cursor = w.clock,
    wet = 0;
  while (cursor < end) {
    const base = Math.floor(cursor / WEATHER_CYCLE) * WEATHER_CYCLE;
    const stop = Math.min(end, base + WEATHER_CYCLE);
    wet += Math.max(0, Math.min(stop, base + 38) - Math.max(cursor, base + 26));
    if (cursor < base + 38 && stop >= base + 38) w.showers++;
    cursor = stop;
  }
  w.clock = end;
  w.rainClock += wet;
  const amount =
    w.kind === "meadow-heavy"
      ? 1.44
      : w.kind === "classic"
        ? 0.38 + s.level * 0.055
        : 0.96;
  while (w.rainClock >= 0.12 - 1e-9) {
    w.rainClock = Math.max(0, w.rainClock - 0.12);
    const p = rainPoint(w.drops++, w.kind);
    s.water[Math.floor(p.y) * 32 + Math.floor(p.x)] += amount;
  }
}
