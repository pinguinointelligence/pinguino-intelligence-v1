#!/usr/bin/env python3
"""Check that an exact quote is printed on a page (shipping policy, host declaration).
usage: check_quotes.py URL "quote"   → prints JSON {found, ratio, context, http, final_url}
Match = normalized substring (whitespace collapsed, quotes/dashes unified, casefolded). `ratio` is the share of quote
words found in order inside the best window — reported for review only; it never counts as a match."""
import sys, re, json, importlib.util, unicodedata
import os
spec = importlib.util.spec_from_file_location('v', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'verify_ean_market.py'))
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)


def norm(s):
    s = unicodedata.normalize('NFKC', s)
    s = re.sub(r'[‘’‚‛′]', "'", s)
    s = re.sub(r'[“”„‟″]', '"', s)
    s = re.sub(r'[‐-―−]', '-', s)
    return re.sub(r'\s+', ' ', s).strip().casefold()


def check(url, quote):
    code, eff, ct, h, sha, size = v.fetch(url)
    text = v.visible(h) if code == '200' else ''
    nt, nq = norm(text), norm(quote)
    i = nt.find(nq) if nq else -1
    ratio = 0.0
    if i < 0 and nq:
        words = nq.split()
        best = 0
        for start in [m.start() for m in re.finditer(re.escape(words[0]), nt)][:200]:
            pos, hit = start, 0
            for w in words:
                j = nt.find(w, pos, pos + 400)
                if j >= 0:
                    hit += 1
                    pos = j + len(w)
            best = max(best, hit)
        ratio = round(best / len(words), 2)
    return dict(url=url, final_url=eff, http=code, found=i >= 0, ratio=1.0 if i >= 0 else ratio,
                context=(text[max(0, i - 60):i + len(quote) + 60] if i >= 0 else '')[:300])


if __name__ == '__main__':
    print(json.dumps(check(sys.argv[1], sys.argv[2]), ensure_ascii=False))
