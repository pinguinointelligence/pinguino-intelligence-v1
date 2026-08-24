# PRODUCTION → LIVE RESCUE → LABEL — §64 EXISTING-CAPABILITY AUDIT

Starting staging SHA: `5ec6dfe` (origin/staging, 2026-08-24)
Worktree/branch: `~/Developer/pinguino-production-label` · `claude/production-live-rescue-label`

This document is the mandatory §64 mapping produced BEFORE any solver or UX work.
It states what already exists, what is reused as-is, and what is genuinely missing.

---

## A. EXISTING PRODUCTION RESCUE CAPABILITY → NEW UX/STATE USAGE

| Owner requirement | Existing authority | Verdict |
|---|---|---|
| §7 planned vs actual per row | `ProductionLineState` (`plannedGrams`, `targetGrams`, `draftActualGrams`, `physicalAddedGrams`, `confirmed`) — `productionSession.ts` | EXISTS — reuse |
| §8 actual grams are physical truth | `buildProductionForecastInput` / `buildFinalActualInput` feed `calculateRecipe` | EXISTS — reuse |
| §9 live analysis after every commit | `assessProductionRescue(session)` recomputed via `useMemo` on session change; no separate "Analyze" button | EXISTS — reuse |
| §11 committed lower bound | `preservesPhysicalReality()` + `setDraftActualGrams` guard + `applyVerifiedRescueInput` throw | EXISTS — reuse |
| §12/§19 add-more to an already-added line | `applyVerifiedRescueInput` reopens a confirmed line when the new target exceeds the physical floor | EXISTS — reuse |
| §13 rescue to the ORIGINAL batch size | Rescue option `keep_original_batch` (mass must equal original ±0.1 g) | EXISTS — reuse |
| §16 scale the batch up | Rescue option `enlarge_batch`, `context: 'actual_batch'`, add-only actions, candidates sorted by ascending mass → smallest wins | EXISTS — reuse |
| §15C continue without correction | Rescue option `leave_as_is`, offered ONLY when `nativeSafe()` holds | EXISTS — reuse |
| §17 no arbitrary rounding | practicalization to whole grams via `practicalizeRecipeCandidate` + `productionConstraintSet` (physical floor as range min) | EXISTS — reuse |
| §21 data-entry correction | `reopenProductionRecord` + `correctRecordedPhysicalGrams` (+ `recordCorrectionCount`) | EXISTS — reuse |
| §24 rescue uses Engine authority | `proposeAutoFix`/`applyAutoFix`/`detectViolations`/`recipeFitForInput` + Main/protein/practical gates | EXISTS — reuse |
| §25 rescue ≠ recipe edit | Rescue writes only `ProductionSession`/`ProductionRun`; the source recipe version is immutable | EXISTS — reuse |
| §27 vessel mass from actuals | `productionProgress().confirmedMassG` sums `physicalAddedGrams` | EXISTS — reuse |
| §28/§56 reload persistence | `production_runs` + `production_start_run_v2`/`recordActual`/`production_apply_rescue_v1` RPCs; `hydrateProductionSessionFromRun` + `mergePendingProductionDrafts` | EXISTS — reuse |
| §34 actual production snapshot | `ProductionCompletionSnapshot` (frozen at `completeProductionSession`) | EXISTS — reuse |
| §43 state machine | `PRODUCTION_TRANSITIONS` (draft→planned→in_progress→completed/cancelled) + `ProductionRescueAuthorizationState` | EXISTS — reuse |
| §44 event/audit history | `ProductionEventType` = created/planned/started/actual_recorded/rescue_applied/completed/cancelled/amended/note_added | EXISTS — partial (see gaps) |
| §57 RLS | owner-scoped `production_runs` policies; server-authorized Rescue via `production-rescue-authorize` Edge fn | EXISTS — reuse |
| §5/§6/§30 editor disappears during production | `StudioEngineSurface` passes `mode={productionActive ? 'production' : 'recipe'}` to `IngredientBuilder`; `ProductionRow` replaces the editable row | EXISTS — reuse |
| §35 label from ACTUAL snapshot | `MasterLabelEditor` is fed `session.completionSnapshot`; `buildMasterLabelData` reads `finalActualInput`/`finalProduct` | EXISTS — reuse |

**Conclusion: a second rescue solver must NOT be built.** Everything in §13/§16/§11/§12
already has a verified Engine-backed implementation. The remaining work is UX, one
positive process signal, batch-size honesty, and the Label workspace/persistence.

---

## B. GENUINE GAPS (what this work must add)

1. **§1 thermal selector still shipped.** `ThermalModeSelector` in `ProductionCockpit.tsx`
   ("Sposób przygotowania bazy (opcjonalnie)" / "Tylko na zimno" / "Możliwa obróbka cieplna"),
   backed by `recipe.productionThermalMode` and `production.setThermalMode`.
   **Important finding:** migration `20260823210000_process_dosage_informational_only.sql`
   already accepts `p_thermal_mode = null` at `production_start_run_v2` and in
   `resolve_product_behavior_v1`. **Removing the selector therefore needs NO migration** —
   the DB thermal gate was already retired on 2026-08-23.
2. **§2 no positive heat signal exists.** `product_process_readiness_v1` returns
   `READY` with an EMPTY advisory list when the process decision is `verified` and known.
   The only advisory it emits is for missing/unverified data
   (`PROCESS_INFORMATION_NOT_AVAILABLE` / registry codes) — i.e. exactly the box §3 forbids.
   A positive `HEAT_TREATMENT_INDICATED` advisory has to be added (staging migration) before
   the "Pamiętaj o obróbce" card can be truthful.
3. **§3 unknown-process box is in normal Production.** `ProcessReadinessNotice` renders
   "Dla wskazanych produktów nie mamy informacji o obróbce…" at three phases. Must go.
4. **§2 acknowledgement has no durable home.** `ProductionMeta` = plannedDate/machine/
   location/batchReference/notes only. Needs a run-level acknowledgement field or event.
5. **§60 placeholder still shipped.** `ReadinessFrame state="W PRZYGOTOWANIU"` /
   "Brakuje składnika · automatyczne etapy" in the active-production view.
6. **§14/§16 rescue copy is generic.** Titles are "Skoryguj pozostałe" / "Powiększ partię";
   the owner asked for the concrete mass in the CTA ("Napraw do 1000 g", "Powiększ do 1086 g")
   and for the minimum feasible batch to be stated explicitly, never hidden behind a round number.
7. **§20 no direct "Dodaj brakujące X g".** Underweight currently produces the same three
   generic rescue options; the most direct correction is not offered first.
8. **§22/§54 no compact live monitor / mobile sticky bar** ("W naczyniu / Plan aktualny /
   Pozostało"). Desktop shows vessel + forecast only; mobile has no sticky production bar.
9. **§26 progress counter.** `confirmedCount/totalCount` is honest for reopened lines
   (reopen clears `confirmed`), but new rescue-added lines must be verified to enter the count.
10. **§36–§42 Label is not one workspace and is not durable.**
    `useMasterLabelStore` is **zustand + localStorage** (`persist`, name `pinguino-master-label`).
    §40 requires a real DB Label Profile with RLS; §41 requires a frozen per-run Label Snapshot;
    §42 requires a menu entry `Etykiety` reaching the same authority. None exist.
11. **§44 missing event types**: `variance_detected`, `rescue_previewed`, `batch_target_changed`,
    `additional_ingredient_requested`, `actual_entry_corrected`, `ingredient_completed`.
12. **§51 score truth.** The active cockpit prints one score with the caption
    "Ocena dotyczy przewidywanego składu po zakończeniu bieżącej partii" — correct in words,
    but "Aktualny stan w naczyniu" is never shown as a distinct figure.

---

## C. STAGING SAFETY

Production (`main` = `4dfb097`) is untouched. All DB work is staging-only.
No Mapper mutation. No merge to `main`. No production Vercel/Edge/Supabase deploy.
