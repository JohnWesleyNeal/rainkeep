import { CHAPTERS, growthView } from "./growth.js";
import { DISCOVERIES, RANKS, keeperView } from "./keeper.js";

const number = (n) => Math.floor(n).toLocaleString();
export function journalHTML(profile, state) {
  const p = keeperView(profile),
    growth = growthView(state);
  return `<div class="keeper-card"><div class="haven-art" data-rank="${p.rank}" aria-hidden="true"><i class="haven-moon"></i><div class="haven-rock"></div><div class="haven-water"></div>${Array.from({ length: 6 }, (_, i) => `<span class="haven-plant plant-${i}" ${p.rank < i + 1 ? 'data-sleeping="true"' : ""}>${["✿", "❧", "♧", "◇", "❀", "✦"][i]}</span>`).join("")}</div><span class="eyebrow">KEEPER RANK ${p.rank + 1} / ${RANKS.length}</span><h2>${p.name}</h2><p>${p.next ? `${number(p.next.xp - p.xp)} growth to ${p.next.name}` : "Your haven is flourishing. Keep exploring."}</p><div class="keeper-meter" role="progressbar" aria-label="Keeper rank progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(p.ratio * 100)}"><i style="width:${p.ratio * 100}%"></i></div><small>${number(p.xp)} growth · ${p.medals} medals · ${profile.discoveries.length} discoveries</small><p class="keeper-explainer">Best free-play scores earn 1 growth per 20 points. Each medal earns 150; each discovery earns 200. Your best work counts once and stays with you.</p></div>
  <section class="journal-section"><h3>Your growing shore</h3><p>Scenery stays with you across islands and runs. The playable ground stays clear.</p><div class="rank-trail">${RANKS.slice(
    1,
  )
    .map(
      (r, i) =>
        `<div class="rank-gift ${p.rank > i ? "earned" : ""}"><b>${r.icon}</b><strong>${r.reward}</strong><span>${p.rank > i ? "Growing in your haven" : number(r.xp) + " growth"}</span></div>`,
    )
    .join("")}</div></section>
  <section class="journal-section"><h3>${growth ? "This landscape" : "Score a growing landscape"}</h3><p>New Classic and Daydream runs grow through seven score chapters, then endless seasons. Every milestone banks a rain charm: clear up to 25% drain when you need it. Hold up to three; a full drain still ends the run.</p>${growth ? `<div class="run-summary"><b>${growth.name}</b><span>${state.growth.clears} contained clears · best chain ${state.growth.bestChain}</span><span>${number(growth.remaining)} points to ${CHAPTERS[Math.min(growth.milestone + 1, 6)].name}</span><span>${state.growth.charms} rain charms saved · ${state.growth.used} used</span></div>` : ""}<p>Classic levels rise with score chapters or time: ice starts at level 2, mines at level 4. Daydream grows with your score and never starts falling or spawning hazards. Earlier saved runs keep their rules.</p></section>
  <section class="journal-section"><h3>Field discoveries <small>${profile.discoveries.length} / ${DISCOVERIES.length}</small></h3><div class="discovery-grid">${DISCOVERIES.map((d) => `<div class="discovery ${profile.discoveries.includes(d.id) ? "earned" : ""}"><b aria-hidden="true">${profile.discoveries.includes(d.id) ? d.icon : "○"}</b><div><strong>${d.name}${profile.discoveries.includes(d.id) ? " ✓" : ""}</strong><span>${d.hint}</span></div></div>`).join("")}</div></section>`;
}
export function updateGrowthHUD(state, profile, paused) {
  const $ = (id) => document.getElementById(id),
    p = keeperView(profile),
    g = growthView(state);
  $("keeper-link").textContent = `${RANKS[p.rank].icon} ${p.name} · Journal ↗`;
  $("keeper-link").setAttribute(
    "aria-label",
    `Keeper journal. Rank ${p.rank + 1}: ${p.name}`,
  );
  $("growth-progress").hidden = !g;
  $("rain-charm").hidden = !g || state.over;
  if (!g) {
    $("free-title").textContent = "Shape. Catch. Evaporate.";
    if (!state.campaign)
      $("free-instruction").textContent =
        "Earlier rules · start fresh for score chapters.";
    return;
  }
  $("free-title").textContent =
    g.milestone > 6 ? `Haven · season ${g.season}` : g.name;
  $("free-instruction").textContent =
    `${number(g.remaining)} to ${g.gift.toLowerCase()}`;
  $("growth-progress").style.setProperty("--growth", `${g.ratio * 100}%`);
  $("growth-progress").setAttribute(
    "aria-valuenow",
    String(Math.floor(g.ratio * 100)),
  );
  const charmLabel = `✦ <b>${state.growth.charms}</b><small>Rain charm</small>`;
  if ($("rain-charm").innerHTML !== charmLabel)
    $("rain-charm").innerHTML = charmLabel;
  $("rain-charm").disabled =
    paused || state.dropping || !state.growth.charms || state.spill <= 0;
  $("rain-charm").title =
    state.spill <= 0
      ? "Your drain is empty. Save this charm for later."
      : "Clear up to 25% drain. Your landscape and queue stay intact.";
  $("rain-charm").setAttribute(
    "aria-label",
    `Use rain charm. ${state.growth.charms} available. Clear up to 25 percent drain.`,
  );
  if (state.over)
    $("result-detail").textContent +=
      ` · ${g.name} · ${state.growth.clears} contained clears`;
}
