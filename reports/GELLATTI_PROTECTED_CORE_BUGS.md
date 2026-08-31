# GELLATTI — PROTECTED CORE BUGS (recorded, NOT modified)

Defects found inside the protected ice/Workbench core (Engine, Solver,
POD/PAC/NPAC, profile bands, Gelato/Sorbet/Vegan/Protein rules,
Crown/Main/Multi-Main, Direction, batch mathematics, Recalculate,
Recipe/Monitor, Production and Label calculations).

**None of these were fixed by the acceptance run.** Each entry carries an exact
reproducible fixture so the owner can write a separate surgical prompt.

**PC-01 and PC-06 have since been closed** under their own dedicated prompts — see the
close-out notes under those entries. PC-02…PC-05 remain open and untouched. PC-07 was observed while proving PC-06, and has since been closed under the
same autonomous run.

- First observed on staging `04106031` (branch `claude/gellatti-full-app`, based on `origin/staging` 1a10f7cf).
- Account: `test1@test1.com` (PRO), staging project `tunabqqrwabacxjcxxkz`.
- Harness: `npm run acceptance:matrix` →
  `src/features/acceptance/__campaign__/fullRecipeMatrix.acceptance.test.ts`.
  It uses the real canonical starters, the **real staging
  `resolve_product_behavior_v1` verdict for every line**, and the real
  Preview / Apply / Save doors. Full ledger:
  `reports/GELLATTI_FULL_RECIPE_MATRIX.jsonl` (1304 cells).
- **Reproducibility:** the whole matrix was run twice, the second time after the
  harness moved to `src/qa/acceptance/**`. Both runs returned the identical
  verdict — 1304 cells, 1163 PASS, 141 REFUSED, 0 axis mutations, and the same
  refusal cluster sizes (53 / 34 / 22 / 15 / 9 / 8). Every bug below is
  deterministic, not a one-off.
- Reproduce one cluster: `QA_MATRIX_SUITES=isolation npm run acceptance:matrix`
  (or `direction`, `machines`, `toppings`), seed `20260829`.

## Matrix headline

| Metric | Result |
|---|---|
| Cells exercised | **1304** |
| PASS (Preview → Apply → Save → reopen) | **1163** |
| REFUSED | **141** |
| **Direction axis cross-contamination** | **0 of 1163 applied cells** |
| Profiles | Gelato, Sorbet, Vegan, Protein (326 cells each) |
| Machines | 12 (Professional, 10 Home profiles, Custom) |
| Serving modes | Świeże, −11 °C, −12 °C, −13 °C |
| Direction combinations | 25 (Sweetness −2…+2 × Hardness −2…+2) |
| Unique ingredient identities | 33 |
| Unique topping identities | 12 |

**A3 result — the regression the brief targets does NOT reproduce.** Across 288
sequential single-axis cases (commit a neutral recipe, then move exactly one
axis) and 800 direct Direction cases, `axis_mutation` is `none` in every
applied cell: a Hardness-only request never rewrote the Sweetness intent, and a
Sweetness-only request never rewrote the Hardness intent.

---

## PC-01 — Sorbet at −12 °C OPTIMAL cannot move Direction at all

| | |
|---|---|
| **SEVERITY** | HIGH — a whole profile/temperature/mode cell is a dead end |
| **FIRST OBSERVED SHA** | `04106031` (present on `origin/staging` 1a10f7cf) |
| **PROFILE** | Sorbet (`sorbet`) |
| **MACHINE** | Maszyna profesjonalna |
| **TEMPERATURE** | −12 °C (`temp_minus_12`) — **only this one** |
| **MODE** | OPTIMAL — **only this one** (−12 ECO answers all 8) |
| **BATCH** | 1000 g |
| **EXACT INGREDIENTS** | `PI-ING-000514` SUCROSE 46 g · `PI-ING-000494` DEXTROSE 93 g · `PI-ING-000456` INULIN 20 g · `PI-ING-000492` TARA GUM 4 g · `PI-ING-000359` RASPBERRY (Frozen Fruit) 807 g · `PI-ING-000342` APPLE puree 30 g |
| **TOPPINGS** | none |
| **MAIN/CROWN** | `PI-ING-000359` held as MAIN (line `acceptance-main-PI-ING-000359`) |
| **LOCKS** | none |
| **SWEETNESS** | 0 → each of −2, −1, +1, +2 |
| **HARDNESS** | 0 → each of −2, −1, +1, +2 |
| **ACTION SEQUENCE** | 1. Build the canonical Sorbet starter at −12 °C OPTIMAL 1000 g. 2. Add the raspberry Main (600 g requested by `missingMainMassGrams`) and the rotating apple line. 3. Przelicz at (0,0) → **succeeds**, score 78.06, applied and saved. 4. From that applied state request **one** axis change. |
| **EXPECTED** | Either a legal proposal, or the accepted NEAREST fallback with a truthful consent, or an honest "already_clean". |
| **ACTUAL** | `buildOptimizePreview` returns `no_proposal` for **all eight** single-axis requests — both axes, both directions. |
| **SCORE / POD / PAC / NPAC** | baseline 78.06 / — (no proposal is produced, so none is reported) |
| **CONSOLE / NETWORK** | No error; the refusal is the pipeline's own `no_proposal` code. |
| **REPRODUCED** | 8/8 requests in the same run; the identical recipe at `fresh`, `temp_minus_11`, `temp_minus_13` and at `temp_minus_12` ECO answers 9/9. |
| **LIKELY ROOT AREA** | Sorbet Direction search at −12 °C under OPTIMAL — the exact projection, `searchSorbetNearestDirectionCandidate` and the ladder all return nothing while `buildRecipeDirectionPlan` still reports **both axes `working`**. The plan promises an axis the search cannot move. |


### PC-01 — CLOSED on staging `1c9108f5`

The forensic answer was that the **refusal is correct and the classification is
not**. The −12 °C OPTIMAL draft sits inside every approved band; the requested
Direction cannot be improved without leaving one; the NEAREST retry returns the
same recipe with its lines re-ordered, so `materiallyDifferent` is false and the
candidate is rightly non-publishable. What was wrong is that the customer read
*"Nie znaleziono korekty możliwej przy obecnych **blokadach** … Użyj «Sprawdź
wykonalność blokad»"* — on a recipe with **no locks**.

Fixed in PR #36, presentation only: `previewIssueMessagePl` now reads the
pipeline's own `directionTargetUnreached` verdict and hands over the existing
canonical `copy.previewIssue.bestSafeResult`. No new copy, no new terminal
vocabulary, no localisation key. `applyPipeline.ts` was **not** modified;
`publishable = reached || materiallyDifferent` is untouched; the internal result
is still `no_proposal` with `directionTargetUnreached: true`, which is the
accurate pipeline truth.

The earlier instruction to return `best_safe_result` as the pipeline code was
withdrawn on evidence: it is a proof-carrying variant whose producer only emits
it when `hardMetrics === 0 && softMetrics > 0` — false here — and which demands
`solverInvocations`, `bandSource`, `templateId` and `evidence` that
`enforceTargetBatchInvariant` never receives. Emitting it there would have meant
inventing proof.

8/8 single-axis requests render the canonical sentence with the grams unchanged;
the −12 ECO, −11 and −13 controls still answer `ok · UNREACHED`. **PC-02 and
PC-03 are untouched** — PC-03 surfaces `unsafe_proposal`, whose variant has no
`directionTargetUnreached` field at all, so the predicate cannot reach it.
Full capture in `reports/e2e/screenshots/pc01-direction-local-optimum.txt`.

---

---

## PC-02 — CORRECTED · batch rescale can manufacture an authority-invalid Sorbet stabilizer system — **FIXED**

> **THE ORIGINAL ROOT-CAUSE NARRATIVE IS WITHDRAWN.** It was recorded from the
> acceptance matrix, and forensic work at `cdfabcad` disproved it. The record is
> corrected here rather than preserved, because a false cause is worse than no
> cause: it would have sent the next reader to weaken the stabilizer authority.

### What was originally recorded, and why it is wrong

| | |
|---|---|
| **ORIGINAL CLAIM** | "The Sorbet candidate ladder can raise the stabilizer system above the profile ceiling." |
| **VERDICT** | **REJECTED BY EVIDENCE.** The Solver never raises it. In the recorded exemplar the failing candidate carries the stabilizer system through **unchanged** at 34 g; only the non-stabilizer lines are rescaled. |
| **ORIGINAL CLAIM** | "The **input** is inside the limit (TARA GUM 4 g); the **proposal** is not." |
| **VERDICT** | **REJECTED BY EVIDENCE.** It counted one member of a two-member system. `PI-ING-000306` VITACEL CITRUS FIBER resolves to functional role `stabilizer`, exactly like `PI-ING-000492` TARA GUM. The system is 4 g + 30 g = **34 g against a 5 g ceiling** — the input is already 29 g over the limit, `aggregate_above_maximum`, before any recalculation. The refusal was correct. |
| **THE 34 g EXEMPLAR** | **INVALID HARNESS ARTEFACT / NOT CUSTOMER-REACHABLE.** The matrix constructed `RecipeInput` objects directly and bypassed the product's own doors. `addIngredient(VITACEL, 30)` lands **1 g**; `clampSorbetStabilizerComponentGrams` returns `{grams: 1, clamped: true}` with the correct message. No customer can enter that state. Same class of mistake as the PC-06 seeder. |
| **NOT A DEFECT** | The 5 g figure, the authority, and the customer-facing rejection copy. `SORBET_STABILIZER_SYSTEM_POLICY` is a **percentage** (min 0.2 % · preferred 0.4 % · **max 0.5 %**, rounded inward to whole grams). "5 g" is what 1000 g derives — 250 g→1 · 500 g→2 · 670 g→3 · 1000 g→5 · 1430 g→7 · 1900 g→9 · 2000 g→10. Nothing may hard-code it. |

### The real defect the forensic work found — customer-reachable

| | |
|---|---|
| **SEVERITY** | HIGH — a batch change alone produces a draft the Apply door then refuses |
| **PROVEN ON** | `947ea2b7` (staging), through the store's own public API only |
| **PROFILE** | Sorbet |
| **BATCH** | any shrink; **670 g is the Ninja CREAMi Deluxe capacity** — a real supported HOME machine, reachable since the machine-preference work (GEL-P0-022) |
| **ACTION SEQUENCE** | Build a legal 1000 g Sorbet whose stabilizer system is at the ceiling (TARA GUM 2 g + a second stabilizer 3 g = 5 g, both reached through `addIngredient` and its own clamp) → change the batch to 670 g. |
| **EXPECTED** | The stabilizer system arrives whole-grammed and inside the band the new batch derives. |
| **ACTUAL (before the fix)** | `resizeRecipeBatch` scaled it by the one proportional factor: **1.34 g + 2.01 g = 3.35 g** against the 3 g ceiling at 670 g — fractional **and** over the maximum. `evaluateRecipeConstraintAuthority` returned `valid: false` with `component_not_whole_grams` **and** `aggregate_above_maximum`. Also reproduced at 500 g (2.5 g vs 2 g) and 250 g (1.25 g vs 1 g). Scaling **up** was already correct. |
| **WHY IT HAPPENS** | The ceiling is a percentage that rounds **inward**, so it FLOORS as the batch shrinks while the proportional mass does not — the mass therefore always lands above the new ceiling, and never on a whole gram. |
| **WHY IT WAS CAUGHT LATE** | The authority is evaluated only at the Apply door (`applyPipeline.ts` filters `source === 'owner_policy'`); nothing consults it during a batch change. `clampOwnerStabilizerComponentGrams` was already wired into `addIngredient`, `IngredientBuilder` and `directPercentEdit` — but not into the rescale. |
| **CUSTOMER IMPACT** | Przelicz did repair it (tara 2 g + fibre 1 g = 3 g), so the customer was not stuck — but they held an authority-invalid draft in between, and any Apply from that state was refused. |

### The fix

`recipeStore.setBatchGrams` now projects the stabilizer system through the SAME
canonical authority — `planSorbetStabilizerSystemRescale`, which reads only
`sorbetStabilizerWholeGramBand`. The projection lives BESIDE the authority
rather than inside it: `sorbetStabilizerSystemAuthority.ts` is one of the 60
files in the security-reviewed Production Rescue Edge source closure
(GEL-P0-018), and a Studio-side batch repair has no business enlarging that
closure with code Rescue never calls. The authority file is byte-identical to
staging and the Edge bundle is untouched. No second policy, no literal ceiling, no change
to the authority's limits, the Solver, ProductBehavior, Mapper, HOME/PRO,
Production or Rescue. The aggregate is the proportional total rounded to whole
grams and capped by the new ceiling (so scaling **up** is never clamped away);
it is raised to the new minimum only when the system already held its own; and
it is split by largest remainder, which preserves the existing composition as
closely as whole grams allow. The ordinary lines absorb the difference through
that same resize authority, so the draft still sums to one batch.

| rescale | before | after | derived band `{min, preferred, max}` | whole grams | authority |
|---|---|---|---|---|---|
| 1000 → 670 | 2 g + 3 g | **1 g + 2 g = 3 g** | {2, 3, 3} | yes | no issue |
| 1000 → 500 | 2 g + 3 g | **1 g + 1 g = 2 g** | {1, 2, 2} | yes | no issue |
| 1000 → 250 | 2 g + 3 g | **0 g + 1 g = 1 g** | {1, 1, 1} | yes | no issue |
| 1000 → 2000 | 2 g + 3 g | **4 g + 6 g = 10 g** | {4, 8, 10} | yes | no issue |
| 1000 → 1430 | 2 g + 3 g | 3 g + 4 g = 7 g | {3, 6, 7} | yes | no issue |
| 1000 → 1900 | 2 g + 3 g | 4 g + 5 g = 9 g | {4, 8, 9} | yes | no issue |

**Three live routes change the batch, and all three are covered.** The manual
Partia edit (`setBatchGrams`) was only the first: **choosing a machine**
(`setMachineSelection`) is the owner's own headline route — 670 g is not usually
typed, it is what the Ninja CREAMi Deluxe imposes when the customer selects it —
and switching product type on a Home machine re-derives its default batch
(`setVisibleProductType`). Selecting the Deluxe was verified still broken after
the first fix (`1.34 g + 2.01 g`, both codes) and is now `1 g + 2 g`, valid. All
three call the one shared projection.

The two remaining resize sites, `resolveProfileBatch` and `resolvePayloadBatch`,
are reached only from `loadRecipeInput` and `resetToDemo` — load paths, left
untouched under the owner's instruction not to broaden PC-02 into the load path
without first reproducing a customer-reachable load defect.

At 250 g the whole system may weigh 1 g, so two components cannot both carry
mass and one reaches 0 g. That is the policy's own arithmetic, and it is not a
new state: add-time clamping already produces a 0 g stabilizer line when the
ceiling is full. It also lands exactly inside the canonical zero-gram rule that
`practicalRecipe.ts` already states — *"When the Engine resolves such a line to
exactly 0 g, the executable recipe OMITS the row: 'not used' is the absence of
the ingredient, never an explicit 0 g ingredient row."* The draft keeps the row
so the customer can raise it again; `unusedZeroGramLineIds` omits it from the
executable recipe; the row is not a ghost, because `missingAmount` needs an
UNKNOWN dose provenance, which a catalogue stabilizer does not have. No special
behaviour was invented, and the projection only ever runs on lines that satisfy
`isOmittableUnusedLine` — unlocked, unweighed, and free of gram, percent and
range contracts.

Repeated resizing is lossy once and then stable, which whole grams make
unavoidable: `2+3 → (670) 1+2 → (1000) 1+3 → (670) 1+2 → (1000) 1+3`. Every
intermediate state is authority-valid and the sequence is deterministic; exact
restoration of the original split is mathematically impossible through a 3 g
ceiling and is deliberately not faked.

Locked by `GEL-P0-023` (`sorbetBatchRescaleStabilizer.contract.test.ts`) and by
`recipeStore.sorbetStabilizerRescale.test.ts`, which builds every fixture
through the customer's own doors and never as a `RecipeInput`.

### SERVED QA — staging `1e9580e0`, bundle `index-BEjANf2j.js`

Run on https://staging.pinguinoai.com against the deployed bundle, through the
real HOME shell — which the architecture rule makes a simplified presentation
over the same shared `recipeStore`, so it exercises the canonical routes and not
a HOME-specific path. Every state was reached by clicking the product's own
controls: the idea input, the Sorbet profile, the machine picker and the amount
field. No `RecipeInput` was constructed, and no store method was called directly
— the lesson the original 34 g fixture taught. Site data was cleared once
beforehand, which is simply a first-time visitor.

Recipe: **„Strawberries · Fresh Fruit Sorbet"**, `category: sorbet`. Grams are
masked in the signed-out view (`🔒 ••• g`), so the figures below are read from
the persisted store `pinguino-recipe` — the served application's own state.

| # | route | batch | stabilizer | total | derived band {min, pref, max} | whole | ≤ max | Σ recipe |
|---|---|---|---|---|---|---|---|---|
| **A** | **SELECT Ninja CREAMi Deluxe** (`setMachineSelection`) | **670** | **3 g** | 3 | {2, 3, 3} | yes | yes | 670.000 |
| — | select Cuisinart ICE-30 (`setMachineSelection`) | 1900 | 9 g | 9 | {4, 8, 9} | yes | yes | 1900.000 |
| **B** | manual 1000 → 500 | 500 | 2 g | 2 | {1, 2, 2} | yes | yes | 500.000 |
| **C** | manual 1000 → 250 | 250 | 1 g | 1 | {1, 1, 1} | yes | yes | 250.000 |
| **D** | manual 1000 → 2000 | 2000 | 8 g | 8 | {4, 8, 10} | yes | yes | 2000.000 |
| **E** | 1000 → 670 → 1000 | — | 4 → 3 → 4 g | — | — | yes | yes | exact each step |

**A** was verified on the freshly selected machine **before any Przelicz**:
`batch_source: MACHINE_DEFAULT`, `machineId: ninja-creami-deluxe-nc502eu-eu-es`,
`machine_capacity_grams: 670`, TARA GUM exactly 3 g — whole, and exactly the
maximum 670 g derives. No invalid intermediate recipe exists at any point.

**D** lands on 8 g, not the 10 g ceiling, because the proportional total from the
preceding state is 8 — it is not clamped, which is the point: scaling up is
never pulled down.

**E** repeats without drift: 4 → 3 → 4 → 3 → 4, every state authority-valid.

The ICE-30 row is included because it is the same route at a different capacity
and it is the clearest before/after: the Sorbet starter carries 4 g of TARA GUM
at 400 g, so the old proportional rescale would have produced **19 g** at
1900 g — more than double the 9 g that batch derives.

### Deliberately left open

* **The Gelato stabilizer system has the same 0.5 % ceiling and the same
  proportional rescale**, so the identical defect exists there. Out of scope by
  instruction ("non-Sorbet batch rescaling is unchanged") — recorded, not fixed.
* **`loadRecipeInput` does not re-clamp** a stabilizer system on load. Technical
  debt; no customer-reachable load defect was demonstrated, so the load path was
  not touched.
* **A gram-locked or percent-locked stabilizer** is left to its lock: the
  projection stands down rather than overruling an explicit instruction, and the
  Apply-door authority remains the final check.

---

## SORBET STARTER / INULIN — **CLOSED** · a batch resize spent the Main's reservation

| | |
|---|---|
| **SEVERITY** | HIGH — a brand-new recipe was invalid against Gellatti's own authority |
| **STAGING** | fix `8416a947` (PR #60) · persistence `08771f21` (PR #62) |
| **DEPLOYMENT** | `dpl_4UhU2be6yW7dWWGnjvKrdp87GYvx` · bundle `index-D4r9NuJ8.js` → `index-PsX4XCcD.js` |

### Cause

The canonical Sorbet starter is **deliberately incomplete**: ~40 % of the batch
as support, the rest named `missingMainMassGrams` — the mass the customer's
fruit Main will occupy. `resizeRecipeBatch` knew nothing about that reservation,
so it treated the scaffold as a complete recipe and filled the batch with
support ingredients: every line x2.5.

INULIN went from the starter's 5.4 % to **13.8 %** and broke `OWNER_INULIN_POLICY`
(2–8 %) — 90.6 g against a 13.4–53.6 g band at 670 g — before the customer had
touched anything. It reproduced on **all ten** canonical Home machines. HOME
reaches it by construction: `generateRecipe` rebuilds the starter and then
re-asserts the machine, which *is* the resize.

**The starter template was never wrong.** It is legal at every product x mode x
batch tested; the excess was purely `5.5 % / 0.4`. The blast radius is
Sorbet-only because it is the only profile with `missingMainMassGrams > 0` —
Gelato/Vegan/Protein starters already sum to the batch and were unaffected.

### The invariant

For an incomplete starter it is **not** "lines sum to the batch":

    sum(lines) + missingMainMassGrams === target batch

A resize moves the support vector **and** the reservation, preserving support
ratios. 1000 → 670: support 400 → 268, reservation 600 → 402.

The discriminator is the reservation, never `productType === 'sorbet'`. It is
recorded from the starter's own metrics and honoured only while it remains TRUE
of the draft, so a completed draft reports zero and a whole-gram stabilizer
shortfall is never mistaken for a Main reservation. `OWNER_INULIN_POLICY` is
untouched.

### Served QA — passed

| step | result |
|---|---|
| new Sorbet → Ninja CREAMi Deluxe (before any fruit) | batch 670, sum **268**, reservation **402**, accounted **670** |
| INULIN | **33 g = 4.93 %**, inside the derived 13.4–53.6 g band |
| after a page refresh | reservation **402** survives |
| refresh → amount 500 g | sum 199.25 + reservation 300.75 = **500**; INULIN **24.56 g = 4.91 %**, inside 10–40 g |

The refresh case is why PR #62 exists: `starterReservedMainGrams` was a new store
field and persistence is an explicit allow-list (GEL-P0-017), so it was
non-persistent by default and the defect returned by reload alone (500 g gave
INULIN 62 g = 12.4 %). Adding the field to the allow-list is the mechanism that
contract exists to force; GEL-P0-017 itself is unchanged.

### Separate debts — NOT fixed here

* **NEW — Main insertion does not re-budget the batch.** Adding the fruit leaves
  1072 g against a 670 g batch. Discovered during this work; own defect.
* **Crown auto-seed 1 g** (1001/1000 on a new recipe).
* **Signed-out Recalculate** silent no-op behind a `401`.

---

## PC-03 — **CLOSED / FROZEN** · Sorbet exact-projection eligibility required an on-batch draft

> **THE ORIGINAL ROOT-CAUSE NARRATIVE IS WITHDRAWN.** It named the citrus fibre
> and NEAREST coverage. Both are wrong, and the record is corrected rather than
> preserved. Second time the same acceptance harness encoded a false cause
> (see PC-02).

### The historical acceptance fixtures — HARNESS ARTEFACT / NOT VALID CUSTOMER INPUT

All **22/22** recorded cells are invalid. `fullRecipeMatrix.acceptance.test.ts`
→ `buildInput` first scales the support lines so the draft fills the target
batch, then appends the rotation "extra" at `batch × 0.03` and, in BOTH mode, a
second line at `batch × 0.02` — **without budgeting either**. That is exactly
the recorded `base_sum_g` of 1030 / 1050 against `batch_target_g` 1000. The
Sorbet rotation's extra is `PI-ING-000306` VITACEL CITRUS FIBER, which resolves
to role `stabilizer` and so also bypasses the normal Sorbet stabilizer clamp
(34 g against a 5 g ceiling).

| original claim | verdict |
|---|---|
| "the Sorbet branch of the NEAREST fallback does not cover this region" | **REJECTED.** The fast path runs *exact projection first, NEAREST second*. The exact projection returns a candidate with sum = 1000, **0 Engine violations**, 0 critical warnings for every fixture examined. Nothing is missing from NEAREST's coverage. |
| "fruit-Main + citrus-fibre start" is causal | **REJECTED.** Passing cells also sum 1030/1050; a 31.6 g stabilizer system passes while a legal 5 g one fails. The fibre is only the vehicle that carried the unbudgeted mass. |

### The real defect — customer-reachable

| | |
|---|---|
| **SEVERITY** | HIGH — a safe candidate exists and is not used |
| **PROVEN ON** | `c004d659` (staging), served shape captured from `index-BEjANf2j.js` |
| **ROOT CAUSE** | `applyPipeline.ts` — Sorbet exact-projection eligibility required `Math.abs(plannedSum(input) - target) <= BATCH_SUM_TOLERANCE_G`, i.e. the **incoming draft** had to already be on batch. But `projectSorbetDirectionCandidate` solves **FOR** `target_batch_grams` — the batch is the first row of its 3×3 system — so an off-batch draft is precisely the one it repairs. |
| **CONSEQUENCE** | Off-batch drafts fell through to the general search: ~50–92 s instead of milliseconds, and at ±30 g the general search **published a proposal carrying an Engine violation**. |
| **REACHABILITY** | Any ordinary edit puts a Sorbet off batch — `addIngredient` and `removeItem` do not re-budget. The canonical HOME journey also lands off batch because the Crown auto-seeds the fruit Main at 1 g on top of a batch-filling starter (1001 / 1000). |

### The fix

The relaxation is deliberately narrow: **off batch, exactly one Main**, and the
batch is restored first through the canonical
`rescalePreservingMainGroup(..., preserveCandidateMain: false)` — the same call
the optimizer's own `restoreBatch` makes — so a draft that is short because its
Main is short still grows the Main.

* a **multi-Main** off-batch draft is off batch because its Main GROUP is short:
  the certified Main frontier answers it, and the served two-Crown 150/150
  Sorbet is still raised to 300/300. Without this condition
  `userHeldMainAuthority` returns 220/220 against a required 300/300.
* a draft with **no Main** is an incomplete scaffold: GEL-P0-014 requires it to
  stop on the missing role, so it is not answered by a projection either.
* **on-batch behaviour is untouched** for every Main count.

Everything else — Sorbet, active exact Direction objective, no `actual_grams` —
is unchanged, and every downstream authority still decides the candidate: Engine violations, critical warnings,
constraints/locks, Main/Crown, ProductBehavior, the Sorbet stabilizer authority
and `enforceTargetBatchInvariant`, which remains the final batch net. The fix
lets the projection be **attempted**; it does not make it publishable.

| batch delta | before | after |
|---|---|---|
| 0 g (on batch) | OK · 6 ms · 0 violations | OK · 6 ms · 0 violations |
| +0.1 g | OK · 57.0 s · 0 | OK · 2 ms · 0 |
| +1 g | OK · 50.5 s · 0 | OK · 1 ms · 0 |
| **+30 g** | OK · 51.6 s · **1 violation** | OK · 2 ms · **0** |
| −1 g | OK · 50.2 s · 0 | OK · 1 ms · 0 |
| **−30 g** | OK · 51.4 s · **1 violation** | OK · 1 ms · **0** |

The proposal sums to exactly 1000 g in every case and the crowned Main is
preserved. Locked by `sorbetOffBatchDirection.test.ts` and by **GEL-P0-025**
(`sorbetDirectionOffBatchEligibility.contract.test.ts`), which pins the narrow
shape behaviourally — single-Main admitted, multi-Main and no-Main not. Before
the fix the route assertion (`directionCandidateSource ===
'sorbet_exact_projection'`) and the +30 g / −30 g violation assertions fail.

### Merge identity and served status

| | |
|---|---|
| staging before | `c004d659` (branch base), rebased through `45192609` |
| **staging after** | **`c464075e`** — PR [#55], squash, no `--admin` |
| deployment | `dpl_9yuYc1zxhN6nKmF54kJY42Mrx7s9` (target production, READY) |
| served bundle | `index-CPmtThKc.js` → **`index-BFlaEl3N.js`** |
| contract | **GEL-P0-025** (staging claimed 024 for the CI-lane contract mid-flight) |

Gates on the merged commit: full local suite **857 files / 10 404 tests / 0
failures**; CI "Owner-locked contracts + protected paths" (required), "Typecheck,
lint, tests, build" (17m21s), "Solver time contracts" and "Starter-pack Direction
rescue" all green; `guard:owner-locked` OK; `guard:protected-paths` SEMANTIC on
`applyPipeline.ts` acknowledged via `Protected-Change:`; typecheck clean; lint 0
errors; build ✓.

**SERVED QA — OWNER-APPROVED, 2026-08-31.** The authenticated run was performed
by the owner and reported as passing on the served path. It could not be run
from this session: signed out, staging refuses the anonymous session (`401`,
`permission denied for view mapper_basement_search`), so neither the ingredient
search nor Recalculate executes, and the only signed-out draft is the
124 g-inulin starter that is excluded because it is independently unpublishable.
Entering credentials is not something this session does, so the authenticated
half was the owner's.

Verified from this session, signed out: the post-merge bundle is deployed
(`index-BFlaEl3N.js`) and the HOME Sorbet journey still builds its draft. No
screenshot artefact was captured on this side; the served evidence of record is
the owner's approval above. If a screenshot is wanted in the ledger it belongs
in `reports/e2e/screenshots/` from the owner's own run.

**PC-03 is CLOSED and FROZEN** on the corrected root cause: the historical PC-03
matrix fixtures were invalid harness artefacts, and the real customer-reachable
defect was a Sorbet exact-projection eligibility gate that required the incoming
draft to already equal the target batch even though the projection itself solves
to that batch. Off-batch canonical drafts therefore fell into the slow general
path and could terminate `unsafe_proposal` — or publish an Engine violation —
while a safe exact-projection candidate existed.

### Separate follow-ups — OUT OF PC-03 SCOPE, deliberately not fixed here

* **TECH DEBT — Crown auto-seed leaves a new recipe 1 g off batch.** The seeded
  1 g Main is not budgeted into the starter, so a brand-new Sorbet is 1001 /
  1000. PC-03 makes the pipeline robust to that; it does not remove the debt.
* **OWNER POLICY — the served brand-new Sorbet is independently unpublishable.**
  Scaling the starter to fill the batch while the Main is still 1 g pushes
  INULIN to ~124 g against the Gellatti range of 20–80 g (2–8 % of batch), so
  practicalization refuses it with `inulin_outside_owner_policy`: *„Inulina
  138.0 g jest poza wewnętrznym zakresem Gellatti 20.0–80.0 g (2–8% partii)."*
  That refusal is correct and is NOT the batch defect — the two were separate
  causes on the same draft.
* **HOME DEMO/AUTH — signed-out Recalculate can appear as a silent no-op.** On
  staging the anonymous session hits `401` / `permission denied for view
  mapper_basement_search`, the draft is left unchanged and no message is shown.
  A separate UX/auth honesty problem.

---

## PC-04 — Protein Recalculate exhausts the solver iteration cap

| | |
|---|---|
| **SEVERITY** | MEDIUM — a valid preview is produced but can never be applied |
| **FIRST OBSERVED SHA** | `04106031` |
| **PROFILE** | Protein 28 · Sorbet 5 · Gelato 1 (34 cells) |
| **MACHINE** | Maszyna profesjonalna 30 · Moulinex Freezi 2 · KitchenAid 1 · Custom 1 |
| **TEMPERATURE** | fresh 14 · −11 10 · −13 7 · −12 3 |
| **MODE** | OPTIMAL 20 · ECO 14 |
| **BATCH** | 1000 g (Home machines at their derived batch) |
| **EXACT INGREDIENTS (exemplar `dir-Gelato-temp_minus_13-optimal-s-1-h-1`)** | MILK 3.5 % 599 g · CREAM 30 % 125 g · SKIMMED MILK 45 g · SUCROSE 72 g · DEXTROSE 112 g · INULIN 44 g · TARA GUM 3 g · `PI-ING-000407` HAZELNUT CHUNKS 30 g |
| **TOPPINGS** | `PI-ING-001680` PERA ZENZERO Variegato 50 g |
| **SWEETNESS / HARDNESS** | −1 / −1 (17 distinct combinations across the cluster) |
| **EXPECTED** | The solver converges, or refuses honestly before spending the budget. |
| **ACTUAL** | Preview **OK** (score 84.45, POD 13.34, PAC 30.57, NPAC 53.45) but Apply is rejected: *"Osiągnięto limit prób, więc wyniku nie można zastosować. Podgląd jest tylko diagnostyczny."* |
| **REPRODUCED** | 34/1304, deterministic. Protein carries 28 of them — 8.6 % of all Protein cells. |
| **LIKELY ROOT AREA** | `MAX_SOLVER_ROUNDS` (18) reached in the Protein candidate ladder; the Apply door correctly refuses a non-converged candidate, so the cost is in convergence, not in the door. |

---

## PC-05 — Vegan Direction extremes land on a protein-in-dry-matter hard residual

| | |
|---|---|
| **SEVERITY** | MEDIUM — largest single cluster; may be honest physics, needs owner science review |
| **FIRST OBSERVED SHA** | `04106031` |
| **PROFILE** | Vegan 44 · Gelato 9 (53 cells) |
| **MACHINE** | 10 distinct machines |
| **TEMPERATURE** | fresh 30 · −11 17 · −12 4 · −13 2 |
| **MODE** | ECO 29 · OPTIMAL 24 |
| **EXACT INGREDIENTS (exemplar `dir-Gelato-fresh-eco-s-2-h2`)** | MILK 3.5 % 672 g · CREAM 30 % 130 g · SKIMMED MILK 35 g · SUCROSE 130 g · DEXTROSE 30 g · TARA GUM 3 g · `PI-ING-000087` DARK CHOCOLATE 55 % 20 g · `PI-ING-001347` CHICKEN EGG WHITE DRIED 30 g |
| **TOPPINGS** | `PI-ING-000087` DARK CHOCOLATE 55 % 50 g (BASE_AND_TOPPING) |
| **SWEETNESS / HARDNESS** | −2 / +2 (13 distinct combinations) |
| **ACTUAL** | Preview **OK** (score 79.78, POD 13.95, PAC 21.84, NPAC 33.05); Apply rejected: *"Propozycja narusza zatwierdzone zakresy technologiczne: Białko w suchej masie."* |
| **REPRODUCED** | 53/1304, deterministic. |
| **LIKELY ROOT AREA** | The candidate ladder moves sugars far enough to push protein-in-dry-matter outside its approved band before the hard-residual gate stops it. Whether the request is genuinely infeasible or the ladder simply took an illegal route is a science question for the owner. |

---

## PC-06 — A saved Sorbet recipe can never be taken into Production

| | |
|---|---|
| **SEVERITY** | **HIGH — closed loop: the customer has no move at all** |
| **FIRST OBSERVED SHA** | staging `36a3b7f4`; **still reproduces on `c7344691`**, the final head, after PR #5's Sorbet fix — the two are independent |
| **PROFILE** | Sorbet (reproduced at **both** −12 °C and −13 °C, OPTIMAL) |
| **MACHINE** | Maszyna profesjonalna |
| **BATCH** | 1000 g |
| **EXACT RECIPE** | `QA Sorbet Truskawka -12` (`16df2554-d6a8-46fb-ab82-8de839707851`) and `QA Sorbet Truskawka -13` (`07132301-b904-44c2-aad0-c084f5d66e70`), both v1, 6 lines: SUCROSE · DEXTROSE · INULIN · TARA GUM · `PI-ING-000406` WILD STRAWBERRY 600 g MAIN · `PI-ING-000496` FRUCTOSE |
| **SWEETNESS / HARDNESS** | 0 / 0 — no Direction change is even requested |
| **ACTION SEQUENCE** | 1. Open the saved recipe from Receptury → Otwórz. 2. Go to Produkcja. 3. Follow every instruction the application gives. |
| **EXPECTED** | Either Production starts from the saved executable version, or the application offers a move that leads somewhere. |
| **ACTUAL — three dead ends in a row** | **Produkcja:** *"WYMAGA RECEPTURY WYKONAWCZEJ · Najpierw przelicz recepturę · Produkcja korzysta wyłącznie ze zweryfikowanej receptury wykonawczej w pełnych gramach."* → **Przelicz:** *"To najbliższy osiągalny wynik dla wybranego kierunku. Nie znaleźliśmy bezpiecznej korekty, która poprawia ten cel bez naruszenia twardych ograniczeń. Parametry kierunku: NPAC, słodycz (POD). Receptura nie została zmieniona."* → **ZAPISZ: disabled** (nothing changed, so there is nothing to save). Production still refuses. The loop closes with no exit. |
| **CONTRAST** | The same journey completes for the other three profiles on the same build: Gelato `LOT-20260829-228836054F`, Vegan `LOT-20260829-834993C734`, Protein `LOT-20260829-92AACEA842`. Vegan and Protein reached it through *"Utwórz nową wersję z aktualnymi danymi produktów"* → a NEAREST consent or *"Receptura już spełnia wybrany profil"* → **ZAPISZ enabled** → Production ready. Sorbet never reaches a state where ZAPISZ is enabled. |
| **REPRODUCED** | 2/2 saved Sorbet recipes, at two different temperatures. |
| **LIKELY ROOT AREA** | The interaction between the Production readiness gate (which demands a freshly verified whole-gram executable) and the Sorbet recalculation outcome (`nearest reached / recipe unchanged`). The unchanged-recipe outcome produces no executable and enables no save, so the gate can never be satisfied. Related to PC-01 and PC-03 but distinct: here **no Direction change is requested at all**. |

### PC-06 — CLOSED on staging `d1498d85`

Fixed in PR #8 (`claude/pc06-sorbet-production-path`), merged to `staging` as
`d1498d85`, served and verified end to end on 2026-08-30. Kept in this file
because the *record* of the defect stays; the entry above is the state as
filed, and this note is the outcome.

**The two authorities that disagreed.** `productionRecipeLifecycleState`
returned `TECHNICALLY_STALE` whenever `practicalRecipeAuditMatchesInput` was
false and prescribed exactly one cure — recalculate. `buildOptimizePreview` had
no applicable change to make for this Sorbet, so Apply never ran, so the audit
was never attached, so the gate never opened. Save was disabled because nothing
had changed. The practical audit is written at Apply time and persisted inside
the `RecipeInput`, so any version saved in a session that did not Apply carries
none.

**Fix — lifecycle only.** An immutable saved version, reopened and unedited, is
its own executable evidence when every planned gram is whole. Still
`TECHNICALLY_STALE`: a pending recalculation, an unused 0 g row, any edit, an
unsaved draft, and any fractional gram. No Sorbet science, POD/PAC/NPAC,
Direction, solver band, stabilizer ceiling, Main/Crown, batch authority,
Production calculation or Label calculation was touched, and no protected path
was modified.

**Served proof.** `QA Sorbet Truskawka -12` reopened → Produkcja
*"WSZYSTKO GOTOWE DO ROZPOCZĘCIA PARTII"*, źródło *"Zapisana wersja"* → batch
completed, `LOT-20260830-0624A2A275`, final score 10. `-13` likewise reaches
*"Rozpocznij partię"*. Full capture in
`reports/e2e/screenshots/pc06-sorbet-production.txt`.

**Nothing was written to open the gate.** Both fixtures still hold exactly one
version, still with no practical audit, still stamped 2026-08-29 22:17.

**Blast radius, re-measured on 2026-08-30.** Of 722 saved versions on staging,
361 carry no practical audit, spread over 330 of 440 recipes. The number that
actually matters is the *latest* version, because that is the one the library
opens: **164 of 440 recipes** had an auditless latest version and were therefore
one Produkcja click away from this loop.

---

## PC-07 — A saved Vegan or Protein version can stall on server product verification

*Newly observed on 2026-08-30 during the PC-06 served QA. Recorded, NOT fixed —
this run was PC-06 only.*

| | |
|---|---|
| **FIXTURE** | `QA Vegan Kokos -12` v2 (7 lines, 1000 g, −12 °C) and `QA Protein Kakao -12` v2 (8 lines, 1000 g, −12 °C), owner `test1@test1.com`. Both are the version the library opens. |
| **STEPS** | `/recipes?tab=mine` → **Otwórz** → **Produkcja**. |
| **EXPECTED** | Production, as both did on 2026-08-29 (`LOT-20260829-834993C734`, `LOT-20260829-92AACEA842`). |
| **ACTUAL** | *"WYMAGA RECEPTURY WYKONAWCZEJ · **Nie udało się potwierdzić produktów** · Produkcja wymaga odświeżenia bieżącej weryfikacji produktów. Obliczenie receptury pozostaje bez zmian."* with a single offered action, **Wróć do receptury**. Following it, then **Potwierdź ustawienia**, then Produkcja again, returns the same message. The earlier recovery offer *"Utwórz nową wersję z aktualnymi danymi produktów"* — which is how both recipes escaped this on 2026-08-29 — is not presented. |
| **WHERE** | `src/features/production-workspace/useProductionWorkspace.ts:735-756`: `validateRecipeBehaviorOnServer({ module: 'PRODUCTION' })` resolves `ready: false`. The recovery lane (`recoveryPending`, same file) and this behaviour-server gate are both live at that point; the gate's message is the one presented. |
| **NOT CAUSED BY PC-06 — measured** | `reports/e2e/pc06/audit-probe.json`, produced by `src/qa/acceptance/pc06AuditProbe.acceptance.test.ts` against the real staging rows: both fixtures carry a practical audit and it **still matches** their input, so the PC-06 disjunct is short-circuited and never consulted. Pre-fix and post-fix lifecycle are both `READY` (`changedByPc06: false`). Only the two auditless Sorbet fixtures change state. The server gate they now stop at was equally reachable before PR #8. |
| **LIKELY ROOT AREA** | Staging Mapper product data has drifted since those v2 versions were saved on 2026-08-29 (Vegan shows `REFINED COCONUT OIL — Koszt niepełny`), so the persisted ProductBehavior evidence no longer satisfies the server. The defect is not the refusal — that is honest — but that the *stale-product recovery* which previously resolved exactly this condition is not offered alongside it. |
| **REPRODUCED** | 2/2 profiles, both on staging `d1498d85`. |

### PC-07 — CLOSED on staging `49dea0b4`

Fixed in PR #14 (`claude/pc07-product-verification-recovery`). Surfacing only:
no formulation science and no protected path.

**The three authorities.** `validateRecipeBehaviorOnServer({module:'PRODUCTION'})`
refused with `behavior_snapshot_missing_or_unresolved:…:refresh_product_data`.
The cure for exactly that reason already existed —
`refreshCurrentRecipeBehaviorWorkingCopy`, offered as *„Utwórz nową wersję z
aktualnymi danymi produktów"* — but it lived in `ProRecalcPanel`, reachable only
through Przelicz, and `WorkbenchIntelligenceHeader` renders Przelicz only when
`pending || recalculateNeeded`; a saved recipe whose score is verified and
current shows neither. Save was disabled because nothing had changed.

**Fix.** The PRODUCTION gate now carries whether the refusal is refreshable,
decided by the refresh authority's own predicate
(`productBehaviorIssuesSupportWorkingCopyRefresh`), and offers the refresh in
place of a bare *„Wróć do receptury"*. A refusal naming missing product science
keeps its existing product-data actions, and a transport failure never offers a
refresh that cannot help.

**Served proof.** Both fixtures now walk an unbroken chain — refresh → przelicz
→ (NEAREST consent for Vegan) → zastosuj → zapisz → Produkcja — and completed
batches `LOT-20260830-60DCC5F047` (Vegan, 10/10) and `LOT-20260830-D0469F7926`
(Protein, 10/10). The historical v1 was never rewritten in either case. Full
capture in `reports/e2e/screenshots/pc07-product-data-recovery.txt`.


---

## Confirmed contract behaviours (not bugs — recorded for completeness)

- **Protein Hardness is `blocked_science`** in all 326 Protein cells;
  `buildRecipeDirectionPlan` reports it truthfully and the matrix records it
  as NOT_APPLICABLE. Sweetness stays `working` on Protein.
- **`already_clean`** (9 cells, Gelato + Protein): the recipe already satisfies
  the requested target. Honest and correct.
- **Post-process isolation holds exactly.** With the Base held byte-identical,
  `none` vs `TOPPING_ONLY` produce identical POD, PAC, NPAC, score, Base sum
  and kcal/100 g, while the final product mass reacts (1000 g → 1050 g). Adding
  the same article to the Base as well (`BASE_AND_TOPPING`) legitimately moves
  the Base physics.
- **Two lines of one canonical identity are refused at the Apply door**
  (`duplicate_lines`), with the offending product named. Correct — but note the
  refusal arrives at Apply, not at Preview.
- **Sorbet requires a user-chosen fruit Main.** The canonical Sorbet starter is
  `blocked_missing_user_main` with `missingMainMassGrams = 600`; without a fruit
  the pipeline refuses with `missing_required_role`. Correct and honest.
