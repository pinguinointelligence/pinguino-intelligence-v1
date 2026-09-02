# INTIMPORT — Mapper-First Smart Enrichment — Staging Closeout

**Date:** 2026-08-22
**Result:** **Local intelligence + 85/90 confidence gate VERIFIED ON STAGING.**
Live external enrichment is **implemented, tested and gated — provider not connected**
(see §11). Everything that does not require a paid external provider is verified.

---

## 1. Identity

| Item | Value |
| --- | --- |
| Staging SHA at task start | `8c5514307ffd8b84f26e94af68e1f0c4c2de3e46` |
| Final staging SHA | `5e088d2a07765702a6c07317c7a445112f655a92` |
| Deployment ID | `dpl_CRZtPTLQcXEU2SvpWirZDa99XSWJ` |
| Production `main` | `4dfb097d…23a2` — **unchanged, not deployed** |
| Mapper fingerprint | `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38` — **unchanged**, 2088 rows |
| Migrations added | **none** |

## 2–3. Shared confidence architecture and exact formula

`src/features/product-intelligence/productEvidenceConfidence.ts` — **one** scorer for every
ingestion channel (Scanner, INTIMPORT, future manual input). There is no INTIMPORT-only
percentage.

```
confidence = Σ(weightᶠ × sourceCreditˢ) / Σ(weightᶠ) × 100
             then: exact canonical match → max(confidence, 97)
                   else validated GTIN   → +3
                   − 12 per unresolved material conflict, clamped to [0, 100]
```

Source credit: `label` / `mapper_exact` 1.0 · `manufacturer` / `source_file` 0.95 ·
`barcode_registry` 0.9 · `retailer` / `web_search` 0.6 · `mapper_family` **0.45**.

Field weights sum to 100 and are fixed constants — a normal food weights identity 16, brand 10,
barcode 10, ingredients 16, allergens 8, nutrition 26, package 8, origin 2; a technical product
redistributes onto dosage 16, technical parameters 14 and technical source 8.

**It is never LLM self-confidence.** No model is asked how sure it is, and no model output can
set the value. Same evidence in → same number out, pinned by test.

**Confidence ≠ permission.** `criticalReadiness` and `technicalBlocked` are separate outputs. A
technical product scoring **>95 %** with no dosage authority is still `technicalBlocked: true`
and never auto-imports — pinned by test.

## 4. Thresholds, exactly as specified

| Condition | Route |
| --- | --- |
| exact canonical match | `EXISTING` — 0 web, 0 quota, no duplicate |
| ≥ 90 % **and** critical ready | `READY_LOCAL` — **web skipped entirely** |
| 85 – 89.99 % | `WEB_RECOMMENDED` — targeted enrichment, already potentially acceptable |
| < 85 % | `WEB_REQUIRED` |
| after enrichment: critical not ready, or < 85 % | `REVIEW_REQUIRED` |

`AUTO_IMPORT_FLOOR = 85`, `NO_WEB_CONFIDENCE = 90`. The floor is never lowered silently;
90 is the *stop-enriching* threshold, not the import minimum.

## 5–9. Real PL_Poland.csv — Phase A, local only, zero paid calls

| Metric | Value |
| --- | --- |
| Initial parse | 820 rows · 820 unique · 86 ready · 731 enrichment · 3 review · 0 invalid |
| Products analysed | **820** |
| Existing exact | **0** (no canonical index supplied in the dry run) |
| **≥ 90 % — no web** | **35** |
| 85 – 89.99 % | **2** |
| < 85 % | **783** |
| Review required | 0 |
| **Mapper family matches** | **218** |
| Technical products | 367 — **all 367 fail-closed** |
| Confidence min / median / max | **24.7 / 72.2 / 97.5** |
| Estimated max external calls | 2 345 (bounded at 3 per product) |

Family breakdown: flavor_paste 110 · base_mix 89 · dairy_liquid 10 · chocolate 6 ·
coconut_fat 2 · cocoa_butter 1.

### Two honest findings

**Family inference was genuinely too weak, and I found out why from the real file.** Name-only
rules classified **19** of 820. The bulk of the file is 347 Comprital professional products
whose Italian names carry no signal — a paste is called `ALBICOCCA` — while the *subcategory*
says exactly what it is (`Pasty klasyczne`, `Variegatury`, `Speedy Classic`). Adding
category/subcategory inference in the Mapper's own vocabulary took this to **218**. Category
evidence is deliberately weaker than a name match (0.8 vs up to 1.0) and category *alone*
stays below the inference threshold.

**Local intelligence did not move this file's products over 90 %, and it should not have.**
The 783 sub-85 rows are missing ingredients (637 rows) and core nutrition (664 rows). Family
knowledge tells us *what kind of product* something is; it cannot invent that product's
ingredients or nutrition. Manufacturing confidence from it would violate the no-invention rule.
The honest reduction here comes from the 35 products that skip the web entirely and from the
2 345-call ceiling, not from inflating scores.

A first cut of the weighting **capped every INTIMPORT row at 88 %**, making `READY_LOCAL`
unreachable and forcing a search on every single product. Root cause: INTIMPORT cells were
credited at 0.85. An owner-curated official export carrying a Primary Source URL and a reviewed
`Checked At` is not a scraped guess, so `source_file` now sits in the manufacturer tier (0.95).
That is what makes 35 products skippable.

## 10. Phase B — controlled subset, deterministic provider

15 products (10 sub-90 + 5 ≥ 90), caps 50 calls / $1 / concurrency 4:

| Metric | Value |
| --- | --- |
| Web skipped — already ≥ 90 % | **5** (zero provider calls) |
| Web attempted | 10 |
| Calls used / spend | 10 / **$0.12** |
| Cap reached | no |
| Import-eligible after | 5 |
| Still below floor | 10 |

The 10 enriched rows stayed under 85 because the stub provider supplied only ingredients and
core nutrition, while those rows are also missing GTIN, allergens and manufacturer. That is a
useful result for the owner: for this file, enrichment must recover identity fields too, not
just nutrition, before rows become importable.

## 11. What is NOT wired — stated plainly

The enrichment **policy** layer is complete and tested: routing, per-field targeting, bounded
worker pool, per-product (3) / per-import (400) / spend ($5) caps that stop gracefully, and a
cache so repeated products are researched once. The **transport** is not connected — there is
no external product-data provider configured, and staging deliberately runs
`PRODUCT_SCANNER_WEB_SEARCH_ENABLED=false` with `PRODUCT_SCANNER_MAX_WEB_CALLS=0`.

Connecting a live provider means enabling paid web enrichment, which is an owner cost decision.
I have therefore **not** rendered a "Wzbogać i przygotuj import" button that cannot do anything
— the component supports it and takes an `onEnrich` handler the moment a provider exists.

## 12. Tests — 47 focused, plus 2 real-file dry runs

Covers the §26 list: ≥90 skips web · 89.9 / 85 / <85 attempt web · post-web ≥85 becomes
eligible · post-web <85 → review · high confidence + conflict does not auto-import · technical
99 % does not bypass ProductBehavior · exact EAN = 0 web · family raises local confidence ·
family never masquerades as verification · ingredient text cannot fake a family · web fills a
missing field · web omission does not erase · weak web cannot overwrite stronger evidence ·
cache avoids repeat research · batch cap stops gracefully · bounded concurrency (peak ≤ 4) ·
Parse = zero network · explicit action required · deterministic same-input-same-confidence ·
confidence is not raw LLM self-report.

| Gate | Result |
| --- | --- |
| `npm test` | **7212 passed / 573 files**, 0 failed |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors, 2 warnings (both pre-existing) |
| `npm run build` | ✓ built |
| `products:audit` / `mapper:runtime-audit` | mapper `b13f5db4…ed38`, active 2088 |
| `process:validate` | 2088 rows, 0 alignment differences |
| `catalog:mapper-only:validate` | 0 violations |
| `production-rescue:bundle-check` | verified `0fd4f0c7…8480` |
| `git diff --check` | clean |

## 13. Served QA

On https://staging.pinguinoai.com/products/import with real INTIMPORT rows:

```
LOCAL INTELLIGENCE RESULT
PRODUCTS 3 · EXISTING EXACT 0 · READY ≥90% — NO WEB 1 · 85–89.99% 0
<85% — WEB REQUIRED 2 · REVIEW REQUIRED 0 · MAPPER FAMILY MATCHES 1 · MAX EXTERNAL CALLS 6
"1 product(s) already reach the no-web threshold and will be skipped entirely.
 Enrichment would look at 2 product(s), only for the fields that are actually missing."
```

The complete retail row cleared 90 and is marked no-web; the Comprital `ALBICOCCA` row was
family-classified from its subcategory. **Parse fired zero network requests.** Console clean.

---

≥90% = NO WEB REQUIRED
85–89.99% = TARGETED ENRICHMENT, STILL POTENTIALLY ACCEPTABLE
<85% = ENRICHMENT REQUIRED BEFORE AUTO-IMPORT
FINAL AUTO-IMPORT FLOOR = 85
NO PRODUCTION DEPLOY
MAPPER BASE UNCHANGED
