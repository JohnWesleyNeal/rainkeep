import {
  REGIONS,
  regionFor,
  regionKept,
  stageUnlocked,
  islandArt,
} from "./journey.js";
import { STAGES } from "./stages.js";
import { HELP } from "./screen-content.js";
const $ = (id) => document.getElementById(id);
export function createNavigation(context) {
  return function showDialog(kind) {
    context.begin(kind);
    const { state, started, saved, campaignProgress, best, legacyBest } =
      context.getSession();
    let { selectedMode, selectedStage } = context.getSession();
    const title = $("modal-title"),
      copy = $("modal-copy"),
      start = $("start"),
      second = $("secondary");
    copy.className = "";
    $("intro-rules").hidden = kind !== "start" && kind !== "new";
    $("mode-picker").hidden = !["start", "new", "stages"].includes(kind);
    $("stage-picker").hidden = kind !== "stages";
    $("journey-map").hidden = kind !== "stages";
    $("overlay").dataset.journey = String(kind === "stages");
    $("campaign-menu").hidden = kind === "stages" || kind === "help";
    $("lesson-toggle").hidden =
      !state.campaign || !["pause", "help"].includes(kind);
    second.hidden = true;
    start.disabled = false;
    $("modal-eyebrow").textContent = "A SMALL WORLD. A SIMPLE CHALLENGE.";
    $("modal-foot").textContent = "Best played with a little curiosity.";
    if (kind === "stages") {
      selectedMode = "campaign";
      context.choose(selectedMode, selectedStage);
      $("modal-eyebrow").textContent = "YOUR ISLAND JOURNEY";
      title.innerHTML = "Your next<br><em>little island.</em>";
      const region = regionFor(selectedStage);
      const def = STAGES[selectedStage];
      copy.innerHTML = `<b>${region.name} · ${def.name}</b><br>${def.goal}<br><small>${def.hint}</small>`;
      const map = $("journey-map");
      map.replaceChildren();
      REGIONS.forEach((r) => {
        const button = document.createElement("button"),
          kept = regionKept(campaignProgress, r);
        button.dataset.region = r.id;
        button.className = "journey-island";
        button.classList.toggle("selected", r === region);
        button.classList.toggle("kept", kept);
        button.disabled = !r.stages.some((i) =>
          stageUnlocked(campaignProgress, i),
        );
        button.setAttribute("aria-pressed", String(r === region));
        button.innerHTML =
          islandArt(r, kept) +
          `<strong>${r.name}</strong><span>${button.disabled ? "Choose any island" : r.subtitle}</span><small>${r.stages.filter((i) => campaignProgress.stars[i] > 0).length} / ${r.stages.length} kept ${kept ? "· ✓" : ""}</small>`;
        button.onclick = () => {
          selectedStage =
            r.stages.find(
              (i) =>
                !campaignProgress.stars[i] &&
                stageUnlocked(campaignProgress, i),
            ) ?? r.stages.find((i) => stageUnlocked(campaignProgress, i));
          context.choose(selectedMode, selectedStage);
          showDialog("stages");
        };
        map.append(button);
      });
      const picker = $("stage-picker");
      picker.replaceChildren();
      region.stages.forEach((i) => {
        const d = STAGES[i];
        const b = document.createElement("button");
        b.dataset.stage = i;
        b.disabled = !stageUnlocked(campaignProgress, i);
        b.className = i === selectedStage ? "selected" : "";
        b.textContent =
          String(region.stages.indexOf(i) + 1).padStart(2, "0") +
          " " +
          d.name +
          " " +
          ("★".repeat(campaignProgress.stars[i]) ||
            (b.disabled ? "· locked" : ""));
        b.setAttribute("aria-pressed", String(i === selectedStage));
        b.onclick = () => {
          selectedStage = i;
          context.choose(selectedMode, selectedStage);
          showDialog("stages");
        };
        picker.append(b);
      });
      start.textContent = "Play " + def.name + " ↗";
      start.disabled = !stageUnlocked(campaignProgress, selectedStage);
      if (started || state.campaign) {
        second.hidden = false;
        second.textContent =
          state.campaign?.status === "complete" || state.over
            ? "Back to your results"
            : "Back to your landscape";
      }
      $("modal-foot").textContent =
        region.id === "meadow"
          ? "Prepare for gathering clouds. Keep a lake through the shower, then enjoy the sunshine. Medals reward care and efficient drops."
          : "Every island is open. Home is a gentle beginning; Meadow brings rain, and the Coves test your skills.";
    } else if (kind === "over" && state.campaign) {
      $("modal-eyebrow").textContent =
        "STAGE " + (state.campaign.id + 1) + " · TRY AGAIN";
      title.innerHTML = "Another<br><em>little try.</em>";
      const d = STAGES[state.campaign.id];
      copy.innerHTML = `<b>${d.name}</b><br>${state.turn >= state.campaign.budget ? "The last piece landed before the goal was complete." : d.noQuake && state.quakes > state.campaign.startingQuakes ? "An earthquake ended this challenge." : d.maxDrain && state.campaign.worstDrain >= d.maxDrain ? "The drain crossed this stage’s limit." : d.detonations && state.campaign.detonations < d.detonations && !state.mines.length ? "The mine expired before you caught it with Fire." : d.recoveries && state.campaign.recoveries < d.recoveries && !state.recovery ? "The recovery window closed before the lake was safe." : "The drain filled."}<br>${d.goal}`;
      start.textContent = "Retry this stage ↗";
      $("modal-foot").textContent = d.hint;
    } else if (kind === "start" || kind === "new") {
      title.innerHTML = "Keep a little<br><em>rain.</em>";
      copy.innerHTML =
        "Build little banks. Catch the water.<br>Evaporate a lake and make room for more.";
      start.textContent =
        kind === "start" && saved && !saved.over
          ? "Continue your landscape ↗"
          : selectedMode === "campaign"
            ? "Play " + STAGES[selectedStage].name + " ↗"
            : "Play " +
              (selectedMode === "classic" ? "Classic" : "Daydream") +
              " ↗";
      $("modal-foot").textContent =
        kind === "new" && started
          ? "Starting a new landscape replaces the current run. Your medals and best scores stay."
          : "Every island is open. First Pond is a good place to begin.";
      if ((kind === "start" && saved && !saved.over) || kind === "new") {
        second.hidden = false;
        second.textContent =
          kind === "new"
            ? state.over
              ? "Back to your results"
              : "Back to your landscape"
            : "Start a fresh landscape";
      }
      if (kind === "start" && saved && !saved.over)
        $("mode-picker").hidden = true;
    } else if (kind === "pause") {
      title.innerHTML = "A moment<br>of <em>calm.</em>";
      copy.innerHTML =
        "Your landscape is saved. The rain can wait." +
        `<p class="record-history">Classic best ${best.classic.toLocaleString()} · Daydream best ${best.daydream.toLocaleString()}<br><small>Earlier rules: Classic ${legacyBest.classic.toLocaleString()} · Daydream ${legacyBest.daydream.toLocaleString()}</small></p>`;
      start.textContent = "Keep playing ↗";
      second.hidden = false;
      second.textContent = "Start a fresh landscape";
    } else if (kind === "help") {
      $("modal-eyebrow").textContent = "A FIELD GUIDE TO RAINKEEP";
      title.innerHTML = "Go with<br>the <em>flow.</em>";
      copy.className = "instructions";
      copy.innerHTML = HELP;
      start.textContent = started ? "Back to your landscape ↗" : "Got it ↗";
      $("modal-foot").textContent =
        "Slide to steer; re-touch keeps your aim. Arrows: fine steps. Keyboard: arrows / Shift for larger steps / R / Space.";
    } else if (kind === "over") {
      title.innerHTML = "After<br>the <em>rain.</em>";
      copy.innerHTML = `You kept a little world going for ${state.turn} drops.<br><b>${state.score.toLocaleString()} points</b> · ${state.mode === "classic" ? "Classic" : "Daydream"}`;
      start.textContent = "Try another landscape ↗";
      $("modal-foot").textContent = "Every lake teaches you something.";
    }
    document.querySelectorAll("[data-mode]").forEach((b) => {
      const active = b.dataset.mode === selectedMode;
      b.classList.toggle("selected", active);
      b.setAttribute("aria-pressed", String(active));
    });
    context.update();
    start.focus({ preventScroll: true });
  };
}
