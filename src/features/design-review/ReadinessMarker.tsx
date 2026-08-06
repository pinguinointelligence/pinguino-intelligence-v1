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
}: {
  state: ReadinessState;
  details: ReadinessDetails;
  className?: string;
}) {
  const description = tooltip(details);
  return (
    <span
      title={description}
      aria-label={`${state}. ${description}`}
      data-readiness={state}
      className={cn(
        'inline-flex cursor-help items-center gap-1 rounded-sm border border-nonprod/35 bg-nonprod/[0.055] px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.08em] text-nonprod uppercase',
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
}: {
  state: ReadinessState;
  details: ReadinessDetails;
  title?: string;
  children: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'border border-nonprod/25 border-l-2 border-l-nonprod bg-nonprod/[0.025]',
        compact ? 'p-2' : 'p-3',
        className,
      )}
      data-readiness-frame={state}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {title ? <h3 className="text-xs font-semibold text-ink">{title}</h3> : <span />}
        <ReadinessBadge state={state} details={details} />
      </div>
      {children}
    </section>
  );
}
