/**
 * PINGÜINO Pro — the workbar-level recalculation panel (owner P0, 2026-07-22).
 *
 * „Przelicz z PI" in the sticky workbar initiates the REAL canonical recalculation —
 * change recipe → Przelicz z PI → Podgląd → „Zastosuj zmiany" / „Anuluj" → optional „Cofnij"
 * → „Zapisz nową wersję". It is a SECOND VIEW over the ONE constraint-studio session store
 * (createOptimizePreview / applyPreview / cancelPreview / undoLastApply): no new optimizer, no
 * second apply pipeline, and the boundary rule (constraintStudioStore = the only recipe writer)
 * stays intact. Preview rows render through the same pure ConstraintPreviewCard; failures render
 * the same honest Polish messages; a verify-failed apply renders the same BlockedApplyNotice.
 */
import { useMemo } from 'react';
import { copy } from '@/copy/en';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  constraintStudioCopy,
  formatGramsPl,
} from '@/features/constraint-studio/constraintStudioCopy';
import {
  isUndoAvailable,
  useConstraintStudioStore,
  type PreviewIssue,
} from '@/features/constraint-studio/constraintStudioStore';
import {
  diagnoseRecalcFailure,
  isAllLocked,
  type RecalcDiagnosis,
} from '@/features/constraint-studio/recalcDiagnosis';
import { previewIssueMessagePl } from '@/features/constraint-studio/previewIssueMessage';
import { BlockedApplyNotice } from '@/features/constraint-studio/ui/BlockedApplyNotice';
import { ConstraintPreviewCard } from '@/features/constraint-studio/ui/ConstraintPreviewCard';
import type { RecipeInput } from '@/engine';
import type { ConstraintSet } from '@/features/recipe-constraints';

const r = copy.proWorkbar.recalcPanel;
const d = constraintStudioCopy.diagnosis;

/** The headline for a classified failure — proven by the lock report below it. */
function diagnosisMessage(diagnosis: RecalcDiagnosis, issue: PreviewIssue): string {
  switch (diagnosis.code) {
    case 'temperature_route_mismatch':
      return d.temperatureMismatch;
    case 'recipe_input_incomplete':
      return d.incomplete;
    case 'constraint_verification_failed':
      return d.verificationFailed;
    case 'locked_constraints_conflict':
      return isAllLocked(diagnosis)
        ? d.allLocked
        : d.withLocks(diagnosis.lockedCount, diagnosis.totalCount);
    case 'no_active_locks':
      return d.noActiveLocks;
    case 'optimizer_no_solution': {
      // The PROVEN failure: solver invocation count + the exact violated metrics.
      const labels = (diagnosis.violatedMetrics ?? []).map(
        (metric) => d.metricLabels[metric] ?? metric,
      );
      return d.optimizerNoSolution(labels, diagnosis.solverInvocations ?? 0);
    }
    default:
      return previewIssueMessagePl(issue);
  }
}

/** Failed recalculation: the classified cause + the VERIFIED per-ingredient lock report. */
function RecalcDiagnosisView({
  issue,
  input,
  constraints,
  servingModeId,
}: {
  issue: PreviewIssue;
  input: RecipeInput;
  constraints: ConstraintSet;
  servingModeId: string | null;
}) {
  // "Already in band" is not a failure — keep the friendly note, no diagnosis table.
  if (issue.code === 'already_clean') {
    return (
      <p className="text-sm leading-relaxed text-ivory/70" data-testid="pro-recalc-issue">
        {previewIssueMessagePl(issue)}
      </p>
    );
  }

  const diagnosis = diagnoseRecalcFailure({ input, constraints, issue, servingModeId });
  const lockedRows = diagnosis.lockReport.filter((row) => !row.adjustable);

  return (
    <div className="space-y-3" data-testid="pro-recalc-diagnosis" data-code={diagnosis.code}>
      <p className="text-sm leading-relaxed text-ivory/85">{diagnosisMessage(diagnosis, issue)}</p>
      {diagnosis.pouredCount > 0 ? (
        <p className="text-xs leading-relaxed text-amber-300/90">{d.pouredNote(diagnosis.pouredCount)}</p>
      ) : null}

      {lockedRows.length > 0 ? (
        <div className="rounded-md border border-ivory/15 px-3 py-3">
          <p className="text-[0.65rem] font-medium tracking-label text-ivory/50 uppercase">
            {d.lockTable.heading}
          </p>
          <div className="mt-2 divide-y divide-ivory/10">
            {diagnosis.lockReport.map((row) => (
              <div
                key={row.lineId}
                data-testid="pro-recalc-lock-row"
                data-locked={!row.adjustable || undefined}
                className="flex items-baseline justify-between gap-3 py-1.5"
              >
                <span className="min-w-0 truncate text-sm text-ivory">{row.name}</span>
                <span className="flex shrink-0 items-baseline gap-2 text-xs">
                  <span className="font-mono text-ivory/70 tabular-nums">
                    {formatGramsPl(row.actualGrams ?? row.plannedGrams)}
                  </span>
                  <span className={row.adjustable ? 'text-ivory/40' : 'text-status-risky'}>
                    {d.lockTable.state[row.lockState]}
                  </span>
                  <span className="text-ivory/40">{d.lockTable.source[row.source]}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-ivory/60" data-testid="pro-recalc-unchanged">
        {d.unchanged}
      </p>
    </div>
  );
}

export function ProRecalcPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const preview = useConstraintStudioStore((s) => s.preview);
  const previewIssue = useConstraintStudioStore((s) => s.previewIssue);
  const blocked = useConstraintStudioStore((s) => s.blocked);
  const history = useConstraintStudioStore((s) => s.history);
  const constraints = useConstraintStudioStore((s) => s.constraints);
  // Actions are stable references — reading them once via getState is safe.
  const store = useConstraintStudioStore.getState();

  const mode = useRecipeStore((s) => s.mode);
  const category = useRecipeStore((s) => s.category);
  const temperatureC = useRecipeStore((s) => s.target_temperature_c);
  const batchGrams = useRecipeStore((s) => s.target_batch_grams);
  const machineCapacityGrams = useRecipeStore((s) => s.machine_capacity_grams);
  const flavorIntensity = useRecipeStore((s) => s.flavor_intensity);
  const costPriority = useRecipeStore((s) => s.cost_priority);
  const items = useRecipeStore((s) => s.items);
  const servingModeId = useRecipeStore((s) => s.servingModeId);

  const currentInput = useMemo(
    () =>
      buildRecipeInput({
        mode,
        category,
        target_temperature_c: temperatureC,
        target_batch_grams: batchGrams,
        machine_capacity_grams: machineCapacityGrams,
        flavor_intensity: flavorIntensity,
        cost_priority: costPriority,
        items,
      }),
    [mode, category, temperatureC, batchGrams, machineCapacityGrams, flavorIntensity, costPriority, items],
  );

  const undoAvailable = isUndoAvailable(history[history.length - 1], currentInput, constraints);

  if (!open) return null;

  return (
    <section
      aria-label={r.title}
      data-testid="pro-recalc-panel"
      className="mt-3 rounded-lg bg-shell px-4 py-4 text-ivory [color-scheme:dark]"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-label text-ivory/60 uppercase">{r.title}</p>
        <button
          type="button"
          onClick={onClose}
          data-testid="pro-recalc-close"
          className="rounded-md border border-ivory/20 px-3 py-1.5 text-xs font-medium text-ivory transition-colors hover:border-ivory/40"
        >
          {r.close}
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {blocked ? <BlockedApplyNotice blocked={blocked} onDismiss={store.dismissBlocked} /> : null}

        {previewIssue ? (
          <RecalcDiagnosisView
            issue={previewIssue}
            input={currentInput}
            constraints={constraints}
            servingModeId={servingModeId}
          />
        ) : null}

        {preview ? (
          <ConstraintPreviewCard
            preview={preview}
            onApply={store.applyPreview}
            onCancel={() => {
              store.cancelPreview();
              onClose();
            }}
          />
        ) : null}

        {!preview && undoAvailable ? (
          <div className="space-y-2" data-testid="pro-recalc-applied">
            <p className="text-sm leading-relaxed text-ivory/80">{r.applied}</p>
            <button
              type="button"
              onClick={store.undoLastApply}
              data-testid="pro-recalc-undo"
              className="inline-flex items-center justify-center rounded-md border border-ivory/20 px-4 py-2 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
            >
              {r.undo}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
