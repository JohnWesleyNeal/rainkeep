import { deflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
const crc = (b) => {
  let c = 0xffffffff;
  for (const v of b) {
    c ^= v;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (name, data) => {
  const t = Buffer.from(name),
    out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length);
  t.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc(Buffer.concat([t, data])), out.length - 4);
  return out;
};
const poly = (x, y, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    if (
      pts[i][1] > y !== pts[j][1] > y &&
      x <
        ((pts[j][0] - pts[i][0]) * (y - pts[i][1])) / (pts[j][1] - pts[i][1]) +
          pts[i][0]
    )
      inside = !inside;
  return inside;
};
function color(x, y) {
  let c = [238, 234, 221];
  if (
    poly(x, y, [
      [25, 96],
      [96, 54],
      [167, 96],
      [167, 109],
      [96, 151],
      [25, 109],
    ])
  )
    c = [107, 141, 101];
  if (
    poly(x, y, [
      [25, 96],
      [96, 54],
      [167, 96],
      [96, 138],
    ])
  )
    c = [162, 185, 122];
  if (
    poly(x, y, [
      [61, 96],
      [96, 75],
      [131, 96],
      [96, 117],
    ])
  )
    c = [104, 190, 220];
  if (
    ((x - 96) ** 2 + (y - 73) ** 2 < 25 ** 2 && y >= 65) ||
    poly(x, y, [
      [96, 32],
      [72, 65],
      [71, 73],
      [121, 73],
      [120, 65],
    ])
  )
    c = [59, 139, 156];
  if (
    Math.hypot(x - 94, y - 75) > 9 &&
    Math.hypot(x - 94, y - 75) < 14 &&
    x < 94 &&
    y > 75
  )
    c = [189, 228, 233];
  return c;
}
for (const size of [192, 512]) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const channels = [0, 0, 0];
      for (let sy = 0; sy < 2; sy++)
        for (let sx = 0; sx < 2; sx++) {
          const c = color(
            ((x + (sx + 0.5) / 2) * 192) / size,
            ((y + (sy + 0.5) / 2) * 192) / size,
          );
          for (let i = 0; i < 3; i++) channels[i] += c[i] / 4;
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(channels[i]);
      raw[o + 3] = 255;
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  await writeFile(
    `public/icon-${size}.png`,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
