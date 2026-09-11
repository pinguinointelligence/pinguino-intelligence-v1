import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { useRecipeStore } from '@/stores/recipeStore';
import { recipeProfileContextLabel } from '@/features/pro-core/recipeProfileContext';

const bar = copy.proWorkbench.recipeBar;

/**
 * PRO MOBILE UX v2 · B2/B3/B11 — the edge the Receptura dashboard lifts into.
 *
 * On a phone the dashboard (recipe name + ZAPISZ, result, Dostosuj recepturę,
 * Ustawienia) is a sheet above the ingredient workspace. When it is not open,
 * THIS bar is what stays of it: the recipe's name, its active profile in the
 * same sentence the workbar card prints, and where the customer is now. One tap
 * brings the dashboard back down from exactly here. It is sticky, so it stays
 * in reach while the ingredient list scrolls under it, and it hides from the
 * workbench breakpoint up, where the dashboard is a permanent column instead.
 */
export function RecipeContextBar({
  stage,
  settingsPending,
  onOpen,
}: {
  /** The module the customer is in, in the bottom bar's own words. */
  stage: string;
  /** Settings still need a confirmation — the one condition worth an orange dot here. */
  settingsPending: boolean;
  onOpen: () => void;
}) {
  const savedRecipeName = useRecipeStore((state) => state.savedRecipeName);
  const context = useRecipeStore((state) => recipeProfileContextLabel(state));
  const name = savedRecipeName?.trim() ? savedRecipeName : bar.unnamed;

  return (
    <div
      className="pro-workbench-mobile-only sticky top-0 z-30 border-b border-ink/10 bg-white/95 backdrop-blur-sm"
      data-testid="pro-recipe-context-bar"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-label={`${bar.open}: ${name}`}
        data-testid="pro-recipe-context-open"
        className="gellatti-touch-control pro-focus-ring flex min-h-12 w-full min-w-0 items-center gap-3 px-[var(--pro-mobile-gutter)] py-1.5 text-left"
      >
        <span
          aria-hidden
          className="relative grid size-7 shrink-0 place-items-center rounded-full border border-[var(--g-line)] text-[var(--g-ink)]"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {settingsPending ? (
            <i className="absolute -top-0.5 -right-0.5 size-2 rounded-full border border-white bg-[#f58a07]" />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] leading-[1.25] font-bold text-[var(--g-ink)]">
            {name}
          </span>
          <span
            className={cn(
              'block truncate text-[11px] leading-[1.3]',
              settingsPending ? 'text-[var(--g-attention-ink)]' : 'text-[var(--g-text-secondary)]',
            )}
            data-testid="pro-recipe-context-profile"
          >
            {settingsPending ? bar.settingsPending : context}
          </span>
        </span>
        <span
          className="shrink-0 rounded-full bg-[var(--g-ivory)] px-2.5 py-1 text-[10px] leading-none font-semibold tracking-[0.08em] text-[var(--g-ink)] uppercase"
          data-testid="pro-recipe-context-stage"
        >
          {stage}
        </span>
      </button>
    </div>
  );
}
