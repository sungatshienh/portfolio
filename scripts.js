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

// Fade content based on distance from the vertical center of the viewport:
// items near the middle are fully opaque, items near the top/bottom edges
// become translucent, and it updates live as the user scrolls.
const MIN_OPACITY = 0.15;
const FADE_STRENGTH = 0.65;
let fadeItems = [];
let fadeTicking = false;

function updateFade() {
  fadeTicking = false;
  const viewportCenter = window.innerHeight / 2;
  const scrollY = window.scrollY;
  const maxScroll = Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight,
  );
  // How much room is left to scroll up / down, normalized to half a viewport.
  // Near the top there's no upward room, so content above center shouldn't
  // fade; near the bottom, content below center shouldn't fade.
  const topRoom = Math.min(1, scrollY / viewportCenter);
  const bottomRoom = Math.min(1, (maxScroll - scrollY) / viewportCenter);
  for (const el of fadeItems) {
    const rect = el.getBoundingClientRect();
    const elementCenter = rect.top + rect.height / 2;
    const diff = elementCenter - viewportCenter;
    const norm = Math.min(1, Math.abs(diff) / viewportCenter);
    const directionRoom = diff < 0 ? topRoom : bottomRoom;
    const opacity = Math.max(
      MIN_OPACITY,
      1 - norm * FADE_STRENGTH * directionRoom,
    );
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

// ===== Picture-in-picture mirror (header dropdown) =====
// The PiP frame is a same-origin iframe pointed at this very page, so it's a
// genuine live second copy of the site. Its element is sized (via JS) to
// match the real browser viewport exactly, so its internal responsive
// layout matches the main page's, then scaled down with a transform to fit
// the small dropdown panel. We forward this page's scroll position, pointer
// position, and explore-mode state into it live so it visually reacts to
// what's happening on the main page instead of sitting static.
//
// Each mirror can load a mirror of itself too, so zooming in feels like an
// endless loop - but only lazily: a mirror's own iframe isn't loaded until
// its dropdown is actually opened (see loadPipMirror), so only ONE new
// level ever loads at a time, right when you ask for it, instead of eagerly
// pre-loading a whole chain of nested pages up front.
const PIP_DISPLAY_WIDTH_MAX = 340; // dropdown panel's on-screen width in CSS px, capped on narrow screens
const MAX_MIRROR_DEPTH = 25; // defensive ceiling only, not a practical limit
const mirrorParams = new URLSearchParams(window.location.search);
const mirrorDepth = parseInt(mirrorParams.get("pipDepth") || "0", 10);
let pipIframeReady = false;
let pipActivated = false; // true once the mirror has been zoomed into

function getPipWindow() {
  const pipIframe = document.getElementById("pip-iframe");
  return pipIframe ? pipIframe.contentWindow : null;
}

// Sizes the iframe element to the real viewport's exact dimensions (so the
// mirrored page renders with identical layout/breakpoints), then scales it
// down with a transform to fit the small on-screen frame. Skipped once the
// mirror has been zoomed into full screen - it just fills the viewport from
// then on and shouldn't be shrunk back down by a later resize.
function updatePipSizing() {
  if (pipActivated) return;
  const pipFrame = document.getElementById("pip-frame");
  const pipIframe = document.getElementById("pip-iframe");
  if (!pipFrame || !pipIframe) return;

  const w = window.innerWidth;
  const h = window.innerHeight;
  const displayWidth = Math.min(PIP_DISPLAY_WIDTH_MAX, w - 40);
  const scale = displayWidth / w;
  const displayHeight = Math.round(h * scale);

  pipFrame.style.width = `${displayWidth}px`;
  pipFrame.style.height = `${displayHeight}px`;
  pipIframe.style.width = `${w}px`;
  pipIframe.style.height = `${h}px`;
  pipIframe.style.transform = `scale(${scale})`;
}

function syncPipScroll() {
  const win = getPipWindow();
  if (!pipIframeReady || !win) return;
  win.scrollTo(0, window.scrollY);
}

document.addEventListener("DOMContentLoaded", () => {
  const pipToggleBtn = document.getElementById("pip-toggle");
  const pipPanel = document.getElementById("pip-panel");
  const pipFrame = document.getElementById("pip-frame");
  const pipIframe = document.getElementById("pip-iframe");
  if (!pipToggleBtn || !pipPanel || !pipFrame || !pipIframe) return;

  // Safety valve only - in practice this is never reached, since each level
  // only loads the next one lazily when its own dropdown is opened (see
  // loadPipMirror below), so there's nothing to cap ahead of time.
  if (mirrorDepth >= MAX_MIRROR_DEPTH) {
    pipToggleBtn.closest(".pip-dropdown").remove();
    return;
  }

  updatePipSizing();

  let pipSrcLoaded = false;
  function loadPipMirror() {
    if (pipSrcLoaded) return;
    pipSrcLoaded = true;
    pipIframe.addEventListener("load", () => {
      pipIframeReady = true;
      updatePipSizing();
      syncPipScroll();
    });
    pipIframe.src = `./index.html?pipDepth=${mirrorDepth + 1}`;
  }

  pipToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = pipPanel.hasAttribute("hidden");
    pipPanel.toggleAttribute("hidden", !open);
    pipToggleBtn.classList.toggle("active", open);
    pipToggleBtn.setAttribute("aria-pressed", String(open));
    pipToggleBtn.setAttribute("aria-expanded", String(open));
    if (open) {
      loadPipMirror();
      updatePipSizing();
      syncPipScroll();
    }
  });

  document.addEventListener("click", (e) => {
    if (
      !pipPanel.hasAttribute("hidden") &&
      !pipPanel.contains(e.target) &&
      !pipToggleBtn.contains(e.target)
    ) {
      pipPanel.setAttribute("hidden", "");
      pipToggleBtn.classList.remove("active");
      pipToggleBtn.setAttribute("aria-pressed", "false");
      pipToggleBtn.setAttribute("aria-expanded", "false");
    }
  });

  // Activating the PiP (click or Enter/Space, since it's a role="button"
  // div): FLIP-animate it from its exact current position/size out to full
  // screen (a real smooth zoom, not a snap), then hand off interaction to
  // the mirror directly - it's already a fully loaded, live copy of the
  // site (down to its own nested PiP), so there's no reload needed. You can
  // just keep "entering" mirrors indefinitely, down to the depth cap.
  const activatePip = () => {
    pipActivated = true;
    const rect = pipFrame.getBoundingClientRect();
    document.body.appendChild(pipFrame);

    // Pin the frame exactly where it visually was...
    pipFrame.style.position = "fixed";
    pipFrame.style.top = `${rect.top}px`;
    pipFrame.style.left = `${rect.left}px`;
    pipFrame.style.width = `${rect.width}px`;
    pipFrame.style.height = `${rect.height}px`;
    pipFrame.style.margin = "0";
    // ...force the browser to register that starting position...
    pipFrame.getBoundingClientRect();

    // ...then animate to fullscreen on the next frame, so the transition
    // has a real "from" state to ease out of instead of jumping straight
    // to fullscreen.
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
window.addEventListener("resize", () => {
  updatePipSizing();
  syncPipScroll();
});

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
