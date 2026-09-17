#!/usr/bin/env python3
"""One rule for cross-border delivery evidence, applied to every research candidate.

Two agents read the same kind of page differently (one counted a Shopify country selector as proof of delivery, the
other did not), so the rule is settled here and applied uniformly:

  A delivery claim counts only when the destination country is named in a statement ABOUT DELIVERY — a delivery-country
  list, a per-country shipping price table, or a shipping-cost estimator — on a page that is not site furniture.
  A store's market/currency selector does NOT count, however broad a "we ship worldwide" banner is: it is the same list
  on every page (bulksupplements renders Tokelau and Svalbard next to Uruguay on its product pages), and the owner's
  rule D-31 already says a currency never binds a market.

Objective test used for each seller (2026-09-17): fetch the seller's shipping page AND a product page. If the country
list appears on the product page too, it is furniture → MARKET_PICKER. Verified:
  furniture  bulksupplements.com, bakingwarehouse.com, kiki-health.com ("Your shipping estimates" modal, plus its own
             caveat "Some countries may require bespoke postage … if unable to select a delivery option at the checkout")
  delivery   gourmet-versand.com, pati-versand.de, glaeserundflaschen.de, taste-market.de, buxtrade.de,
             shop.cake-masters.com (their lists are absent from product pages)

A candidate whose VERIFIED_CROSS_BORDER rested on furniture becomes LEAD, keeping the product, the quote and an
explanation; nothing is deleted. The item's `result` is recomputed from its candidates.
usage: reconcile_shipping_basis.py [--dry-run]
"""
import argparse, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ITEMS = ['CRP', 'FRU', 'INU', 'YOL']
FURNITURE = ('bulksupplements.com', 'bakingwarehouse.com', 'kiki-health.com')
ORDER = {'CONFIRMED_LOCAL': 3, 'VERIFIED_CROSS_BORDER': 2, 'LEAD': 1}
NOTE = ('Downgraded 2026-09-17 by reconcile_shipping_basis.py: the destination country is named only in the store\'s '
        'market/currency selector, which appears on every page of that shop, not in a delivery statement. The product '
        'and its evidence are kept; the delivery to this country is not confirmed.')


def evidence_hosts(candidate):
    ev = candidate.get('ships_to_evidence')
    text = json.dumps(ev, ensure_ascii=False) if ev is not None else ''
    return [h for h in FURNITURE if h in text or h in (candidate.get('url') or '')]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    changed, touched = [], set()
    for fn in sorted(os.listdir(os.path.join(HERE, 'research'))):
        if not fn.endswith('.json'):
            continue
        iso, path = fn[:-5], os.path.join(HERE, 'research', fn)
        data = json.load(open(path))
        dirty = False
        for code in ITEMS:
            item = (data.get('items') or {}).get(code)
            if not item:
                continue
            for c in item.get('candidates') or []:
                if c.get('evidence_class') != 'VERIFIED_CROSS_BORDER':
                    continue
                hosts = evidence_hosts(c)
                if not hosts:
                    continue
                c['evidence_class'] = 'LEAD'
                c['shipping_basis'] = 'MARKET_PICKER_NOT_A_DELIVERY_STATEMENT'
                c['equivalence_note'] = ((c.get('equivalence_note') or '') + ' | ' + NOTE).strip(' |')
                changed.append(f'{iso}:{code}:rank{c.get("rank")} ({hosts[0]})')
                dirty = True
            if dirty:
                best = max((ORDER.get(c.get('evidence_class'), 0) for c in item.get('candidates') or []), default=0)
                item['result'] = ({3: 'CONFIRMED_LOCAL', 2: 'VERIFIED_CROSS_BORDER', 1: 'LEAD_ONLY'}.get(best, 'BRAK'))
        if dirty:
            touched.add(iso)
            if not a.dry_run:
                json.dump(data, open(path, 'w'), ensure_ascii=False, indent=1)
    print(f'{"would downgrade" if a.dry_run else "downgraded"} {len(changed)} candidate(s) in {len(touched)} market(s)')
    for c in changed:
        print('  ', c)


if __name__ == '__main__':
    main()
