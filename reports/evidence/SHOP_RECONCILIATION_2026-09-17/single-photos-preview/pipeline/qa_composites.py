"""QA composites: each cut-out in the real ShopReservedFrame geometry.

Frame (ShopPackaging.tsx + ShopProductCard.tsx):
  mobile   grid column 64px, h-20 (80px)
  desktop  md:grid-cols-[76px_...] (76px), sm:h-[94px]
  rounded-[8px], bg var(--g-ivory) #fbfaf7, overflow-hidden,
  <img class="absolute inset-0 h-full w-full object-contain"> (no blend)
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'out'
QA = ROOT / 'qa'
QA.mkdir(exist_ok=True)

IVORY = (0xFB, 0xFA, 0xF7)
GRAPHITE = (0x19, 0x1A, 0x1D)
FRAMES = {'mobile': (64, 80), 'desktop': (76, 94)}
ITEMS = [
    ('GEL-DEX-500', 'dextrose.png'),
    ('GEL-FRU-500', 'fructose.png'),
    ('GEL-INU-500', 'inulin.png'),
    ('GEL-STB-500', 'gellatti-stabilizer.png'),
    ('GEL-YOL-500', 'dried-egg-yolk.png'),
    ('GEL-SMP-500', 'skimmed-milk-powder.png'),
    ('GEL-CRP-500', 'cream-powder-42.png'),
]
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'


def render_frame(src_rgba, css_w, css_h, dpr, ground):
    """One frame at a device pixel ratio: rounded ivory slot + contained image."""
    W, H = css_w * dpr, css_h * dpr
    side = min(W, H)  # object-contain of a square image
    img = src_rgba.convert('RGBa').resize((side, side), Image.LANCZOS).convert('RGBA')
    tile = Image.new('RGBA', (W, H), ground + (255,))
    tile.alpha_composite(img, ((W - side) // 2, (H - side) // 2))
    mask = Image.new('L', (W * 4, H * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, W * 4 - 1, H * 4 - 1), radius=8 * dpr * 4, fill=255)
    mask = mask.resize((W, H), Image.LANCZOS)
    return tile, mask


def qa_sheet(ground, page, name):
    cell_w, cell_h = 76 * 3 + 24, 94 * 3 + 40
    font = ImageFont.truetype(FONT, 14)
    rows = [(f, d) for d in (1, 2, 3) for f in ('mobile', 'desktop')]
    sheet = Image.new('RGB', (len(ITEMS) * cell_w + 110, len(rows) * cell_h + 30), page)
    dr = ImageDraw.Draw(sheet)
    ink = (60, 60, 60) if sum(page) > 380 else (200, 200, 200)
    for c, (sku, fname) in enumerate(ITEMS):
        dr.text((110 + c * cell_w + 4, 6), sku, fill=ink, font=font)
    for r, (frame, dpr) in enumerate(rows):
        dr.text((6, 30 + r * cell_h + 60), f'{frame}\n@{dpr}x', fill=ink, font=font)
        for c, (sku, fname) in enumerate(ITEMS):
            src = Image.open(OUT / fname)
            css_w, css_h = FRAMES[frame]
            tile, mask = render_frame(src, css_w, css_h, dpr, ground)
            # magnify to a common 3x CSS scale with NEAREST so device pixels stay visible
            k = 3 // dpr if 3 % dpr == 0 else None
            if k is None:  # 2x -> 3x is not an integer; show at 2x, centred
                k = 1
            tile = tile.resize((tile.width * k, tile.height * k), Image.NEAREST)
            mask = mask.resize((mask.width * k, mask.height * k), Image.NEAREST)
            x = 110 + c * cell_w + (cell_w - tile.width) // 2
            y = 30 + r * cell_h + (cell_h - tile.height) // 2
            sheet.paste(tile.convert('RGB'), (x, y), mask)
    sheet.save(QA / name)
    return sheet.size


def full_sheet(ground, name):
    sheet = Image.new('RGB', (4 * 512 + 50, 2 * 512 + 30), ground)
    for i, (sku, fname) in enumerate(ITEMS):
        im = Image.open(OUT / fname)
        tile = Image.new('RGBA', (512, 512), ground + (255,))
        tile.alpha_composite(im)
        sheet.paste(tile.convert('RGB'), (10 + (i % 4) * 522, 10 + (i // 4) * 522))
    sheet.save(QA / name)


if __name__ == '__main__':
    print(qa_sheet(IVORY, (255, 255, 255), 'frames_ivory.png'))
    print(qa_sheet(GRAPHITE, (40, 40, 44), 'frames_graphite.png'))
    full_sheet(IVORY, 'full512_ivory.png')
    full_sheet(GRAPHITE, 'full512_graphite.png')
    print('ok')
