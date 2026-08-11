import { useMemo } from 'react';
import { calculateRecipe, type RecipeResult, type TargetMetric } from '@/engine';
import { cn } from '@/lib/cn';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { buildRecipeDirectionPlan } from '@/features/recipe-direction/recipeDirectionTargets';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { buildUserMonitorSummaryCards } from '@/features/user-monitor';
import type { GoldenRangeReading } from '@/features/recipe-score';
import { actualPositionFromReading } from './recipeAxisModel';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  useRecipeProfileStore,
  type AdjustableAxisId,
  type DirectionIntent,
} from './recipeProfileStore';

const AXES = [
  {
    id: 'sweetness',
    label: 'Słodycz',
    low: 'Mniej słodkie',
    high: 'Bardziej słodkie',
    metricLabel: 'POD',
  },
  {
    id: 'softness',
    label: 'Miękkość',
    low: 'Twardsze',
    high: 'Bardziej miękkie',
    metricLabel: 'NPAC',
  },
] as const;

const INTENT_LABEL: Record<DirectionIntent, string> = {
  [-2]: 'zdecydowanie mniej',
  [-1]: 'mniej',
  0: 'zbalansowanie',
  1: 'bardziej',
  2: 'zdecydowanie bardziej',
};

const signTarget = (value: DirectionIntent): -1 | 0 | 1 => (value < 0 ? -1 : value > 0 ? 1 : 0);

const formatMetric = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value) ? '—' : value.toFixed(2);

function DirectionPreferenceControl({
  label,
  axis,
  intent,
  onMove,
  current,
  preview,
  metricLabel,
  low,
  high,
}: {
  label: string;
  axis: AdjustableAxisId;
  intent: DirectionIntent;
  onMove: (delta: -1 | 1) => void;
  current: number | null;
  preview: number | null;
  metricLabel: string;
  low: string;
  high: string;
}) {
  return (
    <article
      className="rounded-[20px] border border-ink/10 bg-white p-3 shadow-pro-sm"
      data-testid={`direction-intent-${axis}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">{label}</h4>
        <p className="text-right text-[10px] text-stone-600" role="status" aria-live="polite">
          Wybrano: <strong className="text-ink">{INTENT_LABEL[intent]}</strong>
        </p>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] font-semibold text-stone-600">
        <span>{low}</span>
        <span>{high}</span>
      </div>
      <div className="mt-1 grid grid-cols-[44px_1fr_44px] items-center gap-2">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={intent === -2}
          aria-label={`${low} — jeden poziom`}
          className="grid size-11 place-items-center rounded-xl border border-ink/12 bg-white text-xl text-ink shadow-pro-sm disabled:opacity-30"
        >
          −
        </button>
        <div
          role="slider"
          tabIndex={0}
          aria-label={`${axis === 'sweetness' ? 'Słodycz' : 'Miękkość'} — wybrany kierunek`}
          aria-valuemin={-2}
          aria-valuemax={2}
          aria-valuenow={intent}
          aria-valuetext={`${INTENT_LABEL[intent]}, pozycja ${intent + 3} z 5`}
          aria-orientation="horizontal"
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
              event.preventDefault();
              if (intent > -2) onMove(-1);
            } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (intent < 2) onMove(1);
            }
          }}
          className="grid min-h-11 grid-cols-5 items-center gap-2 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          {([-2, -1, 0, 1, 2] as const).map((detent) => (
            <span
              key={detent}
              className={cn(
                'h-3 rounded-full border transition-all',
                detent === intent
                  ? 'scale-y-125 border-gold bg-gold shadow-pro-e1'
                  : 'border-ink/10 bg-stone-100',
              )}
              aria-hidden
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={intent === 2}
          aria-label={`${high} — jeden poziom`}
          className="grid size-11 place-items-center rounded-xl border border-ink/12 bg-white text-xl text-ink shadow-pro-sm disabled:opacity-30"
        >
          +
        </button>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-stone-600">
        {preview == null
          ? `Teraz: ${metricLabel} ${formatMetric(current)} · wynik po Preview`
          : `Teraz: ${metricLabel} ${formatMetric(current)} → Po zmianie: ${metricLabel} ${formatMetric(preview)}`}
      </p>
    </article>
  );
}

function UnavailableDirection({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-[18px] border border-nonprod/25 bg-nonprod/[0.035] px-3 py-2">
      <span className="text-sm font-semibold text-ink">{title}</span>
      <span className="text-right text-xs font-medium text-nonprod">{body}</span>
    </div>
  );
}

function readOnlyPosition(reading: GoldenRangeReading): number | null {
  if (reading.side === null || reading.state === 'neutral') return null;
  return actualPositionFromReading(reading) / 25;
}

function ReadOnlyAxisResult({
  title,
  id,
  resultLabel,
  reading,
  low,
  high,
}: {
  title: string;
  id: 'structure' | 'stability';
  resultLabel: string;
  reading: GoldenRangeReading;
  low: string;
  high: string;
}) {
  const position = readOnlyPosition(reading);
  return (
    <div
      className="rounded-[18px] border border-ink/8 bg-white px-3 py-1.5"
      data-testid={`profile-readonly-${id}`}
      role="img"
      aria-label={`${title}: ${resultLabel}. Skala od ${low} do ${high}. ${reading.text}. Pole tylko do odczytu.`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-stone-600">{title}</p>
        <strong className="text-sm text-ink">{resultLabel}</strong>
      </div>
      <div className="mt-1.5 grid grid-cols-5 gap-1" aria-hidden>
        {[0, 1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={cn(
              'h-2 rounded-full border',
              segment === position
                ? reading.state === 'golden'
                  ? 'border-gold bg-gold'
                  : reading.state === 'red'
                    ? 'border-status-error bg-status-error'
                    : 'border-attention bg-attention'
                : segment === 2
                  ? 'border-gold/30 bg-gold/12'
                  : 'border-ink/8 bg-stone-100',
            )}
          />
        ))}
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[10px] font-medium text-stone-600" aria-hidden>
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

export function ProfileDirectionAxes({
  result,
  className,
}: {
  result: RecipeResult;
  className?: string;
}) {
  const recipe = useRecipeStore();
  const preview = useConstraintStudioStore((state) => state.preview);
  const previewResult = useMemo(
    () => (preview ? calculateRecipe(preview.proposedInput) : null),
    [preview],
  );
  const intents = useRecipeProfileStore((state) => state.directionIntents);
  const moveIntent = useRecipeProfileStore((state) => state.moveAxisIntent);
  const directionPlan = buildRecipeDirectionPlan(buildRecipeInput(recipe));
  const statusByAxis = new Map(directionPlan.axes.map((axis) => [axis.axis, axis]));
  const cards = new Map(buildUserMonitorSummaryCards(result).map((card) => [card.id, card]));

  const move = (axis: AdjustableAxisId, delta: -1 | 1) => {
    const next = Math.max(-2, Math.min(2, intents[axis] + delta)) as DirectionIntent;
    if (next === intents[axis]) return;
    moveIntent(axis, delta);
    const canonical = signTarget(next);
    if (recipe.direction_targets[axis] !== canonical) recipe.setDirectionTarget(axis, canonical);
    else recipe.markProfileTargetChanged();
  };

  const metricValue = (metric: TargetMetric | null | undefined, source: RecipeResult | null) =>
    metric && source
      ? (source.indicators.find((indicator) => indicator.key === metric)?.value ?? null)
      : null;

  return (
    <section
      className={cn(
        'rounded-[22px] border border-white/55 bg-[#f7f5f0] p-2 shadow-pro-md',
        className,
      )}
      data-testid="profile-direction-axes"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">Kierunek receptury</h3>
        <span className="text-[10px] font-medium text-stone-600">5 poziomów</span>
      </div>
      <div className="space-y-2">
        {AXES.map((axis) => {
          const state = statusByAxis.get(axis.id);
          if (state?.status !== 'working') {
            return (
              <UnavailableDirection
                key={axis.id}
                title={axis.label}
                body={
                  state?.status === 'blocked_data'
                    ? 'Brak wystarczających danych'
                    : 'Kalibracja w przygotowaniu'
                }
              />
            );
          }
          return (
            <div key={axis.id}>
              <DirectionPreferenceControl
                label={axis.label}
                axis={axis.id}
                intent={intents[axis.id]}
                onMove={(delta) => move(axis.id, delta)}
                current={metricValue(state.metric, result)}
                preview={metricValue(state.metric, previewResult)}
                metricLabel={axis.metricLabel}
                low={axis.low}
                high={axis.high}
              />
            </div>
          );
        })}
        <UnavailableDirection title="Kremowość" body="Kalibracja w przygotowaniu" />
        <UnavailableDirection title="Intensywność smaku" body="Brak wystarczających danych" />
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          {cards.get('struktura') ? (
            <ReadOnlyAxisResult
              title="Struktura"
              id="structure"
              resultLabel={
                cards.get('struktura')!.reading.state === 'golden'
                  ? 'Zbalansowana'
                  : 'Wymaga uwagi'
              }
              reading={cards.get('struktura')!.reading}
              low="Lekka"
              high="Pełna"
            />
          ) : null}
          {cards.get('stabilnosc') ? (
            <ReadOnlyAxisResult
              title="Stabilność"
              id="stability"
              resultLabel={
                cards.get('stabilnosc')!.reading.state === 'golden'
                  ? 'Bardzo stabilna'
                  : 'Wymaga uwagi'
              }
              reading={cards.get('stabilnosc')!.reading}
              low="Niska"
              high="Wysoka"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
