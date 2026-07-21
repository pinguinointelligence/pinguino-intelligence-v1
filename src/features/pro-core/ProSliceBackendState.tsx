import { copy } from '@/copy/en';

const b = copy.proWorkspace.backend;

/**
 * Honest backend indicator for pro-core surfaces whose UI is not built yet (S3).
 * Shows whether the durable backend is configured, running in local-dev (not durable),
 * or unavailable — driven by the SAME resolver state the real surface will use. It never
 * claims durability the build does not have. Booleans only (no repository-mode string),
 * so the studio-boundary guard never sees a vendor-client name in a feature file.
 */
export function ProSliceBackendState({
  unavailable,
  isLocalDev,
  note,
}: {
  unavailable: boolean;
  isLocalDev: boolean;
  note: string;
}) {
  const status = unavailable ? b.unavailable : isLocalDev ? b.localDev : b.durable;
  const tone = unavailable
    ? 'border-ink/10 bg-stone-50 text-stone-600'
    : isLocalDev
      ? 'border-amber-400 bg-amber-50 text-amber-900'
      : 'border-emerald-500/30 bg-emerald-50 text-emerald-900';
  return (
    <div className="space-y-3">
      <p className="max-w-2xl text-sm leading-relaxed text-stone-600">{note}</p>
      <div
        className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${tone}`}
        data-testid="pro-slice-backend"
      >
        <span className="text-[0.6rem] tracking-label uppercase opacity-70">{b.label}</span>
        <span className="font-medium">{status}</span>
      </div>
    </div>
  );
}
