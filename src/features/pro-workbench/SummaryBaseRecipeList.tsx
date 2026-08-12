import type { RecipeItem } from '@/engine';

function displayedBaseGrams(item: RecipeItem, completed: boolean): number {
  return completed ? (item.actual_grams ?? item.planned_grams) : item.planned_grams;
}

export function SummaryBaseRecipeList({
  items,
  completed,
}: {
  items: readonly RecipeItem[];
  completed: boolean;
}) {
  const visible = items
    .map((item) => ({ item, grams: displayedBaseGrams(item, completed) }))
    .filter(({ grams }) => grams > 0);

  return (
    <div className="mt-4 divide-y divide-white/8" data-testid="summary-executable-recipe">
      {visible.map(({ item, grams }) => (
        <div key={item.id} className="flex items-center justify-between gap-4 py-2.5">
          <span className="min-w-0 truncate text-sm text-white/82">{item.ingredient.name}</span>
          <strong className="font-mono text-sm tabular-nums text-white">
            {grams.toFixed(0)} g
          </strong>
        </div>
      ))}
    </div>
  );
}
