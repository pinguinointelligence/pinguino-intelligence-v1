/**
 * DuplicatePanel — duplicate assessment (spec §10).
 *
 * Renders a DuplicateAssessment verbatim: verdict, every reason that fired,
 * and ONLY the actions the locked identity rules allow for this verdict —
 * a disallowed action is never rendered (not merely disabled).
 */
import type { DuplicateAssessment } from '../intakeContracts';
import { ocrCopy } from '../ocrCopy';

const VERDICT_CLASS: Record<DuplicateAssessment['verdict'], string> = {
  exact_duplicate: 'bg-red-100 text-red-700',
  likely_duplicate: 'bg-amber-100 text-amber-700',
  new_product: 'bg-emerald-100 text-emerald-700',
};

export interface DuplicatePanelProps {
  assessment: DuplicateAssessment;
  onAction: (action: DuplicateAssessment['allowedActions'][number]) => void;
}

export function DuplicatePanel({ assessment, onAction }: DuplicatePanelProps) {
  return (
    <section aria-label={ocrCopy.duplicate.title} className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{ocrCopy.duplicate.title}</h3>
        <span
          role="status"
          className={`rounded px-1.5 py-0.5 font-mono text-xs ${VERDICT_CLASS[assessment.verdict]}`}
        >
          {ocrCopy.duplicate.verdicts[assessment.verdict]}
        </span>
      </div>
      <p className="mt-1 text-xs text-stone-600">{ocrCopy.duplicate.verdictNotes[assessment.verdict]}</p>

      {assessment.reasons.length > 0 ? (
        <ul aria-label={ocrCopy.duplicate.title} className="mt-2 list-disc pl-4 text-xs text-stone-600">
          {assessment.reasons.map((reason, index) => (
            <li key={index} className="font-mono">
              {ocrCopy.duplicate.reasons[reason.check]} · {ocrCopy.duplicate.existingProduct}{' '}
              {reason.existingProductId}
              {reason.check === 'normalized_identity_match'
                ? ` · ${ocrCopy.duplicate.score} ${reason.score}`
                : ''}
            </li>
          ))}
        </ul>
      ) : null}

      {/* ONLY the allowed actions render — never a disabled forbidden action */}
      <div className="mt-3 flex flex-wrap gap-2">
        {assessment.allowedActions.map((action) => (
          <button
            key={action}
            type="button"
            aria-label={ocrCopy.duplicate.actions[action]}
            className="rounded border border-stone-300 px-3 py-1 font-mono text-xs text-stone-700"
            onClick={() => onAction(action)}
          >
            {ocrCopy.duplicate.actions[action]}
          </button>
        ))}
      </div>
    </section>
  );
}
