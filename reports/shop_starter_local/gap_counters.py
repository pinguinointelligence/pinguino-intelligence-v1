#!/usr/bin/env python3
"""Real counters for the four researched roles — what is still open, and why.

Owner correction 2026-09-17: "Pokaż … rzeczywiste liczniki pozostałych braków" and "Obecność siedmiu nagłówków albo
missing_items=[] w szkicu nie dowodzi siedmiu zatwierdzonych produktów." So this counts combinations (75 markets × 4
roles = 300), never PDFs, and separates the REASON a combination is still open:

  no_candidate          nothing found at all
  lead_only             only an unconfirmed lead (marketplace, no composition, no delivery quote)
  trade_only            a confirmed product, but the shop sells only to registered businesses
  other_composition     a real product of the same type with a different composition (owner decides)
  bad_identifier        the page prints a code that is not a valid GTIN
  recommended           at least one candidate the researcher recommends — still NOT an acceptance
  accepted              the owner wrote TAK in the workbook (acceptance.json)

usage: gap_counters.py [--markdown]
"""
import argparse, importlib.util, json, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ITEMS = ['CRP', 'FRU', 'INU', 'YOL']
LABEL = {'CRP': 'śmietanka w proszku', 'FRU': 'fruktoza', 'INU': 'inulina', 'YOL': 'suszone żółtko'}

spec = importlib.util.spec_from_file_location('br', os.path.join(HERE, 'build_review.py'))
BR = importlib.util.module_from_spec(spec)
spec.loader.exec_module(BR)


def reason(item, accepted_ranks):
    cands = (item or {}).get('candidates') or []
    if accepted_ranks:
        return 'accepted'
    if not cands:
        return 'no_candidate'
    recs = [BR.recommendation(c) for c in cands[:2]]
    if 'TAK' in recs:
        return 'recommended'
    for r in recs:
        if 'kanał tylko dla firm' in r:
            return 'trade_only'
    for r in recs:
        if 'inny skład' in r:
            return 'other_composition'
    for r in recs:
        if 'GTIN' in r:
            return 'bad_identifier'
    return 'lead_only'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--markdown', action='store_true')
    a = ap.parse_args()
    markets = json.load(open(os.path.join(HERE, 'markets75.json')))
    acc = json.load(open(os.path.join(HERE, 'acceptance.json'))) if os.path.exists(os.path.join(HERE, 'acceptance.json')) else {}
    per_item = collections.defaultdict(collections.Counter)
    per_market, open_by_market = {}, collections.defaultdict(list)
    for iso in sorted(markets):
        data = json.load(open(os.path.join(HERE, 'research', f'{iso}.json')))
        states = {}
        for code in ITEMS:
            ranks = ((acc.get(iso) or {}).get(code) or {}).get('accepted_ranks') or []
            r = reason((data.get('items') or {}).get(code), ranks)
            states[code] = r
            per_item[code][r] += 1
            if r not in ('accepted', 'recommended'):
                open_by_market[iso].append(f'{code}:{r}')
        per_market[iso] = states
    ready = [iso for iso, s in per_market.items() if all(v in ('accepted', 'recommended') for v in s.values())]
    locales = sum(len(markets[iso]['locales']) for iso in ready)
    total_open = sum(len(v) for v in open_by_market.values())
    out = []
    out.append(f'Kombinacje kraj × rola: {len(markets) * len(ITEMS)}. Otwarte: {total_open} w {len(open_by_market)} krajach.')
    out.append(f'Krajów z rekomendacją albo akceptacją na wszystkich czterech rolach: {len(ready)} ({locales} wariantów językowych).')
    out.append(f'Zaakceptowanych przez właściciela kombinacji: {sum(c["accepted"] for c in per_item.values())}.')
    keys = ['accepted', 'recommended', 'trade_only', 'other_composition', 'bad_identifier', 'lead_only', 'no_candidate']
    if a.markdown:
        out.append('')
        out.append('| Rola | ' + ' | '.join(keys) + ' |')
        out.append('|---|' + '---|' * len(keys))
        for code in ITEMS:
            out.append(f'| {LABEL[code]} | ' + ' | '.join(str(per_item[code][k]) for k in keys) + ' |')
    else:
        for code in ITEMS:
            out.append(f'{code}: ' + ', '.join(f'{k} {per_item[code][k]}' for k in keys if per_item[code][k]))
    out.append('')
    for iso in sorted(open_by_market):
        out.append(f'{iso}: ' + ' '.join(open_by_market[iso]))
    print('\n'.join(out))


if __name__ == '__main__':
    main()
