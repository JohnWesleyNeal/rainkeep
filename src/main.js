import "./style.css";
import {
  SIZE,
  LIMIT,
  TYPES,
  cells,
  createGame,
  applyPiece,
  validPlacement,
  tick,
  waterTotal,
  restore,
} from "./simulation.js";

const $ = (id) => document.getElementById(id),
  board = $("board"),
  ctx = board.getContext("2d"),
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
let cursor = state.aim ? { ...state.aim } : { x: 4, y: 4 },
  width = 0,
  height = 0,
  unit = 20,
  origin = { x: 0, y: 0 },
  animation = 0,
  last = performance.now(),
  accumulator = 0,
  lastSave = 0,
  dialogKind = "start",
  toastUntil = 0;
let particles = [],
  soundOn = read("rainkeep.sound") === "on",
  audio,
  best = { daydream: 0, classic: 0 },
  deferredInstall;
try {
  const b = JSON.parse(read(BEST));
  for (const mode of ["classic", "daydream"])
    if (Number.isFinite(b?.[mode]) && b[mode] >= 0) best[mode] = b[mode];
} catch {}
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
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
function project(x, y, z = 0) {
  return {
    x: origin.x + (x - y) * unit,
    y: origin.y + (x + y) * unit * 0.5 - z * unit * 0.85,
  };
}
function path(points) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}
function polygon(points, fill, stroke) {
  path(points);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
}
function top(x, y, z) {
  return [
    project(x, y, z),
    project(x + 1, y, z),
    project(x + 1, y + 1, z),
    project(x, y + 1, z),
  ];
}
function cloud(x, y, scale, opacity) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = `rgba(255,255,245,${opacity})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 34, 12, 0, 0, Math.PI * 2);
  ctx.ellipse(-17, -6, 18, 13, 0, 0, Math.PI * 2);
  ctx.ellipse(4, -11, 20, 17, 0, 0, Math.PI * 2);
  ctx.ellipse(23, -5, 15, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function resize() {
  const r = board.getBoundingClientRect();
  width = r.width;
  height = r.height;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  board.width = Math.round(width * dpr);
  board.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  unit = Math.min(width / (SIZE * 2 + 3), height / (SIZE + 7));
  origin = { x: width / 2, y: (height - SIZE * unit) / 2 - 5 };
}
new ResizeObserver(resize).observe(board);
function render() {
  ctx.clearRect(0, 0, width, height);
  const drift = reduced ? 0 : Math.sin(animation * 0.15) * 8;
  cloud(width * 0.15 + drift, height * 0.24, 0.8, 0.42);
  cloud(width * 0.84 - drift, height * 0.21, 1, 0.48);
  cloud(width * 0.78 + drift, height * 0.76, 0.6, 0.32);
  const center = project(8, 8, -1.7);
  ctx.save();
  ctx.translate(center.x, center.y + unit * 2);
  ctx.scale(1, 0.3);
  const shadow = ctx.createRadialGradient(0, 0, 10, 0, 0, unit * 13);
  shadow.addColorStop(0, "#68816928");
  shadow.addColorStop(1, "#68816900");
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.arc(0, 0, unit * 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  polygon(
    [
      project(0, SIZE, 0),
      project(SIZE, SIZE, 0),
      project(SIZE, SIZE, -1.4),
      project(0, SIZE, -1.4),
    ],
    "#819777",
  );
  polygon(
    [
      project(SIZE, 0, 0),
      project(SIZE, SIZE, 0),
      project(SIZE, SIZE, -1.4),
      project(SIZE, 0, -1.4),
    ],
    "#6d8668",
  );
  for (let l = 0; l < 3; l++) {
    const z = -0.45 - l * 0.35;
    ctx.strokeStyle = l === 0 ? "#c7ba8e88" : "#58795b44";
    ctx.lineWidth = unit * 0.14;
    ctx.beginPath();
    let a = project(0, SIZE, z),
      b = project(SIZE, SIZE, z),
      c = project(SIZE, 0, z);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
  }
  const ghost = new Set(
    cells(state.current).map(
      ([dx, dy]) => (cursor.y + dy) * SIZE + cursor.x + dx,
    ),
  );
  const ghostValid = validPlacement(state.current, cursor.x, cursor.y),
    showGhost = started && !paused && !state.over;
  for (let sum = 0; sum <= 2 * (SIZE - 1); sum++)
    for (
      let x = Math.max(0, sum - SIZE + 1);
      x <= Math.min(SIZE - 1, sum);
      x++
    ) {
      const y = sum - x,
        i = y * SIZE + x,
        h = state.terrain[i],
        w = state.water[i],
        p = top(x, y, h);
      const front = y === SIZE - 1 ? 0 : state.terrain[i + SIZE],
        right = x === SIZE - 1 ? 0 : state.terrain[i + 1];
      if (h > front)
        polygon(
          [p[3], p[2], project(x + 1, y + 1, front), project(x, y + 1, front)],
          `hsl(83 22% ${48 - h * 3}%)`,
        );
      if (h > right)
        polygon(
          [p[1], p[2], project(x + 1, y + 1, right), project(x + 1, y, right)],
          `hsl(88 21% ${43 - h * 3}%)`,
        );
      const hue = 83 + ((x + y) % 5),
        light = 61 + ((x * 13 + y * 7) % 7) - h * 1.8;
      polygon(p, `hsl(${hue} 26% ${light}%)`, "#eef2c71c");
      if (h > 0.85) {
        ctx.strokeStyle = "#d4dfac66";
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(p[0].x, p[0].y + 1);
        ctx.lineTo(p[1].x, p[1].y + 1);
        ctx.stroke();
      }
      if (w > 0.012) {
        const surface = h + w,
          wp = top(x, y, surface),
          nl =
            y === SIZE - 1
              ? 0
              : state.terrain[i + SIZE] + state.water[i + SIZE],
          nr = x === SIZE - 1 ? 0 : state.terrain[i + 1] + state.water[i + 1];
        if (surface > nl + 0.03)
          polygon(
            [
              wp[3],
              wp[2],
              project(x + 1, y + 1, Math.max(h, nl)),
              project(x, y + 1, Math.max(h, nl)),
            ],
            "#4397bfa8",
          );
        if (surface > nr + 0.03)
          polygon(
            [
              wp[1],
              wp[2],
              project(x + 1, y + 1, Math.max(h, nr)),
              project(x + 1, y, Math.max(h, nr)),
            ],
            "#3d8db9b5",
          );
        polygon(
          wp,
          `hsla(${195 + Math.min(12, w * 5)} 65% ${65 - Math.min(w * 7, 16)} / .91)`,
          "#beeefc35",
        );
        if ((x * 7 + y * 3) % 9 === 0) {
          const q = project(x + 0.5, y + 0.5, surface + 0.015),
            spark = reduced
              ? 0.5
              : 0.35 + Math.sin(animation * 1.8 + x + y) * 0.2;
          ctx.strokeStyle = `rgba(232,255,255,${spark})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(q.x - unit * 0.25, q.y);
          ctx.lineTo(q.x + unit * 0.15, q.y);
          ctx.stroke();
        }
      }
      if (showGhost && ghost.has(i)) {
        const z = Math.max(h, h + w) + 0.06,
          gp = top(x, y, z),
          col = TYPES[state.current.type].color;
        ctx.save();
        ctx.globalAlpha = 0.55;
        polygon(gp, ghostValid ? col : "#e16e57");
        ctx.restore();
        path(gp);
        ctx.strokeStyle = ghostValid ? "#fffce8" : "#b44834";
        ctx.lineWidth = 1.7;
        ctx.stroke();
        const point = project(x + 0.5, y + 0.5, z);
        ctx.fillStyle = "#fffcef";
        ctx.font = `bold ${Math.max(11, unit * 0.72)}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(TYPES[state.current.type].icon, point.x, point.y);
      }
      if (
        w > 0.13 &&
        (x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1) &&
        !reduced
      ) {
        const q = project(x + 0.5, y + 0.5, -1.2 - ((animation * 1.5) % 1));
        ctx.strokeStyle = "#71c7d9aa";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y - 6);
        ctx.lineTo(q.x, q.y + 5);
        ctx.stroke();
      }
    }
  // Sparse flowers and shrubs around the empty outskirts.
  for (const [x, y] of [
    [2, 3],
    [12, 3],
    [13, 11],
    [3, 12],
    [1, 8],
  ]) {
    const i = y * SIZE + x;
    if (state.water[i] > 0.04 || state.terrain[i] > 0.6) continue;
    const p = project(x + 0.5, y + 0.5, state.terrain[i]);
    ctx.strokeStyle = "#658663";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - 2, p.y - 6);
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 3, p.y - 4);
    ctx.stroke();
    ctx.fillStyle = "#f4d79c";
    ctx.beginPath();
    ctx.arc(p.x - 2, p.y - 7, 1.6, 0, 7);
    ctx.fill();
  }
  if (showGhost) {
    const shape = cells(state.current),
      cx = cursor.x + shape.reduce((a, p) => a + p[0], 0) / shape.length + 0.5,
      cy = cursor.y + shape.reduce((a, p) => a + p[1], 0) / shape.length + 0.5,
      i = Math.min(255, Math.max(0, Math.floor(cy) * SIZE + Math.floor(cx))),
      p = project(
        cx,
        cy,
        Math.max(state.terrain[i], state.terrain[i] + state.water[i]) + 2.1,
      );
    if (state.current.type === "rain") cloud(p.x, p.y, 0.55, 0.95);
    else if (state.current.type === "sun") {
      ctx.fillStyle = "#edc96c";
      ctx.beginPath();
      ctx.arc(p.x, p.y, unit * 0.45, 0, 7);
      ctx.fill();
      ctx.strokeStyle = "#c6a34d";
      ctx.lineWidth = 1.3;
      for (let a = 0; a < 8; a++) {
        const t = (a * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(
          p.x + Math.cos(t) * unit * 0.6,
          p.y + Math.sin(t) * unit * 0.6,
        );
        ctx.lineTo(
          p.x + Math.cos(t) * unit * 0.8,
          p.y + Math.sin(t) * unit * 0.8,
        );
        ctx.stroke();
      }
    }
  }
  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.life -= 1 / 60;
    const q = project(p.x, p.y, p.z);
    ctx.globalAlpha = Math.max(0, p.life / 1.1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(q.x, q.y, 2.3, 0, 7);
    ctx.fill();
    p.z += p.v / 60;
    p.v -= 4 / 60;
  }
  ctx.globalAlpha = 1;
}
let lastPiece = "";
function drawPiece() {
  const key = JSON.stringify(state.current);
  if (key === lastPiece) return;
  lastPiece = key;
  preview.clearRect(0, 0, 150, 100);
  const pts = cells(state.current),
    minX = Math.min(...pts.map(([x, y]) => x - y)),
    maxX = Math.max(...pts.map(([x, y]) => x - y)),
    maxY = Math.max(...pts.map(([x, y]) => x + y));
  for (const [x, y] of pts.sort((a, b) => a[0] + a[1] - b[0] - b[1])) {
    const px = 75 + (x - y - (minX + maxX) / 2) * 18,
      py = 45 + (x + y - maxY / 2) * 9;
    preview.fillStyle = "#68885c";
    preview.beginPath();
    preview.moveTo(px - 18, py);
    preview.lineTo(px, py + 9);
    preview.lineTo(px + 18, py);
    preview.lineTo(px + 18, py + 9);
    preview.lineTo(px, py + 18);
    preview.lineTo(px - 18, py + 9);
    preview.fill();
    preview.fillStyle = TYPES[state.current.type].color;
    preview.beginPath();
    preview.moveTo(px, py - 9);
    preview.lineTo(px + 18, py);
    preview.lineTo(px, py + 9);
    preview.lineTo(px - 18, py);
    preview.closePath();
    preview.fill();
    preview.strokeStyle = "#f5f9d688";
    preview.stroke();
  }
}
function ui() {
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
      ? "Find a lake. Let the sun help."
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
      ? Math.ceil(state.remaining) + "s TO DROP"
      : "TAKE YOUR TIME";
  $("timer").style.color =
    state.mode === "classic" && state.remaining < 3 ? "#b15a3e" : "";
  $("turn-label").textContent =
    "DROP " + String(state.turn + 1).padStart(2, "0");
  $("weather-label").textContent =
    state.turn > 20
      ? "A LITTLE BALANCE GOES A LONG WAY"
      : "A GOOD DAY FOR A LITTLE RAIN";
  $("rotate").disabled = paused || state.over;
  $("drop").disabled = paused || state.over;
  $("pause").disabled = !started || state.over;
  drawPiece();
}
function clampCursor() {
  const pts = cells(state.current),
    mx = Math.max(...pts.map((p) => p[0])),
    my = Math.max(...pts.map((p) => p[1]));
  cursor.x = Math.max(0, Math.min(SIZE - 1 - mx, cursor.x));
  cursor.y = Math.max(0, Math.min(SIZE - 1 - my, cursor.y));
}
function drop() {
  if (paused || state.over) return;
  const event = applyPiece(state, cursor.x, cursor.y);
  if (!event) return;
  tone(event.type);
  if (!reduced)
    for (const i of event.targets)
      for (let n = 0; n < 6; n++)
        particles.push({
          x: (i % SIZE) + 0.2 + Math.random() * 0.6,
          y: Math.floor(i / SIZE) + 0.2 + Math.random() * 0.6,
          z: state.terrain[i] + state.water[i] + 0.2,
          v: 1.5 + Math.random() * 2,
          life: 1.1,
          color: TYPES[event.type].color,
        });
  if (event.type === "sun")
    toast(
      event.removed > 0.1
        ? `A little sunshine. +${Math.round(event.removed * 150)} points`
        : "Aim the sun at water to score.",
    );
  else if (state.turn === 1) toast("Build banks around the water.");
  else if (state.turn === 3) toast("Rain next. Aim inside your lake.");
  else if (event.type === "lower")
    toast("Bank lowered. Watch where the water goes.");
  clampCursor();
  record();
  save();
  ui();
}
function rotate() {
  if (paused || state.over) return;
  state.current.rotation = (state.current.rotation + 1) % 4;
  clampCursor();
  tone("raise");
  save();
  ui();
}
function locate(e) {
  const r = board.getBoundingClientRect(),
    sx = e.clientX - r.left,
    sy = e.clientY - r.top - (e.pointerType === "touch" ? 38 : 0);
  let closest = null,
    distance = Infinity;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x,
        p = project(x + 0.5, y + 0.5, state.terrain[i] + state.water[i]),
        d = Math.abs(sx - p.x) / unit + Math.abs(sy - p.y) / (unit * 0.5);
      if (d < distance) {
        distance = d;
        closest = { x, y };
      }
    }
  if (closest) {
    cursor = closest;
    clampCursor();
  }
}
let pointerId = null;
board.addEventListener("pointerdown", (e) => {
  if (paused) return;
  pointerId = e.pointerId;
  board.setPointerCapture(e.pointerId);
  locate(e);
  board.focus({ preventScroll: true });
});
board.addEventListener("pointermove", (e) => {
  if (!paused && (e.pointerType === "mouse" || e.pointerId === pointerId))
    locate(e);
});
board.addEventListener("pointerup", () => {
  pointerId = null;
});
board.addEventListener("pointercancel", () => {
  pointerId = null;
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
  if (
    paused ||
    ["BUTTON", "A", "INPUT"].includes(document.activeElement.tagName)
  )
    return;
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
  if (e.code === "ArrowLeft") cursor.x--;
  if (e.code === "ArrowRight") cursor.x++;
  if (e.code === "ArrowUp") cursor.y--;
  if (e.code === "ArrowDown") cursor.y++;
  if (e.code === "KeyR") rotate();
  if (e.code === "Space") drop();
  clampCursor();
});
$("drop").onclick = drop;
$("rotate").onclick = rotate;
$("pause").onclick = () => showDialog("pause");
$("help").onclick = () => showDialog("help");
$("sound").onclick = () => {
  soundOn = !soundOn;
  write("rainkeep.sound", soundOn ? "on" : "off");
  soundUI();
  if (soundOn) tone("rain");
};
if (matchMedia("(pointer: coarse)").matches)
  $("input-tip").textContent = "Drag on the land to aim. Tap Drop to place.";
let focusBeforeModal;
function showDialog(kind) {
  if ($("overlay").hidden) focusBeforeModal = document.activeElement;
  dialogKind = kind;
  paused = true;
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
      "Shape the land. Catch the water.<br>See how long your little lakes can last.";
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
      "<b>↑ Raise</b> banks to hold the water.<br><b>↓ Lower</b> land to carve or connect lakes.<br><b>● Rain</b> falls wherever you place it.<br><b>✦ Sun</b> dries nearby water for points.<br><br>Water spills off open edges. Fill the overflow gauge and your run ends.";
    start.textContent = started ? "Back to your landscape ↗" : "Got it ↗";
    $("modal-foot").textContent =
      "Drag or point to aim. Rotate, then Drop. Keyboard: arrows / R / Space.";
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
  cursor = { x: 4, y: 4 };
  particles = [];
  saved = null;
  lastPiece = "";
  resume();
  save();
  toast("A little lake to get you started.");
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
  if (started && !paused && !state.over) {
    accumulator += dt;
    while (accumulator >= 1 / 30 && !state.over) {
      tick(state, 1 / 30);
      accumulator -= 1 / 30;
      if (state.mode === "classic" && state.remaining <= 0) drop();
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
  render();
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
    get state() {
      return state;
    },
    get cursor() {
      return cursor;
    },
    get paused() {
      return paused;
    },
  };
if ("serviceWorker" in navigator && import.meta.env.PROD)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./sw.js").catch(() => {}),
  );
