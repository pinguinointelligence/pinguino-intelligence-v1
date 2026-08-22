# INTIMPORT — Staging Closeout

**Date:** 2026-08-22
**Result:** **A. INTIMPORT VERIFIED ON STAGING**

---

## 1. Git / deployment identity

| Item | Value |
| --- | --- |
| `origin/staging` at phase start | `55656336f5c22f026bc6613115395dd4a162b36a` |
| Worktree | `pinguino-intelligence-v1-intimport` (fresh, from that head) |
| Branch | `claude/intimport-v1` |
| New `origin/staging` | `54b2adc4483dfb99487c3bee4c670dc236b70af4` |
| Deployment ID | `dpl_CqNYBFjaf39zVv177eXdGChRuFbN` — `READY`, SHA `54b2adc` |
| Served URL | https://staging.pinguinoai.com/products/import |
| `origin/main` (production) | `4dfb097d…23a2` — **unchanged, not deployed** |
| Mapper fingerprint | `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38` — **unchanged**, 2088 rows |
| DB migrations added | **none** |

## 2. What was built

INTIMPORT is a fourth source on the **existing** bulk importer screen (CATALOG SOURCE →
PASTE OR UPLOAD CSV → PARSE PREVIEW → IMPORT RESULT). No new page. Generic / Mercadona /
Colin are untouched. Selecting INTIMPORT routes to a dedicated deterministic parser,
`parseINTIMPORT()` in [intimport.ts](src/data/products/intimport.ts) — one owner-controlled
contract, deliberately not a universal AI spreadsheet parser.

`source_type` keeps the existing `catalog_import` value (its DB CHECK constraint allows no
new value) and the format is identified by `catalog_source = 'INTIMPORT'`. That is why this
phase needed **no migration**.

## 3. Contract and parsing

All **36** official column names are the contract, in official order. Header validation is
exact: a conforming file yields **zero** `unknown column ignored` warnings, and a
non-conforming header is reported as missing/unexpected columns rather than guessed at.

CSV decoding reuses the existing pure `parseCsv`: UTF-8, UTF-8 BOM, CRLF/LF, quoted commas,
quoted newlines, escaped quotes and international text. No `split(",")` anywhere.

**Missing values.** `not_found`, `not_applicable`, blank, `null`, `N/A`, `n/a`, `unknown`,
`none`, `-`, `—` all mean UNKNOWN. They are **not** numeric parser errors and produce no
warning. A real `0` stays numeric zero. A missing field is simply absent from the insert, so
it can never null out stronger evidence downstream.

**EAN / GTIN** stays a STRING with leading zeros intact, validated through the existing
barcode checksum authority (`validateBarcode`). A checksum-invalid code is **kept** on the
record but never used as identity.

**Field retention.** All 36 official fields are preserved as source evidence under
`extracted_json.intimport`, including Professional Dosage, Technical Parameters, Technical
PDF URL, Product Status, Checked At and Notes — fields the product model has no column for.
Nothing is discarded because the picker UI cannot show it.

**Product name.** A row is validly named when **either** `Product Name Original` **or**
`Product Name English` is present. Original is preferred for display, English is a genuine
fallback. All 820 real rows produce a name — zero false "missing product name".

**Source category.** `Stabilizers & emulsifiers` and every other source category is preserved
as `sourceCategory` / `sourceSubcategory`. An unmapped category is a **review signal, never
data destruction**, and never grants technical safety authority.

### Correctness point found in the real data

The owner's file mixes nutrition bases: `100 g`, `W 100 g`, `per 100 g`, **and** `100 ml` /
`W 100 ml` (25 rows). The product model's `*_percent` fields are defined **per 100 g**.
Mapping a per-100 ml declaration into them would require a density the file does not carry,
so those values are **not** mapped — they are retained as source evidence and the row is
flagged `nutrition declared per 100 ml — needs density before it can be used per 100 g`.
Inventing a conversion would have produced silently wrong composition.

## 4. Deduplication

Two levels, in strength order:

1. **Canonical GTIN-14 key** — every code is left-padded to 14 digits before comparison, so
   `049000028911` (UPC-A) and `0049000028911` (EAN-13) are recognized as **one** product.
   (This was a real bug in the first cut: the equivalence was applied to the canonical
   existing-product lookup but not to in-file dedupe. A test caught it.)
2. **Source Product ID** repeating — the same source record twice.
3. **Deterministic identity key** (brand + name + variant + quantity + unit) when there is no
   barcode.

**Ambiguity is never fuzzy-merged.** Matching brand/name/size with *different* source Product
IDs and *no* GTIN cannot prove sameness — those rows become `REVIEW_REQUIRED`, not
`DUPLICATE`. This mattered on the real file: three Comprital pairs (LIMONE 1.25 kg,
NOCCIOLA 1.25 kg, WHISKY 3 kg) share a name and size but carry distinct supplier Product IDs
and no GTIN. Calling them duplicates would have silently dropped three possibly-distinct
products; they are now surfaced for a human decision.

Comparison against canonical Gellatti products (Mapper identity / Live Overlay / imported
products) runs through an injected index, so the parser stays pure and the same canonical
identity the Scanner feeds is the one INTIMPORT feeds. There is no INTIMPORT-only product
database.

## 5. Parse is cheap (§2.10) — proven at runtime

Clicking **Parse CSV** on staging with real INTIMPORT rows produced **zero network
requests** — no OpenAI, no Edge Function, no enrichment, no Supabase call of any kind. The
parser is pure by construction: it imports no client, no service and no network module, so a
paid call on this path is impossible, not merely avoided.

## 6. Safety (§2.13)

Source `Product Status` is metadata only. A row marked `complete` in the file with thin
evidence still lands in `ENRICHMENT_REQUIRED` — the source's own status cannot promote a
product. Import bypasses no ProductBehavior, dosage-safety or high-risk rule; a technical
product without dosage evidence parses its identity/evidence but does not reach the writer as
a clean row.

## 7. Real PL_Poland.csv dry run (§2.19)

Deterministic, no paid enrichment, run against the owner's actual file on the Desktop
(read-only; the CSV was never modified). Repeatable via
[intimportRealFile.dryrun.test.ts](src/data/products/__dryrun__/intimportRealFile.dryrun.test.ts),
which skips cleanly where the file is absent.

| Metric | Actual |
| --- | --- |
| Header | all 36 official columns recognized; **0** missing, **0** unexpected |
| Rows | **820** |
| Countries | PL |
| Unique products | 820 |
| Internal duplicates | **0** |
| Existing (Mapper / Overlay) | 0 — no canonical index was supplied for the dry run |
| Ready | **86** |
| Enrichment required | **731** |
| Review required | **3** |
| Invalid | **0** |
| Rows with a checksum-valid GTIN | 57 of 57 present codes |
| Nutrition basis | 145 per-100 g · 25 per-100 ml · 650 absent |

Why rows are not ready (aggregated, real counts): 664 missing core nutrition, 637 missing
ingredients, 23 per-100 ml basis, 3 ambiguous-identity. Category warnings: 714 rows carry a
source category with no exact dataset mapping — a review signal that destroys no data.

These are measured, not expected, numbers.

## 8. Preview summary (§2.14)

The INTIMPORT preview shows Format, Country, header status and the eight state counts, then
aggregates repeated messages as `message · ×N`. The 714 category warnings render as **three**
lines, not 714. Rows needing a human decision are listed individually because there are few
of them by design.

## 9. Tests and gates

`src/data/products/intimport.test.ts` — **46 tests**, covering the §2.18 list: exact 36
headers, source selection, UTF-8/BOM, quoted comma, quoted newline, Unicode, name
original/English fallback, EAN as string, leading-zero GTIN, checksum-invalid handling, all
nutrition fields, ingredients, allergens, dosage, technical parameters, URLs, Checked At,
Notes, `not_found` → null, blank → null, zero stays zero, source-category mismatch preserved,
internal duplicate, GTIN-form equivalence, ambiguous non-merge, canonical/overlay duplicate,
no duplicate creation, technical fail-closed, missing data not erasing stronger evidence, and
the shared intake channel.

| Gate | Result |
| --- | --- |
| `npm test` | **7081 passed / 566 files**, 0 failed |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors (2 pre-existing warnings) |
| `npm run build` | ✓ built |
| `npm run products:audit` | mapper `b13f5db4…ed38` |
| `npm run mapper:runtime-audit` | active 2088, searchable 2088 |
| `npm run process:validate` | 2088 rows, 0 alignment differences |
| `npm run catalog:mapper-only:validate` | 0 violations |
| `npm run production-rescue:bundle-check` | verified `0fd4f0c7…8480` |
| `git diff --check` | clean |

## 10. Served QA (https://staging.pinguinoai.com/products/import)

- **INTIMPORT** visible as a fourth source alongside Generic / Mercadona / Colin.
- Paste accepted; file chooser present.
- **Parse CSV** on real owner rows → `FORMAT: INTIMPORT`, `Country: PL`,
  **"All 36 official columns recognized"**, ROWS 3 · UNIQUE 3 · EXISTING 0 · DUPLICATES 0 ·
  READY 1 · NEED ENRICHMENT 2 · NEED REVIEW 0 · INVALID 0.
- No warning spam — repeats aggregated with `×N`.
- **Zero** network requests during parse.
- Console clean.
- Mapper untouched (parse performs no write of any kind).

## 11. Outstanding item

**OWNER AUTHENTICATED SMOKE PENDING.**

The **Import products** action is auth-gated (the products write is owner-scoped), so the
small controlled write-verification subset of §2.16 needs the owner's signed-in session. No
credentials were entered and no session was fabricated. The entire deterministic path —
parse, normalization, identity, dedupe, classification and the writer projection — is
verified above, including the guarantee that EXISTING, DUPLICATE, INVALID and REVIEW_REQUIRED
rows never reach the writer.

The full 820-row file was **dry-run only**; nothing was written to staging, per §2.16.

### What the owner should click

1. Sign in → **/products/import** → select **INTIMPORT**.
2. Choose `~/Desktop/PL_Poland.csv` → **Parse CSV**. Expect Rows **820**, all 36 columns
   recognized, 86 ready / 731 enrichment / 3 review / 0 invalid / 0 duplicates.
3. To verify writes, parse a **small** hand-trimmed subset first and press **Import
   products**; re-parsing the same subset afterwards should report those rows as EXISTING
   with no duplicate created.
