# Review Queue Analysis — the 55 unmapped products

_Recomputed 2026-06-30. Read-only analysis; **no mapping decisions were forced.** All 55 `null`
products are composition-complete (≥4 measured fields + an EAN) — the blocker is candidate
ambiguity / red flags / missing references, never missing data._

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
