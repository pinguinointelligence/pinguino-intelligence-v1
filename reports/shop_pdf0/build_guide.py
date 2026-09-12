#!/usr/bin/env python3
"""GELLATTI SHOP — free 0 € PDF: the 75-country gelato BASE guide.

Source authority (owner, 2026-09-12): GELLATTI_BAZA_GELATO_75_KRAJOW_v23_SYNC_FINAL.xlsx, frozen.
Every product field is copied from v23: sheet 04_POKRYCIE_PR (the 75 × 6 matrix) and the role sheets 11_MLEKO_75,
14_SMIETANKA_75, 17_PROSZEK_75, 20_DEKSTROZA_75 and 23_TARA_75. Nothing is researched, re-selected or substituted.
Presentation changes only:
  - English labels. Polish pack wording and the Polish v23 notes are translated through fixed tables (PACK_EN,
    V23_TEXT_EN). A v23 text that is not in a table stops the build instead of being guessed.
  - Fat values are rounded to one decimal for display; a number and its unit never break across lines.
  - At most two links per product, listing pages only. Spec sheets, images, JSON and shipping pages stay in the
    dataset (sources_v23) and are not shown.
  - "From abroad" is shown only where v23 records a cross-border channel: TARA "Kanał oferty" = IMPORT, or the
    SMP/DEXTROSE offer text says import or cross-border.

usage: build_guide.py [--xlsx PATH] [--node-modules DIR] [--no-pdf]
Outputs: reports/shop_pdf0/ (dataset, PDF, layout report); reports/shop_pdf0/build/ (HTML, fonts; not in git).
"""
import argparse, csv, hashlib, html, json, os, re, shutil, subprocess, sys, unicodedata, zipfile
from decimal import Decimal, ROUND_HALF_UP
from xml.etree import ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build')
V23_SHA = '37afaf6f98bad68d2768c02562f130f0502ba875d3ae4a08f51f420b82de16b4'
DEFAULT_XLSX = os.path.expanduser('~/Developer/gellatti-owner-inputs/2026-09-12_GELATO_75_v23_SYNC_FINAL/'
                                  'GELLATTI_BAZA_GELATO_75_KRAJOW_v23_SYNC_FINAL.xlsx')
DEFAULT_NODE_MODULES = os.path.expanduser('~/Developer/pinguino-intelligence-v1/node_modules')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
PDF_NAME = 'GELLATTI_GELATO_BASE_GUIDE_75_COUNTRIES_v1.pdf'
TITLE = 'Gelato Base Guide'
EDITION = 'Edition 1 · September 2026'
ROLES = ['MILK', 'CREAM', 'SMP', 'SUCROSE', 'DEXTROSE', 'TARA']
ROLE_LABEL = {'MILK': 'Milk', 'CREAM': 'Cream', 'SMP': 'Skim milk powder', 'SUCROSE': 'Sugar',
              'DEXTROSE': 'Dextrose', 'TARA': 'Tara gum'}
ROLE_SHEET = {'MILK': '11_MLEKO_75', 'CREAM': '14_SMIETANKA_75', 'SMP': '17_PROSZEK_75',
              'DEXTROSE': '20_DEKSTROZA_75', 'TARA': '23_TARA_75'}
SKU_FIELD = {'SMP': 'SKU / kod dostawcy', 'DEXTROSE': 'SKU / ID oferty', 'TARA': 'SKU / ID oferty'}
FRONT_PAGES = 5            # cover, how to use, the six ingredients, index (2 pages)
INDEX_FIRST_SHARE = 0.44   # the first index page also carries the title, so it takes a little less than half

REGION = {  # v23 routing group → customer region (display only)
    'Europe': {'EU27', 'EEA_NON_EU', 'SWITZERLAND', 'UNITED_KINGDOM', 'TURKIYE'},
    'Americas': {'UNITED_STATES', 'CANADA', 'LATAM_NORTH_ANDEAN', 'LATAM_SOUTH_CONE', 'BRAZIL'},
    'Middle East & North Africa': {'GCC', 'MAGHREB', 'EGYPT', 'ISRAEL'},
    'Sub-Saharan Africa': {'WEST_AFRICA', 'KENYA', 'SOUTH_AFRICA'},
    'Asia–Pacific': {'GREATER_CHINA', 'EAST_ASIA', 'ASEAN', 'SOUTH_ASIA', 'ANZ'},
}

# v23 pack wording → English. Only wording is translated; sizes and counts are kept exactly.
PACK_EN = {
    '1 L Tetra Base; jednostka konsumencka w zgrzewce 12 x 1 L': '1 L Tetra Base carton (sold in shrink packs of 12 × 1 L)',
    '1 L butelka': '1 L bottle',
    '1 L karton UHT': '1 L UHT carton',
    '1 L karton, produkt MS nr0101': '1 L carton (product MS no. 0101)',
    '1 L, karton Tetra Pak UHT': '1 L UHT Tetra Pak carton',
    '1 L, karton Tetra Rex; mleko ESL pasteryzowane w podwyższonej temperaturze, chłodzone 0–6°C':
        '1 L Tetra Rex carton; ESL milk, keep chilled at 0–6 °C',
    '1 L, karton UHT': '1 L UHT carton',
    '1 L, karton UHT, 4 porcje po250ml': '1 L UHT carton (4 × 250 ml portions)',
    '1 L, karton eksportowy wielojęzyczny z nakrętką': '1 L export carton with screw cap (multilingual label)',
    '1 l karton UAT/UHT': '1 L UHT carton',
    '1 l karton UHT': '1 L UHT carton',
    '1 l karton UHT Q Pack z zamknięciem': '1 L UHT Q Pack carton with cap',
    '1 l karton UHT z zamknięciem': '1 L UHT carton with cap',
    '1 l karton, mleko pasteryzowane chłodzone': '1 L carton, pasteurised chilled milk',
    '1 l, karton UHT': '1 L UHT carton',
    '1100 ml worek': '1100 ml bag',
    '2 L butelka': '2 L bottle',
    '2 L butelka, świeże filtrowane mleko': '2 L bottle, fresh filtered milk',
    '200 g, karton': '200 g carton',
    '200 ml karton': '200 ml carton',
    '25 kg, opakowanie producenta': "25 kg, manufacturer's pack",
    '250 g, worek zip': '250 g zip bag',
    '250 ml, karton UHT': '250 ml UHT carton',
    '400 g, saszetka z zakrętką, 27 porcji po 15 g': '400 g pouch with cap (27 × 15 g servings)',
    '473 ml, karton': '473 ml carton',
    '500 g (pakiet 10 szt.)': '500 g (pack of 10)',
    '500 g; karton 10 × 500 g': '500 g; case of 10 × 500 g',
    '946 ml karton UHT': '946 ml UHT carton',
    'B2B — opakowanie według zamówienia; masa niepublikowana': 'B2B — pack size per order (not published)',
    'karton 300 g': '300 g carton',
    'puszka 300 g': '300 g tin',
    'puszka 400 g': '400 g tin',
    'puszka 700 g': '700 g tin',
    'torebka 12 oz (340 g)': '12 oz (340 g) bag',
    'torebka 380 g': '380 g bag',
    'worek 25 kg': '25 kg sack',
    # English entries that carry internal shorthand
    '1 kg (2.2 lb) — label 005': '1 kg (2.2 lb)',
    '1 L carton; case12 x1L': '1 L carton; case of 12 × 1 L',
    '6 x1 L (GTIN for retail multipack; not singlecarton)': '6 × 1 L (the barcode is on the 6-pack, not the single carton)',
}
POLISH_WORD = re.compile(r'[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]|\b(opakowanie|karton|butelka|puszka|torebka|worek|saszetka|zgrzewk|porcj|pakiet|szt)\b', re.I)

# v23 texts that the guide shows in English. The build stops if v23 changes them.
V23_TEXT_EN = {
    'Biały cukier krystaliczny — 100% cukier': 'White granulated sugar — 100% sugar',
    'dowolne opakowanie': 'any pack',
    'Etykieta musi zawierać wyłącznie cukier/sacharozę.': 'The ingredients should list only sugar (sucrose).',
    'Tara — składnik podlega obróbce cieplnej. Wymieszaj z suchymi składnikami i ogrzej bazę do 75–80°C.':
        'Mix with the dry ingredients and heat the base to 75–80 °C.',
}

# "From abroad" — the v23 statements that mark a cross-border channel
ABROAD_SMP = re.compile(r'Oferta importowa e-commerce|WARUNKOWY IMPORT|Import przez sklep internetowy|Oferta importowa iHerb')
ABROAD_DEX = re.compile(r'cross-border|DEKLAROWANY IMPORT|Import detaliczny z|Import z Włoch', re.I)

# links: listing pages only
NOT_A_LISTING = re.compile(r'\.pdf\b|\.(jpe?g|png|webp|gif)\b|\.json\b|openfoodfacts|barcode|/policies/|shipping|/cdn/|'
                           r'cdn\.|cloudcdn|/media/uploads|amazonaws|/uploads/|viewdownload|hubfs|datenblatt|dokumente\.|'
                           r'/files/|lmiv', re.I)
CCTLD = {'GB': 'uk'}
SELLER_HOST = {'BakingWarehouse': 'bakingwarehouse.com', 'SaporePuro': 'saporepuro.com', 'Gioia': 'saporepuro.com',
               'Essex': 'essexfoodingredients.com'}
UNIT_NBSP = re.compile(r'(?<=\d)[  ]+(?=(?:g|kg|mg|ml|cl|l|L|oz|lb|fl|%)(?![A-Za-z]))')
RTL_RUN = re.compile(r'[\u0590-\u05FF\u0600-\u06FF](?:[\u0590-\u05FF\u0600-\u06FF \d%.,]*[\u0590-\u05FF\u0600-\u06FF%\d])?')


# ─────────────────────────────── workbook ───────────────────────────────
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
RNS = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'


class Book:
    """Dependency-free .xlsx reader that keeps the Excel row numbers (for provenance)."""

    def __init__(self, path):
        self.z = zipfile.ZipFile(path)
        self.shared = []
        if 'xl/sharedStrings.xml' in self.z.namelist():
            for si in ET.fromstring(self.z.read('xl/sharedStrings.xml')).findall(NS + 'si'):
                self.shared.append(''.join(t.text or '' for t in si.iter(NS + 't')))
        rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(self.z.read('xl/_rels/workbook.xml.rels'))}
        self.sheets = {}
        for sh in ET.fromstring(self.z.read('xl/workbook.xml')).find(NS + 'sheets'):
            target = rels[sh.get(RNS + 'id')].split('/')[-1]
            self.sheets[sh.get('name')] = next(n for n in self.z.namelist() if n.endswith('/' + target) and 'worksheets' in n)

    def rows(self, name):
        out = []
        for row in ET.fromstring(self.z.read(self.sheets[name])).iter(NS + 'row'):
            d = {}
            for c in row.findall(NS + 'c'):
                col = re.match(r'([A-Z]+)', c.get('r')).group(1)
                t, v, isn = c.get('t'), c.find(NS + 'v'), c.find(NS + 'is')
                if t == 'inlineStr' and isn is not None:
                    val = ''.join(x.text or '' for x in isn.iter(NS + 't'))
                elif v is None:
                    val = ''
                elif t == 's':
                    val = self.shared[int(v.text)]
                else:
                    val = v.text or ''
                d[col] = val
            out.append((int(row.get('r')), d))
        return out

    def table(self, name, must_have):
        """Records under the first row that names every header in must_have: [(excel_row, {header: value})]."""
        rows = self.rows(name)
        for i, (_, d) in enumerate(rows):
            cols = {v.strip(): k for k, v in d.items() if v and v.strip()}
            if all(h in cols for h in must_have):
                return [(rn, {h: (d2.get(c) or '').strip() for h, c in cols.items()}) for rn, d2 in rows[i + 1:]]
        sys.exit(f'{name}: no header row with {must_have}')


# ─────────────────────────────── dataset ───────────────────────────────
def iso_row(rec, key):
    return re.fullmatch(r'[A-Z]{2}', rec.get(key, '') or '') is not None


def urls(text):
    return [u.strip() for u in re.split(r'[\s;,]+', text or '') if u.strip().startswith('http')]


def host(u):
    return re.sub(r'^www\.', '', (u.split('/') + ['', '', ''])[2].lower())


def listing_links(all_urls, iso, prefer_host=None, limit=2):
    tld = CCTLD.get(iso, iso.lower())
    cands = [u for u in all_urls if not NOT_A_LISTING.search(u)]
    # stable sort keeps the v23 order inside each group: the seller's own site, then the market's country domain
    cands.sort(key=lambda u: (0 if prefer_host and host(u).endswith(prefer_host) else 1, 0 if host(u).endswith('.' + tld) else 1))
    out, seen = [], set()
    for u in cands:
        h = host(u)
        if h in seen:
            continue
        seen.add(h)
        out.append({'url': u, 'label': h})
        if len(out) == limit:
            break
    return out


def fmt_pct(v):
    q = Decimal(v).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)
    return f'{q.normalize():f}' if q == q.to_integral_value() else f'{q}'


def id_label(e):
    return {13: 'EAN', 12: 'UPC', 8: 'EAN-8', 14: 'GTIN'}.get(len(e), 'Barcode')


def clean_code(sku, keep_all=False):
    """A retailer/manufacturer code from the v23 SKU field, without internal commentary."""
    parts = [p.strip() for p in re.split(r';|\n', sku or '') if p.strip()]
    if not keep_all:
        parts = parts[:1]
    out = []
    for p in parts:
        p = re.sub(r'\s*\((?:ID oferty|Chef|manufacturer)[^)]*\)', '', p)
        toks = [t.strip() for t in p.split(' / ')
                if t.strip() and not re.search(r'[ąćęłńóśźż]|label|nazwa|numeryczn|nie GTIN|kandy|retailer|printed', t, re.I)]
        if toks:
            out.append(' / '.join(toks))
    return ' · '.join(out)


def translate(text, where):
    if text not in V23_TEXT_EN:
        sys.exit(f'v23 text changed or unknown ({where}): {text!r} — update V23_TEXT_EN after checking it')
    return V23_TEXT_EN[text]


def region_of(code):
    return next((name for name, codes in REGION.items() if code in codes), None)


def sort_key(name):
    return unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().casefold()


def build_dataset(book):
    issues = []
    countries = {}
    for rn, r in book.table('02_KRAJE_75', ['ISO2', 'Country', 'Region']):
        if iso_row(r, 'ISO2'):
            countries[r['ISO2']] = {'iso': r['ISO2'], 'country': r['Country'], 'region_code': r['Region'],
                                    'region': region_of(r['Region']), 'v23_row': rn}
    matrix = {}
    for rn, r in book.table('04_POKRYCIE_PR', ['ISO2', 'Rola', 'Dokładny produkt']):
        if iso_row(r, 'ISO2'):
            if (r['ISO2'], r['Rola']) in matrix:
                issues.append(f'duplicate 04 row {r["ISO2"]}/{r["Rola"]}')
            matrix[(r['ISO2'], r['Rola'])] = (rn, r)
    side = {role: {r['ISO']: (rn, r) for rn, r in book.table(sheet, ['ISO', 'Wybrany produkt']) if iso_row(r, 'ISO')}
            for role, sheet in ROLE_SHEET.items()}
    tara_row = next(((rn, d) for rn, d in book.rows('01_BAZA_PI') if (d.get('B') or '').strip() == 'TARA'), (None, {}))
    tara_note = translate((tara_row[1].get('L') or '').strip(), f'01_BAZA_PI!L{tara_row[0]}')

    if len(countries) != 75:
        issues.append(f'02_KRAJE_75 has {len(countries)} countries')
    for c in countries.values():
        if not c['region']:
            issues.append(f'{c["iso"]}: unknown region code {c["region_code"]}')

    items = []
    for iso in countries:
        for role in ROLES:
            if (iso, role) not in matrix:
                issues.append(f'{iso}/{role}: missing in 04_POKRYCIE_PR')
                continue
            rn4, r4 = matrix[(iso, role)]
            it = {'iso': iso, 'role': role, 'role_label': ROLE_LABEL[role], 'v23_rows': {'04_POKRYCIE_PR': rn4},
                  'product_v23': r4['Dokładny produkt'], 'brand_v23': r4['Marka'], 'pack_v23': r4['Opakowanie'],
                  'ean_v23': r4['EAN / GTIN'], 'tags': [], 'code': '', 'note': '', 'links': [], 'sources_v23': []}
            if role == 'SUCROSE':
                it.update(name=translate(r4['Dokładny produkt'], f'{iso} SUCROSE product'),
                          meta=['Any brand', translate(r4['Opakowanie'], f'{iso} SUCROSE pack')],
                          note=translate(r4['Warunek aktywacji'], f'{iso} SUCROSE condition'), ean='')
                if r4['Marka'] != 'GENERIC':
                    issues.append(f'{iso}/SUCROSE: brand is {r4["Marka"]!r}, expected GENERIC')
                items.append(it)
                continue
            if iso not in side[role]:
                issues.append(f'{iso}/{role}: missing in {ROLE_SHEET[role]}')
                continue
            rns, rs = side[role][iso]
            it['v23_rows'][ROLE_SHEET[role]] = rns
            pack_key = 'Opakowanie' if 'Opakowanie' in rs else 'Opakowanie / jednostka GTIN'
            for a, b, what in ((r4['Dokładny produkt'], rs['Wybrany produkt'], 'product'), (r4['Opakowanie'], rs[pack_key], 'pack'),
                               (r4['EAN / GTIN'], rs['EAN / GTIN'], 'EAN')):
                if a != b:
                    issues.append(f'{iso}/{role}: 04 and {ROLE_SHEET[role]} differ on {what}: {a!r} vs {b!r}')
            pack = PACK_EN.get(r4['Opakowanie'], r4['Opakowanie'])
            if POLISH_WORD.search(pack):
                issues.append(f'{iso}/{role}: untranslated pack wording {pack!r}')
            ean = re.sub(r'\D', '', r4['EAN / GTIN'])
            meta = [r4['Marka'], pack]
            if role in ('MILK', 'CREAM', 'SMP'):
                it['fat_v23'] = rs['Tłuszcz g']
                meta.append(f'{fmt_pct(rs["Tłuszcz g"])}% fat')
            if role == 'DEXTROSE':
                it['form_v23'] = rs['Postać']
                if 'mono' in rs['Postać'].lower():
                    meta.append('monohydrate')
            it.update(name=r4['Dokładny produkt'], meta=meta, ean=ean)
            if not ean and role in SKU_FIELD:
                it['code'] = clean_code(rs.get(SKU_FIELD[role], ''), keep_all=(role == 'TARA'))
            src = urls(rs.get('Źródła', ''))
            it['sources_v23'] = src
            prefer = None
            if role == 'SMP' and ABROAD_SMP.search(rs.get('Dostępność / warunki', '')):
                it['tags'].append('From abroad'); it['abroad_basis_v23'] = rs['Dostępność / warunki'][:200]
            if role == 'DEXTROSE':
                t = rs.get('Warunki oferty', '')
                if ABROAD_DEX.search(t) and 'SPRZEDAŻ KRAJOWA' not in t:
                    it['tags'].append('From abroad'); it['abroad_basis_v23'] = t[:200]
            if role == 'TARA':
                ch, seller_v23 = rs['Kanał oferty'], rs['Dostawca']
                it['channel_v23'], it['seller_v23'] = ch, seller_v23
                if ch == 'IMPORT':
                    it['tags'].append('From abroad'); it['abroad_basis_v23'] = 'Kanał oferty = IMPORT'
                elif 'B2B' in ch:
                    it['tags'].append('B2B')
                elif ch != 'LOCAL':
                    issues.append(f'{iso}/TARA: unknown channel {ch!r}')
                if 'BakingWarehouse' in seller_v23:
                    it['seller'] = 'Sold by BakingWarehouse, Hong Kong'
                elif 'SaporePuro' in seller_v23 or 'Gioia' in seller_v23:
                    it['seller'] = 'Sold by SaporePuro, Italy'
                elif 'Essex' in seller_v23:
                    it['seller'] = 'Sold to businesses via US distributors'
                else:
                    issues.append(f'{iso}/TARA: unknown seller {seller_v23!r}')
                prefer = next((h for k, h in SELLER_HOST.items() if k in seller_v23), None)
                it['note'] = tara_note
            it['links'] = listing_links(src, iso, prefer)
            if not it['links']:
                issues.append(f'{iso}/{role}: no listing link among {len(src)} v23 sources')
            items.append(it)

    order = sorted(countries.values(), key=lambda c: sort_key(c['country']))
    for i, c in enumerate(order):
        c['page'] = FRONT_PAGES + 1 + i
    by_country = {c['iso']: [it for it in items if it['iso'] == c['iso']] for c in order}
    for its in by_country.values():
        its.sort(key=lambda it: ROLES.index(it['role']))
    return order, by_country, issues


# ─────────────────────────────── HTML ───────────────────────────────
def E(s):
    """Escape; keep a number with its unit on one line; isolate right-to-left runs (Hebrew, Arabic) so the
    bidi algorithm never mixes them with a neighbouring pack size."""
    out = UNIT_NBSP.sub('\u00a0', html.escape(s))
    return RTL_RUN.sub(lambda m: f'<bdi>{m.group(0)}</bdi>', out)


ARROW = ('<svg class="arr" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.2 2.2h4.6v4.6M7.8 2.2 2.4 7.6" '
         'fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>')


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
  --line: #ded9d0; --line-strong: #cfcac1; --line-quiet: #e8e4dd; --ivory: #fbfaf7; --ivory-deep: #f6f4ef;
  --brand-ivory: #efe8dc; --accent: #f0c44c; --accent-line: #b88a0f; --accent-ink: #7a5c0a; --graphite: #191a1d;
  --sans: 'Manrope G', 'Hiragino Sans', 'PingFang TC', 'PingFang SC', 'Apple SD Gothic Neo', 'Arial Hebrew', sans-serif;
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

/* running header + footer */
.run { display: flex; align-items: center; justify-content: space-between; height: 5mm; margin-bottom: 4.6mm; flex: none; }
.run img { height: 3.3mm; width: auto; display: block; }
.run span { font-size: 6.3pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
.foot { display: flex; align-items: baseline; justify-content: space-between; padding-top: 2.6mm; margin-top: auto; flex: none;
  border-top: .5pt solid var(--line-quiet); font-size: 7pt; color: var(--muted); }
.foot a { font-weight: 650; color: var(--text2); letter-spacing: .02em; }
.foot a::before { content: '↑'; display: inline-block; margin-right: 1.4mm; font-family: var(--mono); color: var(--accent-line); }
.pno { font-family: var(--mono); font-weight: 500; font-size: 7pt; color: var(--muted); letter-spacing: .04em; }

/* type */
.h1 { font-size: 19pt; font-weight: 800; letter-spacing: -.025em; line-height: 1.08; text-wrap: balance; }
.lede { margin-top: 2.6mm; font-size: 9.5pt; line-height: 1.45; color: var(--text2); max-width: 94mm; }
.eyebrow { font-size: 6.4pt; font-weight: 750; letter-spacing: .16em; text-transform: uppercase; color: var(--accent-ink); }

/* cover */
.cover { padding: 11mm 10mm 10mm; }
.cv-top { display: flex; justify-content: space-between; align-items: center; }
.cv-top img { height: 6.2mm; }
.cv-free { font-size: 7pt; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; color: var(--ink);
  border: .7pt solid var(--ink); border-radius: 99px; padding: 1.1mm 2.6mm 1mm; }
.cv-hero { position: relative; margin-top: 30mm; height: 62mm; flex: none; }
.cv-scoop { position: absolute; left: 47mm; top: -4mm; width: 52mm; height: 52mm; border-radius: 50%; background: var(--accent); }
.cv-num { position: absolute; left: -1.5mm; top: 0; font-size: 158pt; line-height: .8; font-weight: 800;
  letter-spacing: -.07em; color: var(--ink); mix-blend-mode: multiply; }
.cv-numlab { position: absolute; left: 1mm; top: 49mm; font-size: 8pt; font-weight: 750; letter-spacing: .18em;
  text-transform: uppercase; color: var(--ink); }
.cv-text { margin-top: auto; }
.cv-title { font-size: 27pt; font-weight: 800; letter-spacing: -.03em; line-height: 1.02; }
.cv-sub { margin-top: 3.4mm; font-size: 10pt; line-height: 1.42; color: var(--text2); max-width: 88mm; }
.cv-six { list-style: none; margin: 7mm 0 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; column-gap: 6mm; }
.cv-six li { font-size: 9pt; font-weight: 650; padding: 1.9mm 0 1.7mm; border-top: .5pt solid var(--line); }
.cv-six li:nth-child(n+5) { border-bottom: .5pt solid var(--line); }
.cv-foot { margin-top: 10mm; display: flex; justify-content: space-between; font-size: 7pt; color: var(--muted); letter-spacing: .03em; }

/* how to use */
.steps { list-style: none; margin: 6mm 0 0; padding: 0; counter-reset: s; }
.steps li { counter-increment: s; display: grid; grid-template-columns: 9mm 1fr; padding: 3.1mm 0 3.3mm; border-top: .5pt solid var(--line); }
.steps li::before { content: counter(s); font-family: var(--mono); font-size: 9pt; font-weight: 600; color: var(--accent-ink); padding-top: .4mm; }
.steps b { display: block; font-size: 10.6pt; font-weight: 750; letter-spacing: -.01em; margin-bottom: .9mm; }
.steps p { font-size: 9pt; color: var(--text2); line-height: 1.45; }
.box { margin-top: 4.2mm; background: var(--ivory-deep); border-radius: 2.2mm; padding: 3.8mm 4.4mm 4mm; }
.box .t { font-size: 6.4pt; font-weight: 750; letter-spacing: .15em; text-transform: uppercase; color: var(--muted); margin-bottom: 2mm; }
.box p { font-size: 8.8pt; line-height: 1.45; color: var(--text2); }
.box p + p { margin-top: 1.8mm; }
.tagdemo, .tag { display: inline-block; font-size: 5.9pt; font-weight: 780; letter-spacing: .09em; text-transform: uppercase;
  color: var(--text2); background: var(--ivory-deep); border: .5pt solid var(--line-strong); border-radius: 1.2mm;
  padding: .35mm 1.2mm .25mm; white-space: nowrap; }
.tagdemo { background: var(--paper); margin-right: 1mm; vertical-align: .6pt; }
.cta-line { margin-top: auto; padding-top: 4mm; font-size: 8.8pt; color: var(--text2); }
.cta-line a { color: var(--ink); font-weight: 700; border-bottom: .8pt solid var(--accent); }

/* six ingredients */
.ing { margin-top: 5mm; }
.ing div { padding: 2.7mm 0 2.9mm; border-top: .5pt solid var(--line); }
.ing .ih { margin-top: 0; font-size: 10.4pt; font-weight: 750; letter-spacing: -.01em; color: var(--ink); line-height: 1.3; }
.ing .ih small { font-size: 7.4pt; font-weight: 600; color: var(--muted); letter-spacing: .02em; margin-left: 1.2mm; }
.ing p { margin-top: .7mm; font-size: 8.7pt; line-height: 1.42; color: var(--text2); }
.ing p.buy { color: var(--ink); }
.ing p.buy::before { content: 'Buy'; font-size: 6.2pt; font-weight: 750; letter-spacing: .14em; text-transform: uppercase;
  color: var(--accent-ink); margin-right: 1.6mm; vertical-align: .5pt; }

/* index */
.idx { margin-top: 4.4mm; columns: 2; column-gap: 7mm; column-fill: balance; flex: 1 1 auto; min-height: 0; overflow: hidden; }
.grp { break-inside: avoid; margin-bottom: 1.9mm; }
.grp .L { font-size: 7pt; font-weight: 800; color: var(--accent-ink); letter-spacing: .06em; padding-bottom: .4mm;
  border-bottom: .5pt solid var(--line); margin-bottom: .2mm; }
.ie { display: flex; align-items: baseline; gap: 1.4mm; padding: .8mm 0 .7mm; font-size: 8.9pt; font-weight: 600; }
.ie .nm { white-space: nowrap; }
.ie .dots { flex: 1 1 auto; border-bottom: .5pt dotted var(--line-strong); transform: translateY(-.8mm); min-width: 3mm; }
.ie .pn { font-family: var(--mono); font-size: 7.6pt; font-weight: 500; color: var(--muted); }
.cont { font-size: 6.4pt; font-weight: 750; letter-spacing: .15em; text-transform: uppercase; color: var(--muted); }

/* country page */
.ctitle { margin-bottom: 2.6mm; flex: none; }
.cmeta { display: flex; align-items: center; gap: 2mm; margin-bottom: 1.4mm; }
.iso { font-family: var(--mono); font-size: 6.8pt; font-weight: 600; letter-spacing: .08em; color: var(--paper);
  background: var(--graphite); border-radius: 1.1mm; padding: .5mm 1.2mm .35mm; }
.region { font-size: 6.4pt; font-weight: 750; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
.cname { font-size: 19pt; font-weight: 800; letter-spacing: -.03em; line-height: 1.04; text-wrap: balance; }
.bar { width: 13mm; height: 1.5pt; background: var(--accent); margin-top: 2mm; }
.rows { flex: 1 1 auto; min-height: 0; overflow: hidden; }
.row { display: grid; grid-template-columns: 20mm minmax(0, 1fr); column-gap: 3mm; padding: 1.85mm 0 1.95mm; border-top: .5pt solid var(--line-quiet); }
.row:first-child { border-top: .8pt solid var(--ink); }
.role { display: flex; flex-direction: column; align-items: flex-start; gap: 1.3mm; padding-top: .8mm; }
.rl { font-size: 6.6pt; font-weight: 780; letter-spacing: .11em; text-transform: uppercase; line-height: 1.3; }
.name { font-size: 10.6pt; font-weight: 680; line-height: 1.22; letter-spacing: -.012em; overflow-wrap: anywhere; }
.meta { margin-top: .6mm; font-size: 8.4pt; line-height: 1.34; color: var(--text2); }
.prod { min-width: 0; }
.meta .n { white-space: nowrap; }
.meta .w { overflow-wrap: anywhere; }
.meta .s { color: var(--line-strong); margin: 0 .32em; }
.meta > span, bdi { unicode-bidi: isolate; }
.idl { margin-top: .6mm; display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 2.6mm; row-gap: .4mm; font-size: 7.9pt; color: var(--text2); }
.code { font-family: var(--mono); font-size: 7.8pt; font-weight: 500; color: var(--ink); letter-spacing: .01em; white-space: nowrap; }
.code i { font-style: normal; font-family: var(--sans); font-size: 5.9pt; font-weight: 780; letter-spacing: .11em; text-transform: uppercase;
  color: var(--muted); margin-right: 1mm; }
.idl > * { min-width: 0; max-width: 100%; }
.src { color: var(--text2); border-bottom: .5pt solid var(--line-strong); overflow-wrap: anywhere; }
.arr { width: 5.2pt; height: 5.2pt; margin-left: .9pt; vertical-align: .2pt; color: var(--accent-line); }
.seller { margin-top: .5mm; font-size: 7.9pt; color: var(--text2); }
.note { margin-top: .5mm; font-size: 7.5pt; line-height: 1.33; color: var(--muted); }
.note a { color: var(--text2); border-bottom: .5pt solid var(--line-strong); }

/* fitting passes for the densest pages (spacing first, type last) */
.page.tight .row { padding: 1.25mm 0 1.35mm; }
.page.tight .ctitle { margin-bottom: 2mm; }
.page.tight .run { margin-bottom: 3.6mm; }
.page.tight .steps li { padding: 2.6mm 0 2.8mm; }
.page.tighter .name { font-size: 10.1pt; }
.page.tighter .meta { font-size: 8.1pt; }
.page.tighter .idl, .page.tighter .seller { font-size: 7.6pt; }

/* notes */
.nt { margin-top: 4.2mm; }
.nt div { padding: 2.4mm 0 2.5mm; border-top: .5pt solid var(--line); }
.nt .ih { margin-top: 0; font-size: 9.2pt; font-weight: 750; letter-spacing: -.005em; color: var(--ink); line-height: 1.3; }
.nt p { margin-top: .6mm; font-size: 8.1pt; line-height: 1.42; color: var(--text2); }
.fine { margin-top: auto; padding-top: 3mm; font-size: 6.9pt; line-height: 1.45; color: var(--muted); }

/* back cover */
.back { background: var(--graphite); color: var(--brand-ivory); padding: 11mm 10mm 10mm; }
.back img { height: 6.2mm; width: auto; align-self: flex-start; }
.bk-body { margin-top: auto; }
.bk-h { font-size: 28pt; font-weight: 800; letter-spacing: -.035em; line-height: 1.02; color: var(--brand-ivory); }
.bk-p { margin-top: 4mm; font-size: 10pt; line-height: 1.45; color: #cfc8bb; max-width: 92mm; }
.bk-links { margin-top: 8mm; display: flex; flex-direction: column; gap: 3mm; }
.bk-btn { display: inline-flex; align-self: flex-start; align-items: center; gap: 2mm; background: var(--accent); color: var(--ink-deep);
  font-size: 10pt; font-weight: 800; letter-spacing: -.005em; border-radius: 2mm; padding: 2.8mm 4.4mm 2.6mm; }
.bk-btn .arr { color: var(--ink-deep); width: 7pt; height: 7pt; }
.bk-sec { font-size: 9.2pt; font-weight: 650; color: var(--brand-ivory); border-bottom: .7pt solid #5b574f; align-self: flex-start; padding-bottom: .5mm; }
.bk-foot { margin-top: 12mm; padding-top: 3mm; border-top: .5pt solid #3a3934; font-size: 6.9pt; line-height: 1.5; color: #9f998e; }
"""

LAYOUT_JS = r"""
<script>
window.addEventListener('load', () => document.fonts.ready.then(() => {
  const out = [];
  document.querySelectorAll('.page').forEach((p, i) => {
    const flow = p.querySelector('.rows, .flow, .idx');
    const over = flow ? Math.round(flow.scrollHeight - flow.clientHeight) : 0;
    const pageOver = Math.round(p.scrollHeight - p.clientHeight);
    const wide = [];
    p.querySelectorAll('.name,.meta,.idl,.note,.seller,.ie,.rl,.cname,.h1,.lede,.steps p,.ing p,.nt p,.bk-p,.idx').forEach(el => {
      if (el.scrollWidth > el.clientWidth + 1) wide.push((el.className || el.tagName) + ': ' + el.textContent.trim().slice(0, 50));
    });
    // nothing may reach past the page's content box (a grid track that grows would push text off the page)
    const pr = p.getBoundingClientRect(), cs = getComputedStyle(p);
    const right = pr.right - parseFloat(cs.paddingRight) + 0.5, left = pr.left + parseFloat(cs.paddingLeft) - 0.5;
    p.querySelectorAll('.name,.meta,.meta span,.idl > *,.seller,.note,.rl,.tag,.cname,.ie,.lede,.steps p,.ing p,.nt p,.bk-p,.cv-six li,.fine,.box p').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > right || r.left < left)) wide.push('outside content box ' + (el.className || el.tagName) + ': ' + el.textContent.trim().slice(0, 40));
    });
    let spare = null;
    const rows = p.querySelector('.rows'), foot = p.querySelector('.foot');
    if (rows && foot && rows.lastElementChild) spare = Math.round(foot.getBoundingClientRect().top - rows.lastElementChild.getBoundingClientRect().bottom);
    out.push({page: i + 1, id: p.id || '', cls: p.className, flowOverflowPx: over, pageOverflowPx: pageOver, spareBelowRowsPx: spare, wide});
  });
  const fonts = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight);
  const s = document.createElement('script'); s.type = 'application/json'; s.id = 'layout-report';
  s.textContent = JSON.stringify({pages: out, fontsLoaded: fonts}); document.body.appendChild(s);
}));
</script>
"""


def run_header():
    return f'<header class="run"><img src="assets/wordmark-graphite.svg" alt="Gellatti"><span>{TITLE}</span></header>'


def foot(page_no, back=True):
    link = '<a href="#index">All countries</a>' if back else '<span></span>'
    return f'<footer class="foot">{link}<span class="pno">{page_no}</span></footer>'


def page_cover():
    six = ''.join(f'<li>{E(ROLE_LABEL[r])}</li>' for r in ROLES)
    return f'''<section class="page cover" id="cover">
  <div class="cv-top"><img src="assets/wordmark-graphite.svg" alt="Gellatti"><span class="cv-free">Free guide · 0 €</span></div>
  <div class="cv-hero"><div class="cv-scoop"></div><div class="cv-num">75</div><div class="cv-numlab">countries</div></div>
  <div class="cv-text"><div class="cv-title">{TITLE}</div>
  <p class="cv-sub">The six ingredients of the Gellatti gelato base, matched to a product in each of 75 countries.</p>
  <ul class="cv-six">{six}</ul></div>
  <div class="cv-foot"><span>{EDITION}</span><span>gellatti.com</span></div>
</section>'''


def page_howto():
    return f'''<section class="page" id="how-to-use">
  {run_header()}
  <div class="flow">
  <div class="eyebrow">Start here</div>
  <h1 class="h1" style="margin-top:2mm">How to use this guide</h1>
  <ol class="steps">
    <li><div><b>Find your country</b><p>Open the index on page 4 and tap your country, or use your PDF viewer's bookmarks.</p></div></li>
    <li><div><b>Check the six base ingredients</b><p>Your country page shows the product Gellatti identified for each ingredient,
      with the brand, the pack size and the barcode where the product has one.</p></div></li>
    <li><div><b>Buy the listed product</b><p>Match the barcode, or the exact name and pack. The links show where Gellatti found
      each product.</p></div></li>
  </ol>
  <div class="box"><div class="t">Tags on the country pages</div>
    <p><span class="tagdemo">From abroad</span> The shop Gellatti found is outside your country. Delivery, duties and costs to
      your address are not confirmed, so check with the seller before you order.</p>
    <p><span class="tagdemo">B2B</span> Sold to businesses through distributors. Pack size and price on request.</p></div>
  <p class="cta-line">Then let Gellatti do the maths: the app turns these six ingredients into a base for your machine and your
    batch size. <a href="https://gellatti.com">gellatti.com</a></p>
  </div>
  {foot(2, back=False)}
</section>'''


def page_ingredients():
    rows = [
        ('Whole milk', 'about 3.5% fat', 'The body of the base: water, milk protein and lactose.',
         'Whole milk. Where 3.5% is not sold, your page lists the closest documented product and its fat content.'),
        ('Cream', 'about 30% fat', 'Adds fat for a rich, creamy texture.',
         'Dairy cream with no added sugar and no vegetable fat. Your page shows its fat content.'),
        ('Skim milk powder', 'very low fat', 'Adds milk solids without extra water, for body and a smoother scoop.',
         'Pure skim milk powder, not a coffee creamer or whitener.'),
        ('Sugar', 'sucrose', 'Sweetness, and softness in the freezer.',
         'Any brand of white sugar. The ingredients should list only sugar.'),
        ('Dextrose', 'glucose monohydrate', 'Less sweet than sugar, and it helps keep the gelato scoopable.',
         'Dextrose powder, not tablets, syrups or blends.'),
        ('Tara gum', 'E417', 'A plant-based stabiliser, used in very small amounts.',
         'Pure tara gum. It needs heat: mix it with the dry ingredients, then heat the base to 75–80 °C.'),
    ]
    body = ''.join(f'<div><p class="ih">{E(n)}<small>{E(s)}</small></p><p>{E(d)}</p><p class="buy">{E(b)}</p></div>' for n, s, d, b in rows)
    return f'''<section class="page" id="ingredients">
  {run_header()}
  <div class="flow">
  <div class="eyebrow">The base</div>
  <h1 class="h1" style="margin-top:2mm">The six base ingredients</h1>
  <p class="lede">The Gellatti gelato base is built from six ingredients. This is what each one does, and what to check when you buy it.</p>
  <div class="ing">{body}</div>
  </div>
  {foot(3, back=False)}
</section>'''


def pages_index(order):
    groups = []
    for c in order:
        L = sort_key(c['country'])[0].upper()
        if not groups or groups[-1][0] != L:
            groups.append((L, []))
        groups[-1][1].append(c)
    target = len(order) * INDEX_FIRST_SHARE
    best, acc = None, 0
    for gi, (_, cs) in enumerate(groups):
        acc += len(cs)
        if best is None or abs(acc - target) < abs(best[1] - target):
            best = (gi + 1, acc)
    halves = [groups[:best[0]], groups[best[0]:]]

    def grp_html(g):
        L, cs = g
        items = ''.join(f'<a class="ie" href="#c-{c["iso"]}"><span class="nm">{E(c["country"])}</span><span class="dots"></span>'
                        f'<span class="pn">{c["page"]}</span></a>' for c in cs)
        return f'<div class="grp"><div class="L">{L}</div>{items}</div>'

    first = f'''<section class="page" id="index">
  {run_header()}
  <div class="eyebrow">Index · A–{halves[0][-1][0]}</div>
  <h1 class="h1" style="margin-top:2mm">Find your country</h1>
  <p class="lede">Tap a country to go to its page.</p>
  <div class="idx">{''.join(grp_html(g) for g in halves[0])}</div>
  {foot(4, back=False)}
</section>'''
    second = f'''<section class="page" id="index-2">
  {run_header()}
  <div class="cont">Index · {halves[1][0][0]}–Z</div>
  <div class="idx" style="margin-top:3mm">{''.join(grp_html(g) for g in halves[1])}</div>
  {foot(5, back=False)}
</section>'''
    return first + second


def item_html(it, notes_page):
    tags = ''.join(f'<span class="tag">{E(t)}</span>' for t in it['tags'])
    segs = []
    for i, m in enumerate(x for x in it['meta'] if x):
        segs.append(f'<span class="{"n" if len(m) <= 24 else "w"}">{E(m)}</span>')   # short segments never break
    meta = '<span class="s">·</span>'.join(segs)
    ids = []
    if it.get('ean'):
        ids.append(f'<span class="code"><i>{id_label(it["ean"])}</i>{E(it["ean"])}</span>')
    elif it.get('code'):
        ids.append(f'<span class="code"><i>Code</i>{E(it["code"])}</span>')
    for ln in it['links']:
        ids.append(f'<a class="src" href="{html.escape(ln["url"])}">{E(ln["label"])}{ARROW}</a>')
    idl = f'<div class="idl">{"".join(ids)}</div>' if ids else ''
    seller = f'<div class="seller">{E(it["seller"])}</div>' if it.get('seller') else ''
    note_html = f'<div class="note">{E(it["note"])}</div>' if it.get('note') else ''
    if it['role'] == 'TARA' and 'B2B' in it['tags']:
        note_html += f'<div class="note">See <a href="#notes">Good to know, page {notes_page}</a>.</div>'
    return (f'<div class="row" data-role="{it["role"]}"><div class="role"><span class="rl">{E(it["role_label"])}</span>{tags}</div>'
            f'<div class="prod"><div class="name">{E(it["name"])}</div><div class="meta">{meta}</div>{seller}{idl}{note_html}</div></div>')


def page_country(c, items, notes_page):
    rows = ''.join(item_html(it, notes_page) for it in items)
    return f'''<section class="page country" id="c-{c['iso']}" data-iso="{c['iso']}">
  {run_header()}
  <div class="ctitle"><div class="cmeta"><span class="iso">{c['iso']}</span><span class="region">{E(c['region'])}</span></div>
    <h2 class="cname">{E(c['country'])}</h2><div class="bar"></div></div>
  <div class="rows">{rows}</div>
  {foot(c['page'])}
</section>'''


NOTES = [
    ('From abroad', 'The shop Gellatti found for this product is outside your country. Delivery, duties, costs and timing to your '
                    'address were not confirmed. Check with the seller before you order.'),
    ('United States — tara gum', 'TIC Pretested® Tara Gum 100 (TIC Gums / Ingredion, product no. 38930903) is sold to businesses '
                                 'through distributors such as Essex Food Ingredients (item 1191099); pack size and price are on request. '
                                 "The supplier's documentation describes it as self-affirmed GRAS. That is the supplier's own statement, "
                                 'not an FDA approval.'),
    ('Fat content', 'Where a country does not sell the reference fat level (3.5% milk, 30% cream), the guide lists the closest '
                    'documented product and shows its actual fat content.'),
    ('Labels change', 'Manufacturers change recipes, packs and barcodes. Always check the label before you buy.'),
    ('What this guide covers', 'The six base ingredients of the Gellatti gelato base, in 75 countries. It does not list every '
                               'ingredient used in Gellatti recipes.'),
]
FINE_PRINT = ('Compiled from manufacturer and retailer information, September 2026. Links show where each product was found; '
              'prices, stock and delivery are not guaranteed. Gellatti is not affiliated with the brands shown, and product names '
              'and trademarks belong to their owners. This guide is not regulatory advice; local food rules apply.')


def page_notes(page_no):
    body = ''.join(f'<div><p class="ih">{E(h)}</p><p>{E(p)}</p></div>' for h, p in NOTES)
    return f'''<section class="page" id="notes">
  {run_header()}
  <div class="flow">
  <div class="eyebrow">Notes</div>
  <h1 class="h1" style="margin-top:2mm">Good to know</h1>
  <div class="nt">{body}</div>
  <p class="fine">{E(FINE_PRINT)}</p>
  </div>
  {foot(page_no, back=False)}
</section>'''


def page_back():
    return f'''<section class="page back" id="gellatti">
  <img src="assets/wordmark-ivory.svg" alt="Gellatti">
  <div class="bk-body">
    <h1 class="bk-h">Now make it.</h1>
    <p class="bk-p">Gellatti turns your six base ingredients into a gelato base for your machine and your batch size.</p>
    <div class="bk-links">
      <a class="bk-btn" href="https://gellatti.com">Open Gellatti{ARROW}</a>
      <a class="bk-sec" href="https://gellatti.com/shop">Visit the Gellatti Shop — gellatti.com/shop</a>
    </div>
    <p class="bk-foot">{TITLE} · {EDITION} · Free (0 €). Covers the six base ingredients in 75 countries.</p>
  </div>
</section>'''


def build_html(order, by_country, fit=None):
    notes_page = FRONT_PAGES + len(order) + 1
    parts = [page_cover(), page_howto(), page_ingredients(), pages_index(order)]
    parts += [page_country(c, by_country[c['iso']], notes_page) for c in order]
    parts += [page_notes(notes_page), page_back()]
    doc = ''.join(parts)
    for pid, level in (fit or {}).items():
        extra = ' tight' + (' tighter' if level > 1 else '')
        doc = re.sub(rf'<section class="page([^"]*)" id="{re.escape(pid)}"', rf'<section class="page\1{extra}" id="{pid}"', doc)
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Gellatti — {TITLE} (75 countries)</title>
<meta name="author" content="Gellatti"><meta name="description" content="{TITLE}: six base ingredients in 75 countries. {EDITION}.">
<style>{font_css('fonts')}{CSS}</style></head><body>
{doc}
{LAYOUT_JS}
</body></html>'''


# ─────────────────────────────── outputs ───────────────────────────────
def chrome(args):
    # A custom --user-data-dir makes headless Chrome hang on this Mac; the default temporary profile works.
    base = [CHROME, '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--virtual-time-budget=8000']
    return subprocess.run(base + args, capture_output=True, text=True, timeout=180)


def measure(page):
    dom = chrome(['--dump-dom', 'file://' + page]).stdout
    m = re.search(r'<script type="application/json" id="layout-report">(.*?)</script>', dom, re.S)
    if not m:
        sys.exit('layout report missing from the DOM dump')
    return json.loads(html.unescape(m.group(1)))


def overflowing(rep):
    return [p for p in rep['pages'] if p['flowOverflowPx'] > 0 or p['pageOverflowPx'] > 0 or p['wide']]


def write_dataset(order, by_country, path_json, path_csv, meta):
    json.dump({'meta': meta, 'countries': order, 'items': by_country}, open(path_json, 'w'), ensure_ascii=False, indent=1)
    cols = ['page', 'iso', 'country', 'region', 'role', 'name', 'meta', 'ean', 'code', 'tags', 'seller', 'note', 'links',
            'product_v23', 'brand_v23', 'pack_v23', 'ean_v23', 'v23_rows']
    with open(path_csv, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(cols)
        for c in order:
            for it in by_country[c['iso']]:
                w.writerow([c['page'], c['iso'], c['country'], c['region'], it['role'], it['name'], ' · '.join(it['meta']),
                            it.get('ean', ''), it.get('code', ''), ' '.join(it['tags']), it.get('seller', ''), it.get('note', ''),
                            ' '.join(l['url'] for l in it['links']), it['product_v23'], it['brand_v23'], it['pack_v23'],
                            it['ean_v23'], json.dumps(it['v23_rows'])])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--xlsx', default=DEFAULT_XLSX)
    ap.add_argument('--node-modules', default=DEFAULT_NODE_MODULES)
    ap.add_argument('--no-pdf', action='store_true')
    a = ap.parse_args()
    sha = hashlib.sha256(open(a.xlsx, 'rb').read()).hexdigest()
    if sha != V23_SHA:
        sys.exit(f'{a.xlsx} sha256 {sha} is not the frozen v23 ({V23_SHA}); stop and ask the owner which file is authoritative')
    order, by_country, issues = build_dataset(Book(a.xlsx))
    if issues:
        print('\n'.join('ISSUE ' + i for i in issues))
        sys.exit(f'{len(issues)} source issue(s); nothing was built')

    os.makedirs(os.path.join(BUILD, 'fonts'), exist_ok=True)
    for d in (os.path.join(a.node_modules, '@fontsource-variable/manrope/files'), os.path.join(a.node_modules, '@fontsource/ibm-plex-mono/files')):
        for fn in os.listdir(d):
            if re.fullmatch(r'manrope-[a-z-]+-wght-normal\.woff2|ibm-plex-mono-latin-(400|500|600)-normal\.woff2', fn):
                shutil.copy2(os.path.join(d, fn), os.path.join(BUILD, 'fonts', fn))
    shutil.copytree(os.path.join(HERE, 'assets'), os.path.join(BUILD, 'assets'), dirs_exist_ok=True)

    meta = {'source': os.path.basename(a.xlsx), 'source_sha256': sha, 'pdf': PDF_NAME, 'edition': EDITION,
            'countries': len(order), 'roles': ROLES, 'front_pages': FRONT_PAGES,
            'notes_page': FRONT_PAGES + len(order) + 1, 'total_pages': FRONT_PAGES + len(order) + 2}
    write_dataset(order, by_country, os.path.join(HERE, 'guide_dataset.json'), os.path.join(HERE, 'guide_dataset.csv'), meta)
    print(f'dataset: {len(order)} countries, {sum(len(v) for v in by_country.values())} items → guide_dataset.json / .csv')

    page = os.path.join(BUILD, 'guide.html')
    fit = {}
    for attempt in range(1, 4):
        open(page, 'w').write(build_html(order, by_country, fit))
        rep = measure(page)
        bad = overflowing(rep)
        print(f'layout pass {attempt}: {len(rep["pages"])} pages, {len(bad)} overflowing, fit levels {sum(fit.values())}')
        if not bad:
            break
        for p in bad:
            fit[p['id']] = fit.get(p['id'], 0) + 1
    rep['fit'] = fit
    json.dump(rep, open(os.path.join(HERE, 'layout_report.json'), 'w'), indent=1)
    if bad:
        for p in bad:
            print('  OVERFLOW', p)
        sys.exit('pages still overflow after fitting; nothing printed')
    spare = sorted((p['spareBelowRowsPx'], p['id']) for p in rep['pages'] if p['spareBelowRowsPx'] is not None)
    print('fonts loaded:', sorted(set(rep['fontsLoaded'])), '| tightest country pages (px spare):', spare[:5])
    if a.no_pdf:
        return
    pdf = os.path.join(HERE, PDF_NAME)
    if os.path.exists(pdf):
        os.remove(pdf)
    r = chrome(['--no-pdf-header-footer', '--generate-pdf-document-outline', f'--print-to-pdf={pdf}', 'file://' + page])
    if not os.path.exists(pdf):
        sys.exit('PDF not written: ' + r.stderr[-800:])
    print('pdf:', pdf, os.path.getsize(pdf), 'bytes')


if __name__ == '__main__':
    main()
