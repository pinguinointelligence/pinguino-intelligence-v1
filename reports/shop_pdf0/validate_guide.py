#!/usr/bin/env python3
"""Validation of the free gelato base guide PDF against the FINAL v23 workbook (owner brief 2026-09-12) and, from v1.1,
the owner's G1 corrections (reconciliation report 2026-09-17, sections C1–C2, E8 and G1).

Independent of build_guide.py:
  - v23 is re-read with reports/a03/tooling/xlsx_min.py (a different reader);
  - the approved local sugar names are re-read from reports/a03/sucrose_consumer_terms_approved.csv and cross-checked
    with reports/a03/market_locale_structure_75.csv;
  - the PDF is read back with poppler: pdfinfo, pdftotext, pdftotext -bbox-layout and pdftohtml -xml.
Checks 1–13 follow the 2026-09-12 brief. v1.1 adds:
  14 cover: "Gelato Base Ingredients" is the largest text, in the upper half; the benefit is second; the format/price and
     coverage lines are small; no dominant "75" and no promise of a product for every ingredient;
  15 local sugar names: each D-32 market's sugar row prints exactly the rule, the pack line, its approved name(s) and the
     label note — no brand, barcode or link; no other market has a "Local name" line;
  16 title: running header "GELATO BASE INGREDIENTS" on pages 2–81, PDF title "Gellatti — Gelato Base Ingredients",
     no "Gelato Base Guide" left anywhere;
  17 against the baseline PDF (default: v1): pages 3–80 differ only by the running header and the local-name lines —
     in the extracted text (a line pdftotext merely extracts in another order is reported, not hidden) and in the word
     boxes (every other word keeps its text and position, or moves down by one constant step below a local name);
     same page count, bookmarks, internal and external links.
Outputs are versioned by the PDF file name (…_v1.1.pdf → validation_report_v1.1.json, VALIDATION_v1.1.md and
build/v1.1_renders/); the v1 files (validation_report.json, VALIDATION.md, build/renders/) are never overwritten.
usage: validate_guide.py [--pdf PATH] [--xlsx PATH] [--baseline PDF | --baseline '']
"""
import argparse, csv, difflib, glob, hashlib, html, json, os, re, subprocess, sys, unicodedata, zlib
from collections import Counter, defaultdict
from decimal import Decimal, ROUND_HALF_UP
from urllib.parse import unquote

HERE = os.path.dirname(os.path.abspath(__file__))
A03 = os.path.join(HERE, '..', 'a03')
sys.path.insert(0, os.path.join(A03, 'tooling'))
from xlsx_min import X  # noqa: E402

V23_SHA = '37afaf6f98bad68d2768c02562f130f0502ba875d3ae4a08f51f420b82de16b4'
DEFAULT_XLSX = os.path.expanduser('~/Developer/gellatti-owner-inputs/2026-09-12_GELATO_75_v23_SYNC_FINAL/'
                                  'GELLATTI_BAZA_GELATO_75_KRAJOW_v23_SYNC_FINAL.xlsx')
DEFAULT_PDF = os.path.join(HERE, 'GELLATTI_GELATO_BASE_INGREDIENTS_v1.1.pdf')
BASELINE_PDF = os.path.join(HERE, 'GELLATTI_GELATO_BASE_GUIDE_75_COUNTRIES_v1.pdf')
SUGAR_TERMS_CSV = os.path.join(A03, 'sucrose_consumer_terms_approved.csv')
LOCALE_STRUCTURE_CSV = os.path.join(A03, 'market_locale_structure_75.csv')
ROLE_SHEET = {'MILK': '11_MLEKO_75', 'CREAM': '14_SMIETANKA_75', 'SMP': '17_PROSZEK_75', 'DEXTROSE': '20_DEKSTROZA_75',
              'TARA': '23_TARA_75'}
SKU = {'SMP': 'SKU / kod dostawcy', 'DEXTROSE': 'SKU / ID oferty', 'TARA': 'SKU / ID oferty'}
LABELS = ['MILK', 'CREAM', 'SKIMMILKPOWDER', 'SUGAR', 'DEXTROSE', 'TARAGUM']
OLD_ORANGE = (0xf5 / 255, 0x8a / 255, 0x07 / 255)
ACCENT = (0xf0 / 255, 0xc4 / 255, 0x4c / 255)

# v1.1 (owner G1): cover per E8, title, page 2 step 2, local sugar names (D-8, D-32)
TITLE = 'Gelato Base Ingredients'
BENEFIT = 'What to buy and where'
COVER_SMALL = ['PDF shopping guide · Free · €0', 'Covers 75 countries — find yours in the index']
PDF_TITLE = 'Gellatti — Gelato Base Ingredients'
HEADER, OLD_HEADER = 'GELATO BASE INGREDIENTS', 'GELATO BASE GUIDE'
SUGAR_ROW = ['White granulated sugar — 100% sugar', 'Any brand · any pack', 'The ingredients should list only sugar (sucrose).']
SUGAR_MARKETS = 28
LANGUAGE_EN = {'fi': 'Finnish', 'sv': 'Swedish'}
LEFT_COL = 88   # pt: the role labels end left of this line; product text starts right of it
SIDE_BY_SIDE = [(1, 'cover'), (2, 'how-to-use'), (4, 'index-1'), (5, 'index-2'), ('JP', 'JP'), ('KR', 'KR'), ('BG', 'BG'),
                ('IL', 'IL'), ('PL', 'PL')]

FORBIDDEN = [r'(?<!not an )FDA[- ]approv', r'approved by (the )?FDA', r'guaranteed (stock|delivery|shipping|availability)',
             r'(?<!not )always (in stock|available)', r'\bin stock\b', r'available (in|to) all', r'every recipe',
             r'all (the )?ingredients (for|of|in) (all|every)', r'\bships to\b', r'free (shipping|delivery)',
             r'certified', r'approved for sale',
             # v1.1: the two promises of a product for every ingredient (cover subtitle and page 2 step 2 of v1)
             r'matched to a product in each of 75 countries', r'the product Gellatti identified for each ingredient']
REQUIRED = ['does not list every ingredient', 'not an FDA approval', '75 countries', 'not guaranteed',
            # v1.1: cover title, benefit and small lines (E8); the sugar sentence of page 2 step 2 (C1)
            TITLE, BENEFIT, *COVER_SMALL, 'a simple buying rule instead of a brand']


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout


RTL = re.compile(r'[֐-׿؀-ۿיִ-﷿ﹰ-﻿]')


def squash(s):
    """Compare text as printed: no whitespace, no hyphens (pdftotext drops a hyphen at a line break), no right-to-left
    letters (pdftotext returns Hebrew/Arabic in visual order; rtl_ok checks those letters separately)."""
    s = unicodedata.normalize('NFC', html.unescape(s or '')).replace(' ', ' ').replace(' ', ' ')
    s = RTL.sub('', re.sub(r'[-‐‑­]', '', s))
    return re.sub(r'\s+', '', s).casefold()


def rtl_ok(expected, page_text):
    need, have = Counter(RTL.findall(expected or '')), Counter(RTL.findall(page_text or ''))
    return all(have[c] >= n for c, n in need.items())


BIDI_CONTROLS = re.compile(r'[‎‏‪-‮⁦-⁩]')   # pdftotext wraps RTL runs in these (raw mode)


def nows(s):
    """Exact, case-sensitive printed text: NFC, whitespace and invisible bidi controls removed."""
    s = unicodedata.normalize('NFC', html.unescape(s or '')).replace(' ', ' ').replace(' ', ' ')
    return re.sub(r'\s+', '', BIDI_CONTROLS.sub('', s))


def same_printed(expected, got):
    """Exact match. Right-to-left letters come back from pdftotext in visual order, so they must match as a multiset;
    everything else must match exactly, in order and case."""
    if RTL.search(expected) or RTL.search(got):
        return nows(RTL.sub('', expected)) == nows(RTL.sub('', got)) and Counter(RTL.findall(expected)) == Counter(RTL.findall(got))
    return nows(expected) == nows(got)


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


def load_sugar_terms(countries):
    """The owner-approved local sugar names (D-32): {iso: [(locale, term)]} and anything that disagrees with D-32."""
    problems, terms = [], defaultdict(list)
    for r in csv.DictReader(open(SUGAR_TERMS_CSV, encoding='utf-8', newline='')):
        if not (r['basis'].startswith('OWNER_') and 'D-32' in r['basis']):
            problems.append(f'{r["iso2"]}/{r["locale"]}: basis {r["basis"]!r} is not an owner D-32 approval')
            continue
        terms[r['iso2']].append((r['locale'], r['approved_term']))
    struct = {r['iso2']: sorted(v.strip() for v in r['approved_sugar_terms'].split('|') if v.strip())
              for r in csv.DictReader(open(LOCALE_STRUCTURE_CSV, encoding='utf-8', newline=''))
              if r['sugar_term_status'].startswith('APPROVED')}
    mine = {i: sorted(f'{loc}:{t}' for loc, t in ts) for i, ts in terms.items()}
    if mine != struct:
        problems.append(f'approved list and market_locale_structure_75.csv differ: '
                        f'{sorted(set(mine.items()) ^ set((k, tuple(v)) for k, v in struct.items()), key=str)[:6]}')
    if len(terms) != SUGAR_MARKETS:
        problems.append(f'{len(terms)} approved markets, D-32 approves {SUGAR_MARKETS}')
    if [t for _, t in terms.get('JP', [])] != ['グラニュー糖']:
        problems.append(f'JP must be グラニュー糖 (D-32): {terms.get("JP")}')
    if any('上白糖' in t for ts in terms.values() for _, t in ts):
        problems.append('上白糖 appears as an approved term (D-32 forbids it)')
    if set(terms) - set(countries):
        problems.append(f'approved markets outside v23: {sorted(set(terms) - set(countries))}')
    for i, ts in terms.items():
        if len(ts) > 1 and any(loc not in LANGUAGE_EN for loc, _ in ts):
            problems.append(f'{i}: several names without a language name')
    return dict(terms), problems


def local_name_text(ts):
    if len(ts) == 1:
        return f'Local name: {ts[0][1]}'
    return 'Local names: ' + ' · '.join(f'{t} ({LANGUAGE_EN[loc]})' for loc, t in ts)


def parse_bbox(xhtml):
    pages = []
    for pm in re.finditer(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', xhtml, re.S):
        words = [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in
                 re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', pm.group(3))]
        lines = []
        for a, b, c, d, inner in re.findall(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>',
                                            pm.group(3), re.S):
            lines.append((float(a), float(b), float(c), float(d),
                          ' '.join(html.unescape(t) for t in re.findall(r'<word [^>]*>(.*?)</word>', inner))))
        pages.append({'w': float(pm.group(1)), 'h': float(pm.group(2)), 'words': words, 'lines': lines})
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


def versioned(pdf):
    """Output names for this PDF: v1 keeps its historical inputs; every version writes its own reports."""
    m = re.search(r'_(v\d+(?:\.\d+)*)\.pdf$', os.path.basename(pdf))
    tag = m.group(1) if m else 'unversioned'
    legacy = tag == 'v1'
    return {'tag': tag,
            'layout': os.path.join(HERE, 'layout_report.json' if legacy else f'layout_report_{tag}.json'),
            'html': os.path.join(HERE, 'build', 'guide.html' if legacy else f'guide_{tag}.html'),
            'report': os.path.join(HERE, f'validation_report_{tag}.json'),
            'md': os.path.join(HERE, f'VALIDATION_{tag}.md'),
            'renders': os.path.join(HERE, 'build', f'{tag}_renders')}


def sugar_row_lines(page):
    """Right-column lines of the SUGAR row: every line that ends below the top of the SUGAR label and not below the top of
    the DEXTROSE label (a row's text ends at least its bottom padding above the next label; labels may be letter-split)."""
    W = page['words']
    sug = [y0 for x0, y0, x1, y1, t in W if t == 'SUGAR' and x1 < LEFT_COL]
    if len(sug) != 1:
        return None
    nxt = sorted(y0 for x0, y0, x1, y1, t in W if x1 < LEFT_COL and y0 > sug[0] + 4 and t.startswith('DEX'))
    if not nxt:
        return None
    return [t for x0, y0, x1, y1, t in page['lines'] if x0 >= LEFT_COL and sug[0] < y1 <= nxt[0]]


PX = .75   # pt: one CSS pixel. Chrome snaps text to whole pixels, so a block moved down by 12.96 pt lands 17 or 18 px lower.


def geometry_diff(b_page, c_page, named):
    """Word boxes of a page against the baseline. Allowed: the running header (checked in 16), the inserted local-name
    line(s) of a named market, and the words below them moved down by one step (the same for all, give or take the one
    pixel of text snapping); the footer stays. Every other word must have the same text at the same position (±0.05 pt)."""
    foot = lambda pg: min((y0 for x0, y0, x1, y1, t in pg['words'] if t == 'All' and y0 > 500), default=pg['h'])
    bf, cf = foot(b_page), foot(c_page)
    bw = [w for w in b_page['words'] if w[3] >= 45]
    cw = [w for w in c_page['words'] if w[3] >= 45]
    inserted, dy, cut = [], 0.0, None
    if named:
        note = 'The ingredients should list only sugar (sucrose).'
        cl = [l for l in c_page['lines'] if l[0] >= LEFT_COL]
        start = [l for l in cl if l[4].startswith('Local name')]
        c_note = [l for l in cl if l[4] == note]
        b_note = [l for l in b_page['lines'] if l[0] >= LEFT_COL and l[4] == note]
        if len(start) != 1 or len(c_note) != 1 or len(b_note) != 1:
            return {'ok': False, 'error': f'local-name lines {len(start)}, note lines {len(c_note)}/{len(b_note)}'}
        top, bottom = start[0][1] - .5, c_note[0][1] - .5
        inserted = [w for w in cw if w[0] >= LEFT_COL and top <= w[1] < bottom]
        cw = [w for w in cw if w not in inserted]
        dy, cut = c_note[0][1] - b_note[0][1], b_note[0][1] - .5
    below = lambda w: cut is not None and w[1] >= cut and w[3] <= bf - 1
    key = lambda w: (w[4], round(w[0], 1))          # same text at the same x (nothing moves sideways)
    A, B = defaultdict(list), defaultdict(list)
    for w in bw:
        A[key(w)].append((w[1], below(w)))
    for w in cw:
        B[key(w)].append(w[1])
    diffs, shifts = [], []
    for k in sorted(set(A) | set(B), key=str):
        a_list, b_list = sorted(A[k]), sorted(B[k])   # a shift keeps the vertical order of words with the same key
        if len(a_list) != len(b_list):
            diffs.append(f'{k[0]!r} at x{k[1]}: {len(a_list)} in baseline, {len(b_list)} now')
            continue
        for (ya, moved), yb in zip(a_list, b_list):
            if moved:
                shifts.append(yb - ya)
                if abs(yb - ya - dy) > PX + .01:
                    diffs.append(f'{k[0]!r} at x{k[1]}: moved {yb - ya:.2f} pt, the local name moved the next line {dy:.2f} pt')
            elif abs(yb - ya) > .05:
                diffs.append(f'{k[0]!r} at x{k[1]}: y {ya:.2f} → {yb:.2f}')
    spread = (max(shifts) - min(shifts)) if shifts else 0.0
    return {'ok': not diffs and spread <= PX + .01 and (not named or bool(inserted)) and abs(bf - cf) < .05,
            'words_compared': len(cw), 'inserted_text': ' '.join(w[4] for w in inserted),
            'moved_words': len(shifts), 'shift_pt_range': [round(min(shifts), 2), round(max(shifts), 2)] if shifts else [],
            'differences': diffs[:10]}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--pdf', default=DEFAULT_PDF)
    ap.add_argument('--xlsx', default=DEFAULT_XLSX)
    ap.add_argument('--baseline', default=BASELINE_PDF, help="PDF to compare against (check 17); '' skips it")
    a = ap.parse_args()
    out = versioned(a.pdf)
    res, detail = {}, {}
    sha = hashlib.sha256(open(a.xlsx, 'rb').read()).hexdigest()
    countries, m04, side = load_v23(a.xlsx)
    info = run(['pdfinfo', a.pdf])
    npages = int(re.search(r'Pages:\s+(\d+)', info).group(1))
    texts = run(['pdftotext', a.pdf, '-']).split('\f')[:npages]
    sq = [squash(t) for t in texts]
    bbox = parse_bbox(run(['pdftotext', '-bbox-layout', a.pdf, '-']))
    links, outline = parse_xml(run(['pdftohtml', '-xml', '-i', '-stdout', a.pdf]))

    # page of each country, from the PDF outline (bookmarks)
    name_to_iso = {v: k for k, v in countries.items()}
    oc = [(p, t) for p, t in outline if t in name_to_iso]
    page_of = {name_to_iso[t]: p for p, t in oc}
    iso_of = {p: i for i, p in page_of.items()}

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
        starts = [y0 for x0, y0, x1, y1, t in W if t == 'MILK' and x1 < LEFT_COL]
        if not starts:
            role_bad[i] = 'no MILK label'; continue
        left = [t for x0, y0, x1, y1, t in sorted(W, key=lambda w: (round(w[1], 0), w[0])) if x1 < LEFT_COL and starts[0] - 1 <= y0 < foot_y - 2]
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

    # 8 + 9: layout — builder's DOM measurement (required for this PDF version) and the PDF's own word boxes
    lay = json.load(open(out['layout'])) if os.path.exists(out['layout']) else None
    lay_missing = lay is None or len(lay.get('pages', [])) != npages
    lay = lay or {}
    lay_bad = [p for p in lay.get('pages', []) if p['flowOverflowPx'] > 0 or p['pageOverflowPx'] > 0 or p['wide']]
    box_bad = []
    for n, pg in enumerate(bbox, 1):
        W, pw, ph = pg['words'], pg['w'], pg['h']
        margin_x = 9 * 72 / 25.4
        for x0, y0, x1, y1, t in W:
            if x1 > pw - margin_x + 3 or x0 < margin_x - 3 or y1 > ph - 5:
                if n not in (1, npages):          # cover and back cover use their own margins
                    box_bad.append(f'p{n} outside margins: {t!r} x{x0:.0f}-{x1:.0f} y{y1:.0f}')
        if n in (1, npages):                      # their own margins are 10 mm; nothing may pass them either
            m10 = 10 * 72 / 25.4
            for x0, y0, x1, y1, t in W:
                if x1 > pw - m10 + 3 or x0 < m10 - 3 or y1 > ph - m10 + 3:
                    box_bad.append(f'p{n} outside its 10 mm margins: {t!r} x{x0:.0f}-{x1:.0f} y{y1:.0f}')
        if n - 1 < len(texts) and any(p == n for p in page_of.values()):
            foot_y = min((y0 for x0, y0, x1, y1, t in W if t == 'All' and y0 > 500), default=None)
            if foot_y is None:
                box_bad.append(f'p{n}: footer not found')
                continue
            limit = foot_y - 2.6 * 72 / 25.4
            for x0, y0, x1, y1, t in W:
                if y0 < foot_y - 1 and y1 > limit + .5:
                    box_bad.append(f'p{n} runs into the footer: {t!r} y{y1:.1f} > {limit:.1f}')
    res['8_no_broken_page_or_table_layout'] = not lay_missing and not lay_bad and not box_bad and npages == 82
    res['9_no_text_overflow'] = not lay_missing and not lay_bad and not box_bad
    detail['layout'] = {'pages': npages, 'layout_report': os.path.basename(out['layout']), 'layout_report_missing_or_stale': lay_missing,
                        'dom_overflow_pages': lay_bad, 'pdf_box_problems': box_bad[:40],
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
    rdir = out['renders']; os.makedirs(rdir, exist_ok=True)
    for f in glob.glob(os.path.join(rdir, 'phone_p*.png')) + glob.glob(os.path.join(rdir, 'desk_p*.png')):
        os.remove(f)                           # never count a render from an earlier run
    tight = sorted(((p['spareBelowRowsPx'], p['page']) for p in lay.get('pages', []) if p.get('spareBelowRowsPx') is not None))[:3]
    sample = sorted({1, 2, 3, 4, 5, npages - 1, npages} | {page_of[i] for i in ('US', 'JP', 'IL', 'KR', 'BG', 'PL') if i in page_of}
                    | {p for _, p in tight})
    for p in sample:
        run(['pdftoppm', '-f', str(p), '-l', str(p), '-scale-to-x', '1170', '-scale-to-y', '-1', '-png', a.pdf, os.path.join(rdir, f'phone_p{p:02d}')])
        run(['pdftoppm', '-f', str(p), '-l', str(p), '-scale-to-x', '-1', '-scale-to-y', '1600', '-png', a.pdf, os.path.join(rdir, f'desk_p{p:02d}')])
    rendered = sorted(os.path.basename(f) for f in glob.glob(os.path.join(rdir, 'phone_p*.png')) + glob.glob(os.path.join(rdir, 'desk_p*.png')))
    heights = sorted(y1 - y0 for p in page_of.values() for x0, y0, x1, y1, t in bbox[p - 1]['words'])
    pw = bbox[5]['w']
    phone_px = lambda h: round(h * 390 / pw, 1)
    detail['readability'] = {'renders_dir': os.path.relpath(rdir, HERE), 'renders': rendered, 'page_width_pt': pw,
                             'smallest_word_box_pt': round(heights[0], 2), 'p5_word_box_pt': round(heights[len(heights) // 20], 2),
                             'median_word_box_pt': round(heights[len(heights) // 2], 2),
                             'phone_390px_smallest_px': phone_px(heights[0]), 'phone_390px_p5_px': phone_px(heights[len(heights) // 20]),
                             'phone_390px_median_px': phone_px(heights[len(heights) // 2])}
    res['11_renders_desktop_and_phone'] = all(glob.glob(os.path.join(rdir, f'{k}_p{p:02d}-*.png')) for p in sample for k in ('phone', 'desk'))

    # 12: the retired orange is not used; the accent is the current #F0C44C
    cols = pdf_colours(a.pdf)
    near_old = {str(c): n for c, n in cols.items() if dist(c, OLD_ORANGE) < 0.07}
    accent = sum(n for c, n in cols.items() if dist(c, ACCENT) < 0.02)
    src_html = open(out['html']).read().lower() if os.path.exists(out['html']) else None
    res['12_no_old_orange_accent'] = not near_old and accent > 0 and src_html is not None and '#f58a07' not in src_html
    detail['colour'] = {'old_orange_uses': near_old, 'accent_f0c44c_uses': accent, 'distinct_colours': len(cols),
                        'source_html': os.path.relpath(out['html'], HERE), 'source_html_found': src_html is not None,
                        'top_colours': [f'#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}×{n}' for (r, g, b), n in cols.most_common(12)]}

    # 13: claims stay inside the v23 scope (v1.1: no promise of a product for every ingredient; the new cover wording)
    full = re.sub(r'\s+', ' ', ' '.join(texts))
    hits = [(pat, full[max(0, m.start() - 40):m.end() + 40]) for pat in FORBIDDEN for m in re.finditer(pat, full, re.I)]
    fda = [full[max(0, m.start() - 30):m.end() + 30] for m in re.finditer(r'FDA', full)]
    fda_bad = [c for c in fda if 'not an FDA approval' not in c]
    req_missing = [r for r in REQUIRED if r.lower() not in full.lower()]
    res['13_claims_within_v23_scope'] = not hits and not fda_bad and not req_missing
    detail['claims'] = {'forbidden_patterns': FORBIDDEN, 'required_phrases': REQUIRED, 'forbidden_hits': hits, 'fda_mentions': fda,
                        'required_missing': req_missing}

    # 14: cover (E8) — title largest and in the upper half, benefit second, format/price and coverage small, no big "75"
    c1 = bbox[0]
    W1 = [(x0, y0, x1, y1, t, y1 - y0) for x0, y0, x1, y1, t in c1['words']]
    top_h = max(w[5] for w in W1)
    big = [w for w in W1 if w[5] >= .8 * top_h]
    title_ok = squash(' '.join(w[4] for w in big)) == squash(TITLE)
    title_upper = bool(big) and max(w[3] for w in big) < c1['h'] / 2
    toks = BENEFIT.split()
    ben = next((W1[k:k + len(toks)] for k in range(len(W1) - len(toks) + 1) if [w[4] for w in W1[k:k + len(toks)]] == toks), None)
    ben_h = max(w[5] for w in ben) if ben else 0
    rest = [w for w in W1 if w not in big and (not ben or w not in ben)]
    rest_h = max((w[5] for w in rest), default=0)
    small_found = {s: squash(s) in sq[0] for s in COVER_SMALL}
    big75 = [w[4] for w in W1 if '75' in w[4] and w[5] >= ben_h]
    cover_forbidden = [p for p in ('matched to a product', 'COUNTRIES') if p in texts[0]]
    res['14_cover_title_benefit_hierarchy'] = (title_ok and title_upper and bool(ben) and ben_h < min(w[5] for w in big)
                                               and ben_h > rest_h and all(small_found.values()) and not big75 and not cover_forbidden)
    detail['cover'] = {'largest_words': [w[4] for w in big], 'title_box_pt': round(min((w[5] for w in big), default=0), 1),
                       'title_bottom_pt': round(max((w[3] for w in big), default=0), 1), 'page_height_pt': c1['h'],
                       'benefit_found': bool(ben), 'benefit_box_pt': round(ben_h, 1), 'largest_other_box_pt': round(rest_h, 1),
                       'small_lines_found': small_found, 'large_75': big75, 'old_cover_text_found': cover_forbidden}

    # 15: local sugar names (D-8, D-32) — exactly the approved names, on exactly the approved markets, in the sugar row only
    terms, term_problems = load_sugar_terms(countries)
    named_ok, named_bad, plain_bad, stray = [], {}, {}, {}
    for i, p in sorted(page_of.items()):
        got = sugar_row_lines(bbox[p - 1])
        ts = terms.get(i)
        want = SUGAR_ROW[:2] + ([local_name_text(ts)] if ts else []) + SUGAR_ROW[2:]
        elsewhere = [l for l in texts[p - 1].split('\n') if 'Local name' in l]
        if got is None:
            (named_bad if ts else plain_bad)[i] = 'sugar row not found'
        elif not same_printed('\n'.join(want), '\n'.join(got)):
            (named_bad if ts else plain_bad)[i] = {'expected': want, 'printed': got}
        elif ts:
            named_ok.append({'iso': i, 'page': p, 'printed': got[2:-1],   # the lines between the pack line and the label note
                             'comparison': 'exact + right-to-left letters as a multiset' if RTL.search(local_name_text(ts)) else 'exact'})
        if len(elsewhere) != (1 if ts else 0):
            stray[i] = elsewhere
    all_local = sum(1 for t in texts for l in t.split('\n') if 'Local name' in l)
    res['15_local_sugar_names_d32'] = (not term_problems and len(named_ok) == len(terms) == SUGAR_MARKETS and not named_bad
                                       and not plain_bad and not stray and all_local == SUGAR_MARKETS)
    detail['local_sugar_names'] = {'approved_list': os.path.relpath(SUGAR_TERMS_CSV, HERE),
                                   'approved_list_sha256': hashlib.sha256(open(SUGAR_TERMS_CSV, 'rb').read()).hexdigest(),
                                   'approved_markets': len(terms), 'approved_terms': sum(len(v) for v in terms.values()),
                                   'd32_problems': term_problems, 'markets_printed_exactly': len(named_ok),
                                   'printed': named_ok, 'approved_market_mismatches': named_bad,
                                   'other_markets_checked': len(page_of) - len(terms), 'other_market_mismatches': plain_bad,
                                   'local_name_lines_outside_sugar_row_or_on_other_markets': stray,
                                   'local_name_lines_in_document': all_local}

    # 16: title — running header on pages 2–81, PDF metadata title, the old name nowhere
    meta_title = (re.search(r'^Title:\s+(.*)$', info, re.M) or [None, ''])[1].strip()
    hdr_bad = {}
    for n in range(2, npages):
        pg = bbox[n - 1]
        top = [t for x0, y0, x1, y1, t in sorted(pg['words'], key=lambda w: w[0]) if y1 < 45 and x0 > pg['w'] / 2]
        if squash(''.join(top)) != squash(HEADER):
            hdr_bad[n] = ' '.join(top)
    old_name = [n for n, s in enumerate(sq, 1) if squash('Gelato Base Guide') in s]
    back_title = squash(TITLE) in sq[npages - 1]
    res['16_title_header_metadata'] = meta_title == PDF_TITLE and not hdr_bad and not old_name and back_title
    detail['title'] = {'pdf_metadata_title': meta_title, 'expected': PDF_TITLE, 'header_pages_checked': npages - 2,
                       'header_mismatches': hdr_bad, 'pages_with_old_name': old_name, 'back_cover_has_title': back_title}

    # 17: against the baseline (v1) — only the header and the local-name lines change on pages 3–80; navigation identical
    base = a.baseline if a.baseline and os.path.abspath(a.baseline) != os.path.abspath(a.pdf) else ''
    if base:
        binfo = run(['pdfinfo', base])
        bn = int(re.search(r'Pages:\s+(\d+)', binfo).group(1))
        btexts = run(['pdftotext', base, '-']).split('\f')[:bn]
        blinks, boutline = parse_xml(run(['pdftohtml', '-xml', '-i', '-stdout', base]))
        bbbox = parse_bbox(run(['pdftotext', '-bbox-layout', base, '-']))
        lines_of = lambda t: [re.sub(r'\s+', ' ', l).strip() for l in t.split('\n') if l.strip()]
        changes, unexpected, kinds, geometry = {}, {}, Counter(), {}
        for p in range(1, max(npages, bn) + 1):
            A = lines_of(btexts[p - 1]) if p <= bn else []
            B = lines_of(texts[p - 1]) if p <= npages else []
            ops = []
            for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, A, B, autojunk=False).get_opcodes():
                if tag == 'equal':
                    continue
                old, new, kind = A[i1:i2], B[j1:j2], 'other'
                if old == [OLD_HEADER] and new == [HEADER]:
                    kind = 'header'
                elif tag == 'insert' and iso_of.get(p) in terms and same_printed(local_name_text(terms[iso_of[p]]), ' '.join(new)):
                    kind = 'local_name'
                ops.append({'kind': kind, 'removed': old, 'added': new})
            others = [o for o in ops if o['kind'] == 'other']
            if others and Counter(l for o in others for l in o['removed']) == Counter(l for o in others for l in o['added']):
                for o in others:        # the same lines, extracted in another order; geometry below proves the positions
                    o['kind'] = 'reading_order_only'
            changes[p] = ops
            if 3 <= p <= 80 and p <= min(npages, bn):
                want = Counter({'header': 1, **({'local_name': 1} if iso_of.get(p) in terms else {})})
                have = Counter(o['kind'] for o in ops if o['kind'] != 'reading_order_only')
                geometry[p] = geometry_diff(bbbox[p - 1], bbox[p - 1], iso_of.get(p) in terms)
                if have != want or not geometry[p]['ok']:
                    unexpected[p] = {'text_ops': ops, 'geometry': geometry[p]}
                for o in ops:
                    kinds[o['kind']] += 1
        norm = lambda L: {pg: [(('#' + h.rsplit('#', 1)[1]) if not h.startswith('http') and '#' in h else h, t) for h, t in ls]
                          for pg, ls in L.items() if ls}
        L1, L0 = norm(links), norm(blinks)
        count = lambda L, pred, pages=None: sum(1 for pg, ls in L.items() if pages is None or pg in pages for h, t in ls if pred(h))
        is_int, is_ext = (lambda h: h.startswith('#')), (lambda h: h.startswith('http'))
        country_pages = set(page_of.values())
        t0, t1 = versioned(base)['tag'], out['tag']
        nav = {k: {t0: f(L0), t1: f(L1)} for k, f in (
            ('internal_links', lambda L: count(L, is_int)), ('index_links_p4_p5', lambda L: count(L, is_int, {4, 5})),
            ('internal_links_country_pages', lambda L: count(L, is_int, country_pages)), ('external_links', lambda L: count(L, is_ext)),
            ('external_links_country_pages', lambda L: count(L, is_ext, country_pages)))}
        nav['bookmarks'] = {t0: len(boutline), t1: len(outline)}
        same_nav = L1 == L0 and outline == boutline
        country_diff = {'pages_3_80_with_only_allowed_changes': sum(1 for p in range(3, 81) if p not in unexpected),
                        'header_replacements_3_80': kinds['header'], 'local_name_insertions_3_80': kinds['local_name'],
                        'reading_order_only_ops_3_80': kinds['reading_order_only'],
                        'pages_with_reading_order_only_ops': sorted(p for p in range(3, 81) if any(o['kind'] == 'reading_order_only' for o in changes.get(p, []))),
                        'other_changes_3_80': kinds['other'],
                        'geometry_pages_identical_or_one_step_shift': sum(1 for g in geometry.values() if g['ok']),
                        'geometry_words_compared_3_80': sum(g.get('words_compared', 0) for g in geometry.values()),
                        'geometry_words_moved_down_3_80': sum(g.get('moved_words', 0) for g in geometry.values()),
                        'geometry_shift_pt_values': sorted({s for g in geometry.values() for s in g.get('shift_pt_range', [])}),
                        'country_pages_with_local_name': sorted(iso_of[p] for p in range(6, 81) if any(o['kind'] == 'local_name' for o in changes[p]))}
        res['17_changes_vs_baseline_only_allowed'] = bn == npages and not unexpected and same_nav
        detail['baseline'] = {'pdf': os.path.basename(base), 'sha256': hashlib.sha256(open(base, 'rb').read()).hexdigest(), 'pages': bn,
                              'summary': country_diff, 'unexpected_changes_pages_3_80': unexpected, 'navigation_counts': nav,
                              'links_identical_per_page': L1 == L0, 'bookmarks_identical': outline == boutline,
                              'front_and_back_changes': {p: changes[p] for p in (1, 2, npages - 1, npages)}}
        # side-by-side renders for the owner review (G1/G7): the same pages from both versions
        sdir = os.path.join(rdir, 'side_by_side'); os.makedirs(sdir, exist_ok=True)
        made = []
        for key, label in SIDE_BY_SIDE:
            p = key if isinstance(key, int) else page_of.get(key)
            if not p:
                continue
            pair = []
            for ver, pdf in ((versioned(base)['tag'], base), (out['tag'], a.pdf)):
                stem = os.path.join(sdir, f'{ver}_p{p:02d}_{label}')
                run(['pdftoppm', '-f', str(p), '-l', str(p), '-r', '110', '-png', '-singlefile', pdf, stem])
                pair.append(stem + '.png'); made.append(os.path.basename(stem) + '.png')
            try:
                from PIL import Image
                ims = [Image.open(f).convert('RGB') for f in pair]
                sheet = Image.new('RGB', (sum(i.width for i in ims) + 24, max(i.height for i in ims)), (120, 120, 120))
                sheet.paste(ims[0], (0, 0)); sheet.paste(ims[1], (ims[0].width + 24, 0))
                sheet.save(os.path.join(sdir, f'pair_p{p:02d}_{label}.png')); made.append(f'pair_p{p:02d}_{label}.png')
            except ImportError:
                pass
        detail['baseline']['side_by_side_renders'] = {'dir': os.path.relpath(sdir, HERE), 'files': sorted(made)}

    ok = all(res.values())
    report = {'pdf': os.path.basename(a.pdf), 'pdf_sha256': hashlib.sha256(open(a.pdf, 'rb').read()).hexdigest(),
              'v23_sha256': sha, 'v23_is_frozen_authority': sha == V23_SHA, 'pages': npages, 'all_pass': ok and sha == V23_SHA,
              'checks': res, 'detail': detail}
    json.dump(report, open(out['report'], 'w'), ensure_ascii=False, indent=1)
    lines = [f'# Validation — Gellatti {TITLE} guide ({out["tag"]})', '',
             f'PDF `{report["pdf"]}` · sha256 `{report["pdf_sha256"][:16]}…` · {npages} pages',
             f'Source: v23 sha256 `{sha[:16]}…` — frozen authority: {"YES" if sha == V23_SHA else "NO"}',
             f'Baseline: `{os.path.basename(base)}`' if base else 'Baseline: none (check 17 not run)', '',
             '| # | check | result |', '|---|---|---|']
    for k, v in res.items():
        n, _, label = k.partition('_')
        lines.append(f'| {n} | {label.replace("_", " ")} | {"PASS" if v else "FAIL"} |')
    lines += ['', f'Overall: **{"PASS" if report["all_pass"] else "FAIL"}**', '', f'Details: `{os.path.basename(out["report"])}`.']
    open(out['md'], 'w').write('\n'.join(lines) + '\n')
    for k, v in res.items():
        print(f'{"PASS" if v else "FAIL"}  {k}')
    if not base:
        print('SKIP  17_changes_vs_baseline_only_allowed (no baseline)')
    print('ALL PASS' if report['all_pass'] else 'SOME CHECKS FAIL', f'({sum(res.values())}/{len(res)})')
    return 0 if report['all_pass'] else 1


if __name__ == '__main__':
    sys.exit(main())
