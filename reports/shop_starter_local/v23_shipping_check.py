#!/usr/bin/env python3
"""Shipping confirmation for the v23 rows tagged "From abroad" — settled separately from the product choice.

Owner correction 2026-09-17: "Nowy PDF definiuje „Z zagranicy" jako sklep, który wysyła do kraju. Stare v23 mówiło, że
dostawa nie była potwierdzona. … Zachowaj akceptację produktu, ale potwierdzenie wysyłki rozlicz osobno: istniejący
dowód, wąskie uzupełnienie albo opis bez obietnicy potwierdzonej dostawy. Nie zmieniaj zamrożonego v23."

So: the v23 product stays exactly as the owner selected it (v23_rows.json is never written here). Only the DELIVERY claim
is checked, per (seller, destination country):
  CONFIRMED   — the seller's own page names that country in its delivery list, market selector or country page.
  UNCONFIRMED — everything else, including "we ship worldwide" with no country named, and pages that cannot be read.
The PDF shows the two states with different words: a confirmed one may say the shop delivers to this country, an
unconfirmed one may only say it is a foreign shop.

Reads the shipping URLs the owner's v23 table already carries (sources_v23) and, for the known seller groups, the one
standard policy page. One fetch per seller (iHerb: one per destination country, its pages are per country).
Writes v23_shipping.json and the quote evidence under ~/.cache/gellatti-evidence/quotes/coordinator-v23/.
usage: v23_shipping_check.py [--limit N] [--only ISO,ISO]
"""
import argparse, importlib.util, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLING = os.path.join(HERE, '..', 'a03', 'tooling')
QUOTES = os.path.expanduser('~/.cache/gellatti-evidence/quotes/coordinator-v23')
V23_CODES = ('DEX', 'SMP', 'STB')

spec = importlib.util.spec_from_file_location('v', os.path.join(TOOLING, 'verify_ean_market.py'))
V = importlib.util.module_from_spec(spec)
spec.loader.exec_module(V)
qspec = importlib.util.spec_from_file_location('q', os.path.join(TOOLING, 'check_quotes.py'))
Q = importlib.util.module_from_spec(qspec)
qspec.loader.exec_module(Q)

# What KIND of country list each seller publishes. Decided by reading each page once (2026-09-17), because the
# difference decides what a customer may be told:
#   DELIVERY_LIST  the country is named in a statement about delivery — a delivery-country list, a per-country shipping
#                  price table, or a shipping-cost estimator ("Shipment to the following country") → may be CONFIRMED.
#   COUNTRY_PAGE   the seller publishes a shipping page for that destination (iHerb /shipping/<cc>) → may be CONFIRMED.
#   MARKET_PICKER  the country appears only in the store's market/currency selector (Shopify "Country (CUR)" lists, which
#                  even include Tokelau and Svalbard) → NEVER confirmation, however broad a "we ship worldwide" banner is.
#                  This follows the owner's rule that a currency never binds a market (D-31) and his correction of
#                  2026-09-17: the v23 "From abroad" mark must not be upgraded by wording alone.
SELLER_BASIS = {
    'saporepuro.com': 'DELIVERY_LIST',            # numbered shipping-cost zones naming countries
    'www.bulksupplements.com': 'MARKET_PICKER',   # long Shopify market list (Tokelau, Svalbard, …)
    'bakingwarehouse.com': 'MARKET_PICKER',       # "Country (CUR)" selector + a generic worldwide banner
    'buxtrade.de': 'DELIVERY_LIST',               # "Die Lieferung erfolgt … in die nachstehenden Länder: …"
    'artegustando.com': 'DELIVERY_LIST',
    'www.hsnstore.eu': 'MARKET_PICKER',
}
DEFAULT_BASIS = 'DELIVERY_LIST'

# The standard policy page of each seller group in the owner's v23 table, used when the row carries no shipping URL.
POLICY = {
    'saporepuro.com': 'https://saporepuro.com/policies/shipping-policy',
    'www.bulksupplements.com': 'https://www.bulksupplements.com/pages/shipping-policy',
    'bakingwarehouse.com': 'https://bakingwarehouse.com/policies/shipping-policy',
    'buxtrade.de': 'https://buxtrade.de/pages/zahlung-und-versand',
    'artegustando.com': 'https://artegustando.com/policies/shipping-policy',
    'www.hsnstore.eu': 'https://www.hsnstore.eu/shipping-and-returns',
}
IHERB = re.compile(r'(?:^|\.)iherb\.com$')


def host(url):
    m = re.match(r'https?://([^/]+)', url or '')
    return (m.group(1) if m else '').lower()


def policy_url(row, iso):
    """The page that would carry the delivery claim: the seller's own, or iHerb's country page."""
    srcs = row.get('sources_v23') or []
    for s in srcs:
        if re.search(r'/shipping|versand|delivery|livraison|spedizioni|wysylka|zahlung-und-versand|shipping-policy', s, re.I):
            return s
    h = host((row.get('links') or [{}])[0].get('url', ''))
    if IHERB.search(h) or any(IHERB.search(host(s)) for s in srcs):
        return f'https://www.iherb.com/shipping/{iso.lower()}'
    return POLICY.get(h)


def names_for(iso, names):
    return [n for n in names.get(iso, []) if n]


def find_country(text, iso, names):
    """The sentence that names the destination country, or None. iHerb's country page counts by its own heading."""
    flat = re.sub(r'\s+', ' ', text)
    for n in names_for(iso, names):
        for m in re.finditer(r'(?<![\wÀ-ɏ])' + re.escape(n) + r'(?![\wÀ-ɏ])', flat):
            start = max(0, m.start() - 90)
            return n, flat[start:m.end() + 90].strip()
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--only', default='')
    ap.add_argument('--limit', type=int, default=0)
    a = ap.parse_args()
    os.makedirs(QUOTES, exist_ok=True)
    v23 = json.load(open(os.path.join(HERE, 'v23_rows.json')))['countries']
    names = json.load(open(os.path.join(HERE, 'country_names.json')))
    only = {x for x in a.only.split(',') if x}
    pages, out, counts = {}, {}, {'CONFIRMED': 0, 'UNCONFIRMED': 0}
    rows = [(iso, code) for iso in sorted(v23) for code in V23_CODES
            if 'From abroad' in ((v23[iso].get(code) or {}).get('tags') or []) and (not only or iso in only)]
    for iso, code in rows[:a.limit or None]:
        row = v23[iso][code]
        url = policy_url(row, iso)
        state, quote, matched = 'UNCONFIRMED', None, None
        seller = host((row.get('links') or [{}])[0].get('url', ''))
        basis_kind = 'COUNTRY_PAGE' if (url and '/shipping/' in url) else SELLER_BASIS.get(seller, DEFAULT_BASIS)
        if url and basis_kind != 'MARKET_PICKER':
            if url not in pages:
                try:
                    http, eff, ct, html, sha, size = V.fetch(url)
                    pages[url] = (http, V.visible(html) if http == '200' else '')
                except Exception as e:
                    pages[url] = ('ERR', '')
            http, text = pages[url]
            if http == '200' and text:
                hit = find_country(text, iso, names)
                if hit:
                    matched, quote = hit
                    state = 'CONFIRMED'
        out.setdefault(iso, {})[code] = {
            'state': state, 'policy_url': url, 'country_named_as': matched, 'quote': quote, 'seller': seller,
            'basis_kind': basis_kind,
            'basis': ({'DELIVERY_LIST': 'country named in the seller delivery list or shipping-cost table',
                       'COUNTRY_PAGE': 'the seller publishes a shipping page for this destination'}[basis_kind]
                      if state == 'CONFIRMED' else
                      'only the store market/currency selector names this country — not a delivery statement'
                      if basis_kind == 'MARKET_PICKER' else
                      'no country-specific delivery statement could be read on the seller page'),
        }
        counts[state] += 1
        print(f'{iso} {code} {state} {url or "no policy page in v23 sources"}', flush=True)
    # Persist the exact quotes the standard way, one file per (seller page, country).
    for iso, codes in out.items():
        for code, r in codes.items():
            if r['state'] != 'CONFIRMED':
                continue
            fn = os.path.join(QUOTES, f'{host(r["policy_url"])}-{iso}.json')
            if os.path.exists(fn):
                continue
            try:
                res = Q.check(r['policy_url'], r['country_named_as'])
                json.dump(res, open(fn, 'w'), ensure_ascii=False)
            except Exception:
                continue
    for iso in out:
        for code, r in out[iso].items():
            fn = os.path.join(QUOTES, f'{host(r["policy_url"] or "")}-{iso}.json')
            if r['state'] == 'CONFIRMED' and os.path.exists(fn):
                r['check_quotes_result_file'] = '~/.cache/gellatti-evidence/quotes/coordinator-v23/' + os.path.basename(fn)
    json.dump(out, open(os.path.join(HERE, 'v23_shipping.json'), 'w'), ensure_ascii=False, indent=1)
    print(f'v23_shipping.json: {counts["CONFIRMED"]} confirmed, {counts["UNCONFIRMED"]} unconfirmed of {sum(counts.values())} rows')


if __name__ == '__main__':
    main()
