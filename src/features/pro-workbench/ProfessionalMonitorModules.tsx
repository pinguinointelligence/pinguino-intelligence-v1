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
        className="grid size-8 cursor-help list-none place-items-center rounded-full border border-white/15 text-xs font-semibold text-white/55"
        aria-label={`Informacja: ${metric.label}`}
        title={metric.tooltip}
        data-testid={`monitor-metric-info-${metric.id}`}
      >
        ?
      </summary>
      <p className="absolute left-0 top-9 z-20 hidden w-64 rounded-[18px] border border-white/10 bg-[#24272d] p-3 text-xs font-normal leading-relaxed text-white/72 shadow-pro-e3 group-open:block">
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
      className="grid grid-cols-[minmax(8.5rem,0.9fr)_5rem_minmax(7rem,1.1fr)] items-center gap-3 border-t border-white/7 py-3 first:border-t-0 max-sm:grid-cols-[minmax(0,1fr)_5rem]"
      data-testid={`monitor-metric-${metric.id}`}
      data-raw-metric={metric.rawMetric}
      data-evaluation={reading?.state ?? 'none'}
    >
      <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-white/72">
        <span className="truncate">{metric.label}</span>
        <MetricInfo metric={metric} />
      </span>
      <span className="text-right font-mono text-sm font-medium tabular-nums text-white">
        {metric.value === null ? (reading ? '●' : '—') : formatValue(metric.value)}
        {metric.value !== null && metric.unit ? (
          <span className="ml-0.5 text-xs font-normal text-white/48">{metric.unit}</span>
        ) : null}
      </span>
      {reading ? (
        <div
          className="relative h-7 min-w-0 max-sm:col-span-2"
          role="img"
          aria-label={`${metric.label}: grafit oznacza wynik teraz, złoty środek optimum${previewPosition === undefined ? '' : ', a złoty obrys wynik Preview'}`}
        >
          <div
            className="absolute inset-x-0 top-[7px] grid h-2 grid-cols-[18fr_18fr_28fr_18fr_18fr] overflow-hidden rounded-full"
            data-testid={`monitor-range-zones-${metric.id}`}
            aria-hidden
          >
            <span className="bg-[#8f5e4d]/72" />
            <span className="bg-[#b98555]/68" />
            <span className="bg-[#d7b768]" />
            <span className="bg-[#b98555]/68" />
            <span className="bg-[#8f5e4d]/72" />
          </div>
          <span
            className="absolute top-[1px] h-5 w-1 -translate-x-1/2 rounded-full bg-white shadow-pro-e1"
            style={{ left: `${position}%` }}
            data-testid={`monitor-actual-${metric.id}`}
            data-position={position}
          />
          {previewPosition !== undefined ? (
            <span
              className="absolute top-[19px] -translate-x-1/2 whitespace-nowrap font-mono text-xs text-[#d7b768]"
              style={{ left: `${Math.max(12, Math.min(88, previewPosition))}%` }}
              data-testid={`monitor-preview-${metric.id}`}
              data-position={previewPosition}
              data-preview-value={previewMetric?.value ?? undefined}
              title="Wynik Preview"
            >
              → Po zmianie {previewMetric?.value == null ? '—' : formatValue(previewMetric.value)}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="relative h-4 min-w-0" title="Brak zatwierdzonego zakresu dla tego profilu.">
          <div className="absolute inset-x-0 top-[6px] h-1.5 rounded-full bg-white/10" />
          <span className="absolute right-0 top-0 text-xs text-white/55">?</span>
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
  const label = module.problem ? 'UWAGA' : neutral ? 'NIEOCENIONE' : golden ? 'W ZAKRESIE' : 'OCENIONE';
  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center rounded-full border px-2 text-[10px] font-semibold',
        module.problem
          ? 'border-[#e7a891]/30 bg-[#a56454]/18 text-[#f0baa6]'
          : neutral
            ? 'border-white/10 bg-white/5 text-white/65'
            : golden
              ? 'border-[#d7b768]/30 bg-[#d7b768]/10 text-[#e5cb8b]'
              : 'border-[#b9cbb1]/25 bg-[#b9cbb1]/10 text-[#cbd8c5]',
      )}
      aria-label={module.problem ? 'Wymaga uwagi' : neutral ? 'Brak oceny' : 'Stan oceniony'}
    >
      {label}
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
      <div className="px-1">
        <p className="text-xs font-semibold text-[#d7b768]">Parametry techniczne</p>
        <p className="mt-1 text-xs text-white/50">
          Środkowa złota strefa oznacza optimum; biały znacznik pokazuje aktualną recepturę.
        </p>
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
              'rounded-[20px] border px-4 py-3 shadow-pro-e0',
              index === 0 ? 'border-white/14 bg-white/[0.065]' : 'border-white/9 bg-white/[0.035]',
              module.problem ? 'border-[#a56454]/55 bg-[#a56454]/12' : '',
            )}
            data-testid={`monitor-module-${module.id}`}
            data-problem={module.problem ? 'true' : 'false'}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">{module.title}</h3>
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
                className="mt-1 border-t border-white/8 pt-1"
              >
                <summary className="cursor-pointer list-none text-right text-xs font-semibold text-white/55">
                  Szczegóły ⌄
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
