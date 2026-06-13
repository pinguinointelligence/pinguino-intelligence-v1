import { SectionLabel } from '@/components/shared/SectionLabel';
import { Card } from '@/components/ui/Card';
import { copy } from '@/copy/en';
import type { EffectiveRecipeItem } from '@/engine';
import { useRecipeStore } from '@/stores/recipeStore';
import { IngredientPicker } from './IngredientPicker';
import { IngredientRow, type IngredientRowActions } from './IngredientRow';

const b = copy.studio.builder;
const headCell = 'text-[0.6rem] font-medium tracking-label text-stone-400 uppercase';

/** Items come from the engine result (effective grams, difference, share);
 * edits go back to the store. The engine remains the source of truth. */
export function IngredientBuilder({
  items,
  totalBatchG,
}: {
  items: EffectiveRecipeItem[];
  totalBatchG: number;
}) {
  const addIngredient = useRecipeStore((state) => state.addIngredient);
  const actions: IngredientRowActions = {
    setPlannedGrams: useRecipeStore((state) => state.setPlannedGrams),
    setActualGrams: useRecipeStore((state) => state.setActualGrams),
    setLockType: useRecipeStore((state) => state.setLockType),
    setMainIngredient: useRecipeStore((state) => state.setMainIngredient),
    removeItem: useRecipeStore((state) => state.removeItem),
  };

  return (
    <Card padding="lg">
      <SectionLabel>{b.title}</SectionLabel>

      {items.length === 0 ? (
        <p className="mt-6 text-sm leading-relaxed text-stone-500">{b.empty}</p>
      ) : (
        <div className="mt-5 divide-y divide-ink/5">
          <div className="grid grid-cols-[1.6fr_0.9fr_0.9fr_0.7fr_1.1fr_auto] gap-2 pb-2">
            <span className={headCell}>&nbsp;</span>
            <span className={`${headCell} text-right`}>{b.planned}</span>
            <span className={`${headCell} text-right`}>{b.actual}</span>
            <span className={`${headCell} text-right`}>{b.share}</span>
            <span className={headCell}>{b.lock}</span>
            <span className={headCell}>&nbsp;</span>
          </div>
          {items.map((item) => (
            <IngredientRow key={item.id} item={item} totalBatchG={totalBatchG} actions={actions} />
          ))}
        </div>
      )}

      <div className="mt-5">
        <IngredientPicker onAdd={addIngredient} />
      </div>
    </Card>
  );
}
