import { IngredientCategoryIcon } from '@/features/ingredient-builder/IngredientCategoryIcon';
import { ingredientCategorySymbolFor } from '@/features/ingredient-builder/ingredientCategorySymbols';
import { PRODUCTION_ROW_GRID } from '@/features/ingredient-builder/IngredientRow';
import { productionStepForGrams, type ProductionTopUpTask } from './productionSession';
import { ProductionActualControl } from './ProductionActualControl';

const formatMassG = (value: number): string =>
  Number.isInteger(value) ? value.toFixed(0) : value.toFixed(3).replace(/\.?0+$/, '');

export function ProductionTopUpSection({
  tasks,
  disabled,
  ingredientCategoryByLineId = {},
  onChange,
  onConfirm,
}: {
  tasks: readonly ProductionTopUpTask[];
  disabled: boolean;
  ingredientCategoryByLineId?: Readonly<Record<string, string | null | undefined>>;
  onChange: (taskId: string, deltaGrams: number) => void;
  onConfirm: (taskId: string) => void;
}) {
  const pending = tasks.filter((task) => task.status === 'pending');
  if (pending.length === 0) return null;

  return (
    <section
      className="border-y border-ink/10 bg-white"
      aria-labelledby="production-top-up-heading"
      data-testid="production-top-up-section"
    >
      <div className="border-b border-ink/8 px-[var(--pro-mobile-gutter)] py-2 lg:px-3">
        <h3 id="production-top-up-heading" className="text-xs font-semibold text-ink">
          Dodaj jeszcze
        </h3>
      </div>
      <div className="divide-y divide-ink/8">
        {pending.map((task, index) => (
          <div
            key={task.taskId}
            className={`${PRODUCTION_ROW_GRID} px-[var(--pro-mobile-gutter)] py-2 transition-colors lg:px-3 lg:py-1.5 ${index === 0 ? 'production-line-active' : 'hover:bg-stone-50'}`}
            data-production-top-up-task={task.taskId}
            data-source-recipe-line-id={task.sourceRecipeLineId}
            data-rescue-revision={task.revisionId}
            data-production-active={index === 0 ? 'true' : undefined}
            aria-current={index === 0 ? 'step' : undefined}
          >
            <div className="min-w-0">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden
                  className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-stone-600"
                >
                  <IngredientCategoryIcon
                    symbol={ingredientCategorySymbolFor({
                      category: ingredientCategoryByLineId[task.sourceRecipeLineId],
                    })}
                  />
                </span>
                <strong className="min-w-0 truncate text-[13px] font-semibold text-ink">
                  {task.ingredientName}
                </strong>
              </span>
              <span className="mt-0.5 block text-[11px] text-stone-500">
                Do dodania:{' '}
                <strong className="font-mono font-semibold tabular-nums text-ink">
                  {formatMassG(task.authorizedDeltaG)} g
                </strong>
              </span>
            </div>
            <div className="min-w-0 md:justify-self-end">
              <ProductionActualControl
                lineId={task.taskId}
                ingredientName={task.ingredientName}
                value={task.draftDeltaG}
                minimum={0}
                step={productionStepForGrams(task.authorizedDeltaG)}
                confirmed={false}
                correctionMode={false}
                topUpMode
                disabled={disabled}
                onChange={(value) => onChange(task.taskId, value)}
                onConfirm={() => onConfirm(task.taskId)}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
