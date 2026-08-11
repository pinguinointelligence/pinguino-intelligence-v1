import { cn } from '@/lib/cn';
import { axisRelation, type AxisRelation } from './recipeAxisModel';

export function RecipeAxisScale({
  id,
  label,
  targetPosition,
  actualPosition,
  previewPosition,
  adjustable,
  onDecrease,
  onIncrease,
  decreaseActionLabel,
  increaseActionLabel,
  readiness,
  readinessReason,
  relation: relationOverride,
}: {
  id: string;
  label: string;
  targetPosition: number;
  actualPosition: number;
  previewPosition?: number;
  adjustable?: boolean;
  onDecrease?: () => void;
  onIncrease?: () => void;
  decreaseActionLabel?: string;
  increaseActionLabel?: string;
  readiness?: 'DZIAŁA' | 'WYMAGA KALIBRACJI' | 'NIEOBSŁUGIWANE' | 'BRAK DANYCH';
  readinessReason?: string;
  relation?: AxisRelation;
}) {
  const relation = relationOverride ?? axisRelation(actualPosition, targetPosition);
  const acceptableStart = Math.max(0, targetPosition - 18);
  const acceptableEnd = Math.min(100, targetPosition + 18);

  return (
    <div
      className="grid grid-cols-[minmax(6.8rem,0.72fr)_minmax(8.5rem,1fr)] items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/65"
      data-testid={`profile-axis-${id}`}
      data-axis-relation={relation}
    >
      <span
        className="min-w-0 text-[10px] font-semibold tracking-[0.06em] text-stone-600 uppercase"
        title={readinessReason}
      >
        <span className="block leading-tight whitespace-normal">{label}</span>
        {readiness ? (
          <span
            className={cn('mt-1 inline-flex max-w-full rounded-full px-1.5 py-0.5 text-[10px] leading-tight tracking-normal whitespace-normal', readiness === 'DZIAŁA' ? 'bg-pro-sage text-status-ideal' : 'bg-nonprod/[0.07] text-nonprod')}
            data-readiness={readiness}
          >
            {readiness}
          </span>
        ) : null}
        {relation === 'outside' ? (
          <span className="mt-1 block text-[10px] font-semibold tracking-normal text-status-error" data-axis-status="outside">
            Poza wybranym celem
          </span>
        ) : null}
      </span>
      <div
        className={cn(
          'grid min-w-0 items-center gap-2',
          adjustable && 'grid-cols-[2.75rem_minmax(0,1fr)_2.75rem]',
        )}
      >
        {adjustable ? (
          <button
            type="button"
            onClick={onDecrease}
            aria-label={`${label}: ${decreaseActionLabel ?? 'zmniejsz'}`}
            data-testid={`axis-minus-${id}`}
            className="pro-focus-ring grid size-11 place-items-center rounded-full border border-ink/12 bg-white text-base leading-none text-ink shadow-pro-sm transition-all hover:-translate-y-px hover:border-ink/35"
          >
            −
          </button>
        ) : null}
        <div
          className="relative h-5 min-w-0"
          role="img"
          aria-live="polite"
          aria-atomic="true"
          aria-label={`${label}: teraz ${Math.round(actualPosition)} procent skali, cel ${Math.round(targetPosition)} procent${previewPosition === undefined ? ', brak wyniku Preview' : `, Preview ${Math.round(previewPosition)} procent`}; ${relation === 'outside' ? 'poza wybranym celem' : 'w wybranym celu'}`}
        >
          <div className="absolute inset-x-0 top-[8px] h-1 rounded-full bg-stone-200" />
          <div
            className="absolute top-[8px] h-1 rounded-full bg-gold/18"
            style={{ left: `${acceptableStart}%`, width: `${acceptableEnd - acceptableStart}%` }}
            aria-hidden
          />
          <span
            className="absolute top-[2px] h-4 w-px -translate-x-1/2 bg-gold"
            style={{ left: `${targetPosition}%` }}
            title="Cel"
            data-testid={`axis-target-${id}`}
            data-position={targetPosition}
          />
          <span
            className="absolute bottom-0 size-2.5 -translate-x-1/2 rounded-full border-2 border-white bg-pro-graphite"
            style={{ left: `${actualPosition}%` }}
            title="Aktualny wynik"
            data-testid={`axis-actual-${id}`}
            data-position={actualPosition}
          />
          {previewPosition !== undefined ? (
            <span
              className="absolute top-[3px] size-3 -translate-x-1/2 rounded-full border-2 border-gold bg-white/90"
              style={{ left: `${previewPosition}%` }}
              title="Wynik Preview"
              data-testid={`axis-preview-${id}`}
              data-position={previewPosition}
            />
          ) : null}
        </div>
        {adjustable ? (
          <button
            type="button"
            onClick={onIncrease}
            aria-label={`${label}: ${increaseActionLabel ?? 'zwiększ'}`}
            data-testid={`axis-plus-${id}`}
            className="pro-focus-ring grid size-11 place-items-center rounded-full border border-ink/12 bg-white text-base leading-none text-ink shadow-pro-sm transition-all hover:-translate-y-px hover:border-ink/35"
          >
            +
          </button>
        ) : null}
      </div>
    </div>
  );
}
