function openLightbox(src, alt) {
    const lightbox = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    if (!lightbox || !img) return;
    img.src = src;
    img.alt = alt || '';
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    if (!lightbox) return;
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.project-image').forEach(img => {
        img.addEventListener('click', () => openLightbox(img.src, img.alt));
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
});

document.querySelectorAll('.button').forEach(button => {
    button.addEventListener('mouseenter', () => {
        button.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.2)';
    });

    button.addEventListener('mouseleave', () => {
        button.style.boxShadow = 'none';
    });
});

function toggleMobileMenu() {
    event.preventDefault();
    
    const menu = document.querySelector("nav ul");
    const bars = document.querySelector(".custom-bars");
    const header = document.querySelector("header");
    
    menu.classList.toggle("active");
    bars.classList.toggle("active");
    header.classList.toggle("menu-active");
}

function closeMenuOnOutsideClick(event) {
    const menu = document.querySelector("nav ul");
    const bars = document.querySelector(".custom-bars");
    const header = document.querySelector("header");
    
    if (!menu.contains(event.target) && !bars.contains(event.target) && !header.contains(event.target)) {
        menu.classList.remove("active");
        bars.classList.remove("active");
        header.classList.remove("menu-active");
    }
}

document.addEventListener("click", closeMenuOnOutsideClick);

window.addEventListener('scroll', function () {
    const header = document.getElementById('header');
    if (window.scrollY > 10) {
        header.classList.add('shrunk');
        header.classList.remove('expanded');
    } else {
        header.classList.add('expanded');
        header.classList.remove('shrunk');
    }
});
/* Dim black-and-white TV static */
document.addEventListener('DOMContentLoaded', function tvStatic() {
    const canvas = document.getElementById('tv-static');
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });

    // Render at a low internal resolution and let the browser scale it up.
    // This keeps the grain chunky (like a real CRT) and cheap to draw.
    const SCALE = 3;
    let w, h, imageData, buf32;

    function resize() {
        w = Math.ceil(window.innerWidth / SCALE);
        h = Math.ceil(window.innerHeight / SCALE);
        canvas.width = w;
        canvas.height = h;
        imageData = ctx.createImageData(w, h);
        buf32 = new Uint32Array(imageData.data.buffer);
    }
    window.addEventListener('resize', resize);
    resize();

    // Throttle to ~24fps for that filmic flicker + lower CPU use.
    const FPS = 24;
    let last = 0;
    function draw(now) {
        requestAnimationFrame(draw);
        if (now - last < 1000 / FPS) return;
        last = now;
        for (let i = 0; i < buf32.length; i++) {
            const v = (Math.random() * 255) | 0;      // grayscale value
            buf32[i] = (255 << 24) | (v << 16) | (v << 8) | v; // ABGR
        }
        ctx.putImageData(imageData, 0, 0);
    }
    requestAnimationFrame(draw);
});
