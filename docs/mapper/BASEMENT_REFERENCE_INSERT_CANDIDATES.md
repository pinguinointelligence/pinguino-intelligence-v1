# Basement Reference Insert Candidates

> **PROPOSAL — NOT APPLIED.** No write to `mapper_basement`. Per the rule "do not write unless
> EVERY required value is sourced and provable", these are **not** applyable today: the engine
> `pac_value`/`pod_value` are PINGÜINO-specific and **not publicly sourceable** — only the team's
> calibration can produce them. Composition is partly public/label-sourced. 2026-06-30.
>
> **Schema vocab**: `ingredient_category` is one of dairy, sugar, fat, stabilizer, emulsifier,
> fruit, chocolate, nut, alcohol, water, flavor, salt, other (`docs/ingredient-database/ingredient.schema.json`).
> `nut_paste` is NOT valid — almond is `nut` + a subcategory; polyols/high-intensity sweeteners are `sugar`.
>
> Builds on [BASEMENT_REFERENCE_GAP_PROPOSALS.md](BASEMENT_REFERENCE_GAP_PROPOSALS.md) (label data).

## Code procedure
`mapper_basement.ingredient_id` is manually-assigned `PI-ING-NNNNNN` (no DB sequence). Current count 542, max `PI-ING-000544`. **Next free codes: `PI-ING-000545`+** — final codes assigned by the team at insert time (do not hardcode in a data migration).

**Coverage note (synced 2026-07-05):** candidates A–L below mirror the **12 proposal families** in
`src/data/products/referenceProposals.ts` (staged at `/dev/reference-proposals`, exported in the
team calibration pack, and consolidated for humans in
[OWNER_TEAM_CALIBRATION_HANDOFF.md](OWNER_TEAM_CALIBRATION_HANDOFF.md)). Nothing here is an applied
migration; PAC/POD come only from team calibration; no values are guessed.

## Source search
- **Google Drive**: the only catalog source ("Mercadona_catalog") carries the *product* labels, not reference-ingredient profiles — no PAC/POD, no water/solids/sugar-split (confirmed). No reference dataset for almond/erythritol/stevia is in Drive.
- **Public sources (composition only, free, no API/secret)**: almond is a stable whole food (USDA-type proximate data); erythritol/sucralose/steviol-glycoside composition is well-documented. **PAC/POD are NOT public** for any of them.

## Candidates

### A. Almond — `nut` + subcategory `almond_whole`/`almond_ground`/`almond_paste` (proposed `PI-ING-000545`)
- **Unlocks**: PR-ING-000040, 000041, 000042 (Almendra sin piel / natural / molida).
- **Sourced (USDA FDC 170567 + label, high confidence)**: fat 49.9 (label 53), saturated_fat 3.80 (label 4), protein 21.15 (label 22), carbohydrate 21.55 by-difference / **≈7–9 EU available** (label 7), total_sugars 4.35 (label 4.5; sucrose 3.95 / glucose 0.17 / fructose 0.11), salt ≈ 0.003–0.01 (reconcile), water 4.41, total_solids ≈ 95.6, fiber 12.5, kcal 579 USDA / 620 EU-label. The carb gap is an EU-available-carb vs USDA-by-difference artifact (fiber), not a conflict.
- **REQUIRED, team-only (not sourceable)**: `pac_value`, `pod_value` — must follow the SAME verified process as the existing peanut/hazelnut/pistachio pastes (low values, sugar-driven). Sugar-type split: assume sucrose-dominant per public data, but confirm.
- **Confidence**: composition **high**; pac/pod **pending team calibration**. **Lowest-risk** once pac/pod produced.

### B. Erythritol — `sugar` / polyol (proposed `PI-ING-000546`)
- **Unlocks**: PR-ING-000060 (eritritol+sucralosa), PR-ING-000062 (steviol+eritritol bulk).
- **Sourced**: ~100% erythritol; fat 0, sugars 0, water 0, total_solids 100, kcal ~0, polyol ≈ 100.
- **REQUIRED, team-only**: `pac_value`/`pod_value` are SPECIALIZED — the engine uses stored values for polyols (the sugar-breakdown fallback is 0 for polyols, see `engine/pac.ts`/`pod.ts`). Erythritol has a strong freezing-point depression (high PAC) + ~60–70% relative sweetness; exact engine-calibrated numbers **must** come from the team.
- **Confidence**: composition **high**; pac/pod **must be team-calibrated** (do not estimate).

### C. Steviol glycosides (stevia) — high-intensity (proposed `PI-ING-000547`)
### D. Sucralose — high-intensity (proposed `PI-ING-000548`)
- **Unlocks**: complete PR-ING-000060 / 000062.
- **Nature**: non-bulk high-intensity sweeteners — negligible mass, near-zero PAC, very high relative sweetness; used in trace amounts.
- **REQUIRED, team-only**: engine-calibrated `pac_value`/`pod_value` + correct handling as a high-intensity (non-bulk) sweetener.
- **Confidence**: composition trivial; pac/pod + handling **team-only**.

### E. Maltitol & other polyols (maltitol / sorbitol / xylitol / isomalt) — `sugar` / polyol
- **Why**: the already-matched maltitol chocolate (PR-ING-000031), PR-ING-000032 (choc 85% 0% azúcares), and future sugar-free products map to a polyol the base lacks as a standalone reference. Same engine treatment as erythritol (stored-value-first; sugar-breakdown fallback is 0 for polyols).
- **Sourced**: composition trivial (~100% polyol; water/sugars 0). Relative sweetness ≈ maltitol 0.9× · sorbitol 0.6× · xylitol 1.0× · isomalt 0.5× (re-confirm table citation). **REQUIRED, team-only**: engine-calibrated `pac_value`/`pod_value` per polyol — maltitol MW 344 → moderate PAC (unlike erythritol's strong PAC) — **must** be team-supplied, not estimated.

### F. Saccharin — `sugar` / high-intensity (proposed `PI-ING-000549`)
- **Unlocks**: PR-ING-000063 (sacarina en sobres).
- **Nature**: high-intensity, ~300× sucrose (up to ~500× low-dose). **Two profiles** — team decides: (A) pure additive (C₇H₅NO₃S, ~0 kcal, negligible PAC) or (B) bulked sachet (USDA FDC 169072: ~360 kcal, ~90 carb, ~85 sugars, 428 mg Na — PAC driven by the dextrose bulking agent). "Sobres" usually = B.
- **REQUIRED, team-only**: engine `pac_value`/`pod_value`; resolve A-vs-B; confirm sachet net weight + bulking agent.

### G. Full-fat Greek yogurt (≈10% MG) — `dairy` / `greek_yogurt` (proposed `PI-ING-000550`)
- **Unlocks**: PR-ING-000016 / 000017 (Yogur griego natural, **10.8% fat**). The existing `PI-ING-000204 Greek Yogurt — Standard` is **7.5% fat**; the reference-linked handoff borrows the reference's composition, so mapping to it would understate fat by ~3.3pp — a fattier VARIANT is needed (team to decide: new `PI-ING` vs a parameterised fat variant of 000204).
- **Sourced (Hacendado label, real product)**: fat ≈10, carbohydrate ≈4, total_sugars ≈4, protein ≈4, salt ≈0.1; water/total_solids ≈81/19 (representative figure to confirm).
- **REQUIRED, team-only**: `pac_value`/`pod_value` (dairy-standard process, like 000204); confirm the protein band (label 3.9 is low for strained greek — greek-style vs strained).
- The 2%-MG "ligero" variants (PR-ING-000018/000019) likely need a separate light-greek reference too.

### H. Skimmed liquid milk — `dairy` / `milk_skimmed` (proposed `PI-ING-000551`)
- **Unlocks**: PR-ING-000004 (Leche desnatada, 0.3% fat). The base has NO liquid milk under 1.6% fat (only powders/concentrates) — the fat-band audit found zero in-band candidates.
- **Sourced (label)**: fat 0.3 · carb 4.8 · sugars 4.8 · protein 3.2 · salt 0.13 · water≈91/solids≈9 (representative figure to confirm).
- **REQUIRED, team-only**: `pac_value`/`pod_value` (standard dairy process).

### I. Lactose-free milk (semi / whole) — `dairy` / `milk_lactose_free` (proposed `PI-ING-000552`)
- **Unlocks**: PR-ING-000007 / 000008. Lactase hydrolyses lactose → glucose+galactose: same total sugars, **different freezing-point depression + sweetness** — a regular-milk reference must never represent these (the fat-band helper deliberately refuses to band them).
- **Sourced (labels)**: fat 1.55 (semi) · carb 4.7 · sugars 4.7 · protein 3.2 · salt 0.13; whole variant fat 3.6.
- **REQUIRED, team-only**: `pac_value`/`pod_value` for HYDROLYSED sugars (**never copy regular-milk values**); decide 1 or 2 variants (whole + semi).

### J. Plain yogurt (whole-milk ≈3%, unstrained) — `dairy` / `yogurt_plain` (proposed `PI-ING-000553`)
- **Unlocks**: PR-ING-000014. The existing "Natural Yogurt — Standard" (2/5.4/3.6/4.7 f/c/s/p) mismatches the Spanish standard (3/4.5/4.5/3.5); the Greek-Type ref is strained (sugars 2.7).
- **Sourced (label)**: fat 3 · carb 4.5 · sugars 4.5 · protein 3.5 · salt 0.1.
- **REQUIRED, team-only**: `pac_value`/`pod_value`; water/solids; lactose split.

### K. Kefir (natural ≈4% fat) — `dairy` / `kefir` (proposed `PI-ING-000554`)
- **Unlocks**: PR-ING-000022 / 000023. No kefir reference exists; the closest composition is a *yogurt* (wrong fermented class).
- **Sourced (label)**: fat 4.2 · carb 5.1 · sugars **2.3** (low residual — fermentation) · protein 3.9 · salt 0.08.
- **REQUIRED, team-only**: `pac_value`/`pod_value`; water/solids; fermentation sugar split.

### L. Pure cocoa powder (10–14% fat) — `chocolate` / `cocoa_powder` (proposed `PI-ING-000555`)
- **Unlocks**: PR-ING-000033. **No pure cocoa-powder reference exists** (only couvertures / cocoa compounds / cocoa butter); the composition audit found zero candidates within tolerance.
- **Sourced (label)**: fat 14 · carb 16 · sugars 2 · protein 21 · salt 0.1.
- **REQUIRED, team-only**: `pac_value`/`pod_value`; water/solids; fiber; available-vs-by-difference carbs. The product stays name-flagged (0% azúcares) → never auto-verifies after mapping.

## Staging surface (code)
These candidates are structured in the pure `src/data/products/referenceProposals.ts` and rendered
read-only at **`/dev/reference-proposals`** (filters, required-fields checklist, per-proposal
next-action, and an **always-blocked insert readiness** — the staging surface can never authorise
an insert; pac/pod stay team-only).

## Possible composition source URLs (composition ONLY — never PAC/POD)
- USDA FoodData Central (almond, whole foods) — free, keyless.
- OpenFoodFacts (label nutrition, the same source the catalog used) — free, keyless.
- Producer technical sheets (when available) — highest trust (see source-ranking module).
- **PAC/POD appear in NONE of these** — they are PINGÜINO-engine-specific and come only from the team's calibration.

## Why no migration/seed file is provided to apply
Phase rule: apply only when every required value is sourced + provable. **PAC/POD for all four are not sourceable** (engine-specific) → an applyable seed cannot be produced honestly. A proposal-only template (with `NULL -- SOURCE REQUIRED` pac/pod) is in [BASEMENT_REFERENCE_GAP_PROPOSALS.md](BASEMENT_REFERENCE_GAP_PROPOSALS.md).

## Caveat (unchanged)
Even after insertion, products mapping to erythritol/stevia/sucralose are **red-flagged** (`sweetener_or_polyol`) and **never auto-verify** — at most PI Generated / Manual Adjusted.

## Action
Surface to the owner. A human inserts these (with team-calibrated PAC/POD) into `mapper_basement` via a seed migration once values exist. **Approval required** — locked base.
