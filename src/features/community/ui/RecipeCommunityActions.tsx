import { useState } from 'react';
import { communityCopy } from '@/copy/community';
import { cn } from '@/lib/cn';
import { PublishToCommunityDialog } from './PublishToCommunityDialog';
import { ShareRecipeDialog } from './ShareRecipeDialog';

/**
 * „Udostępnij recepturę" + „Opublikuj w Community" on a saved recipe row.
 *
 * This is where BOTH loops start, so it belongs in the recipe library rather
 * than behind a menu: a creator publishes from the list of things they have
 * actually saved, and shares the specific version they are looking at.
 *
 * The two actions are deliberately adjacent AND deliberately distinct (§4,
 * §11). Sharing creates an unlisted link and publishes nothing; publishing
 * makes the recipe discoverable. Each dialog says which it is doing, so the
 * pair can never be mistaken for one another.
 *
 * `versionNumber` is whatever version the row currently has selected — the
 * share and the publication bind THAT immutable snapshot (§5), not „latest".
 */
export function RecipeCommunityActions({
  recipeId,
  versionNumber,
  recipeName,
  hasCreatorProfile,
  className,
}: {
  recipeId: string;
  versionNumber: number;
  recipeName: string;
  hasCreatorProfile: boolean;
  className?: string;
}) {
  const copy = communityCopy;
  const [open, setOpen] = useState<'share' | 'publish' | null>(null);

  return (
    <>
      <span className={cn('flex items-center gap-3', className)}>
        <button
          type="button"
          className="text-xs text-stone-500 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-ink"
          onClick={() => setOpen('share')}
        >
          {copy.actions.shareRecipe}
        </button>
        <button
          type="button"
          className="text-xs text-stone-500 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-ink"
          onClick={() => setOpen('publish')}
        >
          {copy.actions.publishToCommunity}
        </button>
      </span>

      {open === 'share' ? (
        <ShareRecipeDialog
          recipeId={recipeId}
          versionNumber={versionNumber}
          onClose={() => setOpen(null)}
        />
      ) : null}

      {open === 'publish' ? (
        <PublishToCommunityDialog
          recipeId={recipeId}
          versionNumber={versionNumber}
          defaultTitle={recipeName}
          hasCreatorProfile={hasCreatorProfile}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}
