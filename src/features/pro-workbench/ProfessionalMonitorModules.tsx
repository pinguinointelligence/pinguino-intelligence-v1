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
        className="grid size-4 cursor-help list-none place-items-center rounded-full border border-ink/15 text-[9px] font-semibold text-stone-500"
        aria-label={`Informacja: ${metric.label}`}
        title={metric.tooltip}
        data-testid={`monitor-metric-info-${metric.id}`}
      >
        ?
      </summary>
      <p className="absolute left-0 top-5 z-20 hidden w-56 border border-ink/10 bg-white p-2 text-[10px] font-normal leading-relaxed text-stone-600 shadow-[0_8px_24px_rgba(16,17,19,0.12)] group-open:block">
        {metric.tooltip}
      </p>
    </details>
  );
}
function MetricScale({ metric }: { metric: ProfessionalMonitorMetric }) {
  const reading = metric.reading;
  const position = actualPositionFromReading(reading ?? undefined);
  const markerTone =
    reading?.state === 'golden'
      ? 'border-gold bg-gold'
      : reading?.state === 'red'
        ? 'border-status-error bg-status-error'
        : reading
          ? 'border-status-ideal bg-status-ideal'
          : 'border-stone-400 bg-stone-400';

  return (
    <div
      className="grid grid-cols-[minmax(7.8rem,0.9fr)_4.8rem_minmax(6.5rem,1.1fr)] items-center gap-2 border-t border-ink/6 py-1.5 first:border-t-0"
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
          <span className="ml-0.5 text-[9px] font-normal text-stone-500">{metric.unit}</span>
        ) : null}
      </span>
      {reading ? (
        <div
          className="relative h-4 min-w-0"
          role="img"
          aria-label={`${metric.label}: pozycja aktualnego wyniku względem złotego środka`}
        >
          <div className="absolute inset-x-0 top-[6px] grid h-1.5 grid-cols-5 overflow-hidden">
            <span className="bg-status-error/20" />
            <span className="bg-status-ideal/28" />
            <span className="bg-gold/34" />
            <span className="bg-status-ideal/28" />
            <span className="bg-status-error/20" />
          </div>
          <span
            className="absolute top-[3px] size-2.5 -translate-x-1/2 rotate-45 border border-gold bg-gold/90"
            style={{ left: '50%' }}
            aria-hidden
          />
          <span
            className={cn(
              'absolute bottom-0 size-2 -translate-x-1/2 rotate-45 border shadow-[0_0_0_2px_rgba(255,255,255,0.9)]',
              markerTone,
            )}
            style={{ left: `${position}%` }}
            data-testid={`monitor-actual-${metric.id}`}
            data-position={position}
          />
        </div>
      ) : (
        <div className="relative h-4 min-w-0" title="Brak zatwierdzonego zakresu dla tego profilu.">
          <div className="absolute inset-x-0 top-[6px] h-1.5 bg-stone-200" />
          <span className="absolute right-0 top-0 text-[10px] text-stone-400">?</span>
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
            ? 'text-stone-400'
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
}: {
  modules: readonly ProfessionalMonitorModule[];
}) {
  return (
    <div className="space-y-2" data-testid="monitor-technology-modules">
      {modules.map((module) => (
        <section
          key={module.id}
          className={cn(
            'border bg-white px-3 py-2',
            module.problem ? 'border-status-error/30' : 'border-ink/10',
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
              <MetricScale key={metric.id} metric={metric} />
            ))}
          </div>
          {module.secondary.length > 0 ? (
            <details
              open={module.problem}
              data-testid={`monitor-module-details-${module.id}`}
              className="mt-1 border-t border-ink/8 pt-1"
            >
              <summary className="cursor-pointer list-none text-right text-[9px] font-semibold tracking-[0.06em] text-stone-500 uppercase">
                Szczegóły⌄
              </summary>
              <div className="mt-1">
                {module.secondary.map((metric) => (
                  <MetricScale key={metric.id} metric={metric} />
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ))}
    </div>
  );
}
