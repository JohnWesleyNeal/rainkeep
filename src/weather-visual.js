import * as THREE from "three";
import { rainPoint, weatherView } from "./weather.js";

export function createWeatherVisual(scene, reduced) {
  const cloudCanvas = document.createElement("canvas");
  cloudCanvas.width = 256;
  cloudCanvas.height = 128;
  const ctx = cloudCanvas.getContext("2d");
  for (const [x, y, r] of [
    [48, 75, 34],
    [78, 59, 43],
    [122, 53, 47],
    [169, 64, 42],
    [208, 78, 31],
  ]) {
    const g = ctx.createRadialGradient(x, y, r * 0.28, x, y, r);
    g.addColorStop(0, "rgba(232,237,223,.95)");
    g.addColorStop(0.73, "rgba(191,207,207,.88)");
    g.addColorStop(1, "rgba(169,190,198,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const cloudTexture = new THREE.CanvasTexture(cloudCanvas);
  cloudTexture.colorSpace = THREE.SRGBColorSpace;
  const bank = new THREE.Group();
  for (let n = 0; n < 6; n++) {
    const cloud = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: cloudTexture,
        color: 0x748f9b,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    cloud.position.set((n - 2.5) * 13, 1 + (n % 2) * 3, -29 - (n % 3) * 4);
    cloud.scale.set(27, 13.5, 1);
    bank.add(cloud);
  }
  scene.add(bank);
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(
    new Float32Array(96 * 6),
    3,
  ).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positions);
  const material = new THREE.LineBasicMaterial({
    color: 0xc7e8ed,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const streaks = new THREE.LineSegments(geometry, material);
  streaks.frustumCulled = false;
  scene.add(streaks);
  const ringGeometry = new THREE.BufferGeometry();
  const rings = new THREE.BufferAttribute(
    new Float32Array(20 * 12 * 6),
    3,
  ).setUsage(THREE.DynamicDrawUsage);
  ringGeometry.setAttribute("position", rings);
  const splashes = new THREE.LineSegments(
    ringGeometry,
    new THREE.LineBasicMaterial({
      color: 0xd9f5e5,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  );
  splashes.frustumCulled = false;
  scene.add(splashes);
  let phase = "fair",
    count = 0;
  return {
    render(s, time) {
      const view = weatherView(s);
      phase = view.phase;
      for (const [n, c] of bank.children.entries()) {
        c.visible = view.cloud > 0.02;
        c.material.opacity = view.cloud * 0.72;
        c.position.x =
          (n - 2.5) * 13 + (reduced ? 0 : Math.sin(time * 0.035 + n) * 2);
      }
      count = view.rain ? (reduced ? 28 : 96) : 0;
      streaks.visible = splashes.visible = count > 0;
      if (!count) return view;
      material.opacity = reduced ? 0.25 : 0.55;
      geometry.setDrawRange(0, count * 2);
      for (let n = 0; n < count; n++) {
        const p = rainPoint(
            n + Math.floor(s.weather.clock / 3) * 31,
            s.weather.kind,
          ),
          i = Math.floor(p.y) * 32 + Math.floor(p.x);
        const ground = s.holes[i] ? -3 : s.terrain[i] + s.water[i];
        const f = reduced ? 0.45 : (time * 1.6 + n * 0.618) % 1;
        const y = ground + (1 - f) * 15;
        positions.setXYZ(n * 2, p.x - 16 + 0.12, y, p.y - 16);
        positions.setXYZ(
          n * 2 + 1,
          p.x - 16,
          Math.max(ground, y - 0.8),
          p.y - 16,
        );
      }
      positions.needsUpdate = true;
      for (let n = 0; n < 20; n++) {
        const p = rainPoint(
            n + Math.floor(s.weather.clock / 3) * 31,
            s.weather.kind,
          ),
          i = Math.floor(p.y) * 32 + Math.floor(p.x);
        const radius = reduced
          ? 0.22
          : 0.12 + ((time * 1.2 + n * 0.618) % 1) * 0.48;
        const y = s.terrain[i] + s.water[i] + 0.07;
        for (let k = 0; k < 12; k++)
          for (let e = 0; e < 2; e++) {
            const a = ((k + e) / 12) * Math.PI * 2;
            rings.setXYZ(
              n * 24 + k * 2 + e,
              p.x - 16 + Math.cos(a) * radius,
              s.holes[i] ? -8 : y,
              p.y - 16 + Math.sin(a) * radius,
            );
          }
      }
      rings.needsUpdate = true;
      return view;
    },
    get stats() {
      return { weatherPhase: phase, rainStreaks: count, weatherGeometries: 2 };
    },
  };
}

export function drawCanvasWeather(ctx, s, time, project, unit, reduced) {
  const view = weatherView(s);
  if (!view.rain) return;
  ctx.save();
  ctx.lineWidth = Math.max(0.7, unit * 0.055);
  ctx.strokeStyle = reduced ? "#bce4e750" : "#d0eef099";
  const count = reduced ? 24 : 64;
  for (let n = 0; n < count; n++) {
    const p = rainPoint(
        n + Math.floor(s.weather.clock / 3) * 31,
        s.weather.kind,
      ),
      i = Math.floor(p.y) * 32 + Math.floor(p.x);
    const ground = s.holes[i] ? -3 : s.terrain[i] + s.water[i];
    const f = reduced ? 0.45 : (time * 1.6 + n * 0.618) % 1,
      y = ground + (1 - f) * 15;
    const a = project(p.x, p.y, y),
      b = project(p.x, p.y, Math.max(ground, y - 0.8));
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.stroke();
    if (n < 16 && !s.holes[i]) {
      const q = project(p.x, p.y, ground + 0.07),
        r = unit * (reduced ? 0.25 : 0.12 + ((time + n * 0.618) % 1) * 0.45);
      ctx.beginPath();
      ctx.ellipse(...q, r, r * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}
