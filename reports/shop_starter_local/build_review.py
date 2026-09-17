#!/usr/bin/env python3
"""Owner review workbook for the per-country Starter Pack PDF (research proposals + v23 context).

Writes review/GELLATTI_STARTER_PACK_LOKALNE_ODPOWIEDNIKI_REVIEW.xlsx with:
  00_INSTRUKCJA   how to decide (TAK / NIE per candidate), what the classes mean
  01_DO_DECYZJI   one row per market × researched item × candidate (cream powder, fructose, inulin, egg yolk)
  02_BRAKI        market × item where research found no usable product (BRAK)
  03_V23          the owner's v23 products used for dextrose, skim milk powder and the stabilizer slot (context)
  04_MACIERZ      market × item status matrix
The "Rekomendacja" column is a suggestion only; nothing is accepted until the owner writes TAK in "Decyzja Ownera".
import_decisions: read the filled workbook back into acceptance.json (python3 build_review.py --import FILE).
Dependency-free XLSX writer (inline strings).
"""
import argparse, json, os, re, sys, zipfile, datetime
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'a03', 'tooling'))
from identifiers import id_type  # noqa: E402  (D-25 identifier typing: GS1 checksum, RCN, ISBN, coupons)
ITEMS_R = ['CRP', 'FRU', 'INU', 'YOL']
ITEM_PL = {'DEX': 'Dekstroza', 'SMP': 'Mleko odtłuszczone w proszku', 'CRP': 'Śmietanka w proszku 42%', 'FRU': 'Fruktoza',
           'INU': 'Inulina', 'YOL': 'Suszone żółtko jaja', 'STB': 'Stabilizator (lokalna alternatywa)'}
CLASS_PL = {'CONFIRMED_LOCAL': 'POTWIERDZONY LOKALNIE', 'VERIFIED_CROSS_BORDER': 'POTWIERDZONY Z ZAGRANICY',
            'LEAD': 'NIEPOTWIERDZONY (trop)', 'LEAD_ONLY': 'TYLKO NIEPOTWIERDZONE TROPY', 'BRAK': 'BRAK'}
EQ_PL = {'A_EQUIVALENT': 'odpowiednik', 'B_SAME_TYPE_DIFFERENT_COMPOSITION': 'ten sam rodzaj, inny skład',
         'C_INSUFFICIENT_DATA': 'za mało danych'}
STOCK_PL = {'IN_STOCK': 'w sprzedaży', 'OUT_OF_STOCK': 'brak towaru', 'UNKNOWN': 'nie podano na stronie'}
SHIP_PL = {'CONFIRMED': 'wysyłka do kraju potwierdzona cytatem', 'UNCONFIRMED': 'wysyłka do kraju NIEpotwierdzona',
           'UNSTRUCTURED': 'dowód wysyłki opisowy — do ponownego sprawdzenia'}


def col(n):
    s = ''
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def sheet_xml(rows, widths, header=True):
    out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
           '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">']
    if header:
        out.append('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>')
    out.append('<cols>' + ''.join(f'<col min="{i + 1}" max="{i + 1}" width="{w}" customWidth="1"/>' for i, w in enumerate(widths)) + '</cols>')
    out.append('<sheetData>')
    for r, row in enumerate(rows, start=1):
        cells = []
        for c, v in enumerate(row, start=1):
            ref = f'{col(c)}{r}'
            style = ' s="1"' if header and r == 1 else ' s="2"'
            if v is None or v == '':
                cells.append(f'<c r="{ref}"{style}/>')
            elif isinstance(v, (int, float)) and not isinstance(v, bool):
                cells.append(f'<c r="{ref}"{style}><v>{v}</v></c>')
            else:
                text = escape(re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', str(v)))
                cells.append(f'<c r="{ref}" t="inlineStr"{style}><is><t xml:space="preserve">{text}</t></is></c>')
        out.append(f'<row r="{r}">' + ''.join(cells) + '</row>')
    out.append('</sheetData>')
    if header and rows:
        out.append(f'<autoFilter ref="A1:{col(len(rows[0]))}{len(rows)}"/>')
    out.append('</worksheet>')
    return '\n'.join(out)


def write_xlsx(path, sheets):
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                   '<Default Extension="xml" ContentType="application/xml"/>'
                   '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                   '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
                   + ''.join(f'<Override PartName="/xl/worksheets/sheet{i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(len(sheets)))
                   + '</Types>')
        z.writestr('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
                   '</Relationships>')
        z.writestr('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
                   + ''.join(f'<sheet name="{escape(name)}" sheetId="{i + 1}" r:id="rId{i + 1}"/>' for i, (name, _, _, _) in enumerate(sheets))
                   + '</sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   + ''.join(f'<Relationship Id="rId{i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i + 1}.xml"/>' for i in range(len(sheets)))
                   + f'<Relationship Id="rId{len(sheets) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
                   '</Relationships>')
        z.writestr('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                   '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
                   '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
                   '<fill><patternFill patternType="solid"><fgColor rgb="FFF0C44C"/><bgColor indexed="64"/></patternFill></fill></fills>'
                   '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
                   '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
                   '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
                   '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="top" wrapText="1"/></xf>'
                   '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf></cellXfs>'
                   '</styleSheet>')
        for i, (name, rows, widths, header) in enumerate(sheets):
            z.writestr(f'xl/worksheets/sheet{i + 1}.xml', sheet_xml(rows, widths, header))


def shipping_state(c):
    """Is the delivery to this country evidenced? Prose instead of a checked quote counts as UNSTRUCTURED, not proof."""
    ev = c.get('ships_to_evidence')
    if isinstance(ev, str):
        return 'UNSTRUCTURED'
    ev = ev or {}
    found = ev.get('found')
    ok = found is True or (isinstance(found, list) and found and all(found))
    return 'CONFIRMED' if (ok and (ev.get('quote') or ev.get('quotes'))) else 'UNCONFIRMED'


TRADE_ONLY = re.compile(r'TRADE_ONLY|B2B|WHOLESALE|RESELLER', re.I)


def recommendation(c):
    cls, eq = c.get('evidence_class'), c.get('equivalence')
    kind = id_type(c.get('gtin')) if c.get('gtin') else 'NONE'
    if c.get('gtin') and not kind.startswith('GTIN'):
        return f'DO DECYZJI: kod nie jest poprawnym GTIN ({kind})'
    if TRADE_ONLY.search(str(c.get('channel') or '')):
        # A shop that sells only to registered businesses is not an ordinary retail offer, however good the product is.
        return 'DO DECYZJI: kanał tylko dla firm (nie zwykła sprzedaż detaliczna)'
    if c.get('cross_border') and (c.get('delivery_state') or shipping_state(c)) != 'CONFIRMED':
        # The product may be right; what is missing is the seller's own statement that it delivers to this country.
        return 'DO DECYZJI: sprzedawca nie deklaruje dostawy do tego kraju'
    if cls in ('CONFIRMED_LOCAL', 'VERIFIED_CROSS_BORDER') and eq == 'A_EQUIVALENT':
        return 'TAK'
    if cls in ('CONFIRMED_LOCAL', 'VERIFIED_CROSS_BORDER'):
        return 'DO DECYZJI: inny skład'
    return 'DO DECYZJI: niepotwierdzony'


def comp_text(c):
    comp = c.get('composition') or {}
    parts = []
    for key, label in (('fat_g', 'tłuszcz g/100g'), ('protein_g', 'białko g/100g'), ('fibre_g', 'błonnik g/100g'), ('fructose_pct', 'fruktoza %')):
        if comp.get(key) is not None:
            parts.append(f'{label}: {comp[key]}')
    if comp.get('ingredients'):
        parts.append(f'skład: {comp["ingredients"]}')
    return '; '.join(parts)


def build(out_path):
    markets = json.load(open(os.path.join(HERE, 'markets75.json')))
    v23 = json.load(open(os.path.join(HERE, 'v23_rows.json')))['countries']
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    stock = json.load(open(os.path.join(HERE, 'stock.json'))) if os.path.exists(os.path.join(HERE, 'stock.json')) else {}
    v23_ship = json.load(open(os.path.join(HERE, 'v23_shipping.json'))) if os.path.exists(os.path.join(HERE, 'v23_shipping.json')) else {}
    done = [iso for iso in sorted(markets) if os.path.exists(os.path.join(HERE, 'research', f'{iso}.json'))]
    decide = [['ID', 'ISO', 'Kraj', 'Składnik', 'Wybór', 'Marka', 'Produkt (jak na stronie)', 'Opakowanie', 'EAN', 'Link', 'Sprzedawca',
               'Typ identyfikatora', 'Tożsamość i skład (klasa dowodu)', 'Skład (ze strony)', 'Dopuszczalność zamiany',
               'Oferta dla kraju', 'Kanał sprzedaży', 'Minimalne zamówienie', 'Stan magazynowy', 'Stan z dnia', 'Podstawa stanu',
               'Do sprawdzenia przez Ownera', 'Uwagi badacza', 'Sprawdzono (UTC)',
               'Rekomendacja', 'Decyzja Ownera (TAK/NIE)', 'Uwagi Ownera']]
    gaps = [['ISO', 'Kraj', 'Składnik', 'Wynik', 'Szukane terminy', 'Sprawdzone źródła', 'Uwagi']]
    matrix = [['ISO', 'Kraj', 'Dekstroza (v23)', 'Mleko odtł. (v23)', 'Stabilizator (v23)', 'Śmietanka 42%', 'Fruktoza', 'Inulina', 'Żółtko',
               'PDF 7/7, jeśli przyjmiesz rekomendacje TAK']]
    for iso in sorted(markets):
        name = markets[iso]['country']
        path = os.path.join(HERE, 'research', f'{iso}.json')
        r = json.load(open(path)) if os.path.exists(path) else None
        row = [iso, name] + ['v23' if v23.get(iso, {}).get(c) else 'BRAK' for c in ('DEX', 'SMP', 'STB')]
        for code in ITEMS_R:
            item = (r or {}).get('items', {}).get(code) if r else None
            if not r:
                row.append('W TRAKCIE')
                continue
            result = (item or {}).get('result') or 'BRAK'
            row.append(CLASS_PL.get(result, result))
            cands = (item or {}).get('candidates') or []
            if not cands:
                gaps.append([iso, name, ITEM_PL[code], CLASS_PL.get(result, result), ', '.join((item or {}).get('local_terms') or []),
                             '; '.join((item or {}).get('sources_tried') or [])[:1500], (item or {}).get('notes') or ''])
            for c in cands[:2]:
                st = (stock.get(iso, {}).get(code, {}) or {}).get(c.get('url') or '', {})
                offer = ('sklep z tego kraju' if not c.get('cross_border')
                         else 'sklep za granicą — ' + SHIP_PL.get(shipping_state(c), ''))
                decide.append([f'{iso}-{code}-{c.get("rank")}', iso, name, ITEM_PL[code], c.get('rank'), c.get('brand'),
                               c.get('product_name'), c.get('pack'), c.get('gtin') or '', c.get('url'), c.get('seller') or '',
                               id_type(c.get('gtin')) if c.get('gtin') else 'BRAK KODU (D-37: listing własnej marki)',
                               CLASS_PL.get(c.get('evidence_class'), c.get('evidence_class')), comp_text(c),
                               EQ_PL.get(c.get('equivalence'), c.get('equivalence') or ''), offer,
                               ('tylko dla zarejestrowanych firm (B2B)' if TRADE_ONLY.search(str(c.get('channel') or ''))
                                else ('detaliczny' if c.get('channel') is None else str(c.get('channel')))),
                               c.get('moq') or '',
                               STOCK_PL.get(st.get('state', 'UNKNOWN'), ''), (st.get('checked_at_utc') or '')[:10],
                               st.get('basis') or '', c.get('owner_check') or '', c.get('equivalence_note') or '', c.get('checked_at_utc') or '',
                               recommendation(c), '', ''])
        without_yes = [ITEM_PL[code] for code in ITEMS_R
                       if not r or 'TAK' not in [recommendation(c) for c in ((r.get('items', {}).get(code) or {}).get('candidates') or [])[:2]]]
        row.append('TAK' if not without_yes else 'NIE — brakuje: ' + ', '.join(without_yes))
        matrix.append(row)
    v23rows = [['ISO', 'Kraj', 'Składnik', 'Marka', 'Produkt', 'Opakowanie', 'EAN', 'Oznaczenia v23',
                'Wysyłka do tego kraju', 'Cytat dostawy', 'Strona z polityką wysyłki', 'Link']]
    for iso in sorted(markets):
        for code in ('DEX', 'SMP', 'STB'):
            v = v23.get(iso, {}).get(code) or {}
            sh = (v23_ship.get(iso) or {}).get(code) or {}
            state = SHIP_PL.get(sh.get('state'), 'nie dotyczy (produkt z tego kraju)') if 'From abroad' in (v.get('tags') or []) else 'nie dotyczy (produkt z tego kraju)'
            v23rows.append([iso, markets[iso]['country'], ITEM_PL[code], v.get('brand_v23'), v.get('product_v23'), v.get('pack_v23'),
                            v.get('ean_v23'), ' '.join(v.get('tags') or []), state, (sh.get('quote') or '')[:300],
                            sh.get('policy_url') or '', ' '.join(l['url'] for l in (v.get('links') or []))])
    gaps_no_cand = sum(1 for iso in sorted(markets) for code in ITEMS_R
                       if not ((json.load(open(os.path.join(HERE, 'research', f'{iso}.json'))).get('items') or {}).get(code) or {}).get('candidates'))
    intro = [['GELLATTI — Starter Pack: lokalne odpowiedniki (przegląd do akceptacji)'],
             [f'Stan: {now}. Kraje z zakończonym researchem: {len(done)}/75.'],
             ['Jak decydować: w arkuszu 01_DO_DECYZJI wpisz TAK przy produkcie, który ma trafić do PDF danego kraju, albo NIE. Puste = bez decyzji.'],
             ['Kolumna ID (np. PL-FRU-1) nie zmienia się między wersjami arkusza — można się nią posługiwać zamiast numeru wiersza.'],
             ['Pięć rzeczy jest rozdzielonych, bo są niezależne: (1) Tożsamość i skład — czy to na pewno ten produkt i co ma na etykiecie; '
              '(2) Dopuszczalność zamiany — czy to ten sam rodzaj produktu, czy inny skład; (3) Oferta dla kraju — sklep krajowy albo zagraniczny '
              'z potwierdzoną wysyłką; (4) Stan magazynowy z datą — co sklep pokazywał w dniu sprawdzenia; (5) Decyzja Ownera.'],
             ['Brak towaru nie kasuje produktu: w PDF zostaje z informacją „sklep pokazał brak towaru <data>”, a jeżeli istnieje potwierdzony '
              'i dostępny zamiennik, to on jest pokazany jako pierwszy.'],
             ['Do PDF trafia tylko produkt z TAK. Kraj dostaje PDF dopiero, gdy każdy z 7 składników ma co najmniej jeden produkt.'],
             ['Rekomendacja to tylko podpowiedź: TAK = potwierdzony (lokalnie lub z wysyłką z zagranicy) i ten sam rodzaj produktu.'],
             ['Klasy: POTWIERDZONY LOKALNIE = dokładny EAN/listing na stronie sklepu lub producenta z tego kraju; POTWIERDZONY Z ZAGRANICY = sklep za granicą z potwierdzoną wysyłką do kraju; NIEPOTWIERDZONY = trop (np. marketplace, brak EAN na stronie).'],
             ['Dekstroza, mleko odtłuszczone i stabilizator pochodzą z Twojej tabeli v23 (arkusz 03_V23); stabilizator jest pokazany jako lokalna alternatywa dla mieszanki Gellatti.'],
             ['Procedura badań: reports/shop_starter_local/RESEARCH_PROTOCOL.md (reguły D-10, D-29…D-37). Dowody stron: ~/.cache/gellatti-evidence/verify.'],
             ['Uwaga: limit wyszukiwarki w sesji skończył się w trakcie badań; część BRAK w późniejszych krajach wynika z ograniczonego wyszukiwania (patrz „Uwagi” w 02_BRAKI), a nie z dowodu, że produktu nie ma.'],
             ['Typ identyfikatora sprawdzamy niezależnie (suma kontrolna GS1, kody wewnętrzne sklepów RCN, ISBN, kupony). Produkt z kodem, który nie jest poprawnym GTIN, nie dostaje rekomendacji TAK.'],
             ['Arkusz 03_V23 nie zmienia Twojego wyboru produktu. Kolumna „Wysyłka do tego kraju” rozlicza osobno samo oznaczenie „Z zagranicy”: '
              'POTWIERDZONA znaczy, że sklep wymienia ten kraj na własnej liście dostaw (cytat obok), NIEPOTWIERDZONA — że takiej listy nie udało się '
              'odczytać. W PDF pierwsze oznaczamy „Z zagranicy”, drugie „Sklep za granicą” bez obietnicy dostawy. Oznaczenie B2B zostaje B2B.'],
             [f'Liczniki braków (cztery nowe role, 75 krajów = 300 kombinacji): {gaps_no_cand} bez żadnego kandydata; '
              f'{sum(1 for iso in sorted(markets) for code in ITEMS_R for c in [((json.load(open(os.path.join(HERE, "research", f"{iso}.json"))).get("items") or {}).get(code) or {})] if c.get("candidates") and "TAK" not in [recommendation(x) for x in c["candidates"][:2]])} '
              'z kandydatem, ale bez rekomendacji TAK. Reszta ma co najmniej jedną rekomendację TAK — rekomendacja to nadal nie jest akceptacja.']]
    # ── the 525 matrix and the two decision packages (owner 2026-09-17, second round) ──
    import importlib.util as _il
    _spec = _il.spec_from_file_location('rm', os.path.join(HERE, 'readiness_matrix.py'))
    RM = _il.module_from_spec(_spec)
    _spec.loader.exec_module(RM)
    _, cells = RM.build()
    matrix525 = [['ISO', 'Kraj', 'Rola', 'Źródło', 'Produkt', 'Zakup dla kraju', 'Kanał', 'Stan towaru',
                  'Powiązanie techniczne', 'Decyzja Ownera', 'Rola zamknięta zakupowo', 'Wybrany produkt']]
    for c in cells:
        matrix525.append([c['iso'], markets[c['iso']]['country'], ITEM_PL.get(c['role'], c['role']), c['source'],
                          c['product'], c['purchase'], c['channel'], c['stock'], c['technical'], c['decision'],
                          'TAK' if c['closes'] else 'NIE', (c.get('name') or '')[:80]])
    still_open = [['ISO', 'Kraj', 'Rola', 'Dlaczego otwarte', 'Najlepszy kandydat', 'Co już sprawdzono',
                   'Uwaga badacza / co dalej']]
    for c in cells:
        if c['closes']:
            continue
        why = []
        if c['product'] == 'NONE':
            why.append('brak kandydata')
        elif c['product'] == 'PROPOSED':
            why.append('tożsamość produktu nieudowodniona')
        if c['purchase'] == 'CROSS_BORDER_UNCONFIRMED':
            why.append('sprzedawca nie deklaruje dostawy do tego kraju')
        if c['channel'] == 'BUSINESS_ONLY':
            why.append('kanał tylko dla firm')
        item = ({} if c['source'] == 'V23' else
                ((json.load(open(os.path.join(HERE, 'research', f'{c["iso"]}.json'))).get('items') or {}).get(c['role']) or {}))
        tried = '; '.join(item.get('sources_tried') or [])[:900]
        note = (item.get('notes') or '')[:600]
        if c['source'] == 'V23':
            sh = (v23_ship.get(c['iso']) or {}).get(c['role']) or {}
            tried = f"sprzedawca z tabeli v23: {sh.get('seller') or ''}; podstawa: {sh.get('basis') or ''}"[:900]
            note = 'produkt z v23 pozostaje bez zmian — brakuje wyłącznie ścieżki zakupu do tego kraju'
        still_open.append([c['iso'], markets[c['iso']]['country'], ITEM_PL.get(c['role'], c['role']),
                           ', '.join(why) or 'do przejrzenia', (c.get('name') or '')[:60], tried, note])
    clear = [['ID', 'ISO', 'Kraj', 'Składnik', 'Produkt', 'Dlaczego jednoznaczne', 'Decyzja Ownera (TAK/NIE)']]
    exceptions = [['ID', 'ISO', 'Kraj', 'Składnik', 'Produkt', 'Co trzeba rozstrzygnąć', 'Decyzja Ownera (TAK/NIE)']]
    technical = [['ID', 'ISO', 'Kraj', 'Składnik', 'Produkt', 'Tłuszcz / skład', 'Czego brakuje w aplikacji']]
    purchase = json.load(open(os.path.join(HERE, 'purchase.json'))) if os.path.exists(os.path.join(HERE, 'purchase.json')) else {}
    for iso in sorted(markets):
        r = json.load(open(os.path.join(HERE, 'research', f'{iso}.json')))
        for code in ITEMS_R:
            for c in ((r.get('items') or {}).get(code) or {}).get('candidates') or []:
                rid = f'{iso}-{code}-{c.get("rank")}'
                st = (stock.get(iso, {}).get(code, {}) or {}).get(c.get('url') or '', {})
                cls, eq = c.get('evidence_class'), c.get('equivalence')
                name = f'{c.get("brand") or ""} {c.get("product_name") or ""}'.strip()[:70]
                route = ((purchase.get(iso) or {}).get(code) or {}).get(c.get('url') or '', {}).get('state', 'UNKNOWN')
                identity_ok = bool(c.get('identifier_confirmed') or c.get('identity_basis') in
                                   ('FIRST_PARTY_OWN_BRAND_LISTING', 'GTIN_ON_LOCAL_PAGE', 'GTIN_ON_SOURCE_PLUS_ATTRIBUTE_MATCH'))
                if c.get('equivalence') == 'B_SAME_TYPE_DIFFERENT_COMPOSITION':
                    technical.append([rid, iso, markets[iso]['country'], ITEM_PL[code], name,
                                      comp_text(c) or '', 'brak profilu dla tego składu — aplikacja liczy ilości dla składu '
                                      'referencyjnego roli; zależność przekazana torowi Mapper/produktów '
                                      '(DEPENDENCY_HANDOVER_CREAM_POWDER_PROFILE.md)'])
                if (recommendation(c) == 'TAK' and st.get('state') != 'OUT_OF_STOCK'
                        and route == 'ONLINE_RETAIL' and identity_ok
                        and c.get('equivalence') == 'A_EQUIVALENT'):
                    why = ('produkt potwierdzony ' + ('w tym kraju' if not c.get('cross_border') else 'z zadeklarowaną dostawą do tego kraju')
                           + ', ten sam rodzaj produktu, kanał detaliczny'
                           + (', w sprzedaży w dniu sprawdzenia' if st.get('state') == 'IN_STOCK' else ''))
                    clear.append([rid, iso, markets[iso]['country'], ITEM_PL[code], name, why, ''])
                else:
                    q = []
                    if TRADE_ONLY.search(str(c.get('channel') or '')):
                        q.append('sklep sprzedaje tylko zarejestrowanym firmom — czy pokazać jako ofertę dodatkową?')
                    if eq == 'B_SAME_TYPE_DIFFERENT_COMPOSITION':
                        q.append('ten sam rodzaj produktu, ale inny skład — czy dopuszczasz go jako lokalną alternatywę?')
                    if cls == 'LEAD':
                        q.append('dowód niepełny (tożsamość, skład albo brak deklaracji dostawy do tego kraju)')
                    if st.get('state') == 'OUT_OF_STOCK':
                        q.append(f'sklep pokazywał brak towaru {(st.get("checked_at_utc") or "")[:10]}')
                    if c.get('gtin') and not id_type(c.get('gtin')).startswith('GTIN'):
                        q.append('kod na stronie nie jest poprawnym GTIN')
                    exceptions.append([rid, iso, markets[iso]['country'], ITEM_PL[code], name,
                                       '; '.join(q) or 'do przejrzenia', ''])
    import hashlib
    ids = [r[0] for r in clear[1:]]
    set_hash = hashlib.sha256('\n'.join(sorted(ids)).encode()).hexdigest()[:12]
    countries = len({i.split('-')[0] for i in ids})
    clear.insert(1, [f'ZESTAW {set_hash}', '', '', '', f'{len(ids)} produktów w {countries} krajach',
                     'Jeden zestaw do jednego zatwierdzenia. Każdy wiersz: produkt potwierdzony, kanał detaliczny, '
                     'realna droga zakupu, dostawa lokalna albo zadeklarowana, ten sam rodzaj i skład co referencja roli, '
                     'towar dostępny w dniu sprawdzenia. Wyjątki są w 07_WYJATKI, braki techniczne w 09_BRAKI_TECHNICZNE.', ''])
    intro.append([f'Zestaw do jednego zatwierdzenia (arkusz 06_REKOMENDACJE): wersja {set_hash}, {len(ids)} produktów, '
                  f'{countries} krajów. Wersja zmienia się przy każdej zmianie składu zestawu.'])
    sheets = [('00_INSTRUKCJA', intro, [140], False), ('01_DO_DECYZJI', decide, [12, 5, 14, 18, 6, 16, 34, 12, 15, 40, 18, 18, 22, 34, 20, 30, 22, 16, 14, 11, 40, 40, 30, 17, 22, 16, 24], True),
              ('02_BRAKI', gaps, [5, 14, 18, 16, 30, 60, 40], True), ('03_V23', v23rows, [5, 14, 22, 16, 36, 16, 15, 14, 34, 60, 40, 50], True),
              ('04_MACIERZ', matrix, [5, 16, 12, 12, 14, 22, 22, 22, 22, 40], True),
              ('05_MACIERZ_525', matrix525, [5, 16, 22, 8, 12, 26, 14, 14, 22, 20, 12, 40], True),
              ('06_REKOMENDACJE', clear, [12, 5, 16, 20, 46, 60, 22], True),
              ('07_WYJATKI', exceptions, [12, 5, 16, 20, 46, 70, 22], True),
              ('08_OTWARTE', still_open, [5, 16, 22, 26, 30, 70, 60], True),
              ('09_BRAKI_TECHNICZNE', technical, [12, 5, 16, 20, 44, 40, 70], True)]
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    write_xlsx(out_path, sheets)
    return len(done), len(decide) - 1, len(gaps) - 1


def import_decisions(path):
    from xlsx_min import X
    x = X(path)
    name_to_code = {v: k for k, v in ITEM_PL.items()}
    acc = {}
    rows = x.rows('01_DO_DECYZJI')
    hdr = rows[0]
    idx = {v: k for k, v in hdr.items()}
    for r in rows[1:]:
        decision = (r.get(idx['Decyzja Ownera (TAK/NIE)']) or '').strip().upper()
        if decision not in ('TAK', 'NIE'):
            continue
        if 'ID' in idx and r.get(idx['ID']):
            iso, code, rank = str(r[idx['ID']]).split('-')
            rank = int(rank)
        else:
            iso, code, rank = r.get(idx['ISO']), name_to_code.get(r.get(idx['Składnik'])), int(float(r.get(idx['Wybór'])))
        entry = acc.setdefault(iso, {}).setdefault(code, {'decision': 'ACCEPT', 'accepted_ranks': [], 'rejected_ranks': []})
        (entry['accepted_ranks'] if decision == 'TAK' else entry['rejected_ranks']).append(rank)
    for iso in acc:
        for code, e in acc[iso].items():
            if not e['accepted_ranks']:
                e['decision'] = 'REJECT'
    json.dump(acc, open(os.path.join(HERE, 'acceptance.json'), 'w'), ensure_ascii=False, indent=1)
    return acc


def accept_recommended(owner_said):
    """Only after the owner accepted ALL rows recommended TAK in chat: every rank-1/2 candidate whose recommendation is TAK
    becomes accepted; nothing else is. The owner's words are stored verbatim with the decision."""
    markets = json.load(open(os.path.join(HERE, 'markets75.json')))
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    acc = {}
    for iso in sorted(markets):
        r = json.load(open(os.path.join(HERE, 'research', f'{iso}.json')))
        for code in ITEMS_R:
            ranks = [c.get('rank') for c in ((r.get('items', {}).get(code) or {}).get('candidates') or [])[:2] if recommendation(c) == 'TAK']
            if ranks:
                acc.setdefault(iso, {})[code] = {'decision': 'ACCEPT', 'accepted_ranks': ranks, 'rejected_ranks': [],
                                                 'basis': 'OWNER_ACCEPTED_ALL_TAK_RECOMMENDATIONS', 'owner_said': owner_said, 'recorded_utc': stamp}
    json.dump(acc, open(os.path.join(HERE, 'acceptance.json'), 'w'), ensure_ascii=False, indent=1)
    return acc


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--import', dest='import_path')
    ap.add_argument('--accept-recommended', dest='owner_said', help="the owner's chat words accepting every TAK recommendation, verbatim")
    a = ap.parse_args()
    if a.owner_said:
        acc = accept_recommended(a.owner_said)
        print(f'acceptance.json: {sum(len(v) for v in acc.values())} accepted items in {len(acc)} markets')
    elif a.import_path:
        acc = import_decisions(a.import_path)
        print(f'acceptance.json: {sum(len(v) for v in acc.values())} decisions in {len(acc)} markets')
    else:
        out = os.path.join(HERE, 'review', 'GELLATTI_STARTER_PACK_LOKALNE_ODPOWIEDNIKI_REVIEW.xlsx')
        done, cands, gaps = build(out)
        print(f'{out}: markets done {done}/75, candidates {cands}, gaps {gaps}')
