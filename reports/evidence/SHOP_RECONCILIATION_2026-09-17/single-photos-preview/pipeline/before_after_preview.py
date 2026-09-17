"""Before/after LAYOUT PREVIEWS of the seven „Kup osobno" image frames.

Composited offline from the PNG files with the frame geometry read from
ShopProductCard.tsx / ShopPackaging.tsx. Not a served screenshot.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WORKTREE = Path(sys.argv[1])
DEST = Path(sys.argv[2])
DEST.mkdir(parents=True, exist_ok=True)

PAPER = (255, 255, 255)  # theme-pro-light --color-paper (bg-paper page ground)
IVORY = (0xFB, 0xFA, 0xF7)  # --g-ivory, the frame ground
INK = (0x19, 0x1A, 0x1D)
SECONDARY = (0x65, 0x63, 0x5F)  # --g-text-secondary
LINE = (0xE2, 0xDE, 0xD7)  # --g-line-quiet
ACCENT = (0xB2, 0x3A, 0x1E)
REG = '/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'

ITEMS = [
    ('GEL-DEX-500', 'Dekstroza', 'dextrose.png'),
    ('GEL-FRU-500', 'Fruktoza', 'fructose.png'),
    ('GEL-INU-500', 'Inulina', 'inulin.png'),
    ('GEL-STB-500', 'Gellatti Stabilizer', 'gellatti-stabilizer.png'),
    ('GEL-YOL-500', 'Suszone żółtko jaja', 'dried-egg-yolk.png'),
    ('GEL-SMP-500', 'Odtłuszczone mleko w proszku', 'skimmed-milk-powder.png'),
    ('GEL-CRP-500', 'Śmietanka w proszku 42%', 'cream-powder-42.png'),
]
PLACEHOLDER = WORKTREE / 'public/shop/single-placeholder.png'
SINGLES = WORKTREE / 'public/shop/singles'


def frame(src_path, css_w, css_h, dpr):
    """ShopReservedFrame: ivory, radius 8, overflow hidden, img object-contain."""
    W, H = css_w * dpr, css_h * dpr
    side = min(W, H)
    img = Image.open(src_path).convert('RGBa').resize((side, side), Image.LANCZOS).convert('RGBA')
    tile = Image.new('RGBA', (W, H), IVORY + (255,))
    tile.alpha_composite(img, ((W - side) // 2, (H - side) // 2))
    mask = Image.new('L', (W * 4, H * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, W * 4 - 1, H * 4 - 1), radius=8 * dpr * 4, fill=255)
    return tile.convert('RGB'), mask.resize((W, H), Image.LANCZOS)


def wrap(draw, text, font, width):
    words, lines, line = text.split(), [], ''
    for word in words:
        trial = (line + ' ' + word).strip()
        if draw.textlength(trial, font=font) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def sheet(name, label, css_w, css_h, dpr, geometry):
    col = 132 * dpr
    pad = 24 * dpr
    f_title = ImageFont.truetype(BOLD, 15 * dpr)
    f_warn = ImageFont.truetype(BOLD, 12 * dpr)
    f_meta = ImageFont.truetype(REG, 11 * dpr)
    f_row = ImageFont.truetype(BOLD, 12 * dpr)
    f_sku = ImageFont.truetype(REG, 10 * dpr)
    header_h = 118 * dpr
    row_h = css_h * dpr + 58 * dpr
    W = pad * 2 + 90 * dpr + col * len(ITEMS)
    H = header_h + 2 * row_h + pad
    canvas = Image.new('RGB', (W, H), PAPER)
    d = ImageDraw.Draw(canvas)

    y = pad
    d.text((pad, y), f'GELLATTI SHOP · „Kup osobno" image frames · {label}', font=f_title, fill=INK)
    y += 22 * dpr
    d.text((pad, y), 'LAYOUT PREVIEW — composited offline from the PNG files. NOT a served screenshot.',
           font=f_warn, fill=ACCENT)
    y += 19 * dpr
    for line in (
        geometry,
        f'Rendered at @{dpr}x on the page ground (bg-paper #ffffff); frame ground --g-ivory #fbfaf7, '
        'radius 8, object-contain, no blend.',
        'BEFORE = staging: shared /shop/single-placeholder.png   ·   '
        'AFTER = claude/shop-single-product-photos: /shop/singles/<article>.png (placeholder kept as fallback)',
    ):
        d.text((pad, y), line, font=f_meta, fill=SECONDARY)
        y += 16 * dpr
    d.line((pad, header_h - 8 * dpr, W - pad, header_h - 8 * dpr), fill=LINE, width=dpr)

    for r, (row_name, source) in enumerate((('BEFORE', 'placeholder'), ('AFTER', 'own'))):
        top = header_h + r * row_h
        d.text((pad, top + (css_h * dpr) // 2 - 7 * dpr), row_name, font=f_row, fill=INK)
        for c, (sku, title, fname) in enumerate(ITEMS):
            src = PLACEHOLDER if source == 'placeholder' else SINGLES / fname
            tile, mask = frame(src, css_w, css_h, dpr)
            x = pad + 90 * dpr + c * col
            canvas.paste(tile, (x, top), mask)
            ty = top + css_h * dpr + 6 * dpr
            d.text((x, ty), sku, font=f_sku, fill=SECONDARY)
            for i, line in enumerate(wrap(d, title, f_sku, col - 12 * dpr)[:2]):
                d.text((x, ty + (13 + 12 * i) * dpr), line, font=f_sku, fill=INK)
    out = DEST / name
    canvas.save(out, optimize=True)
    return out, canvas.size


if __name__ == '__main__':
    print(sheet(
        'shop-singles-desktop-76x94-before-after@2x.png', 'desktop (≥768 px)', 76, 94, 2,
        'Frame 76×94 CSS px: article grid column md:grid-cols-[76px_…] × ShopReservedFrame sm:h-[94px].',
    ))
    print(sheet(
        'shop-singles-mobile-64x80-before-after@3x.png', 'mobile (<640 px)', 64, 80, 3,
        'Frame 64×80 CSS px: article grid column grid-cols-[64px_…] × ShopReservedFrame h-20.',
    ))
