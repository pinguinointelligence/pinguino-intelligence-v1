/**
 * §18 — one resolved intent chip. Removable, and honest about its own state.
 *
 * A chip that has not resolved to a real Gellatti identity yet says so through a quiet
 * pending mark rather than looking finished: §22 forbids matching recipes against
 * guessed product text, so "not resolved yet" must be visible, not hidden.
 */
import { cn } from '@/lib/cn';
import { homeCreatorCopy } from '../homeCreatorCopy';
import type { IntentChip as IntentChipModel } from '../homeDraftStore';

export function HomeChip({
  chip,
  onRemove,
  onClick,
}: {
  chip: IntentChipModel;
  onRemove: () => void;
  onClick?: () => void;
}) {
  const label = chip.productName ?? chip.label;
  const needsChoice = chip.ambiguous;

  return (
    <span
      data-testid="home-intent-chip"
      data-resolved={chip.productId !== null}
      data-ambiguous={needsChoice}
      className={cn(
        'inline-flex min-h-[40px] items-center gap-1 rounded-full border py-1 pl-4 pr-1 text-[14px]',
      )}
      style={{
        borderColor: needsChoice ? 'var(--g-orange)' : 'var(--g-line)',
        background: 'var(--g-ivory)',
        color: 'var(--g-ink)',
      }}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          {label}
        </button>
      ) : (
        <span>{label}</span>
      )}
      {chip.role === 'topping' ? (
        <span
          className="ml-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.1em]"
          style={{ background: 'var(--g-stepper-face)', color: 'var(--g-text-muted)' }}
        >
          {homeCreatorCopy.recipe.topping.toUpperCase()}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${homeCreatorCopy.intent.removeChip} ${label}`}
        data-testid="home-intent-chip-remove"
        className="ml-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        style={{ color: 'var(--g-text-muted)' }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none">
          <path
            d="M2 2l8 8M10 2l-8 8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </span>
  );
}
