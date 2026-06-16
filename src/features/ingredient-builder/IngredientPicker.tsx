import { useMemo, useState } from 'react';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import type { EngineIngredient } from '@/engine';
import {
  filterIngredients,
  groupIngredientsByCategory,
  type IngredientLibrary,
} from './ingredientLibrary';

const b = copy.studio.builder;

/**
 * The picker consumes a resolved ingredient library (PI Base for Pro, else the
 * demo catalog). It keeps the existing grouped-select + add flow and adds a
 * lightweight text filter; the add flow is unchanged: an EngineIngredient goes
 * to the recipe store, which the engine recomputes from.
 */
export function IngredientPicker({
  library,
  onAdd,
}: {
  library: IngredientLibrary;
  onAdd: (ingredient: EngineIngredient) => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');

  const filtered = useMemo(
    () => filterIngredients(library.ingredients, query),
    [library.ingredients, query],
  );
  const grouped = useMemo(() => groupIngredientsByCategory(filtered), [filtered]);

  if (library.status === 'loading') {
    return (
      <p className="text-sm text-stone-500" role="status" aria-live="polite">
        {b.loadingLibrary}
      </p>
    );
  }

  // Selection stays valid even when the filter changes the visible set.
  const effectiveId = filtered.some((i) => i.id === selectedId)
    ? selectedId
    : (filtered[0]?.id ?? '');

  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        aria-label={b.searchLabel}
        placeholder={b.searchPlaceholder}
        className="rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm transition-colors hover:border-ink/30 focus:border-ink/40 focus:outline-none"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />

      {grouped.length === 0 ? (
        <p className="text-sm text-stone-500">{b.noMatches}</p>
      ) : (
        <div className="flex gap-2">
          <select
            aria-label={b.addLabel}
            className="flex-1 rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm transition-colors hover:border-ink/30 focus:border-ink/40 focus:outline-none"
            value={effectiveId}
            onChange={(event) => setSelectedId(event.currentTarget.value)}
          >
            {grouped.map((group) => (
              <optgroup key={group.category} label={b.ingredientGroups[group.category]}>
                {group.items.map((ingredient) => (
                  <option key={ingredient.id} value={ingredient.id}>
                    {ingredient.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            className={buttonClasses('ghost', 'sm')}
            onClick={() => {
              const ingredient = library.ingredients.find((item) => item.id === effectiveId);
              if (ingredient) onAdd(ingredient);
            }}
          >
            <span aria-hidden className="mr-1.5">
              ＋
            </span>
            {b.addLabel}
          </button>
        </div>
      )}

      {library.status === 'fallback' ? (
        <p className="text-xs text-stone-400">{b.fallbackNote}</p>
      ) : null}
    </div>
  );
}
