import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const variation = (n) => (Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1;

// An irregular stone mass sits beneath the playable square. Its silhouette is
// independent of simulation cells, with broad ledges rather than a board frame.
export function addIslandBody(scene) {
  const edge = Array.from({ length: 32 }, (_, n) => {
    const side = Math.floor(n / 8),
      t = (n % 8) * 4 - 16;
    return side === 0
      ? [t, -16]
      : side === 1
        ? [16, t]
        : side === 2
          ? [-t, 16]
          : [-16, -t];
  });
  const rings = [
    { y: -1.22, scale: 1 },
    { y: -2.8, scale: 1.03 },
    { y: -5.4, scale: 0.96 },
    { y: -9.3, scale: 0.76 },
    { y: -12.6, scale: 0.38 },
  ];
  const verts = rings.map((ring, r) =>
    edge.map(([x, z], n) => {
      const jitter = r ? variation(n * 2 + r * 39) * 0.85 : 0;
      return new THREE.Vector3(
        x * ring.scale + Math.sign(x) * jitter,
        ring.y + (r ? variation(n + r * 41) * 0.5 : 0),
        z * ring.scale + Math.sign(z) * jitter,
      );
    }),
  );
  const positions = [],
    colors = [];
  const soil = new THREE.Color(0x7b7859),
    rock = new THREE.Color(0x547d82),
    deep = new THREE.Color(0x263e56);
  const color = new THREE.Color();
  const add = (p, r, n) => {
    positions.push(p.x, p.y, p.z);
    color.copy(r < 1 ? soil : rock).lerp(deep, Math.max(0, (r - 1) / 4));
    color.multiplyScalar(0.88 + Math.abs(variation(n + r * 13)) * 0.22);
    colors.push(color.r, color.g, color.b);
  };
  for (let r = 0; r < rings.length - 1; r++)
    for (let n = 0; n < 32; n++) {
      const m = (n + 1) % 32;
      for (const [rr, nn] of [
        [r, n],
        [r, m],
        [r + 1, n],
        [r, m],
        [r + 1, m],
        [r + 1, n],
      ])
        add(verts[rr][nn], rr, n);
    }
  const tip = new THREE.Vector3(-1, -14.2, 1);
  for (let n = 0; n < 32; n++) {
    add(verts[4][n], 4, n);
    add(tip, 4, n);
    add(verts[4][(n + 1) % 32], 4, n);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const body = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      flatShading: true,
    }),
  );
  body.receiveShadow = true;
  scene.add(body);

  const roots = [];
  for (let n = 0; n < 16; n++) {
    const [x, z] = edge[(n * 5 + 3) % 32],
      length = 2.8 + Math.abs(variation(n * 19)) * 4;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x * 1.025, -1.15, z * 1.025),
      new THREE.Vector3(x * 1.04, -3, z * 1.04),
      new THREE.Vector3(x * 0.95 + variation(n), -length, z * 0.95),
      new THREE.Vector3(x * 0.86, -length - 1.8, z * 0.86 + variation(n + 3)),
    ]);
    roots.push(
      new THREE.TubeGeometry(curve, 10, 0.07 + (n % 3) * 0.025, 4, false),
    );
  }
  const rootMesh = new THREE.Mesh(
    mergeGeometries(roots),
    new THREE.MeshStandardMaterial({ color: 0x42745a, roughness: 1 }),
  );
  roots.forEach((g) => g.dispose());
  scene.add(rootMesh);

  return { body, roots: rootMesh };
}

export function solidFootprint(points) {
  const occupied = new Set(points.map(([x, y]) => `${x},${y}`)),
    edges = new Map();
  const add = (a, b) => edges.set(a.join(","), b);
  for (const [x, y] of points) {
    if (!occupied.has(`${x},${y - 1}`)) add([x, y], [x + 1, y]);
    if (!occupied.has(`${x + 1},${y}`)) add([x + 1, y], [x + 1, y + 1]);
    if (!occupied.has(`${x},${y + 1}`)) add([x + 1, y + 1], [x, y + 1]);
    if (!occupied.has(`${x - 1},${y}`)) add([x, y + 1], [x, y]);
  }
  const loops = [];
  while (edges.size) {
    const key = edges.keys().next().value,
      loop = [];
    let current = key;
    do {
      const next = edges.get(current);
      if (!next) break;
      loop.push(current.split(",").map(Number));
      edges.delete(current);
      current = next.join(",");
    } while (current !== key);
    loops.push(loop);
  }
  const area = (loop) =>
    Math.abs(
      loop.reduce((sum, p, i) => {
        const q = loop[(i + 1) % loop.length];
        return sum + p[0] * q[1] - q[0] * p[1];
      }, 0),
    );
  loops.sort((a, b) => area(b) - area(a));
  const shape = new THREE.Shape(
    loops[0].map(([x, y]) => new THREE.Vector2(x, -y)),
  );
  for (const loop of loops.slice(1))
    shape.holes.push(
      new THREE.Path(loop.map(([x, y]) => new THREE.Vector2(x, -y))),
    );
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.64,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.08,
    bevelSegments: 2,
  });
}
