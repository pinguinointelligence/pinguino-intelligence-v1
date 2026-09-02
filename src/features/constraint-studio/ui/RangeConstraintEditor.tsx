/**
 * §17.3 Pro min–max range editor — FEATURE-FLAGGED (default OFF, see
 * constraintStudioFlags). Range is NOT a live solver mode: the header badge
 * and note present it strictly as ANALYSIS feeding the §18 feasibility layer.
 * Validation is honest — a window that excludes the current grams is
 * rejected, never clamped (§17.2 „no silent change”).
 */
import { useState } from 'react';
import type { RecipeItem } from '@/engine';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { constraintStudioCopy as copy, formatGramsPl } from '../constraintStudioCopy';

const fieldClass =
  'w-24 rounded-md border border-ivory/15 bg-shell px-2 py-1.5 text-right font-mono text-xs text-ivory tabular-nums transition-colors hover:border-ivory/30 focus:border-ivory/40 focus:outline-none';

function RangeRow({
  item,
  constraint,
  onSet,
  onClear,
}: {
  item: RecipeItem;
  constraint: { minGrams: number; maxGrams: number } | null;
  onSet: (minGrams: number, maxGrams: number) => boolean;
  onClear: () => void;
}) {
  const [minText, setMinText] = useState(constraint ? String(constraint.minGrams) : '');
  const [maxText, setMaxText] = useState(constraint ? String(constraint.maxGrams) : '');
  const [invalid, setInvalid] = useState(false);

  const submit = () => {
    const ok = onSet(Number(minText), Number(maxText));
    setInvalid(!ok);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 py-1.5">
      <span className="min-w-0 flex-1 truncate text-sm text-ivory">
        {item.ingredient.name}
        <span className="ml-2 font-mono text-xs text-ivory/60 tabular-nums">
          {formatGramsPl(item.planned_grams)}
        </span>
      </span>
      <input
        aria-label={copy.range.minLabel(item.ingredient.name)}
        type="number"
        min={0}
        className={fieldClass}
        value={minText}
        onChange={(event) => setMinText(event.currentTarget.value)}
      />
      <span aria-hidden className="text-xs text-ivory/60">
        –
      </span>
      <input
        aria-label={copy.range.maxLabel(item.ingredient.name)}
        type="number"
        min={0}
        className={fieldClass}
        value={maxText}
        onChange={(event) => setMaxText(event.currentTarget.value)}
      />
      <button
        type="button"
        onClick={submit}
        className="rounded-md border border-ivory/20 px-2.5 py-1.5 text-xs font-medium text-ivory transition-colors hover:border-ivory/40"
      >
        {copy.range.set}
      </button>
      {constraint ? (
        <button
          type="button"
          onClick={onClear}
          className="rounded-md border border-ivory/10 px-2.5 py-1.5 text-xs text-ivory/65 transition-colors hover:border-ivory/30 hover:text-ivory"
        >
          {copy.range.clear}
        </button>
      ) : null}
      {invalid ? (
        <p className="w-full text-xs leading-relaxed text-status-error">
          {copy.range.invalidWindow}
        </p>
      ) : null}
    </div>
  );
}

export function RangeConstraintEditor({
  items,
  constraints,
  onSetRange,
  onClearRange,
}: {
  items: readonly RecipeItem[];
  constraints: ConstraintSet;
  onSetRange: (lineId: string, minGrams: number, maxGrams: number) => boolean;
  onClearRange: (lineId: string) => void;
}) {
  return (
    <section aria-label={copy.range.title} className="rounded-md border border-ivory/15 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ivory">{copy.range.title}</p>
        <span className="rounded border border-status-risky/40 px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.08em] text-status-risky uppercase">
          {copy.feasibility.analysisBadge}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ivory/65">{copy.range.note}</p>
      <div className="mt-2 divide-y divide-ivory/10">
        {items
          .filter((item) => item.actual_grams === null)
          .map((item) => {
            const constraint = constraints.byLineId[item.id];
            return (
              <RangeRow
                key={item.id}
                item={item}
                constraint={constraint?.mode === 'range' ? constraint : null}
                onSet={(minGrams, maxGrams) => onSetRange(item.id, minGrams, maxGrams)}
                onClear={() => onClearRange(item.id)}
              />
            );
          })}
      </div>
    </section>
  );
}
