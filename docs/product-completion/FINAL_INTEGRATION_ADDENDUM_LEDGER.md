# FINAL INTEGRATION ADDENDUM — INTEGRATION LEDGER (2026-07-25)

Base: staging `fb2924f` (current-draft wave, accepted as PARTIAL per the owner).
Result: staging **`94db2c0`**, bundle **`index-B7XxFd4b.js`** (content-verified).
Gates: `tsc -b` clean · `eslint .` 0 errors (2 pre-existing warnings) · **5299/5299 tests, 388 files** (base 5222/385 — 77 tests added, none lost) · `npm run build` ✓ · `git diff fb2924f..HEAD -- src/engine/` **empty** (science freeze held).

## Owner items 1–7

| # | Item | State | Evidence |
|---|---|---|---|
| 1 | `fruit_gelato` is not a family | **CLOSED, structurally** | Runtime may only route to categories with NATIVE seeded bands: `NATIVE_BAND_CATEGORIES` is derived from `TARGET_BANDS.filter(status==='seeded')`, so a future seeded cell unlocks itself. Dairy test is composition-based (`lactose_percent > 0 \|\| flags.is_dairy`), never names. Decision table: fruit && !dairy → sorbet; chocolate → chocolate_gelato; else milk_gelato. Enforced at the ONE engine seam (`buildRecipeInput.ts:59`), so a persisted draft, saved version, demo preset or direct `setCategory` cannot smuggle an unseeded cell into `selectTargetBand`. Structural test enumerates 4096 ingredient subsets × every visible type × all 8 categories. Nut and alcohol are flavours too — they no longer route anywhere of their own. |
| 2 | `reference_derived` never applicable | **CLOSED** | `templateRegistry` split into `RUNTIME_REGISTRY` (approved only — the only list the selector scans) and `QUARANTINED_TEMPLATES`. Apply door gains a TRUSTLESS gate (`reference_derived_provenance`) that re-reads status from the registry BY TEMPLATE ID — pinned by a test that forges a preview claiming `templateStatus:'approved'` on the quarantined id and proves the door still refuses. Such previews render diagnostic-only with an honest explanation. |
| 3 | No "best achievable" without global-optimum proof | **CLOSED** | Customer copy → „To najlepszy wynik znaleziony przez obecny solver…" plus the exact stop reason, always appended. QA verdict `AUTHENTIC-BEST-ACHIEVABLE` → `AUTHENTIC-BEST-FOUND`; `bestAchievableProof` → `bestFoundProof`. `all_bands_in_range` keeps its narrow meaning and is never called a global optimum. `ENGINE_AUTHENTICITY_TESTS.{json,csv}` regenerated from the real pipeline. |
| 4 | Rescale ≠ optimisation | **CLOSED** | `classifyPreviewOutcome(before, after)` computed inside `finishPreview`, so EVERY builder emits it; the field is REQUIRED on `ConstraintPreview` (the compiler forced 7 hand-forged fixtures to declare it). Headings: „Przeskalowano partię" / „PI zoptymalizowało recepturę" / both, batch first. A pure rescale cannot produce the optimisation wording by construction (every metric is per-100 g). |
| 5 | 100 % Monitor parity | **CLOSED + a real defect found** | Inventory re-derived from git (redesign `6d612eb`, pre-redesign parent `a55f5fc`), not trusted from the prior report; 25 rows now run as an executable test against a REAL `/pro/recipe` render, with data-connection proved by independent recomputation. **Defect the previous ledger missed:** owner diagnostics were CLIPPED — `truncate` on the `<dd>` (authored for the old full-width column) hid 316 px of the stabilizer sentence (~58 %) in the 38 % Monitor column at 1366×768; the prior suite only asserted `not.toContain('overflow-hidden')`, which `truncate` evades. Fixed presentation-only; clipped elements 2 → 0 at all viewports. **GAP-2 closed by me** (D's ownership excluded the file): `/pro/monitor` showed no Monitor below `lg` — the pinned aside is `display:none` and the sheet started closed; deep-linking now opens the sheet. |
| 6 | Multi-remove, no refresh | **CLOSED — and it found more than the literal flow** | Literal sequence built over the REAL stores: open a SAVED recipe → remove Cream, SMP, Dextrose → edit Sucrose → immediately call the exact entry point the workbar calls. Result: total exactly 1000 g, all three vacated roles refilled under new line ids, zero duplicates; field-by-field vs a simulated refresh is **byte-identical** (`firstDifferingField === null`). The literal flow already worked — but two adjacent branches did not: `markIngredientUnavailable` wrote an **unpersisted** exclusions field (so "an unavailable ingredient never returns" held only until F5), and a §17 padlock persisted only its recipe half (so a reloaded draft stayed engine-frozen with no padlock to show). Both fields now persist; live and refreshed sessions formulate from identical input. |
| 7 | No COMPLETE until owner-visible staging is verified | **HONOURED** | This report does not claim COMPLETE. |

## Consequences the owner must know (not defects — the price of real science)

1. **A dairy fruit gelato FROM ZERO can no longer be formulated.** Items 1+2 together remove the only source of a fruit dose for a dairy gelato (`fruit_gelato_ref_v1`, grams transcribed verbatim from a QA fixture). With an amount typed, it formulates normally on native bands. From zero, PI stops honestly and names the ingredient: *„…nie zawiera tej roli — PI nie wymyśla dawki składnika smakowego. Wpisz ilość…"*. This preserves the zero-gram guarantee in its strongest form (never SILENTLY 0 g) without inventing science. **One-line restore if the owner approves a fruit dose:** add `T('fruit', <approved grams>, null)` to `milk_base_v1`/`G17`/`G18`.
2. **Five cases flip `hardSafe` true → false** (T7, T8, T9, T15, T16). Identical numbers; their residual violations are now classified HARD (native) instead of SOFT (provisional), so the frozen diagnostic-only door makes those previews inspectable but not applicable. This is the intended consequence of scoring fruit gelato on real approved science. That door was not modified.
3. **15 of 19 QA cases stop being provisional**; AUTHENTIC-OPTIMAL rises 4 → 14. Band VALUES are unchanged (the fallback WAS the milk_gelato band) — the shifts come from the seed becoming the approved `milk_base_v1`.
4. `nut_gelato` / `alcohol_gelato` now score on milk_gelato science by explicit routing rather than silent fallback. Seeding those cells in `targets.ts` would make them selectable automatically.
5. §20 undo history stays session-scoped: after F5 the applied DRAFT survives byte-for-byte, but „Cofnij" is not offered (a rehydrated snapshot's `baseDraftRevision` belongs to a dead session). Named rather than hidden; the durable equivalent is save→version.

## Integration incidents (recorded, both caught by verification not by report)

* Concurrent worktree agents moved the shared checkout's HEAD onto the empty leftover branch `agent-a/canonical-families-honesty`; all three merges landed there and my first `push nightly/integration:staging` reported "Everything up-to-date" while shipping nothing. Detected by comparing local HEAD to `origin/staging`, repaired by fast-forwarding `nightly/integration` (ancestry verified first).
* Agent A's in-flight edits were stranded uncommitted in the shared checkout and blocked its merge. Verified comment-only difference vs the committed branch version (code-identical) before discarding.

## Owner-visible checks (staging `94db2c0`, /pro/recipe, 1000 g, −11 °C)

A. Gelato + Milk + fruit **with 350 g typed** → „Przelicz z PI": real Preview, source names an APPROVED template (`milk_base_v1`), never `fruit_gelato_ref_v1`, no pink reference note, no „prowizoryczne/fallback" wording.
B. Same draft, fruit left at **0 g** → no Preview; the message names YOUR ingredient and asks for an amount. It must never quietly return a plain milk base.
C. Gelato with **only fruit, no dairy** → sorbet science (S01; water/sucrose/dextrose/inulin/tara; NO dairy). Add Milk at 0 g → route flips to the milk family immediately, no save, no refresh.
D. Gelato + Milk + Whiskey (or pistachio paste) with real grams → normal result, no provisional wording.
E. Complete in-band 1000 g gelato, change one line to ≈955 g → „Przelicz z PI": heading must read **„Przeskalowano partię"**, not the optimisation wording.
F. Open a saved recipe → remove Cream, SMP, Dextrose → immediately „Przelicz z PI" (no refresh) → works; then F5 and repeat → identical.
G. Mark an ingredient unavailable → F5 → it is still excluded. Lock a line → F5 → the padlock is still there.
H. `/pro/monitor` on a phone → the Monitor sheet is open on arrival.
I. Monitor: open it and confirm the owner-diagnostics sentence wraps in full (no „…" cut).
