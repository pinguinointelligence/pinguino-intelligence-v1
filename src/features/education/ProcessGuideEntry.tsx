import { educationCopy as copy } from '@/copy/education.pl';
import type { HeatProcessClassification } from './processClassification';

export function ProcessGuideEntry({
  classification,
  loading,
  onOpen,
}: {
  classification: HeatProcessClassification;
  loading: boolean;
  onOpen: () => void;
}) {
  const unknown = !loading && classification.status === 'unknown';
  const status = loading
    ? copy.process.entryLoading
    : copy.process.statuses[classification.status].title;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex min-h-11 w-full items-center justify-between gap-3 border border-l-2 bg-white px-3 py-2.5 text-left transition-colors hover:border-ink/30 ${unknown ? 'border-nonprod/30 border-l-nonprod' : 'border-ink/10 border-l-gold'}`}
      data-testid="monitor-process-guide-entry"
      data-process-status={loading ? 'loading' : classification.status}
    >
      <span className="min-w-0">
        <strong className="block text-xs font-semibold text-ink">{copy.entries.process.title}</strong>
        <span className={`mt-0.5 block text-[10px] leading-snug ${unknown ? 'text-nonprod' : 'text-stone-500'}`}>
          {status}
        </span>
      </span>
      <span className="shrink-0 text-right">
        {unknown ? (
          <span
            className="mb-0.5 block text-[10px] font-semibold tracking-[0.08em] text-nonprod uppercase"
            data-readiness={copy.process.dataMissing}
          >
            {copy.process.dataMissing}
          </span>
        ) : null}
        <span className="text-[10px] font-semibold text-ink">{copy.process.entryAction} →</span>
      </span>
    </button>
  );
}
