import { useMemo } from 'react';
import type { RecipeResult } from '@/engine';
import { cn } from '@/lib/cn';
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

const DETENTS = [-2, -1, 0, 1, 2] as const;

const signTarget = (value: DirectionIntent): -1 | 0 | 1 =>
  value < 0 ? -1 : value > 0 ? 1 : 0;

const intentText = (label: string, value: number): string =>
  `${label}: pozycja ${value + 3} z 5; środek oznacza naturalny punkt odniesienia.`;

function RegulatorTrack({ position }: { position: number | null }) {
  return (
    <div className="relative grid h-11 grid-cols-5 items-center gap-1.5 px-1" aria-hidden>
      <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-ink/12" />
      {DETENTS.map((detent) => {
        const selected = position === detent;
        const center = detent === 0;
        return (
          <span key={detent} className="relative z-10 grid place-items-center">
            <span
              className={cn(
                'grid size-4 place-items-center rounded-full border transition-all',
                center ? 'border-gold/55 bg-gold/22 shadow-[inset_0_0_0_3px_rgba(255,255,255,.45)]' : 'border-ink/14 bg-stone-100',
                selected && center && 'size-5 border-gold bg-gold shadow-pro-e1',
                selected && !center && 'size-5 border-ink/18 bg-white shadow-pro-e1',
              )}
            >
              {selected && !center ? <span className="size-2 rounded-full bg-ink/45" /> : null}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function RegulatorRow({
  id,
  label,
  position,
  onMove,
  unavailable,
  readOnly = false,
  detail,
}: {
  id: string;
  label: string;
  position: number | null;
  onMove?: (delta: number) => void;
  unavailable?: 'Kalibracja' | 'Brak danych';
  readOnly?: boolean;
  detail?: string;
}) {
  const disabled = Boolean(unavailable) || readOnly;
  const value = position ?? 0;
  return (
    <article
      className={cn(
        'grid min-h-[58px] grid-cols-[minmax(0,1fr)_44px_minmax(104px,1.25fr)_44px] items-center gap-1.5 rounded-[16px] border bg-white px-2 py-1.5 shadow-pro-e0 sm:grid-cols-[minmax(105px,.8fr)_44px_minmax(128px,1.2fr)_44px] sm:gap-2 sm:px-2.5 lg:h-12 lg:min-h-0 lg:grid-cols-[minmax(92px,.8fr)_36px_minmax(104px,1.2fr)_36px] lg:rounded-[14px] lg:px-2 lg:py-1',
        unavailable ? 'border-nonprod/28' : 'border-ink/8',
      )}
      data-testid={`profile-regulator-${id}`}
      data-regulator-state={unavailable ? 'unavailable' : readOnly ? 'readonly' : 'interactive'}
    >
      <div className="min-w-0">
        <h4 className="truncate text-xs font-semibold text-ink">{label}</h4>
        {unavailable ? (
          <span className="mt-0.5 block text-[10px] font-semibold text-nonprod">{unavailable}</span>
        ) : detail ? (
          <span className="mt-0.5 block truncate text-[10px] text-stone-600">{detail}</span>
        ) : null}
      </div>
      {readOnly ? <span aria-hidden /> : (
        <button
          type="button"
          aria-label={`${label}: przesuń w lewo`}
          disabled={disabled || value <= -2}
          onClick={() => onMove?.(-1)}
          className="pro-focus-ring grid size-11 place-items-center rounded-xl border border-ink/12 bg-white text-xl text-ink shadow-pro-e0 disabled:opacity-25 lg:size-9 lg:rounded-[10px] lg:text-lg"
        >
          −
        </button>
      )}
      <div
        role={readOnly ? 'img' : 'slider'}
        tabIndex={!disabled ? 0 : undefined}
        aria-label={readOnly ? `${label}: ${detail ?? 'Brak danych'}, tylko do odczytu` : label}
        aria-valuemin={!readOnly ? -2 : undefined}
        aria-valuemax={!readOnly ? 2 : undefined}
        aria-valuenow={!readOnly ? value : undefined}
        aria-valuetext={!readOnly ? intentText(label, value) : undefined}
        aria-disabled={!readOnly && disabled ? true : undefined}
        aria-description={readOnly ? `${detail ?? 'Brak wyniku'}. Pięciopoziomowa skala z oznaczonym środkiem.` : unavailable ? `${unavailable}. Sterowanie wyłączone.` : undefined}
        onKeyDown={(event) => {
          if (disabled || readOnly) return;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            event.preventDefault();
            if (value > -2) onMove?.(-1);
          } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (value < 2) onMove?.(1);
          } else if (event.key === 'Home') {
            event.preventDefault();
            onMove?.(-2 - value);
          } else if (event.key === 'End') {
            event.preventDefault();
            onMove?.(2 - value);
          }
        }}
        className={cn(
          'min-h-11 rounded-xl lg:min-h-9 lg:rounded-[10px]',
          !disabled && 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold',
        )}
      >
        <RegulatorTrack position={position} />
      </div>
      {readOnly ? <span aria-hidden /> : (
        <button
          type="button"
          aria-label={`${label}: przesuń w prawo`}
          disabled={disabled || value >= 2}
          onClick={() => onMove?.(1)}
          className="pro-focus-ring grid size-11 place-items-center rounded-xl border border-ink/12 bg-white text-xl text-ink shadow-pro-e0 disabled:opacity-25 lg:size-9 lg:rounded-[10px] lg:text-lg"
        >
          +
        </button>
      )}
    </article>
  );
}

function readOnlyPosition(reading: GoldenRangeReading): number | null {
  if (reading.side === null || reading.state === 'neutral') return null;
  return actualPositionFromReading(reading) / 25 - 2;
}

export function ProfileDirectionAxes({
  result,
  className,
}: {
  result: RecipeResult;
  className?: string;
}) {
  const recipe = useRecipeStore();
  const intents = useRecipeProfileStore((state) => state.directionIntents);
  const moveIntent = useRecipeProfileStore((state) => state.moveAxisIntent);
  const directionPlan = buildRecipeDirectionPlan(buildRecipeInput(recipe));
  const statusByAxis = useMemo(
    () => new Map(directionPlan.axes.map((axis) => [axis.axis, axis])),
    [directionPlan.axes],
  );
  const cards = useMemo(
    () => new Map(buildUserMonitorSummaryCards(result).map((card) => [card.id, card])),
    [result],
  );

  const move = (axis: AdjustableAxisId, delta: number) => {
    const next = Math.max(-2, Math.min(2, intents[axis] + delta)) as DirectionIntent;
    if (next === intents[axis]) return;
    moveIntent(axis, delta);
    const canonical = signTarget(next);
    if (recipe.direction_targets[axis] !== canonical) recipe.setDirectionTarget(axis, canonical);
    else recipe.markProfileTargetChanged();
  };

  const structure = cards.get('struktura');
  const stability = cards.get('stabilnosc');
  return (
    <section
      className={cn('rounded-[22px] border border-white/55 bg-[#f7f5f0] p-2 shadow-pro-e1', className)}
      data-testid="profile-direction-axes"
    >
      <h3 className="mb-2 text-sm font-semibold text-ink">Kierunek receptury</h3>
      <div className="space-y-1.5">
        {([
          ['sweetness', 'Słodycz'],
          ['softness', 'Miękkość'],
        ] as const).map(([axis, label]) => {
          const status = statusByAxis.get(axis);
          return (
            <RegulatorRow
              key={axis}
              id={axis}
              label={label}
              position={intents[axis]}
              onMove={(delta) => move(axis, delta)}
              unavailable={status?.status === 'working' ? undefined : status?.status === 'blocked_data' ? 'Brak danych' : 'Kalibracja'}
            />
          );
        })}
        <RegulatorRow id="creaminess" label="Kremowość" position={0} unavailable="Kalibracja" />
        <RegulatorRow id="intensity" label="Intensywność smaku" position={0} unavailable="Brak danych" />
        <RegulatorRow
          id="structure"
          label="Struktura"
          position={structure ? readOnlyPosition(structure.reading) : null}
          readOnly
          detail={structure?.reading.state === 'golden' ? 'Zbalansowana' : structure?.reading.text ?? 'Brak danych'}
        />
        <RegulatorRow
          id="stability"
          label="Stabilność"
          position={stability ? readOnlyPosition(stability.reading) : null}
          readOnly
          detail={stability?.reading.state === 'golden' ? 'Bardzo stabilna' : stability?.reading.text ?? 'Brak danych'}
        />
      </div>
    </section>
  );
}
