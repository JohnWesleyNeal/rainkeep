import "./style.css";
import "./layout.css";
import "./growth.css";
import { useRainCharm, growthView } from "./growth.js";
import {
  KEEPER_KEY,
  readKeeper,
  keeperView,
  syncKeeper,
  DISCOVERIES,
} from "./keeper.js";
import { updateGrowthHUD } from "./keeper-ui.js";
import {
  createStorage,
  readBests,
  SAVE,
  BEST,
  CAMPAIGN,
  NEW_BEST,
  GROWTH_BEST,
} from "./session.js";
import { createInputController } from "./input.js";
import { createNavigation } from "./navigation.js";
import { createHud } from "./hud.js";
import { previewPlacement } from "./placement-preview.js";
import { buildDrops } from "./piece-queue.js";
import { bringRain } from "./weather.js";
import {
  SIZE,
  LIMIT,
  TYPES,
  cells,
  createGame,
  SPAWN_ALTITUDE,
  accelerateDrop,
  landingHeight,
  tick,
  waterTotal,
  waterBubbles,
  restore,
  bonuses,
  quakePressure,
  smartBomb,
} from "./simulation.js";
import { drawWaterBubble } from "./bubble-canvas.js";
import { clampAim, rotateAim } from "./controls.js";
import { createSoundBank } from "./audio.js";
import { createWorldRenderer } from "./renderer.js";
import { LESSON_COUNT, lessonFor, TAKEAWAYS } from "./lessons.js";
import { drawLessonDemo } from "./lesson-demo.js";
import { weatherView } from "./weather.js";
import { regionFor, nextIsland, suggestedIsland } from "./journey.js";
import {
  STAGES,
  createStage,
  stepStage,
  stageProgress,
  stageStars,
  readProgress,
  finishStage,
} from "./stages.js";

const $ = (id) => document.getElementById(id),
  board = $("board"),
  preview = $("piece").getContext("2d");
const { read, write } = createStorage(() =>
  toast("Storage is unavailable. This run will not save."),
);
const updateHud = createHud();
let placement = null;
let saved = restore(read(SAVE)),
  state =
    saved && (!saved.over || saved.campaign)
      ? saved
      : createStage(suggestedIsland(readProgress(read(CAMPAIGN)))),
  started = false,
  paused = true,
  selectedMode = saved
    ? state.campaign
      ? "campaign"
      : state.mode
    : "campaign";
let campaignProgress = readProgress(read(CAMPAIGN)),
  selectedStage = state.campaign?.id ?? suggestedIsland(campaignProgress);
let cursor = state.aim ? { ...state.aim } : { x: 8, y: 8 },
  animation = 0,
  last = performance.now(),
  accumulator = 0,
  lastSave = 0,
  dialogKind = "start",
  toastUntil = 0;
let soundOn = read("rainkeep.sound") === "on",
  best = readBests(read(GROWTH_BEST)),
  previousBest = readBests(read(NEW_BEST)),
  legacyBest = readBests(read(BEST)),
  deferredInstall;
const keeper = readKeeper(read(KEEPER_KEY));
if (
  syncKeeper(keeper, {
    progress: campaignProgress,
    records: [best, previousBest, legacyBest],
  }).changed
)
  write(KEEPER_KEY, JSON.stringify(keeper));
let observedState = state,
  observedMilestone = state.growth?.milestone || 0,
  pulseUntil = 0;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
let guideEnabled = read("rainkeep.guides") !== "off",
  watchingRule = false,
  activeLesson = null,
  demoStartedAt = 0,
  lessonFeedback = null,
  completedState = null,
  controlKind = "playing",
  lastDescription = "";
function describePiece(text, rule = null) {
  const key = JSON.stringify([text, rule]);
  if (key === lastDescription) return;
  lastDescription = key;
  if (rule) {
    const cue = document.createElement("strong"),
      detail = document.createElement("span");
    cue.textContent = text;
    detail.textContent = rule;
    $("piece-desc").replaceChildren(cue, detail);
  } else $("piece-desc").textContent = text;
}
const world = createWorldRenderer(board, reduced);
board.dataset.graphics = world.kind;
let worldBonus = bonuses(state),
  lastNotice = "",
  dangerBand = 0,
  lastWeatherPhase = "fair";
function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("visible");
  toastUntil = performance.now() + 4200;
}
function save() {
  if (started) {
    state.aim = { ...cursor };
    write(SAVE, JSON.stringify(state));
  }
}
function record() {
  if (state.campaign) return;
  const records =
    state.rulesVersion === 3
      ? best
      : state.rulesVersion === 2
        ? previousBest
        : legacyBest;
  if (state.score > records[state.mode]) {
    records[state.mode] = state.score;
    write(
      state.rulesVersion === 3
        ? GROWTH_BEST
        : state.rulesVersion === 2
          ? NEW_BEST
          : BEST,
      JSON.stringify(records),
    );
  }
}
const sounds = createSoundBank(soundOn);
function tone(type, event = {}) {
  if (soundOn) sounds.play(type, event);
}
function soundUI() {
  $("sound-state").textContent = soundOn ? "ON" : "OFF";
  $("sound").setAttribute(
    "aria-label",
    soundOn ? "Turn sound off" : "Turn sound on",
  );
}
soundUI();
function resize() {
  world.resize();
  input.resize();
}
new ResizeObserver(resize).observe(board);
function fitViewport() {
  const viewport = window.visualViewport;
  if (!viewport || Math.abs(viewport.scale - 1) < 0.01)
    document.documentElement.style.setProperty(
      "--play-height",
      `${Math.round(viewport?.height ?? innerHeight)}px`,
    );
}
window.addEventListener("resize", fitViewport);
window.visualViewport?.addEventListener("resize", fitViewport);
fitViewport();
function render(dt) {
  const celebrating = inlineComplete();
  const weather = weatherView(state);
  if (
    started &&
    !paused &&
    weather.phase === "gather" &&
    lastWeatherPhase !== "gather"
  )
    tone("weather");
  lastWeatherPhase = weather.phase;
  const landscape = document.querySelector(".landscape");
  landscape.dataset.region = state.campaign
    ? regionFor(state.campaign.id).id
    : state.mode;
  landscape.dataset.weather = weather.phase;
  landscape.style.setProperty("--cloud-cover", weather.cloud);
  sounds.ambient(
    started && !paused ? weather.rain * 0.65 + weather.cloud * 0.12 : 0,
  );
  world.render(state, cursor, animation, dt, {
    paused: paused && !celebrating,
    showPiece: started && !state.over && state.campaign?.status !== "complete",
    bonuses: worldBonus,
    placement,
    growth: Math.max(
      keeperView(keeper).rank,
      Math.min(6, state.growth?.milestone || 0),
    ),
    lessonTarget:
      guideEnabled && started && state.campaign?.status === "playing"
        ? activeLesson?.target
        : null,
  });
  if (watchingRule && activeLesson)
    drawLessonDemo(
      preview,
      activeLesson.key,
      animation - demoStartedAt,
      reduced,
    );
}
let lastPiece = "";
function drawPiece() {
  if (watchingRule) return;
  if (state.campaign?.status === "complete") {
    const key = "kept-" + stageStars(state);
    if (lastPiece === key) return;
    lastPiece = key;
    preview.clearRect(0, 0, 150, 100);
    preview.fillStyle = "#ffd395";
    preview.font = "31px Georgia";
    preview.textAlign = "center";
    preview.fillText("★".repeat(stageStars(state)), 75, 62);
    return;
  }
  const key = JSON.stringify(state.current);
  if (key === lastPiece) return;
  lastPiece = key;
  if (world.preview?.(preview, state.current)) return;
  preview.clearRect(0, 0, 150, 100);
  const pts = cells(state.current),
    minX = Math.min(...pts.map(([x, y]) => x - y)),
    maxX = Math.max(...pts.map(([x, y]) => x - y)),
    maxY = Math.max(...pts.map(([x, y]) => x + y));
  if (!["raise", "lower"].includes(state.current.type)) {
    if (state.current.type === "rain") {
      const scale = Math.min(
        22,
        110 / (maxX - minX + 2),
        70 / (maxY * 0.5 + 2),
      );
      for (const b of waterBubbles(state.current))
        drawWaterBubble(
          preview,
          75 + (b.x - b.y - (maxX + minX) / 2) * scale,
          50 + (b.x + b.y - maxY / 2) * scale * 0.5,
          scale * 0.9,
          b.fill,
        );
      return;
    }
    preview.fillStyle = TYPES[state.current.type].color;
    preview.beginPath();
    preview.arc(75, 50, 25, 0, 7);
    preview.fill();
    preview.fillStyle = "#fdf7df";
    preview.font = "28px Georgia";
    preview.textAlign = "center";
    preview.textBaseline = "middle";
    preview.fillText(TYPES[state.current.type].icon, 75, 50);
    return;
  }
  const u = Math.min(14, 125 / (maxX - minX + 2), 80 / ((maxY + 2) * 0.5 + 1));
  for (const [x, y] of pts.sort((a, b) => a[0] + a[1] - b[0] - b[1])) {
    const px = 75 + (x - y - (minX + maxX) / 2) * u,
      py = 42 + (x + y - maxY / 2) * u * 0.5;
    preview.fillStyle = "#68885c";
    preview.beginPath();
    preview.moveTo(px - u, py);
    preview.lineTo(px, py + u * 0.5);
    preview.lineTo(px + u, py);
    preview.lineTo(px + u, py + u * 0.5);
    preview.lineTo(px, py + u);
    preview.lineTo(px - u, py + u * 0.5);
    preview.fill();
    preview.fillStyle = TYPES[state.current.type].color;
    preview.beginPath();
    preview.moveTo(px, py - u * 0.5);
    preview.lineTo(px + u, py);
    preview.lineTo(px, py + u * 0.5);
    preview.lineTo(px - u, py);
    preview.closePath();
    preview.fill();
    preview.strokeStyle = "#f5f9d688";
    preview.stroke();
  }
}
function pulse(title, detail) {
  const banner = $("growth-banner");
  const heading = document.createElement("strong"),
    note = document.createElement("span");
  heading.textContent = title;
  note.textContent = detail;
  banner.replaceChildren(heading, note);
  banner.hidden = false;
  pulseUntil = performance.now() + 4200;
}
function refreshKeeper(event, notify = false) {
  const change = syncKeeper(keeper, {
    state: started ? state : null,
    progress: campaignProgress,
    records: [best, previousBest, legacyBest],
    event,
  });
  if (change.changed) write(KEEPER_KEY, JSON.stringify(keeper));
  if (notify && change.rankUp)
    pulse(keeperView(keeper).name, "Keeper rank up · your shore is growing");
  else if (notify && change.added.length)
    pulse(
      DISCOVERIES.find((d) => d.id === change.added[0]).name,
      "New field discovery · +200 permanent growth",
    );
}
function ui() {
  record();
  refreshKeeper();
  if (observedState !== state) {
    observedState = state;
    observedMilestone = state.growth?.milestone || 0;
  } else if ((state.growth?.milestone || 0) > observedMilestone) {
    const chapters = state.growth.milestone - observedMilestone;
    observedMilestone = state.growth.milestone;
    pulse(
      growthView(state).name,
      `${chapters} score milestone${chapters > 1 ? "s" : ""} · ${state.growth.charms} rain charm${state.growth.charms === 1 ? "" : "s"} banked`,
    );
    tone("recovery");
  }
  worldBonus = bonuses(state);
  $("level").textContent = state.level;
  $("lakes").textContent = worldBonus.lakes;
  $("ducks").textContent = worldBonus.ducks;
  $("multiplier").textContent = "×" + worldBonus.multiplier;
  const risk = quakePressure(state, cursor);
  if (state.campaign?.status === "complete") risk.projected = risk.current;
  const pressure = Math.min(100, Math.round(risk.current * 100));
  const projected = Math.min(100, risk.projected * 100);
  const band = risk.current >= 0.9 ? 2 : risk.current >= 0.75 ? 1 : 0;
  const crosses = risk.projected >= 1;
  document.querySelector(".landscape").dataset.danger = crosses
    ? "imminent"
    : ["calm", "warning", "critical"][band];
  if (started && !paused && band > dangerBand)
    tone("warning", { critical: band === 2 });
  if (!paused) dangerBand = band;
  $("quake-text").textContent = pressure + "%";
  $("quake-bar").style.width = pressure + "%";
  const currentPressure = Math.min(100, risk.current * 100);
  document.querySelector(".landscape").dataset.relief =
    risk.projected < risk.current;
  $("quake-forecast").style.left = Math.min(currentPressure, projected) + "%";
  $("quake-forecast").style.width = Math.abs(projected - currentPressure) + "%";
  $("quake-marker").hidden = Math.abs(projected - currentPressure) < 0.01;
  $("quake-marker").style.left = projected + "%";
  $("quake-text").textContent = crosses
    ? pressure + "% → QUAKE"
    : pressure + "%" + (risk.spikeRatio > 0.01 ? " • peaks" : "");
  document
    .querySelector(".quake-meter")
    .setAttribute(
      "aria-valuetext",
      `${pressure}% pressure, including ${Math.round(risk.spikeRatio * 100)}% from isolated peaks. After this piece: ${Math.round(risk.projected * 100)}%.`,
    );
  const recovery = state.recovery;
  $("recovery-status").hidden = !recovery;
  if (recovery) {
    $("recovery-status").textContent =
      `${recovery.stable > 0 ? "Holding steady" : "Rebuild & contain"} · ${Math.ceil(Math.max(0, recovery.until - state.elapsed))}s`;
    $("recovery-status").style.setProperty(
      "--steady",
      Math.min(100, (recovery.stable / 2) * 100) + "%",
    );
  }
  document
    .querySelector(".quake-meter")
    .setAttribute("aria-valuenow", pressure);
  $("smart-bomb").textContent = "Smart bomb · " + state.smartBombs;
  $("smart-bomb").disabled = paused || state.over || state.smartBombs < 1;
  $("smart-bomb").hidden = state.smartBombs < 1;
  if (
    state.notice &&
    state.noticeUntil > state.elapsed &&
    state.notice !== lastNotice
  ) {
    if (!state.campaign || !guideEnabled) toast(state.notice);
    if (state.notice.startsWith("Back in balance!") && !paused)
      tone("recovery");
    lastNotice = state.notice;
  }
  const radar = $("leak-map").getContext("2d");
  radar.fillStyle = "#294d4e";
  radar.fillRect(0, 0, 64, 64);
  for (let i = 0; i < state.terrain.length; i++) {
    radar.fillStyle =
      state.leaks[i] > 0.0001
        ? "#c25042"
        : state.holes[i]
          ? "#ffbd72"
          : state.ice[i] > 0
            ? "#eaf9fb"
            : state.water[i] > 0.12
              ? "#69a9bf"
              : state.terrain[i] > 0.2
                ? "#83976a"
                : "#294d4e";
    radar.fillRect((i % SIZE) * 2, Math.floor(i / SIZE) * 2, 2, 2);
  }
  $("score").textContent = String(Math.floor(state.score)).padStart(5, "0");
  $("best").textContent = String(
    (state.rulesVersion === 3
      ? best
      : state.rulesVersion === 2
        ? previousBest
        : legacyBest)[state.mode],
  );
  const percent = Math.min(100, Math.floor((state.spill / LIMIT) * 100));
  $("spill-text").textContent = percent + "%";
  $("spill-bar").style.width = percent + "%";
  $("spill-bar").style.background = percent > 70 ? "#c8654a" : "#e99e64";
  document
    .querySelector(".meter")
    .setAttribute("aria-valuenow", String(percent));
  $("spill-hint").textContent =
    percent > 70
      ? "Fire evaporates a lake and lowers the drain."
      : "Every drop over the edge counts.";
  $("water").textContent = waterTotal(state).toFixed(1);
  $("piece-name").textContent = TYPES[state.current.type].name;
  let description = TYPES[state.current.type].label,
    descriptionRule = null;
  $("piece-symbol").textContent = TYPES[state.current.type].icon;
  $("next").textContent =
    TYPES[state.next.type].icon + " " + TYPES[state.next.type].name;
  $("mode-label").textContent = state.mode.toUpperCase();
  const campaign = state.campaign;
  const complete = campaign?.status === "complete";
  const guide = campaign && guideEnabled;
  $("piece-heading-label").textContent = complete
    ? "WHAT YOU LEARNED"
    : guide
      ? "FIELD NOTE"
      : "IN YOUR HANDS";
  document.querySelector(".app").dataset.lessons = String(!!guide);
  document.querySelector(".app").dataset.completed = String(!!complete);
  const nextLesson = guide ? lessonFor(state, worldBonus) : null;
  if (nextLesson?.key !== activeLesson?.key) {
    watchingRule = false;
    lastPiece = "";
  }
  activeLesson = nextLesson;
  $("watch-rule").hidden = !activeLesson || complete;
  $("next-label").hidden = !!guide;
  $("watch-rule").textContent = watchingRule
    ? "Piece preview ↻"
    : "Watch rule ▷";
  $("watch-rule").setAttribute("aria-pressed", String(watchingRule));
  $("watch-rule").disabled = paused;
  $("lesson-toggle").textContent = guideEnabled
    ? "Lesson guides · on"
    : "Lesson guides · off";
  $("lesson-toggle").setAttribute("aria-pressed", String(guideEnabled));
  if (guide && activeLesson) {
    description =
      lessonFeedback && lessonFeedback.until > state.elapsed
        ? lessonFeedback.text
        : activeLesson.cue;
    descriptionRule = activeLesson.rule;
  }
  if (complete) {
    $("piece-name").textContent =
      campaign.id >= 12 ? "Island kept" : "Pond kept";
    description = TAKEAWAYS[campaign.id];
    descriptionRule = null;
    $("piece-symbol").textContent = "";
    $("next").textContent =
      nextIsland(campaign.id) === null
        ? campaign.id === 15
          ? "MEADOW ISLES KEPT"
          : "PRACTICE COVES KEPT"
        : campaign.id === 6
          ? "SET SAIL · MEADOW ISLES"
          : "NEXT · " + STAGES[nextIsland(campaign.id)].name;
  }
  describePiece(description, descriptionRule);
  $("stage-objective").hidden = !campaign;
  if (campaign) {
    $("mode-label").textContent =
      campaign.id >= 12
        ? "MEADOW " + (campaign.id - 11) + " / 4"
        : (campaign.id < LESSON_COUNT ? "LESSON " : "TRIAL ") +
          String(campaign.id < 7 ? campaign.id + 1 : campaign.id - 6).padStart(
            2,
            "0",
          );
    $("stage-name").textContent = STAGES[campaign.id].name;
    const progress = stageProgress(state);
    $("stage-progress").textContent = progress.text;
    $("stage-goal-bar").style.width = progress.ratio * 100 + "%";
    if (complete)
      $("stage-progress").textContent =
        "COMPLETE · " +
        "★".repeat(stageStars(state)) +
        " · " +
        state.turn +
        " drops";
  }
  $("timer").textContent =
    state.mode === "classic" || campaign?.falling
      ? state.dropping
        ? "DROPPING"
        : "FALLING · " + state.remaining.toFixed(1) + "s"
      : state.dropping
        ? "DROPPING"
        : "TAKE YOUR TIME";
  $("timer").style.color =
    (state.mode === "classic" || campaign?.falling) && state.remaining < 3
      ? "#ffae8c"
      : "";
  $("turn-label").textContent =
    "DROP " + String(state.turn + 1).padStart(2, "0");
  $("weather-label").textContent =
    state.turn < buildDrops(state) && state.mode === "classic"
      ? "BUILD AN ENCLOSURE BEFORE WATER ARRIVES"
      : worldBonus.rainbow
        ? "RAINBOW · SCORES ×10"
        : "LEVEL " +
          state.level +
          " · " +
          Math.ceil(120 - (state.elapsed % 120)) +
          "s TO NEXT";
  if (campaign) {
    $("weather-label").textContent = complete
      ? "POND KEPT"
      : Math.max(0, campaign.budget - state.turn) + " DROPS LEFT";
    $("turn-label").textContent = complete
      ? state.turn + " DROPS"
      : "DROP " + (state.turn + 1) + " / " + campaign.budget;
  }
  if (state.growth && !state.weather)
    $("weather-label").textContent =
      state.mode === "classic"
        ? `LEVEL ${state.level} · CHAPTER ${Math.min(7, state.growth.milestone + 1)} / 7`
        : `CHAPTER ${Math.min(7, state.growth.milestone + 1)} / 7 · YOUR PACE`;
  if (state.weather)
    $("weather-label").textContent = weatherView(state).label.toUpperCase();
  const falling = state.mode === "classic" || campaign?.falling;
  const controls = complete
    ? "kept-" + campaign.id
    : state.over
      ? "failed-" + (campaign?.id ?? state.mode)
      : falling
        ? "falling"
        : "waiting";
  if (controlKind !== controls) {
    $("rotate").innerHTML = complete
      ? "<span>↻</span> Replay"
      : "<span>↻</span> Rotate <kbd>R</kbd>";
    $("drop").innerHTML = complete
      ? nextIsland(campaign.id) === null
        ? "Journey map <span>↗</span>"
        : campaign.id === 6
          ? "Set sail <span>↗</span>"
          : campaign.id >= 12
            ? "Next island <span>↗</span>"
            : campaign.id + 1 < LESSON_COUNT
              ? "Next lesson <span>↗</span>"
              : "Next challenge <span>↗</span>"
      : falling
        ? "Drop faster <span>↘</span>"
        : "Drop piece <span>↘</span>";
    $("rotate").title = complete ? "Replay (R)" : "Rotate (R)";
    controlKind = controls;
  }
  $("rotate").disabled = complete
    ? !$("overlay").hidden
    : paused || state.over || state.dropping;
  $("drop").disabled = complete
    ? !$("overlay").hidden
    : paused || state.over || state.dropping;
  document
    .querySelectorAll("[data-nudge]")
    .forEach(
      (b) => (b.disabled = complete || paused || state.over || state.dropping),
    );
  if (complete) $("timer").textContent = "TAKE A MOMENT";
  $("descent-meter").hidden =
    state.mode !== "classic" && !campaign?.falling && !state.dropping;
  const contact = landingHeight(state, cursor);
  $("descent-bar").style.width =
    Math.max(
      0,
      Math.min(
        100,
        (1 -
          (state.altitude - contact) /
            Math.max(0.1, SPAWN_ALTITUDE - contact)) *
          100,
      ),
    ) + "%";
  $("pause").disabled = !started || state.over;
  const token = world.pieceScreen;
  const canvasRect = board.getBoundingClientRect();
  for (const panel of [
    $("stage-objective"),
    document.querySelector(".seismic-display"),
  ]) {
    const r = panel.getBoundingClientRect();
    const x = canvasRect.x + (token?.x || 0),
      y = canvasRect.y + (token?.y || 0),
      radius = token?.radius || 0;
    panel.dataset.obscures = String(
      started &&
        !complete &&
        !!token &&
        x + radius > r.left &&
        x - radius < r.right &&
        y + radius > r.top &&
        y - radius < r.bottom,
    );
  }
  drawPiece();
  placement =
    started && !state.over && !complete
      ? previewPlacement(state, cursor)
      : null;
  updateHud(state, placement, paused);
  updateGrowthHUD(state, keeper, paused);
}
function clampCursor() {
  cursor = clampAim(cursor, state.current);
}
function drop() {
  if (inlineComplete()) {
    if (state.over) {
      selectedMode = state.campaign ? "campaign" : state.mode;
      selectedStage = state.campaign?.id ?? suggestedIsland(campaignProgress);
      showDialog(state.campaign ? "stages" : "new");
      return;
    }
    const next = nextIsland(state.campaign.id);
    if (next === null) {
      selectedMode = "campaign";
      selectedStage = state.campaign.id;
      showDialog("stages");
    } else {
      selectedMode = "campaign";
      selectedStage = next;
      newGame();
    }
    return;
  }
  if (paused || !accelerateDrop(state)) return;
  sounds.unlock();
  tone("drop");
  save();
  ui();
}
function land(event) {
  refreshKeeper(
    event,
    !state.growth || state.growth.milestone === observedMilestone,
  );
  tone(event.quake ? "quake" : event.detonated ? "bomb" : event.type, event);
  world.impact(event, state);
  if (event.piece) cursor = rotateAim(cursor, event.piece, state.current);
  if (state.campaign && guideEnabled) {
    lessonFeedback =
      event.type === "sun" &&
      !event.thawed &&
      !event.detonated &&
      (!event.contained || event.removed < 0.1)
        ? {
            text:
              event.removed > 0.1
                ? "That lake leaked. Close its bank before Fire."
                : "Fire landed on dry ground. Aim at the lake.",
            until: state.elapsed + 6,
          }
        : null;
  } else if (event.type === "sun")
    toast(
      event.removed > 0.1
        ? state.campaign && !event.contained
          ? "Water cleared, but that lake was leaking. Close its bank or let the splash settle."
          : `+${event.earned.toLocaleString()} · ${Math.round(event.removed)} water · ×${event.multiplier} · drain −${Math.round((event.drainRelief / LIMIT) * 100)}%`
        : state.noticeUntil > state.elapsed
          ? state.notice
          : "Aim Fire at a lake to score and lower the drain.",
    );
  else if (event.quake) toast(state.notice);
  else if (event.repaired) toast(`Hole repaired. +${event.earned}`);
  else if (state.turn === 1 && event.type === "raise")
    toast("Overlap Upper pieces to enclose dry land.");
  else if (state.turn === buildDrops(state) && state.mode === "classic")
    toast("Water next. Aim inside your enclosure.");
  else if (event.type === "lower")
    toast(
      event.targets.some((i) => state.holes[i])
        ? "Hole widened. Watch for leaks."
        : "Footprint leveled to its lowest point. Watch your banks.",
    );
  if (event.removed > 0.1 && !event.thawed && !event.detonated) {
    const b = event.scoreParts;
    const factors = [
      `${Math.round(event.removed)} water`,
      b.lakes > 1 ? `${b.lakes} lakes` : "",
      b.ducks > 1 ? `ducks ×${b.ducks}` : "",
      b.rainbow > 1 ? "rainbow ×10" : "",
      b.level > 1 ? `level ×${b.level}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    toast(
      `+${event.earned.toLocaleString()}  ·  ${factors}  ·  drain −${Math.round((event.drainRelief / LIMIT) * 100)}%`,
    );
  }
  clampCursor();
  input.rebase();
  record();
  save();
  ui();
}
function rotate() {
  if (inlineComplete()) {
    selectedMode = state.campaign ? "campaign" : state.mode;
    selectedStage = state.campaign?.id ?? suggestedIsland(campaignProgress);
    newGame();
    return;
  }
  if (paused || state.over || state.dropping) return;
  const before = { ...state.current };
  state.current.rotation = (state.current.rotation + 1) % 4;
  cursor = rotateAim(cursor, before, state.current);
  world.twist?.();
  input.rebase();
  tone("rotate");
  save();
  ui();
}
const input = createInputController({
  board,
  world,
  getSession: () => ({ state, paused, started, result: inlineComplete() }),
  getAim: () => cursor,
  setAim: (aim) => {
    cursor = aim;
  },
  save,
  drop,
  rotate,
  pause: () => showDialog("pause"),
  resume,
});
function cancelSteering() {
  input.cancel();
}
board.addEventListener("webglcontextlost", () => {
  if (started && !state.over) showDialog("pause");
});
board.addEventListener("webglcontextrestored", () => {
  lastPiece = "";
  toast("Landscape restored. Your run is saved.");
});
$("view").onclick = () => {
  cancelSteering();
  world.turn();
  save();
  $("view").setAttribute(
    "aria-label",
    "Turn camera. View " + (world.quarter + 1) + " of 4",
  );
};
$("pause").onclick = () => showDialog("pause");
$("smart-bomb").onclick = () => {
  if (!paused && smartBomb(state)) {
    tone("bomb");
    save();
    ui();
  }
};
$("help").onclick = () => showDialog("help");
$("keeper-link").onclick = $("journal-menu").onclick = () =>
  showDialog("journal");
$("journal-close").onclick = () => (started ? resume() : showDialog("start"));
$("rain-charm").onclick = () => {
  if (paused) return;
  const relief = useRainCharm(state);
  if (relief) {
    tone("recovery");
    toast(
      `A little breathing room · drain −${Math.round((relief / LIMIT) * 100)}%`,
    );
    save();
    ui();
  }
};
$("watch-rule").onclick = () => {
  watchingRule = !watchingRule;
  demoStartedAt = animation;
  lastPiece = "";
  ui();
};
$("lesson-toggle").onclick = () => {
  guideEnabled = !guideEnabled;
  write("rainkeep.guides", guideEnabled ? "on" : "off");
  watchingRule = false;
  lastPiece = "";
  ui();
};
$("sound").onclick = () => {
  soundOn = !soundOn;
  write("rainkeep.sound", soundOn ? "on" : "off");
  soundUI();
  sounds.setEnabled(soundOn);
  if (soundOn) sounds.unlock()?.then(() => tone("rain"));
};
if (matchMedia("(pointer: coarse)").matches)
  $("input-tip").textContent =
    "Slide to align · Re-touch keeps aim · Arrows: fine trim";
let focusBeforeModal;
function inlineComplete() {
  return (
    started &&
    (state.campaign?.status === "complete" || state.over) &&
    $("overlay").hidden
  );
}
function showKept() {
  paused = true;
  started = true;
  accumulator = 0;
  cancelSteering();
  watchingRule = false;
  lessonFeedback = null;
  $("overlay").hidden = true;
  document.querySelector(".app").inert = false;
  if (completedState !== state) {
    if (state.campaign?.status === "complete") {
      campaignProgress = finishStage(campaignProgress, state);
      write(CAMPAIGN, JSON.stringify(campaignProgress));
      refreshKeeper(null, true);
    }
    record();
    completedState = state;
    save();
  }
  ui();
  board.focus({ preventScroll: true });
}
const navigation = createNavigation({
  getSession: () => ({
    state,
    started,
    saved,
    campaignProgress,
    selectedMode,
    selectedStage,
    best,
    legacyBest,
    previousBest,
    keeper,
  }),
  choose: (mode, stage) => {
    selectedMode = mode;
    selectedStage = stage;
  },
  begin: (kind) => {
    sounds.stop();
    if ($("overlay").hidden) focusBeforeModal = document.activeElement;
    dialogKind = kind;
    paused = true;
    cancelSteering();
    accumulator = 0;
    save();
    $("overlay").hidden = false;
    document.querySelector(".app").inert = true;
  },
  update: ui,
});
function showDialog(kind) {
  navigation(kind);
}

function resume() {
  if (state.over) {
    showKept();
    return;
  }
  if (state.campaign?.status === "complete") {
    showKept();
    return;
  }
  sounds.unlock();
  paused = false;
  started = true;
  $("overlay").hidden = true;
  document.querySelector(".app").inert = false;
  last = performance.now();
  accumulator = 0;
  ui();
  save();
  (focusBeforeModal &&
  !focusBeforeModal.disabled &&
  focusBeforeModal.offsetParent !== null
    ? focusBeforeModal
    : board
  ).focus({ preventScroll: true });
}
function newGame() {
  $("growth-banner").hidden = true;
  const previousRegion = state.campaign
    ? regionFor(state.campaign.id).id
    : state.mode;
  state =
    selectedMode === "campaign"
      ? createStage(selectedStage)
      : createGame(selectedMode);
  cursor = state.aim ? { ...state.aim } : { x: 8, y: 8 };
  world.clear();
  const nextRegion = state.campaign
    ? regionFor(state.campaign.id).id
    : state.mode;
  if (!reduced && previousRegion !== nextRegion) {
    const landscape = document.querySelector(".landscape");
    landscape.classList.remove("sailing");
    void landscape.offsetWidth;
    landscape.classList.add("sailing");
  }
  watchingRule = false;
  activeLesson = null;
  lessonFeedback = null;
  saved = null;
  lastPiece = "";
  resume();
  lastNotice = "";
  dangerBand = 0;
  $("toast").classList.remove("visible");
  if (!state.campaign)
    toast(
      state.mode === "classic"
        ? "Flat and dry. Build your own lakes before water arrives."
        : "Practice lake ready. Pieces wait for Drop.",
    );
}
$("start").onclick = () => {
  if (dialogKind === "stages") newGame();
  else if (dialogKind === "over" && state.campaign) {
    selectedMode = "campaign";
    selectedStage = state.campaign.id;
    newGame();
  } else if (dialogKind === "pause") resume();
  else if (dialogKind === "help" || dialogKind === "journal") {
    if (started) resume();
    else showDialog("start");
  } else if (dialogKind === "over") showDialog("new");
  else if (dialogKind === "start" && saved && !saved.over) {
    state = saved;
    resume();
    if (!state.campaign) toast("Welcome back to your landscape.");
  } else newGame();
};
$("secondary").onclick = () => {
  if (dialogKind === "stages") {
    if (state.campaign?.status === "complete") showKept();
    else if (state.over) showKept();
    else if (started) resume();
    else showDialog("start");
  } else if (dialogKind === "new") {
    if (state.campaign?.status === "complete") showKept();
    else if (state.over) showKept();
    else if (started) resume();
    else showDialog("start");
  } else showDialog("new");
};
$("campaign-menu").onclick = () => {
  selectedMode = "campaign";
  selectedStage = state.campaign?.id ?? suggestedIsland(campaignProgress);
  showDialog("stages");
};
document.querySelectorAll("[data-mode]").forEach(
  (b) =>
    (b.onclick = () => {
      selectedMode = b.dataset.mode;
      if (selectedMode === "campaign") {
        showDialog("stages");
        return;
      }
      if (dialogKind === "stages") {
        showDialog("new");
        return;
      }
      $("start").textContent =
        "Play " + (selectedMode === "classic" ? "Classic" : "Daydream") + " ↗";
      document.querySelectorAll("[data-mode]").forEach((v) => {
        const active = v === b;
        v.classList.toggle("selected", active);
        v.setAttribute("aria-pressed", String(active));
      });
    }),
);
$("overlay").addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  const focusables = [...$("overlay").querySelectorAll("button")].filter(
    (b) => b.offsetParent !== null && !b.disabled,
  );
  const first = focusables[0],
    end = focusables.at(-1);
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    end.focus();
  } else if (!e.shiftKey && document.activeElement === end) {
    e.preventDefault();
    first.focus();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && started && !paused && !state.over) showDialog("pause");
});
window.addEventListener("pagehide", save);
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstall = e;
  $("install").hidden = false;
});
$("install").onclick = async () => {
  if (deferredInstall) {
    await deferredInstall.prompt();
    deferredInstall = null;
    $("install").hidden = true;
  }
};
$("precision-toggle").onclick = () => {
  const open = $("precision-pad").hidden;
  $("precision-pad").hidden = !open;
  $("precision-toggle").setAttribute("aria-expanded", String(open));
};
$("bring-rain").onclick = () => {
  if (!paused && !state.dropping && bringRain(state)) {
    save();
    ui();
    toast("Clouds gathering. Keep a lake through the shower.");
  }
};
$("result-map").onclick = () => {
  selectedMode = "campaign";
  selectedStage = state.campaign?.id ?? suggestedIsland(campaignProgress);
  showDialog("stages");
};
let uiTime = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!paused || inlineComplete()) animation += dt;
  input.update(now);
  if (started && !paused && !state.over) {
    accumulator += dt;
    while (
      accumulator >= 1 / 30 &&
      !state.over &&
      (!state.campaign || state.campaign.status === "playing")
    ) {
      const landed = tick(state, 1 / 30, cursor);
      stepStage(state, landed, 1 / 30);
      accumulator -= 1 / 30;
      if (landed) land(landed);
    }
    if (state.campaign?.status === "complete") {
      save();
      showKept();
      tone("recovery");
    } else if (state.over) {
      save();
      showKept();
    }
    if (now - lastSave > 1800) {
      save();
      lastSave = now;
    }
  }
  render(dt);
  if (now - uiTime > 100) {
    ui();
    uiTime = now;
  }
  if (now > pulseUntil) $("growth-banner").hidden = true;
  if (now > toastUntil) $("toast").classList.remove("visible");
  requestAnimationFrame(frame);
}
resize();
if (
  state.campaign?.status === "complete" ||
  state.campaign?.status === "failed"
)
  showKept();
else showDialog("start");
requestAnimationFrame(frame);
if (import.meta.env.DEV)
  window.__rainkeep = {
    get sound() {
      return sounds.stats;
    },
    get graphics() {
      return { kind: world.kind, view: world.quarter, ...world.stats };
    },
    get state() {
      return state;
    },
    get cursor() {
      return cursor;
    },
    get paused() {
      return paused;
    },
    get steering() {
      return input.steering;
    },
  };
if ("serviceWorker" in navigator && import.meta.env.PROD)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./sw.js").catch(() => {}),
  );
