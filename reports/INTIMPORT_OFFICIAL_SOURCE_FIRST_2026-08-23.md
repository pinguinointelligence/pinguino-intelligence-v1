# INTIMPORT — Official-Source-First Enrichment — Staging

**Date:** 2026-08-23
**Result:** **A. INTIMPORT OFFICIAL-SOURCE-FIRST ENRICHMENT VERIFIED**

Paid validation: **3 products / 5 real searches** — under the 6 hard cap.

---

## 1–2. Identity

| Item | Value |
| --- | --- |
| Starting SHA | `f588f765fb40aaa247ff17734d3070de644873ca` |
| Final SHA | `2990e33d610a632f851481d0ce48a60c36a1d907` (+ this ledger) |
| Edge Function | `intimport-enrich` redeployed, staging Supabase only |
| Production `main` | `4dfb097d…23a2` — untouched, not deployed |
| Mapper | `b13f5db4…ed38`, 2088 rows — unchanged |

Two other sessions landed Vegan v2 and Protein v2 on staging mid-task; I rebased onto their
work twice rather than force-pushing. Nothing of theirs was lost.

## 3. Root cause of zero manufacturer results

Three planning failures, none of them the model's fault:

1. **The owner's `Primary Source URL` was passed inside an identity blob with no instruction
   to consult it.** It read as trivia, not evidence.
2. **`Technical PDF URL` was never sent to the provider at all.** 367 Comprital rows carry one;
   not one of them reached the request.
3. **The only tool offered was an unrestricted `web_search`** — the wrong primitive for "read
   this known page". Search rankings favour aggregators, and aggregators are what came back
   (`foodfactor.net`, `cukieteria.pl`, `dietonator.pl`).

## 4–5. Implementation

`researchPlan.ts` builds a deterministic source order per §4 — supplied official URL →
supplied technical PDF → official-domain search → exact GTIN lookup → retailer → open web
last — and the Edge function applies the chosen step as a **hard `allowed_domains` filter**,
so a retailer or SEO page cannot win on ranking when an official source exists. When the step
names a URL the model is told to **open that exact document first**.

An official domain is only ever established from a real URL already in the row, judged by the
existing classifier against the declared brand/manufacturer. It is **never guessed from a
company name** — asserted by test.

## 6. Comprital audit (367 rows)

| Metric | Value |
| --- | --- |
| Total Comprital rows | **367** |
| With an official source | **367** |
| With a technical PDF | **367** |
| Dosage already present | **367** (missing: 0 — never re-bought) |
| Ingredients missing | 367 |
| Nutrition missing | 367 |
| ProductBehavior authority missing | **367** — all fail-closed |
| **Research starts at official source** | **367** |
| **Research starts at retailer/open web** | **0** |

## 7–8. Offline proofs, before any spend

**Cache identity (§9):** the key is `stableJson({ identity, fields })` — no `importId`,
verified against the real `stableJson` the server hashes, with field order irrelevant and a
different product still yielding a different key. The lookup does not filter by import.

**Call caps (§10):** both the Edge function and the client pipeline now **reserve the observed
worst case (3 searches) before admitting a job**, rather than detecting an overshoot after it.
Tests prove: a response invoking 3 searches counts as 3; an import limit of 6 makes a seventh
search impossible; and — the case my first test nearly missed — **a cap of 5 no longer
overshoots to 6**, because the pipeline had been checking `used >= cap` and would have
admitted a second 3-search job.

## 9. Full 820 offline plan — zero external calls

| Metric | Value |
| --- | --- |
| Rows / needing research | 820 / 797 |
| Normal / technical | 453 / **367** |
| Rows with official Primary Source URL | **371** |
| Rows with official Technical PDF | **367** |
| Rows with a known official domain | **371** |
| Rows where retailer is strongest | 432 |
| **First step = OWNER_TECHNICAL_PDF** | **367** |
| First step = OWNER_OFFICIAL_URL | 1 |
| First step = GTIN_LOOKUP | 33 |
| First step = RETAILER_SEARCH | 396 |
| **First step = OPEN_WEB_SEARCH** | **0** |
| Official-first share of researched rows | **46.2%** |

Open web is now the first step for **zero** of 797 rows.

### Recorded-run replay (§14)

| Product | OLD source actually used | NEW first source |
| --- | --- | --- |
| AMARETTO GIUBILEO | cukieteria.pl (OTHER_WEB) | **comprital.pl/katalog_comprital.pdf** |
| AMBROGIO | nothing found | **comprital.pl/katalog_comprital.pdf** |
| LIMONE (P1237) | nothing found | **comprital.pl/katalog_comprital.pdf** |
| LIMONE (P307B) | deliziaticonme.it / dolcingredients.it | **comprital.pl/katalog_comprital.pdf** |
| CREMOLINA | cukieteria.pl (OTHER_WEB) | **comprital.pl/katalog_comprital.pdf** |
| Airwaves | foodfactor.net (OTHER_WEB) | exact biedronka product page |
| Skyr Fruvita | zakupy.biedronka.pl | GTIN databases |
| Morele BakaD'Or | zakupy.biedronka.pl | GTIN databases |

## 10–15. Tiny paid QA — 3 products, **5 searches**

| # | Product | Kind | First step (planned) | Source ACTUALLY used | Authority | Facts | pre → post | Searches | Latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Mlekovita** Wypasione mleko czekoladowe | normal | `OWNER_OFFICIAL_URL` → mlekovita.com.pl | **mlekovita.com.pl** (the owner's exact URL) | **OFFICIAL_MANUFACTURER** | 3 (kcal, fat, carbs) | **72.8 → 88.95** | 1 | 5.0 s |
| 2 | **Airwaves** Cool Cassis | normal | `RETAILER_SEARCH` → biedronka | **zakupy.biedronka.pl** (the owner's exact URL) | AUTHORITATIVE_RETAILER | 3 (ingredients, kcal, fat) | **19.2 → 36.0** | 1 | 6.5 s |
| 3 | **Comprital** AMARETTO GIUBILEO | **technical** | `OWNER_TECHNICAL_PDF` → comprital.pl PDF | **comprital.pl/katalog_comprital.pdf** + comprital.pl/pasty-giubileo/ | — | 0 (all notFound) | **72.2 → 72.2** | 3 | 10.2 s |

**Total: 5 searches / 3 products** (cap 6). Avg 1.7 searches, avg latency 7.2 s.
38,384 input + 1,442 output tokens. Provider exposes no monetary figure; **no cost invented**.

### What this proves

- **The first OFFICIAL_MANUFACTURER evidence the system has ever produced.** The previous run
  produced zero across ten products; this run produced it on the first try, from the owner's
  own URL.
- **Zero aggregator/SEO domains.** No `foodfactor.net`, `cukieteria.pl` or `dietonator.pl`.
- **Retailer stayed retailer-tier** — the Airwaves facts were not laundered upward.
- **The Comprital PDF was genuinely opened** (both the PDF and the official product page appear
  in its consulted sources) and honestly returned nothing: that catalogue does not carry
  per-product ingredients, GTIN or kcal. Confidence therefore did not move — **72.2 → 72.2**.

### Honest outcomes (§16)

**No product became importable, and that is correct.** Mlekovita rose to 88.95 on real
manufacturer evidence but still lacks protein, so critical readiness fails and it goes to
review rather than import. Airwaves rose to 36. The technical Comprital row stayed blocked.
Confidence moved only where evidence justified it; no weight was tuned.

## 16. Technical fail-closed

The Comprital row is `technicalBlocked: true` and `autoImportEligible: false` at 72.2 — and
would remain so at any confidence. Its dosage was already present in the row and was never
re-researched.

## 17–20. Validation and state

| Gate | Result |
| --- | --- |
| Focused | 24 official-source-first proofs; 261 product-intelligence tests |
| `npm test` | **7399 passed / 587 files** |
| typecheck / lint / build | clean · 0 errors (2 pre-existing warnings) · built |
| products:audit / mapper:runtime-audit | `b13f5db4…ed38`, active 2088 |
| catalog / rescue-bundle | 0 violations · verified |
| `git diff --check` | clean |

**Flags now:** `INTIMPORT_WEB_ENRICHMENT_ENABLED=true`, `MAX_CALLS_PER_PRODUCT=2`,
**`MAX_EXTERNAL_CALLS_PER_IMPORT=6`** — I left the QA ceiling in place deliberately; raise it
when you want a larger run. Scanner: `WEB_SEARCH_ENABLED=false`, `MAX_WEB_CALLS=0`, unchanged.

---

OWNER-SUPPLIED OFFICIAL EVIDENCE FIRST
GENERAL WEB SEARCH LAST
RESEARCH ONLY MISSING CRITICAL FIELDS
STOP WHEN SUFFICIENT
PAID QA <= 3 PRODUCTS / 6 SEARCHES
SCANNER WEB REMAINS OFF
NO PRODUCTION DEPLOY
MAPPER BASE UNCHANGED
