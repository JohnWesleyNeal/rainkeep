// Run rewards are earned by score, never by waiting or opening a menu.
export const CHAPTERS = [
  { score: 0, name: "A little beginning", gift: "Wildflowers" },
  { score: 1500, name: "Wildflower banks", gift: "Reed gardens" },
  { score: 5000, name: "Reed gardens", gift: "Willow groves" },
  { score: 12000, name: "Willow groves", gift: "Lanterns" },
  { score: 24000, name: "Lantern cove", gift: "Blossom trees" },
  { score: 42000, name: "Blossom haven", gift: "A starlit haven" },
  { score: 70000, name: "Rainkeeper haven", gift: "Another season" },
];
export const CHARM_RELIEF = 160;
export const createGrowth = () => ({
  milestone: 0,
  charms: 0,
  used: 0,
  clears: 0,
  chain: 0,
  bestChain: 0,
  water: 0,
});
export function milestoneFor(score) {
  if (score >= 70000) return 6 + Math.floor((score - 70000) / 50000);
  return CHAPTERS.findIndex((c) => c.score > score) - 1;
}
export const milestoneScore = (n) =>
  n < 7 ? CHAPTERS[n].score : 70000 + (n - 6) * 50000;
export function growthView(s) {
  if (!s.growth) return null;
  const n = s.growth.milestone,
    lower = milestoneScore(n),
    target = milestoneScore(n + 1);
  return {
    ...CHAPTERS[Math.min(n, 6)],
    milestone: n,
    target,
    remaining: Math.max(0, target - Math.floor(s.score)),
    ratio: Math.max(0, Math.min(1, (s.score - lower) / (target - lower))),
    season: Math.max(1, n - 5),
  };
}
export function advanceGrowth(s, event) {
  if (!s.growth || s.campaign || s.rulesVersion !== 3) return 0;
  const g = s.growth;
  if (event?.type === "sun" && !event.thawed) {
    if (event.contained && event.removed >= 12) {
      g.clears++;
      g.water += event.removed;
      g.chain++;
      g.bestChain = Math.max(g.bestChain, g.chain);
    } else g.chain = 0;
  }
  if (event?.quake) g.chain = 0;
  const next = milestoneFor(s.score),
    earned = Math.max(0, next - g.milestone);
  g.milestone = Math.max(g.milestone, next);
  g.charms = Math.min(3, g.charms + earned);
  return earned;
}
export function useRainCharm(s) {
  if (
    !s.growth ||
    s.campaign ||
    s.over ||
    s.dropping ||
    s.growth.charms < 1 ||
    s.spill <= 0
  )
    return 0;
  const relief = Math.min(CHARM_RELIEF, s.spill);
  s.spill -= relief;
  s.growth.charms--;
  s.growth.used++;
  return relief;
}
export function validGrowth(g, score, turn) {
  return (
    !!g &&
    ["milestone", "charms", "used", "clears", "chain", "bestChain"].every(
      (k) => Number.isSafeInteger(g[k]) && g[k] >= 0,
    ) &&
    g.milestone === milestoneFor(score) &&
    g.charms <= 3 &&
    g.charms + g.used <= g.milestone &&
    g.clears <= turn &&
    g.chain <= g.bestChain &&
    g.bestChain <= g.clears &&
    Number.isFinite(g.water) &&
    g.water >= 0 &&
    g.water <= 1e12
  );
}
