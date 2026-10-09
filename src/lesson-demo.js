import { drawWaterBubble } from "./bubble-canvas.js";

// A small opt-in rule demonstration inside the existing preview, not a video
// overlay. It follows the game's palette and stops with pause/reduced motion.
export function drawLessonDemo(ctx, key, time, reduced = false) {
  const t = reduced ? 0.65 : (time % 5.2) / 5.2;
  ctx.clearRect(0, 0, 150, 100);
  const poly = (points, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  };
  const diamond = (x, y, w, h, color) =>
    poly(
      [
        [x, y - h],
        [x + w, y],
        [x, y + h],
        [x - w, y],
      ],
      color,
    );
  const fire = (x, y) => {
    const gradient = ctx.createRadialGradient(x, y, 1, x, y, 10);
    gradient.addColorStop(0, "#fff7bd");
    gradient.addColorStop(0.6, "#ffd45b");
    gradient.addColorStop(1, "#ef883e");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    poly(
      [
        [x - 5, y - 4],
        [x + 3, y - 25],
        [x + 7, y - 5],
      ],
      "#f7b74e",
    );
  };
  poly(
    [
      [15, 54],
      [75, 84],
      [135, 54],
      [135, 64],
      [75, 94],
      [15, 64],
    ],
    "#425d59",
  );
  diamond(75, 54, 60, 30, "#9eae84");
  const separate = key === "separate";
  const ponds = separate
    ? [
        [47, 54, 24, 12],
        [104, 54, 24, 12],
      ]
    : [[75, 53, 44, 22]];
  for (const [x, y, w, h] of ponds) {
    diamond(x, y - 7, w, h, "#c8b687");
    poly(
      [
        [x - w, y - 7],
        [x, y + h - 7],
        [x + w, y - 7],
        [x + w, y + 2],
        [x, y + h + 2],
        [x - w, y + 2],
      ],
      "#93835e",
    );
    const filling = ["fill", "duck", "bank", "separate"].includes(key);
    const emptying = key === "clear" && t > 0.5;
    const amount = filling
      ? Math.min(1, Math.max(0.15, (t - 0.2) * 2))
      : emptying
        ? Math.max(0, 1 - (t - 0.5) * 2.5)
        : 0.85;
    const wy = y + 2 - amount * 5;
    diamond(x, y, w * 0.7, h * 0.7, "#799782");
    if (amount > 0.05)
      diamond(
        x,
        wy,
        w * 0.7,
        h * 0.7,
        key === "thaw" && t < 0.45
          ? "#c7eef0"
          : amount < 0.5
            ? "#46c7b7"
            : "#257ca8",
      );
    if (key === "patch" || key === "mine") {
      if (t < 0.45 || (key === "mine" && t > 0.45)) {
        diamond(x + 2, y + 3, 10, 5, "#ebbb7b");
        diamond(x + 2, y + 3, 7, 3.5, "#a5e4ea");
      }
      if (key === "mine" && t < 0.45) {
        ctx.fillStyle = "#5a6865";
        ctx.beginPath();
        ctx.arc(x + 2, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffb56d";
        ctx.fillRect(x, y - 2, 3, 3);
      }
    }
    if (key === "duck" && t > 0.6) {
      ctx.fillStyle = "#fff0ad";
      ctx.beginPath();
      ctx.ellipse(x, wy, 6, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 4, wy - 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
      poly(
        [
          [x + 7, wy - 4],
          [x + 11, wy - 3],
          [x + 7, wy - 2],
        ],
        "#efab57",
      );
    }
    if (key === "clear" && t > 0.5) {
      ctx.globalAlpha = Math.max(0, 1 - (t - 0.5) * 1.8);
      ctx.strokeStyle = "#deeee0";
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        const sy = wy - (t - 0.5) * 35;
        ctx.beginPath();
        ctx.moveTo(x + i * 12, sy + 12);
        ctx.quadraticCurveTo(x + i * 12 - 5, sy + 5, x + i * 12, sy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  const landing = Math.min(1, t / 0.42);
  const py = 5 + landing * 34;
  if (key === "level") {
    const height = t < 0.5 ? 30 : 8;
    poly(
      [
        [48, 51],
        [61, 57],
        [74, 51],
        [74, 51 - height],
        [61, 57 - height],
        [48, 51 - height],
      ],
      "#93835e",
    );
    diamond(61, 51 - height, 13, 6, "#c8b687");
    if (t < 0.5) diamond(62, py - 10, 22, 8, "#647bc3");
  } else if (["bank", "patch"].includes(key)) {
    if (key === "bank" && t < 0.42) diamond(48, 60, 11, 7, "#96b19a");
    if (t < 0.42) {
      poly(
        [
          [51, py],
          [77, py + 13],
          [87, py + 8],
          [87, py + 13],
          [77, py + 18],
          [51, py + 5],
        ],
        "#af643b",
      );
      poly(
        [
          [51, py],
          [61, py - 5],
          [87, py + 8],
          [77, py + 13],
        ],
        "#ee925a",
      );
    }
  } else if (["clear", "thaw", "mine"].includes(key)) {
    if (t < 0.5) fire(75, py);
  } else if (["fill", "duck", "separate", "fall"].includes(key)) {
    if (t < 0.5)
      drawWaterBubble(
        ctx,
        separate ? 104 : 75,
        py - 2,
        14,
        0.2,
        reduced ? 0 : time,
      );
  } else if (key === "hold") {
    ctx.strokeStyle = "#ceebba";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      75,
      51,
      12,
      -Math.PI / 2,
      -Math.PI / 2 + (reduced ? 1 : Math.min(1, t * 2)) * Math.PI * 2,
    );
    ctx.stroke();
  }
}
