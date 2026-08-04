const carousel = document.getElementById('rules-carousel');
const slides = Array.from(carousel.querySelectorAll('.slide'));
const indexLabel = document.getElementById('rule-index');

let current = 0;

function show(next) {
    current = (next + slides.length) % slides.length;

    slides.forEach((slide, i) => {
        slide.classList.toggle('is-active', i === current);
    });

    indexLabel.textContent = String(current + 1).padStart(2, '0');
}

carousel.querySelectorAll('.arrow').forEach(button => {
    button.addEventListener('click', () => {
        show(current + Number(button.dataset.dir));
    });
});

carousel.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') {
        show(current - 1);
    } else if (event.key === 'ArrowRight') {
        show(current + 1);
    }
});

show(0);
