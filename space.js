// 3D space scene: an astronaut you steer past stars, planets, and galaxies.
// Built the first time space mode is entered, paused when exited. scripts.js
// fires the "spacemodechange" event.

let scene, camera, renderer, clock, container;

// In the PiP mirror this page runs in an iframe with a pipDepth param; used
// to run a lighter scene there.
const pipParams = new URLSearchParams(window.location.search);
const pipDepth = parseInt(pipParams.get("pipDepth") || "0", 10);
const isPip = pipDepth > 0;

let initialized = false; // scene has been built
let running = false; // animation loop is active

// Astronaut flight state.
let astronaut;
let leftArm, rightArm, leftLeg, rightLeg, thruster;
let astronautYaw = 0;
let astronautPitch = 0;
let bank = 0;
const astronautPos = new THREE.Vector3(0, 0, 0);
const forwardV = new THREE.Vector3(0, 0, -1); // heading direction
const CRUISE_SPEED = 20; // constant gentle forward drift
const BOOST_SPEED = 65; // extra speed while pressing/touching
const TURN_RATE = 1.4; // how fast steering turns the heading (rad/s)
let thrusting = false;

// Pointer steering: target is the raw pointer (-1..1), pointer is smoothed.
const pointer = { x: 0, y: 0 };
const target = { x: 0, y: 0 };

// Star field.
let starGeometry;
const STAR_COUNT = isPip ? 120 : 500;
const STAR_HALF = 700; // stars wrap inside this cube around the camera

// Decorative objects.
let galaxies = [];
let planets = [];
const DECO_MID = 700; // respawn distance around the camera
const DECO_FAR = 2000; // beyond this, recycle back around the camera

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---- Scene setup ----------------------------------------------------------

function initScene() {
  container = document.getElementById("space-container");
  if (!container) return;
  const w = window.innerWidth;
  const h = window.innerHeight;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, w / h, 0.1, 6000);

  const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.3);
  sunLight.position.set(300, 220, 400);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x2a3a5a, 0.7));

  // Cap pixel ratio to 1 and prefer the low-power GPU.
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setSize(w, h);
  renderer.setPixelRatio(1);
  container.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  createStarField();
  createDecorations();
  createAstronaut();
  placeCameraBehind();

  window.addEventListener("resize", onResize);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerUp, { passive: true });
}

function enterSpace() {
  if (!initialized) {
    initScene();
    initialized = true;
  }
  if (!container) return;
  container.style.display = "block";
  onResize();
  if (!running) {
    running = true;
    clock.start();
    animate();
  }
}

function exitSpace() {
  running = false;
  if (container) container.style.display = "none";
}

// scripts.js toggles the mode and fires this event.
window.addEventListener("spacemodechange", (e) => {
  if (e.detail && e.detail.active) enterSpace();
  else exitSpace();
});

// ---- Star field -----------------------------------------------------------

function createStarField() {
  starGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(STAR_COUNT * 3);
  const angles = new Float32Array(STAR_COUNT);
  const colors = new Float32Array(STAR_COUNT * 3);
  const scales = new Float32Array(STAR_COUNT);

  // Star colors.
  const STAR_TINTS = [
    [1.0, 1.0, 1.0], // white
    [0.72, 0.85, 1.0], // icy blue
    [0.55, 0.7, 1.0], // deep blue
    [0.6, 1.0, 1.0], // cyan
    [0.5, 0.95, 0.82], // teal
    [0.7, 1.0, 0.7], // green
    [1.0, 0.95, 0.78], // warm gold
    [1.0, 0.82, 0.6], // amber
    [1.0, 0.68, 0.42], // orange
    [1.0, 0.6, 0.6], // red
    [1.0, 0.68, 0.9], // pink
    [0.85, 0.62, 1.0], // violet
    [0.8, 0.8, 1.0], // lavender
  ];

  for (let i = 0; i < STAR_COUNT; i++) {
    positions[i * 3] = (Math.random() * 2 - 1) * STAR_HALF;
    positions[i * 3 + 1] = (Math.random() * 2 - 1) * STAR_HALF;
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * STAR_HALF;
    angles[i] = Math.random() * Math.PI * 2;

    const tint = STAR_TINTS[Math.floor(Math.random() * STAR_TINTS.length)];
    const jitter = 0.1;
    colors[i * 3] = Math.min(1, tint[0] + (Math.random() - 0.5) * jitter);
    colors[i * 3 + 1] = Math.min(1, tint[1] + (Math.random() - 0.5) * jitter);
    colors[i * 3 + 2] = Math.min(1, tint[2] + (Math.random() - 0.5) * jitter);
    scales[i] = 0.55 + Math.random() * 1.1;
  }

  starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  starGeometry.setAttribute("angle", new THREE.BufferAttribute(angles, 1));
  starGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  starGeometry.setAttribute("sizeScale", new THREE.BufferAttribute(scales, 1));

  const starMaterial = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: {
      pointTexture: { value: createStarTexture() },
      size: { value: 40.0 },
    },
    vertexShader: `
        attribute float angle; attribute vec3 color; attribute float sizeScale;
        varying float vAngle; varying vec3 vColor; uniform float size;
        void main() {
          vAngle = angle;
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * sizeScale * (300.0 / -mvPosition.z);
        }
      `,
    fragmentShader: `
        uniform sampler2D pointTexture; varying float vAngle; varying vec3 vColor;
        void main() {
          float s = sin(vAngle); float c = cos(vAngle);
          vec2 rotatedUV = vec2(
            c * (gl_PointCoord.x - 0.5) + s * (gl_PointCoord.y - 0.5) + 0.5,
            c * (gl_PointCoord.y - 0.5) - s * (gl_PointCoord.x - 0.5) + 0.5
          );
          vec4 texColor = texture2D(pointTexture, rotatedUV);
          gl_FragColor = vec4(texColor.rgb * vColor, texColor.a);
        }
      `,
  });

  scene.add(new THREE.Points(starGeometry, starMaterial));
}

// Star texture: a glow, four spikes, and a bright core.
function createStarTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const cx = 32;
  const cy = 32;

  const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 28);
  glowGrad.addColorStop(0, "rgba(235, 245, 255, 1.0)");
  glowGrad.addColorStop(0.2, "rgba(120, 180, 255, 0.4)");
  glowGrad.addColorStop(0.6, "rgba(70, 130, 240, 0.08)");
  glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.fill();

  function drawSpikePair(angleInDegrees, length, opacity) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((angleInDegrees * Math.PI) / 180);
    const spikeGrad = ctx.createLinearGradient(-length / 2, 0, length / 2, 0);
    spikeGrad.addColorStop(0, "rgba(180, 210, 255, 0)");
    spikeGrad.addColorStop(0.5, `rgba(200, 225, 255, ${opacity})`);
    spikeGrad.addColorStop(1, "rgba(180, 210, 255, 0)");
    ctx.fillStyle = spikeGrad;
    ctx.fillRect(-length / 2, -0.75, length, 1.5);
    ctx.restore();
  }

  drawSpikePair(0, 56, 0.25);
  drawSpikePair(90, 56, 0.25);
  drawSpikePair(30, 70, 0.95);
  drawSpikePair(150, 70, 0.95);

  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 3);
  coreGrad.addColorStop(0, "rgba(255, 255, 255, 1.0)");
  coreGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

// Wrap stars that leave the cube back to the other side, so the field
// surrounds the camera no matter which way it flies.
function updateStarField() {
  const p = starGeometry.attributes.position.array;
  const cam = camera.position;
  for (let i = 0; i < STAR_COUNT; i++) {
    for (let a = 0; a < 3; a++) {
      const idx = i * 3 + a;
      const d = p[idx] - cam.getComponent(a);
      if (d > STAR_HALF) p[idx] -= STAR_HALF * 2;
      else if (d < -STAR_HALF) p[idx] += STAR_HALF * 2;
    }
  }
  starGeometry.attributes.position.needsUpdate = true;
}

// ---- Galaxies and planets -------------------------------------------------

// Galaxy texture: a few soft color blobs and a bright core. `core` and `mid`
// are "r,g,b" strings.
function createGalaxyTexture(core, mid) {
  const size = 160;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const cx = size / 2;
  const cy = size / 2;

  ctx.globalCompositeOperation = "lighter";
  const blobs = 4;
  for (let i = 0; i < blobs; i++) {
    const angle = (i / blobs) * Math.PI * 2 + Math.random() * 0.6;
    const dist = size * 0.12 * Math.random();
    const bx = cx + Math.cos(angle) * dist;
    const by = cy + Math.sin(angle) * dist * 0.6;
    const r = size * (0.28 + Math.random() * 0.14);
    const grad = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    grad.addColorStop(0, `rgba(${mid}, 0.55)`);
    grad.addColorStop(0.6, `rgba(${mid}, 0.18)`);
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.16);
  coreGrad.addColorStop(0, `rgba(${core}, 0.95)`);
  coreGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.16, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = "source-over";
  return new THREE.CanvasTexture(canvas);
}

// Planet surface texture: base color with random splotches and bands.
function createPlanetSurfaceTexture(base) {
  const width = 256;
  const height = 128;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = `rgb(${base})`;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 45; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = 6 + Math.random() * 22;
    const shade = Math.random() > 0.5 ? "0,0,0" : "255,255,255";
    const alpha = 0.04 + Math.random() * 0.1;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${shade}, ${alpha})`);
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 6; i++) {
    const y = Math.random() * height;
    const h = 2 + Math.random() * 6;
    const shade = Math.random() > 0.5 ? "0,0,0" : "255,255,255";
    ctx.fillStyle = `rgba(${shade}, 0.05)`;
    ctx.fillRect(0, y, width, h);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

// Planet ring texture: a banded gradient.
function createRingTexture(ringRGB) {
  const height = 64;
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, `rgba(${ringRGB}, 0)`);
  grad.addColorStop(0.12, `rgba(${ringRGB}, 0.7)`);
  grad.addColorStop(0.28, `rgba(${ringRGB}, 0.2)`);
  grad.addColorStop(0.45, `rgba(${ringRGB}, 0.65)`);
  grad.addColorStop(0.6, `rgba(${ringRGB}, 0.15)`);
  grad.addColorStop(0.8, `rgba(${ringRGB}, 0.55)`);
  grad.addColorStop(1, `rgba(${ringRGB}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return new THREE.CanvasTexture(canvas);
}

// Glowing atmosphere shell around a planet.
function createAtmosphereMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { glowColor: { value: new THREE.Color(color) } },
    vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
    fragmentShader: `
        uniform vec3 glowColor;
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
          gl_FragColor = vec4(glowColor, 1.0) * intensity;
        }
      `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
}

function mixRGB(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}

// Blend two random colors from a palette.
function randomHue(palette) {
  const a = palette[Math.floor(Math.random() * palette.length)];
  const b = palette[Math.floor(Math.random() * palette.length)];
  return mixRGB(a, b, Math.random());
}

const NEBULA_PALETTE = [
  [255, 90, 190],
  [90, 180, 255],
  [255, 150, 70],
  [140, 255, 210],
  [200, 120, 255],
  [255, 210, 90],
];

const PLANET_PALETTE = [
  [201, 163, 126],
  [143, 184, 230],
  [232, 201, 138],
  [169, 142, 224],
  [233, 233, 238],
  [200, 120, 90],
  [120, 200, 160],
  [230, 180, 220],
  [150, 150, 255],
  [255, 210, 140],
];

// Random unit vector.
function randomDir() {
  const u = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a));
}

// Put an object at a random spot around the camera, biased forward so things
// keep appearing ahead.
function placeDeco(obj, biasForward) {
  const dir = randomDir();
  if (biasForward) dir.addScaledVector(forwardV, 0.8).normalize();
  const dist = DECO_MID + Math.random() * (DECO_FAR * 0.85 - DECO_MID);
  const origin = camera ? camera.position : astronautPos;
  obj.position.copy(origin).addScaledVector(dir, dist);
}

function createDecorations() {
  const GALAXY_COUNT = isPip ? 3 : 5;
  const PLANET_COUNT = isPip ? 4 : 8;

  // Shared geometry for all planets.
  const sphereGeometry = new THREE.SphereGeometry(1, 16, 16);
  const atmosphereGeometry = new THREE.SphereGeometry(1, 16, 16);

  for (let i = 0; i < GALAXY_COUNT; i++) {
    const mid = randomHue(NEBULA_PALETTE);
    const core = mixRGB(mid, [255, 255, 255], 0.55 + Math.random() * 0.3);
    const material = new THREE.SpriteMaterial({
      map: createGalaxyTexture(core.join(","), mid.join(",")),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.5 + Math.random() * 0.35,
      rotation: Math.random() * Math.PI * 2,
    });
    const sprite = new THREE.Sprite(material);
    const scale = 260 + Math.random() * 320;
    sprite.scale.set(scale, scale, 1);
    scene.add(sprite);
    galaxies.push({ sprite, material, spin: (Math.random() - 0.5) * 0.06 });
  }

  for (let i = 0; i < PLANET_COUNT; i++) {
    const base = randomHue(PLANET_PALETTE);
    const atmosphere = mixRGB(base, [255, 255, 255], 0.35 + Math.random() * 0.3);
    const ring =
      Math.random() < 0.4
        ? mixRGB(base, [255, 255, 255], 0.4 + Math.random() * 0.3)
        : null;

    const group = new THREE.Group();

    // Lambert is cheaper than Phong and looks the same here.
    const sphereMesh = new THREE.Mesh(
      sphereGeometry,
      new THREE.MeshLambertMaterial({
        map: createPlanetSurfaceTexture(base.join(",")),
      }),
    );
    group.add(sphereMesh);

    const atmosphereMesh = new THREE.Mesh(
      atmosphereGeometry,
      createAtmosphereMaterial(`rgb(${atmosphere.join(",")})`),
    );
    atmosphereMesh.scale.set(1.12, 1.12, 1.12);
    group.add(atmosphereMesh);

    if (ring) {
      const ringMesh = new THREE.Mesh(
        new THREE.RingGeometry(
          1.5 + Math.random() * 0.3,
          2.3 + Math.random() * 0.6,
          32,
        ),
        new THREE.MeshBasicMaterial({
          map: createRingTexture(ring.join(",")),
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: false,
        }),
      );
      ringMesh.rotation.x = Math.PI / 2.4 + (Math.random() - 0.5) * 0.3;
      group.add(ringMesh);
    }

    group.rotation.x = (Math.random() - 0.5) * 0.4;
    group.rotation.z = (Math.random() - 0.5) * 0.5;

    const scale = 40 + Math.random() * 90;
    group.scale.set(scale, scale, scale);
    scene.add(group);
    planets.push({ group, spin: (Math.random() - 0.5) * 0.25 });
  }

  for (const g of galaxies) placeDeco(g.sprite, false);
  for (const p of planets) placeDeco(p.group, false);
}

// Spin the planets/galaxies and recycle far ones back around the camera.
function updateDecorations(dt) {
  const cam = camera.position;
  for (const g of galaxies) {
    g.material.rotation += g.spin * dt;
    if (g.sprite.position.distanceTo(cam) > DECO_FAR) placeDeco(g.sprite, true);
  }
  for (const p of planets) {
    p.group.rotation.y += p.spin * dt;
    if (p.group.position.distanceTo(cam) > DECO_FAR) placeDeco(p.group, true);
  }
}

// ---- Astronaut ------------------------------------------------------------

// Build the astronaut from basic shapes. It faces -Z (the visor side).
// Colors match images/astronaut.png.
function createAstronaut() {
  const white = new THREE.MeshStandardMaterial({
    color: 0xf4f4f7,
    roughness: 0.35,
    metalness: 0.05,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x0c2233,
    roughness: 0.08,
    metalness: 0.9,
    emissive: 0x0b2f45,
    emissiveIntensity: 0.5,
  });
  const orange = new THREE.MeshStandardMaterial({
    color: 0xff9d1c,
    roughness: 0.4,
    metalness: 0.1,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x14161a,
    roughness: 0.5,
  });
  const gray = new THREE.MeshStandardMaterial({
    color: 0xd7d9de,
    roughness: 0.5,
    metalness: 0.1,
  });
  const sole = new THREE.MeshStandardMaterial({ color: 0xc9cbe6, roughness: 0.6 });

  const mesh = (geo, mat, pos, rot) => {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    return m;
  };

  astronaut = new THREE.Group();

  // Helmet: white shell, dark visor poking out the front, orange trim ring.
  astronaut.add(mesh(new THREE.SphereGeometry(0.62, 24, 24), white, [0, 0.62, 0.05]));
  astronaut.add(mesh(new THREE.SphereGeometry(0.5, 24, 24), visorMat, [0, 0.6, -0.18]));
  astronaut.add(
    mesh(new THREE.TorusGeometry(0.47, 0.05, 12, 32), orange, [0, 0.58, -0.28], [
      -0.25, 0, 0,
    ]),
  );

  // Body and life-support backpack.
  const torso = mesh(new THREE.SphereGeometry(0.5, 20, 20), white, [0, -0.12, 0]);
  torso.scale.set(1, 1.05, 0.9);
  astronaut.add(torso);
  astronaut.add(mesh(new THREE.BoxGeometry(0.55, 0.6, 0.28), white, [0, 0.08, 0.42]));
  astronaut.add(mesh(new THREE.BoxGeometry(0.4, 0.42, 0.06), gray, [0, 0.08, 0.57]));

  // Chest control box with orange buttons.
  astronaut.add(mesh(new THREE.BoxGeometry(0.36, 0.3, 0.16), gray, [0, -0.06, -0.42]));
  for (const [bx, by] of [
    [-0.09, 0.02],
    [0.09, 0.02],
    [-0.09, -0.08],
    [0.09, -0.08],
  ]) {
    astronaut.add(
      mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10), orange, [bx, by - 0.04, -0.5], [
        Math.PI / 2,
        0,
        0,
      ]),
    );
  }

  // Limbs as sub-groups so they can move. Cylinders + spheres, since r128
  // has no CapsuleGeometry.
  const limb = (len) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.14, 0.13, len, 12), white, [0, -len / 2, 0]));
    g.add(mesh(new THREE.TorusGeometry(0.14, 0.03, 8, 16), dark, [0, -len * 0.55, 0]));
    return g;
  };

  leftArm = limb(0.5);
  leftArm.position.set(0.48, 0.05, 0);
  leftArm.rotation.z = 0.7;
  leftArm.add(mesh(new THREE.SphereGeometry(0.15, 14, 14), white, [0, -0.56, 0]));
  astronaut.add(leftArm);

  rightArm = limb(0.5);
  rightArm.position.set(-0.48, 0.05, 0);
  rightArm.rotation.z = -0.7;
  rightArm.add(mesh(new THREE.SphereGeometry(0.15, 14, 14), white, [0, -0.56, 0]));
  astronaut.add(rightArm);

  const leg = () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.55, 12), white, [0, -0.28, 0]));
    g.add(mesh(new THREE.TorusGeometry(0.17, 0.03, 8, 16), dark, [0, -0.2, 0]));
    g.add(mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 16), dark, [0, -0.32, 0]));
    g.add(mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 16), orange, [0, -0.44, 0]));
    // Boot.
    g.add(mesh(new THREE.BoxGeometry(0.26, 0.16, 0.36), white, [0, -0.62, -0.06]));
    g.add(mesh(new THREE.BoxGeometry(0.28, 0.06, 0.4), sole, [0, -0.71, -0.06]));
    return g;
  };

  // One leg forward, one back.
  leftLeg = leg();
  leftLeg.position.set(0.2, -0.55, 0);
  leftLeg.rotation.x = -0.5;
  astronaut.add(leftLeg);

  rightLeg = leg();
  rightLeg.position.set(-0.2, -0.55, 0);
  rightLeg.rotation.x = 0.35;
  astronaut.add(rightLeg);

  // Light on the astronaut's back, the side the camera sees.
  const keyLight = new THREE.PointLight(0xffffff, 0.9, 26);
  keyLight.position.set(0.4, 1.3, 1.6);
  astronaut.add(keyLight);

  // Thruster glow behind the astronaut; fades in when boosting.
  thruster = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createStarTexture(),
      color: 0x7fbfff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    }),
  );
  thruster.position.set(0, -0.4, 0.7);
  thruster.scale.set(1.2, 1.2, 1);
  astronaut.add(thruster);

  scene.add(astronaut);
}

// ---- Controls -------------------------------------------------------------

function onPointerMove(e) {
  if (!running) return;
  target.x = (e.clientX / window.innerWidth) * 2 - 1;
  target.y = -((e.clientY / window.innerHeight) * 2 - 1);
}

function onPointerDown(e) {
  if (!running) return;
  thrusting = true;
  target.x = (e.clientX / window.innerWidth) * 2 - 1;
  target.y = -((e.clientY / window.innerHeight) * 2 - 1);
}

function onPointerUp() {
  thrusting = false;
}

// Lets the PiP mirror steer this copy's astronaut.
window.__spaceMirror = {
  setPointer(x, y) {
    target.x = x;
    target.y = y;
  },
};

function placeCameraBehind() {
  camera.position
    .copy(astronautPos)
    .addScaledVector(forwardV, -5)
    .add(new THREE.Vector3(0, 2.2, 0));
  camera.lookAt(astronautPos.x, astronautPos.y + 0.5, astronautPos.z);
}

// ---- Render loop ----------------------------------------------------------

function animate() {
  if (!running) return;
  requestAnimationFrame(animate);
  if (document.hidden) return;

  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.getElapsedTime();

  // Smooth the pointer.
  pointer.x += (target.x - pointer.x) * Math.min(1, dt * 5);
  pointer.y += (target.y - pointer.y) * Math.min(1, dt * 5);

  // Update the heading and forward vector from the pointer.
  astronautYaw -= pointer.x * TURN_RATE * dt;
  astronautPitch = clamp(astronautPitch + pointer.y * TURN_RATE * dt, -1.2, 1.2);
  const cp = Math.cos(astronautPitch);
  forwardV
    .set(-Math.sin(astronautYaw) * cp, Math.sin(astronautPitch), -Math.cos(astronautYaw) * cp)
    .normalize();

  const speed = CRUISE_SPEED + (thrusting ? BOOST_SPEED : 0);
  astronautPos.addScaledVector(forwardV, speed * dt);

  // Bob the astronaut around so it floats in place.
  astronaut.position.set(
    astronautPos.x + Math.sin(t * 0.7) * 0.25 + Math.sin(t * 1.7) * 0.1,
    astronautPos.y + Math.sin(t * 1.1) * 0.22 + Math.cos(t * 0.5) * 0.14,
    astronautPos.z + Math.sin(t * 0.9) * 0.16,
  );

  // Face the travel direction, then add banking and a slow tumble.
  astronaut.lookAt(
    astronaut.position.x - forwardV.x,
    astronaut.position.y - forwardV.y,
    astronaut.position.z - forwardV.z,
  );
  bank += (-pointer.x * 0.6 - bank) * Math.min(1, dt * 4);
  astronaut.rotateZ(bank + Math.sin(t * 0.5) * 0.12);
  astronaut.rotateX(Math.sin(t * 0.8) * 0.16);
  astronaut.rotateY(Math.sin(t * 0.6) * 0.2);

  // Move the limbs, more when boosting.
  const amp = thrusting ? 0.5 : 0.28;
  leftArm.rotation.x = Math.sin(t * 2.2) * amp;
  leftArm.rotation.z = 0.7 + Math.sin(t * 1.6) * 0.25;
  rightArm.rotation.x = Math.sin(t * 2.2 + 1.1) * amp;
  rightArm.rotation.z = -0.7 - Math.sin(t * 1.6 + 0.5) * 0.25;
  leftLeg.rotation.x = -0.5 + Math.sin(t * 1.9 + 0.7) * amp;
  rightLeg.rotation.x = 0.35 + Math.sin(t * 1.9) * amp;
  thruster.material.opacity +=
    ((thrusting ? 0.9 : 0) - thruster.material.opacity) * Math.min(1, dt * 8);

  updateStarField();
  updateDecorations(dt);

  // Camera follows behind and above the astronaut.
  const desired = astronautPos
    .clone()
    .addScaledVector(forwardV, -5)
    .add(new THREE.Vector3(0, 2.2, 0));
  camera.position.lerp(desired, Math.min(1, dt * 3));
  camera.lookAt(astronautPos.x, astronautPos.y + 0.5, astronautPos.z);

  renderer.render(scene, camera);
}

function onResize() {
  if (!renderer) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
