#!/usr/bin/env python3
"""GELLATTI SHOP — the free 0 € PDF per country and language: the seven Starter Pack items with local equivalents.

Owner correction 2026-09-17: one PDF per market, in the market's language, listing all seven Starter Pack items
(dextrose, skim milk powder, cream powder, fructose, inulin, dried egg yolk, stabilizer) with local equivalents.

Sources, never mixed up:
  - DEX, SMP and STB: the owner's v23 selections (via ../shop_pdf0/guide_dataset_v1.1.json → v23_rows.json).
    STB is the v23 stabilizer slot, shown as a local alternative to the Gellatti Stabilizer (owner decision).
  - CRP, FRU, INU, YOL: SHOP research (research/<ISO>.json, protocol RESEARCH_PROTOCOL.md). A research product reaches a
    customer PDF only when acceptance.json accepts it (owner acceptance). Nothing is guessed or completed.

Modes:
  --draft     review build: uses rank-1/2 research candidates that are not accepted yet, marks every page
              "draft · proposals for acceptance" and never writes a publishable manifest entry.
  (default)   publishable build: every one of the seven items must have at least one accepted product, else the
              market/locale is skipped and reported.

usage: build_starter_local.py [--draft] [--iso PL,DE] [--locale pl] [--node-modules DIR] [--no-pdf]
Outputs: build/starter_local/<ISO>/<locale>/ (html, pdf, layout.json) and build/starter_local/manifest[_draft].json
"""
import argparse, hashlib, html, json, os, re, shutil, subprocess, sys
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build', 'starter_local')
GUIDE = os.path.join(HERE, '..', 'shop_pdf0')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
DEFAULT_NODE_MODULES = os.path.expanduser('~/Developer/pinguino-intelligence-v1/node_modules')
VERSION = '1.0'
ITEMS = ['DEX', 'SMP', 'CRP', 'FRU', 'INU', 'YOL', 'STB']
STARTER_GRAMS = {'DEX': 250, 'SMP': 250, 'CRP': 125, 'FRU': 125, 'INU': 125, 'YOL': 125, 'STB': 125}
RESEARCHED = {'CRP', 'FRU', 'INU', 'YOL'}
V23_ITEMS = {'DEX', 'SMP', 'STB'}
CUSTOMER_CLASSES = {'CONFIRMED_LOCAL', 'VERIFIED_CROSS_BORDER'}
RTL = {'ar', 'he', 'ur'}

UNIT_NBSP = re.compile(r'(\d)\s+(g|kg|ml|l|L|oz|lb|%)\b')
# A right-to-left run keeps a number that leads it ("250 غ في" stays one run) and ends on a right-to-left letter or closing
# punctuation, so a trailing number with a Latin unit ("… 500 g") stays outside it.
RTL_RUN = re.compile(r'(?:\d[\d.,]*\s*)?[\u0590-\u08FF](?:[\u0590-\u08FF\s\d.,()\-–/%]*[\u0590-\u08FF.)])?')


def E(s):
    out = UNIT_NBSP.sub('\\1\u00a0\\2', html.escape(str(s)))
    return RTL_RUN.sub(lambda m: f'<bdi>{m.group(0)}</bdi>', out)


def host(url):
    h = urlparse(url).netloc.lower()
    return h[4:] if h.startswith('www.') else h


def pack_quantity(text):
    """The quantity part of a pack description, language-neutral ("torebka 12 oz (340 g)" → "12 oz (340 g)")."""
    t = str(text or '').strip()
    m = re.search(r'(\d[\d.,]*\s*(?:×|x)\s*)?\d[\d.,]*\s*(?:g|kg|ml|l|L|oz|lb|lbs|gr)\b(\s*\(\s*\d[\d.,]*\s*(?:g|kg|ml|l|L)\s*\))?', t)
    return m.group(0).strip() if m else t


def sha256(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


# ─────────────────────────────── data ───────────────────────────────
def load(path, default=None):
    return json.load(open(path)) if os.path.exists(path) else default


def v23_products(row, code):
    if not row:
        return []
    tags = []
    if 'From abroad' in (row.get('tags') or []):
        tags.append('from_abroad')
    if 'B2B' in (row.get('tags') or []):
        tags.append('b2b')
    if code == 'STB':
        tags.append('alternative')
    return [{
        'source': 'V23', 'rank': 1, 'brand': row.get('brand_v23') or '', 'name': row.get('product_v23') or '',
        'pack': pack_quantity(row.get('pack_v23')), 'gtin': row.get('ean_v23') or '', 'code': row.get('code') or '',
        'links': [{'url': l['url'], 'label': host(l['url'])} for l in (row.get('links') or [])][:2],
        'tags': tags, 'composition': None, 'evidence_class': 'OWNER_V23', 'accepted': True,
    }]


def research_products(item, accepted_ranks, draft):
    out = []
    for c in (item or {}).get('candidates', [])[:2]:
        rank = c.get('rank')
        accepted = rank in accepted_ranks
        cls = c.get('evidence_class')
        if not accepted and not (draft and cls in CUSTOMER_CLASSES | {'LEAD'}):
            continue
        tags = []
        if c.get('cross_border'):
            tags.append('from_abroad')
        if c.get('equivalence') == 'B_SAME_TYPE_DIFFERENT_COMPOSITION':
            tags.append('other_composition')
        if cls == 'LEAD':
            tags.append('unconfirmed')
        links = [{'url': c['url'], 'label': host(c['url'])}] if c.get('url') else []
        comp = c.get('composition') or {}
        # A researcher's remark in parentheses is evidence context, never part of the brand a customer reads.
        brand = re.sub(r'\s*\([^)]*\)', '', c.get('brand') or '').strip()
        out.append({
            'source': 'RESEARCH', 'rank': rank, 'brand': brand, 'name': c.get('product_name') or '',
            'pack': pack_quantity(c.get('pack')), 'gtin': c.get('gtin') or '', 'code': '', 'links': links, 'tags': tags,
            'composition': {'fat_g': comp.get('fat_g')}, 'evidence_class': cls, 'accepted': accepted,
        })
    return out


def market_rows(iso, v23, research_dir, acceptance, draft):
    rows = {}
    research = load(os.path.join(research_dir, f'{iso}.json'), {}) or {}
    for code in ITEMS:
        if code in V23_ITEMS:
            rows[code] = v23_products(v23.get(iso, {}).get(code), code)
        else:
            decision = (acceptance.get(iso) or {}).get(code) or {}
            ranks = set(decision.get('accepted_ranks') or []) if decision.get('decision') == 'ACCEPT' else set()
            rows[code] = research_products((research.get('items') or {}).get(code), ranks, draft)
    return rows


# ─────────────────────────────── html ───────────────────────────────
def font_css(fonts_rel):
    ranges = {
        'latin': 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
        'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
        'cyrillic': 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
        'cyrillic-ext': 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F',
        'greek': 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF',
        'vietnamese': 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
    }
    faces = [f"@font-face{{font-family:'Manrope G';font-style:normal;font-weight:200 800;font-display:block;"
             f"src:url({fonts_rel}/manrope-{sub}-wght-normal.woff2) format('woff2-variations');unicode-range:{rng}}}"
             for sub, rng in ranges.items()]
    faces += [f"@font-face{{font-family:'Plex G';font-style:normal;font-weight:{w};font-display:block;"
              f"src:url({fonts_rel}/ibm-plex-mono-latin-{w}-normal.woff2) format('woff2')}}" for w in (400, 500, 600)]
    return '\n'.join(faces)


CSS = r"""
@page { size: 120mm 210mm; margin: 0; }
:root {
  --paper: #ffffff; --ink: #191a1d; --ink-deep: #101113; --text2: #65635f; --muted: #77736c;
  --line: #ded9d0; --line-strong: #cfcac1; --line-quiet: #e8e4dd; --ivory-deep: #f6f4ef;
  --brand-ivory: #efe8dc; --accent: #f0c44c; --accent-line: #b88a0f; --accent-ink: #7a5c0a; --graphite: #191a1d;
  --sans: 'Manrope G', 'Hiragino Sans', 'PingFang SC', 'PingFang TC', 'Apple SD Gothic Neo', 'Geeza Pro', 'Arial Hebrew',
    'Thonburi', 'Kohinoor Bangla', 'Kohinoor Devanagari', 'Tamil Sangam MN', 'Sinhala Sangam MN', 'Noto Nastaliq Urdu', sans-serif;
  --mono: 'Plex G', ui-monospace, monospace;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--paper); }
body { font-family: var(--sans); color: var(--ink); font-size: 9pt; line-height: 1.4; font-weight: 450;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; font-kerning: normal; }
a { color: inherit; text-decoration: none; }
h1, h2, h3, p { margin: 0; }
.page { width: 120mm; height: 210mm; position: relative; overflow: hidden; break-after: page; page-break-after: always;
  padding: 8.5mm 9mm 7.5mm; display: flex; flex-direction: column; background: var(--paper); }
.page:last-of-type { break-after: auto; page-break-after: auto; }
.flow { flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.draft { position: absolute; left: 0; right: 0; top: 0; background: var(--accent); color: var(--ink-deep); text-align: center;
  font-size: 6.4pt; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; padding: 1mm 0 .8mm; }
.run { display: flex; align-items: center; justify-content: space-between; height: 5mm; margin-bottom: 4.6mm; flex: none; }
.run img { height: 3.3mm; width: auto; display: block; }
.run span { font-size: 6.3pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
.foot { display: flex; align-items: baseline; justify-content: space-between; padding-top: 2.6mm; margin-top: auto; flex: none;
  border-top: .5pt solid var(--line-quiet); font-size: 7pt; color: var(--muted); }
.pno { font-family: var(--mono); font-weight: 500; font-size: 7pt; color: var(--muted); letter-spacing: .04em; }
.h1 { font-size: 19pt; font-weight: 800; letter-spacing: -.025em; line-height: 1.08; text-wrap: balance; }
.lede { margin-top: 2.6mm; font-size: 9.5pt; line-height: 1.45; color: var(--text2); max-width: 94mm; }

/* cover */
.cover { padding: 11mm 10mm 10mm; }
.cv-top { display: flex; justify-content: space-between; align-items: center; }
.cv-top img { height: 6.2mm; }
.cv-free { font-size: 7pt; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; color: var(--ink);
  border: .7pt solid var(--ink); border-radius: 99px; padding: 1.1mm 2.6mm 1mm; white-space: nowrap; }
.cv-head { margin-top: 24mm; flex: none; }
.cv-title { font-size: 34pt; font-weight: 800; letter-spacing: -.035em; line-height: 1.04; text-wrap: balance; }
.cv-benefit { margin-top: 4mm; font-size: 15pt; font-weight: 650; letter-spacing: -.012em; line-height: 1.25; }
.cv-market { margin-top: 7mm; display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 4mm; row-gap: 1.2mm; font-size: 9pt; }
.cv-market dt { font-size: 6.4pt; font-weight: 750; letter-spacing: .15em; text-transform: uppercase; color: var(--muted); padding-top: 1.2mm; }
.cv-market dd { margin: 0; font-size: 13pt; font-weight: 750; letter-spacing: -.01em; }
.cv-scoop { position: absolute; right: 10mm; top: 122mm; width: 26mm; height: 26mm; border-radius: 50%; background: var(--accent); }
.cv-text { margin-top: auto; }
.cv-items-t { font-size: 6.4pt; font-weight: 750; letter-spacing: .15em; text-transform: uppercase; color: var(--muted); }
.cv-seven { list-style: none; margin: 2.6mm 0 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 6mm; }
.cv-seven li { font-size: 8.6pt; font-weight: 650; padding: 1.6mm 0 1.4mm; border-top: .5pt solid var(--line); }
.cv-foot { margin-top: 8mm; display: flex; justify-content: space-between; font-size: 7pt; color: var(--muted); letter-spacing: .03em; }

/* how to use */
.steps { list-style: none; margin: 5mm 0 0; padding: 0; counter-reset: s; }
.steps li { counter-increment: s; display: grid; grid-template-columns: 9mm minmax(0, 1fr); padding: 2.9mm 0 3.1mm; border-top: .5pt solid var(--line); }
.steps li::before { content: counter(s); font-family: var(--mono); font-size: 9pt; font-weight: 600; color: var(--accent-ink); padding-top: .4mm; }
.steps b { display: block; font-size: 10.4pt; font-weight: 750; letter-spacing: -.01em; margin-bottom: .8mm; }
.steps p { font-size: 8.9pt; color: var(--text2); line-height: 1.45; }
.box { margin-top: 3.6mm; background: var(--ivory-deep); border-radius: 2.2mm; padding: 3.4mm 4.2mm 3.6mm; }
.box .t { font-size: 6.4pt; font-weight: 750; letter-spacing: .15em; text-transform: uppercase; color: var(--muted); margin-bottom: 1.8mm; }
.lg { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 2.4mm; row-gap: 1.5mm; align-items: baseline; font-size: 8.2pt; color: var(--text2); }
.tag { display: inline-block; font-size: 5.9pt; font-weight: 780; letter-spacing: .09em; text-transform: uppercase;
  color: var(--text2); background: var(--ivory-deep); border: .5pt solid var(--line-strong); border-radius: 1.2mm;
  padding: .35mm 1.2mm .25mm; white-space: nowrap; }
.box .tag { background: var(--paper); }

/* items */
.rows { flex: 1 1 auto; min-height: 0; overflow: hidden; }
.item { padding: 2.2mm 0 2.4mm; border-top: .5pt solid var(--line-quiet); break-inside: avoid; }
.item:first-child { border-top: .8pt solid var(--ink); }
.ih { display: flex; align-items: baseline; justify-content: space-between; gap: 3mm; }
.iname { font-size: 11.4pt; font-weight: 800; letter-spacing: -.015em; line-height: 1.2; }
.igr { font-family: var(--mono); font-size: 7pt; font-weight: 500; color: var(--muted); white-space: nowrap; }
.iref { margin-top: .5mm; font-size: 7.9pt; line-height: 1.35; color: var(--muted); }
.opt { margin-top: 1.7mm; display: grid; grid-template-columns: 5mm minmax(0, 1fr); column-gap: 1.6mm; }
.on { font-family: var(--mono); font-size: 7.4pt; font-weight: 600; color: var(--accent-ink); padding-top: .5mm; }
.pname { font-size: 9.8pt; font-weight: 680; line-height: 1.24; letter-spacing: -.01em; overflow-wrap: anywhere; }
.pmeta { margin-top: .5mm; display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 2.4mm; row-gap: .4mm; font-size: 7.9pt; color: var(--text2); }
.pmeta > * { min-width: 0; max-width: 100%; }
.code { font-family: var(--mono); font-size: 7.7pt; font-weight: 500; color: var(--ink); white-space: nowrap; }
.code i { font-style: normal; font-family: var(--sans); font-size: 5.9pt; font-weight: 780; letter-spacing: .11em; text-transform: uppercase; color: var(--muted); margin-inline-end: 1mm; }
.src { color: var(--text2); border-bottom: .5pt solid var(--line-strong); overflow-wrap: anywhere; }
.arr { width: 5.2pt; height: 5.2pt; margin-inline-start: .9pt; vertical-align: .2pt; color: var(--accent-line); }
.ptags { margin-top: .7mm; display: flex; flex-wrap: wrap; gap: 1.2mm; }
.pnote { margin-top: .6mm; font-size: 7.5pt; line-height: 1.33; color: var(--muted); }
.miss { margin-top: 1.4mm; font-size: 8.4pt; color: var(--accent-ink); font-weight: 650; }
bdi, .pmeta > span { unicode-bidi: isolate; }
.page.tight .item { padding: 1.6mm 0 1.8mm; }
.page.tight .opt { margin-top: 1.2mm; }
.page.tighter .pname { font-size: 9.2pt; }
.page.tighter .iref, .page.tighter .pmeta { font-size: 7.4pt; }

/* notes + back */
.nt { margin-top: 4mm; }
.nt div { padding: 2.4mm 0 2.5mm; border-top: .5pt solid var(--line); }
.nt .h { font-size: 9.4pt; font-weight: 750; color: var(--ink); line-height: 1.3; }
.nt p { margin-top: .6mm; font-size: 8.3pt; line-height: 1.42; color: var(--text2); }
.fine { margin-top: auto; padding-top: 3mm; font-size: 6.9pt; line-height: 1.45; color: var(--muted); }
.back { background: var(--graphite); color: var(--brand-ivory); padding: 11mm 10mm 10mm; }
.back img { height: 6.2mm; width: auto; align-self: flex-start; }
.bk-body { margin-top: auto; }
.bk-h { font-size: 26pt; font-weight: 800; letter-spacing: -.035em; line-height: 1.04; color: var(--brand-ivory); text-wrap: balance; }
.bk-p { margin-top: 4mm; font-size: 10pt; line-height: 1.45; color: #cfc8bb; max-width: 92mm; }
.bk-btn { margin-top: 8mm; display: inline-flex; align-self: flex-start; align-items: center; gap: 2mm; background: var(--accent); color: var(--ink-deep);
  font-size: 10pt; font-weight: 800; border-radius: 2mm; padding: 2.8mm 4.4mm 2.6mm; }
.bk-foot { margin-top: 12mm; padding-top: 3mm; border-top: .5pt solid #3a3934; font-size: 6.9pt; line-height: 1.5; color: #9f998e; }
[dir="rtl"] .opt { direction: rtl; }
/* Joined and shaped scripts (Arabic, Urdu, Hebrew, Indic, Sinhala, Thai) and CJK: tracking would pull letters apart. */
:lang(ar) *, :lang(ur) *, :lang(he) *, :lang(hi) *, :lang(bn) *, :lang(ta) *, :lang(si) *, :lang(th) *,
:lang(ja) *, :lang(ko) *, :lang(zh) * { letter-spacing: 0 !important; }
"""

LAYOUT_JS = r"""
<script>
window.addEventListener('load', () => document.fonts.ready.then(() => {
  const out = [];
  document.querySelectorAll('.page').forEach((p, i) => {
    const flow = p.querySelector('.rows, .flow');
    const over = flow ? Math.round(flow.scrollHeight - flow.clientHeight) : 0;
    const pageOver = Math.round(p.scrollHeight - p.clientHeight);
    const wide = [];
    const pr = p.getBoundingClientRect(), cs = getComputedStyle(p);
    const right = pr.right - parseFloat(cs.paddingRight) + 0.5, left = pr.left + parseFloat(cs.paddingLeft) - 0.5;
    p.querySelectorAll('.pname,.pmeta > *,.iref,.iname,.pnote,.tag,.steps p,.nt p,.bk-p,.cv-title,.cv-benefit,.cv-seven li,.lg > *,.fine,.cv-market dd').forEach(el => {
      const r = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 1) wide.push('wide ' + el.className + ': ' + el.textContent.trim().slice(0, 40));
      if (r.width && (r.right > right || r.left < left)) wide.push('outside ' + el.className + ': ' + el.textContent.trim().slice(0, 40));
    });
    out.push({page: i + 1, id: p.id || '', flowOverflowPx: over, pageOverflowPx: pageOver, wide});
  });
  const s = document.createElement('script'); s.type = 'application/json'; s.id = 'layout-report';
  s.textContent = JSON.stringify({pages: out}); document.body.appendChild(s);
}));
</script>
"""

ARROW = ('<svg class="arr" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.2 2.2h4.6v4.6M7.8 2.2 2.4 7.6" '
         'fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>')


def fmt_num(v):
    if v is None:
        return ''
    f = float(v)
    return str(int(f)) if f == int(f) else f'{f:.1f}'


def product_html(p, S, n):
    # Product data is isolated (<bdi>, direction from its own first letter): in a right-to-left document "1 lb (454 g)"
    # or a Latin product name must not be reordered by the surrounding paragraph.
    meta = []
    if p['brand'] and p['brand'].lower() not in p['name'].lower():
        meta.append(f'<span><bdi>{E(p["brand"])}</bdi></span>')
    if p['pack']:
        meta.append(f'<span><bdi>{E(p["pack"])}</bdi></span>')
    if p['gtin']:
        meta.append(f'<span class="code"><i>{E(S["ean"])}</i><bdi>{E(p["gtin"])}</bdi></span>')
    for l in p['links']:
        meta.append(f'<a class="src" href="{html.escape(l["url"], quote=True)}"><bdi>{E(l["label"])}</bdi>{ARROW}</a>')
    tags = ''.join(f'<span class="tag">{E(S["tag_" + t])}</span>' for t in p['tags'])
    note = ''
    if 'other_composition' in p['tags'] and p['composition'] and p['composition'].get('fat_g') is not None:
        note = f'<p class="pnote">{E(S["fat"])} {E(fmt_num(p["composition"]["fat_g"]))}%</p>'
    return (f'<div class="opt"><span class="on">{n}</span><div><p class="pname"><bdi>{E(p["name"])}</bdi></p>'
            f'<div class="pmeta">{"".join(meta)}</div>'
            + (f'<div class="ptags">{tags}</div>' if tags else '') + note + '</div></div>')


def item_html(code, products, S, draft):
    it = S['items'][code]
    body = ''.join(product_html(p, S, i + 1) for i, p in enumerate(products[:2]))
    if not products:
        body = f'<p class="miss">{E(S["missing"])}</p>'
    extra = f'<p class="pnote">{E(S["stabilizer_note"])}</p>' if code == 'STB' and products else ''
    return (f'<article class="item" id="item-{code}"><div class="ih"><h2 class="iname">{E(it["name"])}</h2>'
            f'<span class="igr">{E(S["starter_amount"].replace("{g}", str(STARTER_GRAMS[code])))}</span></div>'
            f'<p class="iref">{E(it["ref"])}</p>{body}{extra}</article>')


def page_shell(pid, inner, S, draft, run=True, no=None, cls=''):
    banner = f'<div class="draft">{E(S["draft"])}</div>' if draft else ''
    header = (f'<header class="run"><img src="assets/wordmark-graphite.svg" alt="Gellatti"><span>{E(S["title"])}</span></header>'
              if run else '')
    footer = f'<footer class="foot"><span></span><span class="pno">{no}</span></footer>' if no else ''
    return f'<section class="page{cls}" id="{pid}">{banner}{header}{inner}{footer}</section>'


def build_pages(iso, country_name, language_name, rows, S, draft, split, fit):
    seven = ''.join(f'<li>{E(S["items"][c]["name"])}</li>' for c in ITEMS)
    banner = f'<div class="draft">{E(S["draft"])}</div>' if draft else ''
    cover = f'''<section class="page cover" id="cover">{banner}
  <div class="cv-top"><img src="assets/wordmark-graphite.svg" alt="Gellatti"><span class="cv-free">{E(S["pill"])}</span></div>
  <div class="cv-head"><div class="cv-title">{E(S["title"])}</div><p class="cv-benefit">{E(S["benefit"])}</p>
  <dl class="cv-market"><dt>{E(S["country_label"])}</dt><dd>{E(country_name)}</dd><dt>{E(S["language_label"])}</dt><dd>{E(language_name)}</dd></dl></div>
  <div class="cv-scoop" aria-hidden="true"></div>
  <div class="cv-text"><p class="cv-items-t">{E(S["cover_items_title"])}</p><ul class="cv-seven">{seven}</ul></div>
  <div class="cv-foot"><span>{E(S["edition"])}</span><span>gellatti.com</span></div>
</section>'''
    steps = ''.join(f'<li><div><b>{E(s["b"])}</b><p>{E(s["p"])}</p></div></li>' for s in S['steps'])
    legend = ''.join(f'<span class="tag">{E(S["tag_" + k])}</span><span>{E(v)}</span>' for k, v in S['legend'].items())
    howto = page_shell('how-to-use', f'''<div class="flow"><h1 class="h1">{E(S["howto_title"])}</h1><p class="lede">{E(S["howto_lede"])}</p>
  <ol class="steps">{steps}</ol><div class="box"><p class="t">{E(S["legend_title"])}</p><div class="lg">{legend}</div></div></div>''', S, draft, no=2)
    item_pages = []
    for i, codes in enumerate(split):
        pid = f'items-{i + 1}'
        extra = (' tight' + (' tighter' if fit.get(pid, 0) > 1 else '')) if fit.get(pid) else ''
        rows_html = ''.join(item_html(c, rows[c], S, draft) for c in codes)
        item_pages.append(page_shell(pid, f'<div class="rows">{rows_html}</div>', S, draft, no=3 + i, cls=extra))
    notes = ''.join(f'<div><p class="h">{E(n["h"])}</p><p>{E(n["p"])}</p></div>' for n in S['notes'])
    notes_page = page_shell('notes', f'<div class="flow"><h1 class="h1">{E(S["notes_title"])}</h1><div class="nt">{notes}</div><p class="fine">{E(S["fine"])}</p></div>',
                            S, draft, no=3 + len(split))
    back = f'''<section class="page back" id="back">{banner}<img src="assets/wordmark-ivory.svg" alt="Gellatti">
  <div class="bk-body"><p class="bk-h">{E(S["back_h"])}</p><p class="bk-p">{E(S["back_p"])}</p>
  <a class="bk-btn" href="https://www.gellatti.com">{E(S["back_link"])}{ARROW}</a></div>
  <p class="bk-foot">{E(S["edition"])} · {E(country_name)} · {E(language_name)}</p></section>'''
    return cover + howto + ''.join(item_pages) + notes_page + back


def document(iso, country_name, language_name, rows, S, draft, split, fit):
    lang = S['locale']
    return f'''<!doctype html><html lang="{lang}" dir="{S.get("dir", "ltr")}"><head><meta charset="utf-8">
<title>Gellatti — {E(S["title"])} · {E(country_name)}</title>
<meta name="author" content="Gellatti">
<style>{font_css('../../fonts')}{CSS}</style></head><body>
{build_pages(iso, country_name, language_name, rows, S, draft, split, fit)}
{LAYOUT_JS}
</body></html>'''


# ─────────────────────────────── output ───────────────────────────────
def chrome(args, attempts=3):
    """One headless Chrome run. A run that hangs is killed after 90 s and retried (a hung run once stopped a 108-document build)."""
    base = [CHROME, '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--virtual-time-budget=8000']
    for attempt in range(attempts):
        try:
            return subprocess.run(base + args, capture_output=True, text=True, timeout=90)
        except subprocess.TimeoutExpired:
            if attempt == attempts - 1:
                raise


def measure(page):
    dom = chrome(['--dump-dom', 'file://' + page]).stdout
    m = re.search(r'<script type="application/json" id="layout-report">(.*?)</script>', dom, re.S)
    if not m:
        raise RuntimeError('layout report missing from the DOM dump')
    return json.loads(html.unescape(m.group(1)))


NAMES = {}
NAMES_JS = r"""
import fs from 'node:fs';
const pairs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = {}, fallbacks = [];
for (const [kind, code, locale] of pairs) {
  const names = new Intl.DisplayNames([locale], { type: kind });
  const resolved = names.resolvedOptions().locale;
  if (resolved.split('-')[0] !== locale.split('-')[0]) fallbacks.push([kind, code, locale, resolved]);
  out[kind + '|' + code + '|' + locale] = names.of(code);
}
console.log(JSON.stringify({ out, fallbacks }));
"""


def preload_display_names(pairs):
    """Country and language names in each document's own language, from CLDR via Node's full ICU (no hand-kept tables).

    Not Chrome: its ICU is trimmed to Chrome's UI languages and silently answers in the machine's locale for the rest
    (Icelandic and Sinhala came out in Polish). A locale without its own CLDR data stops the build.
    """
    script, data = os.path.join(BUILD, '_names.mjs'), os.path.join(BUILD, '_names_pairs.json')
    open(script, 'w').write(NAMES_JS)
    json.dump(sorted(pairs), open(data, 'w'))
    res = json.loads(subprocess.run(['node', script, data], capture_output=True, text=True, timeout=60, check=True).stdout)
    if res['fallbacks']:
        raise SystemExit(f'no CLDR display names for: {res["fallbacks"]}')
    NAMES.update(res['out'])


def display_name(kind, code, locale):
    return NAMES[f'{kind}|{code}|{locale}']


def build_document(iso, loc, rows, missing, S, a):
    """One market/locale: HTML with the layout-fit loop, then the PDF. Returns (manifest entry, None) or (None, skip)."""
    out = os.path.join(BUILD, iso, loc)
    os.makedirs(out, exist_ok=True)
    shutil.copytree(os.path.join(GUIDE, 'assets'), os.path.join(out, 'assets'), dirs_exist_ok=True)
    country_name = display_name('region', iso, loc)
    language_name = display_name('language', loc, loc)
    split = [['DEX', 'SMP', 'CRP', 'FRU'], ['INU', 'YOL', 'STB']]
    fit = {}
    page = os.path.join(out, 'document.html')
    for attempt in range(3):
        open(page, 'w').write(document(iso, country_name, language_name, rows, S, a.draft, split, fit))
        rep = measure(page)
        bad = [p for p in rep['pages'] if p['flowOverflowPx'] > 0 or p['pageOverflowPx'] > 0 or p['wide']]
        if not bad:
            break
        for p in bad:
            fit[p['id']] = fit.get(p['id'], 0) + 1
    json.dump({**rep, 'fit': fit}, open(os.path.join(out, 'layout.json'), 'w'), indent=1)
    if bad:
        return None, {'iso': iso, 'locale': loc, 'reason': 'layout_overflow', 'pages': bad}
    entry = {'iso': iso, 'locale': loc, 'country_name': country_name, 'language_name': language_name,
             'missing_items': missing, 'fit': fit,
             'items': {c: [{k: p[k] for k in ('source', 'rank', 'brand', 'name', 'pack', 'gtin', 'evidence_class', 'accepted', 'tags')}
                           for p in rows[c]] for c in ITEMS}}
    if not a.no_pdf:
        name = f'Gellatti-Starter-Pack-{iso}-{loc}{"-DRAFT" if a.draft else ""}.pdf'
        pdf = os.path.join(out, name)
        if os.path.exists(pdf):
            os.remove(pdf)
        chrome(['--no-pdf-header-footer', '--generate-pdf-document-outline', f'--print-to-pdf={pdf}', 'file://' + page])
        if not os.path.exists(pdf):
            return None, {'iso': iso, 'locale': loc, 'reason': 'pdf_not_written'}
        entry.update({'pdf': os.path.relpath(pdf, HERE), 'sha256': sha256(pdf), 'bytes': os.path.getsize(pdf)})
    return entry, None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--draft', action='store_true')
    ap.add_argument('--iso', default='')
    ap.add_argument('--locale', default='')
    ap.add_argument('--node-modules', default=DEFAULT_NODE_MODULES)
    ap.add_argument('--no-pdf', action='store_true')
    ap.add_argument('--jobs', type=int, default=4, help='documents built in parallel (each runs its own headless Chrome)')
    a = ap.parse_args()

    markets = json.load(open(os.path.join(HERE, 'markets75.json')))
    v23 = json.load(open(os.path.join(HERE, 'v23_rows.json')))['countries']
    acceptance = load(os.path.join(HERE, 'acceptance.json'), {}) or {}
    strings_dir = os.path.join(HERE, 'strings')
    os.makedirs(os.path.join(BUILD, 'fonts'), exist_ok=True)
    for d in (os.path.join(a.node_modules, '@fontsource-variable/manrope/files'), os.path.join(a.node_modules, '@fontsource/ibm-plex-mono/files')):
        for fn in os.listdir(d):
            if re.fullmatch(r'manrope-[a-z-]+-wght-normal\.woff2|ibm-plex-mono-latin-(400|500|600)-normal\.woff2', fn):
                shutil.copy2(os.path.join(d, fn), os.path.join(BUILD, 'fonts', fn))

    isos = [i for i in (a.iso.split(',') if a.iso else sorted(markets)) if i]
    manifest = {'version': VERSION, 'draft': a.draft, 'documents': [], 'skipped': []}
    pairs = set()
    for iso in isos:
        for loc in markets[iso]['locales']:
            pairs.update({('region', iso, loc), ('language', loc, loc)})
    preload_display_names(pairs)
    tasks = []
    for iso in isos:
        rows = market_rows(iso, v23, os.path.join(HERE, 'research'), acceptance, a.draft)
        missing = [c for c in ITEMS if not rows[c]]
        locales = markets[iso]['locales']
        if a.locale:
            locales = [l for l in locales if l == a.locale]
        if missing and not a.draft:
            manifest['skipped'].append({'iso': iso, 'reason': 'items_without_accepted_product', 'items': missing})
            continue
        for loc in locales:
            spath = os.path.join(strings_dir, f'{loc}.json')
            if not os.path.exists(spath):
                manifest['skipped'].append({'iso': iso, 'locale': loc, 'reason': 'no_strings_for_locale'})
                continue
            tasks.append((iso, loc, rows, missing, json.load(open(spath))))

    def run(task):
        iso, loc, rows, missing, S = task
        try:
            return build_document(iso, loc, rows, missing, S, a)
        except Exception as e:  # one failing document (e.g. a Chrome run that keeps hanging) never stops the others
            return None, {'iso': iso, 'locale': loc, 'reason': 'build_error', 'error': f'{type(e).__name__}: {e}'[:300]}

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=max(1, a.jobs)) as pool:
        for (iso, loc, rows, missing, S), (entry, skip) in zip(tasks, pool.map(run, tasks)):
            if skip:
                manifest['skipped'].append(skip)
                print(f'{iso}/{loc}: SKIPPED {skip["reason"]} {skip.get("error", "")}', flush=True)
                continue
            manifest['documents'].append(entry)
            print(f'{iso}/{loc}: {entry["country_name"]} · {entry["language_name"]} · missing {missing or "none"} · fit {entry["fit"] or "none"}', flush=True)
    name = 'manifest_draft.json' if a.draft else 'manifest.json'
    json.dump(manifest, open(os.path.join(BUILD, name), 'w'), ensure_ascii=False, indent=1)
    print(f'{len(manifest["documents"])} document(s), {len(manifest["skipped"])} skipped → build/starter_local/{name}')


if __name__ == '__main__':
    main()
