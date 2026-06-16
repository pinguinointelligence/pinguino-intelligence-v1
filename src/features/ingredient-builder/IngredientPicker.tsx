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
 * demo catalog). A premium search bar filters across name, internal name, id,
 * brand, category and subcategory; results stay grouped by category. The add
 * flow is unchanged: an EngineIngredient goes to the recipe store, which the
 * engine recomputes from.
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
    () => filterIngredients(library.ingredients, query, library.searchIndex),
    [library.ingredients, library.searchIndex, query],
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
  const count = filtered.length;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Premium search bar */}
      <div className="relative">
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <circle cx="9" cy="9" r="5.5" />
          <line x1="13.2" y1="13.2" x2="17" y2="17" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          aria-label={b.searchLabel}
          placeholder={b.searchPlaceholder}
          className="w-full rounded-md border border-ink/15 bg-paper py-2.5 pl-9 pr-3 text-sm transition-colors hover:border-ink/30 focus:border-ink/40 focus:outline-none"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>

      {/* Result count — always visible */}
      <p className="text-xs text-stone-500" aria-live="polite">
        <span className="font-mono tabular-nums text-ink/70">{count.toLocaleString('en-US')}</span>{' '}
        {count === 1 ? b.resultUnitOne : b.resultUnitMany} {b.resultFoundSuffix}
      </p>

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
