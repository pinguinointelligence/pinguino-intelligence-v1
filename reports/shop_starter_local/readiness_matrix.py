#!/usr/bin/env python3
"""All 75 × 7 = 525 country/role combinations in one matrix, with the dimensions kept apart.

Owner correction 2026-09-17 (second round): "W istniejącej macierzy połącz wszystkie 75×7 = 525 kombinacji. Oddziel
produkt, zakup dla kraju, kanał, stan towaru, powiązanie techniczne i decyzję Ownera. Przyczyny mogą się nakładać;
nie sumuj nakładających się braków jak rozłącznych kategorii. Dopiero wtedy podaj kraje kompletne badawczo,
technicznie i gotowe do publikacji."

Six independent dimensions per combination — a combination can be open on several at once, so they are reported as
independent counts, never added up:

  product      IDENTIFIED (a candidate whose identity is proven) / PROPOSED (a candidate, identity not proven) / NONE
  purchase     LOCAL / CROSS_BORDER_CONFIRMED / CROSS_BORDER_UNCONFIRMED / NONE   (delivery to THIS country)
  channel      RETAIL / BUSINESS_ONLY / UNKNOWN
  stock        IN_STOCK / OUT_OF_STOCK / UNKNOWN (state at the check, with its date in the workbook)
  technical    REFERENCE_PROFILE (the product matches the role's reference composition, so the app's existing
               ingredient applies) / NEEDS_OWN_PROFILE (a real product of the same type with a different composition —
               the app needs a profile of its own for it, evaluated case by case) / NOT_ESTABLISHED (identity or
               composition not proven, or no candidate)
  decision     ACCEPTED / REJECTED / NONE  (the owner's TAK/NIE — never written by this tool)

A role is CLOSED for a country only when one product is IDENTIFIED, on a RETAIL channel, with a purchase path that is
LOCAL or CROSS_BORDER_CONFIRMED. A lead, an unconfirmed delivery and a business-only offer are additional information,
never a closed role. Acceptance and technical binding are reported separately on top of that.

usage: readiness_matrix.py [--markdown] [--csv FILE] [--country PL]
"""
import argparse, csv, importlib.util, json, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
V23_ITEMS = ['DEX', 'SMP', 'STB']
RESEARCH_ITEMS = ['CRP', 'FRU', 'INU', 'YOL']
ITEMS = ['DEX', 'SMP', 'CRP', 'FRU', 'INU', 'YOL', 'STB']
LABEL = {'DEX': 'dekstroza', 'SMP': 'mleko odtłuszczone', 'CRP': 'śmietanka w proszku', 'FRU': 'fruktoza',
         'INU': 'inulina', 'YOL': 'suszone żółtko', 'STB': 'stabilizator'}

spec = importlib.util.spec_from_file_location('b', os.path.join(HERE, 'build_starter_local.py'))
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)
_pp = importlib.util.spec_from_file_location('pp', os.path.join(HERE, 'purchase_path.py'))
PP = importlib.util.module_from_spec(_pp)
_pp.loader.exec_module(PP)

def technical_state(cell_cls, equivalence, source):
    """What the app would need for this product. A same-composition product rides the role's existing reference
    ingredient; a different-composition product (class B) needs its own profile — evaluated per product, never a single
    profile invented for every high-fat powder (owner 2026-09-17). Unknown composition establishes nothing."""
    if source == 'V23':
        return 'REFERENCE_PROFILE'
    if equivalence == 'A_EQUIVALENT':
        return 'REFERENCE_PROFILE'
    if equivalence == 'B_SAME_TYPE_DIFFERENT_COMPOSITION':
        return 'NEEDS_OWN_PROFILE'
    return 'NOT_ESTABLISHED'


def identity_proven(c):
    return bool(c.get('identifier_confirmed') or c.get('identity_basis') in
                ('FIRST_PARTY_OWN_BRAND_LISTING', 'GTIN_ON_LOCAL_PAGE', 'GTIN_ON_SOURCE_PLUS_ATTRIBUTE_MATCH'))


def research_cell(item, stock_for_item, accepted_ranks, purchase_for_item=None):
    cands = (item or {}).get('candidates') or []
    if not cands:
        return dict(product='NONE', purchase='NONE', channel='UNKNOWN', stock='UNKNOWN', best=None)
    best, best_key = None, None
    for c in cands:
        cls = c.get('evidence_class')
        purchase = ('LOCAL' if not c.get('cross_border') else
                    'CROSS_BORDER_CONFIRMED' if B.delivery_state(c) == 'CONFIRMED' else 'CROSS_BORDER_UNCONFIRMED')
        if cls not in ('CONFIRMED_LOCAL', 'VERIFIED_CROSS_BORDER'):
            purchase = 'CROSS_BORDER_UNCONFIRMED' if c.get('cross_border') else purchase
        channel = 'BUSINESS_ONLY' if B.is_business_offer(c) else 'RETAIL'
        route = ((purchase_for_item or {}).get(c.get('url') or '') or {}).get('state', 'UNKNOWN')
        avail = B.availability_of(c, stock_for_item)
        closes = (cls in ('CONFIRMED_LOCAL', 'VERIFIED_CROSS_BORDER') and channel == 'RETAIL'
                  and purchase in ('LOCAL', 'CROSS_BORDER_CONFIRMED') and route != 'CONTACT_OR_QUOTE')
        key = (0 if closes else 1, 0 if identity_proven(c) else 1, 0 if avail['state'] == 'IN_STOCK' else 1, c.get('rank') or 99)
        if best_key is None or key < best_key:
            best, best_key = dict(
                product='IDENTIFIED' if identity_proven(c) else 'PROPOSED',
                purchase=purchase, channel=channel, stock=avail['state'], closes=closes, route=route,
                rank=c.get('rank'), name=c.get('product_name'), cls=cls,
                technical=technical_state(cls, c.get('equivalence'), 'RESEARCH')), key
    best['decision'] = 'ACCEPTED' if best.get('rank') in (accepted_ranks or []) else 'NONE'
    return best


def v23_cell(row, ship, path=None, route='UNKNOWN'):
    """`path` is an additional seller for the SAME owner-selected product (v23_purchase_paths.json): the product choice
    is untouched, only where it can be bought."""
    if not row:
        return dict(product='NONE', purchase='NONE', channel='UNKNOWN', stock='UNKNOWN', closes=False, name=None)
    abroad = 'From abroad' in (row.get('tags') or [])
    purchase = 'LOCAL' if not abroad else ('CROSS_BORDER_CONFIRMED' if (ship or {}).get('state') == 'CONFIRMED'
                                           else 'CROSS_BORDER_UNCONFIRMED')
    channel = 'BUSINESS_ONLY' if 'B2B' in (row.get('tags') or []) else 'RETAIL'
    if path and path.get('state') == 'CONFIRMED' and path.get('channel', 'RETAIL') == 'RETAIL':
        purchase = 'LOCAL' if path.get('local') else 'CROSS_BORDER_CONFIRMED'
    closes = channel == 'RETAIL' and purchase in ('LOCAL', 'CROSS_BORDER_CONFIRMED') and route != 'CONTACT_OR_QUOTE'
    return dict(product='IDENTIFIED', purchase=purchase, channel=channel, stock='UNKNOWN', closes=closes, route=route,
                name=row.get('product_v23'), cls='OWNER_V23', decision='OWNER_V23_SELECTION',
                technical='REFERENCE_PROFILE')


def build():
    markets = json.load(open(os.path.join(HERE, 'markets75.json')))
    v23 = json.load(open(os.path.join(HERE, 'v23_rows.json')))['countries']
    ship = json.load(open(os.path.join(HERE, 'v23_shipping.json'))) if os.path.exists(os.path.join(HERE, 'v23_shipping.json')) else {}
    stock = json.load(open(os.path.join(HERE, 'stock.json'))) if os.path.exists(os.path.join(HERE, 'stock.json')) else {}
    pu = os.path.join(HERE, 'purchase.json')
    purchase = json.load(open(pu)) if os.path.exists(pu) else {}
    acc = json.load(open(os.path.join(HERE, 'acceptance.json'))) if os.path.exists(os.path.join(HERE, 'acceptance.json')) else {}
    pp = os.path.join(HERE, 'v23_purchase_paths.json')
    paths = json.load(open(pp)) if os.path.exists(pp) else {}
    cells = []
    for iso in sorted(markets):
        research = json.load(open(os.path.join(HERE, 'research', f'{iso}.json')))
        for code in ITEMS:
            if code in V23_ITEMS:
                row = v23.get(iso, {}).get(code) or {}
                # The same route test as for research rows, but only where a page was actually cached: a v23 row is the
                # owner's product choice and is never invalidated by a page we never fetched.
                urls = [l.get('url') for l in (row.get('links') or []) if l.get('url')]
                p = (paths.get(iso) or {}).get(code) or {}
                if p.get('url'):
                    urls = [p['url']] + urls
                route = 'UNKNOWN'
                for u in urls:
                    st, _ = PP.classify(u)
                    if st != 'UNKNOWN':
                        route = st
                        break
                cell = v23_cell(row, (ship.get(iso) or {}).get(code), p, route)
            else:
                ranks = ((acc.get(iso) or {}).get(code) or {}).get('accepted_ranks') or []
                cell = research_cell((research.get('items') or {}).get(code), (stock.get(iso) or {}).get(code) or {}, ranks,
                                     ((purchase.get(iso) or {}).get(code) or {}))
                cell.setdefault('closes', False)
            cell.update(iso=iso, role=code, source='V23' if code in V23_ITEMS else 'RESEARCH')
            cell.setdefault('technical', 'NOT_ESTABLISHED')
            cell.setdefault('decision', 'NONE')
            cells.append(cell)
    return markets, cells


MAIN_CAUSE_ORDER = ['NO_PRODUCT', 'NO_PURCHASE_ROUTE', 'DELIVERY_NOT_DECLARED', 'BUSINESS_ONLY_CHANNEL',
                    'IDENTITY_UNPROVEN', 'COMPOSITION_NOT_PRINTED', 'OWNER_TAGGED_B2B', 'UNCLASSIFIED']


def causes(c):
    """One MAIN cause per open combination plus any additional flags, so the main causes add up to the number of open
    combinations exactly (owner 2026-09-17: "rozdziel główną przyczynę od dodatkowych flag", never hand-edit a counter)."""
    flags = []
    if c['product'] == 'NONE':
        return 'NO_PRODUCT', flags
    if c.get('route') == 'CONTACT_OR_QUOTE':
        flags += ['DELIVERY_NOT_DECLARED'] if c['purchase'] == 'CROSS_BORDER_UNCONFIRMED' else []
        flags += ['BUSINESS_ONLY_CHANNEL'] if c['channel'] == 'BUSINESS_ONLY' else []
        return 'NO_PURCHASE_ROUTE', flags
    if c['channel'] == 'BUSINESS_ONLY':
        cause = 'OWNER_TAGGED_B2B' if c['source'] == 'V23' else 'BUSINESS_ONLY_CHANNEL'
        flags += ['DELIVERY_NOT_DECLARED'] if c['purchase'] == 'CROSS_BORDER_UNCONFIRMED' else []
        flags += ['IDENTITY_UNPROVEN'] if c['product'] == 'PROPOSED' else []
        return cause, flags
    if c['purchase'] == 'CROSS_BORDER_UNCONFIRMED':
        flags += ['IDENTITY_UNPROVEN'] if c['product'] == 'PROPOSED' else []
        flags += ['COMPOSITION_NOT_PRINTED'] if c.get('cls') == 'LEAD' and c['product'] != 'PROPOSED' else []
        flags += ['OUT_OF_STOCK_AT_CHECK'] if c['stock'] == 'OUT_OF_STOCK' else []
        return 'DELIVERY_NOT_DECLARED', flags
    if c['product'] == 'PROPOSED':
        flags += ['OUT_OF_STOCK_AT_CHECK'] if c['stock'] == 'OUT_OF_STOCK' else []
        return 'IDENTITY_UNPROVEN', flags
    if c.get('cls') == 'LEAD':
        # Identity proven, a local shop, a real purchase route — what the page does not print is the composition, so
        # equivalence to the role cannot be established. This is its own category, not a residue.
        flags += ['OUT_OF_STOCK_AT_CHECK'] if c['stock'] == 'OUT_OF_STOCK' else []
        return 'COMPOSITION_NOT_PRINTED', flags
    return 'UNCLASSIFIED', flags


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--markdown', action='store_true')
    ap.add_argument('--csv')
    ap.add_argument('--country')
    a = ap.parse_args()
    markets, cells = build()
    if a.country:
        for c in [c for c in cells if c['iso'] == a.country]:
            print(f"{c['role']:4s} {c['product']:11s} {c['purchase']:26s} {c['channel']:13s} {c['stock']:12s} "
                  f"{c['technical']:15s} {c['decision']:8s} {'CLOSED' if c['closes'] else 'open':7s} {(c.get('name') or '')[:40]}")
        return
    if a.csv:
        with open(a.csv, 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=['iso', 'role', 'source', 'product', 'purchase', 'channel', 'stock',
                                              'technical', 'decision', 'closes', 'cls', 'rank', 'name'], extrasaction='ignore')
            w.writeheader()
            for c in cells:
                w.writerow(c)
    dims = {d: collections.Counter(c.get(d, 'n/a') for c in cells) for d in ('product', 'purchase', 'route', 'channel', 'stock', 'technical', 'decision')}
    closed = [c for c in cells if c['closes']]
    by_country = collections.defaultdict(list)
    for c in cells:
        if not c['closes']:
            by_country[c['iso']].append(f"{c['role']}")
    complete = [iso for iso in sorted(markets) if iso not in by_country]
    accepted_complete = [iso for iso in complete
                         if all(c['decision'] in ('ACCEPTED', 'OWNER_V23_SELECTION') for c in cells if c['iso'] == iso)]
    technically = [iso for iso in complete
                   if all(c['technical'] == 'REFERENCE_PROFILE' for c in cells if c['iso'] == iso and c['closes'])]
    # Four separate levels — purchase, technical, owner decision, publication — never collapsed into one number
    # (owner 2026-09-17: "385/525 jest wynikiem pokrycia zakupowego, nie liczbą przetestowanych składników silnika").
    publishable = [iso for iso in complete if iso in technically and iso in accepted_complete]
    print(f'Kombinacje kraj × rola: {len(cells)} (75 × 7). Zamkniętych zakupowo: {len(closed)}. Otwartych: {len(cells) - len(closed)}.')
    print(f'1. POKRYCIE ZAKUPOWE — kraje z siedmioma zamkniętymi rolami: {len(complete)}'
          + (f' — {" ".join(complete)}' if complete else ''))
    print(f'2. DOPASOWANIE TECHNICZNE — z tego kraje, w których każdy zamykający produkt odpowiada składem referencji roli '
          f'(żaden nie wymaga nowego profilu): {len(technically)}' + (f' — {" ".join(technically)}' if technically else ''))
    print(f'3. DECYZJA WŁAŚCICIELA — z tego kraje z akceptacją na wszystkich siedmiu rolach: {len(accepted_complete)}')
    print(f'4. GOTOWE DO PUBLIKACJI (1 ∧ 2 ∧ 3): {len(publishable)}'
          + (f' — {" ".join(publishable)}' if publishable else ' — żaden'))
    needs_profile = sorted({c['iso'] for c in cells if c['closes'] and c['technical'] == 'NEEDS_OWN_PROFILE'})
    if needs_profile:
        print(f'   kraje, w których roli zamyka produkt o innym składzie (wymaga własnego profilu w aplikacji): '
              f'{" ".join(needs_profile)}')
    print('\nWymiary liczone niezależnie (kombinacja może być otwarta na kilku naraz — nie sumować):')
    for d, c in dims.items():
        print(f'  {d:10s} ' + ', '.join(f'{k} {v}' for k, v in c.most_common()))
    if a.markdown:
        print('\n| Rola | zamknięte zakupowo | brak produktu | dostawa niepotwierdzona | tylko B2B | brak towaru |')
        print('|---|---|---|---|---|---|')
        for code in ITEMS:
            rows = [c for c in cells if c['role'] == code]
            print(f'| {LABEL[code]} | {sum(1 for c in rows if c["closes"])} | {sum(1 for c in rows if c["product"] == "NONE")} '
                  f'| {sum(1 for c in rows if c["purchase"] == "CROSS_BORDER_UNCONFIRMED")} '
                  f'| {sum(1 for c in rows if c["channel"] == "BUSINESS_ONLY")} '
                  f'| {sum(1 for c in rows if c["stock"] == "OUT_OF_STOCK")} |')
    openc = [c for c in cells if not c['closes']]
    mains = collections.Counter(causes(c)[0] for c in openc)
    print(f'\nRozliczenie wszystkich {len(openc)} otwartych kombinacji — jedna główna przyczyna na kombinację '
          f'(suma = {sum(mains.values())}):')
    for k in MAIN_CAUSE_ORDER:
        if mains[k]:
            print(f'  {k:34s} {mains[k]}')
    extra = collections.Counter(f for c in openc for f in causes(c)[1])
    if extra:
        print('  dodatkowe flagi (mogą się nakładać, nie sumować z powyższym): '
              + ', '.join(f'{k} {v}' for k, v in extra.most_common()))
    print('\nKraje z otwartymi rolami:')
    for iso in sorted(by_country):
        print(f'  {iso}: ' + ' '.join(by_country[iso]))


if __name__ == '__main__':
    main()
