import { useState } from 'react';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { DEMO_INGREDIENTS } from '@/data/demoIngredients';
import type { EngineIngredient } from '@/engine';

const b = copy.studio.builder;

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
        {DEMO_INGREDIENTS.map((ingredient) => (
          <option key={ingredient.id} value={ingredient.id}>
            {ingredient.name}
          </option>
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
        {b.addLabel}
      </button>
    </div>
  );
}
