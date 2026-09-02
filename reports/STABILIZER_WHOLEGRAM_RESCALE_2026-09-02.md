# CENTRAL FRACTIONAL-RESCALE FIX — whole-gram stabilizer projection
**2026-09-02 · PR #121 · branch `claude/stabilizer-wholegram-rescale`**

## 1. Root cause, in one sentence

`rescaleWithOwnerStabilizerSystem` was **named** for the owner authority but
**wired** to the Sorbet helpers, so the PC-02 whole-gram projection reached only
Sorbet — and every other product type kept the fractional proportional result.

The chain it caused:

```
batch rescale (proportional)      →  TARA GUM 3 g @1000 g becomes 2.0100000000000002 g @670 g
withTemplateControlledStabilizerLocks  →  synthetic {mode:'locked', grams: 2.0100000000000002}
mainTechnicalLinearUpperBound     →  integerSolutionCertified = false
projectManualIngredientTarget     →  requires integer certification → discards all 671 candidates
```

The helper's own comment already named the symptom — "*a legal 5 g system at
1000 g arrived at 670 g as 1.34 g + 2.01 g*" — and already said "*the canonical
authority projects the system onto the new band*". The comment described the
intended design; only the Sorbet wiring shipped.

## 2. What changed

| File | Change |
|---|---|
| `ownerStabilizerRescaleProjection.ts` (new) | the PC-02 algorithm **verbatim**, bound to `ownerStabilizerWholeGramBand` |
| `ownerStabilizerSystemAuthority.ts` | `ownerStabilizerWholeGramBand(category, grams)` — dispatch over the two **already published** bands |
| `sorbetStabilizerRescaleProjection.ts` | reduced to the Sorbet guard + delegation |
| `recipeStore.ts` | uses the owner helpers it was named for |

**No new policy. No new percentage. No local `Math.round`** beyond the existing
algorithm's own largest-remainder arithmetic. **Real user hard-locks untouched** —
this is only the synthetic template hold; `practicalRecipe.ts` still refuses a
fractional user lock as `exact_gram_lock_not_whole_gram`.

## 3. THE PROOF — zero fractional stabilizers where a whole-gram policy applies

`ownerStabilizerRescaleProjection.test.ts`: **6 governed categories × 8 batch
transitions**, every resulting gram asserted whole and within the published band.

Measured end-to-end through the real store (`startNewRecipe` → machine resize):

| profile | batch | policy applies | TARA GUM | fractional stabilizers | fractional synthetic locks | LP integer |
|---|---|---|---|---|---|---|
| GELATO | 670 | yes | **2** | **0** | **0** | **true** |
| GELATO | 500 | yes | **2** | **0** | **0** | **true** |
| GELATO | 1400 | yes | **4** | **0** | **0** | **true** |
| SORBET | 670 / 500 / 1400 | yes | 3 / 2 / 6 | **0** | **0** | unchanged |
| VEGAN | 670 / 1400 | **no** | 1.34 / 2.8 | 1 | 1 | false |
| PROTEIN | 670 / 1400 | **no** | 1.34 / 2.8 | 1 | 1 | false |

**Gelato: 0 fractional cases at every batch tested.** Sorbet unchanged.

## 4. Mandatory rerun

| axis | result |
|---|---|
| **Gelato** | fixed — see above |
| **Sorbet (control)** | byte-identical; asserted entry-point-vs-projection on 3 transitions |
| **Vegan / Protein** | unchanged — no published band (§5) |
| **Crown ON** | `mainTechnicalMaximum` 46/46 in isolation |
| **Crown OFF unlocked** | manual-target projection: 671 evals/no proof → **66 evals + proof** |
| **Crown OFF locked** | unchanged — constrained lines are never manual targets |
| **manual gram edit** | Gelato 992 ms → **7 ms** LP; projection 43 ms |
| **batch rescale / rescue** | `recipeStore.sorbetStabilizerRescale` + `starterReservation` green |
| **Multi-Main** | `proteinMultiMainPositive` + profile matrix green |
| **Preview / Apply** | `constraintStudioStore`, `zeroGramExecutableInvariant` green in isolation |
| **runtime / LP evaluation count** | **671 → 66** evaluations, **992 ms → 7 ms** |

**Full suite after the fix: 175 files, 2430 passed, 119 skipped, 0 failed.**
(An earlier run of the same selection showed 4 timeout failures under heavier
machine load — CI's two isolated GEL-P0-024 lanes plus two 5 s-default tests
starved by them. Each passed in isolation then, and all pass in the clean run
now.)

## 5. OPEN — Vegan and Protein need an owner policy decision

`ownerStabilizerSystemApplies('vegan_gelato' | 'protein_gelato')` is **false**:
no whole-gram stabilizer band is published for either. This is not an oversight —
an existing contract asserts the exclusion explicitly:

```ts
// gelatoStabilizerSystemAuthority.test.ts:87
for (const category of ['sorbet', 'vegan_gelato', 'protein_gelato'])
  expect(assessGelatoStabilizerSystem(recipe(1_000, [6], category)).applicable).toBe(false);
```

**Measured cost of extending the Gelato band to them** (experiment run, then
reverted — not in this PR):

- fractional stabilizers → **0**, LP integer certification → **true** at every batch;
- but the stabilizer DOSE changes: vegan/protein TARA GUM **1.34 g → 2 g** at
  670 g and **2.8 g → 4 g** at 1400 g, because the Gelato band's minimum is
  `ceil(0.2% × batch)`;
- **7 existing tests fail**, including the explicit exclusion contract above.

So it is a real formulation-policy change for two profiles, not a wiring fix.
It needs an owner decision and its own blast-radius pass.

## 6. Owner-locked contract — approval required

`sorbetBatchRescaleStabilizer.contract.test.ts` pins the Sorbet-scoped **names**
of this wiring. Its *intent* — "the projection owns no limit of its own; the
store restates no ceiling" — is preserved and now asserted on **both** files.
Its literal assertions could not survive the rewiring the owner ordered.

The guard blocks this by design and will not be self-approved.
