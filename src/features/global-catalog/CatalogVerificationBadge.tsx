import { cn } from '@/lib/cn';

export type CatalogVerificationStatus = 'verified' | 'manual_unverified';

/**
 * Where a product's label data came from.
 *
 * OWNER DECISION (2026-08-30): this badge used to encode provenance as GREEN /
 * BLUE, and its own copy said so — „GREEN · dane etykiety zweryfikowane",
 * „BLUE · dane manualne, niezweryfikowane". Two problems in one: the Gellatti
 * palette has no blue (the light tone was Tailwind `slate`), and the copy
 * described the COLOUR rather than the state, which fails for anyone who cannot
 * see it and reads as internal implementation to everyone else.
 *
 * The badge now names the state and takes its colour from the product's own
 * tokens: the established green for verified, and the ATTENTION tokens for data
 * still waiting on verification — a thing the reader may want to act on.
 *
 * The verification semantics and the data behind them are unchanged; only the
 * words and the colours moved.
 *
 * Gellatti language rule this encodes: customer-facing copy describes the
 * STATE, never an internal implementation detail or a colour code.
 */
export function CatalogVerificationBadge({
  status,
  tone = 'dark',
}: {
  status: CatalogVerificationStatus;
  tone?: 'dark' | 'light';
}) {
  const verified = status === 'verified';
  const label = verified
    ? 'ZWERYFIKOWANE · dane z etykiety'
    : 'DO WERYFIKACJI · dane wprowadzone ręcznie';
  return (
    <span
      className={cn(
        'inline-flex min-h-6 shrink-0 items-center rounded-md border px-2 py-1 text-[10px] leading-none font-semibold',
        verified
          ? tone === 'dark'
            ? 'border-status-ideal/45 bg-status-ideal/12 text-[#d8e2d2]'
            : 'border-status-ideal/30 bg-status-ideal/10 text-[#46513f]'
          : tone === 'dark'
            ? 'border-[var(--g-attention-ink)]/40 bg-[var(--g-attention-ink)]/15 text-[var(--g-attention-surface)]'
            : 'border-[var(--g-attention-ink)]/25 bg-[var(--g-attention-surface)] text-[var(--g-attention-ink)]',
      )}
      data-catalog-verification={status}
      title={label}
    >
      <span aria-hidden className="mr-1">
        {verified ? '✓' : '✎'}
      </span>
      {verified ? 'Zweryfikowany' : 'Dodany manualnie'}
      <span className="sr-only"> — {label}</span>
    </span>
  );
}
