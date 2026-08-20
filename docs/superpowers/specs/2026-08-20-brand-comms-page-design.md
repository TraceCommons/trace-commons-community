# Brand and press page

Date: 2026-08-20

## Problem

Trace Commons had no brand assets and no press-facing page. The wordmark existed
only as styled text in the site header, there was no favicon, and anyone writing
about the project had nothing to reproduce and no statement of what the project
does and does not currently claim.

The second half matters more than the first. The homepage is careful to separate
what is enforced today from what is a commitment ("Where we actually are"). A
press kit is exactly where that discipline breaks if it is not written down, so
the page states the project's actual status before it offers any boilerplate.

## Audience

Press and partners: journalists, ecosystem pages, anyone writing about the
project. Not a contributor comms kit and not an internal style guide, though the
colour and type sections are usable as the latter.

## Assets

The mark is **not designed here.** Its geometry and palette are the canonical
ones the desktop clients already draw, transcribed from `trace-commons-server`:

- `assets/mark/mark-{light,dark,glyph-*,template-*}.svg`
- `macos/Sources/TraceCommonsApp/Views/DesignSystem.swift` (palette)
- `docs/superpowers/specs/2026-08-19-icon-pipeline-design.md` (the reasoning)

Two brackets — an opening bracket in green, a closing one in blue — on a
64-unit space, held in a hairline frame inset one unit under a two-unit stroke.
Two treatments that are not interchangeable: the framed full-colour **mark**
for app icons and anywhere it stands alone, and the frameless single-ink
**template stencil** (stroke 8, thicker because it loses the frame holding the
brackets apart) for menu bars and trays where the host recolours it.

The clients render this live from shared geometry rather than loading a file,
so it stays correct at 14px in a tray and at 84px onscreen and follows the
system appearance. `scripts/brand/gen-assets.py` is the packaging-and-press
export of the same numbers, not a second design. Its generated marks are
verified to match the upstream SVGs exactly in path data, colour, and stroke
width. If the geometry changes upstream, change the constants to match — do not
redraw.

The wordmark is the name in the site's Helvetica, bold and uppercase at the
headings' -0.035em tracking, carried as live `<text>` rather than outlines. See
"Which brand system the page documents" below for why.

Output: 10 SVGs (mark, glyph, template, wordmark, lockup, each light and dark),
22 PNGs (512 and 1024px, plus 32px favicons), and `trace-commons-brand.zip`.
PNGs are generated once with `rsvg-convert` and committed, so nothing
rasterises at build time and the build gains no dependency.

## Which brand system the page documents

There are two, and the page has to be honest about that rather than pick a
winner it has no standing to pick.

The **site** runs the site-v2 brand system in `src/styles/brand.css`: black on
white, one teal accent (`#00d4aa`), Helvetica Neue in bold uppercase headings,
2px hairline rules, square corners, no dark mode. That is what a reader looking
at tracecommons.ai sees, so that is what the colour and type sections document
and what this page is styled with — it uses `brand.css`'s own tokens, spacing
scale, `.btn`, `.label`, and table styles rather than introducing a parallel set.

The **mark** is the desktop clients' artwork, and it now uses the site palette
too: the opening bracket is the accent `#00d4aa` and everything else is ink.
It used to be green `#178f70` and blue `#315fba`, borrowed from the status
palette, which meant a green-and-blue logo sat above a teal-and-black page. The
clients moved with it (trace-commons-server, "Converge the mark on the site
palette"), so the logo on this page is the logo in the product rather than a
second colourway of it.

The frame is load-bearing rather than decorative. The accent is low-contrast on
white, so the ink frame and closing bracket carry the form — the same move the
site makes putting a hairline around a teal button. That is why the usage rules
tell people not to drop, thin or recolour it.

The **wordmark** converged too, and is the name set in the site's own Helvetica,
bold and uppercase at the headings' -0.035em tracking.

It ships as live `<text>` rather than outlines. Outlining Helvetica would
redistribute glyphs from a font there is a licence to use but not to ship, and
it would freeze a second copy of a name the site renders live; naming the stack
instead does neither. The files carry no font data, and fall back to Arial and
then to the system, which is the site's own stack behaving correctly rather
than a defect.

The cost is that rasterising is machine-dependent — the PNGs are generated on a
machine with Helvetica Neue and committed, rather than built in CI, and
`gen-assets.py` reads the font only to measure the string for the viewBox.
JetBrains Mono is gone from the brand entirely.

**Settled 2026-08-20:** the mark converged onto the site accent and the desktop
clients moved with it; the wordmark converged onto the site's Helvetica as live
text. Nothing in the kit now contradicts what a reader sees on the page.

## Page

`src/pages/about/brand.astro`, using `Base.astro` like the other `about/` pages,
linked from the header nav.

Sections, in order:

1. **Licence framing** — editorial use, not an endorsement licence.
2. **Where the project actually is** — invited cohort, query access not yet
   exercisable, analytics and leaderboard open today.
3. **Boilerplate** — one-line, ~50 word, ~150 word, each copyable.
4. **What you can safely say** — the four homepage commitments plus the gates.
5. **What we don't claim** — no corpus/contributor figures (point at
   `/analytics`, which is live), not an open dataset, no partner names, nothing
   about individual contributors, no safety claims about recorded agents.
6. **Assets** — per-group preview and download list, plus the zip.
7. **Logo usage** — clear space, minimum sizes, variant choice, and four
   do/don't tiles rendered from the real asset.
8. **Name usage** — two words, no article, Trace Credit as a defined term,
   Ironclaw as a separate project.
9. **Colour and type** — the tokens already in `Base.astro`.

Asset metadata lives in one array in the frontmatter so previews, download rows,
and sizes stay in sync. Sizes are read with `statSync` at build time rather than
hardcoded. Copy buttons use `navigator.clipboard` and fall back to selecting the
text when the clipboard is unavailable; the text is selectable regardless.

`Base.astro` also gains favicon links (SVG mark, media-scoped for light and dark,
with a 32px PNG fallback). The header keeps its text wordmark; restyling it was
out of scope.

## Verification

No page tests exist in this repo. Verified by: `npm run check` reports 0 errors;
`astro build` succeeds; all 21 `/brand/*` URLs referenced by the built page
resolve in `dist/`; the zip contains 32 files; the generated mark, glyph, and
stencil SVGs diff clean against the canonical ones in
`trace-commons-server/assets/mark/`; the whole built site contains no inline
`<script>`, so nothing trips the `script-src 'self'` CSP in `public/_headers`;
and the rendered page was checked in a browser at 1100px.
