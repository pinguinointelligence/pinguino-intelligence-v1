# Basement Reference Insert Candidates

> **PROPOSAL — NOT APPLIED.** No write to `mapper_basement`. Per the rule "do not write unless
> EVERY required value is sourced and provable", these are **not** applyable today: the engine
> `pac_value`/`pod_value` are PINGÜINO-specific and **not publicly sourceable** — only the team's
> calibration can produce them. Composition is partly public/label-sourced. 2026-06-29.
>
> Builds on [BASEMENT_REFERENCE_GAP_PROPOSALS.md](BASEMENT_REFERENCE_GAP_PROPOSALS.md) (label data).

## Code procedure
`mapper_basement.ingredient_id` is manually-assigned `PI-ING-NNNNNN` (no DB sequence). Current count 542, max `PI-ING-000544`. **Next free codes: `PI-ING-000545`+** — final codes assigned by the team at insert time (do not hardcode in a data migration).

## Source search
- **Google Drive**: the only catalog source ("Mercadona_catalog") carries the *product* labels, not reference-ingredient profiles — no PAC/POD, no water/solids/sugar-split (confirmed). No reference dataset for almond/erythritol/stevia is in Drive.
- **Public sources (composition only, free, no API/secret)**: almond is a stable whole food (USDA-type proximate data); erythritol/sucralose/steviol-glycoside composition is well-documented. **PAC/POD are NOT public** for any of them.

## Candidates

### A. Almond paste / ground — `nut_paste` (proposed `PI-ING-000545`)
- **Unlocks**: PR-ING-000040, 000041, 000042 (Almendra sin piel / natural / molida).
- **Sourced (label + public, high confidence)**: fat ≈ 53, saturated_fat ≈ 4, protein ≈ 22, carbohydrate ≈ 7 (available), salt ≈ 0.01, water ≈ 4, total_solids ≈ 96, fiber ≈ 12 (public). Sugar is low (~4.5) and mostly sucrose (public).
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

## Why no migration/seed file is provided to apply
Phase rule: apply only when every required value is sourced + provable. **PAC/POD for all four are not sourceable** (engine-specific) → an applyable seed cannot be produced honestly. A proposal-only template (with `NULL -- SOURCE REQUIRED` pac/pod) is in [BASEMENT_REFERENCE_GAP_PROPOSALS.md](BASEMENT_REFERENCE_GAP_PROPOSALS.md).

## Caveat (unchanged)
Even after insertion, products mapping to erythritol/stevia/sucralose are **red-flagged** (`sweetener_or_polyol`) and **never auto-verify** — at most PI Generated / Manual Adjusted.

## Action
Surface to the owner. A human inserts these (with team-calibrated PAC/POD) into `mapper_basement` via a seed migration once values exist. **Approval required** — locked base.
