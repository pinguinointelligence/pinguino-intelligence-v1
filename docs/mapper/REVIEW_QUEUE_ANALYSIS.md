# Review Queue Analysis — the unmapped products

_Recomputed 2026-06-30. All originally-55 `null` products are composition-complete (≥4 measured
fields + an EAN) — the blocker is candidate ambiguity / red flags / missing references, never
missing data._

## Post-tiebreaker re-audit (2026-06-30) — simulated on LIVE composition data
After wiring `productNameTiebreak` into the matcher, the live composition pools were re-simulated
(SQL replicating `byComposition` + the deterministic concept scorer). Effect on the broad-ambiguous set:
- **Unique narrow (concept_hits = 1 → matcher narrows the pool to one suggestion):** Chocolate blanco
  ×2 (→ the lone white-chocolate ref), Fresas (strawberry, **pool 38 → 1**), Arándanos (blueberry, **41 → 1**).
- **Shortlist ranked (concept_hits > 1 → the right sub-class floats to the top, stays ambiguous for a
  human pick):** Yogur griego ×4 (greek refs), Chocolate con leche ×2 (milk-choc refs), Chocolate negro
  72% (7 dark refs ranked above the rest), Pistacho (2 pistachio refs over 2 peanut).
- **Correctly NOT narrowed (concept_hits = 0 → no name evidence):** almonds ×3 (no almond ref → never
  false-narrow to peanut ✓), plain milks (composition-dominant; "entera/semi" is fat level, not a concept),
  sweeteners (no erythritol/stevia/saccharin ref), protein drinks, composites.

### Decisions executed this block (2 confirmations — DB write)
Both are genuinely unambiguous (the basement holds exactly ONE strawberry ref and ONE blueberry ref;
composition + name agree; nothing else of that fruit exists):
- **PR-ING-000046 Fresas enteras → PI-ING-000406 (Wild Strawberry)** — `matched` / `manual_mapping` / `high` / `pi_generated`.
- **PR-ING-000047 Arándanos → PI-ING-000347 (Blueberry)** — same. Reference-linked; **product pac/pod stay null**.
### Decisions executed (2026-06-30, ranked-shortlist pass) — 2 more confirmations
- **PR-ING-000024 & 000025 Chocolate blanco → PI-ING-000142 (White Chocolate 30%)** — `matched`/`manual_mapping`/`high`/`pi_generated`. The unique white-chocolate within the 7-candidate composition pool; product 35/55/55/6.5/0.2 vs ref 36.1/55/54.6/6/0.21 (Δ0.4-0.6). Reference-linked; **pac/pod null**.
- **Parked with reasons:** Greek yogurts 000016/017 → the only greek ref ("Greek Yogurt — Standard") is **7.5% fat vs the product's 10.8%**; since the engine handoff borrows the *reference's* composition, that would understate fat by 3.3pp → wait for a full-fat greek ref (a new reference gap). 000018/019 (light greek 2%) — no close greek ref either. Milk choc 000026/027 (4-6 equivalent refs), dark choc 000028 (7 dark refs, % matters), pistachio 000035 (raw nut vs 2 paste refs) — all left for human review (the workstation surfaces the ranked sub-class).

Now: **51 null · 15 matched · 15 Studio-eligible.** New reference gap noted: **full-fat (≈10%) greek yogurt**.

### Decisions executed (2026-06-30, milk/dark/pistachio pass) — 1 more confirmation
- **PR-ING-000027 Chocolate con leche fundir → PI-ING-000122 (Milk Chocolate Couverture)** — the clearest milk-chocolate in the pool (Δ0.69; next milk-choc Δ1.70, a 2.5× gap) and semantically apt ("fundir"=for-melting=couverture). Reference-linked; **pac/pod null**.
- **Parked:** 000026 milk choc (3-way tie at Δ1.28); 000028 dark choc (**percent-level ambiguous** — 7 dark refs at 70.5/72/74%); 000035 pistachio (2 close paste/pulp refs vs a raw nut). → **50 null · 16 matched · 16 Studio-eligible.**

### Category-mapping limitation found (2026-06-30) — coffee
The 5 coffee products (000064-068, `product_category` = `flavor`) cannot reach the **coffee references
that DO exist** ("Coffee Bean Roasted Ground", "Coffee Instant Powder", "Grain Coffee") because those
refs sit in `coffee_tea`, which `mapDatasetCategory` maps to engine `flavor` via an **approximation**
(`exact: false`); the matcher's composition/ingredient_type pooling requires an EXACT category on both
sides, so approx-category refs are excluded. This is a **matcher category-mapping constraint, not a
tiebreaker gap** — no name concept can fix it. A safe fix (letting flavor products pool with coffee_tea
refs) would be a scoped matcher change to weigh against mis-pooling tea/other flavors; deferred, not done.
Vanilla 000069 is a separate case: a zero-composition **aroma** vs vanilla **paste** refs (form mismatch).

## Buckets (with next action)

## Buckets (with next action)

### 1. Missing basement reference — BLOCKED until a reference is added (approval-gated)
| products | needs | note |
|---|---|---|
| PR-ING-000040, 000041, 000042 (almendra sin piel / natural / molida) | **almond** reference (`nut` + `almond_*`) | composition researched (USDA FDC 170567); pac/pod team-only |
| PR-ING-000060 (eritritol+sucralosa), 000062 (granulado stevia+eritritol) | **erythritol** + **sucralose**/**stevia** references | also red-flagged |
| PR-ING-000061 (stevia pastillas) | **stevia** reference | also red-flagged |
| PR-ING-000063 (sacarina sobres) | **saccharin** reference (A pure vs B bulked) | also red-flagged |
| PR-ING-000032 (choc 85% edulcorante) | **maltitol/polyol** reference | also red-flagged |
**Action:** add the references (see [BASEMENT_REFERENCE_GAP_PROPOSALS.md](BASEMENT_REFERENCE_GAP_PROPOSALS.md)) — needs the owner + team-calibrated pac/pod. The tiebreaker can't help until the reference exists.

### 2. Red-flag blocked — mapping may proceed but **never auto-verifies** (at most PI Generated)
PR-ING-000009 (+Proteínas milk), 000045 (peanut protein powder), 000051/052 (protein puddings),
000053/055/056 (protein dairy drinks/desserts), 000033 (cacao 0% azúcares), 000057/058/059 (0% jams),
plus the sweeteners in bucket 1. **Action:** leave parked — a protein dessert / sweetener has no clean
single reference and must not reach PI Verified. Surfacing them in the picker would require a mapping
that doesn't yet exist; not safe to force.

### 3. Broad-ambiguous — the **name tiebreaker would help** disambiguate
| group | products | how the tiebreaker helps |
|---|---|---|
| chocolates | 000024/025 (blanco), 000026/027 (con leche), 000028/030 (negro) | `negro`→dark, `blanco`→white, `con leche`→milk-chocolate concepts rank the correct chocolate reference above the others |
| cacao powder | 000034 | `cacao`→cocoa concept |
| coffee | 000064/065/066/067/068 | `cafe`→coffee concept ranks coffee/flavor refs |
| vanilla | 000069 | `vainilla`→vanilla concept |
**Action:** wire `productNameTiebreak` (committed, pure) into the matcher's candidate ranking as a
TIE-BREAK over composition candidates (next block). It only reorders plausible candidates — never
creates a match.

### 4. Broad-ambiguous — **composition-dominant** (tiebreaker limited)
Milks 000002/003/004/005/007/008 (entera/semi/desnatada/sin lactosa) and yogurts/kéfir
000014/016/017/018/019/021/022/023. The tiebreaker maps `leche`→milk / `yogur`→yogurt but does NOT
encode the fat-level (entera vs semi vs desnatada) that actually discriminates — that is composition,
which the matcher already uses. **Action:** rely on the composition matcher; where ≥2 references sit
within tolerance, a brief manual review (fat level) decides. Not safe to auto-confirm.

### 5. Composite / no clean single reference
Cocoa-hazelnut creams 000037/038/039 (nut + cocoa + sugar + oil), fruit blends 000048/049/050
(multi-fruit), pistachio 000035 (pick-which-pistachio). **Action:** manual review or a composite-profile
feature (deferred); a single basement reference cannot represent a blend.

### 6. No source data
**None** — all 55 are composition-complete.

## Enrichment applicability
OFF returns 404 for Hacendado private-label EANs, so online enrichment makes **none** of the 55 newly
decidable. Branded items (Asturiana milk 000005, La Chocolatera cacao 000033) *might* be in OFF, but
they already sit in buckets 2/4 and enrichment wouldn't change their mapping.

## Summary of next actions
1. **Add basement references** (bucket 1) → unlocks ~12 products' mappings (approval + team pac/pod).
2. **Wire the name tiebreaker** (bucket 3) → disambiguates ~8 chocolate/coffee/vanilla products.
3. **Manual fat-level review** (bucket 4) → the milks/yogurts, one quick human pass each.
4. **Leave parked** (buckets 2, 5) → red-flag/composite items with no clean reference.
**No product decisions were executed this block** — none is cleanly + safely decidable yet.
