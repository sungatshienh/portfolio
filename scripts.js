// Restores scroll position after a reload triggered by opening the PiP frame.
// Runs before anything else that reads scroll position.
(function restorePipScroll() {
  const saved = sessionStorage.getItem("pipScrollRestore");
  if (saved === null) return;
  sessionStorage.removeItem("pipScrollRestore");
  const y = parseInt(saved, 10);
  if (!Number.isNaN(y)) {
    document.addEventListener("DOMContentLoaded", () => window.scrollTo(0, y));
  }
})();

// Scroll fade: content fades out near the top/bottom edges of the viewport.
const MIN_OPACITY = 0.15;
const FADE_ZONE_FRACTION = 0.2;
let fadeItems = [];
let fadeTicking = false;

function updateFade() {
  fadeTicking = false;
  const viewportHeight = window.innerHeight;
  const topZoneHeight = viewportHeight * FADE_ZONE_FRACTION;
  const bottomZoneStart = viewportHeight * (1 - FADE_ZONE_FRACTION);
  const bottomZoneHeight = viewportHeight - bottomZoneStart;

  const scrollY = window.scrollY;
  const maxScroll = Math.max(
    0,
    document.documentElement.scrollHeight - viewportHeight,
  );
  const topRoom = Math.min(1, scrollY / topZoneHeight);
  const bottomRoom = Math.min(1, (maxScroll - scrollY) / bottomZoneHeight);

  for (const el of fadeItems) {
    const rect = el.getBoundingClientRect();
    const center = rect.top + rect.height / 2;

    let fade = 0;
    if (center < topZoneHeight) {
      fade =
        Math.min(1, Math.max(0, 1 - Math.max(0, center) / topZoneHeight)) *
        topRoom;
    } else if (center > bottomZoneStart) {
      fade =
        Math.min(1, (center - bottomZoneStart) / bottomZoneHeight) *
        bottomRoom;
    }

    const opacity = Math.max(MIN_OPACITY, 1 - fade * (1 - MIN_OPACITY));
    el.style.opacity = opacity.toFixed(3);
  }
}

function requestFadeUpdate() {
  if (fadeTicking) return;
  fadeTicking = true;
  requestAnimationFrame(updateFade);
}

document.addEventListener("DOMContentLoaded", () => {
  fadeItems = Array.from(
    document.querySelectorAll(
      "main > section:not(#projects), #projects > h2, .project-card",
    ),
  );
  for (const el of fadeItems) el.classList.add("scroll-fade");
  updateFade();
  window.addEventListener("scroll", requestFadeUpdate, { passive: true });
  window.addEventListener("resize", requestFadeUpdate, { passive: true });
});

// Immersive "explore space" mode: hides the page UI and lets space.js
// build and run the 3D scene with the controllable astronaut.
window.__immersiveMode = false;

function setImmersiveMode(active) {
  document.body.classList.toggle("immersive-mode", active);
  window.__immersiveMode = active;

  const btn = document.getElementById("space-toggle");
  if (btn) btn.classList.toggle("active", active);

  window.dispatchEvent(
    new CustomEvent("spacemodechange", { detail: { active } }),
  );

  // Keep the PiP mirror's UI state in sync too.
  const pipWin = getPipWindow();
  if (pipWin && typeof pipWin.setImmersiveMode === "function") {
    pipWin.setImmersiveMode(active);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const spaceToggleBtn = document.getElementById("space-toggle");
  if (spaceToggleBtn) {
    spaceToggleBtn.addEventListener("click", () => {
      setImmersiveMode(!document.body.classList.contains("immersive-mode"));
    });
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("immersive-mode")) {
    setImmersiveMode(false);
  }
});

// Picture-in-picture mirror: a same-origin iframe of this page, opened as a
// floating panel from the header chevron. Loads lazily since running a
// second copy of the Three.js scene at all times was the main source of lag.
// Clicking the frame zooms it to fullscreen and hands off interaction to it.
const PIP_DISPLAY_WIDTH_MAX = 340;
const PIP_DISPLAY_WIDTH_MAX_MOBILE = 170;
const PIP_MOBILE_BREAKPOINT = 800;
const MAX_MIRROR_DEPTH = 25; // defensive ceiling, not a practical limit
const mirrorParams = new URLSearchParams(window.location.search);
const mirrorDepth = parseInt(mirrorParams.get("pipDepth") || "0", 10);
let pipIframeReady = false;
let pipActivated = false;
let pipOpen = false;

function getPipWindow() {
  const pipIframe = document.getElementById("pip-iframe");
  return pipIframe ? pipIframe.contentWindow : null;
}

function syncPipScroll() {
  const win = getPipWindow();
  if (!pipIframeReady || !win) return;
  win.scrollTo(0, window.scrollY);
}

function computePipSize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const widthCap =
    w <= PIP_MOBILE_BREAKPOINT
      ? PIP_DISPLAY_WIDTH_MAX_MOBILE
      : PIP_DISPLAY_WIDTH_MAX;
  const displayWidth = Math.min(widthCap, w - 40);
  const scale = displayWidth / w;
  return { displayWidth, displayHeight: Math.round(h * scale), scale, w, h };
}

document.addEventListener("DOMContentLoaded", () => {
  const pipToggleBtn = document.getElementById("pip-toggle");
  const pipPanel = document.getElementById("pip-panel");
  const pipFrame = document.getElementById("pip-frame");
  const pipIframe = document.getElementById("pip-iframe");
  if (!pipToggleBtn || !pipPanel || !pipFrame || !pipIframe) return;

  if (mirrorDepth >= MAX_MIRROR_DEPTH) {
    pipToggleBtn.remove();
    pipPanel.remove();
    return;
  }

  let pipSrcLoaded = false;
  function loadPipMirror() {
    if (pipSrcLoaded) return;
    pipSrcLoaded = true;
    pipIframe.addEventListener("load", () => {
      pipIframeReady = true;
      applyPipFrameSizing();
      syncPipScroll();
    });
    pipIframe.src = `./index.html?pipDepth=${mirrorDepth + 1}`;
  }

  function applyPipFrameSizing() {
    const { displayWidth, displayHeight, scale, w, h } = computePipSize();
    pipFrame.style.width = `${displayWidth}px`;
    pipFrame.style.height = `${displayHeight}px`;
    pipIframe.style.width = `${w}px`;
    pipIframe.style.height = `${h}px`;
    pipIframe.style.transform = `scale(${scale})`;
    return displayHeight;
  }

  function openPip() {
    if (pipOpen) return;
    pipOpen = true;
    pipToggleBtn.classList.add("active");
    pipPanel.hidden = false;
    loadPipMirror();
    applyPipFrameSizing();
    syncPipScroll();
  }

  function closePip() {
    if (!pipOpen) return;
    pipOpen = false;
    pipToggleBtn.classList.remove("active");
    pipPanel.hidden = true;
  }

  pipToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (pipOpen) closePip();
    else openPip();
  });

  document.addEventListener("click", (e) => {
    if (
      pipOpen &&
      !pipPanel.contains(e.target) &&
      !pipToggleBtn.contains(e.target)
    ) {
      closePip();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pipOpen) closePip();
  });

  window.addEventListener("resize", () => {
    if (pipActivated || !pipOpen) return;
    applyPipFrameSizing();
  });

  // Reload the real page instead of animating in place, since the FLIP
  // animate-and-hand-off approach broke on mobile. restorePipScroll (top of
  // this file) puts the scroll position back once the fresh page loads.
  const activatePip = () => {
    pipActivated = true;
    sessionStorage.setItem("pipScrollRestore", String(window.scrollY));
    document.body.classList.add("pip-zooming");
    window.setTimeout(() => {
      window.location.reload();
    }, 200);
  };
  pipFrame.addEventListener("click", activatePip);
  pipFrame.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activatePip();
    }
  });
});

window.addEventListener("scroll", syncPipScroll, { passive: true });

window.addEventListener(
  "pointermove",
  (e) => {
    const win = getPipWindow();
    if (!pipIframeReady || !win || !win.__spaceMirror) return;
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -((e.clientY / window.innerHeight) * 2 - 1);
    win.__spaceMirror.setPointer(nx, ny);
  },
  { passive: true },
);
