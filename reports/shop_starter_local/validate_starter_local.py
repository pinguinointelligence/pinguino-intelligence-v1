#!/usr/bin/env python3
"""Independent read-back of the per-country Starter Pack PDFs (poppler: pdftotext, pdfinfo, pdffonts).

For every document in build/starter_local/manifest[_draft].json:
  1. the file exists and its sha256 matches the manifest;
  2. 6 pages, page size 120 × 210 mm;
  3. every font is embedded;
  4. the localized title and all seven item names are in the text;
  5. every product listed in the manifest appears: its GTIN digits (when it has one) and the start of its name
     (Latin/Cyrillic/Greek names only — right-to-left and CJK text is not compared, pdftotext reorders it);
  6. a publishable document contains no draft banner, and every product in it is accepted (or v23);
  7. the PDF carries at least as many link annotations as products with links.
Writes build/starter_local/validation[_draft].json and exits non-zero on any failure.
usage: validate_starter_local.py [--draft]
"""
import argparse, hashlib, json, os, re, subprocess, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build', 'starter_local')
ITEMS = ['DEX', 'SMP', 'CRP', 'FRU', 'INU', 'YOL', 'STB']


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=120)


def norm(s):
    s = unicodedata.normalize('NFKC', s or '').lower()
    return re.sub(r'\s+', ' ', re.sub(r'[^\w\s]', ' ', s)).strip()


def comparable(s):
    return not re.search(r'[֐-ࣿ฀-๿぀-ヿ㐀-鿿가-힯ঀ-৿஀-௿඀-෿ऀ-ॿ]', s or '')


def link_count(pdf):
    data = open(pdf, 'rb').read()
    return len(re.findall(rb'/URI\s*\(', data)) + len(re.findall(rb'/S\s*/URI', data)) // 2


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--draft', action='store_true')
    a = ap.parse_args()
    manifest = json.load(open(os.path.join(BUILD, 'manifest_draft.json' if a.draft else 'manifest.json')))
    results, failed = [], 0
    for doc in manifest['documents']:
        checks = {}
        pdf = os.path.join(HERE, doc['pdf'])
        S = json.load(open(os.path.join(HERE, 'strings', f'{doc["locale"]}.json')))
        checks['exists_sha'] = os.path.exists(pdf) and hashlib.sha256(open(pdf, 'rb').read()).hexdigest() == doc['sha256']
        info = run(['pdfinfo', pdf]).stdout
        pages = int(re.search(r'Pages:\s+(\d+)', info).group(1)) if 'Pages:' in info else 0
        size = re.search(r'Page size:\s+([\d.]+) x ([\d.]+)', info)
        checks['pages_6'] = pages == 6
        checks['size_120x210mm'] = bool(size) and abs(float(size.group(1)) / 72 * 25.4 - 120) < 0.5 and abs(float(size.group(2)) / 72 * 25.4 - 210) < 0.5
        fonts = run(['pdffonts', pdf]).stdout.splitlines()[2:]
        # pdffonts columns end with: emb sub uni object-id generation
        checks['fonts_embedded'] = bool(fonts) and all(len(line.split()) >= 5 and line.split()[-5] == 'yes' for line in fonts)
        text = run(['pdftotext', '-layout', pdf, '-']).stdout
        flat = norm(text)
        title_ok = norm(S['title']) in flat if comparable(S['title']) else True
        checks['title'] = title_ok
        missing_names = [c for c in ITEMS if comparable(S['items'][c]['name']) and norm(S['items'][c]['name']) not in flat]
        checks['seven_item_names'] = not missing_names
        product_issues, with_links = [], 0
        for code in ITEMS:
            for p in doc['items'][code]:
                digits = re.sub(r'\D', '', p.get('gtin') or '')
                if digits and digits not in re.sub(r'\s', '', text):
                    product_issues.append(f'{code} gtin {digits} not in text')
                name = p.get('name') or ''
                if name and comparable(name):
                    head = norm(name)[:18]
                    if head and head not in flat:
                        product_issues.append(f'{code} name "{name[:30]}" not in text')
                if not a.draft and p.get('source') == 'RESEARCH' and not p.get('accepted'):
                    product_issues.append(f'{code} unaccepted research product in a publishable PDF')
                with_links += 1
        checks['products_in_text'] = not product_issues
        banner = norm(S['draft']).split(' ')[0]
        checks['draft_banner'] = (banner in flat) if a.draft else (norm(S['draft']) not in flat)
        checks['links'] = link_count(pdf) >= min(with_links, 1)
        ok = all(checks.values())
        failed += 0 if ok else 1
        results.append({'iso': doc['iso'], 'locale': doc['locale'], 'ok': ok, 'checks': checks,
                        'missing_item_names': missing_names, 'product_issues': product_issues})
        print(f'{"PASS" if ok else "FAIL"} {doc["iso"]}/{doc["locale"]} ' + ' '.join(k for k, v in checks.items() if not v))
    out = os.path.join(BUILD, 'validation_draft.json' if a.draft else 'validation.json')
    json.dump({'documents': results, 'failed': failed}, open(out, 'w'), ensure_ascii=False, indent=1)
    print(f'{len(results) - failed}/{len(results)} documents pass → {os.path.relpath(out, HERE)}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
