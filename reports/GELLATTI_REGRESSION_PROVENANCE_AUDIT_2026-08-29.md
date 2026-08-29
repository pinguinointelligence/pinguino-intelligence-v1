# GELLATTI — P0 REGRESSION PROVENANCE AUDIT

**Date:** 2026-08-29
**Mode:** READ-ONLY forensic audit. No code edited, no commit, no push, no deploy, no database change.
**Audited SHA:** `origin/staging` = `4b649796597149feebc1fa051f710142049a969b`
("fix(crown): seed one gram when the crown lands on an empty line", 2026-08-29 10:39)
**Basis:** clean detached worktree created at that exact SHA. No dirty checkout was used.
(The main working copy `~/Developer/pinguino-intelligence-v1` is on branch `codex/live-product-scanner` with 111 modified files and was deliberately NOT used as the analysis basis.)
**Audit window:** `7b7bb63..4b649796` — the last fully closed served-verified baseline (Sucrose/Water role contract, 2026-08-24) through current staging.

---

## 0. THE ANSWER IN ONE PARAGRAPH

Old bugs are coming back because **staging has no mechanical gate of any kind**, and the repository's only real gate — the regression tests — is routinely **rewritten by the same commit that breaks the behaviour it guards**. `.github/workflows/ci.yml` fires only on `push`/`pull_request` to `main`; `main` has been frozen since 2026-07-23. All **270 commits** in this five-day window reached staging with **zero automated verification**. Within that window at least **three previously-accepted functional contracts were silently destroyed by commits whose stated purpose was cosmetic or unrelated**, and each was rediscovered by the owner or by a later agent rather than by a test. The single clearest instance — the Crown/Main trigger — was deleted by a commit named *"unify main badges"*, which in the same diff rewrote the guard test from *"a clickable crown control exists"* to *"the slot is empty"*. The suite stayed green. That is the mechanism, and it is structural, not incidental.

Design and Language work, examined at hunk level on the highest-risk commits, is **largely exonerated**: the two largest copy commits of the window changed only Polish strings and formatting inside the protected engine files, and the most recent design commit touches **zero** engine files. The damage came from **mixed-purpose "fix + tidy" commits** and from a **five-day, 270-commit uncontrolled integration rate** (peak: 92 commits on 2026-08-25).

---

## 1. CURRENT REAL STAGING

```
origin/staging = 4b649796597149feebc1fa051f710142049a969b
```

Recent lineage (newest first):

| SHA | Date | Subject |
|---|---|---|
| `4b649796` | 08-29 10:39 | fix(crown): seed one gram when the crown lands on an empty line |
| `385043ca` | 08-29 10:28 | feat(ui): reproduce the owner-approved Gellatti V2.1 design 1:1 |
| `55af66c2` | 08-29 10:13 | docs(product-behavior): canonical module eligibility ledger |
| `fa4b03cc` | 08-29 09:54 | fix(product-behavior): make Mapper the single module-eligibility authority |
| `616f65e6` | 08-29 09:11 | fix(main): honor the Main positive-mass contract |
| `f08a920f` | 08-29 02:00 | feat(ui): implement approved Gellatti V2.1 routed redesign |
| `d7665157` | 08-29 00:43 | fix(product-behavior): restore canonical starter authority |
| `ee70985c` | 08-29 00:58 | fix(machine): default Professional batches to 1000 g |

Production `main` = `4dfb097` (2026-07-23) — untouched, as required.

---

## 2. REGRESSION PROVENANCE TIMELINE

**270 commits in 5 days.** Volume by day:

| Date | Commits |
|---|---|
| 2026-08-24 | 34 |
| 2026-08-25 | **92** |
| 2026-08-26 | 52 |
| 2026-08-27 | 58 |
| 2026-08-28 | 25 |
| 2026-08-29 | 9 |

Workstream classification (by subject + touched paths):

| Workstream | Commits | Functional drift found |
|---|---|---|
| Scanner / recognition | 31 | none in protected areas |
| Design / UI | 29 | **1 P0** (see §4.1, via a mixed commit) |
| Production / rescue | 28 | none in protected areas |
| Catalog / import | 22 | none in protected areas |
| **Crown / Main** | 20 | **contract evolution + 1 P0** |
| Test-only | 18 | **2 weakenings** (§9) |
| Docs / chore | 18 | n/a |
| Labels | 17 | none in protected areas |
| Profile / ProductBehavior | 15 | **1 architecture reversal, self-corrected** |
| Merges | 13 | **clean — no evil merges** |
| Direction / engine | 13 | **1 acceptance-semantics change** (§6) |
| Copy / language | 9 | **none** — strings and formatting only |
| Machine / batch | 7 | **2 P0** (§5) |

**The tell:** eleven commits in five days are named *restore* or *repair*. Each one is a previously-working capability that had to be put back:

| SHA | Time | What had to be restored |
|---|---|---|
| `82440bb6` | 08-25 01:27 | engine admission |
| `bfc641e3` | 08-25 02:40 | product-owned behavior authority |
| `a6f0a867` | 08-25 08:34 | historical recipe behavior restore lifecycle |
| `8aed5d55` | 08-25 09:31 | identity in non-atomic fallback |
| `d0273de5` | 08-25 14:53 | PAC display |
| **`1c94d67c`** | **08-26 09:06** | **Crown trigger in ingredient rows** |
| `cc2cc13e` | 08-27 12:41 | preview score |
| `ee4d2202` | 08-27 16:17 | explicit step 3 transition |
| **`7edd90ea`** | **08-28 15:29** | **live draft result visibility** |
| **`d7665157`** | **08-29 00:43** | **canonical starter authority** |

A healthy tree does not need eleven restorations in five days. This is the symptom the owner is reporting, quantified.

---

## 3. PROTECTED FUNCTIONAL AREAS — TOUCH MAP

Commits in the window touching each protected file (non-test):

| Protected file | Window commits |
|---|---|
| `applyPipeline.ts` | 30 |
| `IngredientRow.tsx` | 29 |
| `constraintStudioStore.ts` | 17 |
| `recipeStore.ts` | 15 |
| `IngredientBuilder.tsx` | 14 |
| `formulate.ts` | 4 |
| `practicalRecipe.ts` | 4 |
| `mainCapability.ts` | 2 |
| `productBehaviorAccess.ts` | 1 |
| `draftCandidateVector.ts` | 1 |
| `userLineIntent.ts` | 1 |
| `buildRecipeInput.ts` | 0 |

`applyPipeline.ts` — the single most safety-critical file in the product — absorbed **30 commits in five days**, from eight different workstreams.

---

## 4. REINTRODUCED OLD LOGIC — CONFIRMED CASES

### 4.1 P0 — THE CROWN/MAIN TRIGGER WAS DELETED BY A BADGE-UNIFICATION COMMIT

This is the clearest proven instance of the pattern the owner described.

| | |
|---|---|
| **FUNCTION** | The row control that sets an ingredient as Main/Crown (`row-main-toggle` → `setRole('main')`) |
| **GOOD COMMIT** | `83c784bb` (08-11) — control present; still present at `042a3134` (08-24, UI unification) |
| **COMMIT THAT REMOVED IT** | **`f5d57bdf` (08-26 00:26) — "fix fresh recipe behavior hydration and unify main badges"** |
| **RESTORED BY** | `1c94d67c` (08-26 09:06) — "restore Crown trigger in ingredient rows", 8 h 40 min later |
| **CURRENT AT HEAD** | **PASS** — `MainRoleTrigger` present, rendered at `IngredientRow.tsx:595` (mobile) and `:813` (desktop) |

**Exact hunk removed by `f5d57bdf`:**

```diff
-                  aria-label={isMain ? 'Składnik Główny' : 'Ustaw składnik jako Główny'}
-                  onClick={() => setRole(isMain ? 'standard' : 'main')}
-                  data-testid={`row-main-toggle-${item.id}`}
```

**State left behind** (`IngredientRow.tsx` at `1c94d67c^`) — the Main slot rendered a badge when already Main, and **nothing at all otherwise**:

```jsx
<span aria-hidden={isMain ? undefined : true} data-testid={`row-main-slot-${item.id}`}>
  {isMain ? ( <MainRoleBadge ... /> ) : null}
</span>
```

Functional consequence: for ~9 hours on staging, **a user could not crown an ingredient from the recipe row at all** — on desktop or mobile. Every Crown/Main contract downstream (maximize, Multi-Main, Protein Main) was unreachable through the primary entry point.

**Why no test caught it — the same commit rewrote the guard.** `f5d57bdf` modified five test files (`IngredientBuilder.mainRole.test.tsx`, `IngredientTableUx.test.tsx`, `desktopStructureLock.test.tsx`, `mobileProUx.test.tsx`, `responsiveParity.test.tsx`). The decisive rewrite:

```diff
-  it('transitions outline → filled → outline through the existing row Main action', () => {
-    expect(crown?.getAttribute('aria-pressed')).toBe('false');
-    expect(crown?.querySelector('[data-crown-state="available"]')).not.toBeNull();
+  it('transitions fixed empty slot → badge → fixed empty slot through the existing role actions', () => {
+    expect(container.querySelector(`[data-testid="row-main-slot-${main.id}"]`)).not.toBeNull();
+    expect(container.querySelector(`[data-testid="row-main-badge-${main.id}"]`)).toBeNull();
```

The test that asserted *"a clickable crown control exists in the non-Main state"* was rewritten to assert *"the slot is empty in the non-Main state."* **The suite went green on the broken behaviour.** This is exactly the §9 failure mode, and it is the single most important finding in this audit.

### 4.2 ARCHITECTURE REVERSAL — PER-PRODUCT ALLOW-LIST REINTRODUCED, THEN SELF-CORRECTED

| | |
|---|---|
| **Contract** | "The owner rejected any second per-product BASE_RECIPE registry; a new canonical product must never need a code change to be usable." |
| **Violated by** | `d7665157` (08-29 00:43) "restore canonical starter authority" — created `src/features/product-intelligence/canonicalRecipeProductBehaviorAuthority.ts`, a hand-keyed allow-list on `PI-ING-000270`, `PI-ING-000514`, … — the very product IDs whose per-ID override triggers had just been dropped |
| **Corrected by** | `fa4b03cc` (08-29 09:54) — replaced it with the Mapper-derived single authority and **deleted the file** (verified via `--diff-filter=D`) |
| **CURRENT AT HEAD** | **PASS** — file absent; no consumer remains; `CANONICAL_RECIPE_PROFILE_ALLOWLIST` gone (only a negative assertion in `canonicalModuleEligibility.test.ts:210` remains) |

Not a live regression — but it shows a banned architecture can be re-introduced and live on staging for nine hours with nothing objecting.

### 4.3 DELIBERATE CONTRACT EVOLUTION — NOT A REGRESSION

`989d6f7e` (08-25 22:34, "separate Crown ratio from gram locks") **removed `withUserHeldMainHold`**, which previously pinned a user-held Main to exact grams. Replacement comment:

> *"an uncalibrated member prevents borrowing another member's sensory envelope, but it does not create an exact gram constraint. The group keeps its user ratio and moves together through the Engine-verified frontier."*

This **matches the owner's current contract D** ("Crown means MAXIMIZE within the valid technical envelope"), so it is recorded as approved evolution, not drift. Flagged only because the earlier accepted memory still describes the exact-hold behaviour — that memory is now superseded.

---

## 5. CROWN / MAIN AUDIT — CONTRACTS A–E

| Contract | Verdict | Evidence at HEAD |
|---|---|---|
| **A. Main at 1 g is active** | **PASS** | `mainObjectiveRaisesMain` (`applyPipeline.ts:2645`) accepts `maximized` **or** `best_achievable` beyond `MAIN_OBJECTIVE_EPSILON_G`; used at all three gates — ECO `:7323`, OPTIMAL clean `:7442`, improved `:7643`. No later commit weakened it. |
| **B. 0 g → Crown ON → auto 1 g, grams immediately editable** | **PASS** | `crownAutoSeed.ts:37` `crownOnPlannedGrams` → `{plannedGrams: 1, autoSeeded: true}`; wired at both role-write paths `recipeStore.ts:1884` and `:2023`. Seeding makes the line a *required* line, so the existing revalidation pass reaches the role transition. |
| **C. Crown OFF preserves user grams** | **PASS** | `crownOffPlannedGrams(planned, autoSeeded) = autoSeeded && planned === 1 ? 0 : planned` (`crownAutoSeed.ts:48`). Restores 0 **only** for an untouched seed; any explicit write clears the flag (`clearCrownAutoSeeded` at `recipeStore.ts:1608, 1784, 1853, 2086`). |
| **C′. Flag never persists / never reaches Engine** | **PASS** | `crownAutoSeededLineIds` absent from `recipePersistPartialize` (verified: 0 occurrences in the partialize body); reset to `[]` at `:999`, `:2128`, `:2271`. |
| **D. Crown = MAXIMIZE, no arbitrary ceiling** | **PASS** | No fabricated 200 g / 20 % cap exists. Bounds are `mainEnvelopeSearchFloorGrams` (ProductBehavior floor), published `behaviorCeiling`, and `mainTechnicalLinearUpperBound` (LP). The uncalibrated path is literally named `MAIN_TECHNICAL_NO_CEILING_*` and those constants are **probe counts (12/12), not caps**. |
| **D′. Crown trigger reachable in UI** | **REGRESSION → FIXED** | Deleted `f5d57bdf`, restored `1c94d67c` — see §4.1. **PASS at HEAD.** |
| **E. Multi-Main preserved** | **PASS (with an open question)** | `verifyMainEnvelope` remains the single authority (`mainEnvelope.ts:230`); `multiMainCombinedPercent.test.ts` still present. **But** an accepted *positive* Protein Multi-Main outcome was converted to a refusal — see §6. |
| **Apply-door dual-proof re-verification** | **PASS** | Both proof shapes still re-verified at the `VerifiedApply` door; the new Direction gate is called there too (`applyPipeline.ts:8824`). |

---

## 6. PROTEIN PROFILE AUDIT — THE SUSPICIOUS BEHAVIOUR IS REAL, AND IT HAS A COMMIT

The owner's renewed Protein suspicion is **substantiated**. It was not caused by Protein science, by Design, or by Language. It was caused by a **Direction acceptance-semantics change shipped inside a UI-titled commit**.

| | |
|---|---|
| **EXPECTED FROM LAST ACCEPTED VERSION** | Protein −13 ECO 2:1 Multi-Main (Banana 352 g + Cranberry 136 g) produced a **positive, applicable** result: `raw.ok === true`, ratio preserved to 6 dp, Main identity verified, `commitPreview → {ok: true}` |
| **CURRENT** | The same fixture is **refused**. Test now reads: *"refuses the −13 ECO 2:1 Main envelope when support repair moves away from Direction"* and *"truthfully refuses the served −13 ECO result that leaves its reached Direction band"* |
| **INTRODUCED BY** | **`7edd90ea` (08-28 15:29) — "fix(pro): restore live draft result visibility"** |
| **MECHANISM** | New `assessDirectionCandidateProgress` (`applyPipeline.ts:1358`): an unreached NEAREST candidate is accepted **only** if the executable gram vector materially changes **and** its distance to the requested band is *strictly smaller*. Enforced at **four** sites, including the Apply trust door (`:6421`, `:6700`, `:8824`) |
| **FUNCTIONAL CONSEQUENCE** | Protein Multi-Main previews that previously applied now refuse. Whether that refusal is *correct science* or *over-strict* is an **owner decision** — but it is a change to an accepted, served-verified contract |

**Exact test rewrite in `7edd90ea`** (the guard was converted, not merely renamed):

```diff
-  it('repairs Protein support before searching the exact -13 ECO 2:1 Main envelope', () => {
-    expect(raw.ok, JSON.stringify(raw)).toBe(true);
-    expect(mains[0]!.planned_grams / mains[1]!.planned_grams).toBeCloseTo(2, 6);
-    expect(committed, JSON.stringify(committed)).toMatchObject({ ok: true });
+  it('refuses the -13 ECO 2:1 Main envelope when support repair moves away from Direction', () => {
+    expect(raw).toMatchObject({ ... });
```

Protein items that **PASS** unchanged at HEAD: eligibility and the five approved Main policies (server-side, untouched by the window); `localCorrectionProfileEligible` routing with reason `profile_owns_formulation_path`; Protein templates; Hardness axis still `blocked_science` (`recipeDirectionTargets.ts:314/337`); WPC preservation; Score/Preview/Apply plumbing.

**Note:** `7edd90ea` also independently re-implemented distance-to-band ranking (`directionDistance`, `requestedDirectionBands`) — functionality that already existed, fully designed and validated, on the never-landed branch `claude/protein-final-closeout` (`directionBandDistance.ts` / `improveDirectionNearestVector`). Two parallel solutions to one problem, neither aware of the other.

---

## 7. DESIGN / LANGUAGE DRIFT AUDIT

**Expected functional drift: ZERO. Measured functional drift from pure Design and pure Language commits: ZERO.** Design and Language are, on the evidence examined, **not the cause** — with one qualification below.

| Commit | Scope | Verdict |
|---|---|---|
| `a2ffff6b` "final Polish language manifest" | **121 src files** — largest of the window | **COPY ONLY.** Every hunk in `applyPipeline.ts` (215 diff lines) and `constraintStudioStore.ts` (54) is a `messagePl` string. Representative: `'Apply zablokowany: …'` → `'Nie można zastosować zmian: …'`. No condition, threshold, callback or data transform touched. |
| `2b1c49c3` "align production history truth and Gellatti tone" | 107 src + 53 test files | **COPY + FORMAT** in the protected set. `mainCapability.ts` (91 diff lines) = prettier re-wrapping plus one Polish string (`'PINGÜINO nie rozpoznaje…'` → `'Gellatti nie rozpoznaje…'`). Boolean logic in `hasCalibratedMainEnvelope` re-indented, **semantics identical**. |
| `a50f2346` "Friendly Lab voice" | 33 src files | **COPY ONLY** (13 diff lines each in `applyPipeline.ts`, `formulate.ts`, `practicalRecipe.ts`). |
| `385043ca` "reproduce V2.1 design 1:1" | 33 src files, landed **between** two functional fixes | **VISUAL ONLY — verified clean.** Touches **zero** engine files; `git diff 55af66c2 385043ca` over `constraint-studio/`, `stores/`, `formulation/`, `product-intelligence/`, `practical-recipe/` is **empty**. It did not revert `616f65e6` or `fa4b03cc`. |
| `fb356b31` / `f08a920f` V2.1 | 77 / 21 files | **VISUAL + presentation plumbing.** Only logic-adjacent movement is the production heat-reminder confirm callback and drag handlers being relocated between components. No Crown, gram-commit, lock or Main-badge semantics altered. |
| `8db8b125` "global visual system recovery" | 26 files | **VISUAL ONLY** — zero functional files touched. |

**The qualification — and the real lesson.** The damage did not come from commits *labelled* design or copy. It came from **mixed-purpose commits that bundled a cosmetic goal with functional code**:

- `f5d57bdf` — "hydration fix **+ unify main badges**" → deleted the Crown trigger (§4.1)
- `7edd90ea` — "restore live draft **visibility**" → changed Direction acceptance semantics (§6)
- `e00175d3` — "enforce canonical batch **coherence**" → broke the Professional 1000 g default (§8)

A policy that gates only commits *named* `design:` or `copy:` would have caught **none** of these three. The gate must be on **touched paths**, never on the commit's stated intent.

---

## 8. MACHINE / BATCH AUDIT

| Contract | Last known good | Broken by | Fixed by | Current |
|---|---|---|---|---|
| **Professional batch = 1000 g** | `2886fe2e` (08-24) | **`e00175d3` (08-28 19:13)** "enforce canonical batch coherence" — Professional began inheriting `defaults?.targetBatchGrams` (a machine batch) via the new `PROFESSIONAL_USER_BATCH` source | **`ee70985c` (08-29 00:58)**, ~6 h later | **PASS** — `PROFESSIONAL_DEFAULT_BATCH_GRAMS = DEFAULT_NEW_RECIPE_BATCH_G`; machine batch honoured only when `machineKind === 'home'` |
| **Custom machine batch fully manual** | pre-08-28 | the same 08-28 machine chain (`473cd50a` / `e00175d3`) | **`c456e96e` (08-28 22:02)** — `MachineProfileSection.tsx` | **PASS** (fix verified present; hunk-level detail not re-derived) |

Both were introduced and repaired inside ~30 hours by the same workstream — again, caught by a human, not by a gate.

---

## 9. REGRESSION TEST SURVIVAL — WHY GREEN TESTS DID NOT CATCH ANY OF THIS

### 9.1 CI does not run on staging. At all.

`.github/workflows/ci.yml`:

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

`main` is frozen at `4dfb097` (2026-07-23). **CI has therefore not executed on a push since July.** All 270 window commits reached staging — and the live staging deployment — with **no typecheck, no lint, no test run, no build** enforced by anything but agent convention. There is no `.husky`, no pre-push hook, no branch protection in evidence.

**This is the permissive condition for every other finding in this report.**

### 9.2 Guard tests are rewritten by the commits that break them

| Test | Guards | Exists at HEAD | Changed in window by | Verdict |
|---|---|---|---|---|
| `IngredientBuilder.mainRole.test.tsx` | Crown/Main row control | yes | **`f5d57bdf`** | **WEAKENED → inverted.** Asserted the control's *absence*; restored by `1c94d67c` |
| `proteinMultiMainPositive.test.ts` | Protein Multi-Main positive Apply | yes | **`7edd90ea`** | **WEAKENED → inverted.** Positive Apply converted to expected refusal |
| `mainPositiveMassContract.test.ts` | Main 1 g (contract A) | yes | — | **INTACT** |
| `zeroGramExecutableInvariant.test.ts` | zero-gram invariant | yes | — | **INTACT** |
| `multiMainCombinedPercent.test.ts` | Multi-Main % authority | yes | — | **INTACT** |
| `ingredientChangeHighlight.test.ts` | change marker | yes | — | **INTACT** |
| `mainTechnicalMaximum.test.ts` | Main frontier | yes | — | **INTACT** |
| `sharedDirectionNearestMatrix.test.ts` | Direction NEAREST | yes | — | **INTACT** |
| `desktopStructureLock` / `finalProWorkbenchDesign` / `mobileProUx` / `responsiveParity` | design locks | yes | **3 / 8 / 7 / 5 commits respectively in 5 days** | **STRUCTURALLY UNABLE TO GUARD.** Rewritten by whatever design commit is landing; they record the newest state rather than defending an accepted one |

Skips are not the problem: only **3** `.skip/.only/.todo` in all of `src`, and only the two Protein internet-matrix suites are env-gated dark by default. **The problem is not skipped tests — it is edited tests.**

---

## 10. STALE-BASE / OVERWRITE AUDIT

**Result: CLEAN. This hypothesis is not supported.**

- **Evil merges: none.** All 13 window merges were checked by diffing the merge result against *both* parents across the full protected set (`applyPipeline.ts`, `recipeStore.ts`, `formulate.ts`, `IngredientRow.tsx`, `productBehaviorAccess.ts`, `practicalRecipe.ts`). **No merge introduced content absent from both parents** — i.e. no conflict was hand-resolved toward stale code on a protected file.
- **No full-file overwrites** of protected files by an older blob were detected.
- **Rebased design commits are benign.** `fb356b31`, `f08a920f`, `385043ca` all show author/commit date skew (rebased before landing), but the decisive check passes: `385043ca`, which landed *between* `fa4b03cc` and `4b649796`, touches **zero** engine files and reverts nothing from `616f65e6` or `fa4b03cc`.
- **The one literal revert pair** (`b9136a45`→`bcfc02d2`, `b6afd979`→`2024b59a`, scanner PM privacy, 08-25) was a deliberate same-day round-trip with a follow-up ledger commit (`53daf810`). Coherent.

**Conclusion:** the regressions were **authored deliberately in ordinary commits**, not resurrected by bad merges, stale bases or cherry-picks. That is worse news than a merge bug, because no merge tooling can prevent it — only a diff gate and an unmodifiable contract suite can.

---

## 11. REQUIRED CONTRACT TABLE

| Contract | Last known good | Current | Regression? | Introduced by | Exact file/function |
|---|---|---|---|---|---|
| **Main 1 g active** | `616f65e6` | Predicate accepts `maximized` ∨ `best_achievable`, all 3 gates | **PASS** | — | `applyPipeline.ts:2645` `mainObjectiveRaisesMain`; gates `:7323`, `:7442`, `:7643` |
| **Crown 0 g auto-seed** | `4b649796` | Seeds exactly 1 g, transient flag | **PASS** | — | `crownAutoSeed.ts:37` `crownOnPlannedGrams`; `recipeStore.ts:1884`, `:2023` |
| **Crown OFF preserves grams** | `4b649796` | Restores 0 only for untouched seed | **PASS** | — | `crownAutoSeed.ts:48` `crownOffPlannedGrams` |
| **Crown trigger reachable** | `83c784bb` / `042a3134` | Restored, present both breakpoints | **REGRESSED → FIXED** | **`f5d57bdf`** (08-26) | `IngredientRow.tsx:595`, `:813` `MainRoleTrigger` |
| **Crown maximize, no arbitrary ceiling** | `989d6f7e` | Bounds from ProductBehavior floor/ceiling + LP only | **PASS** | — | `mainEnvelopeSearchFloorGrams`; `MAIN_TECHNICAL_NO_CEILING_*` = probe counts |
| **Multi-Main preserved** | `bb75411` | `verifyMainEnvelope` sole authority | **PASS** | — | `mainEnvelope.ts:230` |
| **Protein Multi-Main positive Apply** | pre-`7edd90ea` | **Refused** by new strict-progress gate | **REGRESSION — owner decision** | **`7edd90ea`** (08-28) | `applyPipeline.ts:1358` `assessDirectionCandidateProgress` |
| **Protein eligibility / policies / templates** | `7b7bb63` | Unchanged | **PASS** | — | server policies; `formulate.ts` `localCorrectionProfileEligible` |
| **Protein Hardness blocked_science** | `7b7bb63` | Still blocked | **PASS** | — | `recipeDirectionTargets.ts:314`, `:337` |
| **ProductBehavior BASE_RECIPE single authority** | `fa4b03cc` | Mapper-derived only; per-id list deleted | **PASS** (violated `d7665157`, corrected 9 h later) | `d7665157` → `fa4b03cc` | `canonicalModuleEligibility.ts:26–75` |
| **Topping isolation** | `fa4b03cc` | `TOPPING_ONLY` / `BASE_ONLY` / `BASE_AND_TOPPING` roles intact | **PASS** | — | `canonicalModuleEligibility.ts:50` |
| **Professional 1000 g** | `2886fe2e` | Restored | **REGRESSED → FIXED** | **`e00175d3`** (08-28) | `recipeStore.ts` `PROFESSIONAL_DEFAULT_BATCH_GRAMS` |
| **Custom machine batch manual** | pre-08-28 | Restored | **REGRESSED → FIXED** | 08-28 machine chain | `MachineProfileSection.tsx` (`c456e96e`) |
| **Machine batch authority** | `e00175d3` | Canonical registry coherent | **PASS** | — | `recipeStore.ts` `RecipeBatchSource` |
| **Direction fallback / NEAREST** | `36e9bb1` | `MAX_SOLVER_ROUNDS = 18`; new strict-progress gate added | **CHANGED — owner decision** | `7edd90ea`, `2262b34a` | `applyPipeline.ts:2177`, `:1358` |
| **Direction targets from recipe's own goals** | `40b3755` | Reads `input.goals?.direction_targets` first | **PASS** | — | `recipeStore.ts:2237`, `:2242` |
| **Preview/Apply door integrity** | `7b7bb63` | Dual proof shapes re-verified; new Direction gate at door | **PASS** | — | `VerifiedApply`; `applyPipeline.ts:8824` |
| **Zero-gram executable invariant** | `d3530cc` | Intact | **PASS** | — | `practicalRecipe.ts:339`, `:351` |
| **User-intent soft hold** | `bcacb06` | `MATERIAL_USER_INTENT_DRIFT` live | **PASS** | — | `applyPipeline.ts:109`, `:2894` |
| **Save/reopen persistence allow-list** | `4b649796` | Transient crown flag omitted, reset both load paths | **PASS** | — | `recipeStore.ts:895` `recipePersistPartialize` |

---

## 12. PERMANENT PROTECTION PLAN

Ordered by ratio of harm prevented to effort. **A alone would have caught two of the three P0s in this window; B and C together catch all three.**

### A. Make CI actually run on staging — *the single highest-value change*

`.github/workflows/ci.yml` currently ignores staging entirely. One edit:

```yaml
on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main, staging]
```

Then enable branch protection on `staging` so a red run blocks the push. Until this exists, every other rule below is advisory only.

### B. Protected-path diff gate (not a *label* gate)

The three P0s came from commits named *"unify main badges"*, *"restore live draft visibility"* and *"enforce batch coherence"* — none labelled design or copy. Gate on **paths**, never on stated intent.

Declare a protected set: `applyPipeline.ts`, `constraintStudioStore.ts`, `recipeStore.ts`, `draftCandidateVector.ts`, `formulate.ts`, `practicalRecipe.ts`, `userLineIntent.ts`, `mainCapability.ts`, `productBehaviorAccess.ts`, `canonicalModuleEligibility.ts`, `crownAutoSeed.ts`, `mainEnvelope.ts`, `buildRecipeInput.ts`, `IngredientBuilder.tsx`, `IngredientRow.tsx`.

CI rule: if a commit touches a protected file **and** its diff on that file contains any non-string, non-comment, non-formatting change, it must carry an explicit `CONTRACT-CHANGE:` trailer naming the affected contract. A practical, cheap approximation that catches the real cases:

```bash
git diff <base>..HEAD -- <protected> | grep -E '^[-+]' | grep -vE '^[-+]{3}' \
  | grep -vE "^[-+]\s*(//|\*|/\*)" \
  | grep -vE "^[-+][^'\"\`]*['\"\`][^'\"\`]*['\"\`][^'\"\`]*$"
```

Empty output ⇒ string/comment-only ⇒ auto-pass (this is exactly how `a2ffff6b` and `a50f2346` would clear). Non-empty ⇒ requires the trailer.

### C. Frozen regression-contract suite

Create `src/contracts/` holding one test per owner-found P0, and make it **structurally different** from ordinary tests: a CI rule that **any diff to `src/contracts/` requires an owner approval trailer**. This is the direct countermeasure to the mechanism that defeated the suite twice this window — the breaking commit editing its own guard.

Seed it with the contracts in §11, minimally:

| BUG ID | Contract | Fix commit | Guard |
|---|---|---|---|
| `GEL-P0-001` | Main at 1 g is active | `616f65e6` | `mainObjectiveRaisesMain` at all 3 gates |
| `GEL-P0-002` | Crown 0 g → auto 1 g, editable | `4b649796` | `crownOnPlannedGrams` |
| `GEL-P0-003` | Crown OFF preserves user grams | `4b649796` | `crownOffPlannedGrams` |
| `GEL-P0-004` | **Crown trigger renders for a non-Main line** | `1c94d67c` | `MainRoleTrigger` present at both breakpoints |
| `GEL-P0-005` | Crown maximizes — no fabricated ceiling | `989d6f7e` | assert no constant cap on the Main frontier |
| `GEL-P0-006` | Multi-Main % authority | `bb75411` | `verifyMainEnvelope` |
| `GEL-P0-007` | **Professional default batch = 1000 g** | `ee70985c` | `PROFESSIONAL_DEFAULT_BATCH_GRAMS` |
| `GEL-P0-008` | Custom machine batch fully manual | `c456e96e` | `MachineProfileSection` |
| `GEL-P0-009` | BASE_RECIPE = Mapper only, no per-id registry | `fa4b03cc` | assert no per-ID allow-list module exists |
| `GEL-P0-010` | Zero-gram executable invariant | `d3530cc` | `isOmittableUnusedLine` |
| `GEL-P0-011` | Transient crown flag never persists | `4b649796` | `recipePersistPartialize` allow-list |
| `GEL-P0-012` | Direction targets from the recipe's own goals | `40b3755` | `loadRecipeInput` |

`GEL-P0-004` and `GEL-P0-007` are new — they exist *because* of this audit, and neither was covered before.

### D. Retire the design-lock tests as regression guards

`desktopStructureLock`, `finalProWorkbenchDesign`, `mobileProUx`, `responsiveParity` changed 3/8/7/5 times in five days. A test rewritten by every design commit cannot defend anything. Keep them for layout intent, but **move every functional assertion they carry** (control presence, dispatch wiring, parity of actions) into `src/contracts/`.

### E. Linear staging, small commits

The window contained 270 commits in 5 days, peaking at 92 in one day, with `applyPipeline.ts` touched 30 times from 8 workstreams. Enforce: latest staging → focused change → focused tests → staging → served proof. **Ban mixed-purpose commits touching a protected file** — "fix + unify badges" is precisely how `GEL-P0-004` was lost.

### F. Semantic provenance ledger

One append-only `reports/CONTRACT_LEDGER.md`: `BUG ID | contract sentence | fix commit | guard test | protected function | served proof`. §11 of this document is its seed. A future audit then costs one grep per row rather than a five-day archaeology pass.

---

## 13. COVERAGE AND LIMITS OF THIS AUDIT

Stated plainly so nothing here is over-trusted:

- **Verified by direct diff/code reading:** everything in §§1–6, §8, §10, §11, and the CI facts in §9.
- **Sampled, not exhaustive:** §7 examined the largest and highest-risk design/copy commits (`a2ffff6b`, `2b1c49c3`, `a50f2346`, `385043ca`, `fb356b31`, `f08a920f`, `8db8b125`) at hunk level against the protected set. The remaining ~22 smaller design/UI commits were classified by touched paths, not line-by-line. Six parallel forensic agents were dispatched to close that gap and were terminated early by an API session limit; their work did not survive.
- **Not performed:** no test suite was executed, and **no served/browser QA was run against staging** — this audit is static. The Protein refusal in §6 is proven *in code and test*, not observed served.
- **Owner decisions required, not made here:** whether the `7edd90ea` strict-progress refusal is correct science (§6), and whether the `989d6f7e` Crown-semantics evolution supersedes the older exact-hold memory (§4.3).

---

## 14. FINAL STATUS

**GELLATTI REGRESSION PROVENANCE AUDIT — ROOT CAUSE OF REPEATED REGRESSIONS IDENTIFIED.**

The cause is not Design, not Language, not stale bases, and not bad merges. It is **an unguarded staging branch combined with guard tests that the breaking commit is free to rewrite** — inside a five-day, 270-commit integration surge in which the most safety-critical file in the product was edited 30 times by 8 workstreams.

**DO NOT FIX ANYTHING YET** — as instructed, no code was changed by this audit.
