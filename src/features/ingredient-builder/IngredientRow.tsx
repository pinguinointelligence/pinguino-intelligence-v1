import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { MetricValue } from '@/components/shared/MetricValue';
import { cn } from '@/lib/cn';
import { copy } from '@/copy/en';
import type { EffectiveRecipeItem, LockType } from '@/engine';

const b = copy.studio.builder;

const LOCK_TYPES: LockType[] = [
  'unlocked',
  'grams',
  'percent',
  'main',
  'already_added',
  'required',
];

const cellInput =
  'w-full rounded-md border border-ink/15 bg-paper px-2 py-1.5 text-right font-mono text-sm tabular-nums transition-colors hover:border-ink/30 focus:border-ink/40 focus:outline-none';

export interface IngredientRowActions {
  setPlannedGrams: (lineId: string, grams: number) => void;
  setActualGrams: (lineId: string, grams: number | null) => void;
  setLockType: (lineId: string, lockType: LockType) => void;
  setMainIngredient: (lineId: string) => void;
  removeItem: (lineId: string) => void;
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
    <div className="grid grid-cols-[1.6fr_0.9fr_0.9fr_0.7fr_1.1fr_auto] items-center gap-2 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm text-ink">{item.ingredient.name}</span>
          {isMain ? (
            <span className="rounded border border-ink/15 bg-ivory px-1.5 py-0.5 text-[0.6rem] font-medium tracking-[0.08em] text-ink uppercase">
              {b.lockTypes.main}
            </span>
          ) : null}
        </div>
        <ConfidenceBadge score={item.ingredient.confidence_score} className="mt-0.5" />
      </div>

      <input
        aria-label={`${item.ingredient.name} ${b.planned}`}
        type="number"
        min={0}
        className={cellInput}
        value={item.planned_grams}
        onChange={(event) => actions.setPlannedGrams(item.id, event.currentTarget.valueAsNumber || 0)}
      />

      <input
        aria-label={`${item.ingredient.name} ${b.actual}`}
        type="number"
        min={0}
        placeholder="—"
        className={cn(cellInput, item.is_actual && 'border-ink/30')}
        value={item.actual_grams ?? ''}
        onChange={(event) => {
          const raw = event.currentTarget.value;
          actions.setActualGrams(item.id, raw === '' ? null : Math.max(0, Number(raw)));
        }}
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
            {item.difference > 0 ? '+' : ''}
            {item.difference.toFixed(1)} g
          </span>
        ) : null}
      </div>

      <select
        aria-label={`${item.ingredient.name} ${b.lock}`}
        className="rounded-md border border-ink/15 bg-paper px-2 py-1.5 text-xs transition-colors hover:border-ink/30 focus:border-ink/40 focus:outline-none"
        value={item.lock_type}
        onChange={(event) => {
          const next = event.currentTarget.value as LockType;
          if (next === 'main') actions.setMainIngredient(item.id);
          else actions.setLockType(item.id, next);
        }}
      >
        {LOCK_TYPES.map((lock) => (
          <option key={lock} value={lock}>
            {b.lockTypes[lock]}
          </option>
        ))}
      </select>

      <button
        type="button"
        aria-label={`${b.remove} ${item.ingredient.name}`}
        onClick={() => actions.removeItem(item.id)}
        className="rounded-md border border-ink/10 px-2 py-1.5 text-xs text-stone-400 transition-colors hover:border-status-error/40 hover:text-status-error"
      >
        ✕
      </button>
    </div>
  );
}
