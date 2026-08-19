import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import type {
  ProfessionalMonitorMetric,
  ProfessionalMonitorModule,
} from './professionalMonitorModel';
import {
  monitorScaleGeometry,
  monitorScaleStatusText,
  type MonitorScaleModel,
} from './monitorScaleModel';

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
  model,
  previewModel,
  testId,
  label,
}: {
  model: MonitorScaleModel | null;
  previewModel?: MonitorScaleModel | null;
  testId: string;
  label: string;
}) {
  const sharedDomain =
    model && previewModel
      ? {
          min: Math.min(model.displayDomainMin, previewModel.displayDomainMin),
          max: Math.max(model.displayDomainMax, previewModel.displayDomainMax),
        }
      : null;
  const geometry = model
    ? monitorScaleGeometry(
        sharedDomain
          ? {
              ...model,
              displayDomainMin: sharedDomain.min,
              displayDomainMax: sharedDomain.max,
            }
          : model,
      )
    : null;
  const previewGeometry =
    model && previewModel
      ? monitorScaleGeometry({
          ...previewModel,
          displayDomainMin: sharedDomain!.min,
          displayDomainMax: sharedDomain!.max,
        })
      : null;
  const currentStatus = model ? monitorScaleStatusText(model.status) : 'brak danych';
  const previewStatus = model && previewModel ? monitorScaleStatusText(previewModel.status) : null;

  return (
    <div
      className="relative h-7 min-w-0"
      role="img"
      aria-label={`${label}: ${currentStatus}${previewStatus ? `; Podgląd: ${previewStatus}` : ''}`}
      data-testid={testId}
      data-scale-metric={model?.metricId ?? 'unknown'}
    >
      <span className="absolute inset-x-0 top-[13px] h-px bg-[#dfe3e8]" aria-hidden />
      {geometry ? (
        <span
          className="absolute top-[11px] h-[5px] bg-[#a8dfb1]"
          style={{
            left: `${geometry.acceptedLeftPercent}%`,
            width: `${geometry.acceptedWidthPercent}%`,
          }}
          data-testid={`${testId}-accepted`}
          aria-hidden
        />
      ) : null}
      {geometry && geometry.redLeftPercent !== null && geometry.redWidthPercent > 0 ? (
        <span
          className="absolute top-[12px] h-[3px] bg-[#ef5360]"
          style={{
            left: `${geometry.redLeftPercent}%`,
            width: `${geometry.redWidthPercent}%`,
          }}
          data-testid={`${testId}-outside-segment`}
          aria-hidden
        />
      ) : null}
      {geometry && geometry.markerPercent !== null ? (
        <span
          className="absolute top-[8px] size-3 -translate-x-1/2 rounded-full border-2 border-white bg-[#101113] shadow-sm"
          style={{ left: `${geometry.markerPercent}%` }}
          data-testid={`${testId}-actual`}
          data-position={geometry.markerPercent}
          aria-hidden
        />
      ) : null}
      {previewGeometry?.markerPercent !== null && previewGeometry?.markerPercent !== undefined ? (
        <span
          className="absolute top-[7px] size-3.5 -translate-x-1/2 rounded-full border-2 border-[#f58a07] bg-white"
          style={{ left: `${previewGeometry.markerPercent}%` }}
          data-testid={`${testId}-preview`}
          data-position={previewGeometry.markerPercent}
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
  const headlineId =
    module.id === 'freezing'
      ? 'ice_fraction'
      : module.id === 'water-solids'
        ? 'water'
        : module.id === 'fat'
          ? 'fat'
          : module.id === 'protein'
            ? 'aerating_protein'
            : module.id === 'stability'
              ? 'lactose_sandiness_risk'
              : module.primary[0]!.id;
  const metric =
    module.primary.find((candidate) => candidate.id === headlineId) ?? module.primary[0]!;
  return {
    metric,
    scaleMetric: metric,
    abbreviation: module.id === 'freezing' ? 'LÓD' : null,
  };
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
      {visibleModules.map((module) => {
        const previewModule = previewModules?.find((candidate) => candidate.id === module.id);
        const summary = summaryFor(module);
        const previewSummary = previewModule ? summaryFor(previewModule) : null;
        const detailRows = [...module.primary, ...module.secondary].filter(
          (metric) => metric.id !== summary.metric.id,
        );
        const open = expanded.includes(module.id);
        const hasDetails = detailRows.length > 0;
        return (
          <section
            key={module.id}
            className="overflow-hidden rounded-[14px] border border-ink/9 bg-white shadow-pro-e0"
            data-testid={`monitor-module-${module.id}`}
            data-problem={module.problem ? 'true' : 'false'}
            data-headline-metric={summary.metric.id}
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
                model={summary.scaleMetric.scaleModel}
                previewModel={previewSummary?.scaleMetric.scaleModel}
                testId={`monitor-scale-${module.id}`}
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
