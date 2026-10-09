import "./style.css";
import {
  SIZE,
  LIMIT,
  TYPES,
  cells,
  createGame,
  SPAWN_ALTITUDE,
  accelerateDrop,
  landingHeight,
  validPlacement,
  tick,
  waterTotal,
  restore,
  bonuses,
  landMass,
  QUAKE_LIMIT,
  smartBomb,
} from "./simulation.js";
import {
  clampAim,
  beginDrag,
  moveDrag,
  rebaseDrag,
  rotateAim,
} from "./controls.js";
import { createWorldRenderer } from "./renderer.js";

const $ = (id) => document.getElementById(id),
  board = $("board"),
  preview = $("piece").getContext("2d");
const SAVE = "rainkeep.run.v1",
  BEST = "rainkeep.best.v1";
const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
let storageWorks = true;
const write = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    if (storageWorks) {
      storageWorks = false;
      toast("Storage is unavailable. This run will not save.");
    }
  }
};
let saved = restore(read(SAVE)),
  state = saved && !saved.over ? saved : createGame(),
  started = false,
  paused = true,
  selectedMode = state.mode;
let cursor = state.aim ? { ...state.aim } : { x: 8, y: 8 },
  unit = 20,
  animation = 0,
  last = performance.now(),
  accumulator = 0,
  lastSave = 0,
  dialogKind = "start",
  toastUntil = 0;
let soundOn = read("rainkeep.sound") === "on",
  audio,
  best = { daydream: 0, classic: 0 },
  deferredInstall;
try {
  const b = JSON.parse(read(BEST));
  for (const mode of ["classic", "daydream"])
    if (Number.isFinite(b?.[mode]) && b[mode] >= 0) best[mode] = b[mode];
} catch {}
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const world = createWorldRenderer(board, reduced);
board.dataset.graphics = world.kind;
let worldBonus = bonuses(state),
  lastNotice = "";
function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("visible");
  toastUntil = performance.now() + 2600;
}
function save() {
  if (started) {
    state.aim = { ...cursor };
    write(SAVE, JSON.stringify(state));
  }
}
function record() {
  if (state.score > best[state.mode]) {
    best[state.mode] = state.score;
    write(BEST, JSON.stringify(best));
  }
}
function tone(type) {
  if (!soundOn) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const notes =
      type === "sun"
        ? [523, 659, 784]
        : type === "rain"
          ? [440, 330, 550]
          : type === "lower"
            ? [170, 120]
            : [220, 330];
    notes.forEach((f, i) => {
      const o = audio.createOscillator(),
        g = audio.createGain(),
        t = audio.currentTime + i * 0.065;
      o.type = "sine";
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.85, t + 0.16);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.1, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      o.connect(g);
      g.connect(audio.destination);
      o.start(t);
      o.stop(t + 0.25);
    });
  } catch {}
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
  unit = world.resize();
  cancelSteering();
}
new ResizeObserver(resize).observe(board);
function render(dt) {
  world.render(state, cursor, animation, dt, {
    paused,
    showPiece: started && !state.over,
    bonuses: worldBonus,
  });
}
let lastPiece = "";
function drawPiece() {
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
function ui() {
  record();
  worldBonus = bonuses(state);
  $("level").textContent = state.level;
  $("lakes").textContent = worldBonus.lakes;
  $("ducks").textContent = worldBonus.ducks;
  $("multiplier").textContent = "×" + worldBonus.multiplier;
  const pressure = Math.min(
    100,
    Math.round((landMass(state) / QUAKE_LIMIT) * 100),
  );
  $("quake-text").textContent = pressure + "%";
  $("quake-bar").style.width = pressure + "%";
  $("quake-bar").style.background = pressure > 75 ? "#c6664f" : "#9bab7a";
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
    toast(state.notice);
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
  $("best").textContent = String(best[state.mode]).padStart(5, "0");
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
  $("piece-desc").textContent = TYPES[state.current.type].label;
  $("piece-symbol").textContent = TYPES[state.current.type].icon;
  $("next").textContent =
    TYPES[state.next.type].icon + " " + TYPES[state.next.type].name;
  $("mode-label").textContent = state.mode.toUpperCase();
  $("timer").textContent =
    state.mode === "classic"
      ? state.dropping
        ? "DROPPING"
        : "FALLING · " + state.remaining.toFixed(1) + "s"
      : state.dropping
        ? "DROPPING"
        : "TAKE YOUR TIME";
  $("timer").style.color =
    state.mode === "classic" && state.remaining < 3 ? "#ffae8c" : "";
  $("turn-label").textContent =
    "DROP " + String(state.turn + 1).padStart(2, "0");
  $("weather-label").textContent =
    state.turn < 12 && state.mode === "classic"
      ? "BUILD AN ENCLOSURE BEFORE WATER ARRIVES"
      : worldBonus.rainbow
        ? "RAINBOW · SCORES ×10"
        : "LEVEL " +
          state.level +
          " · " +
          Math.ceil(120 - (state.elapsed % 120)) +
          "s TO NEXT";
  $("rotate").disabled = paused || state.over || state.dropping;
  $("drop").disabled = paused || state.over || state.dropping;
  document
    .querySelectorAll("[data-nudge]")
    .forEach((b) => (b.disabled = paused || state.over || state.dropping));
  $("descent-meter").hidden = state.mode !== "classic" && !state.dropping;
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
  drawPiece();
}
function clampCursor() {
  cursor = clampAim(cursor, state.current);
}
function drop() {
  if (paused || !accelerateDrop(state)) return;
  save();
  ui();
}
function land(event) {
  tone(event.type);
  world.impact(event, state);
  if (event.piece) cursor = rotateAim(cursor, event.piece, state.current);
  if (event.type === "sun")
    toast(
      event.removed > 0.1
        ? `Lake evaporated. +${event.earned} · ×${event.multiplier}`
        : state.noticeUntil > state.elapsed
          ? state.notice
          : "Aim Fire at a lake to score and lower the drain.",
    );
  else if (event.quake) toast(state.notice);
  else if (event.repaired) toast(`Hole repaired. +${event.earned}`);
  else if (state.turn === 1) toast("Overlap Upper pieces to enclose dry land.");
  else if (state.turn === 12) toast("Water next. Aim inside your enclosure.");
  else if (event.type === "lower")
    toast("Footprint leveled to its lowest point. Watch your banks.");
  clampCursor();
  rebaseDrag(drag, cursor);
  record();
  save();
  ui();
}
function rotate() {
  if (paused || state.over || state.dropping) return;
  const before = { ...state.current };
  state.current.rotation = (state.current.rotation + 1) % 4;
  cursor = rotateAim(cursor, before, state.current);
  world.twist?.();
  rebaseDrag(drag, cursor);
  tone("raise");
  save();
  ui();
}
function locate(e) {
  const aim = world.pick(e.clientX, e.clientY, state.current);
  if (aim) cursor = clampAim(aim, state.current);
}
let pointerId = null,
  drag = null,
  nudgeHold = null;
function cancelSteering() {
  pointerId = null;
  drag = null;
  nudgeHold = null;
}
board.addEventListener("pointerdown", (e) => {
  if (
    paused ||
    state.over ||
    state.dropping ||
    pointerId !== null ||
    (e.pointerType === "mouse" && e.button !== 0)
  )
    return;
  e.preventDefault();
  pointerId = e.pointerId;
  board.setPointerCapture(e.pointerId);
  if (e.pointerType === "mouse") locate(e);
  else
    drag = beginDrag(
      { x: e.clientX, y: e.clientY },
      cursor,
      unit,
      world.quarter,
    );
  board.focus({ preventScroll: true });
});
board.addEventListener("pointermove", (e) => {
  if (paused || state.over) return;
  if (e.pointerId === pointerId && drag) {
    if (state.dropping) {
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      return;
    }
    cursor = moveDrag(drag, { x: e.clientX, y: e.clientY }, state.current);
  } else if (e.pointerType === "mouse" && !state.dropping) locate(e);
});
for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
  board.addEventListener(name, (e) => {
    if (e.pointerId === pointerId) {
      pointerId = null;
      drag = null;
      save();
    }
  });
function nudge(dx, dy) {
  if (paused || state.over || state.dropping) return;
  const angle = (world.quarter * Math.PI) / 2,
    c = Math.round(Math.cos(angle)),
    s = Math.round(Math.sin(angle));
  cursor = clampAim(
    { x: cursor.x + c * dx + s * dy, y: cursor.y - s * dx + c * dy },
    state.current,
  );
  rebaseDrag(drag, cursor);
  save();
}
document.querySelectorAll("[data-nudge]").forEach((button) => {
  const [dx, dy] = button.dataset.nudge.split(",").map((v) => Number(v) * 0.2);
  button.addEventListener("pointerdown", (e) => {
    if (button.disabled) return;
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    nudge(dx, dy);
    nudgeHold = { id: e.pointerId, dx, dy, next: performance.now() + 330 };
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    button.addEventListener(name, (e) => {
      if (nudgeHold?.id === e.pointerId) nudgeHold = null;
    });
  button.addEventListener("click", (e) => {
    if (e.detail === 0) nudge(dx, dy);
  });
});
window.addEventListener("blur", cancelSteering);
board.addEventListener("webglcontextlost", () => {
  if (started && !state.over) showDialog("pause");
});
board.addEventListener("webglcontextrestored", () => {
  lastPiece = "";
  toast("Landscape restored. Your run is saved.");
});
window.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    e.preventDefault();
    if (started && !state.over) {
      if (paused) resume();
      else showDialog("pause");
    }
    return;
  }
  if (paused || ["A", "INPUT"].includes(document.activeElement.tagName)) return;
  if (
    [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Space",
      "KeyR",
    ].includes(e.code)
  )
    e.preventDefault();
  if (state.dropping) return;
  const step = e.shiftKey ? 1 : 0.2;
  if (e.code === "ArrowLeft") nudge(-step, 0);
  if (e.code === "ArrowRight") nudge(step, 0);
  if (e.code === "ArrowUp") nudge(0, -step);
  if (e.code === "ArrowDown") nudge(0, step);
  if (e.code === "KeyR") rotate();
  if (e.code === "Space") drop();
  clampCursor();
});
for (const [id, action] of [
  ["drop", drop],
  ["rotate", rotate],
]) {
  // Act on press so an action thumb responds while the first thumb steers.
  // Keyboard activation still uses click, without duplicating pointer actions.
  $(id).addEventListener("pointerdown", (e) => {
    if ($(id).disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    action();
  });
  $(id).addEventListener("click", (e) => {
    if (e.detail === 0) action();
  });
}
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
$("sound").onclick = () => {
  soundOn = !soundOn;
  write("rainkeep.sound", soundOn ? "on" : "off");
  soundUI();
  if (soundOn) tone("rain");
};
if (matchMedia("(pointer: coarse)").matches)
  $("input-tip").textContent =
    "Slide to align · Re-touch keeps aim · Arrows: fine trim";
let focusBeforeModal;
function showDialog(kind) {
  if ($("overlay").hidden) focusBeforeModal = document.activeElement;
  dialogKind = kind;
  paused = true;
  cancelSteering();
  accumulator = 0;
  save();
  $("overlay").hidden = false;
  document.querySelector(".app").inert = true;
  const title = $("modal-title"),
    copy = $("modal-copy"),
    start = $("start"),
    second = $("secondary");
  copy.className = "";
  $("intro-rules").hidden = kind !== "start" && kind !== "new";
  $("mode-picker").hidden = kind !== "start" && kind !== "new";
  second.hidden = true;
  $("modal-eyebrow").textContent = "A SMALL WORLD. A SIMPLE CHALLENGE.";
  $("modal-foot").textContent = "Best played with a little curiosity.";
  if (kind === "start" || kind === "new") {
    title.innerHTML = "Keep a little<br><em>rain.</em>";
    copy.innerHTML =
      "Classic starts flat and dry. Build enclosures with Uppers before water arrives.<br>Keep the drain low. Fire clears lakes; too much land risks earthquakes.";
    start.textContent =
      kind === "start" && saved && !saved.over
        ? "Continue your landscape ↗"
        : "Let it rain ↗";
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
    copy.textContent = "Your landscape is saved. The rain can wait.";
    start.textContent = "Keep playing ↗";
    second.hidden = false;
    second.textContent = "Start a fresh landscape";
  } else if (kind === "help") {
    $("modal-eyebrow").textContent = "A FIELD GUIDE TO RAINKEEP";
    title.innerHTML = "Go with<br>the <em>flow.</em>";
    copy.className = "instructions";
    copy.innerHTML =
      "<b>Align your banks.</b> Placement is continuous. Partial overlaps make lower edges; imperfect seams can leak. The soft shadow shows your footprint. Turn view to judge depth.<br><b>↑ Upper</b> raises land and repairs holes.<br><b>↓ Downer</b> lowers covered land toward its lowest point; touching a hole expands it.<br><b>● Water</b> flows downhill. Edges and holes fill the drain.<br><b>✦ Fire</b> evaporates a lake for points and drain relief. Dry fire flattens land.<br><b>✹ Bomb</b> punches a hole. Bombing a hole triggers more bombs.<br><br>Lakes, deep-water ducks, and a rainbow multiply scores. Excess land triggers earthquakes. Level 2 adds ice; fire thaws it. Level 4 adds mines; fire detonates them. Five lakes at level-up earn a Smart bomb.<br><br><b>Classic:</b> dry start with falling pieces.<br><b>Daydream:</b> a practice lake; pieces wait for Drop.";
    start.textContent = started ? "Back to your landscape ↗" : "Got it ↗";
    $("modal-foot").textContent =
      "Slide to steer; re-touch keeps your aim. Arrows: fine steps. Keyboard: arrows / Shift for larger steps / R / Space.";
  } else if (kind === "over") {
    record();
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
  ui();
  start.focus({ preventScroll: true });
}
function resume() {
  paused = false;
  started = true;
  $("overlay").hidden = true;
  document.querySelector(".app").inert = false;
  last = performance.now();
  accumulator = 0;
  ui();
  (focusBeforeModal && !focusBeforeModal.disabled
    ? focusBeforeModal
    : board
  ).focus({ preventScroll: true });
}
function newGame() {
  state = createGame(selectedMode);
  cursor = { x: 8, y: 8 };
  world.clear();
  saved = null;
  lastPiece = "";
  resume();
  save();
  lastNotice = "";
  toast(
    state.mode === "classic"
      ? "Flat and dry. Build your own lakes before water arrives."
      : "Practice lake ready. Pieces wait for Drop.",
  );
}
$("start").onclick = () => {
  if (dialogKind === "pause") resume();
  else if (dialogKind === "help") {
    if (started) resume();
    else showDialog("start");
  } else if (dialogKind === "over") showDialog("new");
  else if (dialogKind === "start" && saved && !saved.over) {
    state = saved;
    resume();
    toast("Welcome back to your landscape.");
  } else newGame();
};
$("secondary").onclick = () => {
  if (dialogKind === "new") {
    if (state.over) showDialog("over");
    else if (started) resume();
    else showDialog("start");
  } else showDialog("new");
};
document.querySelectorAll("[data-mode]").forEach(
  (b) =>
    (b.onclick = () => {
      selectedMode = b.dataset.mode;
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
    (b) => b.offsetParent !== null,
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
let uiTime = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!paused) animation += dt;
  if (nudgeHold && now >= nudgeHold.next) {
    nudge(nudgeHold.dx, nudgeHold.dy);
    nudgeHold.next = now + 100;
  }
  if (started && !paused && !state.over) {
    accumulator += dt;
    while (accumulator >= 1 / 30 && !state.over) {
      const landed = tick(state, 1 / 30, cursor);
      accumulator -= 1 / 30;
      if (landed) land(landed);
    }
    if (state.over) {
      save();
      showDialog("over");
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
  if (now > toastUntil) $("toast").classList.remove("visible");
  requestAnimationFrame(frame);
}
resize();
showDialog("start");
requestAnimationFrame(frame);
if (import.meta.env.DEV)
  window.__rainkeep = {
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
      return pointerId !== null && board.hasPointerCapture(pointerId);
    },
  };
if ("serviceWorker" in navigator && import.meta.env.PROD)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./sw.js").catch(() => {}),
  );
