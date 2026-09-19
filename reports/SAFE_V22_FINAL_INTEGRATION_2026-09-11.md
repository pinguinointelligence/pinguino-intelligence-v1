# SAFE v2.2 — FINAL INTEGRATION, 2026-09-11

Owner instruction: integrate the already-accepted SAFE v2.2 work into CURRENT `origin/staging`.
No redesign, no reopened decisions, nothing unrelated mixed in. This is a reconciliation, and the
parked branch was **not** merged wholesale.

| | |
| --- | --- |
| Parked source | `claude/gellatti-v22-safe` @ `c55233e4` (10 commits on `b3baf256`) |
| Integration branch | `claude/safe-v22-integration` — worktree `~/Developer/pinguino-safe-v22-integration` |
| Staging when integration began | `2774715a` (21 commits past the SAFE base) |
| Staging base of the final branch | `600adc72` — staging moved four times during the work (#260, #261, #263, #268). Only #268 touched a file SAFE also touches — the HOME ledger, on a different row (H-50-1); merged cleanly and verified row by row |
| Method | classify every parked commit A–E → `cherry-pick -x` the A commits → reconcile the one overlap → rebase onto current staging. Integration SHAs change on every rebase, so commits are identified here by their parked SHA and subject; each integrated commit carries a `(cherry picked from commit …)` line |

## 1. Classification of every parked commit

| Parked | Content | Class | Integrated |
| --- | --- | --- | --- |
| `71f85278` | composer, §41 focus fix, §28 CTA gate, §30/§31 AI fruit UI | **A** still needed | ✓ |
| `4baffd53` | §19 inline save in Produkcja, §21 `Chcesz powtórzyć?` / `POWTÓRZ` | **A** | ✓ |
| `358708dd` | §23 image authority + four branded profile assets | **A** | ✓ |
| `b8055814` | §36 rectangular only, §38 expiry at print, §40 label history search | **A** | ✓ |
| `af4d6162` | §29 first-run tutorial | **A**, with one **D** reconciled (below) | ✓ |
| `4b045865` | §32 fruit camera drives the ONE canonical `CameraSession` | **A** | ✓ |
| `4c16c0fe` | session report | **A** (evidence) | ✓ |
| `c55233e4` | session report, sealed at the owner gate | **A** (evidence) | ✓ |
| `6df97715` | §25 `WAITING_FOR_PHOTO` migration + model + 24 tests | **E — WAITING OWNER DB APPROVAL** | **not integrated** |
| `4f7a2740` | §25 comment fix | **E** | **not integrated** |

Added during integration:

| Commit (subject) | Content | Authority |
| --- | --- | --- |
| feat(pro): the first production start says ROBIMY | §21 first production start → `ROBIMY`, starting → `Zaczynamy…` | owner decision, approved for integration 2026-09-11 |
| Checklist: record SAFE v2.2's HOME work… | HOME ledger: H-17-2, H-18-3, H-19-1, H-21-1 carry the SAFE evidence | CI "HOME ledger update gate" |
| fix(tutorial): start itself only where a real step exists… | defect §3.4, found by the full suite during integration | my own SAFE code |

**B — already present on staging: none.** Every SAFE marker was searched for on staging before
anything was applied (`home-composer`, `HomeVisionCapture`, `TutorialOverlay`, `labelHistorySearch`,
`recipeImageAuthority`, `production-save-recipe-inline`, `POWTÓRZ`, `ROBIMY`, `Gotowy? Robimy`,
`home-composer-field`): zero hits. „Historia etykiet" existed only as the navigation `aria-label` the
SAFE change builds on; „Zaczynamy" exists in three unrelated places.

**C — superseded by newer staging: none.** The staging changes SAFE code *depends on* were read, not
assumed:

| Staging change | What SAFE relies on | Verdict |
| --- | --- | --- |
| `ProWorkbar.tsx` (#259, +67: a layout effect) | §19 mounts it unchanged | still byte-identical in both mounts — test passes |
| `cameraSession.ts` (#264, private `promoteResolution`) | `isSupported` / `open` / `stop` | public API unchanged |
| `productScanner.ts` (#244) | `identifyLiveFrame`, `LiveIdentifyResponse` | untouched |
| `useProductionWorkspace.ts` (#256, run isolation) | `saved_version_required` | still exists (union + builder) |
| `theme-pro-light.css` (#259, scroll + touch rules) | the shell focus authority §41 exempts | untouched — the §41 contract test passes |

**D — conflict reconciled: `src/features/shell/AppNavDrawer.tsx`.** Staging #259 replaced the drawer's
`body.style.overflow` lock with the shared `lockBodyScroll()`; SAFE adds the „Uruchom samouczek
ponownie" entry. Different hunks, clean three-way merge — and then **inspected**, because a
conflict-free merge has deleted the global header in this repo before: exactly one `lockBodyScroll`
import, the lock and its release intact, exactly one restart entry.

**E — not integrated, WAITING OWNER DB APPROVAL.** `20260910060000_community_waiting_for_photo.sql`
with its model (`publicationDraft.ts`) and 24 tests. Held out entirely rather than merged unapplied:
a migration file on canonical staging is one `supabase db push` away from the database that staging
shares with production. Preserved on the parked branch at `4f7a2740` (local). **This integration adds
0 migrations and applies none.**

## 2. §21 — production CTA copy

| | Before | After |
| --- | --- | --- |
| first start | `Rozpocznij partię` | **`ROBIMY`** |
| while starting | `Rozpoczynamy partię…` | **`Zaczynamy…`** |
| gates | „Najpierw potwierdź odgazowanie" / „…informację" | unchanged, still outrank the CTA |
| after a finished run | `Chcesz powtórzyć?` + `POWTÓRZ` | unchanged |
| HOME | `letsMakeIt: 'Zróbmy to'` | **untouched** — HOME and PRO may differ |

Copy only; `ProductionCockpit.tsx` logic untouched. The optional helper line „Gotowy? Robimy!" was
**not** added: directly above a button that already says ROBIMY it repeats it, and it would add a
line to the frozen PRO production card. Available on request.

Tests moved with the copy: `productionWorkspaceUi.test.tsx`, `customerCopyGuard.test.ts`,
`productionRepeatCta.test.tsx` — the last now asserts the button's EXACT text in three states
(`ROBIMY`, `Zaczynamy…`, each gate) and that the first run never shows `POWTÓRZ`.

## 3. What went wrong during integration, and what it turned out to be

1. **My own new §21 test** omitted `carbonatedProducts` / `acknowledgeDegassing` from its fixture, so
   `DegassingCard` threw. Fixture completed and folded into the §21 commit. Not a product defect.
2. **`studioBoundary › never duplicates engine math`** timed out (6259 ms > 5000 ms) with the machine
   at load 25 — three `tsc -b` from other sessions plus two suites. Passes in isolation on clean
   staging and on this branch. Load, not a violation.
3. **`LabelWorkspace.runtime › EU opens one non-blocking missing-data dialog…`** failed twice at load
   ~25: the run-label snapshot was read before its asynchronous save landed. It passes alone, and
   passed 2/2 full-file runs on **both** clean staging and this branch at load ~14. A load-sensitive
   async assertion that predates SAFE; the test was not modified.

4. **A real defect in my own SAFE tutorial, found by the full suite on the rebased branch.**
   `ProductionHistoryTruth.runtime` (3 cases) and `RecipesHubPage.executable` (1 case) failed with
   `TypeError: el?.scrollIntoView is not a function` at `TutorialOverlay.tsx`. Two causes, both mine:
   - `scrollIntoView` was called unguarded; jsdom (and some embedded webviews) do not have it.
   - **The product defect underneath:** the „HOME i PRO" opener is `anchorOptional`, so every page
     in the application always had at least one available step. A first-time visitor would get a
     tutorial on the Shop, a shared recipe, Production history — and one click of „Dalej" or
     „Pomiń" there would mark it seen, so the real HOME tutorial would never appear. The same
     auto-start was firing inside unrelated page tests whenever they ran past 400 ms.
   Fixed: the tutorial starts itself only where at least one REAL anchored step is on screen (in
   practice HOME), the menu restart still works everywhere, and `scrollIntoView` is guarded. Four
   new cases pin it. The 2026-09-10 report's claim that the tutorial "stays inert where its anchors
   do not exist" was **not true** until this fix.

Items 2 and 3 were classified by running the same test on a detached clean-staging probe, not by
argument. Item 4 was not load: it is a code path, and it is now closed.

## 4. Gates on the rebased branch

| Gate | Result |
| --- | --- |
| `git diff --check` | OK |
| owner-locked guard | OK — no accepted contract modified |
| protected-path guard | OK — no protected functional path touched |
| HOME ledger gate | PASS — 6 HOME files changed, 4 requirement rows moved |
| focused SAFE + §21 tests | 18 files / **177 passed** |
| after the tutorial fix | tutorial + shell + home-creator + pages/home + both crashing page tests: 56 files / **621 passed** |
| `npm run verify:staging` | **exit 0** on the previous rebase (`6f831194` + 10) — owner-locked OK · protected-paths OK · `test:contracts` 22 files / 215 passed · typecheck clean · lint 0 errors (8 pre-existing warnings, none in a SAFE file) · build OK. Re-run on the final tree: in the PR |
| full suite | run on the FINAL rebased branch after this report was committed; the result is recorded in the PR description, not here. The run before the last rebase surfaced defect §3.4 (fixed) plus three load timeouts (§3.2–3.3 pattern) |
| CI on the PR | reported in the PR |

Unit and jsdom runtime tests only — none of this is E2E, and none of it is called E2E.

## 5. Not verified, and by whom it still must be

- PRO inline save (§19), Labels (§36/§38/§40) and Share (§23): **never viewed rendered** → WAITING OWNER QA.
- AI fruit recognition: UI + canonical `CameraSession` verified; the recognition round-trip has not run on a real device.
- §25: the migration has never been executed anywhere.
