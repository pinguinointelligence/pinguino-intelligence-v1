/**
 * „Zmień ilość" — owner QA 2026-09-06.
 *
 * The amount used to be edited IN THE ROW: the readout was replaced by the stepper, so
 * the row grew, the list shifted and the buttons under it moved. The owner reported
 * that as a layout defect, and it was also a correctness one — the in-row control
 * committed on every keystroke, so „Anuluj" had nothing left to cancel.
 *
 * This is the same dialog chrome as `HomeAmountPrompt` (§B) and the same canonical
 * `DirectNumberControl` the PRO builder uses, so minus / field / plus, masking and the
 * entitlement routing all arrive unchanged. What is new is only that the value is a
 * DRAFT: nothing reaches the store until „Gotowe". Escape and „Anuluj" are no-ops.
 *
 * The row keeps rendering its readout behind this overlay, so opening the editor moves
 * nothing on the page.
 */
import { useState } from 'react';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { DirectNumberControl } from '@/features/ingredient-builder/DirectNumberControl';
import { homeCreatorCopy } from '../homeCreatorCopy';

export function HomeChangeAmountDialog({
  name,
  grams,
  canSeeGrams,
  onBlocked,
  locked,
  onToggleLock,
  onConfirm,
  onCancel,
}: {
  name: string;
  /** The amount as the row shows it right now — the draft starts here. */
  grams: number;
  canSeeGrams: boolean;
  /**
   * The lock lived INSIDE the in-row stepper. Replacing that stepper with this dialog
   * would have silently removed the only way to lock an amount, so it travels with the
   * control it has always belonged to.
   */
  locked?: boolean;
  onToggleLock?: (() => void) | undefined;
  onBlocked: () => void;
  onConfirm: (grams: number) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(grams);

  return (
    <div
      className="fixed inset-0 z-[95] grid place-items-center bg-black/20 p-4"
      data-testid="home-change-amount"
      role="dialog"
      aria-modal="true"
      aria-label={`${homeCreatorCopy.recipe.changeAmount} — ${name}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
        // Enter confirms from anywhere in the dialog, including the stepper's field.
        if (event.key === 'Enter') onConfirm(draft);
      }}
    >
      <div
        className="w-full max-w-[380px] rounded-[16px] border bg-white p-5"
        style={{ borderColor: 'var(--g-line)' }}
      >
        <p className="text-[17px]" style={{ color: 'var(--g-ink)' }}>
          {homeCreatorCopy.recipe.changeAmount} — {name}
        </p>

        <div className="mt-4 flex justify-center">
          <DirectNumberControl
            value={draft}
            step={1}
            min={0}
            decimals={0}
            suffix={homeCreatorCopy.recipe.grams}
            ariaLabel={`${name} — ${homeCreatorCopy.recipe.gramsFieldLabel}`}
            testId="home-change-amount-grams"
            widthPreset="grams"
            density="responsive"
            // The draft, not the store. This is the whole point of the dialog.
            onChange={setDraft}
            {...(onToggleLock
              ? {
                  lockSegment: {
                    pressed: locked === true,
                    ariaLabel: `${name} — ${homeCreatorCopy.recipe.lockLabel}`,
                    title: homeCreatorCopy.recipe.lockLabel,
                    suffix: 'g',
                    testId: 'home-change-amount-lock',
                    onToggle: onToggleLock,
                  },
                }
              : {})}
            {...(canSeeGrams
              ? {}
              : {
                  maskedValue: homeCreatorCopy.recipe.maskedGramsValue,
                  maskedLabel: homeCreatorCopy.recipe.maskedGramsLabel,
                  onMaskedInteract: onBlocked,
                })}
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className={buttonClasses('ghost', 'md')}
            data-testid="home-change-amount-cancel"
            onClick={onCancel}
          >
            {homeCreatorCopy.recipe.askAmountCancel}
          </button>
          <button
            type="button"
            className={buttonClasses('primary', 'md')}
            data-testid="home-change-amount-confirm"
            onClick={() => onConfirm(draft)}
          >
            {homeCreatorCopy.recipe.doneAmount}
          </button>
        </div>
      </div>
    </div>
  );
}
