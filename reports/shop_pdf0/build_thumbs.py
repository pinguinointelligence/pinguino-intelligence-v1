#!/usr/bin/env python3
"""Shop images for the infopak "Gelato Base Ingredients" / "Składniki bazy lodów" (v1.1; owner spec E in
reports/GELLATTI_SHOP_RECONCILIATION_2026-09-17.md): PL and EN, a 4:5 product image (1200 × 1500) and a square listing
image (1080 × 1080).

Kept from the v1 images (E1): the gellatti wordmark (position, size, colour), the white background, Manrope, the token
colours #191A1D and #65635F, the margins, both formats, and the outlined pill top right at its current size.
Changed (E2–E6): no "75", no "COUNTRIES", no "Six base ingredients · 75 countries"; the title leads (weight 800, at most
two lines, upper half, where the "75" was), the benefit follows (weight 650, smaller than the title, larger than the
price), the pill reads "PDF · 0 €" / "PDF · €0", and one smaller #F0C44C circle sits in the lower right. No page count,
no description, no recipe information.
Checks (E7), written to build/thumbs_v1.1/thumbs_report.json: title lines and position, benefit on one line, no element
outside the margins and no overlaps (measured in the page), text contrast from the colours used (≥ 4.5:1), the
accent used once, and 25 % previews for a legibility look.

The v1 images (cover_thumb_4x5.png, cover_square_1080.png) are kept. Run build_guide.py first: it places the fonts and
the wordmark in build/.
usage: build_thumbs.py   →   build/thumbs_v1.1/infopak-{pl,en}-1200x1500.png, infopak-{pl,en}-1080.png
"""
import html, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build')
OUT = os.path.join(BUILD, 'thumbs_v1.1')
sys.path.insert(0, HERE)
from build_guide import CHROME, font_css  # noqa: E402

INK, TEXT2, PAPER, ACCENT = '#191a1d', '#65635f', '#ffffff', '#f0c44c'
COPY = {
    'pl': dict(title='Składniki bazy lodów', benefit='Co kupić i gdzie', pill='PDF · 0 €'),
    'en': dict(title='Gelato Base Ingredients', benefit='What to buy and where', pill='PDF · €0'),
}
# pad, wm, pill: unchanged from v1. title/benefit sizes are shared by PL and EN (no layout tuned to one language).
SIZES = {
    '1200x1500': dict(w=1200, h=1500, pad=96, wm=62, pill=26, titleTop=150, title=160, benefit=64, benefitGap=44, circle=300),
    '1080': dict(w=1080, h=1080, pad=80, wm=54, pill=23, titleTop=96, title=128, benefit=54, benefitGap=36, circle=220),
}

CSS = f"""
html, body {{ margin: 0; background: {PAPER}; }}
body {{ font-family: 'Manrope G', sans-serif; color: {INK}; }}
.t {{ position: relative; box-sizing: border-box; display: flex; flex-direction: column; background: {PAPER}; overflow: hidden; }}
.top {{ display: flex; justify-content: space-between; align-items: center; }}
.top img {{ display: block; width: auto; }}
.pill {{ font-weight: 750; letter-spacing: .12em; text-transform: uppercase; border: 2px solid {INK}; border-radius: 999px; white-space: nowrap; }}
.title {{ font-weight: 800; letter-spacing: -.035em; line-height: 1.02; color: {INK}; text-wrap: balance; }}
.benefit {{ font-weight: 650; letter-spacing: -.012em; line-height: 1.25; color: {INK}; white-space: nowrap; }}
.circle {{ position: absolute; border-radius: 50%; background: {ACCENT}; }}
"""

MEASURE = """
<script>
window.addEventListener('load', () => document.fonts.ready.then(() => {
  const q = s => document.querySelector(s), box = el => { const r = el.getBoundingClientRect();
    return {left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height}; };
  const t = q('.t'), cs = getComputedStyle(t), pad = parseFloat(cs.paddingLeft);
  const W = t.clientWidth, H = t.clientHeight;
  const lines = el => { const r = document.createRange(); r.selectNodeContents(el);
    return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size; };
  const els = {logo: q('.top img'), pill: q('.pill'), title: q('.title'), benefit: q('.benefit'), circle: q('.circle')};
  const boxes = Object.fromEntries(Object.entries(els).map(([k, el]) => [k, box(el)]));
  const outside = Object.entries(boxes).filter(([k, b]) => b.left < pad - .5 || b.top < pad - .5 || b.right > W - pad + .5 || b.bottom > H - pad + .5).map(([k]) => k);
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const names = Object.keys(boxes), overlaps = [];
  names.forEach((a, i) => names.slice(i + 1).forEach(b => { if (hit(boxes[a], boxes[b])) overlaps.push(a + '/' + b); }));
  const rep = {w: W, h: H, pad, boxes, titleLines: lines(els.title), benefitLines: lines(els.benefit),
    titleFontPx: parseFloat(getComputedStyle(els.title).fontSize), benefitFontPx: parseFloat(getComputedStyle(els.benefit).fontSize),
    pillFontPx: parseFloat(getComputedStyle(els.pill).fontSize), outside, overlaps,
    fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight),
    text: document.body.innerText.replace(/\\s+/g, ' ').trim()};
  const s = document.createElement('script'); s.type = 'application/json'; s.id = 'thumb-report';
  s.textContent = JSON.stringify(rep); document.body.appendChild(s);
}));
</script>"""


def page(s, c, lang):
    return f'''<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><style>{font_css('../fonts')}{CSS}</style></head><body>
<div class="t" style="width:{s['w']}px;height:{s['h']}px;padding:{s['pad']}px">
  <div class="top"><img src="../assets/wordmark-graphite.svg" alt="Gellatti" style="height:{s['wm']}px">
    <span class="pill" style="font-size:{s['pill']}px;padding:{round(s['pill'] * .5)}px {round(s['pill'] * 1.1)}px">{html.escape(c['pill'])}</span></div>
  <div class="title" style="margin-top:{s['titleTop']}px;font-size:{s['title']}px">{html.escape(c['title'])}</div>
  <div class="benefit" style="margin-top:{s['benefitGap']}px;font-size:{s['benefit']}px">{html.escape(c['benefit'])}</div>
  <div class="circle" aria-hidden="true" style="width:{s['circle']}px;height:{s['circle']}px;right:{s['pad']}px;bottom:{s['pad']}px"></div>
</div>{MEASURE}</body></html>'''


def chrome(args):
    # A custom --user-data-dir makes headless Chrome hang on this Mac; the default temporary profile works.
    return subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
                           '--virtual-time-budget=8000'] + args, capture_output=True, text=True, timeout=180)


def contrast(fg, bg):
    def lum(hexc):
        rgb = [int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
        return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
    a, b = sorted((lum(fg), lum(bg)), reverse=True)
    return round((a + 0.05) / (b + 0.05), 2)


def main():
    if not os.path.isdir(os.path.join(BUILD, 'fonts')):
        sys.exit('run build_guide.py first (it prepares build/fonts and build/assets)')
    os.makedirs(OUT, exist_ok=True)
    report, problems = {'contrast': {'title_and_benefit_#191a1d_on_white': contrast(INK, PAPER),
                                     'pill_#191a1d_on_white': contrast(INK, PAPER)}, 'images': {}}, []
    for lang, c in COPY.items():
        for size, s in SIZES.items():
            name = f'infopak-{lang}-{size}'
            src = os.path.join(OUT, name + '.html')
            open(src, 'w').write(page(s, c, lang))
            dom = chrome(['--dump-dom', 'file://' + src]).stdout
            m = re.search(r'<script type="application/json" id="thumb-report">(.*?)</script>', dom, re.S)
            if not m:
                sys.exit(f'{name}: measurement missing from the DOM dump')
            rep = json.loads(html.unescape(m.group(1)))
            png = os.path.join(OUT, name + '.png')
            if os.path.exists(png):
                os.remove(png)
            chrome(['--force-device-scale-factor=1', f'--window-size={s["w"]},{s["h"]}', f'--screenshot={png}', 'file://' + src])
            if not os.path.exists(png):
                sys.exit(f'{name}: screenshot not written')
            b = rep['boxes']
            checks = {
                'title_at_most_two_lines': rep['titleLines'] <= 2,
                'title_in_upper_half': b['title']['bottom'] <= s['h'] / 2,
                'benefit_one_line': rep['benefitLines'] == 1,
                'benefit_smaller_than_title_larger_than_pill': rep['titleFontPx'] > rep['benefitFontPx'] > rep['pillFontPx'],
                'circle_in_lower_right': b['circle']['top'] >= s['h'] / 2 and b['circle']['left'] >= s['w'] / 2,
                'inside_margins': not rep['outside'],
                'no_overlaps': not rep['overlaps'],
                'no_75_no_countries_no_page_count': not re.search(r'75|countr|kraj|page|stron', rep['text'], re.I),
                'text_is_only_pill_title_benefit': rep['text'] == f"{c['pill']} {c['title']} {c['benefit']}",
                'manrope_loaded': any(f.startswith('Manrope G') for f in rep['fonts']),
            }
            try:                                   # 25 % preview for the legibility look (E7); optional dependency
                from PIL import Image
                im = Image.open(png).convert('RGB')
                small = im.resize((round(im.width / 4), round(im.height / 4)), Image.LANCZOS)
                small.save(os.path.join(OUT, name + '-25pct.png'))
                colours = {f'#{r:02x}{g:02x}{bl:02x}' for r, g, bl in im.getdata()}
                near_accent = {h for h in colours if all(abs(int(h[i:i + 2], 16) - int(ACCENT[i:i + 2], 16)) <= 2 for i in (1, 3, 5))}
                old_orange = {h for h in colours if all(abs(int(h[i:i + 2], 16) - int('#f58a07'[i:i + 2], 16)) <= 12 for i in (1, 3, 5))}
                checks['accent_present_no_old_orange'] = bool(near_accent) and not old_orange
                rep['preview_25pct'] = name + '-25pct.png'
            except ImportError:
                rep['preview_25pct'] = 'PIL not installed: no preview'
            rep['checks'] = checks
            report['images'][name + '.png'] = rep
            bad = [k for k, v in checks.items() if not v]
            problems += [f'{name}: {k}' for k in bad]
            print(name + '.png', f'{s["w"]}×{s["h"]}', 'title lines', rep['titleLines'], 'checks', 'PASS' if not bad else 'FAIL ' + ', '.join(bad))
    report['contrast_min_ok'] = min(report['contrast'].values()) >= 4.5
    json.dump(report, open(os.path.join(OUT, 'thumbs_report.json'), 'w'), ensure_ascii=False, indent=1)
    print('contrast', report['contrast'], '≥ 4.5:1' if report['contrast_min_ok'] else 'BELOW 4.5:1')
    if problems or not report['contrast_min_ok']:
        sys.exit('thumbnail checks failed: ' + '; '.join(problems))


if __name__ == '__main__':
    main()
