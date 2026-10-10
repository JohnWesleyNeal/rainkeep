export const REGIONS = [
  {
    id: "home",
    name: "Home Island",
    subtitle: "Seven field lessons",
    stages: [0, 1, 2, 3, 4, 5, 6],
    color: "#bad9c0",
  },
  {
    id: "meadow",
    name: "Meadow Isles",
    subtitle: "Four rain-swept challenges",
    stages: [12, 13, 14, 15],
    color: "#d8e8a1",
  },
  {
    id: "coves",
    name: "Practice Coves",
    subtitle: "Five optional trials",
    stages: [7, 8, 9, 10, 11],
    color: "#a8d8e3",
  },
];
export const regionFor = (id) =>
  REGIONS.find((r) => r.stages.includes(id)) || REGIONS[0];
export const regionKept = (progress, region) =>
  region.stages.every((i) => progress.stars[i] > 0);
export function stageUnlocked(progress, id) {
  if (!Number.isInteger(id) || id < 0 || id > 15) return false;
  if (progress.stars[id] > 0) return true;
  if (id < 7) return id === 0 || progress.stars[id - 1] > 0;
  if (id >= 12)
    return (
      regionKept(progress, REGIONS[0]) &&
      (id === 12 || progress.stars[id - 1] > 0)
    );
  return (
    regionKept(progress, REGIONS[0]) && (id === 7 || progress.stars[id - 1] > 0)
  );
}
export function nextIsland(id) {
  if (id === 6) return 12;
  return id === 11 || id === 15 ? null : id + 1;
}
export function suggestedIsland(progress) {
  return (
    [...REGIONS[0].stages, ...REGIONS[1].stages, ...REGIONS[2].stages].find(
      (i) => !progress.stars[i] && stageUnlocked(progress, i),
    ) ?? 15
  );
}
export function islandArt(region, kept = false) {
  const meadow = region.id === "meadow",
    blue = region.id === "coves";
  return `<svg viewBox="0 0 260 120" aria-hidden="true" focusable="false"><ellipse cx="132" cy="99" rx="76" ry="8" fill="#071d2830"/><path d="M32 61L121 20 227 54 136 105Z" fill="${blue ? "#315b6c" : "#3b665f"}"/><path d="M32 50L121 9 227 43 136 91Z" fill="${meadow ? "#afc983" : blue ? "#8daeb0" : "#a5bd96"}"/><path d="M32 50L136 91 136 105 32 61Z" fill="#638570"/><path d="M136 91L227 43 227 54 136 105Z" fill="#44695e"/><path d="M75 48L118 27 174 45 133 69Z" fill="#789870"/><path d="M82 47L118 32 163 46 132 62Z" fill="#64b9c1"/><path d="M87 47L119 35 151 45 133 57Z" fill="#9cddd5"/><path d="M177 36L187 27 194 37 186 39Z" fill="#5d8968"/><path d="M61 58L65 51 71 59Z M161 67L165 59 172 66Z" fill="#54845d"/>${meadow ? '<g fill="#efdfa1"><circle cx="76" cy="55" r="2"/><circle cx="172" cy="53" r="2"/><circle cx="154" cy="74" r="2"/></g>' : ""}${kept ? '<path d="M108 22L116 29 130 15" fill="none" stroke="#fff6c8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' : ""}</svg>`;
}
