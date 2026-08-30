/**
 * §32–§40 — the popup's controller.
 *
 * Kept separate from `HomeCreatorPage` for one reason: a Community selection must go
 * through `useRecipeDerivation`, which is a HOOK with its own lifecycle. Calling it
 * from the page would mean holding a derivation target for a match that usually does
 * not exist. Here it is mounted only when a Community match is actually on screen, so
 * the canonical flow is used without HOME inventing a second one.
 *
 * §37/§38: derivation, lineage and root attribution are entirely
 * `useRecipeDerivation` + `recordDerivation`. There is no HOME lineage code.
 */
import { useRecipeDerivation } from '@/features/community/useRecipeDerivation';
import type { RecipeMatch } from '../homeRecipeMatching';
import { HomeMatchPopup } from '../ui/HomeMatchPopup';
import type { CommunityMatch } from './communityMatchService';

export function HomeMatchGate({
  official,
  community,
  communityMatch,
  onChooseOfficial,
  onCreateMyOwn,
  onDerived,
}: {
  official: readonly RecipeMatch[];
  community: RecipeMatch | null;
  /** The oracle row behind `community`, carrying its canonical address. */
  communityMatch: CommunityMatch | null;
  onChooseOfficial: (match: RecipeMatch) => void;
  onCreateMyOwn: () => void;
  onDerived: () => void;
}) {
  // The target is addressed by publication, exactly as the Community page does.
  const derivation = useRecipeDerivation({
    source: {
      kind: 'publication',
      publicationId: communityMatch?.publicationId ?? '',
      handle: communityMatch?.handle ?? '',
      slug: communityMatch?.slug ?? '',
    },
    sourceTitle: communityMatch?.title ?? '',
    sourceCreatorDisplayName: communityMatch?.creatorDisplayName ?? '',
  });

  return (
    <HomeMatchPopup
      official={official}
      community={community}
      onChooseOfficial={onChooseOfficial}
      onChooseCommunity={() => {
        if (communityMatch === null) return;
        // §37: the ORIGINAL is never modified — this creates an editable derivation
        // through the canonical authority, which records lineage and preserves the
        // root creator. HOME contributes nothing to that decision.
        void Promise.resolve(derivation.useThisRecipe()).then(onDerived);
      }}
      onCreateMyOwn={onCreateMyOwn}
    />
  );
}
