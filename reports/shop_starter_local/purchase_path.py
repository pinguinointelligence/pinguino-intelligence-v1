#!/usr/bin/env python3
"""Can this page actually be bought from? — read from evidence already on disk, never assumed.

Owner correction 2026-09-17 (third round): "Nie zamieniaj braku zakazu B2B w automatyczne potwierdzenie sprzedaży
detalicznej: potrzebna jest rzeczywista droga zakupu." A seller that prints no restriction is not thereby a shop: a
product data sheet whose only route is a generic "order" link does not close a retail role.

States (recorded with the marker that decided them):
  ONLINE_RETAIL      the page carries a price and/or a buy control (cart/basket/checkout markup, in any language)
  CONTACT_OR_QUOTE   the page carries neither: a catalogue or data sheet, or a quote-on-request listing
  UNKNOWN            no cached page for that URL (nothing is claimed)
A researcher's own `purchase_path` field on the candidate always wins over this reading.

usage: purchase_path.py [--print ISO]
"""
import argparse, hashlib, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.expanduser('~/.cache/gellatti-evidence/vcache')
ITEMS = ['CRP', 'FRU', 'INU', 'YOL']

PRICE = [r'"price"\s*:\s*"?\d', r'"priceCurrency"', r'(?:product|og):price:amount', r'itemprop="price"',
         r'class="[^"]*\bprice\b', r'data-price', r'\bPLN\b|\bEUR\b|\bUSD\b|\bGBP\b|\bCHF\b|\bTRY\b|\bSEK\b|\bILS\b']
BUY = [r'/cart/add', r'add-to-cart', r'addtocart', r'"AddToCart"', r'name="add"', r'btn-cart', r'data-product-id',
       r'sepete ekle', r'do koszyka', r'in den warenkorb', r'ajouter au panier', r'aggiungi al carrello',
       r'añadir a la cesta|agregar al carrito', r'add to basket', r'κ[αά]λαθι', r'カートに入れる', r'加入購物車|加入购物车',
       r'장바구니', r'إضافة إلى السلة', r'הוסף לסל', r'checkout']


def cache_path(url):
    return os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest()[:16])


def read(url):
    p = cache_path(url)
    if not os.path.exists(p):
        return None
    return open(p, 'rb').read().decode('utf-8', 'ignore')


def classify(url):
    html = read(url)
    if html is None:
        return 'UNKNOWN', 'no cached page for this URL'
    price = next((p for p in PRICE if re.search(p, html, re.I)), None)
    buy = next((b for b in BUY if re.search(b, html, re.I)), None)
    if price or buy:
        marks = ', '.join(x for x in (f'price marker /{price}/' if price else None,
                                      f'buy control /{buy}/' if buy else None) if x)
        return 'ONLINE_RETAIL', marks
    return 'CONTACT_OR_QUOTE', 'the cached page carries neither a price nor a buy control'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--print', dest='show', default='')
    a = ap.parse_args()
    out, counts = {}, {'ONLINE_RETAIL': 0, 'CONTACT_OR_QUOTE': 0, 'UNKNOWN': 0}
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
                own = c.get('purchase_path')
                if own in ('ONLINE_RETAIL', 'CONTACT_OR_QUOTE', 'UNKNOWN'):
                    state, basis = own, 'recorded by the researcher'
                elif isinstance(own, str) and own.strip():
                    # A researcher's sentence, not a token: read it, and fall back to the page when it says nothing.
                    said_no_shop = re.search(r'sales contact|no online|quote|dealer|bayi|contact us|request a quote|'
                                             r'does not list|not sold online', own, re.I)
                    state = 'CONTACT_OR_QUOTE' if said_no_shop else classify(url)[0]
                    basis = 'researcher note: ' + re.sub(r'\s+', ' ', own)[:200]
                else:
                    state, basis = classify(url)
                counts[state] = counts.get(state, 0) + 1
                out.setdefault(iso, {}).setdefault(code, {})[url] = {'state': state, 'basis': basis, 'rank': c.get('rank')}
    json.dump(out, open(os.path.join(HERE, 'purchase.json'), 'w'), ensure_ascii=False, indent=1)
    print(f'purchase.json: {sum(counts.values())} candidates — ' + ', '.join(f'{k} {v}' for k, v in counts.items()))
    if a.show:
        print(json.dumps(out.get(a.show, {}), ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
