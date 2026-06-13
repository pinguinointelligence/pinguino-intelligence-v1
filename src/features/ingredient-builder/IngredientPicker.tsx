import { useState } from 'react';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { DEMO_INGREDIENTS } from '@/data/demoIngredients';
import type { EngineIngredient } from '@/engine';

const b = copy.studio.builder;

/** Demo ingredients grouped by category, preserving first-appearance order. */
const GROUPED = DEMO_INGREDIENTS.reduce<Array<{ category: EngineIngredient['category']; items: EngineIngredient[] }>>(
  (groups, ingredient) => {
    const existing = groups.find((group) => group.category === ingredient.category);
    if (existing) existing.items.push(ingredient);
    else groups.push({ category: ingredient.category, items: [ingredient] });
    return groups;
  },
  [],
);

export function IngredientPicker({ onAdd }: { onAdd: (ingredient: EngineIngredient) => void }) {
  const [selectedId, setSelectedId] = useState<string>(DEMO_INGREDIENTS[0]!.id);

  return (
    <div className="flex gap-2">
      <select
        aria-label={b.addLabel}
        className="flex-1 rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm transition-colors hover:border-ink/30 focus:border-ink/40 focus:outline-none"
        value={selectedId}
        onChange={(event) => setSelectedId(event.currentTarget.value)}
      >
        {GROUPED.map((group) => (
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
          const ingredient = DEMO_INGREDIENTS.find((item) => item.id === selectedId);
          if (ingredient) onAdd(ingredient);
        }}
      >
        <span aria-hidden className="mr-1.5">
          ＋
        </span>
        {b.addLabel}
      </button>
    </div>
  );
}
