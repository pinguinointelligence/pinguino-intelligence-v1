/**
 * DESIGN V3.0 HOME (IV-B/C + XII) — the ingredient panel.
 *
 * The row IS the way in: a tap opens the SAME editor PRO uses
 * (`IngredientEditorPanel` in `ingredient-builder`), straight away, as a compact bottom
 * layer. It replaces the row's „•••” menu, the separate „Zmień ilość” dialog and the
 * row's Crown button, and — for a product just picked — the „Ile chcesz dodać?” prompt.
 * HOME wires it; it does not copy it. What HOME leaves out is deliberate: no „Moja cena
 * i koszt” and no percent (§52), and the ingredient data under ⓘ is only the category
 * and „Pełne dane składnika” (VI: no availability line, and no second copy of the
 * amount that the field already shows).
 *
 * THE AMOUNT IS A DRAFT (owner 2026-09-06, kept): nothing reaches the store until
 * „Gotowe”. Escape closes the panel and confirms nothing. The field publishes a typed
 * amount when it blurs — also on Enter, which is the keyboard's „OK”: the keyboard goes
 * away and the panel stays. „Gotowe” reads the amount the field JUST published
 * (`latest`), never a draft from an earlier render (served 2026-09-18: typing 50 and
 * confirming kept 34 g).
 *
 * The Crown and the padlock act at once through their canonical doors, exactly as they
 * did in the dialog. Opening the panel and pressing „Gotowe” without a change writes
 * nothing, so looking at an ingredient never locks it.
 */
import { useRef, useState } from 'react';
import {
  IngredientEditorPanel,
  IngredientEditorSheet,
} from '@/features/ingredient-builder/IngredientLineControls';
import { categoryLabelPl } from '@/features/ingredient-builder/ingredientPresentation';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';
import { productProcessPl } from '@/features/product-intelligence/productProcessInformation';
import { productRecommendedDosagePl } from '@/features/product-intelligence/productDosageAuthority';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { isConfirmableAmount } from '../homeAddAmountDecision';

const copy = homeCreatorCopy.recipeScreen;

export interface HomeIngredientPanelTarget {
  /** The recipe line id, or the waiting product's key. */
  readonly key: string;
  readonly name: string;
  readonly category: string;
  readonly kind: 'ingredient' | 'topping';
  /**
   * A product picked but not in the recipe yet (§B): no line exists until a positive
   * amount is confirmed, so „Gotowe” without one leaves it waiting („0 g · Wpisz ilość”).
   */
  readonly pending: boolean;
  /** The amount the recipe holds right now — or where a new product's question starts. */
  readonly grams: number;
  readonly locked?: boolean;
  /** The padlock door; a topping has none. */
  readonly onToggleLock?: (() => void) | undefined;
  /** Only where the canonical authority allows Main (the caller decides). */
  readonly crown?: { readonly isMain: boolean; readonly onToggle: () => void } | null;
  readonly onReplace?: (() => void) | null;
  readonly behavior?: ProductBehaviorSnapshot | null;
  /** The manufacturer's dosage the „Ile chcesz dodać?” prompt showed, for a new product. */
  readonly recommendedDose?: string | null;
  /** The collection's own store door (#207), or the page's confirmation of a new product. */
  readonly commit: (grams: number) => void;
  readonly onRemove: () => void;
}

export function HomeIngredientPanel({
  target,
  canSeeGrams,
  onBlocked,
  onClose,
}: {
  target: HomeIngredientPanelTarget;
  canSeeGrams: boolean;
  /** Entitlement route when a masked amount is operated. */
  onBlocked: () => void;
  onClose: () => void;
}) {
  /** What the customer published in the field; `null` until they change the amount. */
  const [typed, setTyped] = useState<number | null>(null);
  const latest = useRef<number | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [fullData, setFullData] = useState(false);

  const publish = (next: number) => {
    latest.current = next;
    setTyped(next);
  };

  const finish = () => {
    const next = latest.current;
    if (target.pending) {
      // A new product joins the recipe only with a real, positive amount (§B) — the
      // amount typed, or the one the question started from (a topping's 5 %).
      const amount = next ?? target.grams;
      if (isConfirmableAmount(String(amount))) target.commit(amount);
      onClose();
      return;
    }
    if (next !== null && next !== target.grams) target.commit(next);
    onClose();
  };

  const masked = !target.pending && !canSeeGrams;
  const name = target.name;

  const info = (
    <div
      className="overflow-hidden rounded-[12px] border border-[#ebe7e0] text-[13px]"
      data-testid="home-panel-data"
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <span className="text-[var(--g-text-muted)]">{copy.category}</span>
        <span className="text-right text-[var(--g-ink)]">{categoryLabelPl(target.category)}</span>
      </div>
      <button
        type="button"
        aria-expanded={fullData}
        data-testid="home-panel-full-data"
        onClick={() => setFullData((open) => !open)}
        className="pro-focus-ring flex w-full items-center justify-between gap-3 border-t border-[#ebe7e0] px-3 py-2.5 text-left font-medium text-[var(--g-ink)]"
      >
        {copy.fullData}
        <svg
          aria-hidden
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          className={fullData ? 'rotate-90 transition-transform' : 'transition-transform'}
        >
          <path
            d="m6 3.5 4.5 4.5L6 12.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {fullData ? (
        /* The customer-facing product facts HOME already speaks (§52: never an id, a
           PAC/POD figure, a cost or a supplier). */
        <dl className="border-t border-[#ebe7e0]" data-testid="home-panel-full-data-list">
          <div className="flex items-start justify-between gap-3 px-3 py-2.5">
            <dt className="text-[var(--g-text-muted)]">{copy.fullDataProcess}</dt>
            <dd className="text-right text-[var(--g-ink)]">{productProcessPl(target.behavior)}</dd>
          </div>
          <div className="flex items-start justify-between gap-3 border-t border-[#ebe7e0] px-3 py-2.5">
            <dt className="text-[var(--g-text-muted)]">
              {homeCreatorCopy.recipe.askAmountRecommended}
            </dt>
            <dd className="text-right text-[var(--g-ink)]">
              {productRecommendedDosagePl(target.behavior)}
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  );

  return (
    <IngredientEditorSheet
      label={`${copy.panelLabel} — ${name}`}
      testId="home-ingredient-panel"
      onClose={onClose}
      onBackdrop={finish}
    >
      <IngredientEditorPanel
        testId="home-panel"
        tone="home"
        name={name}
        category={target.category}
        tag={target.kind === 'topping' ? copy.tagTopping : copy.tagIngredient}
        tagTone={target.kind === 'topping' ? 'topping' : 'ingredient'}
        info={info}
        infoAction={{
          label: copy.info,
          testId: 'home-panel-info',
          pressed: infoOpen,
          onClick: () => setInfoOpen((open) => !open),
        }}
        replaceAction={
          target.onReplace
            ? {
                label: homeCreatorCopy.recipe.findSubstitute,
                testId: 'home-panel-replace',
                onClick: target.onReplace,
              }
            : null
        }
        crownAction={
          target.crown
            ? {
                label: `${name} — ${homeCreatorCopy.recipe.crown}`,
                testId: `home-crown-${target.key}`,
                pressed: target.crown.isMain,
                onClick: target.crown.onToggle,
              }
            : null
        }
        amount={{
          value: typed ?? target.grams,
          // The draft, not the store — the whole point of „Gotowe”.
          onChange: publish,
          ariaLabel: `${name} — ${homeCreatorCopy.recipe.gramsFieldLabel}`,
          testId: 'home-panel-grams',
          suffix: homeCreatorCopy.recipe.grams,
          decimals: 0,
          lock: target.onToggleLock
            ? {
                pressed: target.locked === true,
                ariaLabel: `${name} — ${
                  target.locked
                    ? homeCreatorCopy.recipe.unlockLabel
                    : homeCreatorCopy.recipe.lockLabel
                }`,
                title: homeCreatorCopy.recipe.lockLabel,
                testId: 'home-panel-lock',
                onToggle: target.onToggleLock,
              }
            : null,
          masked: masked
            ? {
                value: homeCreatorCopy.recipe.maskedGramsValue,
                label: homeCreatorCopy.recipe.maskedGramsLabel,
                onInteract: onBlocked,
              }
            : null,
        }}
        amountNote={
          target.pending && target.recommendedDose
            ? `${homeCreatorCopy.recipe.askAmountRecommended}: ${target.recommendedDose}`
            : null
        }
        removeAction={{
          label: homeCreatorCopy.recipe.remove,
          testId: 'home-panel-remove',
          onClick: () => {
            target.onRemove();
            onClose();
          },
        }}
        doneAction={{
          label: homeCreatorCopy.recipe.doneAmount,
          testId: 'home-panel-done',
          onClick: finish,
        }}
      />
    </IngredientEditorSheet>
  );
}
