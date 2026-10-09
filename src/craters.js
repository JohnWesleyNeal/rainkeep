import * as THREE from "three";
import { SIZE } from "./simulation.js";

// The rim and short exposed shaft share the simulation's exact open-cell boundary.
// Fixed buffers avoid reallocating GPU geometry while holes grow or are repaired.
export function createCraters(scene) {
  function surface() {
    const geometry = new THREE.BufferGeometry();
    for (const name of ["position", "color", "normal"])
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(
          new Float32Array(SIZE * SIZE * 4 * 6 * 3),
          3,
        ).setUsage(THREE.DynamicDrawUsage),
      );
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  }
  const rim = surface(),
    walls = surface();
  walls.material.emissive.setHex(0x8e7851);
  walls.material.emissiveIntensity = 0.3;
  let edges = 0;
  function update(s, heights) {
    let n = 0;
    const vertexHeight = (x, y) => {
      let h = 0,
        count = 0;
      for (const [dx, dy] of [
        [-1, -1],
        [0, -1],
        [-1, 0],
        [0, 0],
      ]) {
        const cx = x + dx,
          cy = y + dy,
          i = cy * SIZE + cx;
        if (cx >= 0 && cy >= 0 && cx < SIZE && cy < SIZE && !s.holes[i]) {
          h += heights[i];
          count++;
        }
      }
      return count ? h / count : 0;
    };
    const quad = (mesh, points, colors) => {
      const p = mesh.geometry.attributes.position.array,
        c = mesh.geometry.attributes.color.array,
        normals = mesh.geometry.attributes.normal.array;
      const normal = new THREE.Vector3()
        .subVectors(
          new THREE.Vector3(...points[1]),
          new THREE.Vector3(...points[0]),
        )
        .cross(
          new THREE.Vector3().subVectors(
            new THREE.Vector3(...points[2]),
            new THREE.Vector3(...points[0]),
          ),
        )
        .normalize()
        .toArray();
      for (const [j, k] of [0, 1, 2, 0, 2, 3].map((j, k) => [j, k])) {
        p.set(points[j], (n * 6 + k) * 3);
        c.set(colors[j], (n * 6 + k) * 3);
        normals.set(normal, (n * 6 + k) * 3);
      }
    };
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        if (!s.holes[y * SIZE + x]) continue;
        for (const [dx, dy, a, b] of [
          [0, -1, [x, y], [x + 1, y]],
          [1, 0, [x + 1, y], [x + 1, y + 1]],
          [0, 1, [x + 1, y + 1], [x, y + 1]],
          [-1, 0, [x, y + 1], [x, y]],
        ]) {
          const nx = x + dx,
            ny = y + dy;
          if (
            nx < 0 ||
            ny < 0 ||
            nx >= SIZE ||
            ny >= SIZE ||
            s.holes[ny * SIZE + nx]
          )
            continue;
          const ah = vertexHeight(...a),
            bh = vertexHeight(...b),
            chip = 0.36 + ((x * 7 + y * 3) % 4) * 0.045;
          const A = [a[0] - 16, ah + 0.045, a[1] - 16],
            B = [b[0] - 16, bh + 0.045, b[1] - 16];
          quad(
            rim,
            [
              A,
              B,
              [B[0] + dx * chip, bh + 0.065, B[2] + dy * chip],
              [A[0] + dx * chip, ah + 0.065, A[2] + dy * chip],
            ],
            [
              [0.65, 0.38, 0.17],
              [0.65, 0.38, 0.17],
              [0.86, 0.68, 0.38],
              [0.86, 0.68, 0.38],
            ],
          );
          quad(
            walls,
            [A, B, [B[0], bh - 1.65, B[2]], [A[0], ah - 1.65, A[2]]],
            [
              [0.35, 0.23, 0.14],
              [0.35, 0.23, 0.14],
              [0.65, 0.62, 0.44],
              [0.65, 0.62, 0.44],
            ],
          );
          n++;
        }
      }
    edges = n;
    for (const mesh of [rim, walls]) {
      mesh.geometry.setDrawRange(0, n * 6);
      mesh.visible = n > 0;
      if (n)
        for (const attr of Object.values(mesh.geometry.attributes)) {
          attr.clearUpdateRanges();
          attr.addUpdateRange(0, n * 6 * 3);
          attr.needsUpdate = true;
        }
    }
  }
  return {
    update,
    get edges() {
      return edges;
    },
  };
}
