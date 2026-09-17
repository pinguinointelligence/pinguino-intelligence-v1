#!/usr/bin/env python3
"""Does this seller declare delivery to this country? Judged by the MEANING of its own statement.

Owner correction 2026-09-17 (second round): "Sprawdź znaczenie zdania, nagłówek, wyjątki i zakres produktu/oferty.
Obecność na drugiej stronie jest wskazówką do kontroli, nie werdyktem. … jednoznaczna dostawa do całej grupy, np.
wszystkich krajów UE, może potwierdzać kraj należący do niej, o ile wyjątki i ograniczenia produktowe go nie wyłączają.
… Ogólne „Europe/worldwide" nie potwierdza automatycznie wszystkich krajów."

So a delivery declaration is accepted when:
  * its wording is about delivery ("we can only ship your order to addresses located in the chosen country",
    "Wir liefern in folgende Länder", a shipping-cost zone table, a per-destination shipping page), AND
  * it covers the country either by naming it (in any language) or through an unambiguous GROUP it belongs to
    (European Union, EEA, a priced zone such as "North America, Canada, Australia, South America"), AND
  * no exclusion and no product-scope restriction takes the country back out.
A bare "worldwide" or "we ship to Europe" is not a declaration. A market/currency picker with no delivery wording is
not one either — but the same list repeated on other pages is NOT disqualified by that repetition: only the wording
decides. Each seller below was read once, on 2026-09-17, and the sentence that decides is stored with it.

usage: delivery_check.py --v23            re-evaluate the v23 "From abroad" rows → v23_shipping.json
       delivery_check.py --research       report (never writes) the state of every cross-border research candidate
       delivery_check.py --host H --iso PL
"""
import argparse, importlib.util, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLING = os.path.join(HERE, '..', 'a03', 'tooling')
spec = importlib.util.spec_from_file_location('v', os.path.join(TOOLING, 'verify_ean_market.py'))
V = importlib.util.module_from_spec(spec)
spec.loader.exec_module(V)

EU27 = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
        'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']
GROUPS = {
    'EU27': EU27,
    'EEA': EU27 + ['IS', 'NO'],
    'SOUTH_AMERICA': ['AR', 'BR', 'CL', 'CO', 'UY'],
    'NORTH_AMERICA': ['US', 'CA', 'MX'],
    'GCC': ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'],
}

# One entry per seller, written after reading that seller's own page. `kind` records WHY it counts.
DECLARATIONS = {
    'www.bulksupplements.com': {
        # The legal policy carries a CLOSED enumeration ("We currently ship to the following nations: …") that is absent
        # from product pages. The "Select Your Region" picker rendered on every page is furniture and is not used here;
        # the two disagree about Panama, and the closed legal statement governs.
        'url': 'https://www.bulksupplements.com/policies/shipping-policy',
        'kind': 'ENUMERATED_DELIVERY_LIST',
        'statement': 'We currently ship to the following nations',
        'list_end': 'Wallis',
        'scope': 'LIST_AFTER_STATEMENT',
        'caveat': None,
    },
    'saporepuro.com': {
        'url': 'https://saporepuro.com/policies/shipping-policy',
        'kind': 'PRICED_ZONE_TABLE',
        'statement': 'This Shipping Policy clearly and transparently describes the shipping costs, methods, and delivery times for orders placed through our e-commerce website.',
        'scope': 'GROUPS',
        'groups': ['EU27', 'SOUTH_AMERICA', 'NORTH_AMERICA'],
        'extra_countries': ['GB', 'CH', 'AU'],
        'zone_quotes': ['4) European Union (EU)', '5) United Kingdom (UK)', '6) Switzerland',
                        '8) North America, Canada, Australia, South America, and Islands'],
        'caveat': 'Zone 8 also says "and Islands"; only the regions named with a price are used here.',
    },
    'kiki-health.com': {
        'url': 'https://kiki-health.com/policies/shipping-policy',
        'kind': 'SHIPPING_ESTIMATE_COUNTRY_LIST',
        'statement': 'Your shipping estimates Country',
        'scope': 'LIST_AFTER_STATEMENT',
        'caveat': 'Some countries may require bespoke postage, please contact the KIKI team for shipping costs and further information if unable to select a delivery option at the checkout.',
    },
    'bakingwarehouse.com': {
        # Found on a separate page: a priced "Destination country | fee" table. The store's own market/currency picker
        # and its "Door to Door worldwide shipping" banner are NOT used; this table is.
        'url': 'https://bakingwarehouse.com/pages/worldwide-shipping',
        'kind': 'PRICED_DESTINATION_TABLE',
        'statement': 'SHIPPING RATES',
        'list_end': '*more over and shipping fee can be seen',
        'scope': 'LIST_AFTER_STATEMENT',
        'caveat': 'The last row is an open bucket "Other (saudi arabia, dubai, brunei...": Saudi Arabia is named outright; '
                  '"dubai" is a city of the United Arab Emirates, which is a judgement the owner may read more strictly.',
    },
    'www.hsnstore.eu': {'url': 'https://www.hsnstore.eu/international-shipping-costs', 'kind': 'PAGE_BLOCKED',
                        'statement': None, 'scope': 'NONE',
                        'caveat': 'The seller international shipping page answers HTTP 403 to a plain request; not bypassed, so the delivery stays unconfirmed.'},
}
# The sellers whose enumerated delivery lists were read earlier: their statement is recorded here too, so every country
# is checked against the list instead of trusting the seller wholesale (a list of 81 countries is not "everywhere").
for _host, _url, _stmt in [
    ('www.gourmet-versand.com', 'https://www.gourmet-versand.com/index.php?site=versand&language=en',
     'Shipment to the following country:'),
    ('gourmet-versand.com', 'https://www.gourmet-versand.com/index.php?site=versand&language=en',
     'Shipment to the following country:'),
    ('www.pati-versand.de', 'https://www.pati-versand.de/zahlung-versand',
     'Wir liefern zu den oben genannten Konditionen in folgende Länder'),
    ('pati-versand.de', 'https://www.pati-versand.de/zahlung-versand',
     'Wir liefern zu den oben genannten Konditionen in folgende Länder'),
    ('www.backfun.de', 'https://www.backfun.de/versand-bestellabwicklung', 'Versand nach'),
    ('www.meincupcake.de', 'https://www.meincupcake.de/shop/info/lieferung-und-versandkosten.html',
     'Wir liefern zu den oben genannten Konditionen in folgende'),
    ('www.hobbybaecker.de', 'https://www.hobbybaecker.de/Informationen/Versand-und-Zahlungsbedingungen/',
     'Wir liefern zu den oben genannten Konditionen in folgende Länder'),
    ('www.glaeserundflaschen.de', 'https://www.glaeserundflaschen.de/shop-service/versand-und-zahlungsinformationen/',
     'Wir liefern in folgende Länder'),
    ('www.taste-market.de', 'https://www.taste-market.de/Informationen/Zahlung-Versand/',
     'Lieferung in das EU-Ausland oder internationaler Versand'),
    ('taste-market.de', 'https://www.taste-market.de/Informationen/Zahlung-Versand/',
     'Lieferung in das EU-Ausland oder internationaler Versand'),
    ('buxtrade.de', 'https://buxtrade.de/pages/zahlung-und-versand',
     'Die Lieferung erfolgt im Inland (Deutschland) und in die nachstehenden Länder'),
    ('shop.cake-masters.com', 'https://shop.cake-masters.com/versand-zahlung',
     'Versandkosten Ausland'),
]:
    DECLARATIONS.setdefault(_host, {'url': _url, 'kind': 'ENUMERATED_DELIVERY_LIST', 'statement': _stmt,
                                    'scope': 'LIST_AFTER_STATEMENT', 'caveat': None})
ENUMERATED = ()


def names():
    return json.load(open(os.path.join(HERE, 'country_names.json')))


def page_text(url, cache={}):
    if url not in cache:
        try:
            code, eff, ct, h, sha, size = V.fetch(url)
            cache[url] = re.sub(r'\s+', ' ', V.visible(h) if code == '200' else '')
        except Exception:
            cache[url] = ''
    return cache[url]


def country_named(text, iso, all_names):
    for n in sorted(all_names.get(iso, []), key=len, reverse=True):
        # Case-insensitive: a rates table writes "saudi arabia" as readily as "Saudi Arabia".
        m = re.search(r'(?<![\wÀ-ɏ])' + re.escape(n) + r'(?![\wÀ-ɏ])', text, re.I)
        if m:
            return n, text[max(0, m.start() - 90):m.end() + 90].strip()
    return None


def excluded(text, iso, all_names):
    """An explicit refusal for this country ("we do not ship to X", "excluding X")."""
    for n in all_names.get(iso, []):
        for m in re.finditer(r'(?:do not|don\'t|cannot|can not|no)\s+(?:ship|deliver)[^.]{0,120}' + re.escape(n), text, re.I):
            return m.group(0)[:200]
    return None


def check(host, iso, all_names=None):
    all_names = all_names or names()
    d = DECLARATIONS.get(host)
    if d is None:
        kind = 'ENUMERATED_LIST_READ_EARLIER' if host in ENUMERATED else 'UNREAD'
        return {'state': 'CONFIRMED' if host in ENUMERATED else 'UNCONFIRMED', 'kind': kind, 'quote': None,
                'basis': 'the seller publishes an enumerated delivery list, read earlier and quoted in the record'
                         if host in ENUMERATED else 'this seller page has not been read for a delivery statement'}
    if d['scope'] == 'NONE':
        return {'state': 'UNCONFIRMED', 'kind': d['kind'], 'quote': None, 'basis': d['caveat'] or 'no delivery statement'}
    text = page_text(d['url'])
    if not text:
        return {'state': 'UNCONFIRMED', 'kind': d['kind'], 'quote': None, 'basis': 'the seller page could not be read'}
    out = excluded(text, iso, all_names)
    if out:
        return {'state': 'UNCONFIRMED', 'kind': d['kind'], 'quote': out, 'basis': 'the seller excludes this country'}
    if d['scope'] == 'LIST_AFTER_STATEMENT':
        i = text.find(d['statement'][:60]) if d.get('statement') else -1
        segment = text[i:] if i >= 0 else ''
        if segment and d.get('list_end'):
            # A closed list ends where it ends: text after it (disruption notices, marketing) must not count as a
            # destination (owner 2026-09-17: read the sentence, its heading and its scope).
            j = segment.find(d['list_end'])
            segment = segment[:j + len(d['list_end'])] if j > 0 else segment
        if not segment:
            return {'state': 'UNCONFIRMED', 'kind': d['kind'], 'quote': None, 'basis': 'the delivery statement was not found on the page today'}
        hit = country_named(segment, iso, all_names)
        if hit:
            return {'state': 'CONFIRMED', 'kind': d['kind'], 'quote': hit[1], 'named_as': hit[0], 'statement': d['statement'],
                    'basis': 'the country is offered in the seller own shipping-destination list', 'caveat': d.get('caveat')}
        return {'state': 'UNCONFIRMED', 'kind': d['kind'], 'quote': None, 'basis': 'the country is not in the seller shipping-destination list'}
    if d['scope'] == 'GROUPS':
        for g in d.get('groups', []):
            if iso in GROUPS[g]:
                return {'state': 'CONFIRMED', 'kind': d['kind'], 'quote': '; '.join(d.get('zone_quotes', [])), 'group': g,
                        'basis': f'the seller prices delivery to a group this country belongs to ({g})', 'caveat': d.get('caveat')}
        if iso in d.get('extra_countries', []):
            return {'state': 'CONFIRMED', 'kind': d['kind'], 'quote': '; '.join(d.get('zone_quotes', [])),
                    'basis': 'the seller prices delivery to this country as its own zone', 'caveat': d.get('caveat')}
        hit = country_named(text, iso, all_names)
        if hit:
            return {'state': 'CONFIRMED', 'kind': d['kind'], 'quote': hit[1], 'named_as': hit[0],
                    'basis': 'the country is named in the seller shipping policy', 'caveat': d.get('caveat')}
        return {'state': 'UNCONFIRMED', 'kind': d['kind'], 'quote': None, 'basis': 'no zone or country in the policy covers this country'}
    return {'state': 'UNCONFIRMED', 'kind': d['kind'], 'quote': None, 'basis': 'unhandled scope'}


def host_of(url):
    m = re.match(r'https?://([^/]+)', url or '')
    return (m.group(1) if m else '').lower()


def v23(all_names):
    rows = json.load(open(os.path.join(HERE, 'v23_rows.json')))['countries']
    prev = json.load(open(os.path.join(HERE, 'v23_shipping.json'))) if os.path.exists(os.path.join(HERE, 'v23_shipping.json')) else {}
    out, counts = {}, {'CONFIRMED': 0, 'UNCONFIRMED': 0}
    for iso in sorted(rows):
        for code in ('DEX', 'SMP', 'STB'):
            row = rows[iso].get(code) or {}
            if 'From abroad' not in (row.get('tags') or []):
                continue
            host = host_of((row.get('links') or [{}])[0].get('url', ''))
            srcs = (row.get('sources_v23') or []) + [l.get('url', '') for l in (row.get('links') or [])]
            # iHerb publishes a shipping page per destination; a country subdomain in the v23 sources points at the
            # same seller's page for that destination.
            sub = [m.group(1) for s in srcs for m in [re.search(r'https?://([a-z]{2})\.iherb\.com', s)] if m]
            if any('iherb.com/shipping/' in s for s in srcs) or sub:
                url = next((s for s in srcs if 'iherb.com/shipping/' in s), f'https://www.iherb.com/shipping/{sub[0]}' if sub else '')
                ok = url.rstrip('/').endswith('/' + iso.lower())
                res = {'state': 'CONFIRMED' if ok else 'UNCONFIRMED', 'kind': 'PER_DESTINATION_SHIPPING_PAGE',
                       'quote': url, 'basis': 'the seller publishes a shipping page for this destination' if ok
                       else 'the shipping page in the v23 sources is for another destination'}
            else:
                res = check(host, iso, all_names)
            before = ((prev.get(iso) or {}).get(code) or {}).get('state')
            out.setdefault(iso, {})[code] = {**res, 'seller': host, 'previous_state': before}
            counts[res['state']] += 1
    json.dump(out, open(os.path.join(HERE, 'v23_shipping.json'), 'w'), ensure_ascii=False, indent=1)
    changed = sum(1 for iso in out for c in out[iso].values() if c['previous_state'] and c['previous_state'] != c['state'])
    print(f'v23_shipping.json: {counts["CONFIRMED"]} confirmed, {counts["UNCONFIRMED"]} unconfirmed ({changed} changed state)')


def apply_research(all_names):
    """Write the delivery state into every cross-border candidate, so the builder and the workbook read one answer.

    The candidate's own quoted evidence wins when it names the country; otherwise the seller's declaration is checked
    here. Nothing is deleted: a candidate that loses its confirmation keeps its product, its quote and a reason.
    """
    changed = 0
    for fn in sorted(os.listdir(os.path.join(HERE, 'research'))):
        if not fn.endswith('.json'):
            continue
        iso, path = fn[:-5], os.path.join(HERE, 'research', fn)
        data = json.load(open(path))
        dirty = False
        for code, item in (data.get('items') or {}).items():
            for c in item.get('candidates') or []:
                if not c.get('cross_border'):
                    continue
                own = c.get('ships_to_evidence')
                own_ok = isinstance(own, dict) and (own.get('found') is True or
                                                   (isinstance(own.get('found'), list) and own['found'] and all(own['found'])))
                if own_ok and (own.get('quote') or own.get('quotes')):
                    state, basis = 'CONFIRMED', 'the seller statement quoted in this record names this country'
                else:
                    res = check(host_of(c.get('url')), iso, all_names)
                    state, basis = res['state'], res['basis']
                if c.get('delivery_state') != state or c.get('delivery_basis') != basis:
                    c['delivery_state'], c['delivery_basis'] = state, basis
                    dirty = True
                    changed += 1
                # The class follows the delivery only in one direction: a cross-border candidate cannot stay
                # VERIFIED_CROSS_BORDER without a declaration. An upgrade stays a researcher/owner decision.
                if state != 'CONFIRMED' and c.get('evidence_class') == 'VERIFIED_CROSS_BORDER':
                    c['evidence_class'] = 'LEAD'
            best = max((ORDER.get(c.get('evidence_class'), 0) for c in item.get('candidates') or []), default=0)
            new_result = {3: 'CONFIRMED_LOCAL', 2: 'VERIFIED_CROSS_BORDER', 1: 'LEAD_ONLY'}.get(best, 'BRAK')
            if item.get('result') != new_result:
                item['result'] = new_result
                dirty = True
        if dirty:
            json.dump(data, open(path, 'w'), ensure_ascii=False, indent=1)
    print(f'delivery state written into {changed} cross-border candidate(s)')


ORDER = {'CONFIRMED_LOCAL': 3, 'VERIFIED_CROSS_BORDER': 2, 'LEAD': 1}


def research(all_names):
    """Report only — the research files are edited by the research agents."""
    import collections
    tally = collections.Counter()
    for fn in sorted(os.listdir(os.path.join(HERE, 'research'))):
        if not fn.endswith('.json'):
            continue
        iso = fn[:-5]
        data = json.load(open(os.path.join(HERE, 'research', fn)))
        for code, item in (data.get('items') or {}).items():
            for c in item.get('candidates') or []:
                if not c.get('cross_border'):
                    continue
                res = check(host_of(c.get('url')), iso, all_names)
                tally[(res['state'], res['kind'])] += 1
                if res['state'] == 'CONFIRMED' and c.get('evidence_class') == 'LEAD':
                    print(f'  UPGRADE? {iso}:{code}:rank{c.get("rank")} {host_of(c.get("url"))} — {res["basis"]}')
                if res['state'] == 'UNCONFIRMED' and c.get('evidence_class') == 'VERIFIED_CROSS_BORDER':
                    print(f'  DOWNGRADE? {iso}:{code}:rank{c.get("rank")} {host_of(c.get("url"))} — {res["basis"]}')
    print(dict(tally))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--v23', action='store_true')
    ap.add_argument('--research', action='store_true')
    ap.add_argument('--apply-research', dest='apply_research', action='store_true')
    ap.add_argument('--host')
    ap.add_argument('--iso')
    a = ap.parse_args()
    all_names = names()
    if a.v23:
        v23(all_names)
    elif a.apply_research:
        apply_research(all_names)
    elif a.research:
        research(all_names)
    elif a.host and a.iso:
        print(json.dumps(check(a.host, a.iso, all_names), ensure_ascii=False, indent=1))
    else:
        ap.print_help()


if __name__ == '__main__':
    main()
