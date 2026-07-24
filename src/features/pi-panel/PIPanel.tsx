import { EmptyState } from '@/components/shared/EmptyState';
import { IndicatorBar } from '@/components/shared/IndicatorBar';
import { MetricValue } from '@/components/shared/MetricValue';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { StatusChip } from '@/components/shared/StatusChip';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { copy } from '@/copy/en';
import type { RecipeResult } from '@/engine';
import {
  buildFallbackNotes,
  buildIndicatorRows,
  buildWarnings,
  type IndicatorGroup,
  type IndicatorRowView,
} from './indicatorView';

const pi = copy.studio.pi;

const GROUP_ORDER: IndicatorGroup[] = ['freezing', 'balance', 'risk'];

const WARNING_DOT = {
  info: 'bg-ivory/40',
  warning: 'bg-status-risky',
  critical: 'bg-status-error',
} as const;

const WARNING_TONE = {
  info: 'text-ivory/65',
  warning: 'text-status-risky',
  critical: 'text-status-error',
} as const;

function IndicatorRowItem({ row }: { row: IndicatorRowView }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ivory/70">{row.label}</span>
        <span className="flex items-center gap-2.5">
          {row.value === null ? (
            <span className="font-mono text-sm text-ivory/60">—</span>
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
  );
}

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
      <p className="mt-2 text-xs leading-relaxed text-ivory/60">{pi.note}</p>

      {fallbackNotes.length > 0 ? (
        <div className="mt-4 rounded-md border border-ivory/15 bg-ivory/[0.06] px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-[0.625rem] font-medium tracking-label text-ivory/65 uppercase">
            <span className="size-1.5 rounded-full bg-status-ideal" />
            {pi.calibration}
          </span>
          {fallbackNotes.map((note) => (
            <p key={note} className="mt-1 text-xs leading-relaxed text-ivory/60">
              {note}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-6 space-y-6">
        {GROUP_ORDER.map((group) => {
          const groupRows = rows.filter((row) => row.group === group);
          if (groupRows.length === 0) return null;
          return (
            <div key={group}>
              <SectionLabel className="text-[0.625rem]">{pi.groups[group]}</SectionLabel>
              <div className="mt-3 space-y-5">
                {groupRows.map((row) => (
                  <IndicatorRowItem key={row.key} row={row} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {warnings.length > 0 ? (
        <ul className="mt-6 space-y-2 border-t border-ivory/10 pt-4">
          {warnings.map((warning) => (
            <li key={warning.code} className="flex items-start gap-2">
              <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', WARNING_DOT[warning.severity])} />
              <span className={cn('text-xs leading-relaxed', WARNING_TONE[warning.severity])}>
                {warning.message}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
