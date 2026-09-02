import { cn } from '@/lib/cn';

export type CatalogVerificationStatus = 'verified' | 'manual_unverified';

export function CatalogVerificationBadge({
  status,
  tone = 'dark',
}: {
  status: CatalogVerificationStatus;
  tone?: 'dark' | 'light';
}) {
  const verified = status === 'verified';
  const label = verified
    ? 'GREEN · dane etykiety zweryfikowane'
    : 'BLUE · dane manualne, niezweryfikowane';
  return (
    <span
      className={cn(
        'inline-flex min-h-6 shrink-0 items-center rounded-md border px-2 py-1 text-[10px] font-semibold leading-none',
        verified
          ? tone === 'dark'
            ? 'border-status-ideal/45 bg-status-ideal/12 text-[#d8e2d2]'
            : 'border-status-ideal/30 bg-status-ideal/10 text-[#46513f]'
          : tone === 'dark'
            ? 'border-[#a9b4c7]/35 bg-[#a9b4c7]/12 text-[#dbe3ef]'
            : 'border-slate-300 bg-slate-100 text-slate-700',
      )}
      data-catalog-verification={status}
      title={label}
    >
      <span aria-hidden className="mr-1">{verified ? '✓' : '✎'}</span>
      {verified ? 'Zweryfikowany' : 'Dodany manualnie'}
      <span className="sr-only"> — {label}</span>
    </span>
  );
}
