// Anchor scrolling. Done in JS rather than CSS scroll-behavior so the animation
// can be aborted the moment the reader scrolls themselves, which is what makes a
// stalled native smooth scroll feel like a frozen page.

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const OFFSET = 12;

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function scrollToTarget(target) {
    const start = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const end = Math.max(0, Math.min(start + target.getBoundingClientRect().top - OFFSET, maxScroll));
    const distance = end - start;

    if (reducedMotion.matches || Math.abs(distance) < 2) {
        window.scrollTo(0, end);
        return;
    }

    const duration = Math.min(800, Math.max(320, Math.abs(distance) * 0.45));
    let startTime = null;
    let cancelled = false;

    function cancel() { cancelled = true; }

    function cleanup() {
        window.removeEventListener('wheel', cancel);
        window.removeEventListener('touchstart', cancel);
        window.removeEventListener('keydown', cancel);
    }

    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('touchstart', cancel, { passive: true });
    window.addEventListener('keydown', cancel);

    function step(now) {
        if (cancelled) {
            cleanup();
            return;
        }

        if (startTime === null) startTime = now;

        const progress = Math.min(1, (now - startTime) / duration);
        window.scrollTo(0, start + distance * easeInOutCubic(progress));

        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            cleanup();
        }
    }

    requestAnimationFrame(step);
}

document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
        const hash = link.getAttribute('href');
        if (hash === '#') return;

        const target = document.querySelector(hash);
        if (!target) return;

        event.preventDefault();
        scrollToTarget(target);
        history.replaceState(null, '', hash);
    });
});
