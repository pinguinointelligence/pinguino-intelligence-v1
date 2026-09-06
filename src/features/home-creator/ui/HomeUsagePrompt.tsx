/**
 * §58 — „Jak chcesz tego użyć?", asked ONLY for a product that genuinely is both.
 *
 * Chocolate can be melted into the base or scattered on top and the catalogue cannot
 * settle which one this customer meant. Everything the catalogue CAN settle is settled
 * without asking — see `decideUsageRole`. So reaching this dialog is itself the statement
 * that the question is real.
 *
 * The copy is the canonical `homeCreatorCopy.recipe` keys, which already existed in both
 * locales and had never been rendered. No second source of words.
 */
import { buttonClasses } from '@/components/ui/buttonStyles';
import { homeCreatorCopy } from '../homeCreatorCopy';
import type { HomeUsageRole } from '../homeUsageRoleDecision';

export function HomeUsagePrompt({
  productName,
  onChoose,
  onCancel,
}: {
  productName: string;
  onChoose: (role: HomeUsageRole) => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[95] grid place-items-center bg-black/20 p-4"
      data-testid="home-usage-prompt"
      role="dialog"
      aria-modal="true"
      aria-label={`${productName} — ${homeCreatorCopy.recipe.howToUse}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <div
        className="w-full max-w-[380px] rounded-[16px] border bg-white p-5"
        style={{ borderColor: 'var(--g-line)' }}
      >
        {/* The product first, so the question is about something rather than in the
            abstract — the customer is mid-flow and may have picked several things. */}
        <p className="text-[15px]" style={{ color: 'var(--g-text-secondary)' }}>
          {productName}
        </p>
        <p className="mt-1 text-[17px]" style={{ color: 'var(--g-ink)' }}>
          {homeCreatorCopy.recipe.howToUse}
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            autoFocus
            data-testid="home-usage-as-ingredient"
            className={`${buttonClasses('primary', 'md')} w-full`}
            onClick={() => onChoose('ingredient')}
          >
            {homeCreatorCopy.recipe.asIngredient}
          </button>
          <button
            type="button"
            data-testid="home-usage-as-topping"
            className={`${buttonClasses('ivory', 'md')} w-full`}
            onClick={() => onChoose('topping')}
          >
            {homeCreatorCopy.recipe.asTopping}
          </button>
          <button
            type="button"
            data-testid="home-usage-cancel"
            className={`${buttonClasses('ghost', 'md')} w-full`}
            onClick={onCancel}
          >
            {homeCreatorCopy.draft.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
