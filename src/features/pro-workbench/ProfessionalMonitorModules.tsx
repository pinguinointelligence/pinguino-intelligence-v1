import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  FatCreaminessIcon,
  FreezingIcon,
  ProteinStructureIcon,
  StabilityRisksIcon,
  SweetnessIcon,
  WaterSolidsIcon,
  type PinguinoIconProps,
} from '@/components/icons/PinguinoIcons';
import { PINGUINO_ICON_CIRCLE } from '@/components/icons/pinguinoIconTokens';
import {
  formatMonitorValue,
  type ProfessionalMonitorMetric,
  type ProfessionalMonitorModule,
} from './professionalMonitorModel';
import {
  monitorScaleGeometry,
  monitorScaleStatusText,
  type MonitorScaleModel,
} from './monitorScaleModel';

const STORAGE_KEY = 'pinguino:pro-monitor-expanded:v1';

const metricValueText = (metric: ProfessionalMonitorMetric): string => {
  if (metric.displayText !== undefined) return metric.displayText;
  if (metric.value === null) return '—';
  return `${formatMonitorValue(metric.value)}${metric.unit ? ` ${metric.unit}` : ''}`;
};

/**
 * The approved PINGÜINO Monitor marks (owner reference sheet, 2026-08-24).
 *
 * These were Unicode glyphs — ❄ ◉ ◇ ⌘ ♧ — so the Monitor rendered in whatever
 * symbol font the device happened to have, at whatever weight that font chose.
 * They are now the shared vector set, which carries its own approved colour, so
 * the `ACCENT` text-colour map they needed is gone with them.
 */
const ICON: Record<string, (props: PinguinoIconProps) => React.ReactElement> = {
  freezing: FreezingIcon,
  sugars: SweetnessIcon,
  'water-solids': WaterSolidsIcon,
  fat: FatCreaminessIcon,
  protein: ProteinStructureIcon,
  stability: StabilityRisksIcon,
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
      className="monitor-detail-row monitor-detail-grid grid gap-2 border-t border-ink/7 py-2 first:border-0"
      data-testid={`monitor-metric-${metric.id}`}
      data-raw-metric={metric.rawMetric}
      data-evaluation={metric.reading?.state ?? 'none'}
      data-domain-status={metric.domainStatus}
      title={metric.tooltip}
    >
      <span className="col-start-2 col-end-5 min-w-0 text-xs text-stone-600">{metric.label}</span>
      <span
        className={cn(
          'monitor-value-column col-start-5 text-right text-xs font-semibold leading-tight text-ink',
          metric.displayText === undefined && 'font-mono tabular-nums',
        )}
      >
        {metricValueText(metric)}
      </span>
      <span aria-hidden className="col-start-6" />
    </div>
  );
}

function summaryFor(module: ProfessionalMonitorModule): {
  metric: ProfessionalMonitorMetric;
  scaleMetric: ProfessionalMonitorMetric;
  secondaryMetric: ProfessionalMonitorMetric | null;
} {
  const headlineId =
    module.id === 'freezing'
      ? 'pac'
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
    scaleMetric:
      module.id === 'freezing'
        ? (module.primary.find((candidate) => candidate.id === 'ice_fraction') ?? metric)
        : metric,
    secondaryMetric:
      module.id === 'freezing'
        ? (module.primary.find((candidate) => candidate.id === 'ice_fraction') ?? null)
        : null,
  };
}

export function ProfessionalMonitorModules({
  modules,
  previewModules,
  embedded = false,
}: {
  modules: readonly ProfessionalMonitorModule[];
  previewModules?: readonly ProfessionalMonitorModule[];
  embedded?: boolean;
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
    <div
      className={cn(
        'divide-y divide-ink/8 bg-white',
        !embedded && 'overflow-hidden rounded-[14px] border border-ink/9',
      )}
      data-testid="monitor-technology-modules"
      data-monitor-embedded={embedded ? 'true' : 'false'}
    >
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
            className={cn('overflow-hidden', open ? 'bg-pro-warm/70' : 'bg-white')}
            data-testid={`monitor-module-${module.id}`}
            data-problem={module.problem ? 'true' : 'false'}
            data-headline-metric={summary.metric.id}
            data-headline-label={summary.metric.label}
            data-headline-unit={summary.metric.unit || undefined}
            data-secondary-metric={summary.secondaryMetric?.id}
            data-secondary-label={summary.secondaryMetric?.label}
            data-secondary-unit={summary.secondaryMetric?.unit || undefined}
            data-expanded={open ? 'true' : 'false'}
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
              className="monitor-module-row monitor-summary-grid pro-focus-ring grid w-full items-center gap-2 px-3 py-2 text-left disabled:cursor-default"
            >
              {/* The approved pale circular container from the reference sheet:
                  a premium indicator, never a dashboard button. */}
              <span aria-hidden className={cn('size-8', PINGUINO_ICON_CIRCLE)}>
                {(() => {
                  const ModuleIcon = ICON[module.id];
                  return ModuleIcon ? <ModuleIcon className="size-[18px]" /> : null;
                })()}
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-sm font-semibold text-ink">
                  {module.title}
                </strong>
                {module.id !== 'freezing' ? (
                  <span className="mt-0.5 block truncate text-[10px] text-stone-600">
                    {summary.metric.label}
                  </span>
                ) : null}
              </span>
              <span
                className="monitor-badge justify-self-start rounded-[8px] border border-ink/8 bg-stone-50 px-2 py-1 text-[10px] font-semibold text-ink empty:border-0 empty:bg-transparent empty:p-0"
                data-monitor-badge={module.id === 'freezing' ? summary.metric.label : ''}
                aria-hidden={module.id !== 'freezing'}
              >
                {module.id === 'freezing' ? summary.metric.label : null}
              </span>
              <div data-monitor-rail={module.id}>
                <MonitorRangeScale
                  model={summary.scaleMetric.scaleModel}
                  previewModel={previewSummary?.scaleMetric.scaleModel}
                  testId={`monitor-scale-${module.id}`}
                  label={module.title}
                />
              </div>
              <span
                className={cn(
                  'monitor-value-column text-right text-sm font-semibold text-ink',
                  summary.metric.displayText === undefined && 'font-mono tabular-nums',
                )}
                data-monitor-value={module.id}
              >
                {metricValueText(summary.metric)}
              </span>
              {hasDetails ? (
                <span
                  aria-hidden
                  data-monitor-chevron={module.id}
                  className={cn(
                    'text-lg text-stone-600 transition-transform',
                    open && 'rotate-180',
                  )}
                >
                  ⌄
                </span>
              ) : (
                <span aria-hidden data-monitor-chevron="none" />
              )}
            </button>
            {open && hasDetails ? (
              <div
                id={`monitor-details-${module.id}`}
                className="border-t border-ink/8 bg-transparent px-3 py-1"
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
