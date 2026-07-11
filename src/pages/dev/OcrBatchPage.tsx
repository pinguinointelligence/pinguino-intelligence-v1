/**
 * DEV-ONLY batch OCR intake queue (route: /dev/ocr-batch).
 *
 * Renders the contract-typed BatchQueuePanel: stable session ordering, honest
 * per-item outcome chips, a derived BatchSummary (never a stored counter),
 * retry-failed and the CSV-export slot. Runs on clearly-labelled SAMPLE data
 * until the real batch runner wires in through BatchWiring — nothing here
 * processes, uploads or saves anything.
 *
 * Boundaries (OcrBatchPage.test.tsx): DEV-only; NO service import, NO DB
 * write, NO OCR engine, no paid API.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ocrCopy } from '@/features/ocr-intake/ocrCopy';
import type { BatchIntake, BatchItemOutcome } from '@/features/ocr-intake/intakeContracts';
import { BatchQueuePanel } from '@/features/ocr-intake/ui/BatchQueuePanel';
import { createDemoBatch } from '@/features/ocr-intake/ui/demoSession';

/**
 * Injection seam for the batch experience — function types built ONLY from
 * the shared contract; null until the orchestrator wires the real modules.
 */
export interface BatchWiring {
  /** INTEGRATION POINT (track H): re-queue the failed sessions for real. */
  retryFailed: ((batch: BatchIntake) => BatchIntake) | null;
  /** INTEGRATION POINT (orchestrator): real CSV export of the batch outcomes. */
  exportCsv: ((batch: BatchIntake) => void) | null;
}

const UNWIRED: BatchWiring = { retryFailed: null, exportCsv: null };

const DEMO = createDemoBatch();

/** Standalone fallback: failed items simply re-queue as pending (no engine). */
function requeueFailedLocally(batch: BatchIntake): BatchIntake {
  const outcomes: Record<string, BatchItemOutcome> = {};
  for (const sessionId of batch.sessionIds) {
    const outcome = batch.outcomes[sessionId] ?? 'pending';
    outcomes[sessionId] = outcome === 'failed' ? 'pending' : outcome;
  }
  return { ...batch, outcomes };
}

export function OcrBatchPage({ wiring = UNWIRED }: { wiring?: BatchWiring } = {}) {
  const [batch, setBatch] = useState<BatchIntake>(DEMO.batch);

  if (!import.meta.env.DEV) return <NotFoundPage />;

  const onRetryFailed = () =>
    setBatch((prev) => (wiring.retryFailed ?? requeueFailedLocally)(prev));

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-paper px-6 py-16 text-ink">
      <p className="font-mono text-xs uppercase tracking-wide text-stone-400">DEV · internal</p>
      <h1 className="mt-3 text-2xl font-light tracking-tight">{ocrCopy.batch.title}</h1>
      <p className="mt-2 text-sm text-stone-600">{ocrCopy.batch.intro}</p>
      <p
        role="status"
        className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
      >
        {ocrCopy.session.demoNote}
      </p>

      <div className="mt-6">
        <BatchQueuePanel
          batch={batch}
          sessionLabels={DEMO.sessionLabels}
          onRetryFailed={onRetryFailed}
          onExportCsv={wiring.exportCsv === null ? null : () => wiring.exportCsv?.(batch)}
        />
      </div>

      <p className="mt-6">
        <Link to="/dev/ocr-intake" className="font-mono text-xs text-sky-700 underline">
          ← {ocrCopy.page.title}
        </Link>
      </p>
    </div>
  );
}
