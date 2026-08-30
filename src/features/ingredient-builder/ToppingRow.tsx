import { useState } from 'react';
import { cn } from '@/lib/cn';
import { iconButtonClasses } from '@/components/ui/buttonStyles';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import { DirectNumberControl } from './DirectNumberControl';
import { IngredientCategoryIcon } from './IngredientCategoryIcon';
import { CarbonationBubbles } from '@/components/product/CarbonationBubbles';
import { ingredientCategorySymbolFor } from './ingredientCategorySymbols';
import {
  CustomerPriceEditor,
  IngredientPriceCell,
  type IngredientPriceView,
} from './IngredientPriceControl';
import { COMPACT_ROW_GRID, DialogShell, ROW_GRID } from './IngredientRow';
import { ProductPickerPopover } from './ProductPickerPopover';
import type { IngredientLibrary } from './ingredientLibrary';
import {
  isCatalogLabelToppingIngredient,
  type RecipeToppingIngredient,
} from '@/features/recipe-composition/labelTopping';
import type {
  ProductBehaviorContext,
  ProductBehaviorSnapshot,
} from '@/features/product-intelligence';

export function ToppingRow({
  item,
  priceView,
  canMoveUp,
  canMoveDown,
  onChange,
  onRemove,
  onReplace,
  library,
  onMove,
  onDragStart,
  onDrop,
  behaviorContext,
  compact = false,
}: {
  item: RecipeToppingItem;
  priceView: IngredientPriceView;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (grams: number) => void;
  onRemove: () => void;
  onReplace: (ingredient: RecipeToppingIngredient, behavior?: ProductBehaviorSnapshot) => void;
  library: IngredientLibrary;
  behaviorContext: Omit<ProductBehaviorContext, 'processScope' | 'requestedRole' | 'module'>;
  onMove: (direction: -1 | 1) => void;
  onDragStart: () => void;
  onDrop: () => void;
  compact?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const catalogLabel = isCatalogLabelToppingIngredient(item.ingredient) ? item.ingredient : null;
  return (
    <div
      className="border-b border-ink/[0.075] px-[var(--pro-mobile-gutter)] py-1 transition-colors hover:bg-[var(--g-ivory)] lg:px-3 lg:py-1.5"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      data-scope="POST_PROCESS_ADDON"
      data-line-id={item.id}
      data-testid={`topping-row-${item.id}`}
      tabIndex={-1}
    >
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileSheetOpen(true)}
          data-testid={`topping-mobile-line-${item.id}`}
          aria-label={`${item.ingredient.name} — otwórz edycję toppingu`}
          className="pro-focus-ring grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-left transition-colors active:bg-[var(--g-ivory)]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-600"
            >
              <IngredientCategoryIcon
                symbol={ingredientCategorySymbolFor({
                  category: isCatalogLabelToppingIngredient(item.ingredient)
                    ? null
                    : item.ingredient.category,
                })}
              />
            </span>
            <span className="truncate text-[13px] font-semibold text-ink">
              {item.ingredient.name}
            </span>
            <CarbonationBubbles status={item.ingredient.carbonation_status} />
          </span>
          <span
            className="w-[64px] shrink-0 text-right font-mono text-[13px] font-semibold whitespace-nowrap tabular-nums text-ink"
            data-testid={`topping-mobile-grams-${item.id}`}
          >
            {item.planned_grams.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} g
          </span>
        </button>
      </div>

      <div className="hidden lg:block">
        <div className={compact ? COMPACT_ROW_GRID : ROW_GRID}>
          {/* Same six-track row as the base list (V2.1): the drag handle owns the
              leading track so toppings and ingredients share one column axis. */}
          <span
            aria-hidden
            draggable
            onDragStart={onDragStart}
            className="inline-grid size-11 shrink-0 cursor-grab select-none place-items-center text-[12px] leading-none text-[var(--g-drag)] active:cursor-grabbing md:size-[22px]"
            title="Przeciągnij, aby zmienić kolejność"
          >
            ⠿
          </span>

          <div className="min-w-0">
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--g-ivory-deep)] text-stone-600 md:size-7"
              >
                <IngredientCategoryIcon
                  symbol={ingredientCategorySymbolFor({
                    category: isCatalogLabelToppingIngredient(item.ingredient)
                      ? null
                      : item.ingredient.category,
                  })}
                />
              </span>
              <strong
                className="truncate text-[12px] font-bold text-[var(--g-ink)] uppercase"
                title={item.ingredient.name}
              >
                {item.ingredient.name}
              </strong>
              <CarbonationBubbles status={item.ingredient.carbonation_status} />
            </span>
          </div>

          <div aria-hidden />

          <div
            className={cn(
              'flex items-center justify-self-end',
              compact ? 'w-[150px]' : 'w-[220px]',
            )}
          >
            <DirectNumberControl
              value={item.planned_grams}
              min={0}
              step={1}
              decimals={Number.isInteger(item.planned_grams) ? 0 : 1}
              suffix="g"
              ariaLabel={`${item.ingredient.name} — ilość toppingu`}
              onChange={(value) => onChange(Math.max(0, value))}
              testId={`topping-grams-${item.id}`}
              widthPreset="grams"
              density={compact ? 'compact' : 'comfortable'}
              publishValidDraft
            />
            <span aria-hidden className={compact ? 'w-7 shrink-0' : 'w-11 shrink-0'} />
          </div>

          <IngredientPriceCell view={priceView} />

          <div className="relative justify-self-end">
            <button
              type="button"
              className={iconButtonClasses('xs')}
              aria-label={`Opcje toppingu ${item.ingredient.name}`}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              •••
            </button>
          </div>
        </div>
      </div>

      {menuOpen ? (
        <DialogShell
          label={`Opcje toppingu ${item.ingredient.name}`}
          testId={`topping-menu-${item.id}`}
          onClose={() => setMenuOpen(false)}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase">
                Topping
              </p>
              <strong className="text-sm text-ink">{item.ingredient.name}</strong>
            </div>
            <button
              type="button"
              className="grid size-11 place-items-center rounded-full border border-ink/12 text-lg text-ink"
              aria-label="Zamknij opcje toppingu"
              onClick={() => setMenuOpen(false)}
            >
              ×
            </button>
          </div>
          <p className="mt-4 px-2 text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase">
            Dane
          </p>
          <details className="mx-2 mt-2 rounded-xl border border-ink/10 bg-[var(--g-ivory)] px-3 py-2">
            <summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-ink">
              Dane produktu
            </summary>
            <dl className="space-y-2 border-t border-ink/8 py-3 text-xs">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-stone-600">Nazwa</dt>
                <dd className="text-right font-medium text-ink">{item.ingredient.name}</dd>
              </div>
              {catalogLabel ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-stone-600">Skład z etykiety</dt>
                    <dd className="text-right font-medium text-ink">
                      {catalogLabel.ingredients_text}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-stone-600">Alergeny z etykiety</dt>
                    <dd className="text-right font-medium text-ink">
                      {catalogLabel.allergens_text}
                    </dd>
                  </div>
                </>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <dt className="text-stone-600">ID</dt>
                <dd className="break-all text-right font-mono text-ink">
                  {item.ingredient.canonical_ingredient_id ?? item.ingredient.id}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-stone-600">Zakres procesu</dt>
                <dd className="text-right font-medium text-ink">Po produkcji</dd>
              </div>
            </dl>
          </details>
          <CustomerPriceEditor view={priceView} />
          <div className="mt-2 px-2">
            <ProductPickerPopover
              library={library}
              scope="POST_PROCESS_ADDON"
              intent="REPLACE"
              behaviorContext={behaviorContext}
              triggerLabel="Zamień topping"
              onAdd={(ingredient, behavior) => {
                onReplace(ingredient, behavior);
                setMenuOpen(false);
              }}
            />
          </div>
          <div className="my-2 border-t border-ink/10" />
          <p className="px-2 text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase">
            Kolejność
          </p>
          {(
            [
              ['Przesuń wyżej', -1, !canMoveUp],
              ['Przesuń niżej', 1, !canMoveDown],
            ] as const
          ).map(([label, direction, disabled]) => (
            <button
              key={label}
              type="button"
              disabled={disabled}
              className={cn(
                'min-h-11 w-full rounded-lg px-2 py-2 text-left text-xs text-ink hover:bg-[var(--g-ivory)]',
                disabled && 'cursor-not-allowed opacity-35',
              )}
              onClick={() => {
                onMove(direction);
                setMenuOpen(false);
              }}
            >
              {label}
            </button>
          ))}
          <div className="my-2 border-t border-ink/10" />
          <button
            type="button"
            className="min-h-11 w-full rounded-lg px-2 py-2 text-left text-xs font-semibold text-status-error hover:bg-status-error/[0.05]"
            onClick={() => {
              onRemove();
              setMenuOpen(false);
            }}
          >
            Usuń topping
          </button>
        </DialogShell>
      ) : null}

      {mobileSheetOpen ? (
        <DialogShell
          label={`${item.ingredient.name} — edycja toppingu`}
          testId={`topping-mobile-sheet-${item.id}`}
          placement="bottom"
          onClose={() => setMobileSheetOpen(false)}
        >
          <div className="flex flex-col">
            <div className="sticky top-0 z-10 border-b border-ink/10 bg-white px-4 py-3">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-[0.05em] text-stone-600 uppercase">
                    Topping po produkcji
                  </p>
                  <h2 className="mt-1 text-base font-semibold break-words text-ink">
                    {item.ingredient.name}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileSheetOpen(false)}
                  aria-label="Zamknij edycję toppingu"
                  className="pro-focus-ring grid size-11 shrink-0 place-items-center rounded-full border border-ink/12 text-lg text-ink"
                >
                  ×
                </button>
              </div>
              <p className="mt-2 text-xs text-stone-600">
                Nie zmienia bilansu ani wyniku technicznego bazy.
              </p>
            </div>

            <div className="px-4 py-3">
              <IngredientPriceCell view={priceView} />
              <button
                type="button"
                onClick={() => {
                  setMobileSheetOpen(false);
                  setMenuOpen(true);
                }}
                className="pro-focus-ring mt-3 min-h-11 w-full rounded-xl border border-ink/12 bg-white px-3 text-left text-xs font-semibold text-ink"
              >
                Więcej opcji toppingu
              </button>
            </div>

            <div className="sticky bottom-0 border-t border-ink/10 bg-white px-4 pt-3 pb-4">
              <label className="grid gap-1.5">
                <span className="block text-xs font-semibold tracking-[0.05em] text-stone-600 uppercase">
                  Ilość
                </span>
                <DirectNumberControl
                  value={item.planned_grams}
                  min={0}
                  step={1}
                  decimals={Number.isInteger(item.planned_grams) ? 0 : 1}
                  suffix="g"
                  ariaLabel={`${item.ingredient.name} — ilość toppingu`}
                  onChange={(value) => onChange(Math.max(0, value))}
                  testId={`topping-mobile-grams-control-${item.id}`}
                  widthPreset="fluid"
                  publishValidDraft
                />
              </label>
              <button
                type="button"
                onClick={() => setMobileSheetOpen(false)}
                className="pro-focus-ring mt-3 min-h-12 w-full rounded-xl bg-ink px-4 text-sm font-semibold text-white"
              >
                Gotowe
              </button>
            </div>
          </div>
        </DialogShell>
      ) : null}
    </div>
  );
}
