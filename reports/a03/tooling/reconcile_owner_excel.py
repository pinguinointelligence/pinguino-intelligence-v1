#!/usr/bin/env python3
"""Reconcile the Owner's complete country-base Excel (D-22) against FINAL_FROZEN Mapper 2541 — one verdict per row.

The Owner Excel is the authoritative selection. This tool never replaces a selected product: anything it cannot verify
is reported back (step 9). Steps (D-26):
  1 exact PI-ING exists in 2541 (+ current display name by stable ID)   2 PR-ING present/well-formed where required
  3 brand / product / EAN typed and checksummed                          4 market availability (optional, --verify-urls)
  5 source/evidence present and of an acceptable type                    6 technical readiness flags from 2541
  7 role ↔ PI consistency against 2541                                   8 row verdict: OK or the list of genuine issues
  9 REPORT_BACK for anything unverifiable — no silent substitution
usage: reconcile_owner_excel.py OWNER.xlsx [--sheet NAME] [--mapper mapper_basement.csv] [--baseline WORKING.xlsx]
                                [--colmap colmap.json] [--verify-urls] [--out reconciliation.csv]"""
import argparse, csv, json, os, re, subprocess, sys
from collections import Counter
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from xlsx_min import X                      # noqa: E402
from identifiers import id_type, digits     # noqa: E402

# header names seen in the working BAZA v7 (sheet 04_POKRYCIE_PR); override with --colmap {"field": ["Header A", ...]}
COLMAP = {'market': ['ISO2', 'Market', 'Rynek', 'market_iso2'], 'role': ['Rola', 'Role', 'Functional slot', 'Slot', 'functional_slot'], 'grams': ['g', 'Grams', 'Gramy', 'calculated_grams'],
          'pi_ing': ['PI-ING', 'PI_ING', 'PI', 'selected_pi_ing'], 'pr_ing': ['Końcowy PR-ING', 'PR-ING', 'PR_ING', 'Final PR-ING', 'selected_pr_ing'],
          'proposal_key': ['Proposal key', 'current_tara_proposal_key'], 'product': ['Dokładny produkt', 'Product', 'Produkt dokładny', 'selected_product_name', 'current_tara_product'], 'brand': ['Marka', 'Brand'],
          'pack': ['Opakowanie', 'Pack'], 'ean': ['EAN / GTIN', 'EAN', 'GTIN', 'EAN/GTIN', 'ean_gtin', 'current_tara_ean_gtin'], 'source': ['Źródło', 'Source', 'URL', 'Źródła', 'source_urls'],
          'stabilizer_type': ['Stabilizer type', 'Typ stabilizatora', 'candidate_type'], 'status': ['Status', 'reporting_status']}
BASE_ROLE_BY_PI = {'PI-ING-000236': 'MILK', 'PI-ING-000180': 'CREAM', 'PI-ING-000270': 'SMP', 'PI-ING-000514': 'SUCROSE',
                   'PI-ING-000494': 'DEXTROSE', 'PI-ING-000492': 'STABILIZER'}
ROLE_WORDS = [('SMP', r'proszk|powder|smp|odtłuszcz'), ('CREAM', r'śmietan|cream|rahm|crème|nata|panna'), ('MILK', r'mleko|milk|milch|lait|latte|leche'),
              ('SUCROSE', r'cukier|sachar|sucrose|sugar'), ('DEXTROSE', r'dekstr|dextros|glukoz|glucose'),
              ('STABILIZER', r'stabil|tara|guar|lbg|chleba|locust|carob|neutro')]
# what a 2541 PI must look like to serve each role (from the Mapper's own category fields)
ROLE_EXPECT = {'MILK': lambda r: r['ingredient_category'] == 'dairy' and 'powder' not in r['ingredient_subcategory'],
               'CREAM': lambda r: r['ingredient_category'] == 'dairy' and 'cream' in (r['ingredient_subcategory'] + r['ingredient_name_internal']),
               'SMP': lambda r: r['ingredient_category'] == 'dairy' and 'powder' in (r['ingredient_subcategory'] + r['ingredient_name_internal']),
               'SUCROSE': lambda r: r['ingredient_id'] == 'PI-ING-000514' or 'sucrose' in r['ingredient_name_internal'],
               'DEXTROSE': lambda r: 'dextrose' in (r['ingredient_subcategory'] + r['ingredient_name_internal']),
               'STABILIZER': lambda r: r['ingredient_category'] == 'stabilizer'}
EXACT_PR_ROLES = {'MILK', 'CREAM', 'SMP', 'DEXTROSE', 'STABILIZER'}      # SUCROSE is a global PI (D-8)


def read_sheet(path, sheet, colmap):
    x = X(path); names = x.order
    cand = [sheet] if sheet else names
    for s in cand:
        rows = x.rows(s)
        for i, d in enumerate(rows[:12]):
            vals = {v.strip(): k for k, v in d.items() if v}
            hit = {f: next((vals[h] for h in hs if h in vals), None) for f, hs in colmap.items()}
            if hit['market'] and (hit['pi_ing'] or hit['ean']):
                out = []
                for d2 in rows[i + 1:]:
                    rec = {f: (d2.get(c, '') or '').strip() if c else '' for f, c in hit.items()}
                    if re.fullmatch(r'[A-Z]{2}', rec['market']): out.append(rec)
                return s, out, {f: c is not None for f, c in hit.items()}
    sys.exit(f'no sheet with a market column and a PI/EAN column in {path}')


def role_of(rec):
    if rec['pi_ing'] in BASE_ROLE_BY_PI: return BASE_ROLE_BY_PI[rec['pi_ing']]
    t = (rec['role'] + ' ' + rec['stabilizer_type'] + ' ' + rec['product']).lower()
    return next((r for r, rx in ROLE_WORDS if re.search(rx, t)), 'UNKNOWN')


def verify_urls(rec):
    urls = [u for u in re.split(r'\s+', rec['source']) if u.startswith('http')]
    best = 'NO_URL'
    order = ['EAN_ON_MARKET_PAGE', 'EAN_ON_MARKETPLACE_MARKET_PAGE', 'EAN_ON_GENERIC_TLD_PAGE', 'EAN_ON_FOREIGN_MARKET_PAGE', 'EAN_ON_AGGREGATOR',
             'MARKET_PAGE_WITHOUT_EAN', 'PAGE_WITHOUT_EAN', 'EAN_ONLY_ECHOED_FROM_URL_OR_QUERY', 'EAN_EMBEDDED_IN_RETAILER_CODE', 'SOURCE_NOT_READABLE']
    for u in urls[:4]:
        try:
            o = subprocess.run([sys.executable, os.path.join(HERE, 'verify_ean_market.py'), u, digits(rec['ean']) or '-', rec['market'], '--agent', 'reconcile'],
                               capture_output=True, text=True, timeout=120).stdout.strip().splitlines()[-1]
            vc = json.loads(o).get('verification_class', 'SOURCE_NOT_READABLE')
        except Exception:
            vc = 'SOURCE_NOT_READABLE'
        if best == 'NO_URL' or (vc in order and order.index(vc) < (order.index(best) if best in order else 99)): best = vc
        if best == 'EAN_ON_MARKET_PAGE': break
    return best


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('owner_xlsx'); ap.add_argument('--sheet'); ap.add_argument('--baseline'); ap.add_argument('--colmap')
    ap.add_argument('--mapper', default=os.path.expanduser('~/Desktop/MAPPER/mapper_basement.csv'))
    ap.add_argument('--verify-urls', action='store_true'); ap.add_argument('--out', default='reconciliation.csv')
    a = ap.parse_args()
    colmap = dict(COLMAP)
    if a.colmap: colmap.update(json.load(open(a.colmap)))
    mp = {r['ingredient_id']: r for r in csv.DictReader(open(a.mapper, encoding='utf-8'))}
    c75 = json.load(open(os.path.join(HERE, 'countries75.json')))
    sheet, recs, found = read_sheet(a.owner_xlsx, a.sheet, colmap)
    base = {}
    if a.baseline:
        _, brecs, _ = read_sheet(a.baseline, None, colmap)
        base = {(b['market'], role_of(b)): b for b in brecs}
    out = []
    for r in recs:
        role = role_of(r); issues = []; pi = mp.get(r['pi_ing'])
        s1 = 'OK' if pi else ('NOT_A_PI_ID' if not r['pi_ing'].startswith('PI-ING-') else 'MISSING_IN_2541')
        if not pi: issues.append('PI:' + s1)
        if role in EXACT_PR_ROLES:
            s2 = ('OK' if re.fullmatch(r'PR-ING-\d{6}', r['pr_ing']) else 'PENDING_ASSIGNMENT' if ('AUTO' in r['pr_ing'].upper() or not r['pr_ing']) else 'MALFORMED')
        else: s2 = 'N/A_GLOBAL_PI'
        if s2 == 'MALFORMED': issues.append('PR:' + s2)
        t = id_type(r['ean']); s3 = t
        if role in EXACT_PR_ROLES and not t.startswith('GTIN'): issues.append('EAN:' + t)
        if role in EXACT_PR_ROLES and not (r['product'] and (r['brand'] or not found.get('brand'))): issues.append('IDENTITY:BRAND_OR_PRODUCT_MISSING')
        s4 = verify_urls(r) if (a.verify_urls and role in EXACT_PR_ROLES) else 'NOT_RUN'
        if s4 not in ('NOT_RUN', 'EAN_ON_MARKET_PAGE') and role in EXACT_PR_ROLES: issues.append('MARKET:' + s4)
        urls = [u for u in re.split(r'\s+', r['source']) if u.startswith('http')]
        s5 = f'{len(urls)} URL(s)' if urls else ('N/A_GLOBAL_PI' if role == 'SUCROSE' else 'MISSING_SOURCE')
        if s5 == 'MISSING_SOURCE': issues.append('SOURCE:MISSING')
        s6 = (f"base={pi['approved_for_base']} engines={pi['approved_for_engines']} status={pi['verification_status']}" if pi else 'UNKNOWN')
        if pi and (pi['approved_for_base'] != 'TRUE' or pi['approved_for_engines'] != 'TRUE'): issues.append('TECH:NOT_APPROVED_IN_2541')
        s7 = ('OK' if pi and ROLE_EXPECT.get(role, lambda _: False)(pi) else 'ROLE_PI_MISMATCH' if pi else 'UNKNOWN')
        if s7 == 'ROLE_PI_MISMATCH': issues.append(f'ROLE:{role}≠{pi["ingredient_category"]}/{pi["ingredient_subcategory"]}')
        if r['market'] not in c75: issues.append('MARKET_NOT_IN_75')
        b = base.get((r['market'], role))
        norm = lambda t: re.sub(r'\W+', ' ', (t or '').lower()).strip()
        same = bool(b) and b['pi_ing'] == r['pi_ing'] and ((digits(b['ean']) and digits(b['ean']) == digits(r['ean'])) or (not digits(b['ean']) and not digits(r['ean']) and norm(b['product']) == norm(r['product'])))
        diff = ('NEW_ROW' if a.baseline and not b else '') or ('SAME_PRODUCT' if same else 'CHANGED_VS_BASELINE' if b else '')
        out.append(dict(market=r['market'], role=role, owner_status=r.get('status', ''), grams_owner=r['grams'], pi_ing=r['pi_ing'], pi_name_2541=pi['ingredient_name_display'] if pi else '',
                        s1_pi=s1, pr_ing=r['pr_ing'], s2_pr=s2, brand=r['brand'], product=r['product'], pack=r['pack'], ean=digits(r['ean']), s3_identifier=s3,
                        s4_market=s4, s5_source=s5, s6_technical=s6, s7_role_vs_2541=s7, verdict=('OK' if not issues else 'ISSUES'), issues=';'.join(issues),
                        s9_action=('NONE' if not issues else 'REPORT_BACK_TO_OWNER (no substitution, D-26)'), vs_baseline=diff))
    with open(a.out, 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=list(out[0])); w.writeheader(); w.writerows(out)
    print(f'sheet {sheet!r}: {len(out)} rows · markets {len({o["market"] for o in out})} · columns found {sorted(k for k, v in found.items() if v)}')
    print('verdict:', dict(Counter(o['verdict'] for o in out)), '| by role:', dict(Counter(o['role'] for o in out)))
    print('top issues:', Counter(i.split(':')[0] + ':' + i.split(':')[1] if ':' in i else i for o in out for i in o['issues'].split(';') if i).most_common(8))
    if a.baseline: print('vs baseline:', dict(Counter(o['vs_baseline'] for o in out)))
    print('written', a.out)


if __name__ == '__main__':
    main()
