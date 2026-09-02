# Process and dosage are informational only — 2026-08-23

Owner decision: **Gellatti will not attempt to decide how a professional
ingredient must be processed or dosed.** The customer/professional using the
ingredient is responsible for knowing how their product should be used.

Everything below removes the RUNTIME DEPENDENCY on process and dosage. No
factual row was destroyed: the Mapper dataset, `mapper_process_metadata` and the
Owner-curated `production_process_advisory_registry` are all untouched.

## 1. Requested scope

Repository-wide removal of HEAT / COLD / BOTH / UNKNOWN process state, process
evidence, hot/cold eligibility, professional dosage authority, dosage
normalization, dosage basis interpretation and ProductBehavior readiness based
on process/dosage — from every runtime eligibility, readiness and blocking
decision. Keep the underlying facts as product information under `?`.

## 2. Completed work

### Dosage runtime gates removed (11 call sites, 1 module retired)

`productDosageAuthority.ts` no longer contains a gate at all. The three
functions that were the gate — `productDosageAuthority`,
`assessProductDosages`, `clampProductDosageGrams` — were **removed, not
relaxed**, so no caller can resurrect them by widening a threshold. In their
place the module exports `productRecommendedDosageInfo` /
`productRecommendedDosagePl`, which read the declared dosage for display and
convert nothing.

Call sites repaired:

| File | What it used to do |
| --- | --- |
| `constraint-studio/applyPipeline.ts` (6 places) | Rejected solver candidates, draft vectors, executables, Main-frontier probes and Previews on dosage; emitted `productDosageDiagnostics` |
| `constraint-studio/constraintStudioStore.ts` | Terminal `BLOCKED_WITH_EXACT_ACTION` on a dosage violation |
| `recipe-constraints/recipeConstraintAuthority.ts` | `product_dosage_invalid` issue on every authority evaluation |
| `stores/recipeStore.ts` (3 places) | Clamped manual grams, refused vector writes, refused the guarded recipe write |
| `ingredient-builder/directPercentEdit.ts` | Clamped a percentage edit and refused it on conflict |
| `ingredient-builder/IngredientBuilder.tsx` | Clamped typed grams to the manufacturer window |
| `constraint-studio/ui/ConstraintPreviewCard.tsx` | Rendered dosage diagnostics and disabled Apply |

### No automatic dosing (§3)

`verifiedProductDoseSuggestion` and `allocateAutomaticDoseGroup` were removed.
A newly selected product now starts at 0 g with `UNKNOWN` provenance and the
professional enters the amount. `ProductDoseProvenance` keeps its
`AUTO_SUGGESTED` member only so previously persisted rows still parse.

### `TECHNICAL_AUTHORITY_REQUIRED` retired (§8) — integrated with Codex

Codex reached the same decision in parallel on `origin/staging` (`cce6c1b`,
INTIMPORT-scoped): it demoted the flag instead of deleting it, so the owner can
still SEE that a product's dosage is unproven. That is the better reading of §4,
and **their approach was kept**: `ProductWorkingValues.technicalAuthorityRequired`
is still resolved and still written into the stored intelligence, and
`planIntimportImport` decides state on composition alone.

Layered on top of it here: the `TECHNICAL_AUTHORITY_REQUIRED` member is removed
from the `ProductReadiness` and `ImportedProductState` unions and from
`byState`, because after the demotion nothing can ever produce it — §8 asks for
that state to be retired cleanly rather than left as a dead branch. The
`ProductImportPage` counter that reported those rows as "z zablokowanym użyciem
technicznym" now reports them as "bez informacji o dawkowaniu producenta
(informacyjnie — nie blokuje)".

Separately, `dosage` was dropped from `TECHNICAL_CRITICAL` and from
`TECHNICAL_WEIGHTS` in `productEvidenceConfidence.ts` (the remaining weights
were redistributed and still sum to 100), and `technicalBlocked` was removed
from `ProductConfidenceAssessment`. Without this a missing dosage still depressed
a product's confidence below the 85 auto-import floor — a dosage gate by
arithmetic rather than by predicate.

### Process runtime gates removed

| Layer | Before | After |
| --- | --- | --- |
| `recipeBehaviorAuthority.ts` | `PROCESS` module required frozen process evidence | No facts requirement; `frozenProcessEvidence` returns whatever is known, for display |
| `services/productIntelligence.ts` | Synthesized `BLOCKED` for `PROCESS_THERMAL_MODE_REQUIRED`, `PROCESS_AUTHORITY_UNAVAILABLE`, `PRODUCT_AUTHORITY_REQUIRED`; rejected a payload with no process envelope | Always `READY`/`READY_WITH_INFO`; server blockers are folded into advisories; a silent envelope is accepted |
| `useProductionWorkspace.ts` | `canStartProduction` required a declared thermal mode and a non-BLOCKED readiness | `canStartProduction` depends on the product-authority prerequisite alone |
| `ProductionCockpit.tsx` | Red `production-process-blocked` panel with four blocker messages | Neutral advisory that renders **nothing** when no information exists |
| `ProcessGuideEntry.tsx` + `education.pl.ts` | "Nie można bezpiecznie potwierdzić procesu na zimno" + `NIEWYSTARCZAJĄCE DANE` in warning colour with a `data-readiness` marker | "Brak informacji o obróbce" + `BRAK INFORMACJI` in neutral colour, no readiness marker |

### Production blockers removed (server, staging DB)

Migration `20260823210000_process_dosage_informational_only.sql`, applied to
`tunabqqrwabacxjcxxkz`. `product_process_readiness_v1` can no longer return
`BLOCKED` — the six blocker codes it used to emit
(`PROCESS_THERMAL_MODE_REQUIRED`, `PROCESS_THERMAL_MODE_INVALID`,
`MAPPER_PROCESS_IDENTITY_MISSING`, `PROCESS_HEAT_REQUIRED_CONFLICT`,
`PROCESS_ADVISORY_AUTHORITY_MISSING`, `PROCESS_DECISION_UNSUPPORTED`) are gone.
`resolve_product_behavior_v1` no longer emits `process_readiness_blocked` and
grants `PROCESS`/`PRODUCTION` on exactly the non-process evidence every other
module already satisfied. `recipe_process_readiness_v1` accepts a NULL thermal
mode. The `production_runs_process_authority` constraint, the
`production_enforce_process_authority_v1` and
`production_freeze_process_event_v1` triggers and `production_start_run_v2` all
treat the thermal route as an optional operator note.

Served verification on staging (five previously blocking cases, all now
non-blocking with zero blockers):

| Case | Result |
| --- | --- |
| UNKNOWN process, no advisory row, no thermal mode | `READY_WITH_INFO`, 0 blockers |
| COLD product on a HEAT_CAPABLE route | `READY` |
| HEAT_REQUIRED product on a COLD_ONLY route (the old hard conflict) | `READY` |
| No Mapper identity at all | `READY_WITH_INFO`, 0 blockers |
| Owner-curated advisory row | `READY_WITH_INFO`, source detail preserved verbatim |

### Product `?` information (§5)

`productProcessInformation.ts` (new) renders `Obróbka: Na zimno / Na ciepło /
Na ciepło lub zimno / Brak informacji`. The ingredient data dialog now shows
that line plus `Zalecane dawkowanie producenta: <raw value>` or `Brak
informacji`. A manufacturer string such as `100–250 g/L` is shown exactly as
declared — never converted to a percentage, never expanded into grams for the
current batch, never used to choose a basis.

## 3. What was deliberately KEPT

- **`technicalAuthorityRequired`** — evidence, never a gate. It is still
  resolved and still written into the stored product intelligence for audit,
  explanation, tooltips and diagnostics. It independently blocks nothing:
  ingredient selection, Base use, Engine calculation, Preview, Apply and Save
  all ignore it. Three regressions in
  `processDosageInformationalOnly.test.ts` pin this by flipping the flag as the
  only variable between two otherwise identical rows and asserting every verdict
  is unchanged.
- **PINGÜINO's own stabilizer system** (`gelatoStabilizerSystemAuthority`,
  `sorbetStabilizerSystemAuthority`, `stabilizerDosage.ts`,
  `clampOwnerStabilizerComponentGrams`). This is Gellatti's science about its
  own recipe with an explicit, unambiguous basis (percent of total mix), not a
  manufacturer's instruction about their product. It still bounds solver
  movement and stabilizer grams. Flagged here because it is the one place the
  word "dosage" survives on purpose.
- **The owner Inulin policy** (0 % or 2–8 %, preferring 4 %). It is enforced
  independently in `formulate.ts` and by the stabilizer-system authority; the
  regression suite proves the 0-or-20-80 g band still holds after the dosage
  gate was removed.
- **Every factual row**: `mapper_basement` (2088 rows, 253 with a declared
  dosage), `mapper_process_metadata` (2088 rows), the three Owner-curated
  advisory-registry rows, and the 1389 historical
  `classification_reason_codes` entries containing `process_evidence_missing`.
  Those reason codes are a factual record of what the classifier observed and
  were deliberately NOT rewritten; the resolver simply stopped treating them as
  blockers.

## 4. Behaviour changes worth naming

- **1389 of 2088** Mapper rows have `process_status = UNKNOWN`. Every one of
  them previously carried a process blocker; none does now.
- **46 rows** were blocked *solely* by process UNKNOWN for technical PI → 0.
- On the Polish INTIMPORT file, engine-usable rows go **190 → 450** and
  `TECHNICAL_AUTHORITY_REQUIRED` rows **260 → 0** (the bulk of this is Codex's
  `cce6c1b`; the confidence-weight fix removes the remaining arithmetic gate).
- Stabilizer **percentage** editing keeps full parity with grams editing. Grams
  and percent are one quantity in two representations: the percentage converts
  deterministically against the current target batch and then passes through the
  SAME PINGÜINO clamp the grams control uses
  (`clampOwnerStabilizerComponentGrams`), so both converge on the same
  executable grams and the same Engine physics. The Mapper's
  `recommended_dosage_percent_min/max` decides neither.

## 5. Files changed

63 paths, rebased onto `origin/staging` (`1da56d0`). New: `productProcessInformation.ts`,
`processDosageInformationalOnly.test.ts`,
`20260823210000_process_dosage_informational_only.sql`. Regenerated:
`productionRescueEngine.bundle.mjs` (+ manifest/metadata),
`MAPPER_2088_PRODUCT_BEHAVIOR_AUDIT.*`, `MAPPER_2088_RUNTIME_USABILITY_AUDIT.*`,
`docs/products/*.json`.

`scripts/buildProductionRescueEdgeBundle.mjs` dropped
`productDosageAuthority.ts` from `EXPECTED_SOURCE_CLOSURE` (the Rescue bundle no
longer imports it). `scripts/auditMapperRuntimeUsability.mjs` re-pinned
`EXPECTED_BEHAVIOR_SHA` to `20f1b869…` after the reviewed audit regeneration.

## 6. Tests

`src/features/product-intelligence/processDosageInformationalOnly.test.ts` — 19
cases: one per owner proof (1–14), two for the `?` presentation, and three
pinning `technicalAuthorityRequired` as evidence that gates nothing.

`src/features/ingredient-builder/stabilizerGramPercentParity.test.ts` — 23
cases proving grams/percent semantic parity: the same requested quantity
through either control converges on the same executable grams and the same
`calculateRecipe` output, PINGÜINO's whole-gram rule and aggregate ceiling
apply identically to both, and the manufacturer window decides neither. Eight
of them drive the REAL store end to end (grams via `setPlannedGrams`, percent
via `buildDirectPercentEdit` + `setPlannedGramsVector`) across 0–400 g; one
proves an edit that would INTRODUCE a stabilizer violation is still refused.

That end-to-end pass caught a genuine divergence: at 1 g the grams control
clamped and wrote, while the percent control was silently refused, because
`setPlannedGramsVector` rejected any draft the stabilizer system had an issue
with — including issues the draft already had before the edit. It now refuses
only what an edit INTRODUCES, which is what the grams control has always done.
PINGÜINO's band is unchanged and is still enforced at Preview, Apply and Save.

Rewritten: `productDosageAuthority.test.ts` (11),
`productDoseSuggestion.test.ts` (4), `directPercentEdit.test.ts` (10).
Updated: 13 further files whose assertions encoded the retired authority.

## 7. Exact commands and results

| Command | Result |
| --- | --- |
| `npm test` | 658 files / 8285 passed, 1 skipped file / 100 skipped tests |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors (4 pre-existing react-refresh warnings, untouched files) |
| `npm run build` | clean |
| `npm run products:audit` | 2088 rows; `process_evidence_missing` no longer emitted |
| `npm run mapper:runtime-audit` | `processOnlyBefore: 0`, `processUnknown: 1389`, `dosageUnknown: 1835` |
| `npm run process:validate` | 2088 rows, source SHA unchanged, 0 alignment differences |
| `git diff --check` | clean |

`process:validate` was inspected and left unchanged: it validates dataset
integrity (source SHA, row counts, ID uniqueness, Mapper alignment) and encodes
no readiness authority.

## 8. Parallel work preserved

Rebased onto `origin/staging` `1da56d0`. Five conflicts, resolved toward
Codex's work in every case where the two overlapped:

| File | Resolution |
| --- | --- |
| `productWorkingValues.ts` | Kept Codex's demoted informational flag; kept the `ProductReadiness` union cleanup |
| `intimportIntelligence.ts` | Kept Codex's "nothing is dropped" `planIntimportImport` rewrite; retired the unreachable state member |
| `mapperFirstIntelligence.test.ts` | Kept Codex's four richer handoff tests; renamed the stale `'TECHNICAL_AUTHORITY_REQUIRED'` test sentinel to a `dosageUnproven` boolean |
| `docs/products/*.json` | Reset to staging and regenerated, so Codex's 424/450 figures stand |

Also landed on staging while this branch was open and left untouched:
`aa56e8d`/`2c42fb5` (solver soft-hold), `7d58c99`/`17ff1ec` (accepted-profile
formulation vector, canonical name variant), `c0cae06`/`1da56d0` (QA docs).

## 9. Deployment

Staging only. Production `main` untouched; no production deploy.

Migration `supabase/migrations/20260823210000_process_dosage_informational_only.sql`
applied to `tunabqqrwabacxjcxxkz` (pinguino-staging) and recorded there as
version `20260823214822`. That authored-version / applied-version difference is
this repo's existing pattern (`global_main_capability_authority` is authored
`20260823130000` and recorded `20260823161759`), so the filename is left as
authored. The migration is re-runnable: every statement is `create or replace`
or `drop constraint if exists` followed by `add constraint`.

Served verification after apply: `product_process_readiness_v1` returns
`READY_WITH_INFO` with zero blockers for an UNKNOWN-process product with no
advisory row; `mapper_process_metadata` 2088 rows, advisory registry 3 rows and
`mapper_basement` 2088 rows all intact.

---

# Served QA — 2026-08-24, staging `ff85601`, bundle `index-DETgucLw.js`

Real authenticated TEST PRO session (`pro@pro.com`, pre-existing in the browser
profile — no credentials were typed). Recipe: **QA Lost PL zoltka UNLOCKED v2**,
Gelato / OPTIMAL / −11 °C / 1000 g. Stabilizer line: **TARA GUM · Stabilizer**
(PI-ING-000492), starting at 2 g — a CLEAN state inside PINGÜINO's 2–5 g
aggregate band for this batch.

## Grams / percent parity — 8/8

| requested | 0 g | 1 g | 2 g | 3 g | 4 g | 5 g | 6 g | 12 g |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| as % of 1000 g | 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 1.2 |
| **grams control** | 0 | 1 | 2 | 3 | 4 | 5 | **5** | **5** |
| **percent control** | 0 | 1 | 2 | 3 | 4 | 5 | **5** | **5** |

Both converge on the same executable grams at every point. The percent control
holds the batch at exactly 1000 g by proportional rebalance (620 → 618.71 …)
while the grams control lets the batch drift (1000 → 1002), which is the
long-standing difference between "an amount" and "a share of the batch" and is
not a stabilizer question.

## Clamp

PINGÜINO's aggregate ceiling is **5 g** at this batch. 6 g and 12 g clamp to 5 g
through BOTH controls. The whole-gram rule holds on both. The manufacturer's own
window is **0.2 %–1 %** = 2–10 g, so 6 g is INSIDE what the producer recommends
and was still clamped to 5 g — the ceiling is PINGÜINO's, not the producer's.

## Invalid under PINGÜINO science

1 g is below PINGÜINO's 2 g aggregate minimum. **Both** controls accept it —
editing is permissive on both, exactly as the grams control has always been.
The verdict then arrives where it belongs: Preview proposed

    TARA GUM · Stabilizer   1 g → 2 g   (+1 g)

correcting the amount back into the band, with the locked yolk held at
`40 g BEZ ZMIAN · ZABLOKOWANE`. Applied cleanly; result 2 g, whole grams,
total 1000 g.

## THE DEFECT THIS QA CAUGHT

On the previous bundle (`index-C8zeBh9Q.js`) the 1 g case DIVERGED: grams wrote
1 g, percent was silently refused and stayed at 2 g. The offline regression had
missed it because `ownerSameInputRecipe()` starts at 1.9 g — already below the
minimum — so the same edit introduced no new issue and the two paths agreed by
accident. Served staging starts CLEAN at 2 g, where the edit does introduce one.

Fixed in `ff85601`: the vector seam now applies the same
`clampOwnerStabilizerComponentGrams` the single-line grams seam applies and
nothing more, so both seams enforce identical science (ceiling + whole grams)
and neither enforces the minimum, which is a Preview/Apply/Save verdict. The
suite gained a clean-baseline matrix that fails without the fix.

## Product `?` dialog

    Źródło                            verified_db
    Status                            Zweryfikowane
    Pewność                           98%
    Obróbka                           Na ciepło
    Zalecane dawkowanie producenta    0.2%–1%
    ID                                PI-ING-000492

Warning-styled nodes: **0**. `data-readiness`: **absent**. `role="alert"`:
**absent**. Both facts are plain rows requiring no acknowledgement.

## Production

With **no thermal mode selected** and five products carrying no process
information at all (EGGS CHICKEN YOLK DRIED, INULIN, CREAM 30 %, MILK 3.5 %,
SKIMMED MILK), **`Rozpocznij partię` is ENABLED**. That exact state was
`PROCESS_THERMAL_MODE_REQUIRED` + `PROCESS_ADVISORY_AUTHORITY_MISSING` → BLOCKED
before this work. The panel now reads "Sposób przygotowania bazy (opcjonalnie) …
Nie warunkuje startu produkcji — o obróbce decydujesz Ty" beside a neutral
"Informacja o obróbce" list. `production-process-blocked` does not exist in the
served DOM.

## Save → reload → reopen

Saved as **version 3** (Codex's v2 preserved — versioning is additive). Local
draft cleared, reopened from the server via My Recipes: v3 loads with TARA GUM
at **2 g**, total 1000 g, all eight lines intact, `dirty: false`.

## Stale copy

Zero hits for `dowod/dowód`, `NIEWYSTARCZAJĄCE DANE`, `Twarde dawki produktu`,
`Wybierz sposób przygotowania bazy`, `zatwierdzony zakres`, `zablokowanym
użyciem technicznym`, `bezpieczną dawkę` across Receptura, Monitor and
Produkcja.

## Environment

Staging `ff85601`, bundle `index-DETgucLw.js`, deploy
`dpl_CWLxp2EofBbAebin4AzgacowUnFX` READY. Production `main` `4dfb097`,
untouched. Mapper unchanged.
