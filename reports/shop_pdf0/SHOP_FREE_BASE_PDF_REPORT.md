# GELLATTI SHOP — free 75-country gelato base PDF

Built 2026-09-12 from the owner's FINAL base workbook. It waits for owner review: it is not deployed and not placed in the Shop.

## Return

| Item | Result |
|---|---|
| countries included | **75 / 75** |
| base roles included | **6 / 6** (milk, cream, skim milk powder, sugar, dextrose, tara gum) |
| source authority: v23 FINAL | **YES**, `GELLATTI_BAZA_GELATO_75_KRAJOW_v23_SYNC_FINAL.xlsx`, sha256 `37afaf6f…82de16b4` |
| Recipe Library work duplicated | **NO**: no recipe ingredients, routing, BRAK, PR-ING or formulas |
| PDF completed | **YES** |
| mobile readability | **PASS** |
| desktop readability | **PASS** |
| source/data validation | **PASS**: 13 / 13 checks |
| 0 € Shop product copy completed | **YES** (EN + PL): `SHOP_PRODUCT_COPY.md` |
| final PDF filename | `GELLATTI_GELATO_BASE_GUIDE_75_COUNTRIES_v1.pdf` |
| genuine blocker | **none** for the PDF |

## The PDF

`GELLATTI_GELATO_BASE_GUIDE_75_COUNTRIES_v1.pdf`
- 82 pages, 120 × 210 mm, 2.9 MB.
- sha256 `e84ebd582bd4539c8e67eb097cfc83e42279c4f199e594564aac3c9f862c6537`.
- Tagged PDF, with bookmarks.

| Pages | Content |
|---|---|
| 1 | Cover: 75 countries, free guide, 0 € |
| 2 | How to use this guide (3 steps, the two tags, a pointer to the app) |
| 3 | The six base ingredients: what each one does and what to check when you buy it |
| 4–5 | Find your country: A–Z index; every name and page number links to the country page |
| 6–80 | One page per country, A–Z, with the same six-ingredient structure on every page |
| 81 | Good to know: tags, the United States tara note, fat content, labels, scope, sources |
| 82 | Gellatti call to action: gellatti.com, gellatti.com/shop |

**Navigation:**
- 150 index links (country name and page number).
- 75 "All countries" back links.
- 80 bookmarks: 5 sections and 75 countries.

**Each country page shows:**
- the exact product name, brand, pack size and fat % (milk, cream, SMP) or form (dextrose);
- the barcode (EAN/UPC) where v23 has one, otherwise the shop/manufacturer code from v23;
- up to two links to listing pages from v23's own sources, 638 links in total.

**Visual language:**
- white-first, graphite ink, warm neutrals;
- accent #F0C44C only, with no retired orange;
- Manrope, with IBM Plex Mono for barcodes and page numbers.

## How the source was used (presentation only)

- **Sheets.** Every product field comes from sheet `04_POKRYCIE_PR` (75 × 6 = 450 rows), checked against the role sheets
  `11_MLEKO_75`, `14_SMIETANKA_75`, `17_PROSZEK_75`, `20_DEKSTROZA_75` and `23_TARA_75`. Product, pack and EAN are
  identical in both: 0 differences.
- **Translation.**
  - Polish pack wording is translated through a fixed table (sizes and counts unchanged).
  - The v23 sugar rule ("Biały cukier krystaliczny — 100% cukier", any pack, the label lists only sugar) and the tara
    process note ("heat the base to 75–80 °C") are translated literally.
  - Any v23 text missing from the tables stops the build instead of being guessed.
- **Tags come only from v23's own statements.**
  - "From abroad" (a cross-border channel recorded in v23) appears on tara in 72 countries (`Kanał oferty` = IMPORT),
    dextrose in 49 and SMP in 14. Products imported but sold by a local shop get no tag.
  - "B2B" appears only on tara in the United States: TIC Pretested® Tara Gum 100, PIN 38930903, Essex item 1191099.
- **Regulatory wording.** United States tara is described only as "self-affirmed GRAS in the supplier's documentation —
  not an FDA approval". No stock, shipping or regulatory status is claimed anywhere.
- **Scope statement.** The guide says it covers the six base ingredients in 75 countries and "does not list every
  ingredient used in Gellatti recipes".
- **Unchanged v23 decisions.**
  - No product, brand, pack, EAN, link or country mapping was changed or added.
  - The United States tara decision (Ingredion B2B), Algeria's Président 30% 2 × 25 cl cream and the SaporePuro tara
    choices are shown exactly as v23 has them.

## Validation (`validate_guide.py` → `VALIDATION.md`, `validation_report.json`)

The validator does not use the builder's code. It re-reads v23 with `reports/a03/tooling/xlsx_min.py` and reads the PDF
back with poppler (`pdftotext`, `-bbox-layout`, `pdftohtml -xml`).

| # | Brief check | Result | How |
|---|---|---|---|
| 1 | all 75 countries | PASS | 75 country bookmarks = the 75 v23 countries; pages 6–80 |
| 2 | six roles per country | PASS | the six role labels, in order, in the left column of all 75 pages |
| 3 | country → product = v23 | PASS | name, brand, barcode and fat % for 375 products; the sugar rule for 75 |
| 4 | no invented product | PASS | every 6–14-digit number on a page comes from that country's v23 rows; no other country's product appears |
| 5 | no substitution | PASS | same evidence as 3 |
| 6 | no missing country | PASS | 0 missing |
| 7 | no duplicate or misassigned country | PASS | unique pages and titles; all 150 index links land on the right page |
| 8 | no broken page or table layout | PASS | 82 pages; the builder's measurement shows 0 overflowing pages; the PDF's word boxes show 0 outside margins |
| 9 | no text overflow | PASS | the same two measurements |
| 10 | clickable navigation | PASS | index, back links, US→notes link; 638 external links, all in v23's sources |
| 11 | desktop and phone renders | PASS | renders at 390 px phone width and 1600 px desktop height |
| 12 | no old orange | PASS | 0 uses of #F58A07; 156 uses of #F0C44C |
| 13 | claims inside the v23 scope | PASS | no forbidden claims; the scope and "not an FDA approval" wording are present |

**Readability** (page fitted to a 390 px phone width = 1.147 px per pt):

| Text | Phone | Desktop (1,000 px page height) |
|---|---|---|
| country names | 21.8 px | — |
| product names | 12.2 px | about 18 px |
| details and links | 9.6 / 9.1 px | about 14 px |
| barcodes | 8.9 px | — |
| upper-case labels and tags | 6.8–7.6 px | — |

The in-app browser pane shows PDFs outside the project only as blank snapshots. The desktop result therefore comes from
the poppler renders, not from a desktop PDF viewer.

**Defects found and fixed during validation:**
- **Text lost at the right edge.** Long unbreakable pack texts widened the grid column, so text past the right edge was
  dropped from the PDF (for example "31% fat" in Colombia). Fixed with a fixed-width column, and the layout check now
  also measures against the page's content box.
- **Hebrew order in Israel.** The Hebrew brand was reordered next to the pack size. Fixed by isolating right-to-left runs.

## Owner decisions (not blockers)

1. **Local sugar names.** The sugar row repeats v23's generic rule in English. The 28 owner-approved local sugar names
   (earlier SHOP decision, e.g. JP グラニュー糖) are not in v23, so they were not added.
2. **Shop listing.** The copy is ready. The Shop's product contract has only `single` / `bundle`, so a downloadable file
   needs a Shop decision:
   - a new kind, or a separate free-download block;
   - where the file is hosted;
   - whether sign-in is required.

   The details are in `SHOP_PRODUCT_COPY.md`.
3. **Language.** The PDF is in English. The Polish Shop copy says so.

## Files (`reports/shop_pdf0/`)

- **Owner review:** `GELLATTI_GELATO_BASE_GUIDE_75_COUNTRIES_v1.pdf`, `cover_thumb_4x5.png`, `cover_square_1080.png`,
  `SHOP_PRODUCT_COPY.md`.
- **Evidence:**
  - `guide_dataset.json` / `.csv`: every shown field, with its v23 row numbers and raw v23 values;
  - `VALIDATION.md` and `validation_report.json`;
  - `layout_report.json`.
- **Tooling** (research tooling, not app code):
  - `build_guide.py` builds the guide;
  - `validate_guide.py` validates it;
  - `build_thumbs.py` renders the Shop images.

  `build/` holds the HTML, fonts and renders; it is not in git.

## Side task — Shop placeholder picture (owner, 2026-09-12)

The 7 singles ("Kup osobno") show the owner's pouch photo.
- **Done:** branch `claude/shop-single-placeholder` (from staging, worktree `~/Developer/pinguino-shop-placeholder`)
  changes 4 Shop files. The focused Shop tests pass (46/46). Nothing is committed.
- **Waiting for the owner:** the photo as a file, and permission to copy a staging `.env.local` so the Shop can be
  screenshotted locally.

---
APPLICATION CODE CHANGED: NO (this workstream; the placeholder branch above is uncommitted) · MAPPER/ENGINE/SCANNER CHANGED: NO ·
DATABASE/STAGING/PRODUCTION CHANGED: NO · MERGED: NO · OWNER ACCEPTED: NO
