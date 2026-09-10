#!/usr/bin/env python3
"""Owner rule D-29, identity path 2: the exact GTIN on an AUTHORITATIVE page + an unambiguous attribute match to a LOCAL
listing that does not print the GTIN. Name similarity alone never confirms.

usage: identity_match.py --ean EAN --source-url URL --local-url URL --market ISO2 --brand BRAND --name "PRODUCT NAME"
                         --pack "50 g" [--variant "35%" ...] [--formulation "E417" ...]
Checks (all must hold for exact_product_identity_confirmed):
  identifier  the exact GTIN appears as data on the SOURCE page, and the source is a manufacturer/retailer page
              (aggregators and marketplaces never count)
  brand       BRAND is named on both pages
  name        every significant word of NAME (4+ letters, brand excluded) is on both pages
  pack        PACK is on both pages; a local page naming several pack sizes of the same unit is AMBIGUOUS
  variant /   every --variant and --formulation token is on both pages
  formulation
  conflict    the local page carries no different GTIN
Market binding comes from the LOCAL page only (country domain, country path, locale subdomain, seller address,
owner-approved host declaration). Currency never binds (D-31); a US .com needs an explicit US signal (D-30).
local_availability_confirmed = identity confirmed AND binding confirmed. Prints one JSON object."""
import argparse, hashlib, importlib.util, json, os, re, sys, time, unicodedata
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('v', os.path.join(HERE, 'verify_ean_market.py'))
v = importlib.util.module_from_spec(spec); spec.loader.exec_module(v)
sys.path.insert(0, HERE)
from identifiers import id_type, digits  # noqa: E402

UNIT = {'kg': ('g', 1000), 'g': ('g', 1), 'gr': ('g', 1), 'mg': ('g', 0.001), 'l': ('ml', 1000), 'ml': ('ml', 1), 'cl': ('ml', 10),
        'oz': ('g', 28.3495), 'lb': ('g', 453.592)}
PACK_RX = re.compile(r'(\d+(?:[.,]\d+)?)\s*(kg|gr|g|mg|ml|cl|l|oz|lb)\b', re.I)


def fold(s):
    s = unicodedata.normalize('NFKD', s or '')
    return re.sub(r'\s+', ' ', ''.join(c for c in s if not unicodedata.combining(c))).casefold()


def packs(text):
    out = set()
    for num, unit in PACK_RX.findall(text or ''):
        fam, f = UNIT[unit.lower()]
        out.add((fam, round(float(num.replace(',', '.')) * f, 1)))
    return out


def gtins_on(h):
    vis = v.visible(h)
    found = set(re.findall(r'"gtin(?:8|12|13|14)?"\s*:\s*"?(\d{8,14})', h))
    found |= set(re.findall(r'itemprop="gtin(?:8|12|13|14)?"[^>]*content="(\d{8,14})"', h))
    found |= set(re.findall(r'(?i)(?:EAN|GTIN|UPC|barcode)\D{0,25}(\d{8,14})', vis))
    return {g for g in found if id_type(g).startswith('GTIN')}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for a in ('--ean', '--source-url', '--local-url', '--market', '--brand', '--name', '--pack'): ap.add_argument(a, required=True)
    ap.add_argument('--variant', action='append', default=[]); ap.add_argument('--formulation', action='append', default=[])
    ap.add_argument('--binding-url', default=''); ap.add_argument('--binding-quote', default='')
    a = ap.parse_args(); e = digits(a.ean); iso = a.market.upper(); fails = []
    sc, seff, _, sh, _, ssz = v.fetch(a.source_url)
    lc, leff, _, lh, _, lsz = v.fetch(a.local_url)
    s_ok, l_ok = sc == '200' and ssz > 2000, lc == '200' and lsz > 2000
    s_txt = fold(v.visible(sh) if s_ok else ''); l_txt = fold(v.visible(lh) if l_ok else '')
    t = lambda h: fold(re.sub(r'\s+', ' ', (re.search(r'(?is)<title[^>]*>(.*?)</title>', h or '') or [None, ''])[1]))
    s_title, l_title = t(sh), t(lh)
    # identifier on the source page
    n, echo, emb, ctx = v.hits(sh, e) if (s_ok and e) else (0, 0, 0, '')
    src_type = v.source_type(seff)
    identifier = n > 0 and src_type == 'DIRECT' and id_type(e).startswith('GTIN')
    if not identifier: fails.append('IDENTIFIER_NOT_ON_AUTHORITATIVE_SOURCE' if src_type == 'DIRECT' else f'SOURCE_IS_{src_type}')
    src_gtins = gtins_on(sh) | ({e} if n > 0 else set()) if s_ok else set()
    if identifier and len({g.lstrip('0') for g in src_gtins}) > 1:
        # several products/variants on the source page: the wanted pack must sit next to THIS GTIN
        near = set()
        for m_ in re.finditer(r'(?<!\d)0?' + re.escape(e.lstrip('0')) + r'(?!\d)', sh):
            near |= packs(fold(re.sub(r'<[^>]+>|\\u[0-9a-fA-F]{4}|[\\"]', ' ', sh[max(0, m_.start() - 400):m_.end() + 400])))
        if not (packs(a.pack) & near): fails.append('SOURCE_VARIANT_AMBIGUOUS (several GTINs on the source page; the pack is not next to this GTIN)')
    # attribute match
    brand = fold(a.brand)
    for label, txt in (('source', s_txt), ('local', l_txt)):
        if not re.search(r'(?<!\w)' + re.escape(brand) + r'(?!\w)', txt): fails.append(f'BRAND_NOT_ON_{label.upper()}')
    words = [w for w in re.findall(r'\w{4,}', fold(a.name)) if w not in brand.split() and not PACK_RX.fullmatch(w)]
    for w in words:
        if w not in s_txt: fails.append(f'NAME_WORD_NOT_ON_SOURCE:{w}')
        if w not in l_txt: fails.append(f'NAME_WORD_NOT_ON_LOCAL:{w}')
    want = packs(a.pack)
    if not want: fails.append('PACK_NOT_PARSEABLE')
    else:
        def near_pack(hh):
            # pack sizes written next to this GTIN in the page's own data (e.g. a Shopify variant: "50gr" … "barcode":"<GTIN>")
            out = set()
            for m_ in re.finditer(r'(?<!\d)0?' + re.escape(e.lstrip('0')) + r'(?!\d)', hh or ''):
                out |= packs(fold(re.sub(r'<[^>]+>|\\u[0-9a-fA-F]{4}|[\\"]', ' ', hh[max(0, m_.start() - 400):m_.end() + 400])))
            return out
        if not want & (packs(s_title + ' ' + s_txt) | near_pack(sh)): fails.append('PACK_NOT_ON_SOURCE')
        l_packs = packs(l_title) or packs(l_txt) or near_pack(lh)
        if not want & l_packs: fails.append('PACK_NOT_ON_LOCAL')
        fam = next(iter(want))[0]
        if len({p for p in packs(l_title) if p[0] == fam}) > 1: fails.append('LOCAL_TITLE_OFFERS_SEVERAL_PACK_SIZES (AMBIGUOUS)')
    for tok in a.variant + a.formulation:
        ft = fold(tok)
        if ft not in s_txt: fails.append(f'TOKEN_NOT_ON_SOURCE:{tok}')
        if ft not in l_txt: fails.append(f'TOKEN_NOT_ON_LOCAL:{tok}')
    local_gt = (gtins_on(lh) | ({e} if v.hits(lh, e)[0] > 0 else set())) if l_ok else set()
    if local_gt and e.lstrip('0') not in {g.lstrip('0') for g in local_gt}:
        fails.append('LOCAL_PAGE_CARRIES_OTHER_GTIN:' + ','.join(sorted(local_gt)))
    elif len({g.lstrip('0') for g in local_gt}) > 1:
        # a variant page: our GTIN is there, and the wanted pack must sit next to it
        near = set()
        for m_ in re.finditer(r'(?<!\d)0?' + re.escape(e.lstrip('0')) + r'(?!\d)', lh):
            near |= packs(fold(re.sub(r'<[^>]+>|\\u[0-9a-fA-F]{4}|[\\"]', ' ', lh[max(0, m_.start() - 400):m_.end() + 400])))
        if not (packs(a.pack) & near): fails.append('LOCAL_VARIANT_AMBIGUOUS (several GTINs on the local page; the pack is not next to this GTIN)')
    if not (s_ok and l_ok): fails.append('PAGE_NOT_READABLE:' + ('source ' if not s_ok else '') + ('local' if not l_ok else ''))
    identity = not fails
    mk, how = v.page_market(leff, lh if l_ok else '')
    bound = l_ok and mk == iso and how in v.BINDING
    quote = {}
    if a.binding_url and a.binding_quote:
        spec_q = importlib.util.spec_from_file_location('cq', os.path.join(HERE, 'check_quotes.py')); cq = importlib.util.module_from_spec(spec_q); spec_q.loader.exec_module(cq)
        quote = cq.check(a.binding_url, a.binding_quote)
        host = lambda u: re.sub(r'^www\.', '', (u.split('/') + ['', '', ''])[2])
        if quote.get('found') and host(quote.get('final_url') or a.binding_url) == host(leff) and not bound:
            bound, mk, how = True, iso, 'EXPLICIT_QUOTE_ON_LOCAL_SELLER'
    r = dict(ean=e, identifier_type=id_type(e), market=iso, source_url=a.source_url, source_type=src_type, source_ean_context=ctx[:140],
             local_url=a.local_url, local_page_market=mk or '', market_binding_signal=(how if mk == iso else ('NONE' if mk is None else 'OTHER_MARKET:' + mk)),
             identifier_confirmed=identifier, exact_product_identity_confirmed=identity, market_binding_confirmed=bound,
             local_availability_confirmed=identity and bound, identity_basis=('GTIN_ON_SOURCE + ATTRIBUTE_MATCH' if identity else 'NOT_PROVEN'),
             failed_checks=fails, binding_quote_found=quote.get('found', ''), binding_quote_context=(quote.get('context') or '')[:200],
             checked_utc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
    key = hashlib.sha1(f'identity|{a.source_url}|{a.local_url}|{e}|{iso}'.encode()).hexdigest()[:16]
    json.dump(r, open(v.OUT + 'identity_' + key + '.json', 'w'), ensure_ascii=False)
    print(json.dumps(r, ensure_ascii=False))


if __name__ == '__main__':
    main()
