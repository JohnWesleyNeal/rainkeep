// Piece randomness is independent of timed hazards. Only queue replenishment
// advances this stream; inspecting upcoming pieces never changes the game.
const weighted = [
  "raise",
  "raise",
  "raise",
  "rain",
  "rain",
  "rain",
  "lower",
  "sun",
  "bomb",
];
const upper = (shape) => ({ type: "raise", shape, rotation: 0 });
const token = (type) => ({
  type,
  shape: 0,
  rotation: 0,
  ...(type === "rain" ? { waterSize: 1 } : {}),
});
const openings = {
  classic: [5, 6, 5, 7, 5, 6]
    .map(upper)
    .concat([token("rain"), token("rain"), token("sun")]),
  daydream: [
    token("rain"),
    token("sun"),
    upper(5),
    { type: "lower", shape: 2, rotation: 0 },
    token("rain"),
    token("sun"),
  ],
};
export const buildDrops = (s) =>
  s.rulesVersion === 2 ? (s.mode === "classic" ? 6 : 0) : 12;
export function drawQueuedPiece(s, turn) {
  const q = s.queueState;
  const random = () => {
    q.seed = (Math.imul(1664525, q.seed) + 1013904223) >>> 0;
    return q.seed / 4294967296;
  };
  let p = openings[s.mode][turn];
  if (p) p = { ...p };
  else {
    const choices =
      q.previous === "bomb" ? weighted.filter((t) => t !== "bomb") : weighted;
    const type =
      q.fireGap >= 6 ? "sun" : choices[Math.floor(random() * choices.length)];
    const shape = Math.floor(random() * 8);
    p = {
      type,
      shape,
      rotation: 0,
      ...(type === "rain" ? { waterSize: shape % 3 } : {}),
    };
  }
  q.fireGap = p.type === "sun" ? 0 : q.fireGap + 1;
  q.previous = p.type;
  return p;
}
export function peekPieces(s) {
  if (s.campaign)
    return [1, 2, 3].map((n) => ({
      ...s.campaign.queue[(s.turn + n) % s.campaign.queue.length],
    }));
  return (s.upcoming || [s.next]).map((p) => ({ ...p }));
}
