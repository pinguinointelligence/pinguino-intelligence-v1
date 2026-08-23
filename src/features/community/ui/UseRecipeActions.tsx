import { buttonClasses } from '@/components/ui/buttonStyles';
import { communityCopy } from '@/copy/community';
import { cn } from '@/lib/cn';
import {
  useRecipeDerivation,
  type DerivationTarget,
} from '@/features/community/useRecipeDerivation';

/**
 * „Użyj tej receptury" + „Stwórz moją wersję" (§20, §21, §22).
 *
 * One component for both surfaces — the public Community page and a direct
 * share — because the two actions must behave identically wherever they are
 * offered. The only difference is which source the derivation reads from, and
 * that is data, not a branch in the UI.
 *
 * Both buttons are disabled while a derivation is in flight, so a double click
 * cannot produce two recipes; the hook additionally guards with a ref so the
 * second click of a fast double-click is dropped before React re-renders.
 *
 * Failure is shown, never swallowed. In particular the „recipe saved but
 * attribution failed" case says exactly that, because the user does have their
 * recipe and telling them it failed outright would be false.
 */
export function UseRecipeActions({
  target,
  bare = false,
  className,
}: {
  target: DerivationTarget;
  /** Skip the surrounding card — the caller already drew one. */
  bare?: boolean;
  className?: string;
}) {
  const copy = communityCopy;
  const { state, useThisRecipe, createMyVersion, isWorking } = useRecipeDerivation(target);

  const body = (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={buttonClasses('primary')}
          onClick={useThisRecipe}
          disabled={isWorking}
          aria-busy={isWorking}
        >
          {isWorking ? '…' : copy.actions.useThisRecipe}
        </button>
        <button
          type="button"
          className={buttonClasses('ghost')}
          onClick={createMyVersion}
          disabled={isWorking}
          aria-busy={isWorking}
        >
          {copy.actions.createMyVersion}
        </button>
      </div>

      {state.status === 'failed' ? (
        <p role="alert" className="text-sm text-ink">
          {state.reason === 'not_entitled'
            ? copy.demo.gramsHidden
            : state.reason === 'source_unavailable'
              ? copy.share.notFound
              : (state.message ?? 'Nie udało się zapisać kopii.')}
        </p>
      ) : null}
    </>
  );

  if (bare) return <div className={cn('flex flex-col gap-3', className)}>{body}</div>;

  return (
    <div className={cn('rounded-md border border-ink/10 bg-paper p-6', className)}>
      <p className="text-sm text-stone-500">
        Masz aktywny plan — możesz zapisać własną, niezależną kopię. Oryginał autora pozostaje bez
        zmian.
      </p>
      <div className="mt-4 flex flex-col gap-3">{body}</div>
    </div>
  );
}
