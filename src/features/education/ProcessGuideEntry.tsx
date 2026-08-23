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
      className="flex min-h-11 w-full items-center justify-between gap-3 border border-l-2 border-ink/10 border-l-gold bg-white px-3 py-2.5 text-left transition-colors hover:border-ink/30"
      data-testid="monitor-process-guide-entry"
      data-process-status={loading ? 'loading' : classification.status}
    >
      <span className="min-w-0">
        <strong className="block text-xs font-semibold text-ink">
          {copy.entries.process.title}
        </strong>
        <span className="mt-0.5 block text-xs leading-snug text-stone-600">{status}</span>
      </span>
      <span className="shrink-0 text-right">
        {unknown ? (
          <span className="mb-0.5 block text-xs font-medium tracking-[0.04em] text-stone-500 uppercase">
            {copy.process.dataMissing}
          </span>
        ) : null}
        <span className="text-xs font-semibold text-ink">{copy.process.entryAction} →</span>
      </span>
    </button>
  );
}
