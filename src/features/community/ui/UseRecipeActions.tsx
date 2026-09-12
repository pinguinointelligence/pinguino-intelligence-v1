import { useState } from 'react';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { communityCopy } from '@/copy/community';
import { cn } from '@/lib/cn';
import type { LineageRelation } from '@/features/community/domain/lineage';
import {
  useRecipeDerivation,
  type DerivationTarget,
} from '@/features/community/useRecipeDerivation';
import { NewRecipeConfirmationDialog } from '@/features/recipes/NewRecipeConfirmationDialog';
import { hasUnsavedProRecipeChanges } from '@/pages/destinations/startNewProRecipe';

/**
 * „Zrób te lody" + „Stwórz moją wersję" (§20, §21, §22).
 *
 * Both open the recipe as the customer's working copy — the author's version is only read.
 * The customer's own recipe (and its lineage) is created at the first save. Opening replaces
 * the current draft, so unsaved work is confirmed first — exactly as the official Gellatti
 * library's „Zrób te lody" does — and never discarded silently.
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
 * Failure is shown, never swallowed.
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
  const {
    state,
    useThisRecipe: openCopy,
    createMyVersion: openRemix,
    isWorking,
  } = useRecipeDerivation(target);
  /** The action waiting for the customer to confirm discarding unsaved work. */
  const [pending, setPending] = useState<LineageRelation | null>(null);

  const open = (relation: LineageRelation) => void (relation === 'copy' ? openCopy() : openRemix());
  const request = (relation: LineageRelation) => {
    if (hasUnsavedProRecipeChanges()) {
      setPending(relation);
      return;
    }
    open(relation);
  };

  const body = (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={buttonClasses('primary')}
          onClick={() => request('copy')}
          disabled={isWorking}
          aria-busy={isWorking}
          data-testid="community-use-recipe"
        >
          {isWorking ? '…' : copy.actions.useThisRecipe}
        </button>
        <button
          type="button"
          className={buttonClasses('ghost')}
          onClick={() => request('remix')}
          disabled={isWorking}
          aria-busy={isWorking}
          data-testid="community-create-version"
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
              : (state.message ?? 'Nie udało się otworzyć tej receptury.')}
        </p>
      ) : null}

      <NewRecipeConfirmationDialog
        open={pending !== null}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const relation = pending;
          setPending(null);
          if (relation) open(relation);
        }}
      />
    </>
  );

  if (bare) return <div className={cn('flex flex-col gap-3', className)}>{body}</div>;

  return (
    <div className={cn('rounded-md border border-ink/10 bg-paper p-6', className)}>
      <p className="text-sm text-stone-500">
        Otworzymy tę recepturę jako Twoją kopię roboczą — zapiszesz ją jako własną. Oryginał autora
        pozostaje bez zmian.
      </p>
      <div className="mt-4 flex flex-col gap-3">{body}</div>
    </div>
  );
}
