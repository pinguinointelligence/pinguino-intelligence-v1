import { IngredientCategoryIcon } from '@/features/ingredient-builder/IngredientCategoryIcon';
import { ingredientCategorySymbolFor } from '@/features/ingredient-builder/ingredientCategorySymbols';
import { PRODUCTION_ROW_GRID } from '@/features/ingredient-builder/IngredientRow';
import { productionStepForGrams, type ProductionTopUpTask } from './productionSession';
import { ProductionActualControl, ProductionConfirmationAction } from './ProductionActualControl';

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
      className="border-y border-attention/20 bg-education-ivory/45"
      aria-labelledby="production-top-up-heading"
      data-testid="production-top-up-section"
    >
      <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-attention/15 px-[var(--pro-mobile-gutter)] py-2 lg:px-3">
        <h3
          id="production-top-up-heading"
          className="text-[11px] font-semibold tracking-[0.06em] text-ink uppercase"
        >
          KOREKTA — DODAJ JESZCZE
        </h3>
        <span className="text-[10px] text-stone-600">Osobne zadania wykonawcze</span>
      </div>
      <div className="divide-y divide-attention/15">
        {pending.map((task) => (
          <div
            key={task.taskId}
            className={`${PRODUCTION_ROW_GRID} px-[var(--pro-mobile-gutter)] py-2 lg:px-3 lg:py-1.5`}
            data-production-top-up-task={task.taskId}
            data-source-recipe-line-id={task.sourceRecipeLineId}
            data-rescue-revision={task.revisionId}
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
              <strong className="mt-0.5 block font-mono text-xs font-semibold tabular-nums text-attention">
                Dodaj teraz +{formatMassG(task.authorizedDeltaG)} g
              </strong>
            </div>
            <div className="min-w-0 px-1 text-left text-xs text-stone-600 md:text-right">
              <span className="block">W naczyniu: {formatMassG(task.physicalBaselineG)} g</span>
              <span className="block font-mono tabular-nums text-ink">
                Po uzupełnieniu: {formatMassG(task.cumulativeTargetG)} g
              </span>
            </div>
            <div>
              <span className="mb-1 block text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase md:hidden">
                Dodaj teraz
              </span>
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
                separateAction
              />
            </div>
            <div className="min-w-0 px-1 text-left md:text-right">
              <span className="block text-[10px] font-semibold text-stone-600">Korekta</span>
              <strong className="block font-mono text-sm font-semibold tabular-nums text-attention">
                +{formatMassG(task.authorizedDeltaG)} g
              </strong>
            </div>
            <div className="flex justify-start md:justify-end">
              <ProductionConfirmationAction
                ingredientName={task.ingredientName}
                confirmed={false}
                correctionMode={false}
                topUpMode
                disabled={disabled}
                onConfirm={() => onConfirm(task.taskId)}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
