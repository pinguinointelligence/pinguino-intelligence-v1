import { EmptyState } from '@/components/shared/EmptyState';
import { IndicatorBar } from '@/components/shared/IndicatorBar';
import { MetricValue } from '@/components/shared/MetricValue';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { StatusChip } from '@/components/shared/StatusChip';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { copy } from '@/copy/en';
import type { RecipeResult } from '@/engine';
import { buildFallbackNotes, buildIndicatorRows, buildWarnings } from './indicatorView';

const pi = copy.studio.pi;

const WARNING_TONE = {
  info: 'text-stone-500',
  warning: 'text-status-risky',
  critical: 'text-status-error',
} as const;

export function PIPanel({ result }: { result: RecipeResult }) {
  if (result.total_batch_g <= 0) {
    return (
      <Card padding="lg">
        <SectionLabel>{pi.title}</SectionLabel>
        <EmptyState className="mt-5 border-0 px-0 py-8" title={copy.studio.builder.empty} />
      </Card>
    );
  }

  const rows = buildIndicatorRows(result);
  const fallbackNotes = buildFallbackNotes(result);
  const warnings = buildWarnings(result);

  return (
    <Card padding="lg">
      <SectionLabel>{pi.title}</SectionLabel>
      <p className="mt-2 text-xs leading-relaxed text-stone-400">{pi.note}</p>

      <div className="mt-6 space-y-5">
        {rows.map((row) => (
          <div key={row.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-stone-600">{row.label}</span>
              <span className="flex items-center gap-2.5">
                {row.value === null ? (
                  <span className="font-mono text-sm text-stone-400">—</span>
                ) : (
                  <MetricValue value={row.value} unit={row.unit} size="sm" />
                )}
                <StatusChip status={row.status} />
              </span>
            </div>
            <IndicatorBar
              className="mt-2"
              label={row.label}
              min={row.displayMin}
              max={row.displayMax}
              value={row.value ?? row.displayMin}
              targetMin={row.targetMin ?? undefined}
              targetMax={row.targetMax ?? undefined}
              status={row.status}
            />
          </div>
        ))}
      </div>

      {fallbackNotes.length > 0 ? (
        <div className="mt-6 space-y-1.5 border-t border-ink/5 pt-4">
          {fallbackNotes.map((note) => (
            <p key={note} className="text-xs leading-relaxed text-stone-500">
              {note}
            </p>
          ))}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {warnings.map((warning) => (
            <li
              key={warning.code}
              className={cn('text-xs leading-relaxed', WARNING_TONE[warning.severity])}
            >
              {warning.message}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
