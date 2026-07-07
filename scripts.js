function openLightbox(src, alt) {
  const lightbox = document.getElementById("lightbox");
  const img = document.getElementById("lightbox-img");
  if (!lightbox || !img) return;
  img.src = src;
  img.alt = alt || "";
  lightbox.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  const lightbox = document.getElementById("lightbox");
  if (!lightbox) return;
  lightbox.classList.remove("active");
  document.body.style.overflow = "";
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".project-image").forEach((img) => {
    img.addEventListener("click", () => openLightbox(img.src, img.alt));
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
});

// Fade content based on where its CENTER sits: if the center is anywhere in
// the middle 70% of the viewport, it's fully opaque, no matter how tall the
// element is or whether its edges poke into the top/bottom bands. Only once
// an element's center itself drifts into the top/bottom 15% does it start
// fading. Also suppressed near the very start/end of the page - if there's
// no more room to scroll in a direction, nothing is actually being hidden
// that way, so don't fade it (otherwise content would stay permanently
// translucent while scrolled all the way up or down).
const MIN_OPACITY = 0.15;
const FADE_ZONE_FRACTION = 0.20;
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

// Immersive "explore space" mode: hides the page UI so the star field behind
// it is unobstructed, and lets stars.js switch the camera into free-fly mode.
window.__immersiveMode = false;

function setImmersiveMode(active) {
  document.body.classList.toggle("immersive-mode", active);
  window.__immersiveMode = active;

  const btn = document.getElementById("space-toggle");
  if (btn) {
    btn.setAttribute("aria-pressed", String(active));
    btn.classList.toggle("active", active);
    const text = active ? "Exit space" : "Explore space";
    btn.setAttribute("aria-label", text);
    btn.title = text;
  }

  window.dispatchEvent(
    new CustomEvent("spacemodechange", { detail: { active } }),
  );

  // Keep the PiP mirror's UI state in sync too (same-origin, so we can call
  // straight into it).
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

// ===== Picture-in-picture mirror (floating dropdown, chevron toggle) =====
// The PiP frame is a same-origin iframe pointed at this very page, so it's a
// genuine live second copy of the site. Clicking the chevron opens it as a
// floating panel under the header (not part of the header's own box). It
// loads lazily - only once first opened - since eagerly running a whole
// second copy of the starfield/Three.js scene in the background at all
// times was the main source of lag. We forward this page's scroll position,
// pointer position, and explore-mode state into it live so it visually
// reacts to what's happening on the main page instead of sitting static.
//
// Clicking the frame itself FLIP-animates it out to fullscreen and hands
// off interaction to the mirror directly (it's already fully loaded, so
// there's no reload needed). Each mirror can load a mirror of itself too,
// so zooming in feels like an endless loop.
const PIP_DISPLAY_WIDTH_MAX = 340; // panel's on-screen width in CSS px, capped on narrow screens
const PIP_DISPLAY_WIDTH_MAX_MOBILE = 170; // smaller cap on phone-size screens
const PIP_MOBILE_BREAKPOINT = 800; // matches the site's existing mobile breakpoint
const MAX_MIRROR_DEPTH = 25; // defensive ceiling only, not a practical limit
const mirrorParams = new URLSearchParams(window.location.search);
const mirrorDepth = parseInt(mirrorParams.get("pipDepth") || "0", 10);
let pipIframeReady = false;
let pipActivated = false; // true once the mirror has been zoomed into fullscreen
let pipOpen = false; // true while the floating panel is open

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

  // Safety valve only - in practice this is never reached, since a mirror
  // only loads one level deeper than wherever it itself was loaded.
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
    pipToggleBtn.setAttribute("aria-pressed", "true");
    pipToggleBtn.setAttribute("aria-expanded", "true");
    pipPanel.hidden = false;
    loadPipMirror();
    applyPipFrameSizing();
    syncPipScroll();
  }

  function closePip() {
    if (!pipOpen) return;
    pipOpen = false;
    pipToggleBtn.classList.remove("active");
    pipToggleBtn.setAttribute("aria-pressed", "false");
    pipToggleBtn.setAttribute("aria-expanded", "false");
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

  // Activating the PiP (click or Enter/Space, since it's a role="button"
  // div): FLIP-animate it from its exact current position/size out to full
  // screen (a real smooth zoom, not a snap), then hand off interaction to
  // the mirror directly. You can just keep "entering" mirrors indefinitely,
  // down to the depth cap.
  const activatePip = () => {
    pipActivated = true;
    const rect = pipFrame.getBoundingClientRect();
    document.body.appendChild(pipFrame);

    pipFrame.style.position = "fixed";
    pipFrame.style.top = `${rect.top}px`;
    pipFrame.style.left = `${rect.left}px`;
    pipFrame.style.width = `${rect.width}px`;
    pipFrame.style.height = `${rect.height}px`;
    pipFrame.style.margin = "0";
    pipFrame.getBoundingClientRect();

    requestAnimationFrame(() => {
      pipFrame.classList.add("zooming");
      pipIframe.style.transform = "scale(1)";
    });

    document.body.classList.add("pip-zooming");

    pipFrame.addEventListener(
      "transitionend",
      () => {
        pipIframe.style.pointerEvents = "auto";
        pipFrame.removeAttribute("role");
        pipFrame.removeAttribute("tabindex");
        pipFrame.style.cursor = "default";
      },
      { once: true },
    );
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
    if (!pipIframeReady || !win || !win.__starsMirror) return;
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -((e.clientY / window.innerHeight) * 2 - 1);
    win.__starsMirror.setPointer(nx, ny);
  },
  { passive: true },
);

// ===== "This Portfolio Website" project card thumbnail =====
// Its "screenshot" is a live iframe of this very page, sized to the real
// viewport and scaled down (via transform) to fit the small thumbnail box -
// same trick as the header PiP mirror, just non-interactive and always
// visible instead of tucked behind a dropdown. Same live-reactivity too:
// forward this page's scroll position and pointer position into it so it
// actually moves/reacts instead of sitting static.
let siteFrameReady = false;

function getSiteFrameWindow() {
  const iframe = document.getElementById("site-frame-iframe");
  return iframe ? iframe.contentWindow : null;
}

function updateSiteFrameSizing() {
  const box = document.getElementById("site-frame-box");
  const iframe = document.getElementById("site-frame-iframe");
  if (!box || !iframe) return;

  const rect = box.getBoundingClientRect();
  if (rect.width === 0) return;

  const w = window.innerWidth;
  const h = window.innerHeight;
  const scale = rect.width / w;

  iframe.style.width = `${w}px`;
  iframe.style.height = `${h}px`;
  iframe.style.transform = `scale(${scale})`;
}

function syncSiteFrameScroll() {
  const win = getSiteFrameWindow();
  if (!siteFrameReady || !win) return;
  win.scrollTo(0, window.scrollY);
}

document.addEventListener("DOMContentLoaded", () => {
  const box = document.getElementById("site-frame-box");
  const iframe = document.getElementById("site-frame-iframe");
  if (!box || !iframe) return;

  // Same depth cap as the header PiP mirror - without this, every nested
  // mirror's own project card would eagerly spawn yet another full copy of
  // the site (with its own WebGL scene) forever, with nothing to stop it.
  if (mirrorDepth >= MAX_MIRROR_DEPTH) {
    box.remove();
    return;
  }

  updateSiteFrameSizing();
  iframe.addEventListener("load", () => {
    siteFrameReady = true;
    updateSiteFrameSizing();
    syncSiteFrameScroll();
  });
  iframe.src = `./index.html?pipDepth=${mirrorDepth + 1}`;
});

window.addEventListener("resize", () => {
  updateSiteFrameSizing();
  syncSiteFrameScroll();
});
window.addEventListener("scroll", syncSiteFrameScroll, { passive: true });

window.addEventListener(
  "pointermove",
  (e) => {
    const win = getSiteFrameWindow();
    if (!siteFrameReady || !win || !win.__starsMirror) return;
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -((e.clientY / window.innerHeight) * 2 - 1);
    win.__starsMirror.setPointer(nx, ny);
  },
  { passive: true },
);
