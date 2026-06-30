# Basement Reference Gap Proposals

> **PROPOSAL ONLY — DO NOT APPLY.** Nothing here writes to `mapper_basement` (the locked
> reference brain). Each reference needs **verified** values from a reliable source before any
> human adds it. Engine values (`pac_value`/`pod_value`) for nuts/polyols/high-intensity
> sweeteners are specialized and must come from the team's calibration — **never invented, never
> computed from the sugar split alone**. Composition/sweetness figures below were gathered from
> public keyless sources (USDA FoodData Central, EFSA, manufacturer specs) and adversarially
> source-checked (research block 2026-06-30). 2026-06-30.

## Confirmed gaps (read-only search of 542 rows)
- **Almond** — `nut` category has brazil/cashew/chestnut/hazelnut/macadamia/peanut/pistachio/walnut/poppy, but **no almond / almendra** of any form.
- **Erythritol (and any polyol)** — `sweetener`/`sugar` has cane sugar, dextrose, fructose, glucose syrups, maltodextrin, lactose, sucrose, vanillin sugar — **no erythritol/maltitol/sorbitol/xylitol/isomalt**.
- **Stevia / steviol glycosides**, **sucralose**, **saccharin** — **none** (only an unrelated `base_mix` "Joylife Fruttastevia" ice-cream base).

## Products these gaps block
| product | label | needs |
|---|---|---|
| PR-ING-000040 Almendra sin piel | blanched almond 100% | almond reference |
| PR-ING-000041 Almendra natural | skin-on almond 100% | almond reference |
| PR-ING-000042 Almendra molida | ground almond 100% | almond reference (almond paste/flour subcategory) |
| PR-ING-000032 Chocolate 85% + edulcorante | maltitol-bulked 0% sugar chocolate | maltitol/polyol reference |
| PR-ING-000060 Edulcorante Eritritol y Sucralosa | E-968 erythritol + E-955 sucralose | erythritol + sucralose references |
| PR-ING-000061 Edulcorante stevia (pastillas) | steviol glycosides (bulked) | steviol-glycoside reference |
| PR-ING-000062 Edulcorante granulado stevia | steviol glycosides + erythritol | steviol-glycoside + erythritol references |
| PR-ING-000063 Sacarina en sobres | saccharin (bulked sachet) | saccharin reference |

## Schema note (important)
The ingredient schema (`docs/ingredient-database/ingredient.schema.json`) controlled vocab for
`ingredient_category` is: **dairy, sugar, fat, stabilizer, emulsifier, fruit, chocolate, nut,
alcohol, water, flavor, salt, other**. So **`nut_paste` is NOT a valid category** — almond must be
`nut` + `ingredient_subcategory` (`almond_whole`/`almond_ground`/`almond_paste`). Polyols/high-intensity
sweeteners fit `sugar` (closest controlled value) with a `polyol`/`high_intensity` subcategory.

## Proposed references (composition cited; engine pac/pod team-only)

### 1. Almond — `nut` (subcategory `almond_*`)
- **Unlocks**: PR-ING-000040 (sin piel), 000041 (natural), 000042 (molida).
- **Composition per 100 g** (USDA FoodData Central SR Legacy **170567**, two corroborating mirrors): water 4.41 · fat 49.9 · sat_fat 3.80 · carbohydrate 21.55 *(USDA "by difference", **includes** ~12.5 fiber)* · **EU available-carb basis ≈ 7–9** (Hacendado label 7) · total_sugars 4.35 (label 4.5) · protein 21.15 (label 22) · fiber 12.51 · salt ≈ 0.003 (label 0.01) · kcal 579 USDA / 620 EU-label · ash 2.97.
- **Sugar split** (USDA 170567): sucrose 3.95 · glucose 0.17 · fructose 0.11 · maltose 0.04 · galactose 0.07 · lactose 0 · polyol 0 (starch 0.72, not a sugar). Typed sum ≈ total → schema-consistent.
- **Sweetness / freezing**: not a sweetener (POD n/a as an ingredient). High-fat/high-solids body+flavor ingredient — RAISES total solids/fat, contributes very little freezing-point depression (only its small sucrose fraction). **No public PAC/POD on the PINGÜINO scale.**
- **The carb "gap" is a labeling artifact, not a conflict**: EU labels report available carbohydrate (fiber excluded); USDA is by-difference (fiber included). After removing fiber the two agree.
- **Safe to add now?** ❌ No — needs team-calibrated `pac_value`/`pod_value`; reconcile salt (0.01 vs 0.003); confirm paste SKUs are 100% almond (no added sugar/oil). Lowest-risk of the set once pac/pod exist (almond is a stable whole food).
- **Sources**: USDA FDC 170567; NutritionValue.org; NutritionDataHub; Almond Board of California nutrient comparison; Hacendado label.

### 2. Erythritol — `sugar` (subcategory `polyol`)
- **Unlocks**: PR-ING-000060, 000062 (both erythritol-bulked).
- **Composition**: ~100% erythritol (C₄H₁₀O₄, 122.12 g/mol); fat 0 · sugars 0 · protein 0 · **kcal 0 (EU, Reg. 1169/2011 Annex XIV)**; polyol 100.
- **Sweetness**: ~60–70 % of sucrose (POD < 1). **Freezing**: strong freezing-point depression per gram because of its low molecular weight (122 vs sucrose 342) → high relative PAC; but the **engine-calibrated number is team-only** (polyols are stored-value-first; the sugar-breakdown fallback contributes 0 for polyols — see `engine/pac.ts`/`engine/pod.ts`).
- **Safe to add now?** ❌ No — engine-calibrated polyol pac/pod required. *(Verify caveat: the US "0.2 kcal/g" figure is real but was uncited; use the EU 0 kcal basis or attach an FDA/CFR citation.)*
- **Sources**: EFSA 2023 re-evaluation of erythritol (E-968); EU Reg. 1169/2011 Annex XIV; manufacturer specs.

### 3. Maltitol + polyol family — `sugar` (subcategory `polyol`)
- **Relevant to**: PR-ING-000032 (chocolate 85% "0% azúcares" — maltitol is the typical bulk polyol in sugar-free chocolate).
- **Maltitol (E-965)**: ~0.9× sucrose sweetness; moderate freezing-point depression (MW 344, similar to sucrose → modest PAC per gram, unlike erythritol). **Sorbitol (E-420)** ~0.6×, **xylitol (E-967)** ~1.0×, **isomalt (E-953)** ~0.5×.
- **Safe to add now?** ❌ No — engine pac/pod team-only. *(Verify caveat: the sorbitol/isomalt/xylitol relative-sweetness values need their cited table re-confirmed before use.)*
- **Sources**: EFSA polyol re-evaluations; sugar-alcohol relative-sweetness tables (re-confirm citation).

### 4. Steviol glycosides (stevia) — `sugar` (subcategory `high_intensity`)
- **Unlocks**: PR-ING-000061 (pastillas), 000062 (granulado, also needs erythritol).
- **Nature**: high-intensity, **~200–300× sucrose**, dosed in **milligrams** → negligible mass and **near-zero PAC**; needs special engine handling, NOT a bulk-sugar composition. Tabletop "pastillas"/"granulado" are **bulked** (erythritol/maltodextrin) — the bulking agent drives most of the mass/PAC, not the steviol glycoside.
- **Safe to add now?** ❌ No — engine pac/pod team-only; decide pure-additive vs bulked-product profile. *(Verify caveat: drop the proposal's "~430× less by weight" line — it mis-derives to ~232×; use the sourced 200–300× potency instead.)*
- **Sources**: EFSA E-960 opinion; JECFA; food-science sweetness references.

### 5. Sucralose — `sugar` (subcategory `high_intensity`)
- **Unlocks**: PR-ING-000060 (with erythritol).
- **Nature**: high-intensity, **~600× sucrose** (well-sourced), C₁₂H₁₉Cl₃O₈, trace amounts → negligible mass/PAC. Commercial "Splenda"-type products are ~1.1 % sucralose + bulking agents (a different composition from the pure E-955).
- **Safe to add now?** ❌ No — engine pac/pod team-only. *(Verify caveat: the headline 600× is sourced, but the "400–600×"/"320–1000×" ranges need their own citations or should be dropped.)*
- **Sources**: EFSA sucralose summary; Wikipedia (formula/potency); USDA bulked-powder entry (for the Splenda-type product, NOT pure E-955).

### 6. Saccharin — `sugar` (subcategory `high_intensity`)
- **Unlocks**: PR-ING-000063 (sacarina en sobres).
- **Two profiles — team must choose** which PR-ING-000063 represents:
  - **(A) pure saccharin additive** (sodium saccharin, C₇H₅NO₃S): non-nutritive, ~0 kcal, negligible mass/PAC.
  - **(B) bulked tabletop/sachet product** (USDA FDC **169072**): per 100 g ≈ kcal 360 · carbohydrate ~90 · sugars ~85 · protein ~1 · sodium 428 mg (≈1.07 g salt-equiv) · water ~8.9 — here the **carbohydrate bulking agent (typically dextrose) drives the PAC**, not the saccharin. "Sobres" usually denotes profile B.
- **Sweetness**: ~300× sucrose (verbatim-sourced), up to ~500× at low concentration.
- **Safe to add now?** ❌ No — engine pac/pod team-only; resolve A-vs-B; confirm sachet net weight + bulking agent.
- **Sources**: EFSA E-954 re-evaluation; USDA FDC 169072; sweetenerbook; Wikipedia.

## Important caveat (unchanged)
Even after these references exist, the sweetener/polyol products (000032, 000060–000063, and the
maltitol chocolate already matched) are **red-flagged** (`sweetener_or_polyol`) and therefore
**never auto-verify** — they can reach at most **PI Generated / Manual Adjusted** (see
`productStatusDecision.ts`). Adding the references fixes the *mapping* (so they stop being
false/no-match), not engine-readiness. Almond is the one non-red-flag unlock (a plain whole food).

## Required-fields checklist (per reference, before any insert)
Legend: ✅ sourced · 🟡 partial / reconcile · ⛔ team-calibration only (not publicly sourceable).

| field | almond | erythritol | maltitol/polyols | stevia | sucralose | saccharin |
|---|---|---|---|---|---|---|
| category (`nut`/`sugar`) | ✅ nut | ✅ sugar | ✅ sugar | ✅ sugar | ✅ sugar | ✅ sugar |
| subcategory | ✅ almond_* | ✅ polyol | ✅ polyol | ✅ high_intensity | ✅ high_intensity | ✅ high_intensity |
| nutrition composition | ✅ USDA | ✅ | ✅ | ✅ (trace) | ✅ (trace) | 🟡 A vs B |
| water / total_solids | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 A vs B |
| sugar split / polyol split | ✅ | ✅ polyol 100 | ✅ polyol 100 | ✅ n/a | ✅ n/a | 🟡 A vs B |
| relative sweetness (POD basis) | n/a | ✅ ~0.65× | ✅ 0.5–1.0× | ✅ 200–300× | ✅ ~600× | ✅ ~300× |
| **engine `pac_value`/`pod_value`** | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| source / provenance | ✅ | ✅ | 🟡 re-cite table | 🟡 drop 430× | 🟡 cite ranges | ✅ |
| team calibration needed | yes (pac/pod) | yes (pac/pod) | yes (pac/pod) | yes (pac/pod + profile) | yes (pac/pod) | yes (pac/pod + A/B) |

**Every reference is blocked on the same gate: engine `pac_value`/`pod_value` are team-calibration
only.** Composition is sourced (almond fully; sweeteners trivially); the remaining 🟡 are citation
clean-ups, not blockers. No reference is insert-ready until the team supplies pac/pod.

## Research provenance (this block)
A 6-family research workflow (one keyless-source researcher + one adversarial source-verifier each,
12 agents) gathered the figures above. **Every agent correctly deferred `pac_value`/`pod_value` to
team calibration — none invented engine values** (confirmed by the adversarial pass). Open verifier
flags carried into the sections above: stevia "430×" mis-derivation (drop), sucralose sweetness
ranges (cite or drop), erythritol US-kcal figure (cite), polyol relative-sweetness table (re-confirm),
saccharin A-vs-B profile decision (team), almond salt reconciliation (0.01 vs 0.003).

## Action
Do **not** add these automatically. Surface this proposal to the owner/Colin; once verified
composition + engine-calibrated pac/pod are available from a reliable source, a human applies a
seed migration. See [BASEMENT_REFERENCE_INSERT_CANDIDATES.md](BASEMENT_REFERENCE_INSERT_CANDIDATES.md)
and [MAPPER_IMPLEMENTATION_STATUS.md](MAPPER_IMPLEMENTATION_STATUS.md) ("Requires approval").
