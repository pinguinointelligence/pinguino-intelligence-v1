/**
 * BatchQueuePanel — batch intake queue (spec §13).
 *
 * Renders a BatchIntake verbatim: the queue in its STABLE sessionIds order
 * (positions never reshuffle), one honest outcome chip per item, a derived
 * BatchSummary line (computed from the outcomes — never a stored counter),
 * a retry-failed action and a CSV-export slot that stays honestly disabled
 * until the export function is wired at integration.
 */
import type { BatchIntake, BatchItemOutcome } from '../intakeContracts';
import { ocrCopy } from '../ocrCopy';
import { summarizeBatch } from './intakeUiSupport';

const OUTCOME_CLASS: Record<BatchItemOutcome, string> = {
  saved: 'bg-emerald-100 text-emerald-700',
  duplicate: 'bg-sky-100 text-sky-700',
  needs_review: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-stone-100 text-stone-500',
};

function OutcomeChip({ outcome }: { outcome: BatchItemOutcome }) {
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-xs ${OUTCOME_CLASS[outcome]}`}>
      {ocrCopy.batch.outcomes[outcome]}
    </span>
  );
}

export interface BatchQueuePanelProps {
  batch: BatchIntake;
  /** Optional display label per sessionId (falls back to the id itself). */
  sessionLabels?: Record<string, string>;
  onRetryFailed: () => void;
  /** CSV export slot — null keeps the button honestly disabled until wired. */
  onExportCsv: (() => void) | null;
}

export function BatchQueuePanel({ batch, sessionLabels, onRetryFailed, onExportCsv }: BatchQueuePanelProps) {
  const summary = summarizeBatch(batch);

  return (
    <section aria-label={ocrCopy.batch.title} className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
      <h3 className="font-medium">{ocrCopy.batch.title}</h3>
      <p className="mt-1 text-xs text-stone-500">{ocrCopy.batch.intro}</p>

      {batch.sessionIds.length === 0 ? (
        <p role="status" className="mt-3 text-xs text-stone-400">
          {ocrCopy.batch.empty}
        </p>
      ) : (
        <ol aria-label={ocrCopy.batch.title} className="mt-3 space-y-1.5">
          {batch.sessionIds.map((sessionId, index) => (
            <li
              key={sessionId}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-stone-100 bg-stone-50 px-3 py-1.5"
            >
              <span className="font-mono text-xs text-stone-700">
                {index + 1}. {sessionLabels?.[sessionId] ?? `${ocrCopy.batch.itemLabel} ${sessionId}`}
              </span>
              <OutcomeChip outcome={batch.outcomes[sessionId] ?? 'pending'} />
            </li>
          ))}
        </ol>
      )}

      {/* BatchSummary — derived above, announced as a status region */}
      <p role="status" className="mt-3 font-mono text-xs text-stone-600">
        {ocrCopy.batch.summaryLabels.processed} {summary.processed} ·{' '}
        {ocrCopy.batch.summaryLabels.saved} {summary.saved} ·{' '}
        {ocrCopy.batch.summaryLabels.duplicate} {summary.duplicate} ·{' '}
        {ocrCopy.batch.summaryLabels.needsReview} {summary.needsReview} ·{' '}
        {ocrCopy.batch.summaryLabels.failed} {summary.failed} ·{' '}
        {ocrCopy.batch.summaryLabels.pending} {summary.pending}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label={ocrCopy.batch.retryFailed}
          className="rounded border border-stone-300 px-3 py-1 font-mono text-xs text-stone-700 disabled:opacity-40"
          disabled={summary.failed === 0}
          onClick={onRetryFailed}
        >
          {ocrCopy.batch.retryFailed}
        </button>
        <button
          type="button"
          aria-label={ocrCopy.batch.exportCsv}
          className="rounded border border-stone-300 px-3 py-1 font-mono text-xs text-stone-700 disabled:opacity-40"
          disabled={onExportCsv === null}
          onClick={onExportCsv ?? undefined}
        >
          {ocrCopy.batch.exportCsv}
        </button>
        {onExportCsv === null ? (
          <span className="font-mono text-xs text-stone-400">{ocrCopy.batch.exportCsvPending}</span>
        ) : null}
      </div>
    </section>
  );
}
