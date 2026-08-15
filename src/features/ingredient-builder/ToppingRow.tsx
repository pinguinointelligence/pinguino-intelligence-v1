import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import { DirectNumberControl } from './DirectNumberControl';
import {
  CustomerPriceEditor,
  IngredientPriceCell,
  type IngredientPriceView,
} from './IngredientPriceControl';
import { DialogShell } from './IngredientRow';
import { ProductPickerPopover } from './ProductPickerPopover';
import type { IngredientLibrary } from './ingredientLibrary';
import {
  isCatalogLabelToppingIngredient,
  type RecipeToppingIngredient,
} from '@/features/recipe-composition/labelTopping';
import type { ProductBehaviorContext, ProductBehaviorSnapshot } from '@/features/product-intelligence';

export const TOPPING_ROW_GRID =
  'grid grid-cols-1 items-center gap-x-3 gap-y-3 md:grid-cols-[minmax(190px,1.5fr)_minmax(200px,1fr)_96px_44px]';

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
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const catalogLabel = isCatalogLabelToppingIngredient(item.ingredient)
    ? item.ingredient
    : null;
  return (
    <div
      className="border-b border-status-ideal/15 bg-pro-sage/28 px-3 py-3 hover:bg-pro-sage/45"
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
      <div className={TOPPING_ROW_GRID}>
        <div className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              draggable
              onDragStart={onDragStart}
              className="inline-grid size-11 shrink-0 cursor-grab select-none place-items-center text-base leading-none text-stone-400 active:cursor-grabbing md:size-6"
              title="Przeciągnij, aby zmienić kolejność"
            >
              ⠿
            </span>
            <span className="shrink-0 rounded-lg border border-status-ideal/20 bg-pro-sage px-2 py-1 text-xs font-semibold text-ink">
              Topping
            </span>
            <strong className="truncate text-[13px] font-semibold text-ink" title={item.ingredient.name}>
              {item.ingredient.name}
            </strong>
          </span>
          <span className="mt-1 block pl-6 text-xs text-stone-600">Dodatek po produkcji</span>
          {catalogLabel ? (
            <span
              className={cn(
                'mt-1 inline-flex rounded-md px-2 py-1 text-xs font-semibold',
                catalogLabel.verification_status === 'verified'
                  ? 'bg-status-ideal/12 text-status-ideal'
                  : 'bg-sky-100 text-sky-800',
              )}
              data-testid="catalog-topping-verification"
            >
              {catalogLabel.verification_status === 'verified'
                ? 'Zweryfikowany produkt katalogowy'
                : 'Dodany manualnie · niezweryfikowany'}
            </span>
          ) : null}
        </div>

        <div>
          <span className="mb-1 block text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase md:hidden">
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
            testId={`topping-grams-${item.id}`}
          />
          {item.planned_grams < 1 ? (
            <p
              className="mt-1 text-xs leading-relaxed text-attention"
              data-testid={`topping-dose-missing-${item.id}`}
            >
              Podaj ilość toppingu.
            </p>
          ) : null}
        </div>

        <IngredientPriceCell view={priceView} />

        <button
          type="button"
          className="pro-focus-ring grid size-11 place-items-center rounded-full border border-ink/10 text-sm text-stone-500 hover:border-ink/35 hover:text-ink"
          aria-label={`Opcje toppingu ${item.ingredient.name}`}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          •••
        </button>
      </div>

      {menuOpen ? (
        <DialogShell
          label={`Opcje toppingu ${item.ingredient.name}`}
          testId={`topping-menu-${item.id}`}
          onClose={() => setMenuOpen(false)}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase">Topping</p>
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
          <p className="mt-4 px-2 text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase">Dane</p>
          <details className="mx-2 mt-2 rounded-xl border border-ink/10 bg-stone-50 px-3 py-2">
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
                    <dd className="text-right font-medium text-ink">{catalogLabel.ingredients_text}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-stone-600">Alergeny z etykiety</dt>
                    <dd className="text-right font-medium text-ink">{catalogLabel.allergens_text}</dd>
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
              behaviorContext={behaviorContext}
              triggerLabel="Zamień topping"
              onAdd={(ingredient, behavior) => {
                onReplace(ingredient, behavior);
                setMenuOpen(false);
              }}
            />
          </div>
          <div className="my-2 border-t border-ink/10" />
          <p className="px-2 text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase">Kolejność</p>
          {([
            ['Przesuń wyżej', -1, !canMoveUp],
            ['Przesuń niżej', 1, !canMoveDown],
          ] as const).map(([label, direction, disabled]) => (
            <button
              key={label}
              type="button"
              disabled={disabled}
              className={cn(
                'min-h-11 w-full rounded-lg px-2 py-2 text-left text-xs text-ink hover:bg-stone-50',
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
    </div>
  );
}
