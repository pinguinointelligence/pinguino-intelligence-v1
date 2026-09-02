# GLOBAL USER INTENT / SOFT-HOLD SOLVER — completion ledger (2026-08-23)

Owner brief: *„Fix destructive user-line drift without turning user input into
hard locks."* Staging only. No production deploy, no Mapper mutation, no merge
to `main`.

---

## 1. Starting / final staging SHA

| | SHA |
|---|---|
| staging at session start | `1b4628f` |
| staging when the work was rebased | `d10b103` (3 incoming commits from a parallel agent) |
| **staging after this work** | **`f1b0f8a`** + follow-up tidy commit |
| production `main` | `4dfb097` — **untouched** |

Branch: `claude/user-intent-soft-hold`, worktree
`~/Developer/pinguino-intelligence-v1-soft-hold`. Rebased onto `origin/staging`,
fast-forward push, no force push.

---

## 2. The exact 40 → 1 root cause

Two mechanisms, both proven from the code and from a deterministic reproducer.

**A. The gram ladder handed the search the collapse.**
`draftCandidateVector.ts` contained a literal

```ts
if (anchorGrams !== null && Math.abs(current - 1) >= MIN_MOVE_GRAMS) tested.add(1);
```

For exactly the lines that carry user intent, the ladder added a rung at the
**presence floor**. The number `1` came from the „no 0 g rows" executable
invariant, not from any technical need — precisely the workaround owner §25
forbids. Verified on the owner recipe: every anchored line was offered a 1.0 g
rung — milk 595, cream 180, yolk 40, inulin 20.

**B. Nothing in ranking knew the difference between 40 → 38 and 40 → 1.**
`strictlyBetter` ranked on `(violations, severityPoints)` only. The ECO sweep
ranked on `(same technical fit, cheaper)` only. Neither carried any term for the
user's own amounts, so among equally-valid candidates whichever reached the band
first won — and a destructive one often reaches it first because deleting a
high-protein, high-fat ingredient moves several metrics at once.

**Measured on pre-change staging** over a 48-cell gelato matrix (dried yolk
40/60/80/100 g × SMP 30/60/90 g × cream 180/120 g × −11/−13 °C):

> **27 of 48 states drove the user's positive dried-egg-yolk line to exactly 1 g** —
> including states that ended *still out of band* (e.g. 4 → 1 violations: PI
> deleted the ingredient **and** returned an illegal recipe).

---

## 3. The new authority

`src/features/formulation/userLineIntent.ts` — one canonical concept for
„the user gave this line a positive amount". No ingredient list, no egg-yolk
exception. A line's class is derived from its resolved functional role plus the
lock/Main authority that already exists.

### Drift formula (owner §9)

```
                | proposed − baseline |
    drift  =  ─────────────────────────────
               baseline + batch × 0.001
```

Relative-dominant with an absolute floor taken from the **batch** — the same
0.1 % rung the gram ladder already uses, so it is not a tuned constant. At a
1000 g batch:

| move | drift | reading |
|---|---|---|
| yolk 40 → 1 g | 0.951 | catastrophic |
| yolk 40 → 35 g | 0.122 | ordinary optimization |
| milk 600 → 561 g | 0.065 | ordinary optimization |
| tara 2 → 3 g | 0.333 | noticeable, not catastrophic |

The **same 39 g move** reads 0.951 on the yolk and 0.065 on the milk — exactly
the separation §9 demands — and a tiny stabilizer line cannot dominate the sum
merely for being small.

### Flexibility classes and weights

| class | weight | source of truth |
|---|---|---|
| `hard_locked` | 0 (exact) | §17 padlock / non-unlocked `lock_type` |
| `main_protected` | 0 | the Main contract owns it (§20) |
| `user_flavour_structure` | 1.0 | roles `egg, fruit, nut_paste, chocolate_cocoa, alcohol, flavor_other, dairy_fat, plant_fat, protein_source` |
| `user_general` | 0.7 | role `milk_solids` |
| `user_technical_balancer` | 0.3 | roles `primary_liquid, plant_liquid, water, sweetener_sucrose, sugar_freezing_control, fiber_body, salt_modifier, stabilizer` |
| `pi_auto_added` | 0 | no intent sidecar |

Every **user-specified positive** line has nonzero weight (owner §10).

### Material deviation

`MATERIAL_USER_INTENT_DRIFT = 0.5`, and a material deviation is a **collapse**,
not any large move — the check is reduction-only. §11 is equally binding, so PI
stays free to raise a balancing line hard. (An earlier symmetric version pushed
ordinary rebalances — inulin 20 → 70 g, cream 120 → 220 g — into the
proof-and-disclose path; that both narrowed the search and flooded Preview with
warnings about PI doing its job.) Growth still counts fully in the ranking.

---

## 4. What changed in the solver

- **Ladder** — the bare `tested.add(1)` rung is replaced by a rung at the
  material floor. The presence floor stays *reachable* (§12 requires a genuinely
  necessary large change to remain possible) but is now a material deviation.
- **Ranking (§8)** — hard legality and engine severity decide first and are
  **unchanged**. Drift is consulted only between candidates the engine cannot
  tell apart. It is deliberately **not** an acceptance key: promoting drift-only
  gains changed accepted trajectories far from any user line (measured: the
  Kiwi-700 ProductBehavior fixture lost its auto-added Inulin row).
- **Preserve-first search (§12)** — preserving rungs are searched on their own;
  the deviating rungs are reached only when the preserving ones leave the recipe
  out of band, and their result is kept **only when it reaches a fully legal
  recipe**. Anything weaker reproduced the defect.
- **ECO (§23)** — deviating rungs are removed outright. Cost ranks below recipe
  intent, and an ECO pass only ever trades an already-legal recipe for a cheaper
  one, so it has no legality excuse.
- **Rescue (§24)** — no change needed: `batchRescueMultiLeverSolver` is
  **add-only by construction** („no reduce path exists"), so it cannot collapse
  a user line.
- **Preview (§13)** — `finishPreview` is the single convergence point for every
  preview builder, so the drift report is computed there, trustlessly, from
  (baseInput, executableInput). `ConstraintPreviewCard` renders a named per-line
  disclosure for every material deviation.
- **Import (§1/§26)** — adopting a library recipe now writes the intent baseline,
  so imported lines are not treated as disposable PI support lines.

---

## 5. Result on the owner reproducer

| | before | after |
|---|---|---|
| 48-cell collapse matrix | **27/48 collapsed to 1 g** | **1/48**, and that one reaches violations 3 → **0** and is flagged as a disclosed deviation |
| Polish Lost, yolk unlocked | — | **yolk stays 40.0 g**, batch 1000 g, 0 violations, score 10 |
| Polish Lost, yolk hard-locked | — | yolk exactly 40 g, 0 violations, score 10 |
| Inulin minimum | 20 g | **20 g — untouched** (`OWNER_INULIN_POLICY` 2 % of batch, never relaxed) |
| Canonical identity | `PI-ING-001645` | preserved; no substitution to fresh yolk |

The regression suite **fails 38 tests against the pre-change solver and passes
all of them after** — the proof owner §14 demands.

---

## 6. Truthful copy (§28)

`rescaleChangedCompositionNote` fires precisely when `compositionUnchanged` is
**false**, yet claimed „proporcje pozostają twoje" while proposing 595 → 486 g
milk and 180 → 267 g cream. It now says what actually happened:

> „Zmieniono masę partii: … PI zbilansowało recepturę, zachowując wskazane
> składniki i ograniczenia — proporcje składników uległy zmianie. Nie
> potwierdzono poprawy technicznej."

---

## 7. Verification

| gate | result |
|---|---|
| `npx tsc -b --force` | **0 errors** |
| `npm run lint` | 0 errors, 4 warnings — **identical to `origin/staging`** (pre-existing) |
| `npm run build` | **OK** |
| `npm run production-rescue:bundle-check` | verified `76bd852a…` |
| `git diff --check` | clean |
| full suite (pre-rebase) | 642 files / **8142 passed**, 0 failed |
| full suite (post-rebase) | 657 files / **8275 passed**, 0 failed |
| full suite (final, clean load) | 657 files / **8275 passed**, 0 failed, 396 s |
| new regression suite | 84 tests |
| existing tests modified | **none** |

---

## 8. Files

**New** — `src/features/formulation/userLineIntent.ts`,
`src/features/constraint-studio/userIntentSoftHold.test.ts`,
`src/features/constraint-studio/userIntentSoftHoldAudit.report.test.ts`,
`reports/USER_INTENT_SOFT_HOLD_AUDIT.csv`.

**Changed** — `draftCandidateVector.ts`, `ecoDraftCostSweep.ts`,
`applyPipeline.ts`, `constraintStudioCopy.ts`, `ui/ConstraintPreviewCard.tsx`,
`services/executableRecipeHandoff.ts`.

---

## 9. Honest gaps — what is NOT done

1. **Served QA on staging (§31) HAS NOW RUN — and TEST A FAILED.** See
   `USER_INTENT_SOFT_HOLD_SERVED_QA_2026-08-23.md`. With the yolk unlocked the
   served app still proposes **40 g → 1 g**, because the served recipe routes to
   `full_formulation` (`milk_base_v1`) and NOT to the gram-ladder sweep this
   work governs. The §13 disclosure and the truthful copy DO fire there, so the
   collapse is no longer silent — but it still happens. The locked run reaches
   the same hard-valid target with the yolk at 40 g, which proves a preserving
   solution exists. Superseded note kept below for history:

   ~~Served QA on staging (§31) was not performed.~~ It requires signing in to
   `staging.pinguinoai.com`, and Claude must never type the account credentials.
   The owner has to sign in before the served Polish-Lost run (locked and
   unlocked), Apply, Save/reopen and Undo can be verified. Everything reported
   above is local: engine-level, pipeline-level and full-suite evidence.
2. **The exact served 40 → 1 candidate was not reproduced offline.** The owner's
   reported candidate (milk 595 → 486, cream 180 → 267) comes from a solver path
   this fixture does not reach: with Mapper rows, `SUCROSE SUGAR` carries
   `pac_value = 100`, so `resolveFunctionalRole` classifies it
   `sugar_freezing_control`, the hard role `sweetener_sucrose` is never carried,
   and every Mapper milk gelato routes to `full_formulation` rather than the
   local corrector. **This looks like a latent unit-scale bug in role resolution
   and is worth a separate ticket** — it is not touched here. The collapse was
   instead reproduced and fixed at the mechanism that produces the number 1.
3. **Performance (§30): a modest real cost, on top of a pre-existing flaky
   budget.** Sibling worktrees ran their own suites throughout (load average
   ≈ 16–21), so absolute numbers are noisy. Interleaved 3× measurement of the
   heaviest case — `mainTechnicalMaximum` „20 % ECO Main floor", which carries
   its own 60 s in-test budget:

   | run | baseline `d10b103` | soft-hold |
   |---|---|---|
   | 1 | 24.95 s | 36.18 s |
   | 2 | **93.07 s** | 42.54 s |
   | 3 | 30.73 s | 42.98 s |

   Note the **baseline itself exceeded its own 60 s budget at 93 s** in run 2 —
   this test is flaky under machine load independently of this work.

   Repeating the comparison once the machine quietened (load average 4.9), over
   BOTH slow files together — `mainConstrainedNearestAndRescue` +
   `mainTechnicalMaximum`, 64 tests:

   | | duration | result |
   |---|---|---|
   | baseline `d10b103` | 112.31 s | 64/64 passed |
   | soft-hold | **106.22 s** | 64/64 passed |

   Under comparable conditions the two are **within noise of each other, with
   the soft-hold build marginally faster**. The earlier „+35 %" reading was
   contention, not signal. Across five full-suite runs, the three taken under
   lighter load were completely green; the two failures were timeouts in runs
   that were themselves 60–80 % slower overall (625 s and 694 s vs 384 s), and
   one of them missed its budget by 0.16 s.

   **No timeout was raised.** Masking cost behind a bigger budget would be
   exactly the test-weakening the brief forbids — and the measurement says there
   is no systematic cost to mask. The pre-existing marginality of that 60 s
   budget under load is worth an owner decision, but it is not caused by this
   change.

   Untouched: `MAX_SOLVER_ROUNDS`, the global timeout, and every convergence
   guard. No run hung and no infinite spinner was observed.
4. **Cross-profile coverage (§17/§18) is authority-level, not full-pipeline.**
   The representative types — dried egg yolk, fruit, nut paste, cocoa, alcohol,
   coconut/plant fat, protein, dairy structural, plant base, sugars, fibre — are
   pinned for classification, weight and ladder partition. Full per-profile
   served Sorbet/Vegan/Protein solves were not run.

---

## 10. Production safety

No production Vercel deploy, no production Edge deploy, no production DB write
or migration, no merge to `main`, no Mapper mutation. `main` remains `4dfb097`.
