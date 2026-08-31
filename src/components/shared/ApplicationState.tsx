import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useSurfaceTone } from '@/components/ui/surface';

const stateLabel = {
  loading: 'W toku',
  empty: 'Brak danych',
  stale: 'Dane niepełne',
  error: 'Wymaga uwagi',
} as const;

/**
 * One honest routed-state surface for loading, empty, stale and failed data.
 * It is deliberately a flat communication card: one hairline, one status
 * marker and the same type rhythm as the Production visual master.
 */
export function ApplicationState({
  kind,
  title,
  body,
  action,
  className,
}: {
  kind: 'loading' | 'empty' | 'stale' | 'error';
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  const shell = useSurfaceTone() === 'shell';
  const loading = kind === 'loading';
  const error = kind === 'error';

  return (
    <section
      role={loading ? 'status' : error ? 'alert' : undefined}
      aria-live={loading || error ? 'polite' : undefined}
      aria-busy={loading || undefined}
      data-application-state={kind}
      className={cn(
        'rounded-[var(--radius-pro-studio)] border p-5 sm:p-6',
        shell ? 'border-ivory/12 bg-charcoal/20' : 'border-[var(--g-line)] bg-white',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'mt-1.5 size-2 shrink-0 rounded-full',
            loading && 'animate-pulse bg-stone-400 motion-reduce:animate-none',
            kind === 'empty' && (shell ? 'bg-ivory/35' : 'bg-stone-300'),
            kind === 'stale' && 'bg-status-risky',
            error && 'bg-status-error',
          )}
        />
        <div className="min-w-0">
          <p
            className={cn(
              'text-[10px] font-semibold tracking-[0.08em] uppercase',
              shell ? 'text-ivory/50' : 'text-[var(--g-text-secondary)]',
            )}
          >
            {stateLabel[kind]}
          </p>
          <h2 className={cn('mt-1 text-base font-semibold', shell ? 'text-ivory' : 'text-ink')}>
            {title}
          </h2>
          {body ? (
            <p
              className={cn(
                'mt-2 max-w-2xl text-sm leading-6',
                shell ? 'text-ivory-soft' : 'text-[var(--g-text-secondary)]',
              )}
            >
              {body}
            </p>
          ) : null}
          {action ? <div className="mt-5 flex flex-wrap gap-3">{action}</div> : null}
        </div>
      </div>
    </section>
  );
}
