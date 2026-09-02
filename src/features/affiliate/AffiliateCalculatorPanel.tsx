import { useMemo, useState } from 'react';
import { applicationFieldClasses } from '@/components/ui/applicationControlStyles';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { DestinationEyebrow } from '@/components/shared/destinationEditorial';
import { cn } from '@/lib/cn';
import { affiliateCopy } from '@/copy/affiliate';
import {
  calculateAffiliateCommission,
  isCustomTermsMode,
  type AffiliateCalculatorMode,
  type AffiliateCustomerCounts,
} from './affiliateCalculator';
import { CUSTOM_TERMS_TIER, PUBLIC_AFFILIATE_TIERS, formatEuro } from './publicRateAuthority';

const c = affiliateCopy;

/** The four inputs, in the owner's order. */
const FIELDS: ReadonlyArray<{ key: keyof AffiliateCustomerCounts; label: string }> = [
  { key: 'homeMonthly', label: c.calculator.homeMonthlyLabel },
  { key: 'proMonthly', label: c.calculator.proMonthlyLabel },
  { key: 'homeAnnual', label: c.calculator.homeAnnualLabel },
  { key: 'proAnnual', label: c.calculator.proAnnualLabel },
];

const MODE_LABEL: Record<AffiliateCalculatorMode, string> = {
  standard: c.rates.standardName,
  gold: c.rates.goldName,
  elite: c.rates.eliteName,
};

/**
 * The public commission calculator.
 *
 * Every figure comes from `calculateAffiliateCommission`, which reads the
 * ledger's own rate table. Nothing here knows a rate.
 *
 * ELITE IS A STATE, NOT A RATE. Selecting Elite replaces the whole result
 * block with the individual-terms message and a route into a conversation —
 * `calculateAffiliateCommission` is never called, and cannot be: its parameter
 * type excludes Elite.
 */
export function AffiliateCalculatorPanel({ applyHref }: { applyHref: string }) {
  const [mode, setMode] = useState<AffiliateCalculatorMode>('standard');
  // Kept as raw strings so the field can legitimately be empty while typing;
  // the domain normalises whatever this holds.
  const [raw, setRaw] = useState<Record<keyof AffiliateCustomerCounts, string>>({
    homeMonthly: '',
    homeAnnual: '',
    proMonthly: '',
    proAnnual: '',
  });

  const custom = isCustomTermsMode(mode);

  const estimate = useMemo(
    () => (custom ? null : calculateAffiliateCommission(mode, raw)),
    [custom, mode, raw],
  );

  const rows = estimate
    ? ([
        [c.calculator.monthlyFromMonthly, estimate.monthlyFromMonthlyCents],
        [c.calculator.fromAnnualRenewals, estimate.fromAnnualRenewalsCents],
        [c.calculator.totalPerYear, estimate.totalPerYearCents],
        [c.calculator.averagePerMonth, estimate.averagePerMonthCents],
      ] as const)
    : [];

  return (
    <div
      className="grid overflow-hidden rounded-[12px] border border-[var(--g-line)] lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.85fr)]"
      data-testid="affiliate-calculator"
    >
      {/* ── inputs ─────────────────────────────────────────────────────── */}
      <div className="bg-white p-[clamp(20px,2.6vw,32px)]">
        <DestinationEyebrow>{c.calculator.modeLabel}</DestinationEyebrow>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={c.calculator.modeLabel}>
          {[...PUBLIC_AFFILIATE_TIERS, CUSTOM_TERMS_TIER].map((entry) => {
            const active = mode === entry;
            return (
              <button
                key={entry}
                type="button"
                aria-pressed={active}
                onClick={() => setMode(entry)}
                className={cn(
                  'min-h-11 rounded-[10px] border px-4 text-sm font-semibold transition-colors',
                  active
                    ? 'border-[var(--g-ink)] bg-[var(--g-ink)] text-white'
                    : 'border-[var(--g-line)] bg-white text-[var(--g-text-secondary)] hover:border-[var(--g-ink)]/40',
                )}
              >
                {MODE_LABEL[entry]}
              </button>
            );
          })}
        </div>

        <div className={cn('mt-6', custom && 'opacity-40')}>
          <DestinationEyebrow>{c.calculator.inputsLabel}</DestinationEyebrow>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <label key={field.key} className="flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold tracking-[0.13em] text-stone-500 uppercase">
                  {field.label}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  disabled={custom}
                  value={raw[field.key]}
                  onChange={(event) => {
                    // Read the value HERE, synchronously. React nulls
                    // `currentTarget` once the handler returns, and a state
                    // updater runs later — reading it inside the updater threw
                    // and took the whole panel into the error boundary.
                    const next = event.currentTarget.value;
                    setRaw((current) => ({ ...current, [field.key]: next }));
                  }}
                  className={applicationFieldClasses()}
                  placeholder="0"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={custom}
            onClick={() =>
              setRaw({ homeMonthly: '', homeAnnual: '', proMonthly: '', proAnnual: '' })
            }
            className={cn(buttonClasses('ghost', 'sm'), 'mt-4')}
          >
            {c.calculator.reset}
          </button>
        </div>
      </div>

      {/* ── result ─────────────────────────────────────────────────────── */}
      <div className="bg-[#e7e3dd] p-[clamp(20px,2.6vw,32px)]">
        {custom ? (
          <div className="flex h-full flex-col justify-center">
            <p className="text-[clamp(20px,2vw,26px)] leading-[1.15] font-bold tracking-[-0.03em] text-[var(--g-ink)]">
              {c.calculator.eliteState}
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--g-text-secondary)]">
              {c.rates.eliteBody}
            </p>
            <a href={applyHref} className={cn(buttonClasses('primary', 'md'), 'mt-5 w-fit')}>
              {c.calculator.eliteCta}
            </a>
          </div>
        ) : (
          <>
            <dl className="grid gap-px bg-[var(--g-line)]">
              {rows.map(([label, cents], index) => {
                const total = index === 2;
                return (
                  <div key={label} className="bg-[#e7e3dd] py-3">
                    <dt className="text-[11px] leading-[1.4] text-[var(--g-text-secondary)]">
                      {label}
                    </dt>
                    <dd
                      className={cn(
                        'mt-1 font-bold tracking-[-0.03em] text-[var(--g-ink)] tabular-nums',
                        total ? 'text-[clamp(24px,2.4vw,32px)]' : 'text-[18px]',
                      )}
                    >
                      {formatEuro(cents)}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <p className="mt-4 text-[11px] leading-[1.5] text-[var(--g-text-muted)]">
              {c.calculator.assumption}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
