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