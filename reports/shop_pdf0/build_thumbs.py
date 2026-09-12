#!/usr/bin/env python3
"""Shop images for the free Gelato Base Guide: a 4:5 product image (1200 × 1500, the Shop's product frame ratio) and a
square listing image (1080 × 1080). They use the PDF cover's design and the fonts and wordmark that build_guide.py
places in build/. Run build_guide.py first.

usage: build_thumbs.py   →   cover_thumb_4x5.png, cover_square_1080.png
"""
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build')
sys.path.insert(0, HERE)
from build_guide import CHROME, font_css  # noqa: E402

CSS = """
html, body { margin: 0; background: #ffffff; }
body { font-family: 'Manrope G', sans-serif; color: #191a1d; }
.t { position: relative; box-sizing: border-box; display: flex; flex-direction: column; background: #ffffff; overflow: hidden; }
.top { display: flex; justify-content: space-between; align-items: center; }
.top img { display: block; width: auto; }
.pill { font-weight: 750; letter-spacing: .12em; text-transform: uppercase; border: 2px solid #191a1d; border-radius: 999px; }
.hero { position: relative; flex: none; }
.scoop { position: absolute; border-radius: 50%; background: #f0c44c; }
.num { position: absolute; left: -.03em; top: 0; line-height: .8; font-weight: 800; letter-spacing: -.07em; mix-blend-mode: multiply; }
.lab { position: absolute; left: .1em; font-weight: 750; letter-spacing: .18em; text-transform: uppercase; }
.title { margin-top: auto; font-weight: 800; letter-spacing: -.03em; line-height: 1.02; }
.sub { color: #65635f; line-height: 1.35; }
"""

SIZES = {
    'cover_thumb_4x5.png': dict(w=1200, h=1500, pad=96, wm=62, pill=26, heroTop=150, heroH=600, sc=520, scL=470, scT=-12,
                                num=630, labT=528, lab=30, title=124, sub=44),
    'cover_square_1080.png': dict(w=1080, h=1080, pad=80, wm=54, pill=23, heroTop=64, heroH=470, sc=420, scL=424, scT=-10,
                                  num=500, labT=418, lab=26, title=96, sub=36),
}


def page(s):
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><style>{font_css('fonts')}{CSS}</style></head><body>
<div class="t" style="width:{s['w']}px;height:{s['h']}px;padding:{s['pad']}px">
  <div class="top"><img src="assets/wordmark-graphite.svg" alt="Gellatti" style="height:{s['wm']}px">
    <span class="pill" style="font-size:{s['pill']}px;padding:{round(s['pill'] * .5)}px {round(s['pill'] * 1.1)}px">Free guide · 0 €</span></div>
  <div class="hero" style="margin-top:{s['heroTop']}px;height:{s['heroH']}px">
    <div class="scoop" style="left:{s['scL']}px;top:{s['scT']}px;width:{s['sc']}px;height:{s['sc']}px"></div>
    <div class="num" style="font-size:{s['num']}px">75</div>
    <div class="lab" style="top:{s['labT']}px;font-size:{s['lab']}px">countries</div>
  </div>
  <div class="title" style="font-size:{s['title']}px">Gelato Base Guide</div>
  <div class="sub" style="font-size:{s['sub']}px;margin-top:{round(s['sub'] * .5)}px">Six base ingredients · 75 countries</div>
</div></body></html>'''


def main():
    if not os.path.isdir(os.path.join(BUILD, 'fonts')):
        sys.exit('run build_guide.py first (it prepares build/fonts and build/assets)')
    for name, s in SIZES.items():
        src = os.path.join(BUILD, name.replace('.png', '.html'))
        open(src, 'w').write(page(s))
        out = os.path.join(HERE, name)
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--virtual-time-budget=8000',
                        '--force-device-scale-factor=1', f'--window-size={s["w"]},{s["h"]}', f'--screenshot={out}', 'file://' + src],
                       capture_output=True, text=True, timeout=120)
        print(name, 'OK' if os.path.exists(out) else 'MISSING', os.path.getsize(out) if os.path.exists(out) else '')


if __name__ == '__main__':
    main()
