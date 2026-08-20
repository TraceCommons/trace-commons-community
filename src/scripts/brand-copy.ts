// Copy buttons on the boilerplate blocks at /about/brand.
//
// Lives in its own module rather than an inline <script> because the
// production CSP in public/_headers sets script-src 'self' with no
// unsafe-inline, and Astro inlines small hoisted scripts.
const buttons = document.querySelectorAll<HTMLButtonElement>("button.copy");

for (const button of buttons) {
  button.addEventListener("click", async () => {
    const targetId = button.dataset.copyTarget;
    if (!targetId) return;
    const source = document.getElementById(targetId);
    if (!source) return;

    const text = source.textContent?.trim() ?? "";
    try {
      await navigator.clipboard.writeText(text);
      const previous = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = previous;
      }, 1500);
    } catch {
      // Clipboard unavailable (insecure context, denied permission). The text
      // is selectable either way, so just select it for the reader.
      const range = document.createRange();
      range.selectNodeContents(source);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  });
}
