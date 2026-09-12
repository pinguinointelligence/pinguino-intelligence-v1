#!/usr/bin/env python3
"""Light validation of the free 75-country gelato base guide against the FINAL v23 workbook (owner brief 2026-09-12).

Independent of build_guide.py:
  - v23 is re-read with reports/a03/tooling/xlsx_min.py (a different reader);
  - the PDF is read back with poppler: pdftotext, pdftotext -bbox-layout and pdftohtml -xml.
The 13 checks follow the brief. Writes validation_report.json and VALIDATION.md; phone/desktop renders go to build/renders/.
usage: validate_guide.py [--pdf PATH] [--xlsx PATH]
"""
import argparse, hashlib, html, json, os, re, subprocess, sys, unicodedata, zlib
from collections import Counter, defaultdict
from decimal import Decimal, ROUND_HALF_UP
from urllib.parse import unquote

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'a03', 'tooling'))
from xlsx_min import X  # noqa: E402

V23_SHA = '37afaf6f98bad68d2768c02562f130f0502ba875d3ae4a08f51f420b82de16b4'
DEFAULT_XLSX = os.path.expanduser('~/Developer/gellatti-owner-inputs/2026-09-12_GELATO_75_v23_SYNC_FINAL/'
                                  'GELLATTI_BAZA_GELATO_75_KRAJOW_v23_SYNC_FINAL.xlsx')
DEFAULT_PDF = os.path.join(HERE, 'GELLATTI_GELATO_BASE_GUIDE_75_COUNTRIES_v1.pdf')
ROLE_SHEET = {'MILK': '11_MLEKO_75', 'CREAM': '14_SMIETANKA_75', 'SMP': '17_PROSZEK_75', 'DEXTROSE': '20_DEKSTROZA_75',
              'TARA': '23_TARA_75'}
SKU = {'SMP': 'SKU / kod dostawcy', 'DEXTROSE': 'SKU / ID oferty', 'TARA': 'SKU / ID oferty'}
LABELS = ['MILK', 'CREAM', 'SKIMMILKPOWDER', 'SUGAR', 'DEXTROSE', 'TARAGUM']
OLD_ORANGE = (0xf5 / 255, 0x8a / 255, 0x07 / 255)
ACCENT = (0xf0 / 255, 0xc4 / 255, 0x4c / 255)
FORBIDDEN = [r'(?<!not an )FDA[- ]approv', r'approved by (the )?FDA', r'guaranteed (stock|delivery|shipping|availability)',
             r'(?<!not )always (in stock|available)', r'\bin stock\b', r'available (in|to) all', r'every recipe',
             r'all (the )?ingredients (for|of|in) (all|every)', r'\bships to\b', r'free (shipping|delivery)',
             r'certified', r'approved for sale']
REQUIRED = ['does not list every ingredient', 'not an FDA approval', '75 countries', 'not guaranteed']


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout


RTL = re.compile(r'[\u0590-\u05FF\u0600-\u06FF\uFB1D-\uFDFF\uFE70-\uFEFF]')


def squash(s):
    """Compare text as printed: no whitespace, no hyphens (pdftotext drops a hyphen at a line break), no right-to-left
    letters (pdftotext returns Hebrew/Arabic in visual order; rtl_ok checks those letters separately)."""
    s = unicodedata.normalize('NFC', html.unescape(s or '')).replace('\u00a0', ' ').replace('\u202f', ' ')
    s = RTL.sub('', re.sub(r'[-\u2010\u2011\u00ad]', '', s))
    return re.sub(r'\s+', '', s).casefold()


def rtl_ok(expected, page_text):
    need, have = Counter(RTL.findall(expected or '')), Counter(RTL.findall(page_text or ''))
    return all(have[c] >= n for c, n in need.items())


def fmt_pct(v):
    q = Decimal(v).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)
    return f'{q.normalize():f}' if q == q.to_integral_value() else f'{q}'


def table(x, sheet, must):
    rows = x.rows(sheet)
    for i, d in enumerate(rows):
        cols = {v.strip(): k for k, v in d.items() if v and v.strip()}
        if all(h in cols for h in must):
            return [{h: (r.get(c) or '').strip() for h, c in cols.items()} for r in rows[i + 1:]]
    raise SystemExit(f'{sheet}: header {must} not found')


def iso(r, k):
    return re.fullmatch(r'[A-Z]{2}', r.get(k, '') or '') is not None


def urlnorm(u):
    return unquote(html.unescape(u)).rstrip('/')


def load_v23(path):
    x = X(path)
    countries = {r['ISO2']: r['Country'] for r in table(x, '02_KRAJE_75', ['ISO2', 'Country']) if iso(r, 'ISO2')}
    m04 = {(r['ISO2'], r['Rola']): r for r in table(x, '04_POKRYCIE_PR', ['ISO2', 'Rola', 'Dokładny produkt']) if iso(r, 'ISO2')}
    side = {role: {r['ISO']: r for r in table(x, sh, ['ISO', 'Wybrany produkt']) if iso(r, 'ISO')} for role, sh in ROLE_SHEET.items()}
    return countries, m04, side


def parse_bbox(xhtml):
    pages = []
    for pm in re.finditer(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', xhtml, re.S):
        words = [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in
                 re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', pm.group(3))]
        pages.append({'w': float(pm.group(1)), 'h': float(pm.group(2)), 'words': words})
    return pages


def parse_xml(xml):
    pages = {}
    for pm in re.finditer(r'<page number="(\d+)"[^>]*>(.*?)</page>', xml, re.S):
        links = []
        for href, inner in re.findall(r'<a href="([^"]*)">(.*?)</a>', pm.group(2), re.S):
            links.append((html.unescape(href), html.unescape(re.sub(r'<[^>]+>', '', inner)).strip()))
        pages[int(pm.group(1))] = links
    outline = [(int(p), html.unescape(re.sub(r'<[^>]+>', '', t)).strip()) for p, t in re.findall(r'<item page="(\d+)">(.*?)</item>', xml, re.S)]
    return pages, outline


def pdf_colours(pdf):
    raw = open(pdf, 'rb').read()
    blobs = [raw]
    for m in re.finditer(rb'stream\r?\n', raw):
        end = raw.find(b'endstream', m.end())
        try:
            blobs.append(zlib.decompress(raw[m.end():end]))
        except Exception:
            pass
    cols = Counter()
    for b in blobs:
        for r, g, bl, op in re.findall(rb'(?<![\d.])([01]?\.?\d+) ([01]?\.?\d+) ([01]?\.?\d+) (rg|RG|sc|SC)\b', b):
            try:
                cols[(round(float(r), 3), round(float(g), 3), round(float(bl), 3))] += 1
            except ValueError:
                pass
    return cols


def dist(a, b):
    return max(abs(x - y) for x, y in zip(a, b))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--pdf', default=DEFAULT_PDF)
    ap.add_argument('--xlsx', default=DEFAULT_XLSX)
    a = ap.parse_args()
    res, detail = {}, {}
    sha = hashlib.sha256(open(a.xlsx, 'rb').read()).hexdigest()
    countries, m04, side = load_v23(a.xlsx)
    npages = int(re.search(r'Pages:\s+(\d+)', run(['pdfinfo', a.pdf])).group(1))
    texts = run(['pdftotext', a.pdf, '-']).split('\f')[:npages]
    sq = [squash(t) for t in texts]
    bbox = parse_bbox(run(['pdftotext', '-bbox-layout', a.pdf, '-']))
    links, outline = parse_xml(run(['pdftohtml', '-xml', '-i', '-stdout', a.pdf]))

    # page of each country, from the PDF outline (bookmarks)
    name_to_iso = {v: k for k, v in countries.items()}
    oc = [(p, t) for p, t in outline if t in name_to_iso]
    page_of = {name_to_iso[t]: p for p, t in oc}

    # 1 + 6 + 7(part): every v23 country exactly once, on its own page, with its name on the page
    dup_titles = [t for t, n in Counter(t for _, t in oc).items() if n > 1]
    dup_pages = [p for p, n in Counter(p for p, _ in oc).items() if n > 1]
    missing = sorted(set(countries) - set(page_of))
    name_absent = [i for i, p in page_of.items() if squash(countries[i]) not in sq[p - 1]]
    res['1_all_75_countries'] = len(page_of) == 75 and not missing
    res['6_no_missing_country'] = not missing
    detail['countries'] = {'v23': len(countries), 'in_pdf': len(page_of), 'missing': missing, 'duplicate_titles': dup_titles,
                           'duplicate_pages': dup_pages, 'name_not_on_its_page': name_absent,
                           'pages': f'{min(page_of.values())}–{max(page_of.values())}' if page_of else ''}

    # 2: the six role labels, in order, in the left column of every country page
    role_bad = {}
    for i, p in page_of.items():
        W = bbox[p - 1]['words']
        foot_y = min((y0 for x0, y0, x1, y1, t in W if t == 'All' and y0 > 500), default=bbox[p - 1]['h'])
        starts = [y0 for x0, y0, x1, y1, t in W if t == 'MILK' and x1 < 88]
        if not starts:
            role_bad[i] = 'no MILK label'; continue
        left = [t for x0, y0, x1, y1, t in sorted(W, key=lambda w: (round(w[1], 0), w[0])) if x1 < 88 and starts[0] - 1 <= y0 < foot_y - 2]
        seq = re.sub(r'FROMABROAD|B2B', '', squash(''.join(left)).upper())
        if seq != ''.join(LABELS):
            role_bad[i] = seq
    res['2_six_roles_each_country'] = not role_bad
    detail['roles'] = {'pages_checked': len(page_of), 'mismatches': role_bad}

    # 3 + 5: country → product mapping equals v23 (name, brand, barcode, fat), incl. the generic sugar rule
    miss = defaultdict(list)
    for i, p in page_of.items():
        s = sq[p - 1]
        for role in ('MILK', 'CREAM', 'SMP', 'DEXTROSE', 'TARA'):
            r = m04[(i, role)]
            for what, val in (('name', r['Dokładny produkt']), ('brand', r['Marka'])):
                rtl_at = RTL.search(val)
                latin = val[:rtl_at.start()] if rtl_at else val   # a right-to-left run is extracted in visual order
                if squash(latin) not in s or not rtl_ok(val, texts[p - 1]):
                    miss[i].append(f'{role} {what}: {val}')
            e = re.sub(r'\D', '', r.get('EAN / GTIN', ''))
            if e and e not in re.sub(r'\D', ' ', texts[p - 1]).split():
                miss[i].append(f'{role} EAN {e}')
            if role in ('MILK', 'CREAM', 'SMP'):
                fat = side[role][i].get('Tłuszcz g', '')
                if squash(f'{fmt_pct(fat)}% fat') not in s:
                    miss[i].append(f'{role} fat {fat}')
        su = m04[(i, 'SUCROSE')]
        if su['Dokładny produkt'] != 'Biały cukier krystaliczny — 100% cukier' or su['Marka'] != 'GENERIC':
            miss[i].append('SUCROSE: v23 is no longer the generic white-sugar rule')
        if squash('White granulated sugar — 100% sugar') not in s:
            miss[i].append('SUCROSE text')
    res['3_mapping_matches_v23'] = not miss
    res['5_no_substitution'] = not miss
    detail['mapping'] = {'fields_checked_per_country': 'name, brand, barcode (where v23 has one), fat % (milk/cream/SMP), sugar rule',
                         'mismatches': dict(miss)}

    # 4 + 7: no number or product from outside this country's v23 rows
    invented, foreign = {}, defaultdict(list)
    all_names = {i: [m04[(i, r)]['Dokładny produkt'] for r in ('MILK', 'CREAM', 'SMP', 'DEXTROSE', 'TARA')] for i in countries}
    for i, p in page_of.items():
        allowed = set()
        for role in ('MILK', 'CREAM', 'SMP', 'DEXTROSE', 'TARA'):
            allowed |= set(re.findall(r'\d+', m04[(i, role)].get('EAN / GTIN', '')))
            allowed |= set(re.findall(r'\d+', m04[(i, role)].get('Dokładny produkt', '') + ' ' + m04[(i, role)].get('Opakowanie', '')))
            if role in SKU:
                allowed |= set(re.findall(r'\d+', side[role][i].get(SKU[role], '')))
        nums = set(re.findall(r'(?<!\d)\d{6,14}(?!\d)', texts[p - 1]))
        bad = sorted(nums - allowed)
        if bad:
            invented[i] = bad
        own = [squash(x) for x in all_names[i]] + [squash(m04[(i, r)]['Marka']) for r in ('MILK', 'CREAM', 'SMP', 'DEXTROSE', 'TARA')]
        for j, names in all_names.items():
            if j == i:
                continue
            for nm in names:
                k = squash(nm)
                if len(k) >= 8 and k in sq[p - 1] and not any(k in o for o in own):
                    foreign[i].append(f'{j}: {nm}')
    idx_links = [(href, t) for pg in (4, 5) for href, t in links.get(pg, []) if '#' in href]
    idx_bad, idx_seen = [], Counter()
    for href, t in idx_links:
        tgt = int(href.rsplit('#', 1)[1])
        if t in name_to_iso:
            idx_seen[t] += 1
            if page_of.get(name_to_iso[t]) != tgt:
                idx_bad.append(f'{t} → {tgt}')
        elif t.isdigit() and int(t) != tgt:
            idx_bad.append(f'page number {t} → {tgt}')
    idx_missing = sorted(set(countries.values()) - set(idx_seen))
    res['4_no_invented_product'] = not invented and not foreign
    res['7_no_duplicate_or_misassigned_country'] = (not dup_titles and not dup_pages and not foreign and not idx_bad
                                                   and not idx_missing and not name_absent)
    detail['no_invention'] = {'numbers_not_in_v23_for_that_country': invented, 'other_country_products_found': dict(foreign)}
    detail['index'] = {'links_checked': len(idx_links), 'wrong_targets': idx_bad, 'countries_missing_from_index': idx_missing}

    # 8 + 9: layout — builder's DOM measurement and the PDF's own word boxes
    lay = json.load(open(os.path.join(HERE, 'layout_report.json'))) if os.path.exists(os.path.join(HERE, 'layout_report.json')) else {}
    lay_bad = [p for p in lay.get('pages', []) if p['flowOverflowPx'] > 0 or p['pageOverflowPx'] > 0 or p['wide']]
    box_bad = []
    for n, pg in enumerate(bbox, 1):
        W, pw, ph = pg['words'], pg['w'], pg['h']
        margin_x = 9 * 72 / 25.4
        for x0, y0, x1, y1, t in W:
            if x1 > pw - margin_x + 3 or x0 < margin_x - 3 or y1 > ph - 5:
                if n not in (1, npages):          # cover and back cover use their own margins
                    box_bad.append(f'p{n} outside margins: {t!r} x{x0:.0f}-{x1:.0f} y{y1:.0f}')
        if n - 1 < len(texts) and any(p == n for p in page_of.values()):
            foot_y = min((y0 for x0, y0, x1, y1, t in W if t == 'All' and y0 > 500), default=None)
            if foot_y is None:
                box_bad.append(f'p{n}: footer not found')
                continue
            limit = foot_y - 2.6 * 72 / 25.4
            for x0, y0, x1, y1, t in W:
                if y0 < foot_y - 1 and y1 > limit + .5:
                    box_bad.append(f'p{n} runs into the footer: {t!r} y{y1:.1f} > {limit:.1f}')
    res['8_no_broken_page_or_table_layout'] = not lay_bad and not box_bad and npages == 82
    res['9_no_text_overflow'] = not lay_bad and not box_bad
    detail['layout'] = {'pages': npages, 'dom_overflow_pages': lay_bad, 'pdf_box_problems': box_bad[:40],
                        'fit_levels_used': lay.get('fit', {}), 'fonts_loaded': sorted(set(lay.get('fontsLoaded', [])))}

    # 10: navigation — index links (above), back links, notes link, external links only from v23, bookmarks
    back_bad, ext_bad, ext_n, int_n = [], [], 0, 0
    notes_page = next((p for p, t in outline if t == 'Good to know'), None)
    for i, p in page_of.items():
        pl = links.get(p, [])
        if not any(t == 'All countries' and h.endswith('#4') for h, t in pl):
            back_bad.append(i)
        v23_urls = set()
        for role in ROLE_SHEET:
            v23_urls |= {urlnorm(u) for u in re.split(r'[\s;,]+', side[role][i].get('Źródła', '')) if u.startswith('http')}
            v23_urls |= {urlnorm(u) for u in re.split(r'[\s;,]+', m04[(i, role)].get('Źródło', '')) if u.startswith('http')}
        for h, t in pl:
            if h.startswith('http'):
                ext_n += 1
                if urlnorm(h) not in v23_urls:
                    ext_bad.append(f'{i}: {h}')
            else:
                int_n += 1
    us_notes = [h for h, t in links.get(page_of.get('US', 0), []) if 'Good to know' in t]
    front_ext = sorted({h for pg in list(range(1, 6)) + [npages - 1, npages] for h, t in links.get(pg, []) if h.startswith('http')})
    front_bad = [h for h in front_ext if urlnorm(h) not in ('https://gellatti.com', 'https://gellatti.com/shop')]
    sections = ['How to use this guide', 'The six base ingredients', 'Find your country', 'Good to know', 'Now make it.']
    out_missing = [s for s in sections if s not in [t for _, t in outline]]
    extra_outline = [t for p, t in outline if t not in sections and t not in name_to_iso]
    res['10_navigation_links_work'] = (not idx_bad and not idx_missing and not back_bad and not ext_bad and not front_bad
                                       and bool(us_notes) and all(h.endswith(f'#{notes_page}') for h in us_notes)
                                       and not out_missing and not extra_outline and len(oc) == 75)
    detail['navigation'] = {'index_links': len(idx_links), 'back_link_missing': back_bad, 'external_links_on_country_pages': ext_n,
                            'external_not_in_v23': ext_bad, 'internal_links_on_country_pages': int_n,
                            'us_notes_link': us_notes, 'front_back_external': front_ext, 'front_back_bad': front_bad,
                            'bookmarks': len(outline), 'bookmark_sections_missing': out_missing, 'unexpected_bookmarks': extra_outline}

    # 11: phone and desktop renders (390 px and 1600 px wide views) + the smallest text on country pages
    rdir = os.path.join(HERE, 'build', 'renders'); os.makedirs(rdir, exist_ok=True)
    tight = sorted(((p['spareBelowRowsPx'], p['page']) for p in lay.get('pages', []) if p.get('spareBelowRowsPx') is not None))[:3]
    sample = sorted({1, 2, 3, 4, 5, page_of.get('US', 6), page_of.get('JP', 6), page_of.get('IL', 6)} | {p for _, p in tight} | {npages - 1, npages})
    for p in sample:
        run(['pdftoppm', '-f', str(p), '-l', str(p), '-scale-to-x', '1170', '-scale-to-y', '-1', '-png', a.pdf, os.path.join(rdir, f'phone_p{p:02d}')])
        run(['pdftoppm', '-f', str(p), '-l', str(p), '-scale-to-x', '-1', '-scale-to-y', '1600', '-png', a.pdf, os.path.join(rdir, f'desk_p{p:02d}')])
    heights = sorted(y1 - y0 for p in page_of.values() for x0, y0, x1, y1, t in bbox[p - 1]['words'])
    pw = bbox[5]['w']
    phone_px = lambda h: round(h * 390 / pw, 1)
    detail['readability'] = {'renders': sorted(os.listdir(rdir)), 'page_width_pt': pw,
                             'smallest_word_box_pt': round(heights[0], 2), 'p5_word_box_pt': round(heights[len(heights) // 20], 2),
                             'median_word_box_pt': round(heights[len(heights) // 2], 2),
                             'phone_390px_smallest_px': phone_px(heights[0]), 'phone_390px_p5_px': phone_px(heights[len(heights) // 20]),
                             'phone_390px_median_px': phone_px(heights[len(heights) // 2])}
    res['11_renders_desktop_and_phone'] = len(os.listdir(rdir)) >= 2 * len(sample)

    # 12: the retired orange is not used; the accent is the current #F0C44C
    cols = pdf_colours(a.pdf)
    near_old = {str(c): n for c, n in cols.items() if dist(c, OLD_ORANGE) < 0.07}
    accent = sum(n for c, n in cols.items() if dist(c, ACCENT) < 0.02)
    src_html = open(os.path.join(HERE, 'build', 'guide.html')).read().lower() if os.path.exists(os.path.join(HERE, 'build', 'guide.html')) else ''
    res['12_no_old_orange_accent'] = not near_old and accent > 0 and '#f58a07' not in src_html
    detail['colour'] = {'old_orange_uses': near_old, 'accent_f0c44c_uses': accent, 'distinct_colours': len(cols),
                        'top_colours': [f'#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}×{n}' for (r, g, b), n in cols.most_common(12)]}

    # 13: claims stay inside the v23 scope
    full = re.sub(r'\s+', ' ', ' '.join(texts))
    hits = [(pat, full[max(0, m.start() - 40):m.end() + 40]) for pat in FORBIDDEN for m in re.finditer(pat, full, re.I)]
    fda = [full[max(0, m.start() - 30):m.end() + 30] for m in re.finditer(r'FDA', full)]
    fda_bad = [c for c in fda if 'not an FDA approval' not in c]
    req_missing = [r for r in REQUIRED if r.lower() not in full.lower()]
    res['13_claims_within_v23_scope'] = not hits and not fda_bad and not req_missing
    detail['claims'] = {'forbidden_hits': hits, 'fda_mentions': fda, 'required_missing': req_missing}

    ok = all(res.values())
    report = {'pdf': os.path.basename(a.pdf), 'pdf_sha256': hashlib.sha256(open(a.pdf, 'rb').read()).hexdigest(),
              'v23_sha256': sha, 'v23_is_frozen_authority': sha == V23_SHA, 'pages': npages, 'all_pass': ok and sha == V23_SHA,
              'checks': res, 'detail': detail}
    json.dump(report, open(os.path.join(HERE, 'validation_report.json'), 'w'), ensure_ascii=False, indent=1)
    lines = ['# Validation — free 75-country gelato base guide', '',
             f'PDF `{report["pdf"]}` · sha256 `{report["pdf_sha256"][:16]}…` · {npages} pages',
             f'Source: v23 sha256 `{sha[:16]}…` — frozen authority: {"YES" if sha == V23_SHA else "NO"}', '',
             '| # | check | result |', '|---|---|---|']
    for k, v in res.items():
        n, _, label = k.partition('_')
        lines.append(f'| {n} | {label.replace("_", " ")} | {"PASS" if v else "FAIL"} |')
    lines += ['', f'Overall: **{"PASS" if report["all_pass"] else "FAIL"}**', '', 'Details: `validation_report.json`.']
    open(os.path.join(HERE, 'VALIDATION.md'), 'w').write('\n'.join(lines) + '\n')
    for k, v in res.items():
        print(f'{"PASS" if v else "FAIL"}  {k}')
    print('ALL PASS' if report['all_pass'] else 'SOME CHECKS FAIL')
    return 0 if report['all_pass'] else 1


if __name__ == '__main__':
    sys.exit(main())
