import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { SIZE, cells, landingHeight } from "./simulation.js";
import groundURL from "./assets/ground.webp";

const HALF = SIZE / 2;
const palette = {
  raise: 0xf9977c,
  lower: 0x9ce5bd,
  rain: 0x50d9fa,
  sun: 0xffbd58,
  bomb: 0x263f53,
  ice: 0xc3f8ff,
  mine: 0x344b60,
};

function texture(draw, size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d"), size);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createWorldRenderer(canvas, reduced = false) {
  if (new URLSearchParams(location.search).get("graphics") === "canvas")
    return createCanvasRenderer(canvas);
  let renderer;
  try {
    const context = canvas.getContext("webgl2", {
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    if (!context) return createCanvasRenderer(canvas);
    renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
  } catch {
    return createCanvasRenderer(canvas);
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x153747, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-27, 27, 22, -22, 0.1, 180);
  const hemi = new THREE.HemisphereLight(0xc4efff, 0x435b46, 1.45);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffe4b6, 2.15);
  key.position.set(-20, 48, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, {
    left: -26,
    right: 26,
    top: 26,
    bottom: -26,
    near: 1,
    far: 100,
  });
  key.shadow.bias = -0.001;
  key.shadow.normalBias = 0.12;
  key.shadow.radius = 2;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x7bcbdc, 0.85);
  fill.position.set(20, 9, -30);
  scene.add(fill);
  let width = 0,
    height = 0,
    quarter = 0,
    lastUpdate = -1,
    lastState,
    elapsed = 0;
  let pieceKey = "",
    piece = new THREE.Group(),
    fx = [],
    shake = 0;
  scene.add(piece);
  const target = new THREE.Vector3(0, 3.6, 0);
  function positionCamera() {
    const angle = Math.PI / 4 - (quarter * Math.PI) / 2;
    camera.position.set(Math.cos(angle) * 59.4, 38, Math.sin(angle) * 59.4);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }
  positionCamera();

  const terrainGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array((SIZE + 1) ** 2 * 3);
  const colors = new Float32Array(positions.length);
  const uvs = new Float32Array((SIZE + 1) ** 2 * 2);
  const indices = [];
  for (let y = 0; y <= SIZE; y++)
    for (let x = 0; x <= SIZE; x++) {
      const v = y * (SIZE + 1) + x;
      positions.set([x - HALF, 0, y - HALF], v * 3);
      uvs.set([(x / SIZE) * 2, (y / SIZE) * 2], v * 2);
      if (x < SIZE && y < SIZE) {
        indices.push(v, v + SIZE + 1, v + 1, v + 1, v + SIZE + 1, v + SIZE + 2);
      }
    }
  terrainGeometry.setIndex(indices);
  terrainGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  terrainGeometry.setAttribute(
    "color",
    new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage),
  );
  terrainGeometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  const groundMap = new THREE.TextureLoader().load(groundURL);
  groundMap.colorSpace = THREE.SRGBColorSpace;
  groundMap.wrapS = groundMap.wrapT = THREE.RepeatWrapping;
  groundMap.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const terrain = new THREE.Mesh(
    terrainGeometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: groundMap,
      roughness: 0.94,
      metalness: 0,
    }),
  );
  terrain.receiveShadow = true;
  scene.add(terrain);

  // A continuous cliff skirt follows the boundary of the authored heightfield.
  const cliffPositions = new Float32Array(SIZE * 4 * 6 * 3);
  const cliffColors = new Float32Array(cliffPositions.length);
  const cliffGeometry = new THREE.BufferGeometry();
  cliffGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(cliffPositions, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  cliffGeometry.setAttribute(
    "color",
    new THREE.BufferAttribute(cliffColors, 3),
  );
  const cliff = new THREE.Mesh(
    cliffGeometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
  );
  cliff.receiveShadow = true;
  scene.add(cliff);
  const rock = new THREE.Mesh(
    new RoundedBoxGeometry(32, 2.4, 32, 2, 0.65),
    new THREE.MeshStandardMaterial({ color: 0x354e54, roughness: 0.85 }),
  );
  rock.position.y = -3.2;
  rock.receiveShadow = true;
  scene.add(rock);
  const seam = new THREE.Mesh(
    new RoundedBoxGeometry(31.9, 0.16, 31.9, 1, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x85c0ac, roughness: 0.7 }),
  );
  seam.position.y = -2.8;
  scene.add(seam);
  const underside = new THREE.Mesh(
    new THREE.CylinderGeometry(22.2, 12, 4.4, 4, 1),
    new THREE.MeshStandardMaterial({ color: 0x223c49, roughness: 0.9 }),
  );
  underside.rotation.y = Math.PI / 4;
  underside.position.y = -6.4;
  scene.add(underside);

  const waterGeometry = terrainGeometry.clone();
  const waterPositions = waterGeometry.attributes.position.array;
  waterGeometry.deleteAttribute("color");
  waterGeometry.setAttribute(
    "depth",
    new THREE.BufferAttribute(new Float32Array((SIZE + 1) ** 2), 1),
  );
  waterGeometry.setAttribute(
    "frozen",
    new THREE.BufferAttribute(new Float32Array((SIZE + 1) ** 2), 1),
  );
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `attribute float depth; attribute float frozen;
      varying vec3 world; varying float amount; varying float frost;
      void main() { world = (modelMatrix * vec4(position,1.)).xyz;
        amount = depth; frost = frozen;
        gl_Position = projectionMatrix * viewMatrix * vec4(world,1.); }`,
    fragmentShader: `uniform float time; varying vec3 world; varying float amount; varying float frost;
      void main() {
        if (amount < .035) discard;
        float wave = sin(world.x*.8 + time*.8) * sin(world.z*.6 - time*.6);
        float glint = pow(max(0., sin(world.x*.19 + world.z*.25 + wave*.12)), 26.);
        float ribbons = pow(max(0., sin(world.x*2. + world.z*.65 + time*.55)), 18.)*.045;
        vec3 deep = vec3(.015,.27,.43), shallow = vec3(.07,.55,.62);
        vec3 col = mix(shallow,deep, smoothstep(.2,3.,amount));
        col += vec3(.38,.53,.56)*glint*.55 + ribbons;
        float edge = 1. - smoothstep(.04,.38,amount);
        col = mix(col,vec3(.73,.96,.84),edge*.55);
        col = mix(col,vec3(.65,.88,.94) + glint*.14,clamp(frost,0.,1.));
        gl_FragColor = vec4(col, smoothstep(.035,.16,amount)*.94);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.renderOrder = 2;
  scene.add(water);

  const stone = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.25, 0),
    new THREE.MeshStandardMaterial({ color: 0xbcc9ae, roughness: 1 }),
    50,
  );
  const dummy = new THREE.Object3D();
  for (let n = 0; n < 50; n++) {
    const side = n % 4,
      t = (n / 50) * 32 - 16;
    dummy.position.set(
      side < 2 ? t : side === 2 ? -16.03 : 16.03,
      -0.8 - (n % 5) * 0.35,
      side < 2 ? (side === 0 ? -16.03 : 16.03) : t,
    );
    dummy.scale.set(1 + (n % 3), 0.6, 1);
    dummy.rotation.set(n, n * 0.7, n * 0.3);
    dummy.updateMatrix();
    stone.setMatrixAt(n, dummy.matrix);
  }
  scene.add(stone);
  const streams = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.055, 0.12, 1, 5),
    new THREE.MeshBasicMaterial({
      color: 0x80d9db,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
    128,
  );
  streams.count = 0;
  streams.frustumCulled = false;
  scene.add(streams);

  const cloudMap = texture((c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.48);
    g.addColorStop(0, "rgba(186,230,237,.48)");
    g.addColorStop(0.45, "rgba(175,225,231,.3)");
    g.addColorStop(1, "rgba(175,225,231,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
  const clouds = new THREE.Group();
  for (let n = 0; n < 10; n++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: cloudMap,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    sprite.position.set(
      ((n % 5) - 2) * 17,
      -10 - (n % 3) * 4,
      (Math.floor(n / 5) * 2 - 1) * 24,
    );
    sprite.scale.set(20, 7, 1);
    clouds.add(sprite);
  }
  scene.add(clouds);

  const shadowMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.31,
    depthWrite: false,
    side: THREE.DoubleSide,
    color: 0x183c3a,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 3;
  scene.add(shadow);
  const ducks = [];
  function duck() {
    const g = new THREE.Group();
    const ivory = new THREE.MeshStandardMaterial({
      color: 0xffe7a8,
      roughness: 0.36,
    });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 8), ivory);
    body.scale.set(1, 0.7, 1.35);
    body.position.y = 0.33;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), ivory);
    head.position.set(0, 0.86, -0.43);
    g.add(head);
    const beak = new THREE.Mesh(
      new THREE.ConeGeometry(0.19, 0.4, 4),
      new THREE.MeshStandardMaterial({ color: 0xef9851 }),
    );
    beak.rotation.x = -Math.PI / 2;
    beak.position.set(0, 0.82, -0.78);
    g.add(beak);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x163848 });
    for (const x of [-0.26, 0.26]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeMat);
      eye.position.set(x, 0.94, -0.52);
      g.add(eye);
    }
    const wing = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 10, 6),
      new THREE.MeshStandardMaterial({ color: 0xffd078, roughness: 0.4 }),
    );
    wing.scale.set(0.28, 0.55, 1.2);
    wing.position.set(0.47, 0.43, 0.06);
    g.add(wing);
    scene.add(g);
    ducks.push(g);
    return g;
  }
  const rainbow = new THREE.Group();
  [0xf18d89, 0xffc682, 0xf9e7a0, 0x9ed0aa, 0x83ccdf, 0xb9a4db].forEach(
    (color, n) => {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(6 - n * 0.28, 0.12, 6, 48, Math.PI),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
        }),
      );
      rainbow.add(arc);
    },
  );
  rainbow.position.set(0, 4, -10);
  scene.add(rainbow);

  const hazards = new THREE.Group();
  scene.add(hazards);
  const hazardCache = new Map();
  const materialCache = new Map();
  function material(type) {
    if (!materialCache.has(type))
      materialCache.set(
        type,
        new THREE.MeshStandardMaterial({
          color: palette[type],
          roughness: type === "rain" ? 0.16 : 0.3,
          metalness: type === "bomb" || type === "mine" ? 0.55 : 0.08,
          emissive: type === "sun" ? 0xe77916 : 0x000000,
          emissiveIntensity: 0.45,
        }),
      );
    return materialCache.get(type);
  }
  const blockGeometry = new RoundedBoxGeometry(1.91, 0.62, 1.91, 2, 0.13);
  const coneGeometry = new THREE.ConeGeometry(0.24, 0.75, 4);
  const sphereGeometry = new THREE.SphereGeometry(0.84, 20, 14);
  const smallSphere = new THREE.SphereGeometry(0.19, 8, 6);
  const capGeometry = new THREE.CylinderGeometry(0.24, 0.32, 0.28, 10);
  function makeToken(type) {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(
      type === "ice"
        ? new RoundedBoxGeometry(1.25, 1.25, 1.25, 1, 0.07)
        : sphereGeometry,
      material(type),
    );
    if (type === "sun") mesh.scale.set(0.78, 1.3, 0.78);
    mesh.castShadow = true;
    g.add(mesh);
    if (type === "rain") {
      mesh.scale.set(0.86, 1.15, 0.86);
      const gleam = new THREE.Mesh(
        smallSphere,
        new THREE.MeshBasicMaterial({ color: 0xd7fcff }),
      );
      gleam.position.set(-0.25, 0.4, 0.52);
      gleam.scale.set(0.65, 1.4, 0.4);
      g.add(gleam);
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.45, 0.85, 20),
        material(type),
      );
      tip.position.y = 0.78;
      g.add(tip);
    }
    if (type === "bomb" || type === "mine") {
      const cap = new THREE.Mesh(
        capGeometry,
        new THREE.MeshStandardMaterial({
          color: 0xdca174,
          roughness: 0.4,
          metalness: 0.6,
        }),
      );
      cap.position.y = 0.81;
      g.add(cap);
      const fuse = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.46, 6),
        new THREE.MeshStandardMaterial({ color: 0xeed6aa }),
      );
      fuse.position.set(0.07, 1.15, 0);
      fuse.rotation.z = -0.32;
      g.add(fuse);
      const spark = new THREE.Mesh(
        smallSphere,
        new THREE.MeshBasicMaterial({ color: 0xffb758 }),
      );
      spark.position.set(0.15, 1.36, 0);
      spark.scale.setScalar(0.6);
      g.add(spark);
      if (type === "mine")
        for (let n = 0; n < 6; n++) {
          const spike = new THREE.Mesh(coneGeometry, material(type));
          spike.position.set(
            Math.cos((n * Math.PI) / 3) * 0.82,
            0,
            Math.sin((n * Math.PI) / 3) * 0.82,
          );
          spike.rotation.z = Math.PI / 2;
          spike.rotation.y = (-n * Math.PI) / 3;
          g.add(spike);
        }
    }
    if (type === "sun") {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 14, 10),
        new THREE.MeshBasicMaterial({ color: 0xffe6ad }),
      );
      core.position.set(0, 0.15, 0.25);
      g.add(core);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.5, 1.6, 16),
        material(type),
      );
      flame.position.set(0.12, 1.1, 0);
      flame.rotation.z = -0.12;
      g.add(flame);
    }
    return g;
  }
  function disposeGroup(group) {
    // Token geometry/materials are shared; only unique land instance buffers go.
    group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
    });
    group.clear();
  }
  function updatePiece(p) {
    const next = `${p.type}/${p.shape}/${p.rotation}`;
    if (next === pieceKey) return;
    pieceKey = next;
    disposeGroup(piece);
    const shape = cells(p),
      w = Math.max(...shape.map((p) => p[0])) + 1,
      h = Math.max(...shape.map((p) => p[1])) + 1;
    if (p.type === "raise" || p.type === "lower") {
      const anchors = shape.filter(([x, y]) => x % 2 === 0 && y % 2 === 0);
      const blocks = new THREE.InstancedMesh(
        blockGeometry,
        material(p.type),
        anchors.length,
      );
      const arrows = new THREE.InstancedMesh(
        coneGeometry,
        material(p.type),
        anchors.length,
      );
      anchors.forEach(([x, y], n) => {
        dummy.position.set(x + 1, 0.12, y + 1);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        blocks.setMatrixAt(n, dummy.matrix);
        dummy.position.y = p.type === "raise" ? 0.78 : -0.55;
        dummy.rotation.z = p.type === "raise" ? 0 : Math.PI;
        dummy.rotation.y = Math.PI / 4;
        dummy.updateMatrix();
        arrows.setMatrixAt(n, dummy.matrix);
      });
      blocks.castShadow = true;
      arrows.castShadow = true;
      piece.add(blocks, arrows);
    } else {
      const token = makeToken(p.type);
      token.position.set(0.5, 0.1, 0.5);
      piece.add(token);
    }
    shadowMaterial.map?.dispose();
    shadowMaterial.map = texture((c, s) => {
      const scale = s / Math.max(w, h) / 1.4,
        ox = (s - w * scale) / 2,
        oy = (s - h * scale) / 2;
      c.shadowColor = "rgba(0,0,0,.7)";
      c.shadowBlur = 12;
      c.fillStyle = "rgba(0,0,0,.6)";
      for (const [x, y] of shape)
        c.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    });
    shadowMaterial.needsUpdate = true;
    shadow.scale.set(Math.max(w, h) * 1.4, Math.max(w, h) * 1.4, 1);
    shadow.userData = { w, h };
  }

  const color = new THREE.Color();
  const grass = new THREE.Color(0xd5d8c3),
    high = new THREE.Color(0xf4dfba),
    wet = new THREE.Color(0x7eada0);
  const sample = (array, x, y) => {
    let sum = 0,
      count = 0;
    for (let dy = -1; dy <= 0; dy++)
      for (let dx = -1; dx <= 0; dx++) {
        const cx = x + dx,
          cy = y + dy;
        if (cx >= 0 && cy >= 0 && cx < SIZE && cy < SIZE) {
          sum += array[cy * SIZE + cx];
          count++;
        }
      }
    return sum / count;
  };
  const holesHeight = new Float32Array(SIZE * SIZE);
  function updateLandscape(s) {
    for (let i = 0; i < s.terrain.length; i++)
      holesHeight[i] = s.holes[i] ? -1.8 : s.terrain[i];
    for (let y = 0; y <= SIZE; y++)
      for (let x = 0; x <= SIZE; x++) {
        const v = y * (SIZE + 1) + x,
          z = sample(holesHeight, x, y),
          depth = sample(s.water, x, y),
          frozen = sample(s.ice, x, y);
        positions[v * 3 + 1] = z;
        const mottling =
          (Math.sin(x * 1.73 + y * 0.71) + Math.sin(y * 2.41 - x * 0.47)) *
          0.015;
        color
          .copy(grass)
          .lerp(high, Math.min(0.8, Math.max(0, z) / 8))
          .lerp(wet, Math.min(0.35, depth * 0.18));
        if (z < -0.1) color.multiplyScalar(0.43);
        color.offsetHSL(0, 0, mottling);
        color.toArray(colors, v * 3);
        // Dry banks must not lift the liquid surface. Average the actual
        // free-surface heights of wet neighbors; depth testing clips the shore.
        let surface = 0,
          wetCount = 0;
        for (let dy = -1; dy <= 0; dy++)
          for (let dx = -1; dx <= 0; dx++) {
            const cx = x + dx,
              cy = y + dy,
              i = cy * SIZE + cx;
            if (
              cx >= 0 &&
              cy >= 0 &&
              cx < SIZE &&
              cy < SIZE &&
              s.water[i] > 0.035
            ) {
              surface += s.terrain[i] + s.water[i];
              wetCount++;
            }
          }
        waterPositions[v * 3 + 1] =
          (wetCount ? surface / wetCount : Math.max(0, z)) + 0.035;
        waterGeometry.attributes.depth.array[v] = depth;
        waterGeometry.attributes.frozen.array[v] = frozen > 0 ? 1 : 0;
      }
    terrainGeometry.attributes.position.needsUpdate = true;
    terrainGeometry.attributes.color.needsUpdate = true;
    terrainGeometry.computeVertexNormals();
    waterGeometry.attributes.position.needsUpdate = true;
    waterGeometry.attributes.depth.needsUpdate = true;
    waterGeometry.attributes.frozen.needsUpdate = true;
    let n = 0;
    for (let side = 0; side < 4; side++)
      for (let a = 0; a < SIZE; a++) {
        const endpoints =
          side === 0
            ? [
                [a, 0],
                [a + 1, 0],
              ]
            : side === 1
              ? [
                  [SIZE, a],
                  [SIZE, a + 1],
                ]
              : side === 2
                ? [
                    [a + 1, SIZE],
                    [a, SIZE],
                  ]
                : [
                    [0, a + 1],
                    [0, a],
                  ];
        const [p, q] = endpoints,
          A = [p[0] - HALF, sample(holesHeight, ...p), p[1] - HALF],
          B = [q[0] - HALF, sample(holesHeight, ...q), q[1] - HALF];
        const C = [B[0], -2.4, B[2]],
          D = [A[0], -2.4, A[2]];
        for (const pt of [A, B, D, B, C, D]) {
          cliffPositions.set(pt, n * 3);
          const upper = pt[1] > -2;
          cliffColors.set(
            upper ? [0.41, 0.49, 0.36] : [0.25, 0.34, 0.31],
            n * 3,
          );
          n++;
        }
      }
    cliffGeometry.attributes.position.needsUpdate = true;
    cliffGeometry.attributes.color.needsUpdate = true;
    cliffGeometry.computeVertexNormals();
    let falling = 0;
    for (let i = 0; i < s.leaks.length && falling < 128; i++) {
      const x = i % SIZE,
        y = Math.floor(i / SIZE);
      if (
        s.leaks[i] < 0.0005 ||
        (!s.holes[i] &&
          x !== 0 &&
          y !== 0 &&
          x !== SIZE - 1 &&
          y !== SIZE - 1) ||
        (x === 0 || x === SIZE - 1 ? y : x) % 2 !== 0
      )
        continue;
      const top = s.terrain[i] + s.water[i],
        length = s.holes[i] ? 6 : top + 8;
      dummy.position.set(
        x - HALF + (x === 0 ? 0 : x === SIZE - 1 ? 1 : 0.5),
        top - length / 2,
        y - HALF + (y === 0 ? 0 : y === SIZE - 1 ? 1 : 0.5),
      );
      dummy.scale.set(1, length, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      streams.setMatrixAt(falling++, dummy.matrix);
    }
    streams.count = falling;
    streams.instanceMatrix.needsUpdate = true;
  }

  const ringGeometry = new THREE.TorusGeometry(1, 0.025, 4, 40);
  const moteGeometry = new THREE.SphereGeometry(0.08, 6, 4);
  function impact(event, s) {
    if (reduced) return;
    const x = event.x ?? event.targets[0] % SIZE,
      y = event.y ?? Math.floor(event.targets[0] / SIZE);
    const i = Math.floor(y) * SIZE + Math.floor(x),
      z = s.terrain[i] + s.water[i] + 0.14;
    const ring = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({
        color: palette[event.type],
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x - HALF + 0.5, z, y - HALF + 0.5);
    scene.add(ring);
    fx.push({ mesh: ring, life: 1, max: 1, ring: true });
    const motes = new THREE.InstancedMesh(
      moteGeometry,
      new THREE.MeshBasicMaterial({
        color: event.type === "sun" ? 0xe3f9ec : palette[event.type],
        transparent: true,
        opacity: 1,
      }),
      18,
    );
    motes.frustumCulled = false;
    const particles = [];
    for (let n = 0; n < 18; n++) {
      const angle = (n / 18) * Math.PI * 2;
      const j = event.targets[Math.floor((n / 18) * event.targets.length)];
      const position = new THREE.Vector3(
        (j % SIZE) - HALF + 0.5,
        s.terrain[j] + s.water[j] + 0.2,
        Math.floor(j / SIZE) - HALF + 0.5,
      );
      particles.push({
        position,
        v: new THREE.Vector3(
          Math.cos(angle) * (1 + (n % 3)),
          2.5 + (n % 4),
          Math.sin(angle) * (1 + (n % 3)),
        ),
      });
      dummy.position.copy(position);
      dummy.scale.setScalar(1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      motes.setMatrixAt(n, dummy.matrix);
    }
    scene.add(motes);
    fx.push({ mesh: motes, life: 0.75, max: 0.75, particles });
    if (event.quake) shake = 0.65;
    lastUpdate = -1;
  }
  const raycaster = new THREE.Raycaster(),
    plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    point = new THREE.Vector3();
  function pick(clientX, clientY, p) {
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((clientX - r.left) / r.width) * 2 - 1,
        1 - ((clientY - r.top) / r.height) * 2,
      ),
      camera,
    );
    if (!raycaster.ray.intersectPlane(plane, point)) return null;
    const shape = cells(p),
      cx = (Math.max(...shape.map((p) => p[0])) + 1) / 2,
      cy = (Math.max(...shape.map((p) => p[1])) + 1) / 2;
    return { x: point.x + HALF - cx, y: point.z + HALF - cy };
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    width = r.width;
    height = r.height;
    renderer.setSize(width, height, false);
    const span = Math.max(54, (38 * width) / height);
    camera.left = -span / 2;
    camera.right = span / 2;
    camera.top = (span * height) / width / 2;
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    return width / span / Math.sqrt(2);
  }
  function render(s, aim, time, dt, options) {
    elapsed += dt;
    if (s !== lastState || elapsed - lastUpdate > 0.085) {
      updateLandscape(s);
      lastUpdate = elapsed;
      lastState = s;
    }
    updatePiece(s.current);
    piece.visible = options.showPiece && !s.over;
    piece.position.set(
      aim.x - HALF,
      Math.max(s.altitude, landingHeight(s, aim)),
      aim.y - HALF,
    );
    shadow.visible = piece.visible;
    shadow.position.set(
      aim.x - HALF + shadow.userData.w / 2,
      landingHeight(s, aim) + 0.055,
      aim.y - HALF + shadow.userData.h / 2,
    );
    waterMaterial.uniforms.time.value = reduced ? 0 : time;
    let count = 0;
    for (const lake of options.bonuses.groups.filter(
      (l) => l.duck && !l.frozen,
    )) {
      const deep = lake.cells.filter((i) => s.water[i] >= 2.5);
      if (!deep.length) continue;
      const i = deep[Math.floor(deep.length / 2)],
        g = ducks[count] || duck();
      g.visible = true;
      g.position.set(
        (i % SIZE) - HALF + 0.5,
        s.terrain[i] +
          s.water[i] +
          0.08 +
          (reduced ? 0 : Math.sin(time * 2 + count) * 0.05),
        Math.floor(i / SIZE) - HALF + 0.5,
      );
      g.rotation.y = 0.7 + count;
      count++;
    }
    ducks.forEach((g, n) => {
      if (n >= count) g.visible = false;
    });
    rainbow.visible = options.bonuses.rainbow;
    for (const g of hazardCache.values()) g.visible = false;
    for (let n = 0; n < s.hazards.length + s.mines.length; n++) {
      const h = s.hazards[n],
        mine = s.mines[n - s.hazards.length],
        type = h?.type || "mine",
        key = `${n}/${type}`;
      let g = hazardCache.get(key);
      if (!g) {
        g = makeToken(type);
        hazards.add(g);
        hazardCache.set(key, g);
      }
      const x = h?.x ?? mine.i % SIZE,
        y = h?.y ?? Math.floor(mine.i / SIZE),
        i = y * SIZE + x;
      g.visible = true;
      g.position.set(
        x - HALF + 0.5,
        h?.altitude ?? s.terrain[i] + s.water[i] + 0.2,
        y - HALF + 0.5,
      );
      g.scale.setScalar(0.65);
    }
    if (!options.paused)
      for (const f of fx) {
        f.life -= dt;
        f.mesh.material.opacity = Math.max(0, f.life / f.max);
        if (f.ring) f.mesh.scale.setScalar(1 + (1 - f.life) * 4);
        else {
          f.particles.forEach((p, n) => {
            p.position.addScaledVector(p.v, dt);
            p.v.y -= dt * 7;
            dummy.position.copy(p.position);
            dummy.scale.setScalar(1);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            f.mesh.setMatrixAt(n, dummy.matrix);
          });
          f.mesh.instanceMatrix.needsUpdate = true;
        }
      }
    fx = fx.filter((f) => {
      if (f.life > 0) return true;
      scene.remove(f.mesh);
      f.mesh.material.dispose();
      if (f.mesh.isInstancedMesh) f.mesh.dispose();
      return false;
    });
    if (!options.paused && shake > 0) {
      shake = Math.max(0, shake - dt);
      camera.setViewOffset(
        width,
        height,
        Math.sin(time * 74) * shake * 4,
        Math.cos(time * 83) * shake * 4,
        width,
        height,
      );
    } else camera.clearViewOffset();
    renderer.render(scene, camera);
  }
  return {
    kind: "webgl",
    resize,
    render,
    pick,
    impact,
    get quarter() {
      return quarter;
    },
    turn() {
      quarter = (quarter + 1) % 4;
      positionCamera();
    },
    get stats() {
      return {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      };
    },
    clear() {
      for (const f of fx) {
        scene.remove(f.mesh);
        f.mesh.material.dispose();
        if (f.mesh.isInstancedMesh) f.mesh.dispose();
      }
      fx = [];
      shake = 0;
      lastUpdate = -1;
    },
  };
}

// The same continuous simulation remains playable on devices without WebGL.
function createCanvasRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let width,
    height,
    unit,
    quarter = 0;
  const rotate = (x, y) => {
    for (let n = 0; n < quarter; n++) [x, y] = [y, SIZE - x];
    return [x, y];
  };
  const project = (x, y, z = 0) => {
    [x, y] = rotate(x, y);
    return [
      width / 2 + (x - y) * unit,
      height * 0.36 + (x + y - SIZE) * unit * 0.5 - z * unit * 0.866,
    ];
  };
  function polygon(points, color) {
    ctx.beginPath();
    points.forEach((p, n) => (n ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    width = r.width;
    height = r.height;
    unit = Math.min(width / 70, height / 50);
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    return unit;
  }
  function render(s, aim, t, dt, o) {
    ctx.clearRect(0, 0, width, height);
    polygon(
      [
        project(0, SIZE),
        project(SIZE, SIZE),
        project(SIZE, SIZE, -4),
        project(0, SIZE, -4),
      ],
      "#33535a",
    );
    polygon(
      [
        project(SIZE, 0),
        project(SIZE, SIZE),
        project(SIZE, SIZE, -4),
        project(SIZE, 0, -4),
      ],
      "#26454e",
    );
    const order = Array.from({ length: SIZE * SIZE }, (_, i) => i).sort(
      (a, b) => {
        const A = rotate(a % SIZE, Math.floor(a / SIZE)),
          B = rotate(b % SIZE, Math.floor(b / SIZE));
        return A[0] + A[1] - B[0] - B[1];
      },
    );
    for (const i of order) {
      const x = i % SIZE,
        y = Math.floor(i / SIZE),
        h = s.holes[i] ? -0.8 : s.terrain[i],
        w = s.water[i];
      polygon(
        [
          project(x, y, h),
          project(x + 1, y, h),
          project(x + 1, y + 1, h),
          project(x, y + 1, h),
        ],
        s.holes[i] ? "#1c3b46" : `hsl(137 20% ${56 + h * 2}%)`,
      );
      if (w > 0.04)
        polygon(
          [
            project(x, y, h + w),
            project(x + 1, y, h + w),
            project(x + 1, y + 1, h + w),
            project(x, y + 1, h + w),
          ],
          s.ice[i] > 0 ? "#b5e6ed" : "#39aac1",
        );
    }
    if (o.showPiece && !s.over) {
      const z = Math.max(s.altitude, landingHeight(s, aim));
      ctx.globalAlpha = 0.24;
      for (const [dx, dy] of cells(s.current))
        polygon(
          [
            project(aim.x + dx, aim.y + dy, 0.1),
            project(aim.x + dx + 1, aim.y + dy, 0.1),
            project(aim.x + dx + 1, aim.y + dy + 1, 0.1),
            project(aim.x + dx, aim.y + dy + 1, 0.1),
          ],
          "#143f41",
        );
      ctx.globalAlpha = 1;
      if (["raise", "lower"].includes(s.current.type)) {
        for (const [dx, dy] of cells(s.current))
          polygon(
            [
              project(aim.x + dx, aim.y + dy, z),
              project(aim.x + dx + 1, aim.y + dy, z),
              project(aim.x + dx + 1, aim.y + dy + 1, z),
              project(aim.x + dx, aim.y + dy + 1, z),
            ],
            `#${palette[s.current.type].toString(16)}`,
          );
      } else {
        const p = project(aim.x + 0.5, aim.y + 0.5, z);
        ctx.beginPath();
        ctx.arc(...p, unit * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = `#${palette[s.current.type].toString(16)}`;
        ctx.fill();
      }
    }
  }
  function pick(clientX, clientY, p) {
    const r = canvas.getBoundingClientRect(),
      a = (clientX - r.left - width / 2) / unit,
      b = (clientY - r.top - height * 0.36) / (0.5 * unit) + SIZE;
    let x = (a + b) / 2,
      y = (b - a) / 2;
    for (let n = 0; n < quarter; n++) [x, y] = [SIZE - y, x];
    const shape = cells(p);
    return {
      x: x - (Math.max(...shape.map((p) => p[0])) + 1) / 2,
      y: y - (Math.max(...shape.map((p) => p[1])) + 1) / 2,
    };
  }
  return {
    kind: "canvas",
    resize,
    render,
    pick,
    impact() {},
    clear() {},
    turn() {
      quarter = (quarter + 1) % 4;
    },
    get quarter() {
      return quarter;
    },
    get stats() {
      return { calls: 0, triangles: 0 };
    },
  };
}
