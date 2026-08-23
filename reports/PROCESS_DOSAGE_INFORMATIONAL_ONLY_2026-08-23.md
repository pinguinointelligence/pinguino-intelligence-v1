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
- Direct **percentage** editing of a stabilizer line now always returns
  `protected_line`. Previously it was permitted for the two stabilizers that
  happened to carry an approved Mapper window (tara gum, Solmix). Stabilizer
  **grams** editing is unchanged and still governed by the owner stabilizer
  system. This is the one place the cleanup narrows a capability; it is called
  out for the owner rather than buried.

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

`src/features/product-intelligence/processDosageInformationalOnly.test.ts` — 16
cases, one per owner proof (1–14) plus two for the `?` presentation. Rewritten:
`productDosageAuthority.test.ts` (11), `productDoseSuggestion.test.ts` (4),
`directPercentEdit.test.ts` (9). Updated: 13 further files whose assertions
encoded the retired authority.

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
