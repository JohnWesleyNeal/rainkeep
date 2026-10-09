import * as THREE from "three";
import { SIZE, cells } from "./simulation.js";

export function createImpactFeedback(scene, camera, reduced = false) {
  const items = [],
    dummy = new THREE.Object3D();
  let lastType = "";
  const dropGeometry = new THREE.SphereGeometry(0.16, 10, 7);
  const debrisGeometry = new THREE.BoxGeometry(0.27, 0.22, 0.33);
  const planeGeometry = new THREE.PlaneGeometry(1, 1);
  const ringGeometry = new THREE.TorusGeometry(1, 0.045, 5, 48);
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d"),
    gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,.65)");
  gradient.addColorStop(0.4, "rgba(255,255,255,.3)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const puffMap = new THREE.CanvasTexture(c);
  const colors = {
    raise: 0xffc4a0,
    lower: 0x8be7cd,
    rain: 0xb2f7ff,
    sun: 0xffb64b,
    bomb: 0xc59d79,
    ice: 0xe0fbff,
  };
  function dispose(f) {
    scene.remove(f.mesh);
    if (f.uniqueGeometry) f.mesh.geometry.dispose();
    if (f.uniqueMap) f.mesh.material.map.dispose();
    f.mesh.material.dispose();
    if (f.mesh.isInstancedMesh) f.mesh.dispose();
  }
  function add(mesh, life, props = {}) {
    const f = { mesh, life, max: life, ...props };
    scene.add(mesh);
    items.push(f);
    while (items.length > 16) dispose(items.shift());
    return f;
  }
  function ring(position, color, maxRadius, life = 0.55) {
    const mesh = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        depthWrite: false,
        opacity: 0.7,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 4;
    mesh.position.copy(position);
    add(mesh, life, { ring: true, maxRadius });
  }
  function particles(event, s, origin, type, count, life) {
    const vapor = type === "steam" || type === "smoke";
    const mesh = new THREE.InstancedMesh(
      vapor ? planeGeometry : type === "debris" ? debrisGeometry : dropGeometry,
      new THREE.MeshBasicMaterial({
        color:
          type === "steam"
            ? 0xfff6e5
            : type === "smoke"
              ? 0xb3aaa0
              : colors[event.type] || colors.bomb,
        map: vapor ? puffMap : null,
        transparent: true,
        depthWrite: false,
        opacity: 1,
      }),
      count,
    );
    mesh.frustumCulled = false;
    const points = [],
      indices = event.feedbackCells || event.targets;
    for (let n = 0; n < count; n++) {
      const angle = (n * Math.PI * 2) / count,
        ageDelay = vapor ? (n % 4) * 0.055 : 0;
      const position = origin.clone();
      if (type === "steam" && indices?.length) {
        const i = indices[Math.floor((n / count) * indices.length)];
        position.x = (i % SIZE) - SIZE / 2 + 0.5;
        position.z = Math.floor(i / SIZE) - SIZE / 2 + 0.5;
      } else
        position.add(
          new THREE.Vector3(Math.cos(angle) * 0.35, 0, Math.sin(angle) * 0.35),
        );
      const speed =
        type === "splash"
          ? 2.4
          : type === "debris"
            ? 4
            : type === "embers"
              ? 1.6
              : 0.45;
      points.push({
        position,
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          vapor
            ? 1.7 + (n % 3) * 0.5
            : type === "splash"
              ? 4.3 + (n % 4) * 0.5
              : type === "debris"
                ? 3 + (n % 4) * 0.7
                : 2.6,
          Math.sin(angle) * speed,
        ),
        size: vapor
          ? 1.1 + (n % 3) * 0.3
          : type === "splash"
            ? 0.7 + (n % 3) * 0.25
            : 1,
        delay: ageDelay,
      });
    }
    add(mesh, life, {
      points,
      type,
      billboard: vapor,
      gravity: vapor ? -0.2 : type === "embers" ? 1 : 8,
    });
    return mesh;
  }
  function impact(event, s) {
    const type = event.detonated ? "bomb" : event.type;
    lastType = type;
    if (reduced) return;
    const shape = cells(event.piece || { type, shape: 0, rotation: 0 }),
      w = Math.max(...shape.map((p) => p[0])) + 1,
      h = Math.max(...shape.map((p) => p[1])) + 1;
    const x = event.x ?? event.targets[0] % SIZE,
      y = event.y ?? Math.floor(event.targets[0] / SIZE);
    const origin = new THREE.Vector3(
      x - SIZE / 2 + w / 2,
      event.contactHeight ?? 0,
      y - SIZE / 2 + h / 2,
    );
    if (type === "rain") {
      origin.y = Math.max(
        origin.y + 0.1,
        s.terrain[Math.floor(y) * SIZE + Math.floor(x)] +
          s.water[Math.floor(y) * SIZE + Math.floor(x)] +
          0.055,
      );
      ring(origin, colors.rain, 3.2, 0.65);
      ring(origin, 0xe5ffff, 2, 0.4);
      particles(event, s, origin, "splash", 24, 0.75);
    } else if (type === "sun") {
      ring(origin, colors.sun, 2.6, 0.4);
      particles(event, s, origin, "embers", 18, 0.65);
      if (event.removed > 0.1) particles(event, s, origin, "steam", 24, 1.35);
    } else if (type === "bomb" || type === "mine") {
      ring(origin, 0xffd096, 4.1, 0.42);
      particles({ ...event, type: "bomb" }, s, origin, "debris", 22, 0.85);
      particles(event, s, origin, "smoke", 14, 1.05);
    } else {
      ring(origin, colors[type] || colors.raise, Math.max(2, w * 0.65), 0.38);
      particles(event, s, origin, "debris", 12, 0.4);
    }
    if (event.earned > 0 && (event.removed > 0.1 || event.repaired > 0)) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 128;
      const context = canvas.getContext("2d");
      context.font = "bold 68px system-ui";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineWidth = 9;
      context.strokeStyle = "#173b44";
      context.fillStyle = "#fff0c4";
      context.strokeText(
        "+" + Math.round(event.earned).toLocaleString(),
        256,
        64,
      );
      context.fillText(
        "+" + Math.round(event.earned).toLocaleString(),
        256,
        64,
      );
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }),
      );
      sprite.position.copy(origin).add(new THREE.Vector3(0, 1.2, 0));
      sprite.scale.set(7, 1.75, 1);
      add(sprite, 1.15, { score: true, uniqueMap: true });
    }
  }
  function render(dt, paused) {
    for (const f of items) {
      if (!paused) f.life -= dt;
      const progress = 1 - Math.max(0, f.life) / f.max;
      if (f.mesh.material.uniforms?.fade)
        f.mesh.material.uniforms.fade.value = 1 - progress;
      else f.mesh.material.opacity = Math.min(1, (1 - progress) * 1.4);
      if (f.ring) f.mesh.scale.setScalar(0.2 + progress * f.maxRadius);
      else if (f.score) {
        if (!paused) f.mesh.position.y += dt * 1.5;
      } else if (f.points) {
        f.points.forEach((p, n) => {
          const started = progress * f.max >= p.delay;
          if (!paused && started) {
            p.position.addScaledVector(p.velocity, dt);
            p.velocity.y -= dt * f.gravity;
          }
          dummy.position.copy(p.position);
          if (f.billboard) dummy.quaternion.copy(camera.quaternion);
          else dummy.rotation.set(progress * 3 + n, progress * 2, 0);
          const size = !started
            ? 0
            : f.billboard
              ? p.size * (0.45 + progress * 1.25)
              : p.size * (1 - progress * 0.65);
          dummy.scale.setScalar(size);
          dummy.updateMatrix();
          f.mesh.setMatrixAt(n, dummy.matrix);
        });
        f.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    for (let i = items.length - 1; i >= 0; i--)
      if (items[i].life <= 0) dispose(items.splice(i, 1)[0]);
  }
  return {
    impact,
    render,
    clear() {
      items.splice(0).forEach(dispose);
    },
    ghost(mesh) {
      if (reduced) {
        mesh.geometry.dispose();
        mesh.material.dispose();
        return;
      }
      add(mesh, 0.45, { uniqueGeometry: true });
    },
    get stats() {
      return {
        activeEffects: items.length,
        lastImpact: lastType,
        effectLife: items.reduce((sum, f) => sum + f.life, 0),
        effectKinds: [
          ...new Set(
            items.map(
              (f) =>
                f.type || (f.ring ? "ring" : f.score ? "score" : "evaporation"),
            ),
          ),
        ],
      };
    },
  };
}
