"""Identifier typing for product codes (D-25): GTIN-8/12/13/14 checksum, GS1 restricted-circulation (store-internal)
numbers, ISBN/ISSN and coupon ranges. A number is a product identity only when id_type() returns a GTIN type."""
import re
digits = lambda s: re.sub(r"\D", "", str(s or ""))


def gtin_ok(s):
    s = digits(s)
    if len(s) not in (8, 12, 13, 14): return False
    t = sum(int(c) * (3 if i % 2 == 0 else 1) for i, c in enumerate(reversed(s[:-1])))
    return (10 - t % 10) % 10 == int(s[-1])


def is_rcn(e):
    e = digits(e)
    if len(e) == 14: e = e[1:]
    if len(e) == 13: p = int(e[:3]); return 20 <= p <= 29 or 40 <= p <= 49 or 200 <= p <= 299
    if len(e) == 12: return e[0] in '24'
    if len(e) == 8: return e[0] in '02'
    return False


def id_type(e):
    """Identifier typing (D-25): what kind of number this is, before anyone treats it as a product identity."""
    e = digits(e)
    if not e: return 'NONE'
    if len(e) not in (8, 12, 13, 14): return 'NOT_A_GTIN_LENGTH'
    if not gtin_ok(e): return 'CHECKSUM_FAIL'
    e13 = e[1:] if len(e) == 14 else e
    if len(e13) == 13 and e13[:3] in ('978', '979'): return 'ISBN (book, not food)'
    if len(e13) == 13 and e13[:3] == '977': return 'ISSN (periodical)'
    if len(e13) == 13 and e13[:2] in ('98', '99'): return 'COUPON/REFUND (not a product)'
    if is_rcn(e): return 'RCN_STORE_INTERNAL (not globally unique)'
    return {8: 'GTIN-8', 12: 'GTIN-12 (UPC-A)', 13: 'GTIN-13 (EAN-13)', 14: 'GTIN-14'}[len(e)]
