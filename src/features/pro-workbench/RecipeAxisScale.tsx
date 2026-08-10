import { cn } from '@/lib/cn';
import { axisRelation, type AxisRelation } from './recipeAxisModel';

export function RecipeAxisScale({
  id,
  label,
  targetPosition,
  actualPosition,
  adjustable,
  onDecrease,
  onIncrease,
  readiness,
  readinessReason,
  relation: relationOverride,
}: {
  id: string;
  label: string;
  targetPosition: number;
  actualPosition: number;
  adjustable?: boolean;
  onDecrease?: () => void;
  onIncrease?: () => void;
  readiness?: 'DZIAŁA' | 'WYMAGA KALIBRACJI' | 'NIEOBSŁUGIWANE' | 'BRAK DANYCH';
  readinessReason?: string;
  relation?: AxisRelation;
}) {
  const relation = relationOverride ?? axisRelation(actualPosition, targetPosition);
  const acceptableStart = Math.max(0, targetPosition - 25);
  const acceptableEnd = Math.min(100, targetPosition + 25);
  const actualTone =
    relation === 'gold'
      ? 'border-gold bg-gold'
      : relation === 'acceptable'
        ? 'border-status-ideal bg-status-ideal'
        : 'border-status-error bg-status-error';

  return (
    <div
      className="grid grid-cols-[6.4rem_minmax(0,1fr)] items-center gap-2"
      data-testid={`profile-axis-${id}`}
      data-axis-relation={relation}
    >
      <span
        className="flex min-w-0 items-center gap-1 text-[9px] font-semibold tracking-[0.06em] text-stone-600 uppercase"
        title={readinessReason}
      >
        <span className="truncate">{label}</span>
        {readiness ? (
          <span
            className={cn(
              'shrink-0 text-[6px] tracking-normal',
              readiness === 'DZIAŁA' ? 'text-status-ideal' : 'text-nonprod',
            )}
            data-readiness={readiness}
          >
            {readiness}
          </span>
        ) : null}
      </span>
      <div
        className={cn(
          'grid min-w-0 items-center gap-1',
          adjustable && 'grid-cols-[1.6rem_minmax(0,1fr)_1.6rem]',
        )}
      >
        {adjustable ? (
          <button
            type="button"
            onClick={onDecrease}
            aria-label={`${label}: przesuń cel w lewo`}
            data-testid={`axis-minus-${id}`}
            className="grid size-6 place-items-center border border-ink/10 bg-white text-sm leading-none text-ink transition-colors hover:border-ink/35"
          >
            −
          </button>
        ) : null}
        <div
          className="relative h-5 min-w-0"
          role="img"
          aria-label={`${label}: złoty romb oznacza cel, trójkąt oznacza aktualny wynik`}
        >
          <div className="absolute inset-x-0 top-[7px] h-1.5 bg-gradient-to-r from-status-error/20 via-stone-100 to-status-error/20" />
          <div
            className="absolute top-[7px] h-1.5 bg-status-ideal/28"
            style={{ left: `${acceptableStart}%`, width: `${acceptableEnd - acceptableStart}%` }}
            aria-hidden
          />
          <span
            className="absolute top-[4px] size-2.5 -translate-x-1/2 rotate-45 border border-gold bg-gold shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
            style={{ left: `${targetPosition}%` }}
            title="Cel"
            data-testid={`axis-target-${id}`}
            data-position={targetPosition}
          />
          <span
            className={cn(
              'absolute bottom-0 size-2 -translate-x-1/2 rotate-45 border shadow-[0_0_0_2px_rgba(255,255,255,0.9)]',
              actualTone,
            )}
            style={{ left: `${actualPosition}%` }}
            title="Aktualny wynik"
            data-testid={`axis-actual-${id}`}
            data-position={actualPosition}
          />
        </div>
        {adjustable ? (
          <button
            type="button"
            onClick={onIncrease}
            aria-label={`${label}: przesuń cel w prawo`}
            data-testid={`axis-plus-${id}`}
            className="grid size-6 place-items-center border border-ink/10 bg-white text-sm leading-none text-ink transition-colors hover:border-ink/35"
          >
            +
          </button>
        ) : null}
      </div>
    </div>
  );
}
