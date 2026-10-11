import { STAGES } from "./stages.js";

export function failureReason(s) {
  const c = s.campaign;
  if (!c)
    return "The drain filled. Fire clears water and makes room for more rain.";
  const d = STAGES[c.id];
  if (d.noQuake && s.quakes > c.startingQuakes)
    return "An earthquake ended this challenge. Lower tall peaks before adding more land.";
  if (d.maxDrain && c.worstDrain >= d.maxDrain)
    return `The drain crossed ${Math.round(d.maxDrain * 100)}%. Patch leaks and use Fire sooner.`;
  if (d.detonations && c.detonations < d.detonations && !s.mines.length)
    return "The mine expired. Thaw its lake, then use Fire while the mine is still active.";
  if (d.recoveries && !c.recoveries && !s.recovery)
    return "The recovery window closed. Repair the bank and hold a contained lake for two seconds.";
  if (s.turn >= c.budget)
    return "No drops left. The goal was not complete when the last piece landed.";
  return "The drain filled. Close leaking banks and use Fire to lower it.";
}
export function medalDescription(s) {
  const d = STAGES[s.campaign.id];
  return `★ Complete  ·  ★★ ${d.par} drops or fewer  ·  ★★★ Also keep drain ≤15% with no new quake`;
}
export const HELP = `<b>Place with confidence</b><p>Slide anywhere on the island to steer. Lift and re-touch without moving your aim. Rotate keeps the piece centered. Fine adjust makes small corrections. Drop commits the landing.</p>
<b>Build → fill → evaporate</b><p>Uppers raise banks and repair connected holes. Water flows into low ground. Fire clears a connected lake for points and drain relief. Closed lakes count toward island goals.</p>
<b>Read the landing preview</b><p>The bright footprint shows affected ground; Fire highlights its current lake. Warnings explain dry Fire, mines, openings and earthquakes. Water keeps moving, so inspect your bank before committing.</p>
<b>Watch the two risks</b><p>Escaping water fills the drain. Land and isolated tall peaks increase earthquake pressure. Downers lower ground toward the lowest point they touch, but widen holes and remove water without scoring.</p>
<b>Ice, mines & recovery</b><p>Fire thaws ice before it evaporates. Fire in a mined lake detonates the mine. After a quake, rebuild and hold a contained liquid lake for two seconds within 45 seconds for a recovery bonus.</p>
<b>Your choice of pace</b><p>Every island is open. Home teaches the rules, Meadow adds weather, and Practice Coves test your skills. Daydream waits for Drop; Classic has falling pieces. Pause stops the simulation.</p>
<b>Keep the shower</b><p>Contain a lake until rain ends, then use Fire for post-shower goals. Bring rain skips clear waiting time in untimed Meadow islands, retaining the cloud warning and full shower.</p>
<b>Make the most of a lake</b><p>Separate lakes, deep-water ducks and rainbows multiply points. Five lakes at a Classic level-up earn a Smart bomb, which clears the board and drain while keeping your score.</p>
<b>Grow a living haven</b><p>Fresh free-play runs earn score chapters and rain charms. Each charm clears up to 25% drain; hold up to three and use them before the drain fills. Classic levels rise with score or time. Daydream grows with score and keeps its relaxed pace.</p>
<b>Your Keeper Journal</b><p>Best scores, island medals and ten field discoveries earn permanent Keeper growth. Higher ranks add decorative flowers, groves and lights around your island. Open the journal from the score row or Pause. Earlier saved runs keep their original rules; all islands remain open.</p>`;
