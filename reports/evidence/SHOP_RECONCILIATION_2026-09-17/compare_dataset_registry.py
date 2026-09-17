#!/usr/bin/env python3
"""Read-only comparison: the free base-guide PDF dataset vs the v23 registry on staging (recorded 2026-09-17).

Inputs, neither of which this script changes:
  DATASET   reports/shop_pdf0/guide_dataset.json  (branch claude/pl-country-product-set @ acdd8e7d)
  REGISTRY  a copy of `git show 6e83b8d1:docs/country-products/gelato-base-v23/registry.json`
The script prints its findings and writes nothing. It checks only the data file, not the PDF text or layout.

usage: compare_dataset_registry.py DATASET REGISTRY
"""
import json, re, sys
from collections import Counter, defaultdict

SLOT = {'MILK': 'MILK', 'CREAM': 'CREAM', 'SMP': 'SMP', 'SUCROSE': 'SUCROSE', 'DEXTROSE': 'DEXTROSE', 'TARA': 'STABILIZER'}


def digits(x):
    return re.sub(r'\D', '', x or '').lstrip('0')


def main(dataset_path, registry_path):
    ds, reg = json.load(open(dataset_path)), json.load(open(registry_path))
    prod = {p['productKey']: p for p in reg['products']}
    sel = {(s['country'], s['slot']): s for s in reg['selections']}
    srcs = reg['sources']
    src_url = ({s.get('sourceId') or s.get('id'): s.get('url') for s in srcs} if isinstance(srcs, list)
               else {k: (v.get('url') if isinstance(v, dict) else v) for k, v in srcs.items()})
    mism, link_bad, checked = defaultdict(list), [], 0
    for c in ds['countries']:
        iso = c['iso']
        for it in ds['items'][iso]:
            s = sel.get((iso, SLOT[it['role']]))
            if not s:
                mism['missing_selection'].append(f"{iso}/{it['role']}")
                continue
            checked += 1
            if it['role'] == 'SUCROSE':
                if s['selectionKind'] != 'GLOBAL_PI':
                    mism['sugar_not_global_pi'].append(iso)
                continue
            p = prod.get(s.get('productKey'), {})
            if it['product_v23'] != (s.get('localName') or ''):
                mism['name'].append(f"{iso}/{it['role']}")
            if it['pack_v23'] != (s.get('localPackText') or ''):
                mism['pack'].append(f"{iso}/{it['role']}")
            if digits(it['ean']) != digits((p.get('identity') or {}).get('gtin')):
                mism['ean'].append(f"{iso}/{it['role']}")
            if it['brand_v23'] != (p.get('brand') or ''):
                mism['brand_label'].append(f"{iso}/{it['role']}: {it['brand_v23']!r} vs {p.get('brand')!r}")
            urls = {src_url.get(sid) for sid in (s.get('sourceIds') or []) + (p.get('sourceIds') or [])}
            link_bad += [f"{iso}/{it['role']}: {ln['url']}" for ln in it['links'] if ln['url'] not in urls]
            if it['role'] == 'TARA' and ('From abroad' in it['tags']) != (s.get('offerChannel') == 'IMPORT'):
                mism['tara_channel'].append(iso)
    print('selections checked:', checked)
    print('offerChannel:', Counter((s['slot'], s.get('offerChannel')) for s in reg['selections']))
    for k, v in mism.items():
        print(f'{k}: {len(v)}', v)
    print('links not in registry sources:', len(link_bad), link_bad[:10])
    print('failed registry consistency checks:', [ch['id'] for ch in reg['consistencyChecks'] if not ch.get('passed', True)])


if __name__ == '__main__':
    main(*sys.argv[1:3])
