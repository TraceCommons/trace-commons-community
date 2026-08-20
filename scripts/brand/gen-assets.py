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
geometry changes upstream, change MARK below to match — do not redraw it.

Wordmark glyphs are outlined from JetBrains Mono (SIL OFL 1.1). The design
system sets anything machine-produced in mono, and the wordmark follows that
rule; outlining means the shipped SVGs carry no font dependency.

    python3 scripts/brand/gen-assets.py
"""
from __future__ import annotations

import json
import subprocess
import shutil
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "brand"
# Byte sizes for the download table. The page cannot stat files itself without
# pulling @types/node into the build, and the sizes belong to whatever this
# script last wrote anyway.
MANIFEST = ROOT / "src" / "_data" / "brand-assets.json"
FONT = Path.home() / "Library" / "Fonts" / "JetBrainsMonoNLNerdFont-Medium.ttf"

WORDMARK_TEXT = "Trace Commons"
# Cap height of the outlined wordmark, in SVG user units.
CAP = 48.0
# Tracking added between glyphs, as a fraction of the em.
TRACKING = -0.055

# Canonical geometry, on a 64-unit coordinate space. The frame is inset one
# unit under a two-unit stroke so its outer edge lands exactly on the boundary.
# The template variant thickens to 8 because it loses the frame that was holding
# the brackets apart.
BRACKET_GREEN = "M11 28V11h17"
BRACKET_BLUE = "M53 36v17H36"

# Palette from DesignSystem.swift: surface, line, green, blue, inkPrimary.
SCHEMES = {
    "light": {
        "surface": "#FFFFFF",
        "line": "#D9DFDC",
        "green": "#178F70",
        "blue": "#315FBA",
        "ink": "#20241F",
    },
    "dark": {
        "surface": "#21241E",
        "line": "#3B4038",
        "green": "#3FBE9A",
        "blue": "#7FA0EC",
        "ink": "#E8EAE3",
    },
}


def wordmark_path() -> tuple[str, float, float]:
    """Outline WORDMARK_TEXT, returning (path data, width, height).

    The result sits on a baseline at y=CAP with its left sidebearing trimmed,
    so the caller can place it directly.
    """
    font = TTFont(FONT)
    upem = font["head"].unitsPerEm
    cap_units = font["OS/2"].sCapHeight
    scale = CAP / cap_units
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    hmtx = font["hmtx"]

    pen_out = SVGPathPen(glyphs)
    x = 0.0
    for ch in WORDMARK_TEXT:
        name = cmap[ord(ch)]
        # Flip the y axis (font space is y-up, SVG is y-down) and sit the
        # baseline at y=CAP so the glyph box starts at the top of the caps.
        t = Transform(scale, 0, 0, -scale, x * scale, CAP)
        glyphs[name].draw(TransformPen(pen_out, t))
        x += hmtx[name][0] + TRACKING * upem

    width = (x - TRACKING * upem) * scale
    height = CAP
    return pen_out.getCommands(), width, height


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
        f'  <path d="{BRACKET_GREEN}" fill="none" stroke="{scheme["green"]}" stroke-width="7" />\n'
        f'  <path d="{BRACKET_BLUE}" fill="none" stroke="{scheme["blue"]}" stroke-width="7" />'
    )


def template_svg_body(ink: str) -> str:
    """The stencil: frameless, single ink, recoloured by the host."""
    return (
        f'  <path d="{BRACKET_GREEN}" fill="none" stroke="{ink}" stroke-width="8" />\n'
        f'  <path d="{BRACKET_BLUE}" fill="none" stroke="{ink}" stroke-width="8" />'
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
    word_d, word_w, word_h = wordmark_path()
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

        # Wordmark: outlined text, padded by a quarter cap height all round.
        svgs.append(
            write(
                f"trace-commons-wordmark-{variant}.svg",
                svg(
                    round(word_w + pad * 2, 2),
                    round(word_h + pad * 2, 2),
                    f'  <path d="{word_d}" fill="{scheme["ink"]}" transform="translate({pad:g} {pad:g})" />',
                ),
            ).name
        )

        # Lockup: framed mark, a gap, then the wordmark centred against it.
        gap = CAP * 0.5
        mark_size = CAP * 1.4
        lock_h = mark_size + pad * 2
        lock_w = mark_size + gap + word_w + pad * 2
        word_y = pad + (mark_size - word_h) / 2
        body = (
            f'  <g transform="translate({pad:g} {pad:g}) scale({mark_size / 64:.6f})">\n'
            f"{mark_svg_body(scheme)}\n  </g>\n"
            f'  <path d="{word_d}" fill="{scheme["ink"]}" '
            f'transform="translate({pad + mark_size + gap:.2f} {word_y:.2f})" />'
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
