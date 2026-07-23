/**
 * §19.1 Preview card — the old→new diff of a staged proposal. PURE view
 * (props only): the section owns store wiring. Apply is explicit; cancel
 * restores nothing because the preview never touched the recipe (§19.2).
 */
import { cn } from '@/lib/cn';
import {
  constraintStudioCopy as copy,
  formatGramsDeltaPl,
  formatGramsPl,
} from '../constraintStudioCopy';
import type { ConstraintPreview, PreviewLineDiff } from '../applyPipeline';

function lineNote(line: PreviewLineDiff): string {
  if (line.kind === 'added') return copy.preview.added;
  if (line.kind === 'removed') return copy.preview.removed;
  if (line.kind === 'unchanged') {
    return line.locked ? copy.preview.unchangedLocked : copy.preview.unchanged;
  }
  return line.locked ? copy.preview.lockChanged : '';
}

function DiffRow({ line }: { line: PreviewLineDiff }) {
  const note = lineNote(line);
  const delta =
    line.kind === 'changed' && line.beforeGrams !== null && line.afterGrams !== null
      ? formatGramsDeltaPl(line.afterGrams - line.beforeGrams)
      : null;

  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0 truncate text-sm text-ivory">{line.name}</span>
      <span className="flex shrink-0 items-baseline gap-2 font-mono text-sm tabular-nums">
        {line.kind === 'unchanged' ? (
          <span className="text-ivory/70">{formatGramsPl(line.beforeGrams ?? 0)}</span>
        ) : (
          <>
            <span className="text-ivory/50">
              {line.beforeGrams === null ? '—' : formatGramsPl(line.beforeGrams)}
            </span>
            <span aria-hidden className="text-ivory/40">
              →
            </span>
            <span className="text-ivory">
              {line.afterGrams === null ? '—' : formatGramsPl(line.afterGrams)}
            </span>
          </>
        )}
        {delta ? <span className="text-xs text-ivory/50">{delta}</span> : null}
        {note ? (
          <span
            className={cn(
              'text-[0.65rem] tracking-[0.06em] uppercase',
              line.locked ? 'text-status-risky' : 'text-ivory/40',
            )}
          >
            {note}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function ConstraintPreviewCard({
  preview,
  onApply,
  onCancel,
}: {
  preview: ConstraintPreview;
  onApply: () => void;
  onCancel: () => void;
}) {
  const beforeBatch = preview.lines.reduce((sum, line) => sum + (line.beforeGrams ?? 0), 0);
  const afterBatch = preview.lines.reduce((sum, line) => sum + (line.afterGrams ?? 0), 0);
  const batchChanged = Math.abs(afterBatch - beforeBatch) > 0.05;
  const targetBatch = preview.proposedInput.target_batch_grams;
  // Poured actuals put the recipe in production reality — the planned-batch
  // residual is only meaningful for a purely planned recipe.
  const hasActuals = preview.proposedInput.items.some((item) => item.actual_grams !== null);
  const residualExceeded = !hasActuals && Math.abs(afterBatch - targetBatch) > 0.1;

  return (
    <section
      aria-label={copy.preview.title}
      className="rounded-md border border-ivory/20 bg-ivory/[0.04] px-4 py-4"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ivory">{copy.preview.title}</p>
        <span className="rounded border border-ivory/15 px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.08em] text-ivory/50 uppercase">
          {preview.titlePl}
        </span>
      </div>

      <div className="mt-3 divide-y divide-ivory/10">
        {preview.lines.map((line) => (
          <DiffRow key={line.lineId} line={line} />
        ))}
      </div>

      <div className="mt-3 space-y-1 border-t border-ivory/10 pt-3 text-xs text-ivory/60">
        {batchChanged ? (
          <p className="font-mono tabular-nums">
            {copy.preview.batchLine(formatGramsPl(beforeBatch), formatGramsPl(afterBatch))}
          </p>
        ) : null}
        {/* Owner P0 Phase 5 — the batch invariant, always visible. */}
        <p className="font-mono tabular-nums" data-testid="preview-totals">
          {copy.preview.totalsLine(
            formatGramsPl(beforeBatch),
            formatGramsPl(afterBatch),
            formatGramsPl(targetBatch),
          )}
        </p>
        {!hasActuals ? (
          residualExceeded ? (
            <p className="text-status-risky" data-testid="preview-residual">
              {copy.preview.residualWarning(formatGramsPl(Math.abs(afterBatch - targetBatch)))}
            </p>
          ) : (
            <p data-testid="preview-batch-ok">{copy.preview.totalsOk}</p>
          )
        ) : null}
        <p>{copy.preview.outOfBandDelta(preview.violationsBefore, preview.violationsAfter)}</p>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onApply}
          className="inline-flex flex-1 items-center justify-center rounded-md bg-ivory px-4 py-2.5 text-sm font-medium text-shell transition-colors hover:bg-ivory/90"
        >
          {copy.preview.apply}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center rounded-md border border-ivory/20 px-4 py-2.5 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
        >
          {copy.preview.cancel}
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ivory/40">{copy.preview.applyNote}</p>
    </section>
  );
}
