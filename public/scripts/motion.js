// Reveal blocks as they enter the viewport. Anything that never gets observed
// stays visible, so the page still reads with JS off or motion reduced.

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const targets = document.querySelectorAll('.section-head, .thesis, .facts, .pipeline, .carousel, .closing');

if (!prefersReducedMotion && 'IntersectionObserver' in window) {
    targets.forEach(el => el.classList.add('reveal'));

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-in');
            observer.unobserve(entry.target);
        });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    targets.forEach(el => observer.observe(el));
}
