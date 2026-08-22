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
