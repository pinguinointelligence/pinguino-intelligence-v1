# P1-A — DIRECTION SWEETNESS: AUTHORITY DEFECT, STOPPED BEFORE CHANGING NUMBERS

**Status: BLOCKED on an owner decision. No Direction number, band, centre or score was changed.**
Task rule §1: *"If current configured centers/bands do not satisfy this: STOP and report the exact authority
defect before modifying numbers."*

Base: `origin/staging` `b9c4b04597fecb219997bdf55297edb0d67fe4f0`.

---

## 1. The configured target ordering IS correct

`recipeDirectionTargets.ts → targetFifth()` splits the profile POD band into five ordered fifths by
`index = target + 2`. For `standard_gelato` at −12 °C the regulator band is `pod: [12, 17]`, so:

| Direction | Target band | Ordering |
|---|---|---|
| −2 | [12.00, 13.00] | ✔ |
| −1 | [13.00, 14.00] | ✔ |
| 0 | [14.00, 15.00] | ✔ |
| +1 | [15.00, 16.00] | ✔ |
| +2 | [16.00, 17.00] | ✔ |

`−2 < −1 < 0 < +1 < +2` holds **by construction**. The §1 ordering condition is satisfied, so I did not stop
on those grounds.

## 2. The "achieved" gate already uses the DELIVERED metric

`assessRecipeDirection(executableInput, afterResult)` (applyPipeline.ts:1533) compares the delivered
indicator value against the axis target band and sets `reached` from that. `ConstraintPreviewCard` renders
"PI osiągnęło wybrany profil." only when `directionAssessment.reached` is true.

**Consequence — my overnight QA diagnosis was wrong on this point, and I am correcting it.** Re-checking the
served numbers against the bands above:

| Direction | Delivered POD (served) | Target band | Truthful? |
|---|---|---|---|
| −2 | 12.96 | [12,13] | inside → claim correct |
| −1 | 14.00 | [13,14] | inside → claim correct |
| +1 | 15.97 | [15,16] | inside → claim correct |
| +2 | 16.99 | [16,17] | inside → claim correct |

**There is no false-ACHIEVED defect for ±1/±2.** Every non-zero level really did land inside its own fifth and
reported so honestly. The user-visible symptom I reported was real; my attribution of it was not.

## 3. The real defect: NEUTRAL opts out of its own contract

`src/stores/recipeStore.ts:614` (and :1899):

```ts
direction_targets_active: Object.values(profile.directionTargets).some((target) => target !== 0)
```

At Sweetness 0 / Hardness 0 the Direction contract is **inactive**. `buildRecipeDirectionPlan` then never sets
`bands.pod` (`if (enabled) bands.pod = targetBand`), so the optimizer is judged only against the *global* POD
band `[12,17]` and parks the recipe at the nearest legal edge — **17.00**, the band maximum — instead of the
neutral target `[14,15]`.

That is what makes the delivered sequence non-monotonic for a real user:

```
delivered:  −2 12.96  <  −1 14.00  <  +1 15.97  <  +2 16.99  <  0 17.00
                                                                 ^^^^^ neutral is the outlier
```

Asking for "more sweet" yields less sweetness than asking for nothing — not because `+1` is wrong, but because
**`0` was never held to its own target.** Reproduced on both builds (build B: `0` → 16.37, `+1` → 15.98).

The code already documents the intended behaviour — `recipeDirectionTargets.ts:141`: *"the canonical Pro draft
always serializes this object, **including the neutral (0) clean-middle intent**"* — but the store contradicts it.

## 4. Why I did NOT simply activate neutral — the authority conflict

Activating neutral would bind every default Pro recipe to `[14,15]`. That contradicts the owner's own locked
calibration:

| Profile / temp | `pod.lockedReference` | Falls in fifth |
|---|---|---|
| standard_gelato −12 | **15.57** | `+1` band [15,16] |
| standard_gelato −13 | **16.37** | `+2` band [16,17] |

The owner's canonical G17/G18 reference recipes are, under the current fifth mapping, **"+1 sweet" and "+2
sweet"** — they are not in the neutral fifth at all. Activating neutral against `[14,15]` would therefore pull
the locked reference formulations off their approved POD and silently re-calibrate accepted behaviour.

Compare the softness axis, which is done correctly: `softnessBand()` derives neutral from
`regulator.npac.cleanCenter` — an **owner-calibrated clean zone**. **The POD config has no `cleanCenter`.** The
sweetness neutral is a bare geometric fifth of the band, and it disagrees with the locked reference.

### The exact authority defect

> The Gelato sweetness axis derives its neutral target from an arbitrary geometric fifth of the POD band rather
> than from an owner-calibrated clean centre, and that fifth `[14,15]` **excludes the owner's own locked −12
> reference POD 15.57** (and −13's 16.37). Neutral therefore cannot be enforced without either contradicting the
> locked calibration or inventing a new neutral centre — which §1 forbids.

## 5. What the owner must decide (one of)

1. **Add `pod.cleanCenter` per profile × temperature** (mirroring `npac.cleanCenter`), anchored on the locked
   references — e.g. −12 around 15.57, −13 around 16.37 — and derive the five steps outward from it. This is the
   design the softness axis already uses and is my recommendation.
2. **Re-centre the fifths** so the neutral fifth contains the locked reference (i.e. the band or the split
   changes). Changes accepted calibration.
3. **Keep neutral unconstrained but make it honest**: state in the UI that Sweetness 0 means "no sweetness
   objective — general legality only", so a user is not led to read `0` as a sweetness setting comparable to ±1.
   Cheapest, no science change, but leaves the non-monotonic delivered experience in place.

Options 1 and 2 change owner numbers. Option 3 does not. **I have implemented none of them.**

## 6. Not addressed here, and why

§5 (Fructose rescue on Sorbet) and §12 items 1–14 depend on the neutral decision above: a sweep whose neutral
reference is itself untargeted cannot be asserted monotonic. The P1-B work in `c2f4c70` is independent and
complete.

---

# ADDENDUM — the approved `pod.cleanCenter` design was implemented, measured, and REVERTED

Owner decision received: *"Add pod.cleanCenter per profile × temp"*, anchored on the locked references, five
steps derived outward. I implemented exactly that, measured it, and then reverted it. Here is why.

## What was implemented

`sweetnessBandAroundReference(band, lockedReference, target)` in `recipeDirectionTargets.ts`: the clean centre
is the profile's own `pod.lockedReference` (an existing owner number — nothing invented), the neutral zone keeps
its current width (one fifth of the band, i.e. ±1/10 around the centre), and ±1/±2 step outward to the band
edges. Plus `direction_targets_active: true` in `recipeStore.ts`, so the neutral intent is actually applied.

## It works — the primary defect is genuinely fixed

Real Fior di Latte, Gelato −12 °C OPTIMAL, clean baseline per level:

| Direction | New target band | Delivered POD | Inside |
|---|---|---|---|
| −2 | [12.00, 13.54] | 15.67 | ✗ (nearest — honestly reported) |
| −1 | [13.54, 15.07] | 15.67 | ✗ (nearest — honestly reported) |
| **0** | **[15.07, 16.07]** | **15.97** | **✓** |
| **+1** | **[16.07, 16.54]** | **16.26** | **✓** |
| **+2** | **[16.54, 17.00]** | **16.64** | **✓** |

`0 (15.97) < +1 (16.26) < +2 (16.64)` — **the positive branch finally increases sweetness above neutral.** That
is the whole P1-A user complaint, resolved.

## Why it was reverted — three accepted owner flows move

Full suite: **7405 passed, 5 failed** (one is the unrelated `heic-to` env gap, one is the regenerable bundle hash).
The three substantive failures are all *owner-approved* fixtures:

1. **`multiMainIngredient.test.tsx` → "combines Direction with 2:1 Multi-Main and a range constraint"**
   `buildOptimizePreview(...)` now returns **`ok: false`** — the preview no longer exists at all.
   **This is a real regression, not a moved number.** The task's §3 requires an unreachable level to degrade to a
   truthful NEAREST, never to disappear; the Main frontier still treats an unreached Direction target as a hard
   gate, so the tighter neutral makes a previously solvable owner case unsolvable. **This must be fixed before
   the design can ship.**

2. **`stabilizerContractRegression.test.ts` → "Owner Sweetness LESS fixture"**
   Delivered POD moves **14.36 → 15.09**. The −1 target moved, so the fixture's pinned outcome moves with it.

3. **`stabilizerContractRegression.test.ts` → "executable Preview for an Engine-clean but fractional G17 draft"**
   Same class — a pinned metric shifts with the new bands.

4. `gelatoDirectionTargetMatrix.test.ts` → neutral round-trip now scores **9, not 10**: the neutral preview lands
   at POD **15.0651** against a band minimum of **15.07** — a **0.005** miss at the band edge, i.e. honest
   NEAREST rather than a reached target. Note both numbers display as "15.07" at the UI's 2 dp, so the user
   would see an in-band value reported as not reached.

## What is needed before this ships

- **(blocking)** Make an unreached Direction target degrade to NEAREST in the Main frontier instead of
  `no_proposal`, so finding 1 cannot happen. This is the same hard-gate behaviour recorded in the
  2026-08-22 Main-constrained NEAREST work.
- **(owner sign-off)** Confirm the moved values in findings 2 and 3 are acceptable — they are owner-approved
  fixtures, so I will not rewrite them unilaterally.
- **(owner decision)** Finding 4 is a band-edge precision question: either accept honest 9/10 at the edge, or
  decide a tolerance — which is Score-philosophy territory and explicitly out of scope for this task.

The implementation is straightforward to restore (two files: `recipeDirectionTargets.ts`,
`recipeStore.ts`); it is reverted rather than abandoned.
