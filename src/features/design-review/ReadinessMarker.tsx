import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ReadinessState =
  | 'W PRZYGOTOWANIU'
  | 'TESTOWE / NIEPRODUKCYJNE'
  | 'DO PRZEGLĄDU'
  | 'CZĘŚCIOWO PODŁĄCZONE';

export interface ReadinessDetails {
  limitation: string;
  calculationImpact: string;
  remaining: string;
}

const tooltip = (details: ReadinessDetails) =>
  `Ograniczenie: ${details.limitation} Wpływ na obliczenia: ${details.calculationImpact} Do podłączenia: ${details.remaining}`;

export function ReadinessBadge({
  state,
  details,
  className,
  tone = 'light',
}: {
  state: ReadinessState;
  details: ReadinessDetails;
  className?: string;
  tone?: 'light' | 'dark';
}) {
  const description = tooltip(details);
  return (
    <span
      title={description}
      aria-label={`${state}. ${description}`}
      data-readiness={state}
      className={cn(
        'inline-flex cursor-help items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold tracking-[0.04em] uppercase',
        tone === 'dark'
          ? 'border-nonprod-soft/45 bg-nonprod-soft/10 text-nonprod-soft'
          : 'border-nonprod/35 bg-nonprod/[0.055] text-nonprod',
        className,
      )}
    >
      <span aria-hidden className="size-1 rounded-full bg-nonprod" />
      {state}
    </span>
  );
}

export function ReadinessFrame({
  state,
  details,
  title,
  children,
  compact = false,
  className,
  tone = 'light',
}: {
  state: ReadinessState;
  details: ReadinessDetails;
  title?: string;
  children: ReactNode;
  compact?: boolean;
  className?: string;
  tone?: 'light' | 'dark';
}) {
  return (
    <section
      className={cn(
        'border border-l-2',
        tone === 'dark'
          ? 'border-nonprod-soft/30 border-l-nonprod-soft bg-nonprod-soft/[0.055] text-white'
          : 'border-nonprod/25 border-l-nonprod bg-nonprod/[0.025]',
        compact ? 'p-2' : 'p-3',
        className,
      )}
      data-readiness-frame={state}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {title ? (
          <h3 className={cn('text-xs font-semibold', tone === 'dark' ? 'text-white' : 'text-ink')}>
            {title}
          </h3>
        ) : (
          <span />
        )}
        <ReadinessBadge state={state} details={details} tone={tone} />
      </div>
      {children}
    </section>
  );
}
