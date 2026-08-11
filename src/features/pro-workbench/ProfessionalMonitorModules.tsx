import { cn } from '@/lib/cn';
import { actualPositionFromReading } from './recipeAxisModel';
import type {
  ProfessionalMonitorMetric,
  ProfessionalMonitorModule,
} from './professionalMonitorModel';

const formatValue = (value: number) =>
  value.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function MetricInfo({ metric }: { metric: ProfessionalMonitorMetric }) {
  return (
    <details className="group relative inline-block">
      <summary
        className="grid size-11 cursor-help list-none place-items-center rounded-full border border-ink/15 text-[10px] font-semibold text-stone-500 lg:size-8"
        aria-label={`Informacja: ${metric.label}`}
        title={metric.tooltip}
        data-testid={`monitor-metric-info-${metric.id}`}
      >
        ?
      </summary>
      <p className="absolute left-0 top-5 z-20 hidden w-56 rounded-lg border border-ink/10 bg-white p-2 text-[10px] font-normal leading-relaxed text-stone-600 shadow-pro-md group-open:block">
        {metric.tooltip}
      </p>
    </details>
  );
}
function MetricScale({
  metric,
  previewMetric,
}: {
  metric: ProfessionalMonitorMetric;
  previewMetric?: ProfessionalMonitorMetric;
}) {
  const reading = metric.reading;
  const position = actualPositionFromReading(reading ?? undefined);
  const previewPosition = previewMetric?.reading
    ? actualPositionFromReading(previewMetric.reading)
    : undefined;

  return (
    <div
      className="grid grid-cols-[minmax(7.8rem,0.9fr)_4.8rem_minmax(6.5rem,1.1fr)] items-center gap-2 border-t border-ink/6 py-2 first:border-t-0 max-sm:grid-cols-[minmax(0,1fr)_4.5rem]"
      data-testid={`monitor-metric-${metric.id}`}
      data-raw-metric={metric.rawMetric}
      data-evaluation={reading?.state ?? 'none'}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-medium text-stone-600">
        <span className="truncate">{metric.label}</span>
        <MetricInfo metric={metric} />
      </span>
      <span className="text-right font-mono text-[11px] font-medium tabular-nums text-ink">
        {metric.value === null ? (reading ? '●' : '—') : formatValue(metric.value)}
        {metric.value !== null && metric.unit ? (
          <span className="ml-0.5 text-[10px] font-normal text-stone-500">{metric.unit}</span>
        ) : null}
      </span>
      {reading ? (
        <div
          className="relative h-4 min-w-0 max-sm:col-span-2"
          role="img"
          aria-label={`${metric.label}: grafit oznacza wynik teraz, złoty środek optimum${previewPosition === undefined ? '' : ', a złoty obrys wynik Preview'}`}
        >
          <div className="absolute inset-x-0 top-[7px] h-1 rounded-full bg-stone-200" />
          <div className="absolute left-[36%] right-[36%] top-[7px] h-1 rounded-full bg-gold/26" />
          <span
            className="absolute left-1/2 top-[2px] h-3.5 w-px -translate-x-1/2 bg-gold"
            style={{ left: '50%' }}
            aria-hidden
          />
          <span
            className="absolute bottom-0 h-3 w-0.5 -translate-x-1/2 rounded-full bg-pro-graphite"
            style={{ left: `${position}%` }}
            data-testid={`monitor-actual-${metric.id}`}
            data-position={position}
          />
          {previewPosition !== undefined ? (
            <span
              className="absolute top-[2px] size-3 -translate-x-1/2 rounded-full border-2 border-gold bg-white/90"
              style={{ left: `${previewPosition}%` }}
              data-testid={`monitor-preview-${metric.id}`}
              data-position={previewPosition}
              data-preview-value={previewMetric?.value ?? undefined}
              title="Wynik Preview"
            />
          ) : null}
        </div>
      ) : (
        <div className="relative h-4 min-w-0" title="Brak zatwierdzonego zakresu dla tego profilu.">
          <div className="absolute inset-x-0 top-[6px] h-1.5 bg-stone-200" />
          <span className="absolute right-0 top-0 text-[10px] text-stone-600">?</span>
        </div>
      )}
    </div>
  );
}

function ModuleStatus({ module }: { module: ProfessionalMonitorModule }) {
  const readings = [...module.primary, ...module.secondary]
    .map((metric) => metric.reading)
    .filter((reading) => reading !== null);
  const neutral = readings.length === 0 || readings.every((reading) => reading.state === 'neutral');
  const golden = readings.length > 0 && readings.every((reading) => reading.state === 'golden');
  return (
    <span
      className={cn(
        'grid size-4 place-items-center text-[10px] font-semibold',
        module.problem
          ? 'text-status-error'
          : neutral
            ? 'text-stone-600'
            : golden
              ? 'text-gold-deep'
              : 'text-status-ideal',
      )}
      aria-label={module.problem ? 'Wymaga uwagi' : neutral ? 'Brak oceny' : 'Stan oceniony'}
    >
      {module.problem ? '!' : neutral ? '?' : '●'}
    </span>
  );
}

export function ProfessionalMonitorModules({
  modules,
  previewModules,
}: {
  modules: readonly ProfessionalMonitorModule[];
  previewModules?: readonly ProfessionalMonitorModule[];
}) {
  return (
    <div className="space-y-3" data-testid="monitor-technology-modules">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-semibold tracking-[0.1em] text-stone-500 uppercase">Parametry techniczne</p>
        <div className="flex items-center gap-3 text-[10px] text-stone-500" aria-label="Legenda monitora">
          <span className="flex items-center gap-1"><i className="h-3 w-0.5 rounded-full bg-pro-graphite" />Teraz</span>
          <span className="flex items-center gap-1"><i className="h-3 w-px bg-gold" />Złoty środek</span>
          {previewModules ? (
            <span className="flex items-center gap-1"><i className="size-2.5 rounded-full border-2 border-gold" />Preview</span>
          ) : null}
        </div>
      </div>
      {modules.map((module, index) => {
        const previewModule = previewModules?.find((candidate) => candidate.id === module.id);
        const previewMetricFor = (metricId: string) =>
          [...(previewModule?.primary ?? []), ...(previewModule?.secondary ?? [])].find(
            (candidate) => candidate.id === metricId,
          );
        return (
        <section
          key={module.id}
          className={cn(
            'px-3 py-2.5',
            index === 0 || module.problem ? 'pro-module' : 'pro-module-flat',
            module.problem ? 'border-status-error/35 bg-pro-terracotta/30' : '',
          )}
          data-testid={`monitor-module-${module.id}`}
          data-problem={module.problem ? 'true' : 'false'}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[10px] font-semibold tracking-[0.08em] text-ink uppercase">
              {module.title}
            </h3>
            <ModuleStatus module={module} />
          </div>
          <div className="mt-1">
            {module.primary.map((metric) => (
              <MetricScale
                key={metric.id}
                metric={metric}
                previewMetric={previewMetricFor(metric.id)}
              />
            ))}
          </div>
          {module.secondary.length > 0 ? (
            <details
              open={module.problem}
              data-testid={`monitor-module-details-${module.id}`}
              className="mt-1 border-t border-ink/8 pt-1"
            >
              <summary className="cursor-pointer list-none text-right text-[10px] font-semibold tracking-[0.06em] text-stone-500 uppercase">
                Szczegóły⌄
              </summary>
              <div className="mt-1">
                {module.secondary.map((metric) => (
                  <MetricScale
                    key={metric.id}
                    metric={metric}
                    previewMetric={previewMetricFor(metric.id)}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </section>
        );
      })}
    </div>
  );
}
