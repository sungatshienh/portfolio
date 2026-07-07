let scene, camera, renderer, clock;
let stars, starGeometry, starPositions, velocities, starAngles;
const count = 300;
const speed = 40;

let pointer = { x: 0, y: 0 };
let target = { x: 0, y: 0 };

function init() {
  const container = document.getElementById("star-container");
  if (!container) return;
  const w = window.innerWidth;
  const h = window.innerHeight;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1200);
  camera.position.set(0, 0, 150);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  starGeometry = new THREE.BufferGeometry();
  starPositions = new Float32Array(count * 3);
  velocities = new Float32Array(count);
  starAngles = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    starPositions[i * 3] = (Math.random() * 2 - 1) * 450;
    starPositions[i * 3 + 1] = (Math.random() * 2 - 1) * 450;
    starPositions[i * 3 + 2] = Math.random() * 400;
    velocities[i] = speed + Math.random() * 2;
    starAngles[i] = Math.random() * Math.PI * 2;
  }

  starGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(starPositions, 3),
  );
  starGeometry.setAttribute(
    "angle",
    new THREE.BufferAttribute(starAngles, 1),
  );

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

    const spikeGrad = ctx.createLinearGradient(
      -length / 2,
      0,
      length / 2,
      0,
    );
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

  const texture = new THREE.CanvasTexture(canvas);

  const starMaterial = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: { pointTexture: { value: texture }, size: { value: 40.0 } },
    vertexShader: `
        attribute float angle; varying float vAngle; uniform float size;
        void main() {
          vAngle = angle;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * (300.0 / -mvPosition.z);
        }
      `,
    fragmentShader: `
        uniform sampler2D pointTexture; varying float vAngle;
        void main() {
          float s = sin(vAngle); float c = cos(vAngle);
          vec2 rotatedUV = vec2(
            c * (gl_PointCoord.x - 0.5) + s * (gl_PointCoord.y - 0.5) + 0.5,
            c * (gl_PointCoord.y - 0.5) - s * (gl_PointCoord.x - 0.5) + 0.5
          );
          gl_FragColor = texture2D(pointTexture, rotatedUV);
        }
      `,
  });

  stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);

  window.addEventListener("resize", onResize);
  window.addEventListener("pointermove", onPointerMove, {
    passive: true,
  });
  window.addEventListener("deviceorientation", onDeviceOrientation, {
    passive: true,
  });

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

function onPointerMove(e) {
  const nx = (e.clientX / window.innerWidth) * 2 - 1;
  const ny = (e.clientY / window.innerHeight) * 2 - 1;
  target.x = nx;
  target.y = -ny;
}

function onDeviceOrientation(e) {
  if (e.gamma == null || e.beta == null) return;
  const gx = Math.max(-1, Math.min(1, e.gamma / 35));
  const gy = Math.max(-1, Math.min(1, (e.beta - 45) / 35));
  target.x = gx;
  target.y = -gy;
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  const positions = starGeometry.attributes.position.array;

  for (let i = 0; i < count; i++) {
    positions[i * 3 + 2] += velocities[i] * dt;

    if (positions[i * 3 + 2] > 200) {
      positions[i * 3] = (Math.random() * 2 - 1) * 450;
      positions[i * 3 + 1] = (Math.random() * 2 - 1) * 450;
      positions[i * 3 + 2] = -200;
    }
  }
  starGeometry.attributes.position.needsUpdate = true;

  pointer.x += (target.x - pointer.x) * Math.min(1, dt * 3);
  pointer.y += (target.y - pointer.y) * Math.min(1, dt * 3);

  camera.position.x +=
    (pointer.x * 55 - camera.position.x) * Math.min(1, dt * 3);
  camera.position.y +=
    (pointer.y * 35 - camera.position.y) * Math.min(1, dt * 3);

  camera.lookAt(pointer.x * 12, pointer.y * 8, 0);

  renderer.render(scene, camera);
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

init();
