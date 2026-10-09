import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  SIZE,
  cells,
  landingHeight,
  waterBubbles,
  landMass,
  QUAKE_LIMIT,
} from "./simulation.js";
import { leakPaths, evaporationProfile } from "./atmosphere.js";
import { createImpactFeedback } from "./feedback.js";
import { createTokenWorkshop } from "./tokens.js";
import { createCraters } from "./craters.js";
import { drawWaterBubble } from "./bubble-canvas.js";
import { addIslandBody, solidFootprint } from "./diorama.js";

const HALF = SIZE / 2;
const palette = {
  raise: 0xec6847,
  lower: 0x59c2b0,
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
    return createCanvasRenderer(canvas, reduced);
  let renderer;
  try {
    const context = canvas.getContext("webgl2", {
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    if (!context) return createCanvasRenderer(canvas, reduced);
    renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
  } catch {
    return createCanvasRenderer(canvas, reduced);
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.setClearColor(0x153747, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-27, 27, 22, -22, 0.1, 180);
  const hemi = new THREE.HemisphereLight(0xc4efff, 0x435b46, 1.15);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffe4b6, 2.15);
  key.position.set(-20, 48, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {
    left: -26,
    right: 26,
    top: 26,
    bottom: -26,
    near: 1,
    far: 100,
  });
  key.shadow.bias = -0.00012;
  key.shadow.normalBias = 0.035;
  key.shadow.radius = 2;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x7bcbdc, 0.85);
  fill.position.set(20, 9, -30);
  scene.add(fill);
  const environmentCanvas = document.createElement("canvas");
  environmentCanvas.width = 512;
  environmentCanvas.height = 256;
  const environmentContext = environmentCanvas.getContext("2d");
  const sky = environmentContext.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, "#c5e5ec");
  sky.addColorStop(0.45, "#eaf2da");
  sky.addColorStop(0.6, "#6eafa4");
  sky.addColorStop(1, "#274858");
  environmentContext.fillStyle = sky;
  environmentContext.fillRect(0, 0, 512, 256);
  const sun = environmentContext.createRadialGradient(350, 72, 0, 350, 72, 52);
  sun.addColorStop(0, "rgba(255,250,208,1)");
  sun.addColorStop(0.25, "rgba(255,243,192,.8)");
  sun.addColorStop(1, "rgba(255,240,190,0)");
  environmentContext.fillStyle = sun;
  environmentContext.fillRect(0, 0, 512, 256);
  const environment = new THREE.CanvasTexture(environmentCanvas);
  environment.colorSpace = THREE.SRGBColorSpace;
  environment.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  let environmentTarget = pmrem.fromEquirectangular(environment);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 0.32;
  pmrem.dispose();
  environment.dispose();
  let width = 0,
    height = 0,
    quarter = 0,
    lastUpdate = -1,
    lastState,
    elapsed = 0;
  let pieceKey = "",
    piece = new THREE.Group(),
    shake = 0;
  let turnAngle = 0,
    dirty = true;
  const displayHeights = new Float32Array(SIZE * SIZE);
  scene.add(piece);
  const target = new THREE.Vector3(0, 1.1, 0);
  function positionCamera() {
    const angle = Math.PI / 4 - (quarter * Math.PI) / 2;
    camera.position.set(Math.cos(angle) * 59.4, 38, Math.sin(angle) * 59.4);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }
  positionCamera();
  const feedback = createImpactFeedback(scene, camera, reduced);
  let lastPieceTurn = -1,
    arrivedAt = 0;

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
  const terrain = new THREE.Mesh(
    terrainGeometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0,
    }),
  );
  terrain.material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec3 vGroundPosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvGroundPosition=position;",
    );
    shader.fragmentShader =
      "varying vec3 vGroundPosition;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec3 faceNormal=normalize(cross(dFdx(vGroundPosition),dFdy(vGroundPosition)));
      float slope=1.-smoothstep(.63,.93,abs(faceNormal.y));
      float strata=1.-smoothstep(.035,.095,abs(fract(max(0.,vGroundPosition.y)/1.4)-.5));
      vec3 earth=mix(vec3(.33,.22,.12),vec3(.53,.39,.22),smoothstep(0.,6.,vGroundPosition.y));
      earth *= 1.-strata*.12;
      diffuseColor.rgb=mix(diffuseColor.rgb,earth,slope*.9);
    `,
    );
  };
  terrain.castShadow = true;
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
  const island = addIslandBody(scene);
  const holePixels = new Uint8Array(SIZE * SIZE);
  const holeMask = new THREE.DataTexture(
    holePixels,
    SIZE,
    SIZE,
    THREE.RedFormat,
  );
  holeMask.needsUpdate = true;
  // Cut the same columns through the stone and edge skirt as the terrain mesh.
  // The sky behind the canvas is visible through these openings.
  function cutHoles(material) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.holeMask = { value: holeMask };
      shader.vertexShader =
        "varying vec3 vRockPosition;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvRockPosition=position;",
      );
      shader.fragmentShader =
        "uniform sampler2D holeMask; varying vec3 vRockPosition;\n" +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      vec2 holeUV=(vRockPosition.xz+vec2(16.))/32.;
      if(all(greaterThanEqual(holeUV,vec2(0.)))&&all(lessThan(holeUV,vec2(1.)))&&texture2D(holeMask,holeUV).r>.5) discard;
    `,
      );
    };
  }
  [island.body.material, island.roots.material, cliff.material].forEach(
    cutHoles,
  );
  const craters = createCraters(scene);

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
    uniforms: {
      time: { value: 0 },
      fade: { value: 1 },
      eye: { value: camera.position },
      ripples: {
        value: Array.from(
          { length: 4 },
          () => new THREE.Vector4(0, 0, -100, 0),
        ),
      },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `attribute float depth; attribute float frozen;
      varying vec3 world; varying float amount; varying float frost;
      void main() { world = (modelMatrix * vec4(position,1.)).xyz;
        amount = depth; frost = frozen;
        gl_Position = projectionMatrix * viewMatrix * vec4(world,1.); }`,
    fragmentShader: `uniform float time; uniform float fade; uniform vec3 eye; uniform vec4 ripples[4];
      varying vec3 world; varying float amount; varying float frost;
      void main() {
        if (amount < .035) discard;
        vec2 slope = vec2(cos(world.x*.81 + world.z*.47 + time*.67),
          sin(world.z*.73 - world.x*.54 - time*.53)) * .045 * (1.-frost);
        float rings = 0.;
        for(int i=0;i<4;i++) {
          float age=time-ripples[i].z, dist=distance(world.xz,ripples[i].xy);
          if(age>=0.&&age<3.) {
            float ring=sin(dist*3.4-age*9.)*exp(-abs(dist-age*3.)*1.6)*exp(-age*1.3)*ripples[i].w;
            slope += normalize(world.xz-ripples[i].xy+vec2(.001))*ring*.11;
            rings += abs(ring)*.035;
          }
        }
        vec3 normal=normalize(vec3(slope.x,1.,slope.y)), view=normalize(eye-world);
        vec3 reflected=reflect(-view,normal);
        float fresnel=pow(1.-max(dot(normal,view),0.),4.);
        vec3 shallow=vec3(.06,.58,.76), middle=vec3(.008,.14,.48), deep=vec3(.018,.025,.15);
        vec3 col=mix(shallow,middle,smoothstep(.12,1.4,amount));
        col=mix(col,deep,smoothstep(1.4,3.7,amount));
        vec3 sky=mix(vec3(.12,.37,.49),vec3(.69,.87,.8),smoothstep(.05,.8,reflected.y));
        col=mix(col,sky,.06+fresnel*.3);
        float sun=pow(max(0.,dot(reflected,normalize(vec3(-.62,.53,-.62)))),240.);
        col += vec3(1.,.89,.65)*sun*.11 + rings;
        float caustic=pow(abs(sin(world.x*1.7+sin(world.z*.9+time*.3))*sin(world.z*1.9+sin(world.x*.8-time*.2))),6.);
        col += caustic*.014 * (1.-frost);
        float edge=1.-smoothstep(.04,.26,amount);
        col=mix(col,vec3(.71,.97,1.),edge*.7);
        float contour=1.-smoothstep(.025,.09,abs(fract(amount/.7)-.5));
        col+=vec3(.055,.09,.1)*contour*(1.-frost);
        float crystal=pow(abs(sin(world.x*3.+world.z*2.)*sin(world.z*4.-world.x)),12.);
        col=mix(col,vec3(.51,.78,.84)+crystal*.13,frost);
        gl_FragColor = vec4(col, smoothstep(.035,.13,amount)*.97*fade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.renderOrder = 2;
  scene.add(water);
  let rippleIndex = 0,
    worldTime = 0;

  const stone = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.25, 0),
    new THREE.MeshStandardMaterial({ color: 0x658b73, roughness: 1 }),
    50,
  );
  const dummy = new THREE.Object3D();
  for (let n = 0; n < 50; n++) {
    const side = n % 4,
      t = (n / 50) * 32 - 16;
    dummy.position.set(
      side < 2 ? t : side === 2 ? -16.03 : 16.03,
      -1.1 - (n % 5) * 0.45,
      side < 2 ? (side === 0 ? -16.03 : 16.03) : t,
    );
    dummy.scale.set(1 + (n % 3), 0.6, 1);
    dummy.rotation.set(n, n * 0.7, n * 0.3);
    dummy.updateMatrix();
    stone.setMatrixAt(n, dummy.matrix);
  }
  scene.add(stone);
  const streams = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.11, 0.19, 1, 6),
    new THREE.MeshBasicMaterial({
      color: 0x80d9db,
      transparent: true,
      opacity: 0.7,
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
    sprite.scale.set(22, 8, 1);
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
  const targetGeometry = new THREE.PlaneGeometry(1, 1, 24, 24);
  cutHoles(shadowMaterial);
  targetGeometry.rotateX(-Math.PI / 2);
  const targetBase = targetGeometry.attributes.position.array.slice();
  const shadow = new THREE.Mesh(targetGeometry, shadowMaterial);
  shadow.frustumCulled = false;
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
    const otherWing = wing.clone();
    otherWing.position.x *= -1;
    g.add(otherWing);
    g.userData.wings = [wing, otherWing];
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

  const leakFoam = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.09, 6, 4),
    new THREE.MeshBasicMaterial({
      color: 0xe9ffff,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
    112,
  );
  leakFoam.count = 0;
  leakFoam.frustumCulled = false;
  scene.add(leakFoam);
  const leakMouths = new THREE.InstancedMesh(
    new THREE.TorusGeometry(0.55, 0.055, 5, 24),
    new THREE.MeshBasicMaterial({
      color: 0xaff6ff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    }),
    8,
  );
  leakMouths.count = 0;
  leakMouths.frustumCulled = false;
  scene.add(leakMouths);
  let tracedLeaks = [];

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
  const workshop = createTokenWorkshop();
  const makeToken = workshop.make;
  function disposeGroup(group) {
    // Token geometry/materials are shared; only unique land instance buffers go.
    group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.userData.uniqueGeometry) o.geometry.dispose();
      if (o.userData.uniqueMaterial) o.material.dispose();
    });
    group.clear();
  }
  function updatePiece(p) {
    const next = `${p.type}/${p.shape}/${p.rotation}/${p.waterSize ?? "legacy"}`;
    if (next === pieceKey) return;
    pieceKey = next;
    disposeGroup(piece);
    const shape = cells(p),
      w = Math.max(...shape.map((p) => p[0])) + 1,
      h = Math.max(...shape.map((p) => p[1])) + 1;
    if (p.type === "raise" || p.type === "lower") {
      const blocks = new THREE.Mesh(solidFootprint(shape), material(p.type));
      blocks.rotation.x = -Math.PI / 2;
      blocks.position.set(-w / 2, 0, -h / 2);
      blocks.userData.uniqueGeometry = true;
      piece.add(blocks);
    } else {
      const token = makeToken(
        p.type,
        p.type === "rain" ? waterBubbles(p) : undefined,
      );
      token.userData.baseLift =
        p.type === "bomb" ? 1.275 : p.type === "sun" ? 1.7 : 1;
      token.position.set(
        0.5 - w / 2,
        token.userData.baseLift + 0.05,
        0.5 - h / 2,
      );
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
    shadow.userData.span = Math.max(w, h) * 1.4;
    shadow.userData = { w, h, span: Math.max(w, h) * 1.4 };
  }

  const color = new THREE.Color();
  const grass = new THREE.Color(0x7f9f8c),
    high = new THREE.Color(0xcadba2),
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
  const lastHoles = new Uint8Array(SIZE * SIZE);
  function updateLandscape(s, dt) {
    if (s.holes.some((v, i) => Number(v) !== lastHoles[i])) {
      const openIndices = [];
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          if (s.holes[y * SIZE + x]) continue;
          const v = y * (SIZE + 1) + x;
          openIndices.push(
            v,
            v + SIZE + 1,
            v + 1,
            v + 1,
            v + SIZE + 1,
            v + SIZE + 2,
          );
        }
      for (const geometry of [terrainGeometry, waterGeometry]) {
        geometry.index.array.set(openIndices);
        geometry.index.needsUpdate = true;
        geometry.setDrawRange(0, openIndices.length);
      }
      lastHoles.set(s.holes);
      s.holes.forEach((v, i) => (holePixels[i] = v ? 255 : 0));
      holeMask.needsUpdate = true;
    }
    const blend = reduced || s !== lastState ? 1 : 1 - Math.exp(-dt * 19);
    for (let i = 0; i < s.terrain.length; i++) {
      const target = s.holes[i] ? -4.5 : s.terrain[i];
      displayHeights[i] += (target - displayHeights[i]) * blend;
      holesHeight[i] = displayHeights[i];
    }
    for (let y = 0; y <= SIZE; y++)
      for (let x = 0; x <= SIZE; x++) {
        const v = y * (SIZE + 1) + x,
          holeCoverage = sample(s.holes, x, y),
          z =
            holeCoverage > 0 && holeCoverage < 1
              ? (() => {
                  let height = 0,
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
                    if (
                      cx >= 0 &&
                      cy >= 0 &&
                      cx < SIZE &&
                      cy < SIZE &&
                      !s.holes[i]
                    ) {
                      height += displayHeights[i];
                      count++;
                    }
                  }
                  return count ? height / count : 0;
                })()
              : sample(holesHeight, x, y),
          depth = sample(s.water, x, y),
          frozen = sample(s.ice, x, y);
        positions[v * 3 + 1] = z;
        color
          .copy(grass)
          .lerp(high, Math.min(1, Math.max(0, z) / 4))
          .lerp(wet, Math.min(0.35, depth * 0.18));
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
    craters.update(s, displayHeights);
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
        const C = [B[0], -1.23, B[2]],
          D = [A[0], -1.23, A[2]];
        for (const pt of [A, B, D, B, C, D]) {
          cliffPositions.set(pt, n * 3);
          const upper = pt[1] > -1;
          cliffColors.set(
            upper ? [0.42, 0.45, 0.25] : [0.23, 0.27, 0.19],
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
        (s.holes[i] ? x + y * 3 : x === 0 || x === SIZE - 1 ? y : x) % 4 !== 0
      )
        continue;
      const top = s.terrain[i] + s.water[i],
        length = s.holes[i] ? 2.8 : 3.8;
      dummy.position.set(
        x - HALF + (x === 0 ? 0 : x === SIZE - 1 ? 1 : 0.5),
        top - length / 2 - ((worldTime * 2.4 + i * 0.37) % 1) * 3.2,
        y - HALF + (y === 0 ? 0 : y === SIZE - 1 ? 1 : 0.5),
      );
      dummy.scale.set(1, length, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      streams.setMatrixAt(falling++, dummy.matrix);
    }
    streams.count = falling;
    streams.instanceMatrix.needsUpdate = true;
    tracedLeaks = leakPaths(s);
    let foam = 0,
      mouthCount = 0;
    for (const path of tracedLeaks) {
      const i = path.mouth;
      dummy.position.set(
        (i % SIZE) - HALF + 0.5,
        s.terrain[i] + s.water[i] + 0.08,
        Math.floor(i / SIZE) - HALF + 0.5,
      );
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(
        reduced ? 1 : 1 + Math.sin(worldTime * 5 + i) * 0.16,
      );
      dummy.updateMatrix();
      leakMouths.setMatrixAt(mouthCount++, dummy.matrix);
      for (let n = 0; n < path.route.length - 1 && foam < 112; n++) {
        const a = path.route[n],
          b = path.route[n + 1];
        const t = reduced ? 0.5 : (worldTime * 1.6 + n * 0.17) % 1;
        // A foam bead moves downstream along the measured head gradient.
        dummy.position.set(
          (b % SIZE) * (1 - t) + (a % SIZE) * t - HALF + 0.5,
          (s.terrain[b] + s.water[b]) * (1 - t) +
            (s.terrain[a] + s.water[a]) * t +
            0.065,
          Math.floor(b / SIZE) * (1 - t) +
            Math.floor(a / SIZE) * t -
            HALF +
            0.5,
        );
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.9, 0.45, 0.9);
        dummy.updateMatrix();
        leakFoam.setMatrixAt(foam++, dummy.matrix);
      }
    }
    leakMouths.count = mouthCount;
    leakMouths.instanceMatrix.needsUpdate = true;
    leakFoam.count = foam;
    leakFoam.instanceMatrix.needsUpdate = true;
  }

  function impact(event, s) {
    turnAngle = 0;
    dirty = true;
    feedback.impact(event, s);
    if (!reduced)
      for (const g of ducks.filter((g) => g.visible)) {
        const distance = Math.hypot(
          g.position.x - (event.x - HALF),
          g.position.z - (event.y - HALF),
        );
        const evaporated =
          event.type === "sun" &&
          event.removed > 0.1 &&
          event.feedbackCells?.includes(g.userData.cell);
        const frightened =
          (event.type === "bomb" || event.detonated || event.quake) &&
          (distance < 8 || event.quake);
        if (
          evaporated ||
          frightened ||
          (event.type === "rain" && distance < 12)
        ) {
          g.userData.reaction = {
            type: evaporated ? "flight" : frightened ? "scatter" : "wave",
            started: worldTime,
            origin: g.position.clone(),
            yaw: g.rotation.y,
            dx: distance ? (g.position.x - (event.x - HALF)) / distance : 0.7,
            dz: distance ? (g.position.z - (event.y - HALF)) / distance : -0.7,
          };
        }
      }
    if (event.removed > 0.1 && !reduced) {
      const geometry = waterGeometry.clone(),
        indices = [];
      for (const i of event.feedbackCells || event.targets) {
        const x = i % SIZE,
          y = Math.floor(i / SIZE),
          v = y * (SIZE + 1) + x;
        indices.push(v, v + SIZE + 1, v + 1, v + 1, v + SIZE + 1, v + SIZE + 2);
      }
      geometry.index.array.set(indices);
      geometry.index.needsUpdate = true;
      geometry.setDrawRange(0, indices.length);
      const ghost = new THREE.Mesh(geometry, waterMaterial.clone());
      ghost.renderOrder = 2;
      feedback.ghost(ghost, 0.45 + evaporationProfile(event).strength * 0.8);
    }
    if (!reduced && (event.type === "rain" || event.type === "sun")) {
      for (const [x, y] of event.type === "rain"
        ? cells(event.piece)
        : [[0, 0]])
        waterMaterial.uniforms.ripples.value[rippleIndex++ % 4].set(
          (event.x ?? 0) + x - HALF + 0.5,
          (event.y ?? 0) + y - HALF + 0.5,
          worldTime,
          event.type === "rain" ? 1 : 0.6,
        );
    }
    if (!reduced && (event.type === "bomb" || event.detonated || event.quake))
      shake = event.quake ? 0.65 : 0.22;
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
    const span = Math.max(51, (38 * width) / height);
    camera.left = -span / 2;
    camera.right = span / 2;
    camera.top = (span * height) / width / 2;
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    return width / span / Math.sqrt(2);
  }
  function render(s, aim, time, dt, options) {
    worldTime = time;
    elapsed += dt;
    if (s !== lastState || dirty || elapsed - lastUpdate > 0.034) {
      updateLandscape(s, Math.max(0.001, elapsed - lastUpdate));
      lastUpdate = elapsed;
      lastState = s;
      dirty = false;
    }
    updatePiece(s.current);
    if (s.turn !== lastPieceTurn) {
      lastPieceTurn = s.turn;
      arrivedAt = time;
    }
    const age = Math.max(0, time - arrivedAt),
      arrival = reduced
        ? 1
        : 1 + Math.sin(age * 22) * Math.exp(-age * 14) * 0.12;
    piece.scale.setScalar(arrival);
    piece.visible = options.showPiece && !s.over;
    piece.position.set(
      aim.x - HALF + shadow.userData.w / 2,
      Math.max(s.altitude, landingHeight(s, aim)),
      aim.y - HALF + shadow.userData.h / 2,
    );
    if (!options.paused) turnAngle *= Math.exp(-dt * 24);
    piece.rotation.y = turnAngle;
    shadow.visible = piece.visible;
    workshop.animate(
      piece,
      time,
      reduced,
      s.dropping ? 1 : s.mode === "classic" ? 0.25 : 0,
    );
    for (const token of piece.children)
      if (token.userData.baseLift)
        token.position.y =
          0.05 + token.userData.baseLift * token.children[0].scale.y;
    shadowMaterial.opacity = Math.max(
      0.12,
      0.27 - (s.altitude - landingHeight(s, aim)) * 0.009,
    );
    const targetPositions = targetGeometry.attributes.position,
      span = shadow.userData.span;
    const centerX = aim.x + shadow.userData.w / 2,
      centerY = aim.y + shadow.userData.h / 2;
    const surfaceAt = (x, y) => {
      x = Math.max(0, Math.min(SIZE - 0.001, x));
      y = Math.max(0, Math.min(SIZE - 0.001, y));
      const ix = Math.floor(x),
        iy = Math.floor(y),
        tx = x - ix,
        ty = y - iy;
      const at = (a, b) => {
        const v = b * (SIZE + 1) + a;
        return Math.max(
          positions[v * 3 + 1],
          waterGeometry.attributes.depth.array[v] > 0.035
            ? waterPositions[v * 3 + 1]
            : -100,
        );
      };
      const a = at(ix, iy),
        b = at(ix + 1, iy),
        c = at(ix, iy + 1),
        d = at(ix + 1, iy + 1);
      return tx + ty <= 1
        ? a + (b - a) * tx + (c - a) * ty
        : d + (c - d) * (1 - tx) + (b - d) * (1 - ty);
    };
    for (let v = 0; v < targetPositions.count; v++) {
      const x = centerX + targetBase[v * 3] * span,
        y = centerY + targetBase[v * 3 + 2] * span;
      targetPositions.setXYZ(v, x - HALF, surfaceAt(x, y) + 0.045, y - HALF);
    }
    targetPositions.needsUpdate = true;
    waterMaterial.uniforms.time.value = reduced ? 0 : time;
    const activeDucks = new Set();
    for (const lake of options.bonuses.groups.filter(
      (l) => l.duck && !l.frozen,
    )) {
      const deep = lake.cells.filter((i) => s.water[i] >= 2.5);
      if (!deep.length) continue;
      const i = deep[Math.floor(deep.length / 2)],
        g =
          ducks.find(
            (d) =>
              !activeDucks.has(d) &&
              d.userData.reaction?.type !== "flight" &&
              lake.cells.includes(d.userData.cell),
          ) ||
          ducks.find(
            (d) =>
              !activeDucks.has(d) && d.userData.reaction?.type !== "flight",
          ) ||
          duck();
      activeDucks.add(g);
      g.userData.cell = i;
      g.visible = true;
      g.position.set(
        (i % SIZE) - HALF + 0.5,
        s.terrain[i] +
          s.water[i] +
          0.08 +
          (reduced ? 0 : Math.sin(time * 2 + activeDucks.size) * 0.05),
        Math.floor(i / SIZE) - HALF + 0.5,
      );
      g.rotation.y = 0.7 + activeDucks.size;
    }
    ducks.forEach((g) => {
      const r = g.userData.reaction,
        age = r ? Math.max(0, time - r.started) : 0;
      g.visible = activeDucks.has(g) || (r?.type === "flight" && age < 2.2);
      g.rotation.z = 0;
      g.userData.wings.forEach((w) => (w.rotation.z = 0));
      if (!r || reduced) return;
      if (r.type === "flight" && age < 2.2) {
        g.position
          .copy(r.origin)
          .add(
            new THREE.Vector3(r.dx * age * 2.3, age * 3.2, r.dz * age * 2.3),
          );
        g.rotation.y = r.yaw;
        g.rotation.z = Math.sin(age * 12) * 0.08;
        g.userData.wings.forEach(
          (w, n) =>
            (w.rotation.z = (n ? -1 : 1) * (0.45 + Math.sin(age * 32) * 0.75)),
        );
        g.scale.setScalar(Math.max(0, 1 - Math.max(0, age - 1.6) / 0.6));
      } else if (r.type !== "flight" && age < 1.6) {
        const envelope = Math.exp(-age * 2.5);
        g.position.y +=
          Math.sin(age * 12) * envelope * (r.type === "wave" ? 0.32 : 0.18);
        g.rotation.z = Math.sin(age * 11) * envelope * 0.22;
        if (r.type === "scatter") {
          const escape = Math.sin(Math.min(1, age / 1.6) * Math.PI) * 0.7;
          g.position.x += r.dx * escape;
          g.position.z += r.dz * escape;
          g.userData.wings.forEach(
            (w, n) =>
              (w.rotation.z =
                (n ? -1 : 1) * Math.sin(age * 25) * envelope * 0.6),
          );
        }
      } else {
        g.userData.reaction = null;
        g.scale.setScalar(1);
      }
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
      workshop.animate(g, time, reduced);
    }
    feedback.anticipate(
      s,
      landMass(s) / QUAKE_LIMIT,
      dt,
      options.paused || !options.showPiece,
    );
    feedback.render(dt, options.paused);
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
  const previewScene = new THREE.Scene();
  previewScene.environment = scene.environment;
  previewScene.add(new THREE.HemisphereLight(0xe9f7f5, 0x65705d, 2));
  const previewLight = new THREE.DirectionalLight(0xffe6b6, 2);
  previewLight.position.set(-5, 12, 8);
  previewScene.add(previewLight);
  const previewCamera = new THREE.OrthographicCamera(-6, 6, 4, -4, 0.1, 100);
  previewCamera.position.set(18, 16, 18);
  previewCamera.lookAt(0, 0, 0);
  const previewTarget = new THREE.WebGLRenderTarget(150, 100, { samples: 2 });
  previewTarget.texture.colorSpace = THREE.SRGBColorSpace;
  const previewPixels = new Uint8Array(150 * 100 * 4);
  canvas.addEventListener("webglcontextrestored", () => {
    environmentTarget.dispose();
    const source = new THREE.CanvasTexture(environmentCanvas);
    source.colorSpace = THREE.SRGBColorSpace;
    source.mapping = THREE.EquirectangularReflectionMapping;
    const generator = new THREE.PMREMGenerator(renderer);
    environmentTarget = generator.fromEquirectangular(source);
    scene.environment = previewScene.environment = environmentTarget.texture;
    generator.dispose();
    source.dispose();
  });
  function drawPreview(context, p) {
    updatePiece(p);
    const clone = piece.clone(),
      { w, h } = shadow.userData;
    clone.position.set(0, 0, 0);
    clone.rotation.y = 0;
    clone.scale.setScalar(1);
    for (const token of clone.children)
      if (token.userData.baseLift) token.position.y = 0;
    clone.visible = true;
    previewScene.add(clone);
    const span = Math.max(5, (w + h) * 0.62);
    previewCamera.left = -span * 0.75;
    previewCamera.right = span * 0.75;
    previewCamera.top = span / 2;
    previewCamera.bottom = -span / 2;
    previewCamera.updateProjectionMatrix();
    const previousTarget = renderer.getRenderTarget(),
      previousShadows = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    renderer.setRenderTarget(previewTarget);
    renderer.clear();
    renderer.render(previewScene, previewCamera);
    renderer.readRenderTargetPixels(
      previewTarget,
      0,
      0,
      150,
      100,
      previewPixels,
    );
    renderer.setRenderTarget(previousTarget);
    renderer.shadowMap.enabled = previousShadows;
    const output = context.createImageData(150, 100);
    for (let y = 0; y < 100; y++)
      output.data.set(
        previewPixels.subarray((99 - y) * 600, (100 - y) * 600),
        y * 600,
      );
    context.putImageData(output, 0, 0);
    previewScene.remove(clone);
    clone.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
    });
    return true;
  }
  return {
    kind: "webgl",
    resize,
    render,
    pick,
    impact,
    preview: drawPreview,
    twist() {
      if (!reduced) turnAngle += Math.PI / 2;
    },
    get quarter() {
      return quarter;
    },
    turn() {
      quarter = (quarter + 1) % 4;
      positionCamera();
    },
    get stats() {
      let pose = null;
      piece.traverse((o) => {
        if (o.userData.tokenMotion)
          pose = { bob: o.position.y, lean: o.rotation.z, stretch: o.scale.y };
      });
      return {
        ...feedback.stats,
        leakPaths: tracedLeaks.length,
        foamBeads: leakFoam.count,
        duckReactions: ducks
          .filter((g) => g.visible && g.userData.reaction)
          .map((g) => ({
            type: g.userData.reaction.type,
            x: g.position.x,
            y: g.position.y,
            wing: g.userData.wings[0].rotation.z,
          })),
        craterEdges: craters.edges,
        tokenPose: pose,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        rotationAngle: turnAngle,
        terrainPeak: displayHeights.reduce((n, h) => Math.max(n, h), 0),
        terrainFloor: displayHeights.reduce((n, h) => Math.min(n, h), 0),
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        openTerrainTriangles:
          Math.min(
            terrainGeometry.index.count,
            terrainGeometry.drawRange.count,
          ) / 3,
      };
    },
    clear() {
      feedback.clear();
      lastPieceTurn = -1;
      shake = 0;
      lastUpdate = -1;
      dirty = true;
      lastState = undefined;
      turnAngle = 0;
      waterMaterial.uniforms.ripples.value.forEach((v) => v.set(0, 0, -100, 0));
    },
  };
}

// The same continuous simulation remains playable on devices without WebGL.
function createCanvasRenderer(canvas, reduced = false) {
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
        s.holes[i] ? "#a1e2ed" : `hsl(137 20% ${56 + h * 2}%)`,
      );
      if (w > 0.04)
        polygon(
          [
            project(x, y, h + w),
            project(x + 1, y, h + w),
            project(x + 1, y + 1, h + w),
            project(x, y + 1, h + w),
          ],
          s.ice[i] > 0
            ? "#b5e6ed"
            : w < 0.7
              ? "#50d9e7"
              : w < 2
                ? "#1788d9"
                : "#243b91",
        );
    }
    ctx.strokeStyle = "#d1fbff";
    ctx.fillStyle = "#eaffff";
    ctx.lineWidth = Math.max(1, unit * 0.08);
    for (const path of leakPaths(s, 6)) {
      const i = path.mouth;
      const [px, py] = project(
        (i % SIZE) + 0.5,
        Math.floor(i / SIZE) + 0.5,
        s.terrain[i] + s.water[i] + 0.08,
      );
      ctx.beginPath();
      ctx.ellipse(px, py, unit * 0.6, unit * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      for (let n = 0; n < path.route.length - 1; n++) {
        const a = path.route[n],
          b = path.route[n + 1],
          f = reduced ? 0.5 : (t * 1.6 + n * 0.17) % 1;
        const point = project(
          (b % SIZE) * (1 - f) + (a % SIZE) * f + 0.5,
          Math.floor(b / SIZE) * (1 - f) + Math.floor(a / SIZE) * f + 0.5,
          (s.terrain[b] + s.water[b]) * (1 - f) +
            (s.terrain[a] + s.water[a]) * f +
            0.08,
        );
        ctx.beginPath();
        ctx.arc(...point, Math.max(1, unit * 0.07), 0, Math.PI * 2);
        ctx.fill();
      }
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
      } else if (s.current.type === "rain") {
        for (const b of waterBubbles(s.current)) {
          const p = project(aim.x + b.x + 0.5, aim.y + b.y + 0.5, z + 1);
          drawWaterBubble(ctx, ...p, unit, b.fill, reduced ? 0 : t);
        }
      } else {
        const p = project(aim.x + 0.5, aim.y + 0.5, z);
        ctx.beginPath();
        ctx.arc(...p, unit * 1.25, 0, Math.PI * 2);
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
