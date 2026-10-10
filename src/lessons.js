import { bonuses, containedLake, terrainPressure } from "./simulation.js";

// Guidance reads the live landscape, so a missed drop never advances a lesson.
// Nothing here moves a piece, consumes a turn, or changes the save format.
export const LESSON_COUNT = 7;
export const TAKEAWAYS = [
  "Closed banks catch Water. Fire clears a connected lake for points.",
  "Separate lakes multiply scores. Keep their dividing banks intact.",
  "Deep liquid water attracts ducks, which multiply your score.",
  "An Upper touching a hole repairs the whole connected opening.",
  "Fire thaws ice first. Another Fire evaporates the liquid lake.",
  "Downers meet the lowest ground they touch. Blunt peaks reduce pressure.",
  "Each Fire clears one connected lake and lowers the drain.",
  "Steer before contact. Drop accelerates a piece's descent.",
  "Fire detonates a live mine. Repair its hole before refilling.",
  "After a quake, rebuild and contain liquid water to earn recovery.",
  "Keep falling Water in separate basins to preserve lake bonuses.",
  "Repair, control peaks, build depth, then clear and refill your lakes.",
  "You kept a lake through the shower and cleared it in the sunshine.",
  "Two separate lakes weathered the rain together.",
  "You repaired the hollow, caught the rain and kept the drain under control.",
  "Meadow Isles kept. Your ducks and lakes made it through the heavy shower.",
];
const target = (x, y, radius = 3) => ({ x, y, radius });
const pond = target(16, 16, 4);
const gap = target(16, 9, 3);
const basinVolume = (s, x, y, size) => {
  let n = 0;
  for (let cy = y; cy < y + size; cy++)
    for (let cx = x; cx < x + size; cx++) n += s.water[cy * 32 + cx];
  return n;
};
const center = (indices, radius = 3) =>
  indices.length
    ? target(
        indices.reduce((n, i) => n + (i % 32) + 0.5, 0) / indices.length,
        indices.reduce((n, i) => n + Math.floor(i / 32) + 0.5, 0) /
          indices.length,
        radius,
      )
    : pond;

export function lessonFor(s, b = bonuses(s)) {
  const c = s.campaign;
  if (!c || c.status === "failed") return null;
  if (c.status === "complete")
    return {
      key: "kept",
      cue: "Pond kept.",
      rule: TAKEAWAYS[c.id],
      target: null,
    };
  const note = (key, cue, rule, focus, needs) => {
    // Explain the piece actually in hand if an earlier miss changed the queue.
    if (needs && s.current.type !== needs) {
      const mismatch = {
        raise: "An Upper is needed here; keep the other banks intact.",
        lower: "A Downer can blunt this peak; leave the pond's bank intact.",
        rain: "This goal needs more Water before Fire.",
        sun: "Fire is needed next; keep this lake contained.",
      };
      cue = mismatch[needs];
    }
    return { key, cue, rule, target: focus };
  };
  const patch = () =>
    note(
      "patch",
      "Touch the opening with an Upper.",
      "One touch patches the connected hole.",
      center(
        s.holes.flatMap((h, i) => (h ? [i] : [])),
        2.5,
      ),
      "raise",
    );
  const fill = (focus = pond, duck = false) =>
    note(
      duck ? "duck" : "fill",
      duck ? "Add Water until a duck arrives." : "Put Water inside the bank.",
      duck
        ? "Ducks reward deep liquid water."
        : "Open seams and low rims leak.",
      focus,
      "rain",
    );
  const clear = (focus = pond) =>
    note(
      "clear",
      "Land Fire in the liquid lake.",
      "It clears connected water and lowers the drain.",
      focus,
      "sun",
    );
  const level = () => {
    const spikes = terrainPressure(s).spikes;
    const peak = spikes.reduce(
      (a, p) => (!a || s.terrain[p.i] > s.terrain[a.i] ? p : a),
      null,
    );
    return note(
      "level",
      "Cover a peak AND low ground with Downer.",
      "It levels toward the lowest ground it touches.",
      peak ? center([peak.i], 2.4) : null,
      "lower",
    );
  };
  const thaw = () =>
    note(
      "thaw",
      "Land Fire on the ice.",
      s.mines.length
        ? "Next Fire detonates the live mine."
        : "It thaws first; another Fire clears water.",
      pond,
      "sun",
    );
  const closed = () => {
    for (let y = 8; y < 10; y++)
      for (let x = 12; x < 20; x++)
        if (s.terrain[y * 32 + x] < 0.7 || s.holes[y * 32 + x]) return false;
    return true;
  };
  const bank = () =>
    note(
      "bank",
      "Overlap both ends of the gap.",
      "Water escapes through open seams.",
      gap,
      "raise",
    );
  const enough = (amount) =>
    b.groups.some((l) => l.volume >= amount && !l.frozen);
  const liquid = b.groups.filter((l) => !l.frozen);
  const wetFocus = () =>
    center(liquid.sort((a, b) => b.volume - a.volume)[0]?.cells || [], 3.5);
  const separated = (basins, count) => {
    const empty = basins.find(
      ([x, y, size]) => basinVolume(s, x, y, size) < 12,
    );
    if (empty)
      return note(
        "separate",
        basins.some(([x, y, size]) => basinVolume(s, x, y, size) >= 12)
          ? "Fill the other basin with Water."
          : "Fill one basin with Water.",
        "Separate lakes multiply your score.",
        target(empty[0] + empty[2] / 2, empty[1] + empty[2] / 2, 3),
        "rain",
      );
    if (liquid.filter((l) => containedLake(s, l)).length < count)
      return note(
        "separate",
        "Keep each lake inside its own bank.",
        "Joined or leaking water will not count.",
        null,
      );
    return note(
      "hold",
      "Let the lakes settle for two seconds.",
      "The hold begins once all lakes are contained.",
      null,
    );
  };
  switch (c.id) {
    case 0:
      return !closed() ? bank() : !enough(25) ? fill() : clear();
    case 1:
      return separated(
        [
          [2, 10, 12],
          [18, 10, 12],
        ],
        2,
      );
    case 2:
      return c.peakDucks < 1
        ? fill(pond, true)
        : !enough(60 - c.evaporated)
          ? fill()
          : clear();
    case 3:
      return s.holes.some(Boolean)
        ? patch()
        : !enough(25 - c.evaporated)
          ? fill()
          : clear();
    case 4:
      return s.ice.some((v) => v > 0)
        ? thaw()
        : !enough(60 - c.evaporated)
          ? fill()
          : clear();
    case 5:
      return terrainPressure(s).surcharge > 0.01
        ? level()
        : !enough(25 - c.evaporated)
          ? fill()
          : clear();
    case 6:
      return !enough(12) ? fill() : clear(wetFocus());
    case 7:
      return note(
        "fall",
        "Steer before contact; Drop speeds descent.",
        "Water goes inside. Fire clears the lake.",
        pond,
      );
    case 8:
      if (s.ice.some((v) => v > 0)) return thaw();
      if (!c.detonations)
        return note(
          "mine",
          "Catch the active mine with Fire.",
          "Fire detonates it instead of clearing water.",
          center(
            s.mines.map((m) => m.i),
            2.5,
          ),
          "sun",
        );
      return s.holes.some(Boolean)
        ? patch()
        : !enough(25 - c.evaporated)
          ? fill()
          : clear();
    case 9:
      return !s.recovery?.rebuilt
        ? bank()
        : !liquid.some((l) => containedLake(s, l))
          ? fill()
          : note(
              "hold",
              "Keep this lake contained for two seconds.",
              "Rebuilding and holding earns recovery.",
              pond,
            );
    case 10:
      return separated(
        [
          [2, 2, 10],
          [20, 2, 10],
          [11, 20, 10],
        ],
        3,
      );
    case 11:
      return s.holes.some(Boolean)
        ? patch()
        : terrainPressure(s).surcharge > 0.01
          ? level()
          : c.peakDucks < 1
            ? fill(pond, true)
            : !enough(c.clears ? 60 : 100)
              ? fill()
              : clear();
    default:
      return null;
  }
}
