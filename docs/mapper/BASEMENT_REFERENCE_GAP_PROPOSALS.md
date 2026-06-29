# Basement Reference Gap Proposals

> **PROPOSAL ONLY — DO NOT APPLY.** Nothing here writes to `mapper_basement` (the locked
> reference brain). Each reference needs **verified** values from a reliable source before any
> human adds it. Engine values (`pac_value`/`pod_value`) for polyols/high-intensity sweeteners
> are specialized and must come from the team's calibration — never invented. 2026-06-29.

## Confirmed gaps (read-only search of 542 rows)
- **Almond** — `nut` category has brazil/cashew/chestnut/hazelnut/macadamia/peanut/pistachio/walnut/poppy, but **no almond / almendra** of any form.
- **Erythritol (and any polyol)** — `sweetener` has cane sugar, dextrose, fructose, glucose syrups, maltodextrin, lactose, sucrose, vanillin sugar — **no erythritol/maltitol/sorbitol/xylitol/isomalt**.
- **Stevia / steviol glycosides** and **sucralose** — **none** (only an unrelated `base_mix` "Joylife Fruttastevia" ice-cream base).

## Products these gaps block
| product | label | needs |
|---|---|---|
| PR-ING-000040 Almendra sin piel | almond 100% peeled | almond reference |
| PR-ING-000041 Almendra natural | almond 100% whole | almond reference |
| PR-ING-000042 Almendra molida | almond 100% ground | almond reference (gelato-relevant: almond paste/flour) |
| PR-ING-000060 Edulcorante Eritritol y Sucralosa | E-968 erythritol + E-955 sucralose | erythritol + sucralose references |
| PR-ING-000062 Edulcorante granulado stevia | steviol glycosides + erythritol | steviol-glycoside + erythritol references |

## Proposed references

### 1. Almond (paste / ground) — `nut_paste`
- **Why**: unlocks the 3 almond products; almond is a core gelato nut alongside the existing peanut/pistachio/hazelnut pastes.
- **Known (from Hacendado label, per 100 g)**: fat 53, saturated_fat 4, carbohydrate 7, total_sugars 4.5, protein 22, salt 0.01, kcal 620. Ingredient: 100% almond.
- **Required but MISSING (source needed)**: water_percent, total_solids_percent, fiber_percent, the sugar-type breakdown, and **`pac_value`/`pod_value`**. Almonds carry little sugar → low pac/pod, but the exact engine values must follow the **same verified process used for the existing peanut/hazelnut pastes** (do not invent).
- **Safe to add now?** ❌ No — needs verified composition + engine values from the team's reference process. Composition is publicly stable (almond is a whole food), so this is the **lowest-risk** of the three once pac/pod are produced.

### 2. Erythritol — `sugar` (polyol)
- **Why**: unlocks PR-ING-000060/062 (both are erythritol-bulked). Polyols behave **very differently** from sugar in the engine.
- **Known (label)**: ~100% erythritol; fat 0, sugars 0, kcal ~0.
- **Required but MISSING (source needed)**: **`pac_value`/`pod_value` are SPECIALIZED** — the engine treats polyols as stored-value-first (the sugar-breakdown fallback contributes 0 for polyols, see `engine/pod.ts`/`engine/pac.ts`). Erythritol has a strong freezing-point depression (high PAC) and ~60–70% relative sweetness (POD), but the exact engine-calibrated numbers must come from the team's lab/literature/calibration — **not derivable, not to be guessed**.
- **Safe to add now?** ❌ No — requires verified, engine-calibrated polyol pac/pod.

### 3. Steviol glycosides (stevia) — `flavor`/high-intensity, and 4. Sucralose — high-intensity
- **Why**: complete PR-ING-000060/062.
- **Nature**: non-bulk high-intensity sweeteners — negligible mass in a recipe, near-zero PAC, very high relative sweetness (POD hundreds×). Used in trace amounts.
- **Required but MISSING**: engine-calibrated `pac_value`/`pod_value` + the correct category/handling for a high-intensity sweetener (these are not bulk sugars). **Team-verified only.**
- **Safe to add now?** ❌ No.

## Important caveat
Even after these references exist, the mapping products (000060/062, and the maltitol chocolate already matched) are **red-flagged** (`sweetener_or_polyol`) and therefore **never auto-verify** — they can reach at most **PI Generated / Manual Adjusted** (see `productStatusDecision.ts`). Adding the references fixes the *mapping* (so they stop being false/no-match), not engine-readiness.

## Proposed seed template (DO NOT APPLY — values pending verified source)
```sql
-- PROPOSAL ONLY. Engine values + full composition MUST be supplied from a verified source.
-- insert into public.mapper_basement (ingredient_id, ingredient_name_display, ingredient_category,
--   ingredient_subcategory, fat_percent, saturated_fat_percent, carbohydrate_percent,
--   total_sugars_percent, protein_percent, salt_percent, water_percent, total_solids_percent,
--   fiber_percent, sucrose_percent, dextrose_percent, glucose_percent, fructose_percent,
--   lactose_percent, polyol_percent, pac_value, pod_value, approved_for_engines, ...)
-- values
--   ('PI-ING-XXXXXX','Almond Paste 100% — Standard','nut','almond_paste',
--     53, 4, 7, 4.5, 22, 0.01, /*water*/ NULL, /*solids*/ NULL, /*fiber*/ NULL,
--     0,0,0,0,0,0, /*pac*/ NULL, /*pod*/ NULL, false, ...),  -- SOURCE REQUIRED for NULLs
--   ('PI-ING-XXXXXX','Erythritol — Standard','sweetener','erythritol',
--     0,0,100,0,0,0, 0, 100, 0, 0,0,0,0,0, /*polyol*/ 100, /*pac*/ NULL, /*pod*/ NULL, false, ...);
```

## Action
Do **not** add these automatically. Surface this proposal to the owner/Colin; once verified
composition + engine-calibrated pac/pod are available from a reliable source, a human applies a
seed migration. See [MAPPER_IMPLEMENTATION_STATUS.md](MAPPER_IMPLEMENTATION_STATUS.md) ("Requires approval").
