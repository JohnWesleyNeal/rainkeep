import * as THREE from "three";
import { SIZE } from "./simulation.js";
import { landingColor, landingFootprint } from "./landing-footprint.js";

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
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const outline = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  fill.frustumCulled = outline.frustumCulled = false;
  fill.renderOrder = 5;
  outline.renderOrder = 6;
  scene.add(fill, outline);
  let previous, geometry, lastX, lastY;
  return {
    update(s, p, aim, visible, surfaceAt) {
      fill.visible = outline.visible = !!(visible && p);
      if (!visible || !p) return;
      if (p !== previous || lastX !== aim.x || lastY !== aim.y) {
        geometry = landingFootprint(s, p, aim);
        previous = p;
        lastX = aim.x;
        lastY = aim.y;
        fill.material.color.set(landingColor(s, p));
        outline.material.color.copy(fill.material.color);
        faces.setDrawRange(0, geometry.faces.length / 2);
        edges.setDrawRange(0, geometry.edges.length / 2);
      }
      for (const [points, buffer] of [
        [geometry.faces, facePoints],
        [geometry.edges, edgePoints],
      ]) {
        for (let n = 0; n < points.length; n += 2) {
          const x = points[n],
            y = points[n + 1];
          buffer.setXYZ(n / 2, x - SIZE / 2, surfaceAt(x, y) + 0.055, y - SIZE / 2);
        }
        buffer.needsUpdate = true;
      }
    },
    get cells() {
      return previous?.indices.length || 0;
    },
  };
}
