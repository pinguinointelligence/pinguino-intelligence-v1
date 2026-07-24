/**
 * Constraint Studio section (SPEC §17–§20) — the store-connected surface
 * mounted in the Studio's main column, under the ingredient builder.
 *
 *  - „Dopasuj recepturę” creates a PREVIEW (never a silent change — §12.4);
 *  - batch rescale goes through `rescaleBatchToTarget` (locked grams
 *    preserved, §17.4) and previews first;
 *  - Apply is explicit and passes the one pipeline door (verify-gated);
 *  - the live locked-sum conflict banner is pure arithmetic (§17.4);
 *  - feasibility analysis renders §18 honestly (verified bounds, groups,
 *    verbatim §18.5 fallback);
 *  - history/Undo/Explain per §20; Save reuses the pro-core version path.
 */
import { useEffect, useMemo, useState } from 'react';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { Card } from '@/components/ui/Card';
import {
  BATCH_SUM_TOLERANCE_G,
  constrainedMinimumGrams,
} from '@/features/recipe-constraints';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import { constraintStudioCopy as copy, formatGramsPl } from '../constraintStudioCopy';
import { constraintStudioFlags } from '../constraintStudioFlags';
import { isUndoAvailable, useConstraintStudioStore } from '../constraintStudioStore';
import { previewIssueMessagePl } from '../previewIssueMessage';
import { BlockedApplyNotice } from './BlockedApplyNotice';
import { ConstraintHistoryPanel } from './ConstraintHistoryPanel';
import { ConstraintPreviewCard } from './ConstraintPreviewCard';
import { FeasibilityNotice } from './FeasibilityNotice';
import { RangeConstraintEditor } from './RangeConstraintEditor';

const secondaryButton =
  'inline-flex items-center justify-center rounded-md border border-ivory/20 px-4 py-2.5 text-sm font-medium text-ivory transition-colors hover:border-ivory/40';

/** §17.4 live locked-sum conflict — PURE view (unit-testable without stores). */
export function LockedSumConflictBanner({
  lockedMinimumGrams,
  targetBatchGrams,
  onSetBatchToMinimum,
}: {
  lockedMinimumGrams: number;
  targetBatchGrams: number;
  onSetBatchToMinimum: (grams: number) => void;
}) {
  const minimum = Math.ceil(lockedMinimumGrams);
  return (
    <section
      role="alert"
      aria-label={copy.conflict.title}
      className="rounded-md border border-status-risky/40 bg-status-risky/[0.06] px-4 py-3"
    >
      <p className="text-sm font-medium text-ivory">{copy.conflict.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-ivory/80">
        {copy.conflict.lockedSumExceedsBatch(
          formatGramsPl(lockedMinimumGrams),
          formatGramsPl(targetBatchGrams),
          formatGramsPl(minimum),
        )}
      </p>
      <button
        type="button"
        className="mt-2 rounded-md border border-ivory/20 px-3 py-1.5 text-xs font-medium text-ivory transition-colors hover:border-ivory/40"
        onClick={() => onSetBatchToMinimum(minimum)}
      >
        {copy.conflict.setBatchTo(formatGramsPl(minimum))}
      </button>
    </section>
  );
}

export function ConstraintStudioSection() {
  const items = useRecipeStore((state) => state.items);
  const targetBatchGrams = useRecipeStore((state) => state.target_batch_grams);
  const mode = useRecipeStore((state) => state.mode);
  const category = useRecipeStore((state) => state.category);
  const temperatureC = useRecipeStore((state) => state.target_temperature_c);
  const machineCapacityGrams = useRecipeStore((state) => state.machine_capacity_grams);
  const flavorIntensity = useRecipeStore((state) => state.flavor_intensity);
  const costPriority = useRecipeStore((state) => state.cost_priority);

  const constraints = useConstraintStudioStore((state) => state.constraints);
  const preview = useConstraintStudioStore((state) => state.preview);
  const previewIssue = useConstraintStudioStore((state) => state.previewIssue);
  const blocked = useConstraintStudioStore((state) => state.blocked);
  const feasibility = useConstraintStudioStore((state) => state.feasibility);
  const history = useConstraintStudioStore((state) => state.history);
  // Actions are stable references — reading them once via getState is safe.
  const store = useConstraintStudioStore.getState();

  // Prune constraints for lines that vanished (preset loads, removals).
  const reconcile = useConstraintStudioStore((state) => state.reconcile);
  useEffect(() => {
    reconcile();
  }, [items, reconcile]);

  const [batchText, setBatchText] = useState('');

  const currentInput = useMemo(
    () =>
      buildRecipeInput({
        mode,
        category,
        target_temperature_c: temperatureC,
        target_batch_grams: targetBatchGrams,
        machine_capacity_grams: machineCapacityGrams,
        flavor_intensity: flavorIntensity,
        cost_priority: costPriority,
        items,
      }),
    [mode, category, temperatureC, targetBatchGrams, machineCapacityGrams, flavorIntensity, costPriority, items],
  );

  // §17.4 live locked-sum conflict — pure arithmetic, no engine evaluation.
  const lockedMinimum = constrainedMinimumGrams(constraints);
  const lockedSumConflict = lockedMinimum > targetBatchGrams + BATCH_SUM_TOLERANCE_G;

  const undoAvailable = isUndoAvailable(history[history.length - 1], currentInput, constraints);

  return (
    <Card padding="lg">
      <SectionLabel>{copy.section.title}</SectionLabel>
      <p className="mt-2 text-xs leading-relaxed text-ivory/65">{copy.section.lead}</p>

      <div className="mt-4 space-y-4">
        {lockedSumConflict ? (
          <LockedSumConflictBanner
            lockedMinimumGrams={lockedMinimum}
            targetBatchGrams={targetBatchGrams}
            onSetBatchToMinimum={store.createBatchRescalePreview}
          />
        ) : null}

        {/* Owner P0 (canonical workbench): the PRIMARY recalculation („Przelicz z PI") lives ONLY
            in the top workbar and drives THIS same store — there is no competing „Dopasuj
            recepturę" trigger here. This section keeps the SECONDARY analysis tools (batch
            rescale, feasibility) + the shared Preview/Apply/Cancel + history/Undo. */}
        {/* §17.4 explicit batch change with locked lines preserved. */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="constraint-studio-batch">
              {copy.actions.rescaleLabel}
            </label>
            <input
              id="constraint-studio-batch"
              type="number"
              min={0}
              placeholder={String(Math.round(targetBatchGrams))}
              value={batchText}
              onChange={(event) => setBatchText(event.currentTarget.value)}
              className="w-32 rounded-md border border-ivory/15 bg-shell px-3 py-2 text-right font-mono text-sm text-ivory tabular-nums transition-colors hover:border-ivory/30 focus:border-ivory/40 focus:outline-none"
            />
            <button
              type="button"
              className={secondaryButton}
              // Owner P0 (scale safety): an empty/zero/invalid target never
              // reaches the pipeline — the visible input is the ONLY source.
              disabled={!Number.isFinite(Number(batchText)) || Number(batchText) <= 0 || batchText.trim() === ''}
              onClick={() => {
                const grams = Number(batchText);
                if (Number.isFinite(grams) && grams > 0) store.createBatchRescalePreview(grams);
              }}
            >
              {copy.actions.rescale}
            </button>
          </div>
          <p className="text-xs leading-relaxed text-ivory/60">{copy.actions.rescaleHint}</p>
        </div>

        {/* §18 feasibility — explicit, analysis-only. */}
        <div className="space-y-1.5">
          <button type="button" className={`${secondaryButton} w-full`} onClick={store.runFeasibility}>
            {copy.actions.feasibility}
          </button>
          <p className="text-xs leading-relaxed text-ivory/60">{copy.actions.feasibilityHint}</p>
        </div>

        {previewIssue ? (
          <p className="text-sm leading-relaxed text-ivory/70">{previewIssueMessagePl(previewIssue)}</p>
        ) : null}

        {blocked ? <BlockedApplyNotice blocked={blocked} onDismiss={store.dismissBlocked} /> : null}

        {preview ? (
          <ConstraintPreviewCard
            preview={preview}
            onApply={store.applyPreview}
            onCancel={store.cancelPreview}
          />
        ) : null}

        {feasibility ? (
          <FeasibilityNotice
            input={currentInput}
            analysis={feasibility}
            handlers={{
              onSuggestedFix: store.createSuggestedFixPreview,
              onUnlock: store.clearConstraint,
              onChangeBatch: (minimumBatchGrams) =>
                store.createBatchRescalePreview(Math.ceil(minimumBatchGrams)),
              onKeepAsIs: store.clearFeasibility,
            }}
          />
        ) : null}

        {constraintStudioFlags.rangeConstraintUi ? (
          <RangeConstraintEditor
            items={items}
            constraints={constraints}
            onSetRange={(lineId, minGrams, maxGrams) =>
              store.setRangeConstraint(lineId, minGrams, maxGrams).ok
            }
            onClearRange={store.clearConstraint}
          />
        ) : null}

        <ConstraintHistoryPanel
          history={history}
          undoAvailable={undoAvailable}
          onUndo={store.undoLastApply}
        />
        {/* S2 repair: the lower "Studio v1" save was a SECOND independent persistence path that
            entangled with the top-right save (orphan rows + per-session v1 reset). Removed — the
            ONE canonical save lives in the top-right dialog; durable history/compare/restore live
            in the Wersje tab (RecipeVersionsSection). */}
      </div>
    </Card>
  );
}
