import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { MetricValue } from '@/components/shared/MetricValue';
import { cn } from '@/lib/cn';
import { copy } from '@/copy/en';
import type { EffectiveRecipeItem, LockType } from '@/engine';

const b = copy.studio.builder;

/** Lock types selectable in the dropdown — `main` is handled by its own toggle. */
const SELECTABLE_LOCKS: LockType[] = ['unlocked', 'grams', 'percent', 'already_added', 'required'];

export const ROW_GRID = 'grid grid-cols-[1.5fr_0.85fr_0.85fr_0.6fr_1.4fr_auto] items-center gap-2';

const cellInput =
  'w-full rounded-md border border-ivory/15 bg-shell py-1.5 pr-5 pl-2 text-right font-mono text-sm tabular-nums transition-colors hover:border-ivory/30 focus:border-ivory/40 focus:outline-none';

export interface IngredientRowActions {
  setPlannedGrams: (lineId: string, grams: number) => void;
  setActualGrams: (lineId: string, grams: number | null) => void;
  setLockType: (lineId: string, lockType: LockType) => void;
  setMainIngredient: (lineId: string) => void;
  removeItem: (lineId: string) => void;
}

/** §17 padlock view (UIUX spec §12.3 „[AI / kłódka]”) — supplied by the
 * constraint-studio feature; the row only renders it. When absent the row
 * behaves exactly as before. */
export interface IngredientRowLockView {
  state: 'ai' | 'locked' | 'range';
  /** The protected exact grams (locked) or min–max window (range), preformatted. */
  lockedGramsLabel: string | null;
  ariaLabel: string;
  title: string;
  badge: string | null;
  /** §17.2: while locked, the exact grams cannot be edited manually. */
  plannedDisabled: boolean;
  toggleDisabled: boolean;
  onToggle: () => void;
}

/** Minimal one-family padlock glyph (§21.1 one icon system, no new deps). */
function PadlockIcon({ closed }: { closed: boolean }) {
  return (
    <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="2" y="5.2" width="8" height="5.4" rx="1" fill="currentColor" />
      {closed ? (
        <path d="M3.8 5V3.6a2.2 2.2 0 1 1 4.4 0V5" stroke="currentColor" strokeWidth="1.3" fill="none" />
      ) : (
        <path d="M3.8 5V3.6a2.2 2.2 0 0 1 4.3-.7" stroke="currentColor" strokeWidth="1.3" fill="none" />
      )}
    </svg>
  );
}

function GramsField({
  label,
  value,
  emphasised,
  disabled,
  disabledTitle,
  onChange,
}: {
  label: string;
  value: number | '';
  emphasised?: boolean;
  disabled?: boolean;
  disabledTitle?: string;
  onChange: (raw: string) => void;
}) {
  return (
    <div className="relative">
      <input
        aria-label={label}
        type="number"
        min={0}
        disabled={disabled}
        title={disabled ? disabledTitle : undefined}
        placeholder={value === '' ? '—' : undefined}
        className={cn(
          cellInput,
          emphasised && 'border-ivory/30',
          disabled && 'cursor-not-allowed border-ivory/25 bg-ivory/[0.06] text-ivory/80',
        )}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[0.65rem] text-ivory/40">
        {b.unit}
      </span>
    </div>
  );
}

export function IngredientRow({
  item,
  totalBatchG,
  actions,
  lock,
}: {
  item: EffectiveRecipeItem;
  totalBatchG: number;
  actions: IngredientRowActions;
  /** Optional §17 padlock (constraint-studio). Absent → legacy row. */
  lock?: IngredientRowLockView;
}) {
  const share = totalBatchG > 0 ? (item.effective_grams / totalBatchG) * 100 : null;
  const isMain = item.lock_type === 'main';
  const isConstraintLocked = lock?.state === 'locked';

  return (
    <div
      className={cn(
        '-mx-2 rounded-sm px-2 transition-colors hover:bg-ivory/[0.04]',
        isMain && 'bg-ivory/[0.07]',
        isConstraintLocked && 'bg-ivory/[0.05]',
      )}
    >
      <div className={cn(ROW_GRID, 'py-2.5')}>
        <div className="min-w-0">
          <span className="truncate text-sm text-ivory">{item.ingredient.name}</span>
          <span className="flex items-center gap-2">
            <ConfidenceBadge score={item.ingredient.confidence_score} className="mt-0.5" />
            {lock?.badge ? (
              <span className="mt-0.5 rounded border border-status-risky/40 px-1 py-px text-[0.55rem] font-medium tracking-[0.08em] text-status-risky uppercase">
                {lock.badge}
                {lock.lockedGramsLabel ? (
                  <span className="ml-1 font-mono tracking-normal normal-case tabular-nums">
                    {lock.lockedGramsLabel}
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
        </div>

        <GramsField
          label={`${item.ingredient.name} ${b.planned}`}
          value={item.planned_grams}
          disabled={lock?.plannedDisabled}
          disabledTitle={lock?.title}
          onChange={(raw) => actions.setPlannedGrams(item.id, Number(raw) || 0)}
        />

        <GramsField
          label={`${item.ingredient.name} ${b.actual}`}
          value={item.actual_grams ?? ''}
          emphasised={item.is_actual}
          onChange={(raw) => actions.setActualGrams(item.id, raw === '' ? null : Math.max(0, Number(raw)))}
        />

        <div className="text-right">
          {share === null ? (
            <span className="text-sm text-ivory/40">—</span>
          ) : (
            <MetricValue value={share} unit="%" size="sm" />
          )}
          {item.is_actual && item.difference !== 0 ? (
            <span
              className={cn(
                'block font-mono text-[0.7rem] tabular-nums',
                item.difference > 0 ? 'text-status-error' : 'text-ivory/50',
              )}
            >
              {item.difference > 0 ? '↑' : '↓'} {Math.abs(item.difference).toFixed(1)} {b.unit}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          {lock ? (
            <button
              type="button"
              aria-pressed={lock.state !== 'ai'}
              aria-label={lock.ariaLabel}
              title={lock.title}
              disabled={lock.toggleDisabled}
              onClick={lock.onToggle}
              className={cn(
                'rounded border p-1.5 transition-colors',
                lock.state === 'locked'
                  ? 'border-ivory bg-ivory text-shell'
                  : lock.state === 'range'
                    ? 'border-status-risky/50 text-status-risky'
                    : 'border-ivory/15 text-ivory/40 hover:border-ivory/40 hover:text-ivory/70',
                lock.toggleDisabled && 'cursor-not-allowed opacity-40 hover:border-ivory/15 hover:text-ivory/40',
              )}
            >
              <PadlockIcon closed={lock.state !== 'ai'} />
            </button>
          ) : null}
          <button
            type="button"
            aria-pressed={isMain}
            onClick={() => (isMain ? actions.setLockType(item.id, 'unlocked') : actions.setMainIngredient(item.id))}
            title={b.mark_main}
            className={cn(
              'rounded border px-2 py-1 text-[0.6rem] font-medium tracking-[0.08em] uppercase transition-colors',
              isMain
                ? 'border-ivory bg-ivory text-shell'
                : 'border-ivory/15 text-ivory/40 hover:border-ivory/40 hover:text-ivory/70',
            )}
          >
            {b.main_short}
          </button>
          <select
            aria-label={`${item.ingredient.name} ${b.lock}`}
            disabled={isMain}
            className="min-w-0 flex-1 rounded-md border border-ivory/15 bg-shell px-2 py-1.5 text-xs transition-colors hover:border-ivory/30 focus:border-ivory/40 focus:outline-none disabled:opacity-40"
            value={item.lock_type}
            onChange={(event) => actions.setLockType(item.id, event.currentTarget.value as LockType)}
          >
            {isMain ? (
              <option value="main" disabled>
                {b.lockTypes.main}
              </option>
            ) : null}
            {SELECTABLE_LOCKS.map((lock) => (
              <option key={lock} value={lock}>
                {b.lockTypes[lock]}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          aria-label={`${b.remove} ${item.ingredient.name}`}
          onClick={() => actions.removeItem(item.id)}
          className="rounded-md border border-ivory/10 px-2 py-1.5 text-xs text-ivory/40 transition-colors hover:border-status-error/40 hover:text-status-error"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
