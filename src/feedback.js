import * as THREE from "three";
import { SIZE, cells } from "./simulation.js";
import { evaporationProfile } from "./atmosphere.js";

export function createImpactFeedback(scene, camera, reduced = false) {
  const items = [],
    dummy = new THREE.Object3D();
  let lastType = "";
  let crumbleClock = 0;
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
    const vapor = type === "steam" || type === "smoke" || type === "dust";
    const mesh = new THREE.InstancedMesh(
      vapor ? planeGeometry : type === "debris" ? debrisGeometry : dropGeometry,
      new THREE.MeshBasicMaterial({
        color:
          type === "steam"
            ? 0xfff6e5
            : type === "smoke"
              ? 0xb3aaa0
              : type === "dust"
                ? 0xd4bf92
                : type === "bubbles"
                  ? 0xe2ffff
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
      if (
        (type === "steam" || type === "splash" || type === "bubbles") &&
        indices?.length
      ) {
        const i = indices[Math.floor((n / count) * indices.length)];
        position.x = (i % SIZE) - SIZE / 2 + 0.5;
        position.z = Math.floor(i / SIZE) - SIZE / 2 + 0.5;
        if (type === "steam" || type === "bubbles")
          position.y =
            (event.feedbackHeights?.[
              Math.floor((n / count) * indices.length)
            ] ??
              event.contactHeight ??
              s.terrain[i]) + 0.08;
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
            : type === "bubbles"
              ? 0.8
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
      if (event.removed > 0.1) {
        const profile = evaporationProfile(event);
        particles(
          event,
          s,
          origin,
          "bubbles",
          8 + Math.round(profile.strength * 16),
          0.7,
        );
        particles(event, s, origin, "steam", profile.steam, profile.life);
        ring(
          origin,
          0xffe9ab,
          2.5 + profile.strength * 4,
          0.6 + profile.strength * 0.5,
        );
      }
    } else if (type === "bomb" || type === "mine") {
      ring(origin, 0xffd096, 4.1, 0.42);
      particles({ ...event, type: "bomb" }, s, origin, "debris", 22, 0.85);
      particles(event, s, origin, "smoke", 14, 1.05);
    } else {
      ring(
        origin,
        event.repaired ? 0xc6efb2 : colors[type] || colors.raise,
        Math.max(2, w * 0.65),
        event.repaired ? 0.9 : 0.38,
      );
      particles(
        event,
        s,
        origin,
        event.repaired ? "dust" : "debris",
        12,
        event.repaired ? 0.85 : 0.4,
      );
      if (event.repairCells?.length) {
        const positions = [];
        for (const i of event.repairCells) {
          const x = (i % SIZE) - SIZE / 2,
            z = Math.floor(i / SIZE) - SIZE / 2;
          for (const [dx, dz] of [
            [0, 0],
            [0, 1],
            [1, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ])
            positions.push(x + dx, s.terrain[i] + 0.02, z + dz);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3),
        );
        const cap = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({
            color: 0xb8c896,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        cap.position.y = 0.4;
        add(cap, 0.7, { type: "repair", settle: true, uniqueGeometry: true });
      }
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
      else if (f.settle) f.mesh.position.y = 0.4 * (1 - progress) ** 3;
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
    anticipate(s, pressure, dt, paused) {
      if (reduced || paused || pressure < 0.75) {
        if (pressure < 0.75) crumbleClock = 0;
        return;
      }
      crumbleClock += dt;
      if (crumbleClock < (pressure >= 0.9 ? 1.25 : 2.7)) return;
      crumbleClock = 0;
      const edge = Math.floor(s.elapsed * 7) % (SIZE * 4);
      const x =
        edge < SIZE
          ? edge
          : edge < SIZE * 2
            ? SIZE - 1
            : edge < SIZE * 3
              ? SIZE * 3 - edge - 1
              : 0;
      const y =
        edge < SIZE
          ? 0
          : edge < SIZE * 2
            ? edge - SIZE
            : edge < SIZE * 3
              ? SIZE - 1
              : SIZE * 4 - edge - 1;
      const origin = new THREE.Vector3(
        x - SIZE / 2 + 0.5,
        s.terrain[y * SIZE + x] - 0.4,
        y - SIZE / 2 + 0.5,
      );
      const event = { type: "bomb", targets: [] };
      const debris = particles(event, s, origin, "debris", 5, 1.1);
      const effect = items.find((f) => f.mesh === debris);
      for (const p of effect.points) {
        p.velocity.y = -0.8;
        p.velocity.x *= 0.15;
        p.velocity.z *= 0.15;
        p.size = 0.55;
      }
      particles(event, s, origin, "dust", 7, 1.2);
    },
    clear() {
      items.splice(0).forEach(dispose);
    },
    ghost(mesh, life = 0.45) {
      if (reduced) {
        mesh.geometry.dispose();
        mesh.material.dispose();
        return;
      }
      add(mesh, life, { uniqueGeometry: true });
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
