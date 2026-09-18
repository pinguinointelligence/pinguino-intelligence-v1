/**
 * §B — „Ile chcesz dodać <product>?", asked BEFORE the recipe line exists.
 *
 * Shown only for a product the existing Crown authority cannot carry. Nothing is added
 * until a positive amount is confirmed, so HOME never creates a 0 g line and never
 * reports the minimum-1-g rule back to the customer as their problem to repair.
 */
import { useState } from 'react';
import { buttonClasses } from '@/components/ui/buttonStyles';
import '@/components/ui/homeLayer.css';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { confirmedGrams, isConfirmableAmount } from '../homeAddAmountDecision';

export function HomeAmountPrompt({
  productName,
  recommendedDose,
  initialGrams,
  onConfirm,
  onCancel,
  cancelLabel = homeCreatorCopy.recipe.askAmountCancel,
}: {
  productName: string;
  /** Canonical dosage authority, or null when the product genuinely carries none. */
  recommendedDose: string | null;
  /** Toppings begin at the exact canonical 5% projection; BASE questions stay blank. */
  initialGrams?: number | null;
  onConfirm: (grams: number) => void;
  onCancel: () => void;
  /**
   * „Usuń” when cancelling removes something the customer already has (an idea chip
   * waiting for its amount); „Anuluj” when nothing exists yet (a live add).
   */
  cancelLabel?: string;
}) {
  const [raw, setRaw] = useState(
    initialGrams != null && initialGrams > 0 ? String(initialGrams) : '',
  );
  const [touched, setTouched] = useState(false);
  const valid = isConfirmableAmount(raw);

  return (
    <div
      // DESIGN V3.0 XIII: the HOME layer frame — a compact bottom layer on a phone and a
      // portrait tablet, a light centred modal from 1024 px (`homeLayer.css`).
      className="home-layer-scrim home-layer-overlay fixed inset-0 z-[95]"
      data-testid="home-amount-prompt"
      role="dialog"
      aria-modal="true"
      aria-label={`${homeCreatorCopy.recipe.askAmountTitle} ${productName}?`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <div className="home-layer-panel">
        <p className="text-[17px]" style={{ color: 'var(--g-ink)' }}>
          {homeCreatorCopy.recipe.askAmountTitle} {productName}?
        </p>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            aria-label={`Zmniejsz ilość ${productName}`}
            data-testid="home-amount-prompt-minus"
            className="grid size-11 place-items-center rounded-[10px] border text-lg"
            style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
            onClick={() => {
              setRaw(String(Math.max(1, (valid ? confirmedGrams(raw) : 1) - 1)));
              setTouched(true);
            }}
          >
            −
          </button>
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            value={raw}
            data-testid="home-amount-prompt-input"
            aria-label={`${productName} — ${homeCreatorCopy.recipe.gramsFieldLabel}`}
            onChange={(event) => {
              setRaw(event.currentTarget.value);
              setTouched(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && valid) onConfirm(confirmedGrams(raw));
            }}
            className="h-11 w-[110px] rounded-[10px] border px-3 text-center font-mono text-[15px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--g-orange-line)]"
            style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
          />
          <span className="text-[15px]" style={{ color: 'var(--g-text-secondary)' }}>
            {homeCreatorCopy.recipe.grams}
          </span>
          <button
            type="button"
            aria-label={`Zwiększ ilość ${productName}`}
            data-testid="home-amount-prompt-plus"
            className="grid size-11 place-items-center rounded-[10px] border text-lg"
            style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
            onClick={() => {
              setRaw(String((valid ? confirmedGrams(raw) : 0) + 1));
              setTouched(true);
            }}
          >
            +
          </button>
        </div>

        {/* Shown ONLY when the canonical dosage authority carries a value. HOME never
            invents a range and never converts a percent to grams itself. */}
        {recommendedDose ? (
          <p
            className="mt-3 text-[13px]"
            data-testid="home-amount-prompt-dose"
            style={{ color: 'var(--g-text-secondary)' }}
          >
            {homeCreatorCopy.recipe.askAmountRecommended}: {recommendedDose}
          </p>
        ) : null}

        {touched && !valid ? (
          <p
            className="mt-3 text-[13px]"
            role="alert"
            data-testid="home-amount-prompt-invalid"
            style={{ color: 'var(--g-attention-ink)' }}
          >
            {homeCreatorCopy.recipe.askAmountInvalid}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className={buttonClasses('ghost', 'md')}
            data-testid="home-amount-prompt-cancel"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!valid}
            className={buttonClasses('primary', 'md')}
            data-testid="home-amount-prompt-confirm"
            onClick={() => onConfirm(confirmedGrams(raw))}
          >
            {homeCreatorCopy.recipe.askAmountConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
