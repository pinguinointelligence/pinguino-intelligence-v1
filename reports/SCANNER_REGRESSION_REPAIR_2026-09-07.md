# Scanner regression repair — 2026-09-07

Baseline audited: `302ac872..e80697d5` (#218) · `e80697d5..b7cbdfea` (#219) · `b7cbdfea..416d5d90` (#220).
Repair branch `claude/scanner-regression-repair`, PR [#223](https://github.com/pinguinointelligence/pinguino-intelligence-v1/pull/223).

Evidence bundle: `~/Developer/scan-corpus/regression-2026-09-07/`.

---

## 1 · The reproduction

Not read from the code — run against the deployed `product-scan-finalize` on staging `416d5d90`.
One scan session, three `preview` calls differing in nothing but whether the request repeats the
customer's answers (`scripts/scanner-preview-finalize-repro.mjs`, session
`0fd4e333-2baf-4dbc-acf8-8b816789e50e`):

| call | `confirmations.productFields` | productAccuracy | criticalBlockers |
| ---- | ---------------------------- | --------------: | ---------------- |
| 1 | the customer's answers | **90.0** | `PRODUCT_SEMANTICS_UNRESOLVED` |
| 2 | **empty** — same session, same stored values | **73.4** | `INGREDIENTS_EVIDENCE_REQUIRED`, `PRODUCT_SEMANTICS_UNRESOLVED` |
| 3 | the customer's answers again | **90.0** | `PRODUCT_SEMANTICS_UNRESOLVED` |

73.4 is exactly the number `PM-ING-007193` (Cola Zero) was saved with. Call 2 raised
`INGREDIENTS_EVIDENCE_REQUIRED` for an ingredient text **that was already on the session** — written
there by call 1.

The owner's figures reconstruct component by component from the persisted traces
(`product_scan_sessions.validation_json.autonomousTrace.confidence.components`):

| run | ean | nutrition | recognition | physics | behaviour | ingredients | total |
| --- | --: | --------: | ----------: | ------: | --------: | ----------: | ----: |
| owner baseline | 2 | 42.6 | 7 | 21.52 | 8 | 13 | **94.12** |
| owner preview | 2 | 42.6 | 7 | 21.52 | 8 | 4 | **85.12** |
| session `f4cdda7e` (07:53 / 08:05) | 2 | 42.6 | 7 | 21.52 | 4 | 4 | **81.12** |
| saved Cola Zero `7d46dda7` | 2 | 36.0 | 7 | 20.40 | 4 | 4 | **73.40** |
| saved Vitamin Well `a818bd02` | 2 | 36.0 | 5.5 | 20.40 | 4 | 4 | **71.90** |

Three independent losses, and only two of them are defects:

- **9.00** — `ingredientsEvidence` 13 → 4. No ingredient text reached the session at all
  (`result_json.ingredientsText` absent). Missing evidence, correctly reported. Not a code defect.
- **4.00** — `productBehavior` 8 → 4: the behaviour authority returned `unknown_requires_review`
  because the semantic classification was unresolved. **Defect (RC-2).**
- **7.72** — `nutrition` 42.6 → 36.0 and `enginePhysics` 21.52 → 20.40: every field the customer
  typed came back as `mapper_similar_profile/ESTIMATED` instead of `user_confirmed/VERIFIED`, and
  `identity` as `barcode_registry` instead of `user_confirmed`. **Defect (RC-1).**

---

## 2 · Root causes

### RC-1 — the confidence drop and the Preview/Finalize drift are one bug

`supabase/functions/product-scan-finalize/index.ts`, `applyCustomerCorrections` — present since the
customer-added-product flow, untouched by #218/#219/#220.

The handler derives `confirmedEvidenceFields` from **the current request's**
`confirmations.productFields`, and the same handler writes the corrected result **back onto the
session**. The completion form only ever offers what is STILL missing, so every later round
legitimately carries fewer fields. Result: on the second call the customer's VALUES survive and
their PROVENANCE does not.

`customerProductProfileProposal` reads that set as `userConfirmedFields`, so a typed answer silently
demotes from `user_confirmed` to `mapper_similar_profile`, and `INGREDIENTS_EVIDENCE_REQUIRED` is
raised for a text sitting in `result_json`.

Preview and Finalize are two independent invocations of this handler, which is why one scan
previewed high and saved low.

### RC-2 — a resolved classification was thrown away

Same file, `serverSemanticClassification`. It re-runs on **every** call and its model answer is
cached in `intimport_semantic_classification_usage` under a hash of the **mutating** evidence. The
moment the customer adds a fact the fingerprint moves, the cache misses, and a model that does not
answer leaves the deterministic `REVIEW_REQUIRED`.

`recognition.modelRequired === true` is a hard gate in **both** authorities —
`productProductionAccuracy.ts` (`PRODUCT_SEMANTICS_UNRESOLVED`) and `productBehaviorAuthority.ts`
(`unknown_requires_review`) — so a resolution the scan had already reached became a blocker.

Proof: the saved Vitamin Well session ends with `evidenceFingerprint recognition-v2-f966a883`,
`classificationSource: REVIEW_REQUIRED`, `modelRequired: true`, and **no row at all** in
`intimport_semantic_classification_usage` for that fingerprint. The saved Cola Zero session has
exactly one row, for a *different* fingerprint (`recognition-v2-3edcdbd9`, `SERVER_MODEL`).

### RC-3 — the raw refusal on the customer's screen

`src/scan-import-v2/adapters/supabaseDiscoveryAdapter.ts` composed `reasons` from
`assessment.criticalBlockers` + `roleReadiness:` + `recognition:`;
`src/scan-import-v2/discovery/discovery.ts` joined them into `note = "not ready: " + …`;
`src/features/scan-flow/ScanFlow.tsx` rendered `phase.note` verbatim at two places.

Introduced by `7215f4a6` (scan-import-v2 discovery lifecycle), extended by `a0377801`. #219 made it
*reachable* by routing an unready product to the completion screen instead of a hard stop, and the
`customerSafeNotice` sanitiser added in #218 was applied in `ProductPickerPopover`, **not** here.

Reproduced by rendering the real component on unmodified `416d5d90`, character for character:

```
not ready: INGREDIENTS_EVIDENCE_REQUIRED, PRODUCT_SEMANTICS_UNRESOLVED,
product_semantics_unresolved, roleReadiness:REVIEW, recognition:NORMAL_INGREDIENT/BASE_ONLY
```

### RC-4 — the navigation duplication

`src/features/shell/appNav.ts`. #219 added `unverifiedProducts` (order 3.6) beside the `scanProduct`
entry added 2026-09-06 (order 3.5) and the existing `products` (order 3): one area, three drawer
entries.

---

## 3 · Change audit, #218 / #219 / #220

| change | file / function | ordered? | capture | enrichment | confidence | readiness | UI |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #218 rotated decode ROI | `scan-core/policy.ts` `cropOn` | yes (SOL-042) | **yes** | – | – | – | – |
| #218 zoom ladder removed | `scanCoreCapture.ts`, `stateMachine.ts` | yes | **yes** | – | – | – | yes (×N removed) |
| #218 desktop mirror + hints | `ScanFlow.tsx`, `scanFlowLogic.ts` | yes (SOL-045) | **yes** | – | – | – | yes |
| #218 behaviour gate sees linked products | migration `20260907013000` | yes (SOL-043) | – | – | – | – | – |
| #218 `customerSafeNotice` by default | `copy/customerSafeNotice.ts`, picker | yes (SOL-043) | – | – | – | – | yes |
| #219 three finalize actions | `product-scan-finalize` | yes | – | – | – | – | – |
| #219 PR/PM routing | migration `20260907030000` | yes | – | – | **no** (classifies only) | **no** | – |
| #219 Niezweryfikowane panel + RPC | `UnverifiedProductsPanel`, RPC | yes | – | – | – | – | yes |
| #219 **two drawer entries** | `appNav.ts` | **NO** | – | – | – | – | **yes — regression** |
| #220 `engineUsable` = routing verdict | `product-scan-finalize` | yes | – | – | – | – | yes |
| #220 missing-field labels | `UnverifiedProductsPanel` | yes | – | – | – | – | yes |

Nothing in the three PRs touched the decoder, OCR, rotation, ROI, zoom, the confidence algorithm,
its thresholds, Mapper classification rules, required fields or the behaviour authority — **except**
the crop and zoom repairs that were the point of #218, which are preserved.

Scope check on the three files the handoff flagged: `GlobalDestinationPages.tsx` (#219, in scope —
the `?filter=unverified` rendering), `docs/qa/GELLATTI_SOL_LEDGER.md` (#218 + #219, in scope),
`reports/GELLATTI_HOME_MASTER_CHECKLIST.md` (#218 changed H-02-1, in scope; the H-18-3 row came from
#215, not this workstream). **No accidental scope creep to revert.**

---

## 4 · The fix

One canonical, versioned **assessment snapshot** per scan —
`supabase/functions/_shared/scanAssessment.ts`, consumed by the finalize handler:

1. `readPersistedScanEvidence` / `mergeConfirmedEvidenceFields` — the customer's confirmed fields
   accumulate across the scan and are persisted on the session. One request never subtracts.
2. `carryForwardRecognition` — a fresh **unresolved** classification never replaces a stored
   **resolved** one; a fresh resolved one always wins, so this is not a cache of a verdict.
3. `scanAssessmentSnapshot` — session id, EAN, identity, evidence bundle, semantic family,
   classification, behaviour binding, missing fields, critical gaps, production readiness, final
   confidence, engine usability, algorithm version and a SHA-256 over all of it.
4. Preview returns `assessmentHash`; a save may send it back as `expectedAssessmentHash`, and a
   mismatch stops the write with `scan_assessment_stale` rather than persisting a different product.
5. A repeated finalize reports what was **saved** — readiness read back from the saved version
   through the same predicate `gellatti_my_unverified_products_v1` uses — instead of a hard-coded
   `engineUsable: true`.

Customer language: `note` is composed in Polish only, the codes travel in a new `diagnostics` field
that no customer renderer reads, and `customerSafeNotice` is applied **by default** at both ScanFlow
render sites.

Navigation: `scanProduct` and `unverifiedProducts` removed from `APP_NAV_ITEMS`; `Skanuj produkt`
stays the products page's action; `Wszystkie` / `Moje produkty` / `Niezweryfikowane` become its
filters. `/products/scan` and `/products?filter=unverified` are unchanged, and the scanner's back
link returns to the list the customer came from via `?from=`.

**No confidence arithmetic, no threshold, no Mapper rule and no required-field list was changed. No
migration was applied.** Cola Zero was not set to 94.12 and Vitamin Well was not set to 87.8 — only
the set of facts the existing authority is asked with was repaired.

---

## 5 · Not touched

Decoder · camera · OCR · rotation · ROI/crop · zoom · the confidence algorithm and its thresholds ·
Mapper classification rules · required fields · behaviour authority · Etykieta · BASICV1 · SOL-010 ·
SOL-041 · Franchise/Affiliate · `main` · the production frontend · every existing `PM-ING`,
`PR-ING` and `PI-ING` row, including `PM-ING-007193` and `PM-ING-007194`.

---

## 6 · Shared production backend

`gellatti.com` and `staging.pinguinoai.com` both point at Supabase `tunabqqrwabacxjcxxkz`, so
redeploying `product-scan-finalize` serves the production frontend too — `main`'s
`src/services/productScanner.ts` still invokes it. The change is additive and backward compatible:
`expectedAssessmentHash` is optional, the new response fields are extra, and on a first call (no
persisted scan evidence) the behaviour is byte-identical to before. No migration was applied and no
row was deleted.
