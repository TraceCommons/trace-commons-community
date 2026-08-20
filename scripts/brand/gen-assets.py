#!/usr/bin/env python3
"""Generate the Trace Commons press logo files in public/brand/.

The mark is NOT designed here. Its geometry and palette are the canonical ones
the desktop clients draw live, transcribed from trace-commons-server:

    assets/mark/mark-{light,dark,template-*,glyph-*}.svg
    macos/Sources/TraceCommonsApp/Views/DesignSystem.swift  (palette)
    docs/superpowers/specs/2026-08-19-icon-pipeline-design.md

Those clients render the mark from shared geometry rather than loading a file,
so it stays correct at 14px in a tray and at 84px onscreen. The files this
script writes are the packaging-and-press export of the same numbers. If the
geometry changes upstream, change the constants below to match — do not redraw.

The wordmark is the name in the site's own Helvetica, carried as live text. See
the note above FONT for why it is not outlined.

    python3 scripts/brand/gen-assets.py
"""
from __future__ import annotations

import json
import subprocess
import shutil
from pathlib import Path

from fontTools.ttLib import TTCollection

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "brand"
# Byte sizes for the download table. The page cannot stat files itself without
# pulling @types/node into the build, and the sizes belong to whatever this
# script last wrote anyway.
MANIFEST = ROOT / "src" / "_data" / "brand-assets.json"
# The wordmark is live <text>, not outlines. The site sets its own name as
# Helvetica text and ships no wordmark image at all, so outlining anything here
# would put a second, frozen spelling of the name next to the live one -- and
# outlining Helvetica would redistribute glyphs from a font we only have a
# licence to use, not to ship. Live text sidesteps both: the file carries no
# font data and renders in whatever face the reader's system offers from the
# site's own stack.
#
# The cost is that rasterising is machine-dependent, which is why the PNGs are
# generated once here and committed rather than built in CI. This font is read
# only to measure the string so the viewBox fits it; nothing from it is copied
# into the output.
FONT = Path("/System/Library/Fonts/HelveticaNeue.ttc")
FONT_FACE_INDEX = 1  # Bold.
FONT_STACK = "'Helvetica Neue', Helvetica, Arial, sans-serif"
FONT_WEIGHT = 700

# Uppercase, because that is how the site sets it: `.page h2` and `.title` in
# src/styles/brand.css are `text-transform: uppercase` at weight 700 with
# -0.035em tracking. The name is still "Trace Commons" -- this is the
# typographic treatment, not the spelling.
WORDMARK_TEXT = "TRACE COMMONS"
# Cap height of the wordmark, in SVG user units.
CAP = 48.0
# Tracking, as a fraction of the em. Matches the site's headings.
TRACKING = -0.035

# Canonical geometry, on a 64-unit coordinate space. The frame is inset one
# unit under a two-unit stroke so its outer edge lands exactly on the boundary.
# The template variant thickens to 8 because it loses the frame that was holding
# the brackets apart.
BRACKET_OPEN = "M11 28V11h17"
BRACKET_CLOSE = "M53 36v17H36"

# Palette from the trace-commons-mark crate: the site's one accent on the
# opening bracket, ink everywhere else.
SCHEMES = {
    "light": {
        "surface": "#FFFFFF",
        "line": "#000000",
        "open": "#00D4AA",
        "close": "#000000",
        "ink": "#000000",
    },
    "dark": {
        "surface": "#000000",
        "line": "#FFFFFF",
        "open": "#00D4AA",
        "close": "#FFFFFF",
        "ink": "#FFFFFF",
    },
}


def wordmark_metrics() -> tuple[float, float, float]:
    """Measure the wordmark, returning (width, font_size, letter_spacing).

    Everything is in SVG user units, scaled so the caps stand exactly `CAP`
    tall. Only advance widths are read; no outline ever leaves this function.
    """
    font = TTCollection(FONT).fonts[FONT_FACE_INDEX]
    upem = font["head"].unitsPerEm
    cap_units = font["OS/2"].sCapHeight
    font_size = CAP * upem / cap_units
    scale = font_size / upem

    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    glyph_order = font.getGlyphOrder()
    advances = 0
    for ch in WORDMARK_TEXT:
        name = cmap.get(ord(ch)) or glyph_order[0]
        advances += hmtx[name][0]

    letter_spacing = TRACKING * font_size
    # Renderers add the tracking after every glyph including the last, so the
    # box would be one gap too wide if that were not taken back off.
    width = advances * scale + letter_spacing * (len(WORDMARK_TEXT) - 1)
    return width, font_size, letter_spacing


def wordmark_text(x: float, y: float, fill: str, font_size: float, letter_spacing: float) -> str:
    """The wordmark as live text, with the baseline at `y`."""
    return (
        f'  <text x="{x:.2f}" y="{y:.2f}" fill="{fill}" '
        f'font-family="{FONT_STACK}" font-weight="{FONT_WEIGHT}" '
        f'font-size="{font_size:.2f}" letter-spacing="{letter_spacing:.3f}" '
        f'xml:space="preserve">{WORDMARK_TEXT}</text>'
    )


def mark_svg_body(scheme: dict, *, framed: bool = True) -> str:
    """The full-colour mark: two brackets, optionally in their frame."""
    frame = (
        f'  <rect x="1" y="1" width="62" height="62" '
        f'fill="{scheme["surface"]}" stroke="{scheme["line"]}" stroke-width="2" />\n'
        if framed
        else ""
    )
    return (
        f"{frame}"
        f'  <path d="{BRACKET_OPEN}" fill="none" stroke="{scheme["open"]}" stroke-width="7" />\n'
        f'  <path d="{BRACKET_CLOSE}" fill="none" stroke="{scheme["close"]}" stroke-width="7" />'
    )


def template_svg_body(ink: str) -> str:
    """The stencil: frameless, single ink, recoloured by the host."""
    return (
        f'  <path d="{BRACKET_OPEN}" fill="none" stroke="{ink}" stroke-width="8" />\n'
        f'  <path d="{BRACKET_CLOSE}" fill="none" stroke="{ink}" stroke-width="8" />'
    )


def svg(view_w: float, view_h: float, body: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {view_w:g} {view_h:g}" '
        f'width="{view_w:g}" height="{view_h:g}" role="img" aria-label="Trace Commons">\n'
        f"{body}\n</svg>\n"
    )


def write(name: str, content: str) -> Path:
    path = OUT / name
    path.write_text(content)
    return path


def main() -> None:
    if not FONT.exists():
        raise SystemExit(f"missing font: {FONT}")
    if not shutil.which("rsvg-convert"):
        raise SystemExit("missing rsvg-convert (brew install librsvg)")

    OUT.mkdir(parents=True, exist_ok=True)
    word_w, font_size, letter_spacing = wordmark_metrics()
    pad = CAP * 0.25

    svgs: list[str] = []
    for variant, scheme in SCHEMES.items():
        # Mark, framed and filled: the app-icon treatment.
        svgs.append(
            write(
                f"trace-commons-mark-{variant}.svg",
                svg(64, 64, mark_svg_body(scheme)),
            ).name
        )

        # Glyph: the same brackets without the frame, for use on an existing
        # surface that already provides the field.
        svgs.append(
            write(
                f"trace-commons-glyph-{variant}.svg",
                svg(64, 64, mark_svg_body(scheme, framed=False)),
            ).name
        )

        # Template stencil: single ink, thicker stroke, no frame.
        svgs.append(
            write(
                f"trace-commons-template-{variant}.svg",
                svg(64, 64, template_svg_body(scheme["ink"])),
            ).name
        )

        # Wordmark: live text, padded by a quarter cap height all round.
        svgs.append(
            write(
                f"trace-commons-wordmark-{variant}.svg",
                svg(
                    round(word_w + pad * 2, 2),
                    round(CAP + pad * 2, 2),
                    wordmark_text(pad, pad + CAP, scheme["ink"], font_size, letter_spacing),
                ),
            ).name
        )

        # Lockup: framed mark, a gap, then the wordmark centred against it.
        gap = CAP * 0.5
        mark_size = CAP * 1.4
        lock_h = mark_size + pad * 2
        lock_w = mark_size + gap + word_w + pad * 2
        # Caps centred on the mark, so the two optical masses line up.
        word_baseline = pad + (mark_size + CAP) / 2
        body = (
            f'  <g transform="translate({pad:g} {pad:g}) scale({mark_size / 64:.6f})">\n'
            f"{mark_svg_body(scheme)}\n  </g>\n"
            + wordmark_text(
                pad + mark_size + gap, word_baseline, scheme["ink"], font_size, letter_spacing
            )
        )
        svgs.append(
            write(
                f"trace-commons-lockup-{variant}.svg",
                svg(round(lock_w, 2), round(lock_h, 2), body),
            ).name
        )

    pngs: list[str] = []
    for name in svgs:
        stem = name[:-4]
        for width in (512, 1024):
            png = OUT / f"{stem}-{width}.png"
            subprocess.run(
                ["rsvg-convert", "-w", str(width), "-o", str(png), str(OUT / name)],
                check=True,
            )
            pngs.append(png.name)

    for variant in SCHEMES:
        png = OUT / f"favicon-{variant}-32.png"
        subprocess.run(
            [
                "rsvg-convert", "-w", "32", "-h", "32",
                "-o", str(png), str(OUT / f"trace-commons-mark-{variant}.svg"),
            ],
            check=True,
        )
        pngs.append(png.name)

    bundle = OUT / "trace-commons-brand.zip"
    if bundle.exists():
        bundle.unlink()
    subprocess.run(
        ["zip", "-q", "-j", str(bundle), *[str(OUT / n) for n in svgs + pngs]],
        check=True,
    )

    sizes = {
        name: (OUT / name).stat().st_size
        for name in sorted(svgs + pngs + [bundle.name])
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(sizes, indent=2, sort_keys=True) + "\n")

    print(f"wrote {len(svgs)} svg + {len(pngs)} png + {bundle.name} to {OUT}")
    print(f"wrote {MANIFEST.relative_to(ROOT)} ({len(sizes)} entries)")


if __name__ == "__main__":
    main()
