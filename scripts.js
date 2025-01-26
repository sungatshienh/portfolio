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
    document.getElementById("menu").classList.toggle("active");
    const menuToggle = document.querySelector('.custom-bars').classList.toggle("active");;
}

document.addEventListener('click', function (event) {
    const menu = document.getElementById('menu');
    const toggleButton = document.querySelector('.mobile-toggle');
    
    // Check if the clicked element is outside the menu or the toggle button
    if (!menu.contains(event.target) && !toggleButton.contains(event.target)) {
        menu.classList.remove("active");
    }
    if (
        !menuToggle.contains(event.target) && // Click is outside the toggle button
        !navMenu.contains(event.target) // Click is outside the menu
    )
    {
        menuToggle.classList.remove("active");
        navMenu.classList.remove("active");
        
    }
});

