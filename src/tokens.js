import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Shared meshes keep the board and its previews visually identical.
export function createTokenWorkshop() {
  const mat = (color, roughness = 0.35, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const iron = mat(0x36495c, 0.3, 0.5),
    brass = mat(0xe6ad62, 0.3, 0.7);
  const ember = new THREE.MeshBasicMaterial({ color: 0xffa43b });
  const hot = new THREE.MeshBasicMaterial({ color: 0xfff2b3 });
  const orange = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
  });
  const red = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
  });
  const rope = mat(0xdcc39b, 0.9);
  const crystalSeam = new THREE.TorusGeometry(0.58, 0.035, 4, 6);
  const nucleusMaterial = new THREE.MeshStandardMaterial({
    color: 0xffbe41,
    emissive: 0xff7e16,
    emissiveIntensity: 0.8,
    roughness: 0.6,
  });
  const nucleusGeometry = new THREE.SphereGeometry(0.74, 24, 18);
  const sphere = new THREE.SphereGeometry(1.08, 32, 24);
  const band = new THREE.TorusGeometry(1.078, 0.065, 8, 48);
  const cap = new THREE.CylinderGeometry(0.38, 0.42, 0.28, 20);
  const fuse = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 1.2, 0),
      new THREE.Vector3(0.08, 1.55, 0),
      new THREE.Vector3(0.4, 1.82, 0.02),
      new THREE.Vector3(0.65, 1.69, 0.05),
    ]),
    16,
    0.065,
    8,
    false,
  );
  const spark = new THREE.SphereGeometry(0.105, 8, 6);
  const drop = new THREE.LatheGeometry(
    [
      [0, -1.05],
      [0.45, -0.96],
      [0.76, -0.63],
      [0.86, -0.2],
      [0.76, 0.25],
      [0.51, 0.7],
      [0.23, 1.08],
      [0, 1.55],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    32,
  );
  drop.computeVertexNormals();
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x22bdd8,
    roughness: 0.1,
    metalness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
  const ice = new RoundedBoxGeometry(1.8, 1.8, 1.8, 3, 0.18);
  const iceMat = new THREE.MeshPhysicalMaterial({
    color: 0x9be8f5,
    roughness: 0.19,
    metalness: 0.1,
    clearcoat: 1,
  });
  function flame(height, bend) {
    const geometry = new THREE.LatheGeometry(
      [
        [0, -0.7],
        [0.45, -0.6],
        [0.8, -0.2],
        [0.83, 0.2],
        [0.65, 0.65],
        [0.41, 1.05],
        [0.2, 1.5],
        [0, 2.3],
      ].map(([x, y]) => new THREE.Vector2(x, y * height)),
      24,
    );
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setX(
        i,
        p.getX(i) +
          bend * Math.pow(Math.max(0, (y + 0.7 * height) / (3 * height)), 2),
      );
    }
    const colors = [],
      c = new THREE.Color(),
      base = new THREE.Color(0xffd75b),
      tip = new THREE.Color(0xee4820);
    for (let i = 0; i < p.count; i++) {
      const v = Math.max(0, (p.getY(i) + 0.7 * height) / (3 * height));
      c.copy(base).lerp(tip, v);
      c.multiplyScalar(
        0.87 + 0.13 * Math.cos(Math.atan2(p.getZ(i), p.getX(i)) + 0.7),
      );
      colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
  const outerFlame = flame(1, 0.58),
    innerFlame = flame(0.72, -0.28),
    heartFlame = flame(0.48, 0.16);
  const studGeos = [];
  for (let i = 0; i < 8; i++) {
    const geo = new THREE.SphereGeometry(0.09, 8, 6);
    geo.translate(
      Math.cos((i * Math.PI) / 4) * 1.07,
      0,
      Math.sin((i * Math.PI) / 4) * 1.07,
    );
    studGeos.push(geo);
  }
  const studs = mergeGeometries(studGeos);
  studGeos.forEach((g) => g.dispose());
  const prong = new THREE.CylinderGeometry(0.15, 0.15, 0.6, 8);
  const haloMap = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d"),
      g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,169,58,.3)");
    g.addColorStop(0.45, "rgba(255,99,26,.12)");
    g.addColorStop(1, "rgba(255,80,10,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const haloMat = new THREE.SpriteMaterial({
    map: haloMap,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const add = (group, geo, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  function make(type) {
    const g = new THREE.Group();
    g.userData.tokenType = type;
    if (type === "bomb" || type === "mine") {
      add(g, sphere, iron);
      const belt = add(g, band, brass);
      belt.rotation.x = Math.PI / 2;
      add(g, studs, brass);
      add(g, cap, brass, 0, 1.08);
      if (type === "bomb") {
        add(g, fuse, rope);
        const sparks = new THREE.InstancedMesh(spark, ember, 6);
        sparks.userData.sparks = true;
        g.add(sparks);
      } else {
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3,
            m = add(
              g,
              prong,
              brass,
              Math.cos(angle) * 1.16,
              0,
              Math.sin(angle) * 1.16,
            );
          m.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)),
          );
        }
        add(g, spark, red, 0, 1.25);
      }
    } else if (type === "sun") {
      const halo = new THREE.Sprite(haloMat);
      halo.scale.set(4.4, 4.4, 1);
      halo.position.y = 0.5;
      g.add(halo);
      add(g, nucleusGeometry, nucleusMaterial, 0, -0.12, 0.15);
      const shell = add(g, outerFlame, red);
      shell.userData.flame = 0;
      const inner = add(g, innerFlame, orange, 0, -0.02, 0.32);
      inner.userData.flame = 1;
      const core = add(g, heartFlame, hot, 0, -0.08, 0.59);
      core.userData.flame = 2;
      // A smaller curling tongue broadens the silhouette in the other views.
      const side = add(g, innerFlame, orange, -0.55, -0.12, -0.25);
      side.scale.set(0.65, 0.82, 0.65);
      side.rotation.z = 0.38;
      side.userData.flame = 3;
      const embers = new THREE.InstancedMesh(spark, ember, 7);
      embers.userData.embers = true;
      g.add(embers);
    } else if (type === "ice") {
      const cube = add(g, ice, iceMat);
      cube.rotation.set(0.1, 0.3, 0.07);
      const seam = add(g, crystalSeam, hot, 0, 0, 0.91);
      seam.rotation.z = 0.2;
    } else {
      add(g, drop, glass);
      const glint = add(g, spark, hot, -0.37, 0.25, 0.69);
      glint.scale.set(0.65, 2.7, 0.4);
      const pearls = new THREE.InstancedMesh(spark, glass, 4);
      pearls.userData.pearls = true;
      g.add(pearls);
    }
    const motion = new THREE.Group();
    motion.userData.tokenMotion = type;
    for (const child of [...g.children]) motion.add(child);
    g.add(motion);
    g.scale.setScalar(type === "sun" ? 1.25 : type === "bomb" ? 1.18 : 1);
    animate(g, 0, true);
    return g;
  }
  const dummy = new THREE.Object3D();
  function animate(group, time, reduced = false, falling = 0) {
    group.traverse((o) => {
      if (o.userData.tokenMotion) {
        const type = o.userData.tokenMotion,
          t = reduced ? 0 : time;
        o.position.y = reduced
          ? 0
          : Math.sin(t * (type === "rain" ? 4.2 : 2.7)) * 0.09;
        o.rotation.z = reduced
          ? 0
          : Math.sin(t * (type === "bomb" ? 3 : 2.4)) *
            (type === "rain" ? 0.13 : 0.085);
        o.rotation.y = reduced
          ? 0
          : t * (type === "bomb" ? 0.32 : type === "sun" ? 0.16 : 0.08);
        const stretch = reduced
          ? 1
          : type === "rain"
            ? 1 + Math.sin(t * 4.2) * 0.045 + falling * 0.18
            : type === "sun"
              ? 1 + falling * 0.12
              : 1;
        o.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
      }
      if (o.userData.flame !== undefined) {
        const n = o.userData.flame;
        if (n < 3) {
          o.scale.y = 1 + (reduced ? 0 : Math.sin(time * 7 + n * 1.9) * 0.045);
          o.rotation.y = reduced ? 0 : Math.sin(time * 2 + n) * 0.08;
        }
      }
      if (o.userData.sparks) {
        for (let n = 0; n < 6; n++) {
          const age = reduced ? n / 6 : (time * 1.8 + n / 6) % 1;
          dummy.position.set(
            0.65 + Math.sin(n * 2.4) * age * 0.45,
            1.69 + age * 0.8,
            0.05 + Math.cos(n * 2.4) * age * 0.4,
          );
          dummy.scale.setScalar((1 - age) * (0.65 + (n % 2) * 0.25));
          dummy.updateMatrix();
          o.setMatrixAt(n, dummy.matrix);
        }
        o.instanceMatrix.needsUpdate = true;
      }
      if (o.userData.embers || o.userData.pearls) {
        const fire = !!o.userData.embers;
        for (let n = 0; n < o.count; n++) {
          const age = reduced
            ? n / o.count
            : (time * (fire ? 0.65 : 0.45) + n / o.count) % 1;
          const angle = n * 2.4 + (reduced ? 0 : time * 0.6),
            r = fire ? 0.5 + age * 0.35 : 0.95;
          dummy.position.set(
            Math.cos(angle) * r,
            fire ? 0.45 + age * 3 : 1 + age * 0.9,
            Math.sin(angle) * r,
          );
          dummy.scale.setScalar((1 - age) * (fire ? 0.55 : 0.85));
          dummy.updateMatrix();
          o.setMatrixAt(n, dummy.matrix);
        }
        o.instanceMatrix.needsUpdate = true;
      }
    });
  }
  return { make, animate };
}
