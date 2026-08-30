# GELLATTI — autonomous acceptance, final ledger

Staging `a0c4694f` · `origin/main` untouched at `4dfb097d` · production Supabase
never touched · Stripe TEST only · 2026-08-30.

This is the close-out of the full-application acceptance run, including the two
protected-core defects that were re-opened as their own dedicated tasks and
closed.

---

## 1. What changed since the first close-out

| | Was | Now |
|---|---|---|
| **PC-06** — saved Sorbet → Production | BLOCKED, closed loop | **CLOSED**, served, two batches completed |
| **PC-07** — saved Vegan/Protein stalled on product verification | discovered mid-run | **CLOSED**, served, two batches completed |
| **Production, all four profiles from a saved recipe** | 3 of 4 | **4 of 4** |
| **EU label print pipeline** | never proven | **proven**, real 512 762-byte PDF |
| **Scanner refusal path** | never exercised | **verified**, nothing invented, nothing written |

### PC-06 — a saved recipe always has a legal path to Production

Two authorities disagreed. `productionRecipeLifecycleState` returned
`TECHNICALLY_STALE` whenever `practicalRecipeAuditMatchesInput` was false and
prescribed exactly one cure — recalculate. `buildOptimizePreview` had no
applicable change to make, so Apply never ran, so the audit was never attached,
so the gate never opened; Save was disabled because nothing had changed.

The audit is written **at Apply time**, so any version saved in a session that
did not Apply carries none — **361 of 722** saved versions on staging, and
**164 of 440** recipes had an auditless *latest* version, which is the number
that decides who actually hits the loop.

Fix, in `productionReadinessState.ts` only: an immutable saved version,
reopened and unedited, is its own executable evidence when every planned gram is
whole. Still stale: a pending recalculation, an unused 0 g row, any edit, an
unsaved draft, and **any fractional gram**.

Served: `LOT-20260830-0624A2A275` (−12 °C, 10/10) and `LOT-20260830-ADA64E65AC`
(−13 °C, 10/10). `md5(recipe_input)` identical before and after both batches —
the fix changes what the app *concludes* about a saved version, not the version.

### PC-07 — a stale-product refusal now carries its own cure

Three surfaces, no exit. The server refused with
`behavior_snapshot_missing_or_unresolved:…:refresh_product_data`; the cure for
exactly that reason already existed (`refreshCurrentRecipeBehaviorWorkingCopy`,
offered as *„Utwórz nową wersję z aktualnymi danymi produktów"*) but lived
behind Przelicz, which a saved recipe with a current score never shows; Save was
disabled because nothing had changed.

Fix, surfacing only: the PRODUCTION gate now carries whether the refusal is
refreshable — decided by the refresh authority's **own** predicate, not a
restatement — and offers the refresh in its place. A refusal naming missing
product science keeps its product-data actions, and a transport failure never
offers a refresh that cannot help.

Served: `LOT-20260830-60DCC5F047` (Vegan, 10/10) and `LOT-20260830-D0469F7926`
(Protein, 10/10), each through an unbroken chain where every step offered
exactly one obvious next action. The historical v1 was never rewritten.

---

## 2. Production — every profile, from a saved recipe

| Profile | Fixture | Batch | Score |
|---|---|---|---|
| Gelato | QA Gelato Wanilia -11 v1 | `LOT-20260829-228836054F` | 10 |
| Sorbet −12 | QA Sorbet Truskawka -12 v1 | `LOT-20260830-0624A2A275` | 10 |
| Sorbet −13 | QA Sorbet Truskawka -13 v1 | `LOT-20260830-ADA64E65AC` | 10 |
| Vegan | QA Vegan Kokos -12 v3 | `LOT-20260830-60DCC5F047` | 10 |
| Protein | QA Protein Kakao -12 v2 | `LOT-20260830-D0469F7926` | 10 |

## 3. EU label — pipeline proven

Blocker 2 was a data gap, not a code gap. The workspace already owns the
designed route: the operator supplies the final saturated-fat value with its
confirmation source, flipping `saturatedFatAuthority` from `missing` to
`manual_final_value`.

Run end to end on `LOT-20260830-D0469F7926`: six operator fields → a rendered EU
label (ingredients descending by mass, full nutrition panel, net quantity, LOT,
best before, storage, FBO block, 102 × 152 mm at 1.20 mm x-height) →
`Pobierz PDF` producing a real **512 762-byte `application/pdf`** →
*„Etykieta partii zapisana"*.

**Every operator value is an explicitly marked staging QA placeholder**,
including a deliberately fictitious operator, so the artifact cannot be mistaken
for a real label. The owner's action is unchanged in substance — supply
supplier-confirmed saturated-fat figures — but nothing in the application blocks.

## 4. Scanner — the refusal path

Given a plain grey PNG that is deliberately not a package label, the pipeline
ran its real stages and answered *„Potrzebuję jeszcze jednego zdjęcia · Czy
możesz pokazać wyraźnie kod kreskowy produktu?"* with two actions. **No product
was invented, and nothing was written** — `global_catalog_products`,
`global_catalog_submissions` and `global_catalog_server_ocr_attestations` all
show 0 rows for 2026-08-30. The intake itself is proven, so blocker 3 is now
only *"no package photograph on disk"*.

## 5. Regression sweep

Every destination renders with no error state: `/home` `/shop` `/community`
`/work-with-us` `/franchise` `/machine` `/account` `/products` `/recipes`
`/top100`. **`scrollWidth === clientWidth === 390` on all nine mobile
destinations** — no horizontal overflow anywhere.

---

## 6. Two suspicions checked and dropped, not filed

Discipline matters as much as findings, so both are recorded.

- Reading the mobile cockpit suggested a route/sheet race that would make the
  recalculation panel's *„Otwórz ustawienia"* unreachable below 1280 px.
  **Tested at 390 × 844: the sheet opens correctly.** The first reading was a
  double-tap artefact of my own harness.
- `ProRecalcPanel` renders no action for `missing_prices`, which would be a dead
  end **if reached** — but ECO refuses neither fixture that way (Vegan ECO
  returns `optimizer_no_solution` *with* an action). Recorded as an unverified
  code observation, not a bug.

One method correction worth keeping: the practical audit is a **top-level** key
of `recipe_input`, not a member of `metadata`. A re-check through the wrong path
made every version look auditless and would have mis-attributed PC-07 to the
PC-06 change. Re-measured correctly, PC-06 was always exactly the two Sorbet
fixtures as originally filed.

---

## 7. What is still open, and why

| # | Item | Why it is not done |
|---|---|---|
| 1 | Stripe test purchase | Completing Stripe's hosted Checkout requires typing a card number. I do not enter card numbers, including test ones. Everything on both sides of that one step is verified. |
| 3 | Scanner positive path | Needs a package photograph on disk. I will not fabricate a label — an OCR pipeline that builds a catalogue product from a fabricated label produces evidence that looks genuine and is not. |
| 4 | Two further commercial products | Same intake constraint. |
| 5 | Account-level machine persistence | **Owner decision.** `user_machine_preference` is applied on staging, satisfying the precondition written into `machinePreferenceSelector.ts`, but the selector is shared by every build — wiring it would also point **production** at a table whose migration is the owner's to apply, and the selector deliberately throws rather than degrading silently. |
| — | PC-01 … PC-05 | Protected ice/Workbench core. Recorded with exact fixtures, untouched by design. |

## 8. Contract status

- **`origin/main` untouched at `4dfb097d`.** Production Supabase never touched.
  No force-push. No feature, route, migration, Mapper product or user record
  deleted.
- **Owner-locked**: two new contracts added
  (`savedRecipeProductionPath`, `productionProductDataRecovery`), none modified.
  Contracts **95/95**.
- **Protected paths**: clean on every PR. `productBehaviorAccess.ts`,
  `constraintStudioStore.ts`, `practicalRecipe.ts` and `src/engine/**` were read
  from, never edited.
- **Full local suite** green on every merge (latest: 10 025 passed, 0 failed).
- One non-required CI job, `Solver time contracts (isolated)`, flaked once on a
  docs-only commit at 5162 ms against a 5000 ms budget (3 % over; 3435 ms
  locally). Recorded in `GELLATTI_BLOCKERS.md`, threshold not raised.

## 9. PRs merged in this close-out

`#8` PC-06 fix · `#11` PC-06 served proof and measured attribution ·
`#12` both Sorbet fixtures completed · `#14` PC-07 fix ·
`#15` PC-07 served, EU label proven, blockers re-scored.
