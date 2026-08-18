import { useEffect, useMemo, useState } from 'react';
import type { GoldenRangeReading } from '@/features/recipe-score';
import { cn } from '@/lib/cn';
import { actualPositionFromReading } from './recipeAxisModel';
import type {
  ProfessionalMonitorMetric,
  ProfessionalMonitorModule,
} from './professionalMonitorModel';

const STORAGE_KEY = 'pinguino:pro-monitor-expanded:v1';

const formatValue = (value: number) =>
  value.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const ICON: Record<string, string> = {
  freezing: '❄',
  'water-solids': '◉',
  fat: '◇',
  protein: '⌘',
  stability: '♧',
};

const ACCENT: Record<string, string> = {
  freezing: 'text-[#1676f3]',
  'water-solids': 'text-[#1676f3]',
  fat: 'text-[#f58a07]',
  protein: 'text-[#bb1684]',
  stability: 'text-[#18a83a]',
};

function initialExpanded(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function MonitorRangeScale({
  reading,
  previewReading,
  testId,
  tolerance = 26,
  label,
}: {
  reading: GoldenRangeReading | null;
  previewReading?: GoldenRangeReading | null;
  testId: string;
  tolerance?: number;
  label: string;
}) {
  const position = actualPositionFromReading(reading ?? undefined);
  const previewPosition = previewReading ? actualPositionFromReading(previewReading) : undefined;
  const start = 50 - tolerance / 2;
  const end = 50 + tolerance / 2;
  const redStart = position < start ? position : end;
  const redWidth = position < start ? start - position : position > end ? position - end : 0;

  return (
    <div
      className="relative h-7 min-w-0"
      role="img"
      aria-label={`${label}: ${reading?.text ?? 'brak oceny'}`}
      data-testid={testId}
      data-scale-center="50"
      data-scale-start="0"
      data-scale-end="100"
    >
      <span className="absolute inset-x-0 top-[13px] h-px bg-[#dfe3e8]" aria-hidden />
      <span
        className="absolute top-[11px] h-[5px] bg-[#a8dfb1]"
        style={{ left: `${start}%`, width: `${tolerance}%` }}
        data-testid={`${testId}-accepted`}
        aria-hidden
      />
      {redWidth > 0 ? (
        <span
          className="absolute top-[12px] h-[3px] bg-[#ef5360]"
          style={{ left: `${redStart}%`, width: `${redWidth}%` }}
          data-testid={`${testId}-outside-segment`}
          aria-hidden
        />
      ) : null}
      <span
        className="absolute top-[8px] size-3 -translate-x-1/2 rounded-full border-2 border-white bg-[#101113] shadow-sm"
        style={{ left: `${position}%` }}
        data-testid={`${testId}-actual`}
        data-position={position}
        aria-hidden
      />
      {previewPosition !== undefined ? (
        <span
          className="absolute top-[7px] size-3.5 -translate-x-1/2 rounded-full border-2 border-[#f58a07] bg-white"
          style={{ left: `${previewPosition}%` }}
          data-testid={`${testId}-preview`}
          data-position={previewPosition}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

function MetricDetail({ metric }: { metric: ProfessionalMonitorMetric }) {
  return (
    <div
      className="monitor-detail-row grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-ink/7 py-2 first:border-0"
      data-testid={`monitor-metric-${metric.id}`}
      data-raw-metric={metric.rawMetric}
      data-evaluation={metric.reading?.state ?? 'none'}
      title={metric.tooltip}
    >
      <span className="min-w-0 text-xs text-stone-600">{metric.label}</span>
      <span className="font-mono text-xs font-semibold tabular-nums text-ink">
        {metric.value === null ? '—' : formatValue(metric.value)}
        {metric.value !== null && metric.unit ? ` ${metric.unit}` : ''}
      </span>
    </div>
  );
}

function summaryFor(module: ProfessionalMonitorModule): {
  metric: ProfessionalMonitorMetric;
  scaleMetric: ProfessionalMonitorMetric;
  abbreviation: string | null;
} {
  if (module.id === 'freezing') {
    return {
      metric: module.primary.find((metric) => metric.id === 'pac') ?? module.primary[0]!,
      scaleMetric:
        module.primary.find((metric) => metric.id === 'ice_fraction') ?? module.primary[0]!,
      abbreviation: 'PAC',
    };
  }
  const metric =
    module.primary.find((candidate) => candidate.value !== null && candidate.reading !== null) ??
    module.primary.find((candidate) => candidate.value !== null) ??
    module.primary[0]!;
  return { metric, scaleMetric: metric, abbreviation: null };
}

export function ProfessionalMonitorModules({
  modules,
  previewModules,
}: {
  modules: readonly ProfessionalMonitorModule[];
  previewModules?: readonly ProfessionalMonitorModule[];
}) {
  const visibleModules = useMemo(
    () => modules.filter((module) => module.id !== 'sugars'),
    [modules],
  );
  const [expanded, setExpanded] = useState<string[]>(initialExpanded);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(expanded));
  }, [expanded]);

  return (
    <div className="space-y-2" data-testid="monitor-technology-modules">
      {visibleModules.map((module, index) => {
        const previewModule = previewModules?.find((candidate) => candidate.id === module.id);
        const summary = summaryFor(module);
        const previewSummary = previewModule ? summaryFor(previewModule) : null;
        const detailRows = [...module.primary, ...module.secondary].filter(
          (metric) => metric.id !== summary.metric.id,
        );
        const open = expanded.includes(module.id);
        const hasDetails = detailRows.length > 0;
        const tolerance = Math.max(20, 32 - index * 2);
        return (
          <section
            key={module.id}
            className="overflow-hidden rounded-[14px] border border-ink/9 bg-white shadow-pro-e0"
            data-testid={`monitor-module-${module.id}`}
            data-problem={module.problem ? 'true' : 'false'}
          >
            <button
              type="button"
              disabled={!hasDetails}
              aria-expanded={hasDetails ? open : undefined}
              aria-controls={hasDetails ? `monitor-details-${module.id}` : undefined}
              onClick={() =>
                setExpanded((current) =>
                  current.includes(module.id)
                    ? current.filter((id) => id !== module.id)
                    : [...current, module.id],
                )
              }
              className="monitor-summary-grid pro-focus-ring grid min-h-[86px] w-full items-center gap-3 px-3 py-3 text-left disabled:cursor-default"
            >
              <span
                aria-hidden
                className={cn(
                  'grid size-8 place-items-center text-xl font-semibold',
                  ACCENT[module.id] ?? 'text-ink',
                )}
              >
                {ICON[module.id] ?? '•'}
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-sm font-semibold text-ink">
                  {module.title}
                </strong>
              </span>
              <MonitorRangeScale
                reading={summary.scaleMetric.reading}
                previewReading={previewSummary?.scaleMetric.reading}
                testId={`monitor-scale-${module.id}`}
                tolerance={tolerance}
                label={module.title}
              />
              <span className="flex min-w-0 items-center justify-end gap-2 text-right">
                {summary.abbreviation ? (
                  <span className="rounded-[8px] border border-ink/8 bg-stone-50 px-2 py-1 text-[10px] font-semibold text-ink">
                    {summary.abbreviation}
                  </span>
                ) : null}
                <span className="font-mono text-sm font-semibold tabular-nums text-ink">
                  {summary.metric.value === null ? '—' : formatValue(summary.metric.value)}
                </span>
              </span>
              {hasDetails ? (
                <span
                  aria-hidden
                  className={cn(
                    'text-lg text-stone-600 transition-transform',
                    open && 'rotate-180',
                  )}
                >
                  ⌄
                </span>
              ) : (
                <span aria-hidden />
              )}
            </button>
            {open && hasDetails ? (
              <div
                id={`monitor-details-${module.id}`}
                className="border-t border-ink/8 bg-stone-50/60 px-4 py-2"
                data-testid={`monitor-module-details-${module.id}`}
              >
                {detailRows.map((metric) => (
                  <MetricDetail key={metric.id} metric={metric} />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
