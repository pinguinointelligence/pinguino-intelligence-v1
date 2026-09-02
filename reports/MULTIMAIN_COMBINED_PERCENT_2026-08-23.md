# PINGÜINO v1.4 — Multi-Main combined-percentage / equivalent-grams investigation

**Date:** 2026-08-23 · **Scope:** staging only · **Production `main` 4dfb097 untouched.**

| | |
|---|---|
| Starting `origin/staging` | `e02de60` |
| My commit | `bb75411` (verified ancestor of `origin/staging`) |
| Branch | `claude/multimain-percentage-authority` |

> **Read this first.** The headline finding is that there was **no arithmetic bug to fix**. The
> canonical authority was already correct and already single. What was broken was *which state* the
> served message described. That is fixed. A large part of this task's spec (§8–§10, §13, §16–§20,
> §22, §24–§25, most of §28) is **not** delivered — §30 below is explicit about it.

---

## 1–4. The three contradictory verdicts, reproduced and explained

`verifyMainEnvelope` (`features/product-intelligence/mainEnvelope.ts`) is already the one authority
for equivalent grams, combined percentage and the min/max verdict. Fed the owner's exact inputs it
is deterministic and correct:

| input | equivalent grams | combined % | verdict |
|---|---|---|---|
| 80 g + 80 g / target 1000 g | 160 | **16 %** | **LEGAL** (floor 10, combined limit 20.7) |
| 100 g + 100 g / target 1000 g | 200 | **20 %** | **LEGAL** |
| 80 g + 80 g, draft summed to **1092 g**, target 1000 g | 160 | **16 %** | **LEGAL** — byte-identical to the row above |

The third row matters: the owner's draft was off its target batch, and that does **not** move the
answer, because the denominator is `target_batch_grams` and never the drifting draft sum.

So where did „0.2 %" and „>20.7 %" come from? Reproducing them required different grams entirely:

| grams | combined % | message |
|---|---|---|
| **1 g + 1 g** | 0.2 % | „Grupa Main ma **0.2%**; wymagane minimum to 10.0%." |
| 104 g + 104 g | 20.8 % | „Grupa Main przekracza twardy limit 20.7%." |
| 103 g + 104 g | 20.7 % | legal — exactly at the limit |

**Root cause.** `bindProductBehaviorToPreview` (`applyPipeline.ts:7194`) evaluates
`result.preview.proposedInput` — *the candidate the solver built* — and surfaced that candidate's
violation text unqualified, as if it described the recipe on screen. Every sentence was true about
some candidate and false about the owner's draft. That is why they contradicted each other **and**
the grams visible in the editor.

Confirming the other half: run through `buildOptimizePreview`, the 80 + 80 state produces a proposal
whose Mains are still `strawberry 80 / banana 80`, sum 1000, envelope `ok, 16 %`. The solver holds
Main correctly; only the reporting was mis-attributed.

## 5–6. Duplicate paths, units, denominator

**No duplicate implementation was found.** Both consumers call the same function:

- `applyPipeline.ts:3401` (Apply door) — maps violation **codes**, never surfaces text;
- `recipeConstraintAuthority.ts:249` — propagates `messagePl`, and is what reaches the user.

Unit contract, now pinned by test:

```
equivalent_grams   = Σ(planned_grams × mainEquivalentFactor)      // factor is dimensionless
equivalentPercent  = equivalent_grams / target_batch_grams × 100  // a PERCENT, 0…100
```

The ×100 happens **exactly once**, inside the authority; no consumer multiplies again. The
denominator is **always** `target_batch_grams` — never the current draft sum, never a hard-coded
1000. `multiMainCombinedPercent.test.ts` asserts all of it, including that halving the target
doubles the share (160/500 = 32 % → correctly refused).

## The fix

The verdict still blocks — a proposal that violates the envelope must not be appliable — but it now
says whose numbers it is quoting:

> „Propozycja PI została odrzucona: w proponowanej recepturze grupa Main ma 0.2%; wymagane minimum
> to 10.0%. **Twoja receptura nie została zmieniona.**"

## 7. Regression added

`src/features/product-intelligence/multiMainCombinedPercent.test.ts` — 17 cases: both exact reported
inputs, drift-independence, the 1 g + 1 g reproduction of „0.2 %", the unit and denominator
contract, order independence, the §21 attribution copy, and §15 boundaries classified on the exact
fraction rather than rounded UI text — 9.9 / 10.0 / 10.1 / 20.6 / 20.7 / 20.8 %.

## 8. Served findings

Deployment for `bb75411`: `dpl_4BkVt6KkPDwr6C7PZDX7U4fQjyRK` READY.

**Sorbet second Main is no longer disabled.** The §11 symptom does **not** reproduce on current
staging: with STRAWBERRIES set as Main, LIME stayed `disabled: false` and could be set as Main too.

**Sorbet Multi-Main 1:1 — positive Apply.** `main-sorbet-exact-fruit-60-v1` is an *exact-point*
policy (floor = ceiling = hard = combined limit = **60 %**), so 300 g + 300 g of a 1000 g batch is
exactly on it:

- Recalc → truthful **NEAREST** consent („Nie mogę osiągnąć dokładnie wybranego celu… 8/10"),
  which is the §16 requirement, not a refusal;
- accepted → Preview: „Główne: **2**", both Mains **BEZ ZMIAN** at 300 g, out-of-band **1 → 0**,
  sum 1000 = target;
- **Apply succeeded**: ratio exactly **1.0**, sum 1000, **zero 0 g rows**.

**Sorbet Multi-Main 2:1 (400 + 200, still 60 %)** — the envelope passes and both Mains are held, but
the Engine finds no safe formulation with lime at that split („nie znalazło bezpiecznej korekty w
zatwierdzonych zakresach"). A truthful refusal on formulation grounds, not a Main-percentage
problem — but §13 asks for a positive Apply, so **2:1 is not closed**.

**Version selector regression (§23)** — green served: WERSJA present, `QA Protein v2 -12C` defaults
to v4 with „Aktualna", full history v4 → v3 → v2 → v1 newest-first with correct dates.

## 9. Validation

| check | result |
|---|---|
| Full suite | **619 files / 7754 PASS** (1 file / 100 tests skipped — pre-existing, parallel work) |
| Typecheck | clean |
| Lint | **0 errors** (4 pre-existing `react-refresh` warnings) |
| Clean build | exit 0 |
| `production-rescue:bundle-check` | verified (regenerated — `applyPipeline` is in the closure) |
| `git diff --check` | clean |

Also fixed a pre-existing `prefer-const` lint **error** in `internetRecipeMatrix.report.test.ts`
(landed by the parallel Protein work, not mine, but the gate requires zero).

## 10. NOT delivered — read this before accepting

The task's success line requires far more than this session covered. Explicitly **not** done:

- **§8–§10 Protein Multi-Main positive Apply (1:1 and 2:1), local and served.** Not achieved. The
  Protein fruit-combination envelope caps the pair at 20.7 %, and every combination tried in the
  −12 base broke NPAC/POD/fat. §8 asks for a *searched* feasible fixture; that search was not run.
- **§13 Sorbet 2:1 positive Apply.** Refused on formulation grounds, as above.
- **§16 Multi-Main + Direction**, **§17 + Rescue**, **§18 + locks**, **§19 P1-B regression**,
  **§20 zero-gram across every path**, **§24 Save/reopen/versions for Multi-Main**,
  **§25 local/served parity** — none of these were run for Multi-Main.
- **§28 served matrix** — only the Sorbet 1:1 Apply and the version-selector regression above.
- The served bundle could not be read back to confirm the fix string: Vercel's bot protection
  returns a challenge page to programmatic fetches, **including same-origin ones from the page**.
  The fix is proven present in `origin/staging` by ancestry (`bb75411`) and by its passing
  regression, not by reading the deployed JS.

The single most useful thing an owner can take from this session is the root cause: **the numbers
were never wrong, the subject of the sentence was.**
