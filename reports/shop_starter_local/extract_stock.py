#!/usr/bin/env python3
"""Stock state for every research candidate, from evidence already on disk — no new fetching.

Owner correction 2026-09-17: "Oddziel tożsamość/skład, dopuszczenie zamiany, ofertę dla kraju, stan magazynowy z datą
oraz decyzję Ownera. Znany stan pokaż uczciwie." A product is not deleted because a shop is out of stock, and a stock
state is never claimed without evidence.

Two sources, both recorded by the researchers at check time:
  1. the researcher's own sentence in `notes` / `equivalence_note` ("Produkt niedostępny", "JSON-LD availability OutOfStock",
     "inStock:false", "'Auf Lager'"), which is the statement the owner has already seen in the workbook;
  2. the page itself, still in the verifier's cache (~/.cache/gellatti-evidence/vcache/<sha1(url)[:16]>): schema.org
     availability, Shopify `"available":`, Open Graph availability, or a printed phrase.
The researcher's sentence wins when the two disagree, because a cached page may have been refetched later.

Writes stock.json: {"<ISO>": {"<CODE>": {"<url>": {state, checked_at_utc, basis, source}}}}, state one of
IN_STOCK / OUT_OF_STOCK / UNKNOWN. UNKNOWN is honest: it says nothing to the customer.
usage: extract_stock.py [--print ISO]
"""
import argparse, hashlib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.expanduser('~/.cache/gellatti-evidence/vcache')
VERIFY = os.path.expanduser('~/.cache/gellatti-evidence/verify')
ITEMS = ['CRP', 'FRU', 'INU', 'YOL']

OUT_TOKENS = r'OutOfStock|SoldOut|Discontinued|BackOrder|out[ _-]?of[ _-]?stock|sold[ _-]?out'
IN_TOKENS = r'InStock|LimitedAvailability|OnlineOnly|InStoreOnly|PreOrder'
# Printed phrases, only used when structured data says nothing. Kept deliberately short and unambiguous.
OUT_PHRASES = ['produkt niedostępny', 'niedostępny', 'chwilowo niedostępny', 'wyprzedane', 'brak w magazynie',
               'out of stock', 'sold out', 'currently unavailable', 'temporarily unavailable', 'agotado', 'esaurito',
               'rupture de stock', 'nicht auf lager', 'ausverkauft', 'nicht verfügbar', 'niet op voorraad', 'slut i lager',
               'εξαντλημένο', 'tükendi', 'аусверк', '売り切れ', '在庫切れ', '缺貨', '缺货', '품절', 'אזל המלאי', 'نفد المخزون']
IN_PHRASES = ['auf lager', 'in stock', 'na stanie', 'dostępny', 'disponible', 'disponibile', 'op voorraad', 'i lager',
              'now available', 'en stock', 'διαθέσιμο', 'stokta', '在庫あり', '有貨', '재고 있음']


def cache_path(url):
    return os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest()[:16])


def verify_time(url):
    """checked_utc of the newest verifier verdict for this URL (the researchers keep one per check)."""
    best = None
    for fn in os.listdir(VERIFY):
        if not fn.endswith('.json'):
            continue
        try:
            d = json.load(open(os.path.join(VERIFY, fn)))
        except Exception:
            continue
        if d.get('url') == url or d.get('final_url') == url:
            t = d.get('checked_utc')
            if t and (best is None or t > best):
                best = t
    return best


def from_notes(text, url):
    """The researcher's own statement, if it names a stock state."""
    t = (text or '').lower()
    if not t:
        return None
    for pat, state in ((r'availability[^.]{0,20}outofstock|instock\s*:\s*false|out of stock|produkt niedostępny|'
                        r'temporarily unavailable|niedostępny', 'OUT_OF_STOCK'),
                       (r"'auf lager'|\"auf lager\"|availability[^.]{0,20}instock|now available|in stock at check", 'IN_STOCK')):
        m = re.search(pat, t)
        if m:
            start = max(0, m.start() - 60)
            return state, 'researcher note: "…' + re.sub(r'\s+', ' ', (text or '')[start:m.end() + 40]).strip() + '…"'
    return None


def from_page(url, gtin, name):
    """Structured availability in the cached page, read only where it belongs to THIS product.

    A shop page carries other products (carousels, "back in stock" widgets), so a token is used only when it sits near
    the product's own GTIN or name. Without such an anchor, a bare printed phrase is too weak to claim a state: the
    answer stays UNKNOWN rather than marking a stocked product as unavailable, or an unavailable one as stocked.
    """
    p = cache_path(url)
    if not os.path.exists(p):
        return None
    html = open(p, 'rb').read().decode('utf-8', 'ignore')
    anchor = -1
    for needle in (re.sub(r'\D', '', gtin or ''), (name or '')[:24]):
        if needle:
            anchor = html.find(needle)
            if anchor >= 0:
                break
    hits = [(m.start(), m.group(0)) for m in re.finditer(r'"availability"\s*:\s*"[^"]*(?:' + OUT_TOKENS + '|' + IN_TOKENS + r')[^"]*"', html)]
    hits += [(m.start(), m.group(0)) for m in re.finditer(r'(?:og:availability|product:availability)"\s+content="[^"]+"', html)]
    hits += [(m.start(), m.group(0)) for m in re.finditer(r'"available"\s*:\s*(?:true|false)', html)]
    if hits:
        if anchor >= 0:
            hits.sort(key=lambda h: abs(h[0] - anchor))
        pos, token = hits[0]
        near = anchor < 0 or abs(pos - anchor) <= 20000
        if near:
            state = 'OUT_OF_STOCK' if (re.search(OUT_TOKENS, token, re.I) or token.endswith('false')) else 'IN_STOCK'
            where = f' ({abs(pos - anchor)} chars from the product on the page)' if anchor >= 0 else ' (single product page)'
            return state, f'page data: {token[:80]}{where}'
    if anchor < 0:
        return None
    window = html[max(0, anchor - 4000):anchor + 4000]
    text = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', window)).lower()
    for phrase in OUT_PHRASES:
        if phrase in text:
            return 'OUT_OF_STOCK', f'printed phrase next to the product: "{phrase}"'
    for phrase in IN_PHRASES:
        if phrase in text:
            return 'IN_STOCK', f'printed phrase next to the product: "{phrase}"'
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--print', dest='show', default='')
    a = ap.parse_args()
    out, counts = {}, {'IN_STOCK': 0, 'OUT_OF_STOCK': 0, 'UNKNOWN': 0}
    for fn in sorted(os.listdir(os.path.join(HERE, 'research'))):
        if not fn.endswith('.json'):
            continue
        iso = fn[:-5]
        data = json.load(open(os.path.join(HERE, 'research', fn)))
        for code in ITEMS:
            for c in ((data.get('items') or {}).get(code) or {}).get('candidates') or []:
                url = c.get('url')
                if not url:
                    continue
                if isinstance(c.get('availability'), dict) and c['availability'].get('state'):
                    res = (c['availability']['state'], c['availability'].get('basis') or 'recorded by the researcher')
                    when = c['availability'].get('checked_at_utc') or c.get('checked_at_utc')
                else:
                    item = (data.get('items') or {}).get(code) or {}
                    # The candidate's own note only. An item note is shared by every candidate, so a sentence about the
                    # first choice must not mark the alternative as unavailable — it is read only when the item has one
                    # candidate and the note can mean nothing else.
                    own = c.get('equivalence_note')
                    shared = item.get('notes') if len(item.get('candidates') or []) == 1 else None
                    res = (from_notes(' '.join(filter(None, [own, shared])), url)
                           or from_page(url, c.get('gtin'), c.get('product_name')))
                    when = c.get('checked_at_utc') or verify_time(url)
                state, basis = res if res else ('UNKNOWN', 'no stock statement on the page or in the researcher note')
                counts[state] += 1
                out.setdefault(iso, {}).setdefault(code, {})[url] = {
                    'state': state, 'checked_at_utc': when, 'basis': basis, 'rank': c.get('rank')}
    json.dump(out, open(os.path.join(HERE, 'stock.json'), 'w'), ensure_ascii=False, indent=1)
    print(f'stock.json: {sum(counts.values())} candidates — ' + ', '.join(f'{k} {v}' for k, v in counts.items()))
    if a.show:
        print(json.dumps(out.get(a.show, {}), ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
