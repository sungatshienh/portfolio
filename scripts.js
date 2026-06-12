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