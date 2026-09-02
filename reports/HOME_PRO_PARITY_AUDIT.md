# HOME ↔ PRO CANONICAL PARITY — LIVING AUDIT
**Opened 2026-09-03 · owner P0 · status: IN PROGRESS — not complete, not READY**

## 0. Headline: this is not a Protein bug, it is two pipelines

Proven by import-graph analysis, both directions:

- **PRO never imports `@/spine` or `@/features/optimization`** — zero files across
  `constraint-studio`, `pro-core`, `pro-workbench`.
- **HOME's Monitor/recalculation never imports `constraint-studio`** — zero files
  across `customer-shell` (35 files) and `pi-monitor` (10 files).

| | PRO | HOME (Monitor / recalc) |
|---|---|---|
| entry point | `constraint-studio/applyPipeline` → `buildOptimizePreview` | `features/optimization/previewOptimization` → `@/spine` |
| target authority | `recipe-direction/recipeDirectionTargets` (POD / NPAC bands) | `spine/evaluateTemperatureRegulator` + `spine/designRecipe` |
| hardness lever | 5-level Direction axis on **NPAC** | 3-step **`texturePreference`**, read out on **`ice_fraction`** |
| sweetness lever | 5-level Direction axis on **POD** | 3-step **`sweetnessPreference`** |

These are two different formulation authorities reached by the same user intent.
**Protein hardness is the first case where they disagree visibly** — PRO blocks it
(`blocked_science`, NPAC), HOME allows it (`isMonitorTuningApproved` → ice authority,
which explicitly accepts the documented milk_gelato fallback).

A third path exists inside HOME itself: `home-creator/ui/HomeRecalculate.tsx` is the
ONLY HOME file that imports `constraintStudioStore`. So HOME currently has **two**
recalculation routes — one canonical (PRO's) and one spine-based.

## 1. Why the existing guard did not catch it

`home-creator/homeArchitectureBoundary.test.ts` (§1 "HOME IS NOT A SECOND
APPLICATION") is real but has two structural gaps:

1. **Name-based.** It fails only on declarations literally named `HomeEngine`,
   `HomeSolver`, `HomeRecipe`, `HomeCrown`, `HomeProductBehavior`,
   `HomeMachineAuthority`, `HomeProductionAuthority`. A divergent authority that
   is not called `Home*` is invisible to it.
2. **Scoped to `src/features/home-creator` only.** The actual divergence lives in
   `src/features/customer-shell` and `src/features/pi-monitor`, which the guard
   never reads.

Replacement guard must be **import-graph based, not name based**: HOME surfaces may
import canonical authorities, but must not reach a *second* formulation pipeline.

## 2. Living parity checklist

Legend — SAME TODAY: ✅ same canonical authority · ❌ divergent · ⏳ not yet audited.

| # | CAPABILITY | HOME PATH | PRO PATH | CANONICAL AUTHORITY | SAME TODAY? | DEFECT | FIX | PARITY PROOF |
|---|---|---|---|---|---|---|---|---|
| 11 | hardness / softness Direction | `PiMonitorSection` → `piMonitorIntent` → `texturePreference` → `spine` (ice_fraction readout) | `ProfileDirectionAxes` → `recipeDirectionTargets` → NPAC band | **none — two authorities** | ❌ | PRO blocks Protein (`blocked_science`); HOME allows it. Opposite verdicts on the same owner-approved-standard-physics basis | extract ONE canonical hardness authority; both surfaces consume it | pending |
| 10 | sweetness Direction | `sweetnessPreference` (3-step) → `spine` | Direction axis on POD (5-level) | **none — two authorities** | ❌ | same split as #11; not yet user-visible because both currently permit Protein | same extraction | pending |
| 18/19 | Preview / Apply | `previewOptimization` → `spine` | `buildOptimizePreview` → `applyPipeline` | **none — two pipelines** | ❌ | entire Preview/Apply contract differs | route HOME through `applyPipeline` | pending |
| 20 | rescue / recovery | `spine/batchRescueRouter`, `batchRescueMultiLeverSolver` | `applyPipeline` rescue paths | **none — two** | ❌ | duplicate rescue algorithms | canonicalise | pending |
| — | HOME internal split | `HomeRecalculate.tsx` → `constraintStudioStore` **vs** `PiMonitorSection` → spine | n/a | n/a | ❌ | HOME has TWO recalculation routes of its own | collapse to the canonical one | pending |
| 1–9, 12–17, 21–30 | product type, machine, temperature, OPTIMAL/ECO, ingredient add/remove/grams/locks, Crown/Main, Multi-Main, batch, stabilizer, ProductBehavior, eligibility, topping/base, hard limits, carrier, manual target, save/reopen, defaults, refusal semantics, profile switching, draft persistence, scores | — | — | — | ⏳ | not yet audited | — | — |

## 3. Confirmed divergence #1 — Protein hardness (detail)

Full forensics in `reports/PROTEIN_HARDNESS_BLOCKED_2026-09-02.md`. Summary:

- PRO's `softnessOperational` never contained `protein_gelato` — verified across
  **all 16 versions** of `recipeDirectionTargets.ts`.
- HOME's `isMonitorTuningApproved` → `hasDirectIceAuthorityAtTemperature` returns
  **true for Protein at −11/−12/−13**, with the hardness axis applicable and banded
  (`[45,54.5] / [46,54] / [46,52]`) — measured.
- HOME maps the lever `decrease → soft`, `increase → firm`
  (`piMonitorIntent.TEXTURE_FOR`), then `TEXTURE_TARGETS` →
  `upper_safe_side / clean_center / lower_safe_side`.
- Measured end-to-end: HOME's recalc runs for Protein exactly as for Gelato
  (`mappedAxes: ["miekkosc_twardosc"]` for both); the starter proposes no change
  only because it already sits in range (`juz_w_zakresie`).

**Per the owner's architecture decision this must NOT be fixed by wiring PRO to the
HOME authority.** The proven hardness mechanism has to be extracted into one
canonical authority consumed by both surfaces. The NPAC scientific statement stays
historically true: Protein NPAC-based hardness remains unsupported; the canonical
authority is the ice-fraction/texture one.

## 3b. Authoritative store-action map (evidence, 2026-09-03)

Surfaces defined from the router, not guessed — HOME = `pages/home` +
`home-creator` + `customer-shell` + `pi-monitor` (85 files); PRO = `pages/pro` +
`pro-core` + `pro-workbench` + `constraint-studio` + `studio` + `studioFlow`
(117 files). 25 of the 50 `recipeStore` actions are referenced by either surface.

**SHARED MUTATION ENDPOINT — PARITY STILL TO VERIFY (6).** Owner correction
2026-09-03: a common final store action proves only a shared mutation endpoint.
Parity requires equivalence of *semantic input, guards/refusals, canonical
payload and resulting state*. These are NOT green:
`loadRecipeInput`, `removeItem`, `setBatchGrams`, `setDirectionTarget`,
`setLockType`, `setMachineSelection`.

> This corrects §0: HOME **does** use the canonical `setDirectionTarget` (on
> `HomePage`). The divergence is therefore *not* "HOME has no Direction" — it is
> that HOME has **two** Direction routes: the canonical store action on
> `HomePage`, and the PI-Monitor `axisIntents → texturePreference → spine` route
> on `customer-shell`.

**HOME-only actions (6):** `addIngredient`, `addTopping`, `rebuildNewRecipeStarter`,
`setMainIngredient`, `setPlannedGrams`, `setProductBehaviorSnapshot`.

**PRO-only actions (13):** `applyVerifiedRecipeInput`, `setGramLock`,
`setPercentLock`, `setRangeLock`, `clearRangeLock`, `setCategory`,
`setFormulationStrategy`, `startNewRecipe`, `loadPreset`, `resetToDemo`,
`syncProductBehaviorSnapshots`, `bumpDraftRevision`, `acknowledgePracticalRecipeAudit`.

### Asymmetries this exposes — to be audited per profile

| # | CAPABILITY | ASYMMETRY | RISK | STATUS |
|---|---|---|---|---|
| 7 | ingredient grams | HOME writes directly via `setPlannedGrams`; PRO commits via `applyVerifiedRecipeInput` after Preview verification | **HIGH** — different validation semantics for the same intent; HOME may write a value PRO would refuse | ⏳ |
| 16 | ProductBehavior | HOME `setProductBehaviorSnapshot` (singular); PRO `syncProductBehaviorSnapshots` (plural) | **HIGH** — different sync semantics | ⏳ |
| 8 | lock / unlock | PRO has gram/percent/range locks; HOME has only `setLockType` | MEDIUM — HOME cannot express PRO lock kinds | ⏳ |
| 1 / 30 | product type + switching | PRO `setCategory` + `startNewRecipe`; HOME `rebuildNewRecipeStarter` | MEDIUM — **connects to the OPEN `visibleProductType` pinning bug** | ⏳ |
| 9 | Crown / Main | HOME `setMainIngredient`; PRO never calls it (uses `lock_type: 'main'` via constraint studio) | MEDIUM | ⏳ |
| 4 | OPTIMAL / ECO | `setFormulationStrategy` PRO-only | MEDIUM — HOME may not express strategy | ⏳ |

**Positive parity signals found (not defects):** `homeAddAmountDecision.ts`
imports the canonical `resolveMainCapability` and `productDosageAuthority`, and
`homeAmountAuthority.ts` uses canonical `planContainerSplit` — HOME's add/amount
path is canonical-backed, with "containers" a presentation concept only.

## 3c. Capability 7 — INGREDIENT GRAMS (evidence, 2026-09-03)

**Both surfaces end at the same store action `setPlannedGrams`, but reach it
differently.**

| | HOME | PRO |
|---|---|---|
| entry | `HomeRecipeSection.tsx:129` — `useRecipeStore.getState().setPlannedGrams(...)` **raw** | `IngredientRow.tsx:939` / `IngredientLineControls.tsx:411` → `IngredientBuilder` wrapper (`IngredientBuilder.tsx:252`) |
| ProductBehavior gate | store-internal only → **silent no-op** | wrapper gate → **`setPickerNotice(reason)`** shown to the user |
| stabilizer clamp | store-internal `clampOwnerStabilizerComponentGrams` | same authority, applied in the wrapper against `selectCanonicalDraft().input`, and `aggregate.messagePl` surfaced |
| `markDoseUserSet(lineId)` | **not called** | called |

**Confirmed divergences (cap 7):** HOME refuses **silently** where PRO explains
(a refusal-semantics divergence, capability 29), and HOME never records
`markDoseUserSet`, so downstream "the user set this dose" state differs.

**Corrections made during this audit — recorded so they are not re-derived:**

1. `wrapActions` (`useLineLockControls.ts:109`) wraps **only `setLockType`**; it
   passes `setPlannedGrams` through untouched. HOME is therefore *not* skipping a
   lock-aware gram layer.
2. Measured: a gram edit leaves the draft off-batch on **both** surfaces —
   `setPlannedGrams` never rebalances and never enforces the batch invariant.
   Measured after a +100 g HOME edit at batch 670: gelato 670 → 769.67,
   vegan 670 → 770.01, protein 670 → 770.26; sorbet 267.33 → 366.86 (its starter
   is deliberately incomplete under the GEL-P0-026 Main reservation). **This is
   not a HOME-only defect** — the batch is resolved downstream in Preview/Apply.
   The open question is whether both surfaces reach the *same* downstream
   resolution; that comparison is still pending.
3. `user_target_grams` is written in exactly ONE place in the whole repo
   (`recipeStore.ts:2137`, inside `setPlannedGrams`). Both surfaces therefore
   plant the manual-target anchor identically.

### Verdict on capability 7 — PARITY on domain semantics

`markDoseUserSet` was traced end-to-end. It flips dose provenance
`AUTO_SUGGESTED → USER_SET`. Consumers:

- **behavioural:** only `missingPickerDosePreviewIssue`
  (`constraintStudioStore.ts:433`), which blocks Preview when
  `provenance !== 'NONE' && planned_grams < 1`. `AUTO_SUGGESTED` and `USER_SET`
  satisfy that identically, so the flag does not change the outcome.
- **other:** `recipeProfilePersistence.ts:191/216` — a *deserialization schema
  check* on persisted meta, not a formulation decision.

**Therefore `markDoseUserSet` is UI/provenance metadata, not canonical
formulation behaviour**, and per the owner rule no formulation architecture is
built around it. The remaining HOME/PRO difference is that PRO *explains* the
refusal and HOME is silent — same operation refused, different copy, which the
owner rule expressly allows.

**Capability 7 = MUTATION PARITY / DOWNSTREAM PARITY PENDING** (owner
bookkeeping correction). Proven: same canonical `setPlannedGrams`, same
`user_target_grams`, `markDoseUserSet` is provenance/UX metadata, refusal
semantics equal (copy may differ). Still to prove per profile: Preview →
manual-target projection → batch closure → Main/Crown limits → carrier →
Apply → final canonical grams.

## 3d. Capability 8 — LOCK / UNLOCK (evidence, 2026-09-03)

PRO wraps `setLockType` with `onLineLockTypeChanged` — the constraint-studio
bridge notification (`useLineLockControls.ts:109-114`). HOME calls
`setLockType` **raw** (`HomeRecipeSection`), so the bridge is never notified.

**RETRACTED — measured, and my call-shape classification was wrong.**

`onLineLockTypeChanged` (`constraintStudioStore.ts:1020`) does two things: it
drops the §17 constraint + clears the staged preview (**B/C — PRO solver session
state**), and it calls `setGramLock/setPercentLock/clearRangeLock`
(**A — canonical**).

But the canonical effect is **already in the shared store action**. Measured on
all four profiles: `setGramLock` writes `grams_constraint {grams: 599/161/397/522}`,
and a subsequent raw `setLockType(line, 'unlocked')` — the HOME path — leaves
`grams_constraint: null`, `percent_constraint: null`, `range_constraint: null`.
**No stale canonical sidecar on any profile.**

What PRO adds on top is constraint-studio session bookkeeping that HOME does not
possess. **Classification D — both correct; no canonical divergence.** HOME must
NOT be routed through the PRO UI wrapper for this.

### Roundtrip proof — PASS, both directions, all four profiles

The §17 constraint map is a **derived cache**, reconciled from canonical recipe
state in both directions (`reconcileConstraints`, `constraintStudioStore.ts:453`).

| profile | HOME→PRO: PRO seeded → HOME raw unlock → PRO reconcile | PRO→HOME: canonical sidecar, empty §17 → PRO reconcile |
|---|---|---|
| GELATO | `{locked,599}` → sidecar cleared → **constraint dropped** | `null` → **re-derived `{locked,599}`** |
| SORBET | `{locked,161}` → cleared → **dropped** | `null` → **re-derived `{locked,161}`** |
| VEGAN | `{locked,397}` → cleared → **dropped** | `null` → **re-derived `{locked,397}`** |
| PROTEIN | `{locked,522}` → cleared → **dropped** | `null` → **re-derived `{locked,522}`** |

No stale solver state in either direction; no canonical state lost.
**CAPABILITY 8 = PARITY.**

## 3e. Capability 16 — PRODUCT BEHAVIOR (evidence, 2026-09-03)

`setProductBehaviorSnapshot` (HOME, `recipeStore.ts:1904`) vs
`syncProductBehaviorSnapshots` (PRO, `recipeStore.ts:1933`).

**Identical in every semantic respect:**
- same validation — line must exist, `snapshot.lineId === lineId`, and
  `processScope` must match BASE_FORMULATION / POST_PROCESS_ADDON;
- same owner-review handling — `preserveOwnerReviewGate`;
- same downstream authority — `reservationAfterMainCheck` recomputes
  `starterReservedMainGrams`.

**Difference is scope, not semantics:** HOME **merges** one line
(`next[lineId] = …`, or deletes); PRO **replaces** the whole map
(`productBehaviorSnapshots: synced`).

These are two legitimate lifecycle operations on one authority — an incremental
per-line arrival (a resolver answer landing after the line) versus an
authoritative full-resolver pass. **Classification D — both correct.**

*Caveat recorded, not a defect:* PRO's replace is destructive to lines absent
from its payload, which is correct for an authoritative resolver sweep but means
a HOME-added snapshot outside that payload would not survive a PRO sync. Worth a
targeted roundtrip test when capability 32/33 (HOME↔PRO persistence) is audited.

**CAPABILITY 16 = PARITY (lifecycle difference only).**

## 4. Still to do (not started)

- Capabilities 1–9, 12–17, 21–30 across Gelato / Sorbet / Vegan / Protein.
- Extraction of the canonical hardness authority + both consumers.
- Parity contract (same draft + same semantic intent ⇒ identical canonical result).
- Import-graph architecture guard replacing the name-based §1 test.
- Four-profile parity matrix, then HOME→PRO→HOME and PRO→HOME→PRO staging proof.

**Neither HOME nor PRO may be marked FINAL/OWNER-READY until this is complete.**
Any HOME checklist item whose proof relied on HOME-specific calculation is reopened.
