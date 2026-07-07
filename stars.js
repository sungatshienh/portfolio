// ===== Three.js core objects (set up once in init()) =====
let scene, camera, renderer, clock;

// ===== Picture-in-picture mirror detection =====
// When this page is loaded inside the little PiP frame (see scripts.js), the
// iframe's src has a `pipDepth` query param. We use that to (a) run a lighter
// scene inside the mirror for performance, and (b) know how many more nested
// mirrors are still allowed before we stop recursing.
const pipParams = new URLSearchParams(window.location.search);
const pipDepth = parseInt(pipParams.get("pipDepth") || "0", 10);
const isPip = pipDepth > 0;

// ===== Star field settings =====
let stars, starGeometry, starPositions, velocities, starAngles;
const count = isPip ? 180 : 300; // how many stars (fewer inside the small PiP mirror)
const speed = 10; // how fast stars drift toward the camera
const FIELD_RADIUS = 1000; // how wide/tall the star field spawns around the camera

// ===== Camera base position =====
// The camera sits here on the normal page (only pointer parallax/idle drift
// move it slightly). Scrolling the page does NOT move it - diving through
// space only happens in explore mode, via wheel/pinch (see moveAlongLook).
const BASE_Z = 150;

// ===== Mouse / touch look-around =====
let pointer = { x: 0, y: 0 }; // smoothed pointer position (-1 to 1)
let target = { x: 0, y: 0 }; // raw pointer position, updated on move

// ===== Explore mode: wheel / pinch moves you forward-backward =====
const WHEEL_SENSITIVITY = 0.5; // how far one wheel "tick" moves you
const PINCH_SENSITIVITY = 0.7; // how far a pinch gesture moves you
let pinchDist = null; // tracks distance between two fingers for pinch-zoom

// ===== Decorative background objects =====
let galaxies = []; // flat glowing nebula sprites
let planets = []; // real 3D lit sphere planets (with optional rings)

// Runs once on page load: builds the scene, camera, lights, and objects,
// wires up all the input listeners, then starts the animate() loop.
function init() {
  const container = document.getElementById("star-container");
  if (!container) return;
  const w = window.innerWidth;
  const h = window.innerHeight;

  scene = new THREE.Scene();
  // 100 = field of view (bigger number = wider/fisheye view). 3000 = draw distance.
  camera = new THREE.PerspectiveCamera(100, w / h, 0.1, 3000);
  camera.position.set(0, 0, BASE_Z);

  // Lighting for the 3D planets only (stars/galaxies glow on their own and
  // ignore these lights). sunLight = the "sun" casting shading/highlights;
  // AmbientLight = soft fill light so the dark side of planets isn't pure black.
  const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.3);
  sunLight.position.set(300, 220, 400);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x1a2a4a, 0.55));

  renderer = new THREE.WebGLRenderer({ antialias: !isPip, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isPip ? 1 : 2));
  container.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  createStarField();
  createDecorations();

  window.addEventListener("resize", onResize);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("deviceorientation", onDeviceOrientation, {
    passive: true,
  });
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onTouchEnd, { passive: true });

  if (
    window.DeviceOrientationEvent &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    const askPermission = () => {
      DeviceOrientationEvent.requestPermission().catch(() => {});
    };
    window.addEventListener("touchend", askPermission, { once: true });
  }

  animate();
}

// Builds the 300 flying background stars: their positions, colors, sizes,
// and the shader that draws each one as a glowing 4-point sparkle.
function createStarField() {
  starGeometry = new THREE.BufferGeometry();
  starPositions = new Float32Array(count * 3);
  velocities = new Float32Array(count);
  starAngles = new Float32Array(count);

  const starColors = new Float32Array(count * 3);
  const starScales = new Float32Array(count);
  // A spread of star "temperatures" so the field isn't visually uniform:
  // mostly white-blue with occasional warm amber/red and cool icy outliers.
  const STAR_TINTS = [
    [1.0, 1.0, 1.0],
    [0.75, 0.85, 1.0],
    [0.65, 0.78, 1.0],
    [1.0, 0.92, 0.78],
    [1.0, 0.82, 0.65],
    [1.0, 0.75, 0.75],
  ];

  for (let i = 0; i < count; i++) {
    starPositions[i * 3] = (Math.random() * 2 - 1) * FIELD_RADIUS;
    starPositions[i * 3 + 1] = (Math.random() * 2 - 1) * FIELD_RADIUS;
    starPositions[i * 3 + 2] = BASE_Z - Math.random() * 400;
    velocities[i] = speed + Math.random() * 2;
    starAngles[i] = Math.random() * Math.PI * 2;

    const tint = STAR_TINTS[Math.floor(Math.random() * STAR_TINTS.length)];
    const jitter = 0.06;
    starColors[i * 3] = Math.min(1, tint[0] + (Math.random() - 0.5) * jitter);
    starColors[i * 3 + 1] = Math.min(
      1,
      tint[1] + (Math.random() - 0.5) * jitter,
    );
    starColors[i * 3 + 2] = Math.min(
      1,
      tint[2] + (Math.random() - 0.5) * jitter,
    );
    starScales[i] = 0.55 + Math.random() * 1.1;
  }

  starGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(starPositions, 3),
  );
  starGeometry.setAttribute("angle", new THREE.BufferAttribute(starAngles, 1));
  starGeometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
  starGeometry.setAttribute(
    "sizeScale",
    new THREE.BufferAttribute(starScales, 1),
  );

  const texture = createStarTexture();

  const starMaterial = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: { pointTexture: { value: texture }, size: { value: 40.0 } },
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

  stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);
}

// Draws one star's look (glow + 4 light spikes + bright core) onto a small
// canvas, used as the texture for every star point. Edit the color values
// here to change what a star looks like up close.
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

// Draws one nebula/galaxy sprite: a few overlapping soft color blobs plus a
// bright core, all in one texture. `core` and `mid` are "r,g,b" strings.
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

// Draws a planet's surface color texture: a base color plus random
// splotches/bands for texture. `base` is an "r,g,b" string.
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

// Draws a thin banded gradient used as the texture for a planet's ring
// (a tall strip; the ring geometry wraps it around in a circle).
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

// Creates the soft glowing "atmosphere" shell that sits just outside each
// planet's surface, brightest around the edges (like real atmospheric haze).
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

// Blends two [r,g,b] colors together. t=0 -> color a, t=1 -> color b.
function mixRGB(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}

// Picks two random colors from a palette and blends them, so every galaxy
// or planet gets its own unique in-between color instead of a repeated one.
function randomHue(palette) {
  const a = palette[Math.floor(Math.random() * palette.length)];
  const b = palette[Math.floor(Math.random() * palette.length)];
  return mixRGB(a, b, Math.random());
}

// Add/remove/edit colors here to change the range of nebula colors used.
const NEBULA_PALETTE = [
  [255, 90, 190],
  [90, 180, 255],
  [255, 150, 70],
  [140, 255, 210],
  [200, 120, 255],
  [255, 210, 90],
];

// Add/remove/edit colors here to change the range of planet surface colors.
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

// Creates all the galaxy sprites and planet spheres, gives each one a
// unique random color/size/tilt, and scatters them out into the scene.
function createDecorations() {
  const GALAXY_COUNT = isPip ? 3 : 6; // how many nebula sprites
  const PLANET_COUNT = isPip ? 4 : 9; // how many planets

  for (let i = 0; i < GALAXY_COUNT; i++) {
    const mid = randomHue(NEBULA_PALETTE);
    const core = mixRGB(mid, [255, 255, 255], 0.55 + Math.random() * 0.3);
    const texture = createGalaxyTexture(core.join(","), mid.join(","));
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.5 + Math.random() * 0.35,
      rotation: Math.random() * Math.PI * 2,
    });
    const sprite = new THREE.Sprite(material);
    const scale = 120 + Math.random() * 200;
    sprite.scale.set(scale, scale, 1);
    scene.add(sprite);
    galaxies.push({ sprite, material, spin: (Math.random() - 0.5) * 0.06 });
  }

  for (let i = 0; i < PLANET_COUNT; i++) {
    const base = randomHue(PLANET_PALETTE);
    const atmosphere = mixRGB(base, [255, 255, 255], 0.35 + Math.random() * 0.3);
    const hasRing = Math.random() < 0.4;
    const ring = hasRing
      ? mixRGB(base, [255, 255, 255], 0.4 + Math.random() * 0.3)
      : null;

    const group = new THREE.Group();

    const sphereMat = new THREE.MeshPhongMaterial({
      map: createPlanetSurfaceTexture(base.join(",")),
      shininess: 6 + Math.random() * 40,
      specular: new THREE.Color("rgb(120,150,200)"),
    });
    const sphereMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 32),
      sphereMat,
    );
    group.add(sphereMesh);

    const atmosphereMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.12, 32, 32),
      createAtmosphereMaterial(`rgb(${atmosphere.join(",")})`),
    );
    group.add(atmosphereMesh);

    if (ring) {
      const ringMesh = new THREE.Mesh(
        new THREE.RingGeometry(1.5 + Math.random() * 0.3, 2.3 + Math.random() * 0.6, 64),
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

    const scale = 14 + Math.random() * 40;
    group.scale.set(scale, scale, scale);
    scene.add(group);
    planets.push({ group, spin: (Math.random() - 0.5) * 0.25 });
  }

  for (const g of galaxies) respawnDeco(g.sprite, 0, 0, BASE_Z, true);
  for (const p of planets) respawnDeco(p.group, 0, 0, BASE_Z, true);
}

// Moves a galaxy/planet to a fresh random spot ahead of the camera. Called
// once at startup for every object, and again each time one drifts past the
// camera (see updateDecorations) to recycle it back out in front.
function respawnDeco(sprite, camX, camY, camZ, initial) {
  const zSpread = initial ? 1300 : 900;
  const zOffset = initial ? 200 : 150;
  const dist = zOffset + Math.random() * zSpread;

  // Scale the XY spawn spread with distance so objects fill the whole visible
  // frustum (top/bottom/edges included) at every depth, not just a
  // fixed-size box that only covers the screen's middle when far away.
  const fovRad = (camera.fov * Math.PI) / 180;
  const halfHeight = Math.tan(fovRad / 2) * dist;
  const halfWidth = halfHeight * camera.aspect;

  sprite.position.set(
    camX + (Math.random() * 2 - 1) * halfWidth * 1.15,
    camY + (Math.random() * 2 - 1) * halfHeight * 1.15,
    camZ - dist,
  );
}

// Tracks mouse position on screen (-1 to 1) to steer the camera's look
// direction. Used in both normal and explore mode.
function onPointerMove(e) {
  const nx = (e.clientX / window.innerWidth) * 2 - 1;
  const ny = (e.clientY / window.innerHeight) * 2 - 1;
  target.x = nx;
  target.y = -ny;
}

// Same as onPointerMove but for tilting a phone/tablet instead of a mouse.
function onDeviceOrientation(e) {
  if (e.gamma == null || e.beta == null) return;
  const gx = Math.max(-1, Math.min(1, e.gamma / 35));
  const gy = Math.max(-1, Math.min(1, (e.beta - 45) / 35));
  target.x = gx;
  target.y = -gy;
}

// Moves the camera forward/backward along the direction it's currently
// facing. `amount` can be negative (moves backward).
function moveAlongLook(amount) {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  camera.position.addScaledVector(forward, amount);
}

// Explore mode only: scroll wheel / trackpad moves you forward-backward.
function onWheel(e) {
  if (!window.__immersiveMode) return;
  e.preventDefault();
  moveAlongLook(-e.deltaY * WHEEL_SENSITIVITY);
}

// Explore mode only: two-finger pinch on touch devices moves you
// forward-backward (spreading fingers = move forward).
function onTouchMove(e) {
  if (!window.__immersiveMode || e.touches.length !== 2) return;
  e.preventDefault();
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  const dist = Math.hypot(dx, dy);
  if (pinchDist != null) {
    moveAlongLook((dist - pinchDist) * PINCH_SENSITIVITY);
  }
  pinchDist = dist;
}

function onTouchEnd(e) {
  if (e.touches.length < 2) pinchDist = null;
}

// Exposed so the picture-in-picture frame (scripts.js, running in the parent
// page) can directly drive this page's camera when it's loaded inside the
// PiP mirror - this is what makes the mini preview "live react" to the main
// page's mouse movement instead of sitting static.
window.__starsMirror = {
  setPointer(x, y) {
    target.x = x;
    target.y = y;
  },
};

// Runs every frame: pushes each star toward the camera, and recycles any
// star that's drifted too far behind/ahead OR too far sideways from the
// camera. The sideways check matters because moving/zooming can carry the
// camera away from a star's fixed x/y position without ever tripping the
// front/behind distance check - without it, stars can get stranded out of
// view and never come back.
const STAR_MAX_AHEAD = 900; // beyond this distance in front, pull back closer
const STAR_MAX_BEHIND = 80; // beyond this distance behind, send back out front

function updateStarField(dt) {
  const positions = starGeometry.attributes.position.array;
  const camX = camera.position.x;
  const camY = camera.position.y;
  const camZ = camera.position.z;
  const fovRad = (camera.fov * Math.PI) / 180;

  for (let i = 0; i < count; i++) {
    positions[i * 3 + 2] += velocities[i] * dt;

    const aheadDist = camZ - positions[i * 3 + 2]; // positive = in front of camera

    // How wide the camera's actual view cone is AT THIS STAR'S OWN DEPTH -
    // matters because with a wide FOV, the visible cone is much narrower
    // close up than far away. Checking against a fixed radius regardless of
    // depth either wastes near stars off to the side (invisible) or leaves
    // gaps at the far edges, which is what made the field look sparse/empty
    // at some zoom levels.
    const halfHeight = Math.tan(fovRad / 2) * Math.max(1, aheadDist);
    const halfWidth = halfHeight * camera.aspect;
    const dx = positions[i * 3] - camX;
    const dy = positions[i * 3 + 1] - camY;
    const tooFarSideways =
      Math.abs(dx) > halfWidth * 1.3 || Math.abs(dy) > halfHeight * 1.3;

    if (
      aheadDist < -STAR_MAX_BEHIND ||
      aheadDist > STAR_MAX_AHEAD ||
      tooFarSideways
    ) {
      const spawnDist = 150 + Math.random() * 650;
      const spawnHalfHeight = Math.tan(fovRad / 2) * spawnDist;
      const spawnHalfWidth = spawnHalfHeight * camera.aspect;
      positions[i * 3] = camX + (Math.random() * 2 - 1) * spawnHalfWidth;
      positions[i * 3 + 1] = camY + (Math.random() * 2 - 1) * spawnHalfHeight;
      positions[i * 3 + 2] = camZ - spawnDist;
    }
  }
  starGeometry.attributes.position.needsUpdate = true;
}

// Runs every frame: slowly spins each galaxy/planet, and recycles any that
// have drifted too far behind/ahead OR too far sideways from the camera
// (same both-directions + sideways fix as updateStarField).
const DECO_MAX_AHEAD = 2400; // beyond this distance in front, pull back closer
const DECO_MAX_BEHIND = 200; // beyond this distance behind, recycle back out front
const DECO_MAX_SIDEWAYS = 2600; // beyond this lateral distance, recycle back in view

function updateDecorations(dt) {
  const camX = camera.position.x;
  const camY = camera.position.y;
  const camZ = camera.position.z;

  for (const g of galaxies) {
    g.material.rotation += g.spin * dt;
    const aheadDist = camZ - g.sprite.position.z;
    const dx = g.sprite.position.x - camX;
    const dy = g.sprite.position.y - camY;
    const tooFarSideways =
      Math.abs(dx) > DECO_MAX_SIDEWAYS || Math.abs(dy) > DECO_MAX_SIDEWAYS;
    if (
      aheadDist < -DECO_MAX_BEHIND ||
      aheadDist > DECO_MAX_AHEAD ||
      tooFarSideways
    ) {
      respawnDeco(g.sprite, camX, camY, camZ, false);
    }
  }
  for (const p of planets) {
    p.group.rotation.y += p.spin * dt;
    const aheadDist = camZ - p.group.position.z;
    const dx = p.group.position.x - camX;
    const dy = p.group.position.y - camY;
    const tooFarSideways =
      Math.abs(dx) > DECO_MAX_SIDEWAYS || Math.abs(dy) > DECO_MAX_SIDEWAYS;
    if (
      aheadDist < -DECO_MAX_BEHIND ||
      aheadDist > DECO_MAX_AHEAD ||
      tooFarSideways
    ) {
      respawnDeco(p.group, camX, camY, camZ, false);
    }
  }
}

// The main render loop, runs once per frame. Handles: moving stars/decor,
// smoothing the pointer, idle drift, and the two camera modes (normal
// static-position vs. immersive explore mode with wheel/pinch flight), then
// draws the frame.
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05); // time since last frame (capped)
  const t = clock.getElapsedTime(); // total time running, used for idle drift
  const immersive = !!window.__immersiveMode;

  updateStarField(dt);
  updateDecorations(dt);

  // Smooth out the raw pointer position so look direction doesn't feel jumpy.
  pointer.x += (target.x - pointer.x) * Math.min(1, dt * 3);
  pointer.y += (target.y - pointer.y) * Math.min(1, dt * 3);

  // Gentle idle drift so the camera feels like it's hovering in zero-g even
  // when the user isn't moving the pointer or scrolling.
  const idleX = Math.sin(t * 0.35) * 5 + Math.sin(t * 0.13) * 2;
  const idleY = Math.cos(t * 0.3) * 3.5 + Math.sin(t * 0.17) * 1.5;

  if (immersive) {
    // Explore mode: position only moves via wheel/pinch (onWheel/onTouchMove).
    // Here we just point the camera wherever the mouse/finger is looking.
    // 45/27 = how far you can look left-right/up-down; raise to look further.
    const lookX = camera.position.x + pointer.x * 45 + idleX * 0.3;
    const lookY = camera.position.y + pointer.y * 27 + idleY * 0.3;
    camera.lookAt(lookX, lookY, camera.position.z - 120);
  } else {
    // Normal mode: camera stays at its base depth (scrolling the page just
    // scrolls the page, it doesn't move the camera). If explore mode was
    // just exited from somewhere out in space, ease back to BASE_Z instead
    // of snapping.
    camera.position.z += (BASE_Z - camera.position.z) * Math.min(1, dt * 2);

    // Slight parallax: camera also drifts a little left-right/up-down with
    // the pointer. 55/35 = how far it can drift; raise for more parallax.
    const targetX = pointer.x * 55 + idleX;
    const targetY = pointer.y * 35 + idleY;
    camera.position.x += (targetX - camera.position.x) * Math.min(1, dt * 3);
    camera.position.y += (targetY - camera.position.y) * Math.min(1, dt * 3);

    // 12/8 = how far the camera tilts to "look toward" the pointer.
    const lookX = camera.position.x + pointer.x * 12;
    const lookY = camera.position.y + pointer.y * 8;
    camera.lookAt(lookX, lookY, camera.position.z - 100);
  }

  renderer.render(scene, camera);
}

// Keeps the 3D view correctly sized/proportioned when the browser window
// is resized.
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

init();
