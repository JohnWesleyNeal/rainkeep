import * as THREE from "three";
import { SIZE } from "./simulation.js";
import { previewSurface } from "./placement-preview.js";

export const ghostColors = {
  safe: "#c3e4a7",
  water: "#9de2e6",
  caution: "#efc581",
  danger: "#f09170",
};
export function createLandingGhost(scene) {
  const faces = new THREE.BufferGeometry(),
    edges = new THREE.BufferGeometry();
  const facePoints = new THREE.BufferAttribute(
    new Float32Array(SIZE * SIZE * 18),
    3,
  );
  const edgePoints = new THREE.BufferAttribute(
    new Float32Array(SIZE * SIZE * 48),
    3,
  );
  faces.setAttribute("position", facePoints);
  edges.setAttribute("position", edgePoints);
  faces.setDrawRange(0, 0);
  edges.setDrawRange(0, 0);
  const fill = new THREE.Mesh(
    faces,
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const outline = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  );
  fill.frustumCulled = outline.frustumCulled = false;
  fill.renderOrder = 5;
  outline.renderOrder = 6;
  scene.add(fill, outline);
  let previous;
  return {
    update(s, p, visible) {
      fill.visible = outline.visible = !!(visible && p);
      if (!visible || !p || p === previous) return;
      previous = p;
      fill.material.color.set(ghostColors[p.kind]);
      outline.material.color.set(ghostColors[p.kind]);
      let f = 0,
        e = 0;
      const set = new Set(p.indices);
      for (const i of set) {
        const x = (i % SIZE) - 16,
          y = Math.floor(i / SIZE) - 16,
          z = previewSurface(s, p, i);
        const points = [
          [x, z, y],
          [x + 1, z, y],
          [x + 1, z, y + 1],
          [x, z, y + 1],
        ];
        for (const n of [0, 2, 1, 0, 3, 2])
          facePoints.setXYZ(f++, ...points[n]);
        const neighbors = [
          i - SIZE,
          i % SIZE === SIZE - 1 ? -1 : i + 1,
          i + SIZE,
          i % SIZE === 0 ? -1 : i - 1,
        ];
        for (let n = 0; n < 4; n++)
          if (!set.has(neighbors[n])) {
            const a = points[n],
              b = points[(n + 1) % 4];
            edgePoints.setXYZ(e++, ...a);
            edgePoints.setXYZ(e++, ...b);
            const ground = s.terrain[i] + 0.05;
            if (
              !set.has(neighbors[(n + 3) % 4]) &&
              Math.abs(z - ground) > 0.2 &&
              ["raise", "lower"].includes(s.current.type)
            ) {
              edgePoints.setXYZ(e++, ...a);
              edgePoints.setXYZ(e++, a[0], ground, a[2]);
            }
          }
      }
      faces.setDrawRange(0, f);
      edges.setDrawRange(0, e);
      facePoints.needsUpdate = edgePoints.needsUpdate = true;
    },
    get cells() {
      return faces.drawRange.count / 6;
    },
  };
}
