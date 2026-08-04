# Site-v2 design integration

Bring the `trace-commons-site-v2` landing page and its brand system into
`trace-commons-community`, and ship the result publicly to `tracecommons.ai`.

Status: design agreed, not yet implemented.

## Problem

Two repos describe the same product in incompatible visual languages.

`trace-commons-community` (this repo) is an Astro app with the working
surfaces — `/`, `/analytics`, `/leaderboard`, `/profile`,
`/contributors/[handle]`, `/devfolio`, `/about/*`. Its styling is deliberately
plain: system fonts, a grey palette, an 880px column, and a
`prefers-color-scheme: dark` block.

`trace-commons-site-v2` is a single-page, no-build landing page carrying the
actual brand: black and white with a `#00d4aa` mint accent, uppercase
Helvetica display type, a 2px hairline frame, and one spacing scale. It ships
four interactive set pieces — a three.js hero globe, a scroll-pinned manifesto,
a turning credit coin, and a rules carousel — across seven plain `<script>`
files with `three.js` r128 vendored.

Neither is shippable alone. The landing page has no live data and no links to
the app; the app has no brand and no argument for the product.

## Goals

- `/` becomes the site-v2 landing, merged with the live proof and app
  navigation that the current homepage carries.
- Every other page adopts the brand system, so the site reads as one product.
- The whole site ships publicly on `tracecommons.ai`.
- No new npm dependency.

## Non-goals

- Bundling or tree-shaking `three.js`. Deferred; see Open questions.
- Rewriting the interactive JS in Astro idiom. The ported files stay as tested.
- Changing the community API, the snapshot pipeline, or the profile flow.
- Restyling `/devfolio` beyond what it inherits from the layout. It is
  partner-facing documentation, unlisted and `noindex`.

## Decisions

### Routing and content

`/` is the merged landing, in order: hero with globe, `#worth`, `#how`
pipeline, `#earn` coin, `#rules` carousel, live top contributors, how to join,
closing CTA, footer.

The live top-contributors block and the how-to-join copy carry over from
today's homepage. The register framing and the commitments move to
`/about/*`, which already holds that material, and the landing links to them
rather than duplicating them.

The two carried-over blocks are rendered **quiet**: a plain table and plain
prose on the light background, using the shared type and table styles, with no
animation, no reveal, and no visual invention of their own. The landing
already carries four set pieces — globe, takeover, coin, carousel — and adding
a fifth and sixth flourish at the bottom would dilute all of them. These two
blocks are proof and instruction; the argument is made above them.

All existing routes survive and are restyled: `/leaderboard`, `/analytics`,
`/profile`, `/contributors/[handle]`, `/about/privacy`, `/about/data-policy`,
`/devfolio`.

Navigation is two tiers, because site-v2's four section anchors plus the app's
three destinations is too many for one row:

- Persistent, every page: Leaderboard, Analytics, Profile.
- On `/` only, as a smaller second row retaining the `>` prefix styling:
  `#worth`, `#how`, `#earn`, `#rules`.

### CSS architecture

`styles.css` splits along a seam already present in it.

`src/styles/brand.css`, imported once by `Base.astro` and loaded on every
page: the `:root` token block, the inverted-mode block, the reset,
`.app-wrapper`, shared type (`.section-title`, `.body-text`, `.label`),
buttons, tables, the stat grid, and the footer.

Landing-only styles — hero, transcript, pipeline, coin, carousel — are scoped
inside their own components and never load on app pages.

The `prefers-color-scheme: dark` block is removed from `Base.astro`. The site
is light-only; black is reserved as a deliberate takeover effect in `#worth`.

App pages use a ~1100px content column nested inside the 1600px
`.app-wrapper` frame. Tables keep their current density and row height, and
are recoloured to brand tokens with hairline borders. The frame, header,
footer, type, and palette are shared; table typography is not scaled up to
display sizes.

### Components and scripts

`Base.astro` owns the frame, header, footer, and `brand.css` import.
Landing sections become `src/components/landing/*.astro`, composed by
`index.astro`.

Copied into `public/` unchanged: `vendor/three.min.js` (r128, MIT),
`assets/near-logo.svg`.

Ported byte-identical into `public/scripts/`, with only asset paths adjusted:
`main.js` (globe), `coin.js`, `carousel.js`, `scroll.js`, `motion.js`.

Dropped entirely: `score.js` and `assets/manifesto.mp3`. The audio existed to
score a Star Wars crawl; `#worth` is no longer that. This also retires the
unresolved stock-music licence flagged in the site-v2 README, so it is no
longer a launch blocker.

Replaced: `crawl.js` becomes a new `public/scripts/transcript.js`. It reuses
`crawl.js`'s pin-progress maths, keeps the `window.TCGlobe.setInverted`
handoff, drops the `window.TCScore` call, and drops the perspective plane and
top fade mask.

All scripts load `defer` and only on `/`. All are external files, which the
existing `script-src 'self'` CSP requires — no inline script is introduced.

### `#worth`: the transcript treatment

The Star Wars crawl is replaced. The section keeps what was good about it —
it pins, scroll drives the pace so the reader controls it, and the page
inverts to a takeover while it passes — and discards the crawl signature:
the `rotateX(44deg)` receding plane, the top fade mask, and the centred
upward-drifting text.

Structure: a 220vh `.pin` containing a sticky 100svh stage. Changing `.pin`'s
height changes reading pace and nothing else, as before.

On narrow viewports the pin drops to 160vh. 220vh of scroll to clear one
section is a long time to hold a phone reader in place, and the stanzas are
shorter per line there anyway.

The section's `<h2>`, "What a trace is worth", is retained in the markup for
document structure and search, rendered as the left half of the status bar
rather than as a display heading. It is not visually hidden.

The manifesto copy is restructured into six stanzas, one per existing
paragraph — the copy is re-broken, not rewritten, and no wording changes.
Within each stanza one clause becomes the headline and the remainder becomes
supporting lines. The rule for choosing it: the headline is the clause that
states the claim, and the supporting lines are the ones that set it up. For
example, in "Today that record is kept by the company that served the machine.
What you typed leaves your desk in plain view, and it will teach whatever comes
next.", the first sentence is the headline. The six headline choices are made
during implementation and reviewed as a set, since they must read as a
coherent argument when skimmed alone.

Scroll progress selects the live stanza:

- The live stanza's headline renders at display size in `#f5c91f`.
- Its supporting lines render in mono, mint, at **no less than 0.65 opacity**,
  with a cursor block on the last one. See Contrast below — this is a floor,
  not a starting point.
- Neighbouring stanzas dim. They are not the current read, so they are exempt
  from the contrast floor.
- A mono status bar shows the section name on the left and `NN / 06` on the
  right.

The supporting lines carry no `>` prefix. The chevron appears only in the
status bar, which is genuine page chrome. The manifesto is authored prose, and
setting it behind a prompt marker puts the author's argument in the machine's
voice — the opposite of what the section argues. Mono is the quiet register
here, not machine speech.

The status bar's left half is the section name, "What a trace is worth". An
earlier draft used `> emitting trace`; it was cut because nothing is being
emitted. It described an operation that does not happen, which makes it
decoration in the shape of a status readout.

The counter is retained because it is true and useful: in a pinned section the
reader cannot see a scrollbar's worth of progress, so `NN / 06` is what tells
them the section ends.

`html.inverted` is retained for the takeover and still flips the globe's line
colours via `TCGlobe.setInverted`. It no longer sets `--ink-color` to
`#ffe81f`.

Reduced motion, and equally the no-JS case: the pin collapses to auto height,
the stage becomes static, all six stanzas render stacked with every headline
at display size, and no cursor renders. The manifesto is the argument for the
product, so it must be fully readable with scripts disabled.

### Typography

site-v2 declares `--mono-font` as
`'Helvetica Neue', Helvetica, Arial, sans-serif` — identical to
`--font-stack`. There is no monospace on the site today.

`brand.css` defines a real one:

```
--mono-font: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas,
             'Liberation Mono', monospace;
```

This is load-bearing in two places. `#worth`'s transcript register depends on
it entirely — in a proportional face the treatment reads as small grey text
rather than as a transcript. And numeric columns on `/leaderboard`,
`/analytics`, and `/contributors/[handle]` use it with
`font-variant-numeric: tabular-nums`, so credit figures align on the decimal
and rank changes do not shift column width.

That gives the site three type roles rather than two: Helvetica for display,
Helvetica for body, and the mono stack for data and chrome. The display and
body faces being the same family is site-v2's existing choice and is left
alone.

### Contrast

The takeover section is light text on black and must clear WCAG AA (4.5:1) for
anything the reader is currently expected to read.

Measured against `#000000`:

| Colour | Ratio | Verdict |
| --- | --- | --- |
| `#f5c91f` headline | 13.3:1 | passes |
| `#00d4aa` at full opacity | 11.0:1 | passes |
| `#00d4aa` at 0.45 opacity | 2.74:1 | **fails** |
| `#00d4aa` at 0.65 opacity | 4.86:1 | passes |

The 0.45 value came from the design mockups and is the reason the live
stanza's supporting lines have an explicit 0.65 floor above. Dimmed
neighbouring stanzas may go below it.

### Yellow

Yellow is used on the `#worth` stanza headlines. Mint retains every other
accent role across the site. The colour is `#f5c91f`, not `#ffe81f`.

This placement was chosen with the trade dress tradeoff explicitly in view,
against the recommendation recorded below. It is a decision, not an oversight.

Trade dress protects a distinctive combination rather than a colour. The
following four properties are what distinguish this treatment from the Star
Wars crawl, and they are **implementation constraints, not description**. If
any drifts, the distance narrows:

1. The hex is `#f5c91f`, not `#ffe81f`.
2. The typeface is the site's Helvetica stack, not a Franklin Gothic.
3. Headlines are left-aligned, not centred.
4. The yellow headline is **static while it is the live stanza**. It does not
   drift upward while being read.

The advice given during design was to place yellow on credit values instead —
the coin, leaderboard credit figures, profile totals — where it would carry a
semantic role and sit nowhere near the manifesto. That option remains a token
change if this is revisited. Worth a review by counsel before launch.

### Data flow

Unchanged. `scripts/fetch-snapshot.mjs` writes
`src/_data/snapshots/live-7d.json` at build time; the top-contributors block
hydrates at runtime from `/api/v1/community/leaderboard` through the existing
`public/_worker.js` proxy, reusing `src/scripts/live-snapshot.ts`. When the
API is unreachable the block shows the existing empty state, not an error.

### Launch posture

The whole site goes public on `tracecommons.ai` — no Cloudflare Access gate
on any route. The README's launch-hardening caveats therefore clear as part of
this work rather than after it:

- Remove the Cloudflare Access gate.
- Confirm the snapshot freshness gate passes against the live endpoint.
- Confirm the "Powered by NEAR" mark usage in the footer is authorised.
- Get the privacy and data-policy copy reviewed.
- Counsel review of the `#worth` yellow decision.

## Testing

- `npm run check` passes.
- Manual matrix on `/`: reduced motion, JavaScript disabled, mobile widths,
  and community API unreachable.
- The manifesto is readable end to end with scripts disabled.
- Keyboard: every interactive element has a visible focus ring against both
  the light background and the black takeover. The rules carousel is already
  `tabindex="0"` and must be operable by arrow key, not pointer only.
- Contrast: the live stanza's supporting lines measure at or above 4.5:1
  against black, verified with a contrast checker rather than by eye.
- No route other than `/` requests `three.min.js`.
- Lighthouse pass on `/`, measured rather than assumed, given the payload
  noted below.

## Risks

**`three.js` is 589K on the landing route.** Cache-friendly and confined to
`/`, but it is the single largest performance risk and the reason a measured
Lighthouse pass is a test criterion rather than a nicety.

**`transcript.js` is new code in a section that must not break.** It carries
the product's whole argument. The reduced-motion and no-JS fallback is the
mitigation: if the scroll logic fails, the section degrades to readable
stacked prose rather than to nothing.

**Trade dress.** Recorded under Yellow above.

## Open questions

- Move `three.js` to an npm dependency so it tree-shakes to roughly 150K, and
  bundle the landing scripts as hashed ES modules. Deliberately deferred until
  the port is verified against real traffic, since rewriting hand-tuned WebGL
  and scroll code is where behaviour drift appears. Worth doing as a follow-up.
- Whether yellow also takes the credit role described under Yellow.
