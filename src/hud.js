import { cells, TYPES, waterBubbles, LIMIT } from "./simulation.js";
import { drawWaterBubble } from "./bubble-canvas.js";
import { peekPieces, buildDrops } from "./piece-queue.js";
import { STAGES, stageProgress } from "./stages.js";
import { lessonFor, TAKEAWAYS } from "./lessons.js";
import { canBringRain } from "./weather.js";
import { failureReason, medalDescription } from "./screen-content.js";

export function drawQueuePiece(canvas, p) {
  const c = canvas.getContext("2d");
  const pts = cells(p),
    xs = pts.map(([x, y]) => x - y),
    ys = pts.map(([x, y]) => (x + y) * 0.65);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const unit = Math.min(13, 92 / (maxX - minX + 2), 48 / (maxY - minY + 2));
  c.clearRect(0, 0, 120, 64);
  const pos = (x, y) => [
    60 + (x - y - (minX + maxX) / 2) * unit,
    31 + ((x + y) * 0.65 - (minY + maxY) / 2) * unit,
  ];
  if (p.type === "rain") {
    for (const b of waterBubbles(p))
      drawWaterBubble(c, ...pos(b.x, b.y), unit * 0.9, b.fill);
  } else if (["raise", "lower"].includes(p.type)) {
    for (const [x, y] of pts) {
      const [px, py] = pos(x, y);
      c.fillStyle = p.type === "raise" ? "#d8815f" : "#579f87";
      c.beginPath();
      c.moveTo(px, py - unit * 0.65);
      c.lineTo(px + unit, py);
      c.lineTo(px, py + unit * 0.65);
      c.lineTo(px - unit, py);
      c.closePath();
      c.fill();
    }
  } else {
    c.fillStyle = p.type === "sun" ? "#d98a37" : "#425c5a";
    c.font = "34px Georgia";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(TYPES[p.type].icon, 60, 32);
  }
}

export function createHud() {
  const $ = (id) => document.getElementById(id);
  let queueKey = "",
    cueText = "";
  return function updateHud(s, preview, paused) {
    const c = s.campaign,
      complete = c?.status === "complete",
      failed = !!s.over;
    const result = complete || failed;
    const app = document.querySelector(".app");
    app.dataset.result = String(result);
    app.dataset.mode = c ? "campaign" : s.mode;
    $("free-objective").hidden = !!c;
    $("free-instruction").textContent =
      s.mode === "classic" && s.turn < buildDrops(s)
        ? "Build an enclosure. Water is on its way."
        : s.mode === "daydream"
          ? "Experiment at your own pace. Every drop is committed."
          : "Keep lakes contained. Fire scores and lowers the drain.";
    $("score").textContent = Math.floor(s.score).toLocaleString();
    const limit = c && STAGES[c.id].maxDrain;
    $("drain-limit").hidden = !limit;
    if (limit) $("drain-limit").style.left = `${limit * 100}%`;
    $("spill-text").textContent =
      `${Math.floor((s.spill / LIMIT) * 100)}%${limit ? " / " + Math.round(limit * 100) + "%" : ""}`;
    $("bring-rain").hidden = !canBringRain(s) || result;
    $("bring-rain").disabled = paused || s.dropping;
    $("next-label").hidden = false;
    $("next-label").textContent =
      !c && s.version !== 4 ? "NEXT · LEGACY RUN" : "COMING NEXT";
    $("watch-rule").hidden = !c || c.id >= 12 || result;
    const p = peekPieces(s),
      key = JSON.stringify(p);
    if (key !== queueKey) {
      queueKey = key;
      $("upcoming").replaceChildren(
        ...p.map((piece, n) => {
          const node = document.createElement("div");
          node.className = "queue-piece";
          const canvas = document.createElement("canvas");
          canvas.width = 120;
          canvas.height = 64;
          canvas.setAttribute("aria-hidden", "true");
          const label = document.createElement("span");
          label.textContent = TYPES[piece.type].name;
          node.setAttribute(
            "aria-label",
            `${n + 1}: ${TYPES[piece.type].name}, shape ${piece.shape + 1}${piece.type === "rain" ? ", " + cells(piece).length + " bubbles" : ""}`,
          );
          node.append(canvas, label);
          drawQueuePiece(canvas, piece);
          return node;
        }),
      );
    }
    const message = preview
      ? `${preview.icon}|${preview.label}|${preview.delta}|${preview.kind}`
      : "";
    if (message !== cueText) {
      cueText = message;
      $("placement-text").textContent = preview?.label || "";
      $("placement-icon").textContent = preview?.icon || "";
      $("placement-delta").textContent = preview?.delta
        ? `${preview.delta > 0 ? "+" : ""}${preview.delta}% land`
        : "";
      $("placement-cue").dataset.kind = preview?.kind || "safe";
    }
    $("placement-cue").hidden = result;
    $("precision-toggle").hidden = result;
    $("result-map").hidden = !result;
    if (result) {
      $("precision-pad").hidden = true;
      $("precision-toggle").setAttribute("aria-expanded", "false");
    }
    $("result-detail").hidden = !result;
    if (result) {
      $("piece-heading-label").textContent = complete
        ? "ISLAND KEPT"
        : "A LITTLE WISER";
      $("piece-name").textContent = complete
        ? "Beautifully kept."
        : "Another little try?";
      const text = complete ? TAKEAWAYS[c.id] : failureReason(s);
      if ($("piece-desc").textContent !== text)
        $("piece-desc").textContent = text;
      $("result-detail").textContent = c
        ? medalDescription(s)
        : `${s.turn} drops · Level ${s.level} · ${Math.floor(s.score).toLocaleString()} points`;
      $("timer").textContent = complete
        ? "★".repeat(
            1 +
              (s.turn <= STAGES[c.id].par ? 1 : 0) +
              (s.turn <= STAGES[c.id].par &&
              c.worstDrain <= 0.15 &&
              s.quakes === c.startingQuakes
                ? 1
                : 0),
          )
        : "TAKE A BREATH";
      $("input-tip").textContent = complete
        ? "Your medals are saved."
        : "The island stays here until you choose.";
      if (failed) {
        $("rotate").innerHTML = "↻ Retry";
        $("drop").innerHTML = c ? "Choose an island ↗" : "Choose a mode ↗";
        $("rotate").disabled = $("drop").disabled = !$("overlay").hidden;
      }
    }
    if (c && !result) {
      if (c.id === 0) {
        const lesson = lessonFor(s);
        const step = ["bank", "fill", "clear"].indexOf(lesson?.key);
        $("stage-progress").textContent = [
          "Close bank",
          "Fill pond",
          "Evaporate",
        ]
          .map((v, n) => `${n < step ? "✓" : n === step ? "→" : "○"} ${v}`)
          .join("  ");
        $("stage-goal-bar").style.width = `${(Math.max(0, step) / 3) * 100}%`;
      } else {
        const progress = stageProgress(s);
        $("stage-progress").textContent =
          progress.text + (STAGES[c.id].noQuake ? " · No quake" : "");
      }
    }
  };
}
