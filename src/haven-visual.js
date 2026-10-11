import * as THREE from "three";

// Small floating garden shelves sit beyond the playable 32 x 32 field.
// Fixed instanced meshes keep rewards decorative and the render cost bounded.
const pods = [
  [-18.3, 2],
  [2, 18.3],
  [18.3, -2],
  [-2, -18.3],
];
export function createHavenVisual(scene, reduced) {
  const group = new THREE.Group();
  scene.add(group);
  const stone = new THREE.IcosahedronGeometry(1, 1),
    orb = new THREE.IcosahedronGeometry(1, 1),
    stem = new THREE.CylinderGeometry(0.09, 0.14, 1, 5);
  const material = (color, glow = false) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      ...(glow ? { emissive: color, emissiveIntensity: 0.65 } : {}),
    });
  const batches = [],
    dummy = new THREE.Object3D();
  function batch(geometry, color, transforms, at, glow = false) {
    const mesh = new THREE.InstancedMesh(
      geometry,
      material(color, glow),
      transforms.length,
    );
    for (let i = 0; i < transforms.length; i++) {
      const t = transforms[i];
      dummy.position.set(t[0], t[1], t[2]);
      dummy.scale.set(t[3], t[4], t[5]);
      dummy.rotation.set(0, t[6] || 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = false;
    group.add(mesh);
    batches.push({ mesh, at });
  }
  batch(
    stone,
    0x567366,
    pods.map(([x, z]) => [x, -1.5, z, 1.8, 0.85, 1.65]),
    1,
  );
  batch(
    orb,
    0x96ad77,
    pods.map(([x, z]) => [x, -0.91, z, 1.65, 0.24, 1.5]),
    1,
  );
  const blossoms = [],
    stems = [],
    reeds = [],
    leaves = [],
    trunks = [],
    crowns = [],
    lamps = [],
    pinks = [],
    stars = [];
  pods.forEach(([x, z], n) => {
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4 + n,
        px = x + Math.cos(a) * 0.95,
        pz = z + Math.sin(a) * 0.9;
      stems.push([px, -0.48, pz, 0.7, 0.7, 0.7]);
      blossoms.push([px, -0.1, pz, 0.23, 0.13, 0.23]);
    }
    for (let i = 0; i < 3; i++) {
      const px = x - 0.45 + i * 0.4,
        pz = z + 0.55;
      reeds.push([px, -0.12, pz, 0.65, 1.5 + i * 0.2, 0.65]);
      leaves.push([px, -0.45, pz, 0.18, 0.5, 0.6]);
    }
    if (n % 2 === 0) {
      trunks.push([x, -0.1, z, 2, 1.8, 2]);
      crowns.push([x, 1.03, z, 0.95, 1.1, 0.95]);
      pinks.push([x, 1.7, z, 0.8, 0.48, 0.8]);
    } else {
      lamps.push([x, 0.32, z, 0.38, 0.5, 0.38]);
      trunks.push([x, -0.35, z, 0.8, 1, 0.8]);
    }
    stars.push(
      [x + 0.7, 2.5, z, 0.13, 0.23, 0.13],
      [x - 0.9, 1.8, z - 0.3, 0.1, 0.16, 0.1],
    );
  });
  batch(stem, 0x61815d, stems, 1);
  batch(orb, 0xf1d89c, blossoms, 1);
  batch(stem, 0x60866b, reeds, 2);
  batch(orb, 0x6b9976, leaves, 2);
  batch(stem, 0x77563c, trunks, 3);
  batch(orb, 0x779f75, crowns, 3);
  batch(orb, 0xffd996, lamps, 4, true);
  batch(orb, 0xf0bba5, pinks, 5);
  batch(orb, 0xffedb1, stars, 6, true);
  let current = 0;
  return {
    update(level, dt, time, paused) {
      level = Math.max(0, Math.min(6, level || 0));
      current = reduced
        ? level
        : current + (level - current) * Math.min(1, dt * 3);
      for (const { mesh, at } of batches) {
        mesh.visible = level >= at;
        mesh.scale.y = reduced
          ? 1
          : Math.max(0.01, Math.min(1, current - at + 1));
      }
      if (!paused && !reduced) group.position.y = Math.sin(time * 0.55) * 0.045;
    },
  };
}
export function drawCanvasHaven(ctx, project, unit, level, time, reduced) {
  if (!level) return;
  for (const [x, z] of pods) {
    const [px, py] = project(x + 16, z + 16, -0.6);
    ctx.fillStyle = "#587c67";
    ctx.beginPath();
    ctx.ellipse(px, py + unit * 0.4, unit * 1.6, unit * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a3b980";
    ctx.beginPath();
    ctx.ellipse(px, py, unit * 1.6, unit * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = `${Math.max(12, unit * (level >= 3 ? 3.5 : 2.4))}px Georgia`;
    ctx.fillStyle = level >= 5 ? "#eec0a7" : level >= 3 ? "#48765a" : "#fae3a6";
    ctx.fillText(
      level >= 5 ? "❀" : level >= 3 ? "♧" : level >= 2 ? "❧" : "✿",
      px,
      py,
    );
    if (level >= 4) {
      ctx.fillStyle = "#ffe3a6";
      ctx.beginPath();
      ctx.arc(px + unit, py - unit, unit * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (level >= 6) {
      ctx.font = `${unit * 2}px Georgia`;
      ctx.fillText(
        "✦",
        px - unit,
        py - unit * (3 + (reduced ? 0 : Math.sin(time) * 0.1)),
      );
    }
  }
}
