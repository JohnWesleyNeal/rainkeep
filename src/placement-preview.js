import {
  applyPiece,
  bonuses,
  footprint,
  quakePressure,
  SIZE,
  validPlacement,
} from "./simulation.js";

// Resolve an immediate landing with the same rules as play, on an isolated copy.
// This deliberately does not run future flow or predict a future shower.
export function previewPlacement(s, aim) {
  if (!validPlacement(s.current, aim.x, aim.y)) return null;
  const copy = structuredClone(s);
  copy.over = false;
  copy.dropping = false;
  const risk = quakePressure(s, aim);
  const event = applyPiece(copy, aim.x, aim.y);
  if (!event) return null;
  const coverage = footprint(s.current, aim.x, aim.y);
  let indices = coverage.map((c) => c.i);
  let label,
    kind = "safe",
    icon = "↥";
  const type = s.current.type;
  if (type === "raise") {
    label = event.repaired ? "Repairs the whole opening" : "Raises this ground";
    if (event.repaired)
      indices = [...new Set([...indices, ...event.repairCells])];
  } else if (type === "lower") {
    kind = "caution";
    icon = "↧";
    label = indices.some((i) => s.holes[i])
      ? "Widens this opening"
      : "Lowers ground · removes covered water";
  } else if (type === "rain") {
    kind = "water";
    icon = "●";
    label = "Water lands here · check your banks";
    if (indices.some((i) => s.holes[i])) {
      kind = "danger";
      label = "Water will land in an opening";
    }
  } else if (type === "bomb") {
    kind = "danger";
    icon = "✹";
    label = "Punches a leaking hole";
  } else {
    const center = Math.floor(aim.y + 0.5) * SIZE + Math.floor(aim.x + 0.5);
    const lake = bonuses(s).groups.find((l) => l.cells.includes(center));
    if (lake) indices = lake.cells;
    icon = "✦";
    if (event.thawed) {
      kind = "water";
      label = "Thaws this lake · water remains";
    } else if (event.detonated) {
      kind = "danger";
      label = "Detonates the mine · repair afterward";
    } else if (event.removed > 0) {
      label = `Evaporates this lake · ${Math.round(event.removed)} water`;
      if (s.campaign && !event.contained) {
        kind = "caution";
        label = "Leaking lake · clear will not count for the goal";
      } else if (s.campaign?.id >= 12 && !s.campaign.keptShowers) {
        kind = "caution";
        label = "Evaporates now · goal needs a kept shower first";
      }
    } else {
      kind = "caution";
      label = "Dry Fire · flattens this ground";
    }
  }
  if (risk.projected >= 1) {
    kind = "danger";
    icon = "!";
    label = "This landing triggers an earthquake";
  }
  if (
    !event.quake &&
    (type === "bomb" ||
      (type === "sun" && !event.removed && !event.thawed && !event.detonated))
  ) {
    indices = [
      ...new Set([
        ...indices,
        ...s.terrain.flatMap((height, i) =>
          height !== copy.terrain[i] || s.holes[i] !== copy.holes[i] ? [i] : [],
        ),
      ]),
    ];
  }
  return {
    label,
    icon,
    kind,
    indices,
    terrain: copy.terrain,
    holes: copy.holes,
    risk,
    event,
    delta: Math.round((risk.projected - risk.current) * 100),
  };
}

export function previewSurface(s, preview, i) {
  const type = s.current.type;
  return (
    (["raise", "lower"].includes(type) && !preview.event.quake
      ? preview.terrain[i]
      : s.terrain[i] + s.water[i]) + 0.08
  );
}
