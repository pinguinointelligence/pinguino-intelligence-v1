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
  'w-full rounded-md border border-ink/15 bg-paper py-1.5 pr-5 pl-2 text-right font-mono text-sm tabular-nums transition-colors hover:border-ink/30 focus:border-ink/40 focus:outline-none';

export interface IngredientRowActions {
  setPlannedGrams: (lineId: string, grams: number) => void;
  setActualGrams: (lineId: string, grams: number | null) => void;
  setLockType: (lineId: string, lockType: LockType) => void;
  setMainIngredient: (lineId: string) => void;
  removeItem: (lineId: string) => void;
}

function GramsField({
  label,
  value,
  emphasised,
  onChange,
}: {
  label: string;
  value: number | '';
  emphasised?: boolean;
  onChange: (raw: string) => void;
}) {
  return (
    <div className="relative">
      <input
        aria-label={label}
        type="number"
        min={0}
        placeholder={value === '' ? '—' : undefined}
        className={cn(cellInput, emphasised && 'border-ink/30')}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[0.65rem] text-stone-400">
        {b.unit}
      </span>
    </div>
  );
}

export function IngredientRow({
  item,
  totalBatchG,
  actions,
}: {
  item: EffectiveRecipeItem;
  totalBatchG: number;
  actions: IngredientRowActions;
}) {
  const share = totalBatchG > 0 ? (item.effective_grams / totalBatchG) * 100 : null;
  const isMain = item.lock_type === 'main';

  return (
    <div
      className={cn(
        '-mx-2 rounded-sm px-2 transition-colors hover:bg-ink/[0.02]',
        isMain && 'bg-ivory/30',
      )}
    >
      <div className={cn(ROW_GRID, 'py-2.5')}>
        <div className="min-w-0">
          <span className="truncate text-sm text-ink">{item.ingredient.name}</span>
          <ConfidenceBadge score={item.ingredient.confidence_score} className="mt-0.5" />
        </div>

        <GramsField
          label={`${item.ingredient.name} ${b.planned}`}
          value={item.planned_grams}
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
            <span className="text-sm text-stone-400">—</span>
          ) : (
            <MetricValue value={share} unit="%" size="sm" />
          )}
          {item.is_actual && item.difference !== 0 ? (
            <span
              className={cn(
                'block font-mono text-[0.7rem] tabular-nums',
                item.difference > 0 ? 'text-status-error' : 'text-stone-500',
              )}
            >
              {item.difference > 0 ? '↑' : '↓'} {Math.abs(item.difference).toFixed(1)} {b.unit}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-pressed={isMain}
            onClick={() => (isMain ? actions.setLockType(item.id, 'unlocked') : actions.setMainIngredient(item.id))}
            title={b.mark_main}
            className={cn(
              'rounded border px-2 py-1 text-[0.6rem] font-medium tracking-[0.08em] uppercase transition-colors',
              isMain
                ? 'border-ink bg-ivory text-ink'
                : 'border-ink/15 text-stone-400 hover:border-ink/40 hover:text-stone-600',
            )}
          >
            {b.main_short}
          </button>
          <select
            aria-label={`${item.ingredient.name} ${b.lock}`}
            disabled={isMain}
            className="min-w-0 flex-1 rounded-md border border-ink/15 bg-paper px-2 py-1.5 text-xs transition-colors hover:border-ink/30 focus:border-ink/40 focus:outline-none disabled:opacity-40"
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
          className="rounded-md border border-ink/10 px-2 py-1.5 text-xs text-stone-400 transition-colors hover:border-status-error/40 hover:text-status-error"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
