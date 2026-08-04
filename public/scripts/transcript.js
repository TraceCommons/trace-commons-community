// The manifesto section. Scroll position drives the pace rather than a timer,
// so the reader controls it, and the same progress value picks the live stanza
// and holds the page inversion.
//
// This replaces site-v2's crawl.js. The pin maths is unchanged; the receding
// perspective plane, the top fade mask and the cue to the score are gone.

(function () {
  const section = document.querySelector("[data-transcript]");
  if (!section) return;

  const pin = section.querySelector(".pin");
  const stage = section.querySelector(".transcript-stage");
  const stanzas = Array.from(section.querySelectorAll(".stanza"));
  const counter = section.querySelector("[data-stanza-counter]");
  if (!pin || !stage || !stanzas.length) return;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const root = document.documentElement;

  // With motion reduced the section is left exactly as the markup renders it:
  // every stanza visible and stacked, nothing pinned, no inversion driven from
  // here. That is the same state the page is in with scripts disabled.
  if (reducedMotion) return;

  section.dataset.mode = "pinned";

  let queued = false;
  let inverted = false;
  let live = -1;

  function place() {
    queued = false;

    const box = pin.getBoundingClientRect();
    const viewport = window.innerHeight;

    // 0 the moment the stage pins to the top, 1 when the pin lets go again
    const travel = Math.max(1, box.height - viewport);
    const progress = Math.min(1, Math.max(0, -box.top / travel));

    // The last stanza is held rather than scrolled past, so the closing line
    // is still on the stage as the pin releases.
    const index = Math.min(
      stanzas.length - 1,
      Math.floor(progress * stanzas.length),
    );

    if (index !== live) {
      live = index;

      stanzas.forEach((el, i) => {
        el.dataset.state = i === index ? "live" : i < index ? "past" : "future";
      });

      if (counter) counter.textContent = String(index + 1).padStart(2, "0");
    }

    const stageBox = stage.getBoundingClientRect();

    // Keyed to how much of the screen the stage covers rather than to pin
    // progress, so black arrives just before it locks and holds until it has
    // genuinely scrolled away, with the closing lines still on it.
    const shouldInvert =
      stageBox.top <= viewport * 0.3 && stageBox.bottom >= viewport * 0.7;

    if (shouldInvert !== inverted) {
      inverted = shouldInvert;
      root.classList.toggle("inverted", inverted);
      if (window.TCGlobe) window.TCGlobe.setInverted(inverted);
    }
  }

  function request() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(place);
  }

  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);
  new ResizeObserver(request).observe(stage);
  place();
})();
