# ACCEPTANCE ADDENDUM LEDGER — the four exact closures (owner, 2026-07-24)

Branch: `fix/acceptance-addendum` (base `nightly/integration` @ `a55f5fc`).
SCIENCE FREEZE respected: ENGINE 0.4.0 / CONFIG 0.7.0 unchanged; no band,
template or scoring-constant value was touched. Every change lives in the
pipeline/adapter/door/presentation layers.

Regression suite: `src/features/formulation/acceptanceAddendum.test.ts`
(addendum1..4 + the Agent R handoff closure) plus
`src/features/recipe-score/technicalFit.test.ts` (the score-split contract).
Before/after evidence below was produced by running the owner T-cases through
the REAL pipeline (`buildOptimizePreview` → `commitPreview`, the only preview
builder and the only Apply door); the regenerated
`docs/engine-validation/ENGINE_AUTHENTICITY_TESTS.{json,csv}` carry the full
records.

Gates (final state): `npx tsc -b` clean · `npx eslint .` 0 errors
(2 pre-existing react-refresh warnings) · FULL `npx vitest run` green
(381 files / 5131 tests) · `npm run build` succeeds.

---

## Item 1 — T9 APPLICABILITY GATE (`iteration_cap` is NEVER applicable)

**Root cause.** `buildFormulationPreviewInternal` returned
`impossible_under_constraints` only for `capped && hardMetrics > 0 &&
verdict === 'engine_improved'`. T9 (Strawberry EXACT 900 g, Fruit Gelato −11,
1000 g) is a *category-fallback* profile — all 10 residual violations are
provenance-SOFT — so the capped run slipped through as an applicable Preview
labelled best-achievable (`5/10`, „violations 10 → 10", stop `iteration_cap`).
No door gate examined the iteration cap at all.

**Fix.**
- `applyPipeline.ts` — a constrained reformulation whose iteration hit the
  deterministic cap now ALWAYS returns `impossible_under_constraints`
  (band provenance irrelevant: a capped run proves nothing). The failure
  carries `capReached: true`, `residualViolatedMetrics` (the degenerate-outcome
  evidence), the exact `conflict`, the A3-bisection `nearestFeasibleGrams`
  (probe hardened: a capped probe can never certify feasibility) and the new
  deterministic `alternativeProductType: 'sorbet'` (conflict line resolves to
  the `fruit` role + an approved sorbet template exists at this temperature).
- `previewIssueMessage.ts` — the Polish message names the conflict and BOTH
  suggestions: „…PI wyczerpało deterministyczny budżet ruchów solvera
  (wywołania: 12) bez osiągnięcia zatwierdzonych zakresów — taki wynik nigdy
  nie jest uznawany za recepturę. Najbliższa wykonalna wartość dla
  „STRAWBERRIES · Fresh Fruit": maksymalnie 894,9 g (zweryfikowana przez
  Engine) — zmniejsz ten składnik do tej wartości. Możesz też zmienić typ
  produktu na Sorbet. Receptura nie została zmieniona."
- Unconstrained capped formulations keep a preview but it is
  `diagnosticOnly` — Apply is refused at the door (below).

**Door enforcement (not UI-only).** `commitPreview` gained the structural
`iteration_cap_diagnostic` block: any optimize preview whose iteration
diagnostics show `capped`/`stopReason==='iteration_cap'` is refused with the
honest Polish message. Proven by forging a capped copy of a genuinely feasible
preview — the door refuses it (`addendum1` test „DOOR-ENFORCED"). Formulation
previews without iteration diagnostics were already refused by the
proof-consistency gate.

**Kept applicable (owner boundary).** Fixed-point proofs WITHOUT the cap
commit exactly as before — pinned for `engine_improved` (strawberry-600) and
`no_feasible_improvement` (strawberry-350 projection fixed point).

**Before → after (real pipeline).**
| | before (a55f5fc) | after |
|---|---|---|
| T9 outcome | `preview` (applicable, Apply allowed) | `impossible_under_constraints` |
| verdict | AUTHENTIC-BEST-ACHIEVABLE | HONEST-IMPOSSIBLE |
| stop | `iteration_cap` (12 invocations) | `iteration_cap` (12), `capReached: true` |
| presented state | proposed 1000 g recipe, 5/10, 10 soft violations | none fabricated — the record assesses the unchanged 900 g draft (overall 45.4655, batch 900, `finalLines: null`) |
| guidance | none | nearest feasible 894.9 g (bisection, engine-verified) + switch to Sorbet |

**Updated pins (justification).** `engineAuthenticity.test.ts` T9 row +
T1–T9 structural loop (owner addendum supersedes the previous drift pin: an
iteration-capped run can never be labelled best-achievable proof; T9 has no
proposed state, so byte-lock/batch pins now cover T1–T8 and T9 pins the
honest-impossible shape). Pink context preserved: the impossible carries
`templateStatus: 'reference_derived'` (asserted).

---

## Item 2 — SCORE SPLIT („Dopasowanie techniczne" vs flavor/cost)

**Root cause.** The public headline read the engine's mode-weighted `overall`
blend (`recipeMatchScore`), which mixes flavor/cost sub-scores — T17
(milk_gelato −12, ALL native bands in range, 0 violations) presented as 9/10
(overall 88.1667 → round 9). NO engine change was needed or made.

**Fix (adapter layer only).**
- NEW `src/features/recipe-score/technicalFit.ts` — `recipeTechnicalFit`:
  ALL native approved technological bands in range (0 violations, no
  provisional banding) ⇒ EXACTLY 10/10 (`validatedNative: true`); with
  violations the integer degrades honestly from the engine's own
  `scores.technical` dimension, structurally capped at 9; provisional/fallback
  profiles keep „Ocena częściowa / prowizoryczna" and are structurally capped
  below 10 (can never show a validated native 10/10). `commercialDimensions`
  presents flavor („Profil smakowy") and cost („Koszt") as SEPARATE labeled
  1–10 dimensions — never blended into the technical integer, unknown cost
  stays an honest „Brak danych kosztowych". Integer-only — no fake precision.
- Headline surfaces switched: `OverallScoreCard` (headline + separate
  dimension rows + technical tooltip: „10/10 oznacza, że wszystkie natywne
  zatwierdzone zakresy są w normie… Koszt i profil smakowy są osobnymi
  wymiarami…"), `piMonitorHomeView` (Monitor Home; `violationCount` stripped —
  §22 numeric hygiene), `PiMonitorSection`, `recipeIndicatorStatuses`
  (readiness + §14.1 status line), `ProRecalcPanel` best-safe readout
  („Dopasowanie techniczne: …").
- `recipeMatchScore` remains a sanctioned pure map for QA recorders — its
  behavioural pins are unchanged.

**Before → after (real pipeline, T17).**
| | before | after |
|---|---|---|
| headline | „Dopasowanie receptury" 9/10 (overall 88.1667 blend) | „Dopasowanie techniczne" **10/10**, `validatedNative` |
| flavor/cost | invisibly blended into the headline | separate labeled dimensions (integer, honest no-data cost) |
| provisional profiles | partial note only | partial note + structural cap < 10, `provisional` flag |
| QA record (`score.tenPoint`) | 9 (overall map) | 9 (unchanged — recorder semantics kept) |

**Updated pins (justification).** `OverallScoreCard.test.tsx`,
`scoreSurfaceAuthenticity.test.ts`, `recipeMatchScore.{ts,test.ts}` headers —
documented DELIBERATELY: the owner addendum supersedes the §15.1
no-sub-dimensions rule; technical is THE headline integer, flavor/cost are
separate dimensions, still no fake precision.

---

## Item 3 — HARD RESIDUALS ⇒ DIAGNOSTIC PREVIEW ONLY (T14/T19)

**Root cause.** The frozen accept-with-explanation contract let a verified
fixed point with residual violations on NATIVE approved bands apply normally.
T14 (sorbet inulin-0: native `ice_fraction` 50.67 < 51) and T19 (sorbet from
strawberry: native ice 50.82 < 51) were `hardSafe=false` yet presented — and
committed — as safely applicable recipes.

**Fix.**
- Previews carry the honest classification: `hardResidualMetrics`
  (via `classifyViolationBands` provenance — the SAME classifier that defines
  `hardSafe`) and `diagnosticOnly`.
- **Door enforcement, trustless:** `commitPreview` recomputes
  `classifyViolationBands(preview.proposedInput)` at the door (never trusts
  preview flags — proven by the stripped-flags test) and refuses any optimize
  preview with hard-native residuals: new blocked code
  `hard_residual_violations`, Polish message listing the exact metrics
  („…narusza zatwierdzone zakresy technologiczne (natywne): udział lodu.
  Podgląd ma charakter wyłącznie diagnostyczny — nie można go zastosować.
  Receptura nie została zmieniona.").
- `ConstraintPreviewCard` labels the diagnostic preview („PODGLĄD
  DIAGNOSTYCZNY" banner naming the hard metrics) and replaces Apply with a
  disabled control — presentation truth on top of the door, never instead of it.
- Soft/provisional residuals stay applicable with explanation (pinned: the
  T12 fruit-gelato state, residuals all provenance-soft, commits).

**Before → after (real pipeline).**
| | before | after |
|---|---|---|
| T14 | preview 7/10, `hardSafe=false`, APPLIED through the store (pinned „accept with explanation") | preview builds (diagnosis), `diagnosticOnly`, Apply **blocked** `hard_residual_violations` (udział lodu); recipe byte-untouched |
| T19 | preview 7/10, `hardSafe=false`, presented applicable | same structural block |
| soft residuals (T12 etc.) | applicable | applicable, unchanged |

**Updated pins (justification).** THIS SUPERSEDES the earlier
accept-with-explanation freeze for hard-native residuals (owner addendum):
`constrainedReformulation.test.ts` FIXTURE A apply-through-store test now pins
the block + untouched recipe; `applyPipeline.test.ts` /
`constraintStudioStore.test.ts` / `recalcDuplication.test.ts` apply-MECHANICS
pins moved to hard-safe fixtures (single-lock over-sweet starter → solver
converges to ZERO violations) with the both-locked hard-residual scenario now
pinned as door-blocked; `autoBalance.test.ts` forged-8×125 g pin updated (the
hard-residual gate fires before the improvement invariant — still structurally
unappliable); the OWNER_BASE five-cycle recalc test pins the new law (every
cycle blocked, draft byte-identical — the duplication defect impossible a
fortiori), with applied-cycle dedup mechanics kept on an applying scenario.

---

## Item 4 — MAX/RANGE SEMANTICS (T12)

**Audit of the runtime path (owner-requested proof).**
- UI staging: `RangeConstraintEditor` → `constraintStudioStore.
  setRangeConstraint(lineId, min, max)` stores the canonical
  `{mode:'range', minGrams, maxGrams}` in the §17 set (validated, never
  clamped) and maps the line onto `lock_type:'grams'` purely as the
  HOLD-AT-CURRENT staging for engine solver paths. T12's canonical constraint
  IS `{mode:'range', minGrams:0, maxGrams:500}` — never a `lock_type='grams'`/
  exact encoding in the constraint set (pinned end-to-end through
  `selectCanonicalDraft`).
- **Root cause found by the audit:** in `buildFormulationProposal`
  (formulate.ts) the `match.locked` branch (true for `lock_type='grams'` with
  grams > 0) fired BEFORE the `constraint?.mode === 'range'` branch — every
  UI-staged range degraded to an EXACT hold at the current grams; the range
  branch was unreachable and a max bound gave the solver no freedom. T12 only
  looked correct because its current grams (500) coincided with the max —
  its pinned record was byte-identical to T11's exact lock.

**Fix.** A §17 RANGE constraint now outranks the lock-type staging: the
formulation seeds the template share CLAMPED into `[min, max]` and the line
stays scalable within its bounds (max may move below; exact may not). No
science change — bounds and template values untouched.

**Before → after (real pipeline).**
| | before | after |
|---|---|---|
| T12 (milk MAX 500, 1120 g draft) | milk **500 g** (byte-identical to T11 exact; overall 81.777, 2 violations) | milk **380 g** — strictly below the max, at the template proportion; overall 82.1399, 1 violation |
| milk range 0–800, milk_gelato −11, draft 700 g | milk held 700 g (range = de-facto exact hold) | milk lands at the approved template proportion 670 g, strictly < 800 |
| T11 (EXACT 500) | milk 500 byte-held | unchanged — milk 500 byte-held |

**Tests (addendum4).** (a) optimum below the max (milk max 800 → ~670,
never riding the bound, never the degraded 700-hold); (b) exact-500 vs
max-500: different canonical representations, different
`verifyConstraintsPreserved` semantics (milk 450 passes the range, violates
the exact lock) and different solver outcomes (500 byte-held vs 380);
(c) round-trip: the T12 preview commits through the door with milk within
[0,500] and the applied constraint set STILL the range object (verified by
`verifyConstraintsPreserved` on the committed state).

**Updated pins (justification).** `engineAuthenticity.test.ts` T12 row +
T11/T12 structural test split — deliberate: the addendum defines max as real
downward freedom; the identical-to-T11 pin was the defect's signature.

---

## Handoff closure (Agent R) — LOCAL route honors canonical exclusions

**Gap.** The LOCAL-correction route's solver rounds (`solveOneRound` →
`proposeAutoFix`) never saw `excludedIngredientIds` — a solver ADD could
reintroduce an explicitly excluded ingredient (never-reintroduce was pinned on
the formulation seed only).

**Fix.** Solver-round ADD candidates are now filtered against the canonical
draft's exclusions using the SAME matching as `isToolboxCandidateExcluded`
(engine candidate id OR stable canonical Mapper id), threaded through BOTH
routes (`iterateSolverToFixedPoint` local path AND `iterateFormulationSeed`
post-seed rounds + nearest-feasible probes). Rejected moves are logged in the
attempted-move QA evidence as `excluded_add_blocked`.

**Proof.** `acceptanceAddendum.test.ts` „handoff (Agent R)": control run
reintroduces milk legitimately when nothing is excluded; excluded under the
engine id (`milk_3_5`) OR the Mapper id (`PI-ING-000236`) milk never returns
(honest refusal, nothing fabricated); inside a successful local preview the
milk-dilution ADD is logged `excluded_add_blocked` and no milk row is created.

---

## Preserved invariants (asserted, all green)

- proportional-scaling detector + proof-carrying previews
  (`formulationAuthenticity.test.ts` unchanged and green);
- projection never final without verified improvement (proof-consistency door
  gate unchanged; `no_feasible_improvement` fixed points still applicable);
- pink markers: T9's impossible carries `reference_derived` template context;
  the diagnostic-preview card keeps the `NonProductionBadge` on
  reference-derived sources; provisional profiles keep „Ocena częściowa /
  prowizoryczna" and can never show validated native 10/10;
- frozen suites green: zeroGramSemantics, applyIntegrity, boundary pins,
  iteration diagnostics (optimizerIteration), backendGuard, nightlyP0,
  recalcDiagnosis, staleDraftState, liveRuntime, stabilizerDosage — FULL run
  381 files / 5131 tests, 0 failures.
