# GLOBAL ±2 CONTROLLED RELAXATION — owner decision 2026-09-19

One policy, in shared CORE, inherited by every profile, every category, HOME and PRO,
domestic and professional machines. There is no profile branch, no machine branch and no
ingredient branch anywhere in the implementation.

## 1 · Architecture — where it lives, and why there is only one of it

| file | role |
|---|---|
| `src/features/recipe-direction/directionRelaxation.ts` | the primitives. Knows **levels and bands only**: is an extreme level requested, what is the extended band, how far outside a band is a value. No policy, no ingredient, no profile. |
| `src/features/recipe-direction/relaxableRangePolicy.ts` | the **registry**. Which owner bands are relaxable, what leaving one costs, and how to widen a constraint set for Stage B. |
| `src/features/constraint-studio/draftCandidateVector.ts` | `range` is a **search window**, not a hold (§ 3). |
| `src/features/constraint-studio/applyPipeline.ts` | **Stage A → Stage B**, the envelope-aware nearest selector, and the result metadata. |
| `src/features/product-intelligence/ownerInulinPolicy.ts` | one registered policy, judging against the **permitted** band. |
| `src/features/protein-gelato/proteinAuthority.ts` (`recipeFitForInput`) | the **canonical** 1–10 fit, where the single relaxation point is charged. |

`directionRelaxationPermitted(input)` reads the draft's own canonical Direction targets.
That is why nothing needed new plumbing: the solver, practicalization, the policy gates,
the score and the tests all ask the same question of the same object and get the same
answer.

## 2 · Range is not lock

`isHeldByConstraint` treated every non-`ai` constraint as a hold, so
`{ mode: 'range', 20, 80 }` — which says the line MAY move anywhere in the interval —
froze the line wherever it happened to sit. A range is now a window: its **edges are
rungs** (the best amount inside a band is very often the band's boundary, and a ladder
built from fractions of the batch has no reason to land there), rungs outside it are
dropped, `increasable` stops at the maximum, and 0 g is impossible when the floor is
positive. `locked` and `percent` remain holds — a hold is a hold.

This one correction closed LOCK-01, LOCK-02 and LOCK-03 **inside the normal envelope**,
before any relaxation existed. The frontier that had made two Direction levels agree was
never physics; it was an owner preference band being enforced as a freeze.

## 3 · The two-stage search — available at ±2, used only on demand

```
Stage A   normal / ideal envelope          — always, every level, ±1 and ±2 alike
          ↓  only if the ±2 target was not reached
Stage B   controlled extended envelope     — only registered relaxable ranges widen
          ↓  a relaxed candidate wins ONLY by being strictly nearer
          ↓  under the ONE canonical nearest authority, hard-legal throughout
publish   nearest legal result, marked honestly if the target was not reached
```

A ±2 request makes Stage B **available**; it does not make relaxation happen. On equal
nearness the tighter candidate wins. If Stage B finds nothing better, Stage A's answer is
published unchanged with `directionRelaxationAttempted` recorded — "we tried and the
normal result was still best" is itself evidence.

## 3b · A range is a preference — unless it is a structural limit

§ 3 says a `range` means „the line MAY move anywhere inside this interval". That is
right for a dosage PREFERENCE and wrong for a verified calibration envelope, where the
PROFILE places the line and the generic gram search has no authority over it at all.
Conflating the two handed the search a lever on the Vegan inulin envelope, and two
accepted contracts failed for it: the isolated solver lane (inulin reached 95 g against a
calibrated maximum of 83.1 g, and the customer lost the whole Preview to a refusal) and
`veganPersistenceContract`.

`IngredientConstraint` therefore carries `structural?: boolean` on the range variant. It
is set only by an authority that owns a physical or calibrated limit, never by a customer
constraint, and a structural range:

* stays **held** by the generic gram search — exactly as every range behaved before the
  semantics was corrected;
* offers no search window, so no rung can be placed inside it;
* is **never widened** by the controlled ±2 relaxation, whatever interval it carries.

This is § 7 applied to the one place where § 3 could otherwise have weakened a hard limit.
Accepted vegan behaviour is restored byte-for-byte, the ±2 matrix is unchanged, and § 3
keeps full effect everywhere the range really is a preference — which is where LOCK-01,
LOCK-02, LOCK-03 and SORB −13 were won.

Two authorities may also govern the SAME line. They now INTERSECT rather than
first-wins: the floor is the higher of the two and the ceiling the lower, so no authority
can be widened by another, and Stage B re-applies the holds after widening so a widened
preference can never carry a structural ceiling with it.

## 4 · What may be relaxed — explicitly, per policy

A range earns relaxability only by being registered, because every constraint keeps its
own semantic authority.

**Registered:** the published Gellatti inulin dosage preference (2–8 % of the batch).

**Deliberately not registered:** the vegan inulin **structure ceiling** — a calibration
limit, not a preference. Nor is anything hard: safety, physically invalid formulation
boundaries, machine limits, process impossibilities, batch capacity, Main/Crown, explicit
user locks, exact values, genuinely hard profile constraints.

A customer's own `range` is never widened either: Stage B only replaces a band that is
still carrying the policy's own interval byte-for-byte.

The next relaxable owner band is **one entry** in `RELAXABLE_POLICIES`, and every profile,
category and machine inherits it at once.

## 5 · The extension, and the score

Each boundary extends by 50 % of its own value, always computed from the **original**
bounds, so it can never compound: `20–80 g → 10–120 g`, `100–200 g → 50–300 g`.

The public quality cost of controlled relaxation is **one point. Never more.** Inside every
owner band it is zero. It is the same single point whether the excursion is barely outside
the normal band, midway through the approved emergency range, or at its boundary, and the
same single point whether one registered range was left or several. Using more of an
envelope the owner explicitly approved is not a second defect.

Severity is **not** lost — it is simply not on the public integer:

* `relaxationCost` — one bounded value in [0, 1] for the whole recipe;
* `normalizedExcursion` — per range, 0 inside, 1 at the approved edge;

and those rank candidates, break ties, drive diagnostics and are what any future
refinement of the public scale would read. 81 g and 120 g are **not** equivalent
internally; 120 g carries the higher cost and loses to 81 g whenever target quality is
otherwise equal. If 120 g is nevertheless the only candidate that safely reaches the
requested level, it is VALID and still costs one public point.

Other authorities keep their own weight. The penalty is subtracted from whatever the
canonical seam already decided, so a genuine quality defect is never masked.

## 6 · The registered owner range, walked end to end

`normal 20–80 g · emergency 10–120 g` (policy `gellatti-generic-inulin`, 1000 g batch)

| dose | zone | ±2 | ±1 | `relaxationCost` | public | fit |
|---|---|---|---|---|---|---|
| 9 g | outside | REFUSED | REFUSED | 1.0000 | −1 | 6/10 |
| 10 g | emergency edge | **VALID** | REFUSED | 1.0000 | −1 | 6/10 |
| 15 g | emergency | **VALID** | REFUSED | 0.5000 | −1 | 6/10 |
| 20 g | normal floor | VALID | VALID | 0.0000 | −0 | 7/10 |
| 50 g | normal | VALID | VALID | 0.0000 | −0 | 8/10 |
| 80 g | normal ceiling | VALID | VALID | 0.0000 | −0 | 7/10 |
| 81 g | emergency | **VALID** | REFUSED | 0.0250 | −1 | 6/10 |
| 100 g | emergency | **VALID** | REFUSED | 0.5000 | −1 | 6/10 |
| 120 g | emergency edge | **VALID** | REFUSED | 1.0000 | −1 | 4/10 |
| 121 g | outside | REFUSED | REFUSED | 1.0000 | −1 | 4/10 |

±1 can never leave 20–80. ±2 is valid across the whole approved envelope and refused
outside it on both sides. The public relaxation cost is one point everywhere it applies —
the 4/10 rows are *other* authorities reporting real technical defects at that dose, which
is exactly what "do not suppress real defects" requires.

## 7 · SORB −13 — the mathematics, through all three states

| level | original | after `range != lock` | with Stage B |
|---|---|---|---|
| −2 | 17.1132 (d 1.1132) | 16.7716 (d 0.7716) | **16.3107 (d 0.3107)** |
| −1 | 17.9408 (d 0.0592) | 17.9841 (d 0.0159) | 17.9841 — **unchanged** |
| 0 | 20.0325 (d 0.0325) | 19.9972 (d 0.0028) | 19.9972 — unchanged |
| +1 | 21.7877 (d 0.2123) | 21.9830 (d 0.0170) | 21.9830 — **unchanged** |
| **+2** | **21.7877 (d 2.2123)** | 23.7572 (d 0.2428) | **24.0012 (d 0.0012)** |

SORB −12 +2: 23.3661 (d 0.6339) → **23.9873 (d 0.0127)**.

The ±1 and 0 rows are byte-identical to the normal-envelope run. That is the proof that
±1 never expands — not an assertion about it.

Nothing about this fixture is special-cased. The same shared code produced every row.

## 8 · The audited cells, re-measured

| cell | distance | envelope | relaxation | reached |
|---|---|---|---|---|
| OD-28 | **0.00000** | normal | 0.000 | **yes** |
| LOCK-01 | **0.00000** | normal | 0.000 | **yes** |
| LOCK-02a | 0.02000 | normal | 0.000 | no |
| LOCK-02b | 0.02000 | normal | 0.000 | no |
| LOCK-02c | 0.76763 | normal | 0.000 | no |
| LOCK-02d | 0.02829 | normal | 0.000 | no |
| LOCK-02e | 0.02000 | normal | 0.000 | no |
| LOCK-03 −1 | 0.02000 | normal | 0.000 | no |
| LOCK-03 −2 | 0.02000 | normal | 0.000 | no |
| CONTROL-C2 | 0.02000 | normal | 0.000 | **still refuses** |

The 0.02000 floor is the Sorbet exact-preference point (`min = max`, AUD-SWEET-05): no
non-zero Sorbet level can be formally `reached` at whole grams however near the candidate
is. It is not a search failure, and it is not relaxation — every one of these cells is
answered inside the **normal** envelope, which is why `relax` is 0.000 throughout.

LOCK-03 now returns a DIFFERENT vector per level, so the finding closes on its own
mathematics. Nothing forced a difference and nothing forced equality.

## 9 · One policy across profiles and machine families

24 cells: 4 canonical Direction profiles × the six customer-visible machine/serving
choices × −2 / −1 / +1 / +2. Machine families differ only by their real physical facts,
read from `customer-flow/servingMode.ts` — Ninja Gelato −13 at 700 g, Ninja Swirl −11 at
480 g, Świeże −11, and the three professional direct modes at 1000 g.

* **±1 relaxed in ZERO cells**, on every profile and every machine.
* **±2 relaxed in three cells only** — sorbet −12 +2, sorbet −13 −2, sorbet −13 +2 —
  where the normal envelope was genuinely insufficient.
* one honest refusal (gelato on Ninja Gelato at +2) instead of a fabricated answer.

No cell pins a POD. The assertions are the policy, so the matrix proves shared behaviour
rather than shared numbers.

## 10 · Test classes (§ 18)

`controlledRelaxation.policy.test.ts`, `controlledRelaxation.matrix.test.ts`,
`controlledRelaxation.evidence.test.ts`, `directionFalseInfeasible.regression.test.ts`.

A range participates and is bounded, a lock and a percent are still held (A) · a normal
result stays normal and is never priced (B, M) · ±1 never expands and an inactive request
never permits it (C) · ±2 expands only on demand (D) · 50 % each side, never compounding,
nothing past the approved band on either side (E) · valid inside the emergency band at ±2,
a breach beyond it and a breach at ±1 (F) · a relaxed recipe scores lower (G) · the
excursion is proportional and equal for the same RELATIVE excursion on a 20–80 and a
100–200 band (H) · the lower side too (I) · a hard lock is immovable during ±2 (J) · a
physical impossibility stays impossible (K) · nearest legal fallback (L) · one point,
never stacked (N) · OD-28 (O) · AUD-SWEET-13 (P) · four genuine-infeasible controls, each
unreachable through a different authority (Q).
