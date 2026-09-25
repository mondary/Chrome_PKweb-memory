#!/usr/bin/env python3
"""Render the Chrome Web Store artwork from the local brand and demo screenshot.

Requires Pillow. All coordinates below are design pixels; each image is drawn
at 2×, then downsampled for crisp typography and curves at the target size.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SCREENSHOT = ROOT / "screenshots" / "02-historique.png"
ICON = ASSETS / "icon128.png"
SCALE = 2
INK = (7, 17, 28)
DEEP = (12, 31, 47)
BLUE = (155, 202, 255)
MINT = (173, 240, 213)
WHITE = (239, 247, 252)
FOG = (161, 188, 207)
FONT = "/System/Library/Fonts/Avenir Next.ttc"
FONT_CONDENSED = "/System/Library/Fonts/Avenir Next Condensed.ttc"
FONT_MONO = "/System/Library/Fonts/Menlo.ttc"


def scaled(value: float) -> int:
    return round(value * SCALE)


def typeface(size: int, *, weight: str = "regular", mono: bool = False) -> ImageFont.FreeTypeFont:
    if mono:
        return ImageFont.truetype(FONT_MONO, scaled(size), index=0)
    index = {"regular": 7, "medium": 5, "demi": 2, "bold": 0, "heavy": 8}[weight]
    return ImageFont.truetype(FONT_CONDENSED if weight == "heavy" else FONT, scaled(size), index=index)


def xy(box: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
    return tuple(scaled(v) for v in box)


def new_canvas(width: int, height: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", (scaled(width), scaled(height)), INK)
    draw = ImageDraw.Draw(image, "RGB")
    for y in range(scaled(height)):
        ratio = y / max(1, scaled(height) - 1)
        color = tuple(round(INK[i] * (1 - ratio) + DEEP[i] * ratio) for i in range(3))
        draw.line((0, y, scaled(width), y), fill=color)
    grid = Image.new("RGBA", image.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid, "RGBA")
    for x in range(0, width + 1, 42):
        gd.line((scaled(x), 0, scaled(x), scaled(height)), fill=(123, 176, 211, 15), width=1)
    for y in range(0, height + 1, 42):
        gd.line((0, scaled(y), scaled(width), scaled(y)), fill=(123, 176, 211, 15), width=1)
    image = Image.alpha_composite(image.convert("RGBA"), grid)
    return image, ImageDraw.Draw(image, "RGBA")


def bezier(a, b, c, d, steps=110):
    points = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u**3 * a[0] + 3 * u**2 * t * b[0] + 3 * u * t**2 * c[0] + t**3 * d[0]
        y = u**3 * a[1] + 3 * u**2 * t * b[1] + 3 * u * t**2 * c[1] + t**3 * d[1]
        points.append((scaled(x), scaled(y)))
    return points


def draw_atlas(image: Image.Image, width: int, height: int, *, foreground: bool = False) -> None:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    paths = [
        ((width * .32, height * 1.1), (width * .57, height * -.2), (width * .67, height * 1.0), (width * 1.1, height * .1), BLUE),
        ((width * .16, height * -.1), (width * .43, height * .58), (width * .66, height * .06), (width * 1.1, height * 1.06), MINT),
        ((width * .49, height * 1.1), (width * .71, height * .19), (width * .89, height * .98), (width * 1.1, height * .52), BLUE),
    ]
    for a, b, c, d, color in paths:
        pts = bezier(a, b, c, d)
        draw.line(pts, fill=(*color, 69 if foreground else 44), width=scaled(1.2), joint="curve")
        for point_index in (25, 63):
            px, py = pts[point_index]
            radius = scaled(4 if foreground else 3)
            draw.ellipse((px - radius * 3, py - radius * 3, px + radius * 3, py + radius * 3), fill=(*color, 18))
            draw.ellipse((px - radius, py - radius, px + radius, py + radius), fill=(*color, 190))
    image.alpha_composite(layer)


def logo(image: Image.Image, x: int, y: int, size: int) -> None:
    mark = Image.open(ICON).convert("RGBA").resize((scaled(size), scaled(size)), Image.Resampling.LANCZOS)
    image.alpha_composite(mark, (scaled(x), scaled(y)))


def label(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, size: int = 11, color=FOG) -> None:
    draw.text((scaled(x), scaled(y)), text, font=typeface(size, mono=True), fill=(*color, 255), anchor="lt")


def product_frame(image: Image.Image, x: int, y: int, width: int) -> None:
    if not SCREENSHOT.exists():
        return
    screenshot = Image.open(SCREENSHOT).convert("RGB")
    height = round(width * screenshot.height / screenshot.width)
    outer_h = height + 34
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow, "RGBA")
    sd.rounded_rectangle(xy((x + 11, y + 16, x + width + 11, y + outer_h + 16)), radius=scaled(10), fill=(0, 0, 0, 150))
    image.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(scaled(16))))
    panel = Image.new("RGBA", (scaled(width), scaled(outer_h)), (240, 245, 247, 255))
    pd = ImageDraw.Draw(panel, "RGBA")
    pd.rectangle(xy((0, 0, width, 34)), fill=(20, 39, 55, 255))
    for cx in (15, 27, 39):
        pd.ellipse(xy((cx, 14, cx + 5, 19)), outline=(153, 185, 204, 160), width=scaled(1))
    pd.rounded_rectangle(xy((90, 8, min(width - 50, 350), 26)), radius=scaled(3), fill=(9, 24, 37, 255))
    pd.text((scaled(100), scaled(11)), "bookmarks-sorter / tableau de bord", font=typeface(8, mono=True), fill=(139, 170, 190, 255))
    shot = screenshot.resize((scaled(width), scaled(height)), Image.Resampling.LANCZOS)
    panel.alpha_composite(shot.convert("RGBA"), (0, scaled(34)))
    mask = Image.new("L", panel.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, panel.width - 1, panel.height - 1), radius=scaled(9), fill=255)
    image.paste(panel, (scaled(x), scaled(y)), mask)
    ImageDraw.Draw(image, "RGBA").rounded_rectangle(xy((x, y, x + width, y + outer_h)), radius=scaled(9), outline=(157, 200, 224, 110), width=scaled(1))


def save(image: Image.Image, name: str, width: int, height: int) -> None:
    output = ASSETS / name
    image.convert("RGB").resize((width, height), Image.Resampling.LANCZOS).save(output, "PNG", optimize=True)
    print(f"{output.relative_to(ROOT)}: {width}×{height}")


def small_tile() -> None:
    width, height = 440, 280
    image, draw = new_canvas(width, height)
    draw_atlas(image, width, height, foreground=True)
    draw = ImageDraw.Draw(image, "RGBA")
    logo(image, 23, 23, 42)
    label(draw, 77, 37, "CHROME EXTENSION", 10, MINT)
    draw.line(xy((24, 91, 116, 91)), fill=(*MINT, 190), width=scaled(1))
    draw.text((scaled(22), scaled(107)), "BOOKMARKS", font=typeface(42, weight="heavy"), fill=(*WHITE, 255), anchor="lt")
    draw.text((scaled(22), scaled(155)), "SORTER", font=typeface(46, weight="heavy"), fill=(*BLUE, 255), anchor="lt")
    label(draw, 24, 236, "VOTRE WEB, EN CLAIR.", 12, WHITE)
    save(image, "tile-440x280.png", width, height)


def wide_asset(name: str, width: int, height: int, *, social: bool = False) -> None:
    image, draw = new_canvas(width, height)
    draw_atlas(image, width, height)
    draw = ImageDraw.Draw(image, "RGBA")
    left = 68 if width <= 1400 else 80
    logo(image, left, 57, 57)
    label(draw, left + 75, 75, "BOOKMARKS SORTER / CHROME", 13, MINT)
    headline_size = 80 if height >= 560 else 71
    top = 185 if social else 163
    draw.text((scaled(left), scaled(top)), "Votre web a", font=typeface(headline_size, weight="bold"), fill=(*WHITE, 255), anchor="lt")
    draw.text((scaled(left), scaled(top + headline_size * .98)), "une mémoire.", font=typeface(headline_size, weight="bold"), fill=(*BLUE, 255), anchor="lt")
    label(draw, left + 2, height - 88, "FAVORIS  /  HISTORIQUE  /  SESSIONS", 13, FOG)
    x = 620 if social else (760 if width <= 1400 else 875)
    y = 150 if social else (115 if height >= 560 else 86)
    panel_width = 535 if social else (580 if width <= 1400 else 590)
    product_frame(image, x, y, panel_width)
    save(image, name, width, height)


def main() -> None:
    ASSETS.mkdir(exist_ok=True)
    small_tile()
    wide_asset("marquee-1400x560.png", 1400, 560)
    wide_asset("banner-1544x500.png", 1544, 500)
    wide_asset("card-1200x630.png", 1200, 630, social=True)


if __name__ == "__main__":
    main()
