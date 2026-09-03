# PRO follow-up — Versions „Wróć", Crown-OFF auto-correction, Gellatti dialog system

**Date:** 2026-09-03 · **Branch:** `claude/pro-versions-crown-dialogs` · **PR:** #144 → `staging`
**Status:** READY FOR OWNER CHECK. Not FINAL, not FROZEN.

---

## 1. Versions page — contextual „Wróć"

### What was wrong

`••• → Wersje` linked with a raw `<a href="/pro/versions">`. That is a **full document
load**: the SPA restarts, the in-memory draft is discarded, and the user lands on a page
with no way back. The missing back button was the visible half; the destroyed context was
the other half.

### What it does now

- Both `•••` menus link with react-router `Link`, so the navigation stays in-app. The
  draft, the recipe identity, the linked version and the selected module all survive.
- The link carries an explicit `?from=<section>` naming the workbench section it was
  opened from (`recipe` / `monitor` / `production`).
- The Versions page renders `← Wróć` **only** for a valid workbench origin, returning to
  that exact section.
- Reached from the global hamburger there is **no** origin and **no** control.
- A hand-edited `?from=` value that is not a real workbench section is discarded, so a
  forged URL cannot produce a back control that leads nowhere.

The origin is canonical and **refresh-safe** — it lives in the URL, not in session state.
No `history.back()` guessing, per the owner's instruction.

Contract: [`src/pages/pro/workbenchOrigin.ts`](../src/pages/pro/workbenchOrigin.ts).

### Served evidence

Local dev server on the same tree, PRO persona, 1440×900:

| Step | Result |
|---|---|
| `/pro/versions?from=recipe` | `← Wróć` present, `href="/pro/recipe"` |
| Click `← Wróć` | lands on `/pro/recipe`, workbench rendered, **draft intact** (MILK 670 / CREAM 130 / SMP 35 / SUCROSE 130 / DEXTROSE 30 / TARA 5 = 1000 g), back control gone |
| `••• → Wersje` link on `/pro/recipe` | `href="/pro/versions?from=recipe"` |
| `/pro/versions` (no origin) | no back control |
| `/pro/versions?from=nowhere` | no back control |

---

## 2. Crown OFF — a manual Main above the maximum

### The measured defect (deterministic offline reproduction, before the fix)

WATERMELON · milk gelato · 1000 g batch · OPTIMAL, driven with staging's published
`main-fruit-fresh-dairy` numbers (floor 20 % / target 35 % / **hard limit 45 %**).

Crown ON returns a **certified** maximum of **450 g = 45.00 %**
(`status: maximized`, `limitingTechnicalRules: ["main_policy_ceiling"]`).

Crown OFF, typing an amount and pressing Przelicz:

| typed | got | share | verdict |
|---:|---:|---:|---|
| 600 | **571 g** | **57.10 %** | 12.1 pts over the hard limit |
| 520 | 511 g | 51.10 % | over |
| 500 | 507 g | 50.70 % | over |
| 460 | 460 g | 46.00 % | over |
| 400 | 400 g | 40.00 % | ok |
| 300 | 298 g | 29.80 % | safe request not honoured |

Two separate faults:

1. **A safety hole.** `verifyMainEnvelope` called that same 571 g vector
   `main_above_hard_limit` — the product shipped a Preview its own authority refuses, with
   a clean score. Cause: the entire Main envelope is evaluated *inside* the Crown frontier,
   and Crown OFF never enters it. This is the gap recorded in
   `CROWN_OFF_MAIN_SAFETY_GAP_2026-08-31.md`: the unit-level fix landed in
   `verifyMainEnvelope`, but the preview pipeline never called it for uncrowned lines.
2. **A UX fault.** Even the wrong answer arrived as a Preview/Apply round trip with a
   change list, for a result that was not in dispute.

A **locked** uncrowned line was worse still: 600 g / **60.00 %** accepted outright, while
the *crowned* locked lane correctly refused with `nearestFeasibleGrams: 450`. A lock was
therefore a one-click bypass of the very limit the crowned lane enforced.

### The fix — the existing authority, not a second search

"Highest safe amount at or below X" is the **existing Crown maximisation objective with its
ceiling moved down to X**. So nothing new searches:

1. The requested line is crowned in a **probe** input.
2. The probe goes to the unchanged `maximizeMainTechnicalObjective` with a new
   `mainSearchCeilingGrams` — an input that can only ever *narrow* the frontier.
3. The answer is transplanted back onto the uncrowned draft.

Every candidate is still accepted only by the unchanged Engine, `verifyMainEnvelope`,
practicalization, locks, ProductBehavior and the batch invariant. Two owner requirements
therefore hold **by construction** rather than by agreement:

- with an unchanged draft the recovered ceiling **agrees with Crown MAX SAFE** (same
  authority, same bounds, cap simply not binding);
- a request that is already safe is returned **byte-exact** (the descending sweep accepts
  its first probe).

A capped run has proven only "X is admissible", never "X is the maximum", so it is never
labelled a certified maximum — the same defect GEL-P0-027 removed when a failed sweep
relabelled its own input as the accepted frontier.

### After the fix

| typed | got | share | envelope | notice |
|---:|---:|---:|---|---|
| 451 / 460 / 500 / 520 / 600 / 900 | **450 g** | 45.00 % | OK | shown |
| 250 / 300 / 400 | preserved exactly | — | OK | none |
| 100 (10 %, under the 20 % floor) | untouched | — | OK | none |

Below the published floor the product is a **garnish** and the Main policy deliberately
stays out — the same engagement threshold the approved capability-scoped band uses. Nothing
crowns such a line, so no `main_below_floor` refusal is manufactured.

Each run costs 7–37 ms: it is the existing certified authority, not a new sweep.

### Locked stays a hard requirement

A locked amount is **never** silently rewritten. It keeps the typed
`impossible_under_constraints` refusal and now names the safe maximum
(`nearestFeasibleGrams: 450`) in the uncrowned lane too.

That backstop is a **post-check on the finished proposal**, not a pre-flight. A pre-flight
was tried first and was wrong: it fired on any over-batch lock and pre-empted better
answers the existing machinery already gives — a 501 g SKIMMED MILK lock in a 206 g batch
is answered far better by the existing suggested-fix path ("reduce to 7 g") than by a
Main-policy refusal. Checking the **output** means it can only ever reject a proposal that
the product's own authority rejects, and it is scoped to Crown-OFF drafts, so the frozen
Crown-ON behaviour (GEL-P0-027) is untouched.

### Atomic from the user's point of view

Przelicz → capped frontier → canonical correction → rebalance → **commit through the same
Apply door in the same click** → one informational notice. Nothing is committed that a
manual `Zastosuj` would not have committed; every trust check still runs. If the door
refuses, the existing blocked/preview surface stays exactly as it is.

---

## 3 & 4. One Gellatti dialog language

`GellattiNotice` composes the **existing** `DialogShell` — escape, focus trap, focus
restore, body scroll lock and the portal are already solved there and were not
re-implemented — and adds only the notice layout: white surface, centered headline and
short body, rounded acknowledgement, graphite text, and a warm orange **outline + glow**
for genuine attention (never a tinted fill, and never on every notice).

The recalculation overlay's graphite `#191a1d` diagnostic shell is retired. Both of its
states now share the light token set; because the children are written against
`--color-ivory` / `--color-shell`, re-pointing those two variables carries every nested
control across with its contrast relationships intact — `text-ivory/80` becomes graphite at
80 % on white, `bg-ivory`/`text-shell` stays a solid dark button with a light label. **No
child markup, wording or affordance changed.**

Covered by that single change, since they all live in this overlay:

- the simple technical refusal (TIMEOUT / ERROR / `BLOCKED_WITH_EXACT_ACTION`),
- the settings-confirmation notice,
- the „no changes needed" / applied + Cofnij states,
- `BlockedApplyNotice`, `RecalcDiagnosisView`, the Direction decisions and the preview card
  (structured content keeps its functional alignment, as the owner allowed).

**Served evidence:** the `SETTINGS_CONFIRMATION_REQUIRED` dialog ("Jeszcze jeden krok…"),
previously a graphite box, now renders as a white Gellatti surface with legible graphite
text and buttons.

### Notice copy

```
Maksymalna ilość została osiągnięta

Dla tej receptury maksymalna bezpieczna ilość WATERMELON to 450 g.
Ustawiliśmy tę wartość automatycznie.

[ OK ]
```

The name is printed without its Mapper qualifier (`WATERMELON`, not
`WATERMELON · Fresh Fruit`) and the grams are dynamic. Pinned by test: changing the recipe
changes the sentence; no number is fixed.

---

## 5. Tests

| File | Covers |
|---|---|
| `constraint-studio/crownOffManualMainTarget.test.ts` | Owner matrix A–G + the exact 571 g / 57.10 % regression + published-policy coverage for all four profiles |
| `pro-core/crownOffCorrectionNotice.test.tsx` | Dynamic copy, no technical noise, exactly one action, white/centered/orange contract, acknowledgement clears it, renders after the overlay closes |
| `pages/pro/workbenchOrigin.test.ts` | The origin contract, refresh-safety, forged values, global entry carries no origin |
| `pages/pro/ProWorkspacePage.test.tsx` | `← Wróć` present for all three origins, absent for the global entry and for a forged one |
| `pro-core/ProWorkbar.test.tsx` | The `••• → Wersje` link carries the right origin in both variants and all three sections, and is never a raw document link |

### Owner matrix

| Case | Result |
|---|---|
| **A** Crown OFF, unlocked request > max | → highest feasible ≤ request, informational modal, OK, no second Apply ✅ |
| **B** safe request below max | preserved exactly ✅ (previously drifted 600→571, 500→498, 300→298) |
| **C** locked request > safe max | NOT overwritten; typed refusal naming the safe maximum ✅ (crowned **and** uncrowned) |
| **D** Crown ON after correction | still returns the canonical MAX SAFE ✅ |
| **E** save / reopen | corrected grams are ordinary applied grams; **not exercised served** — see gaps |
| **F** HOME ↔ PRO roundtrip | **not exercised** — see gaps |
| **G** Multi-Main | batch invariant, whole grams, no positive line deleted, Main stays positive ✅ |

### Profile coverage — stated limit

The Crown/Main code carries **no product-category branch**; profiles differ only through
published policy data. The matrix drives the correction with all four profiles' real
published ceilings (Gelato 45 / Sorbet 60 / Vegan 74.7 / Protein 49.5) and proves the cap
follows the **data**. Engine bodies still differ per category, so this is **policy
coverage, not a substitute for served Sorbet / Vegan / Protein runs.**

### Fixture correction

The Watermelon envelope in `mainTechnicalMaximum.test.ts` is now category-aware. Handing a
**sorbet** recipe the dairy-gelato ceiling made the fixture claim a 60 % Main was over its
hard limit; staging publishes 60/60/60 for sorbet fruit. That test is now a genuine
sorbet-policy test.

---

## 6. Verification

- `npm run build` (`tsc -b && vite build`) passes.
- prettier + eslint clean on the changed files only (no directory-wide reformat).
- Targeted suites: **1850 passed** across `pro-core`, `constraint-studio`,
  `product-intelligence`, `pages/pro`, and **all 179 owner-locked contracts**.

---

## 7. Gaps and blockers — stated plainly

1. **No end-to-end served run of the Crown-OFF correction.** The correction is proven
   offline against staging's own published policy data, and the notice is proven at
   runtime, but the full click-path was not exercised on a live authenticated PRO session.
   Two blockers, both environmental:
   - Vercel **preview** deployments of `pinguino-staging` have no auth env — the sign-in
     modal never opens on the preview URL.
   - There is **no `.env`** in any local worktree, so the local dev server runs on the
     local-dev seam and cannot resolve real ProductBehavior snapshots (anon
     ProductBehavior is blocked by design).
   The remaining step needs `staging.pinguinoai.com`, which only updates on merge.
   **Cases E and F are open for the same reason.**
2. **The auto-apply link is not covered end-to-end by a test.** Its two observable halves
   are (the corrected vector in the pipeline matrix; the single-action notice in the
   runtime test), but "the commit happened without a second click" rests on the code path
   and types, not on an executed test. Driving
   `createOptimizePreviewWithServerAuthority` with a Main-capable fixture needs the heavy
   server-authority harness.
3. **The stabilizer-limit dialog is not migrated.** On `staging` it is an inline
   `WorkflowNotice`, not a dialog; the dialog is introduced by **#136** on a parallel
   branch. When #136 lands, its dialog should adopt `GellattiNotice` rather than carrying
   its own shell. Migrating it here would duplicate and conflict with that work.
4. **Local-only test artefact, proven pre-existing.**
   `ProWorkspacePage.libraryHandoff.test.tsx` fails locally with
   `Denied ID …/@fontsource/…` because this worktree's `node_modules` is a symlink outside
   Vite's `fs.allow`. Identical on the base commit; unrelated to this change.
5. **No test CI runs on PRs** in this repository, so the suite evidence above is local.

---

## 8. Not marked FINAL or FROZEN

Per the owner's instruction.
