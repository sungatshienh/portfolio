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
