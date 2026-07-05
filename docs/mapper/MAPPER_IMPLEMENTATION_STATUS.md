# Mapper — Implementation Status

_Living status tracker for the PINGÜINO product-intake "Mapper". Evidence-based; nothing
here is assumed complete. Last updated 2026-07-05 at repo HEAD `f3f45eb`._

## Architecture invariants (must always hold)
- `mapper_basement` is the **locked reference brain** (`PI-ING-…`); never auto-written by intake.
- `products` is the **growing** product layer (`PR-ING-…`, DB sequence); all new products land here.
- **No `npac_value`** anywhere (v0.95 no-NPAC). Engines use `pac_value` + `pod_value`; recipe-level PAC/POD is computed in recipe logic.
- **"Matched" = mapping confirmed, NOT engine-ready.** Product `pac_value`/`pod_value` stay NULL until a scientifically valid source/provenance path exists.
- Recipe engines must consume **Mapper-prepared** profiles, never raw OCR/catalog/image fields.
- Customer-facing statuses: **Verified, PI Calculated, PI Generated, Manual Adjusted, PI Verified** — never the word "Mapper"; internal confidence % is never shown to customers.
- Products with sweeteners/polyols/protein desserts/hidden formulas/incomplete OCR/conflicts must **not** auto-verify.

## Live DB state (read-only, 2026-06-30)
| metric | value |
|---|---|
| products total | 69 |
| product_category set / null | 69 / 0 |
| mapper_status matched | **20** (all `manual_mapping` / `high`; +4 coffee confirmations this block) |
| mapper_status rejected | 3 |
| mapper_status needs_review | 0 |
| mapper_status null | **46** |
| mapper_basement | 542 (untouched) |
| matched products with pac/pod NULL | **20 / 20** (none engine-ready — by design) |
| **lifecycle `status`** | **draft 46 · pi_generated 20 · rejected 3 · pi_calculated 0 · pi_verified 0** |
| Studio-eligible | **20** |
| `product_snapshots` table | **live** (migration 0011 applied; 69 rows; RLS append-only) |

## Requirement status

| # | Requirement | Status | Evidence | Gap / next |
|---|---|---|---|---|
| 1 | mapper_basement locked reference base | **Done** | `migrations/0006_mapper_basement.sql`; read-only `services/ingredients.ts` (`listEngineApprovedIngredients`) | — |
| 2 | products table + `PR-ING` sequence | **Done** | `0007_products.sql`, `0009_products_identity.sql` (`products_code_seq`, `next_product_code()`), `0010` grants; `data/products/productRow.ts` | — |
| 3 | duplicate prevention | **Done** | `0009` per-owner unique indexes on normalized EAN/barcode; `data/products/productIdentity.ts`; `services/products.ts` `createProductWithIdentity`/`findExistingProductForIdentity` | — |
| 4 | no `npac_value` | **Done / enforced** | absent in live code; `engine/noNpacRegression.test.ts`; `studioBoundary` + `productsSecurity` guards | keep guarding |
| 5 | statuses (lifecycle) | **Applied + DEV control** | `productStatusDecision.ts` + `productStatusWrite.ts`; applied live (11 `pi_generated` / 3 `rejected` / 55 `draft`); **NEW** `/dev/mapper-status` page applies the recommended status (never PI Verified; red-flag override needs a written reason) | PI Verified review flow remains (needs rule sign-off) |
| 6 | confidence scoring | **Done (pure, internal)** | **NEW** `productConfidence.ts` — 9 component scores + risk penalty + overall + `blocks_auto_verify`, marked `internal_only` | not persisted (internal-only by design; never a customer percentage) |
| 7 | red flags | **Done + integrated + surfaced** | `productRedFlags.ts`; consumed by status decision/confidence/handoff; **NEW** shown in import preview (`importPreviewRedFlags`) + the review workstation row indicators | — |
| 8 | table/catalog import | **Done** | `data/products/productTableParser.ts`, `services/productCatalogImport.ts`, `pages/destinations/ProductImportPage.tsx` (`/products/import`); **NEW** subcategory→category fallback (`02c58db`) | — |
| 9 | OCR / image intake | **Missing** | placeholder columns only (`product_image_url`, `detected_text`, `extracted_json`) | no OCR/image pipeline — see enrichment plan |
| 10 | barcode/EAN intake | **Partial** | EAN/barcode normalization (`0009` generated cols) + dedupe done | external barcode **lookup** + scan UI missing |
| 11 | online enrichment | **Reviewed conflict-merge (keyless)** | `services/openFoodFacts.ts` (keyless read-only fetch) + **NEW** pure `productEnrichment.ts` (compare → fill/agree/conflict/skip; narrow patch) + **NEW** `services/productEnrichment.ts` (`applyProductEnrichment`: writes ONLY the label-nutrition allowlist via RLS `updateProduct`, snapshots the change, blocks PI Verified without override) + **NEW** `/dev/enrichment-preview` merge UI (product picker + per-field table + EAN-mismatch/conflict warnings) | Hacendado private-label not in OFF (404) — no real product enriched; barcode-scan UI remains |
| 12 | simple PI Calculated logic | **Deferred** | status value exists | gated on pac/pod provenance (see handoff plan) |
| 13 | complex PI Generated logic | **Deferred** | — | profile-JSON columns deliberately absent (`0008`) |
| 14 | similarity search | **Composition + name tiebreaker + coffee special-case** | `category_composition_similarity` (5 fields, ≤2pp) + `productNameTiebreak` wired into `matchProduct` (narrow only on unique-max concept score); **NEW** scoped coffee special-case pool: an exact-`flavor` product whose name carries the coffee concept ALSO pools `coffee_tea` refs with coffee-named evidence (tea/generic flavor stay excluded); coffee-gated `ground_form` concept (molido→ground); **no grano/grain concept — "Grain Coffee" is a roasted-CEREAL substitute (false friend)** | no vector/fuzzy-distance search; narrowed singles for pac/pod-less products are needs_review suggestions |
| 15 | ratio-based profile generation | **Missing** | none | — |
| 16 | snapshots / versioning | **Live + audit UI** | migration 0011 applied (RLS append-only); `productSnapshots.ts` (snapshotNewProduct / snapshotSourceChange / listProductSnapshots) + pure `productSnapshotDiff.ts` (+ **NEW** `parseDetectedChanges`); **NEW** DEV `/dev/snapshot-audit` (read-only history: change_type, source, per-field from→to) | — |
| 17 | manual adjustment | **Done** | `services/productReview.ts` (`confirmProductMatch` / `confirmProductMatchTo` / `rejectProductMatch`); `/dev/mapper-review` | — |
| 18 | PI Verified flow | **DEV control + eligibility + provenance attestation** | `/dev/mapper-status` Verify; `explainPiVerified(row)` (red flags & unresolved HARD-block); **NEW** a reference-linked product needs an explicit `independent_provenance` attestation (checkbox, recorded in the note) to reach PI Verified — a bare reason can't elevate borrowed values; product-measured still verifies on a reason | no real product PI-verified (none has independent provenance); needs a customer surface |
| 19 | engine handoff | **Wired into the Studio picker** | `productEngineHandoff.ts` + `buildProductEngineLibrary.ts` → **NEW** `useIngredientLibrary` fetches `listMyProducts` (Pro-only) + renders a **"My Products"** optgroup in `IngredientPicker` with a status label + "Reference-linked · PAC/POD from approved reference · not independently measured" note (red-flag → "pending verification"); **recipe-calc safety proven** (product calculates identically to its reference; no raw text reaches the engine; product pac/pod stay null) | customer-facing surface is Pro-gated + needs a signed-in session to render (SSR-tested) |
| 20 | product intake UI | **Partial (expanded)** | CSV `ProductImportPage`; DEV `/dev/mapper-review`, `/dev/mapper-status` (verify + Studio filter + PI Verified eligibility/attestation), `/dev/enrichment-preview` (reviewed merge + write-payload/snapshot preview), `/dev/snapshot-audit` (history + type filter), **`/dev/studio-picker-proof`** (auth-free My-Products browser proof), **`/dev/intake-hub`** (unified intake shell) | OCR/barcode scan surfaces still PLANNED (named in the hub) |

## Requires approval before proceeding
- **Writing to `mapper_basement`** — e.g. adding the missing **almond / erythritol / stevia** references (blocking several products). Locked base; needs explicit go-ahead.
- **Any pac/pod write onto products** — forbidden until a provenance path is approved (the resolver links read-only instead).
- **products.status transitions** — need the customer-facing status rules signed off before any code sets `pi_calculated`/`pi_verified`.

## Product review progress (mapping decisions, not engine-readiness)
- **20 matched** (manual review): 000006, 000010, 000011, 000012, 000013, 000029, 000031, 000036, 000043, 000044, 000070, 000046 (→ Wild Strawberry), 000047 (→ Blueberry), 000024 & 000025 (→ White Chocolate PI-ING-000142), 000027 (→ Milk Chocolate Couverture PI-ING-000122), **000064 & 000065 & 000066 & 000067 (→ Coffee Bean Roasted Ground PI-ING-000166)** — coffee confirmed via the special-case pool review (the only real roasted-coffee ref; NOT "Grain Coffee", a cereal-substitute false friend; whole-vs-ground form doesn't change the per-100g profile). Parked: 000068 café mezcla (torrefacto blend — sugar-glazed roast differs from the pure-roast ref), greek yogurts (only greek ref is too lean 10.8 vs 7.5% fat — see proposal G), 000026 milk choc (3-way tie), 000028 dark choc (percent-level), 000035 pistachio (raw nut vs paste refs), vanilla 000069 (aroma vs paste form mismatch).
- **3 rejected** (false matches): 000015, 000020, 000054.
- **55 unmapped** (`null`): 7 reviewed-but-parked (000035 pick-which-pistachio; 000040/041/042 no almond ref; 000056 composite dessert; 000060/062 no erythritol/stevia ref) + ~48 unreviewed (zero-composition + broad-ambiguous).
- **Basement reference gaps to add later (approval required):** almond, erythritol, stevia.

## Manual Adjusted / PI Verified workflow (plan — schema supports it; not yet wired)
`products` already has `reviewed_by` / `reviewed_at` / `review_notes` (0007). The pure policy
core exists (`productStatusDecision` with `reviewerApproval` + `manuallyAdjusted` inputs). Remaining
to build (own slice, gated): a status-write service `setProductLifecycleStatus(productId, decision)`
that persists `status` + `reviewed_by/at` + a note; a DEV-only control on `/dev/mapper-review`;
and the rule that **a red-flag override requires an explicit reason** and never reaches PI Verified.
**No real product is marked PI Verified yet.**

## Review queue (recomputed 2026-06-30)
All **55 `null` products are composition-complete** (≥4 measured fields + an EAN) — none are
zero-composition, so the blocker is candidate ambiguity / red flags / missing references, not data.
By `product_category`:
- **dairy (20)** — plain milks 000002/003/004/005/007/008 + Asturiana; yogurts/kéfir 000014/016/017/018/019/021/022/023 → **broad-ambiguous** (126 dairy refs, need a brand/name tiebreak). Protein puddings/drinks 000009/051/052/053/055/056 → **red-flagged** (+Proteínas / protein dessert).
- **chocolate_cocoa (11)** — dark/milk/white 000024-028/030 + cacao 000034 → broad-ambiguous; 000032/033 (0% azúcares + edulcorante) → **red-flagged** (sweetener); cocoa-hazelnut creams 000038/039 → composite.
- **fruit (8)** — frozen whole fruits 000046/047 → matchable-but-ambiguous; blends 000048/049/050 → composite; 0%-sugar jams 000057/058/059 → **red-flagged**.
- **nut_paste (6)** — almonds 000040/041/042 → **need almond ref**; pistachio 000035 → pick-which; hazelnut cream 000037 → composite; peanut-protein 000045 → red-flagged (protein).
- **flavor (6)** — coffee 000064-068 + vanilla 000069 → need specific flavor refs.
- **sugar (4)** — 000060/061/062/063 → **need erythritol/stevia/sucralose/saccharin refs** AND red-flagged.

**No new confirm/reject this block.** OFF returns 404 for Hacendado private-label, so enrichment makes
none newly decidable — all 55 stay parked. The decidable blockers are the **basement reference gaps**
(almond · erythritol · maltitol/polyols · stevia · sucralose · saccharin) — see the gap-proposal doc.
Full grouping + next-action per group: [REVIEW_QUEUE_ANALYSIS.md](REVIEW_QUEUE_ANALYSIS.md).

## Recent commits
`1d8b930` red-flag + engine resolver · `700aa6b` status-decision + confidence · `baf5d6b` engine-handoff adapter · `0822844` snapshots migration + gap/catalog docs · `61cb32a` snapshot + status-write services · `67e978e` enrichment source-ranking · `a07abd0` My-Products engine library · `0b3e34a` PI Verified / Manual Adjusted controls · `f002a8c` OpenFoodFacts adapter · `43c12c0` reviewed enrichment conflict-merge · `54dd084` snapshot audit view · `b01d657` PI Verified eligibility explainer · `cadac1f` **Studio My-Products browser proof** · `2c6d0d3` enrichment write-payload/snapshot preview · `312eb7a` snapshot type filter · `8bebb58` **reference-linked provenance attestation** · `c9c7aae` handoff test hardening · `c662e32` **name-concept tiebreaker** · `70b534a` intake hub · `27bd30e` Drive re-verify + legacy lock proposal · `3425182` tiebreaker WIRED into matcher · `9bff593` tiebreak evidence on /dev/mapper-review · `6eec184` full-fat greek proposal + reference-proposals filters · `fb7ba71` intake input classifier · `3fcc432` **coffee special-case pool** · `e5c1081` **ingredient_type shortlists + matcher notes on /dev/mapper-review** · `574a061` intake-hub file picker · `f3f45eb` **required-fields checklist + always-blocked insert readiness**. **Live DB ops:** migration 0011 applied; **9 mapping confirmations across four blocks** (000046 Wild Strawberry · 000047 Blueberry · 000024/000025 White Chocolate · 000027 Milk Chocolate Couverture · **000064/000065/000066/000067 → Coffee Bean Roasted Ground PI-ING-000166** — all reference-linked, pac/pod null). DEV tools: `/dev/mapper-review` (+ pool method + matcher notes), `/dev/mapper-status`, `/dev/enrichment-preview`, `/dev/snapshot-audit`, `/dev/studio-picker-proof`, `/dev/intake-hub` (+ classifier + file picker), `/dev/reference-proposals` (+ filters + checklist).

## Studio product selection (this block)
Confirmed products are now **selectable in Studio recipes** via the picker's **"My Products"** group
(11 Studio-eligible = all matched + `pi_generated` + linked reference). Each carries a customer-safe
status label + a reference-linked provenance note; red-flagged products show "pending verification".
Engine values are resolved from the linked reference **at calculation time** — product `pac_value`/`pod_value`
columns stay NULL (0/69 carry any), and no raw OCR/catalog text reaches the engine (proven by
`productEngineLibrary.recipe.test.ts`). The production group is Pro-gated + needs a signed-in session,
but it is now **browser-verifiable without auth** via the DEV fixture route `/dev/studio-picker-proof`
(real picker + real `buildProductEngineLibrary`, sample rows) — verified live (added PR-ING-000010 with
pac 3.3 / pod 0.46). Production Studio still uses real RLS data (guarded by a test).

See also: [REVIEW_QUEUE_ANALYSIS.md](REVIEW_QUEUE_ANALYSIS.md), [BASEMENT_REFERENCE_GAP_PROPOSALS.md](BASEMENT_REFERENCE_GAP_PROPOSALS.md), [BASEMENT_REFERENCE_INSERT_CANDIDATES.md](BASEMENT_REFERENCE_INSERT_CANDIDATES.md), [MERCADONA_CATALOG_IMPORT_CONTRACT.md](MERCADONA_CATALOG_IMPORT_CONTRACT.md), [LEGACY_INGREDIENTS_CLEANUP_PLAN.md](LEGACY_INGREDIENTS_CLEANUP_PLAN.md).

See also: [PACPOD_ENGINE_HANDOFF_PLAN.md](PACPOD_ENGINE_HANDOFF_PLAN.md), [INTAKE_ENRICHMENT_PLAN.md](INTAKE_ENRICHMENT_PLAN.md).
