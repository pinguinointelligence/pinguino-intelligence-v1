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
 * `useRecipeDerivation` + the canonical save's `recordDerivation`. There is no HOME lineage code.
 */
import { useRecipeDerivation } from '@/features/community/useRecipeDerivation';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { presentLoadedRecipeInHome } from '../homeLoadedRecipe';
import type { RecipeMatch } from '../homeRecipeMatching';
import { HomeMatchPopup } from '../ui/HomeMatchPopup';
import type { CommunityMatch } from './communityMatchService';

type Derivation = ReturnType<typeof useRecipeDerivation>;

/**
 * A refusal in customer language. `useRecipeDerivation` already produces one through
 * the shared `customerErrorMessage`, so HOME renders it rather than inventing wording
 * — and never shows the raw refusal code.
 */
const derivationRefusalMessage = (derivation: Derivation): string | null =>
  derivation.state.status === 'failed'
    ? (derivation.state.message ?? homeCreatorCopy.match.couldNotOpen)
    : null;

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
  const derivation = useRecipeDerivation(
    {
      source: {
        kind: 'publication',
        publicationId: communityMatch?.publicationId ?? '',
        handle: communityMatch?.handle ?? '',
        slug: communityMatch?.slug ?? '',
      },
      sourceTitle: communityMatch?.title ?? '',
      sourceCreatorDisplayName: communityMatch?.creatorDisplayName ?? '',
    },
    {
      // The canonical derivation loads the working copy into the shared store; HOME is
      // already the page that shows it, so it only presents it — no navigation.
      openWorkingCopy: () =>
        presentLoadedRecipeInHome({
          label: communityMatch?.title ?? null,
          publicationId: communityMatch?.publicationId ?? null,
          keepIdea: true,
        }),
    },
  );

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
        //
        // ONLY a completed derivation may close the popup. `useRecipeDerivation`
        // returns a TYPED refusal (not entitled, source unavailable, save failed),
        // and an earlier version of this handler called `onDerived` unconditionally —
        // so a refused derivation closed the popup and marked the recipe ready with
        // ZERO lines. Found in served QA: the user got an empty recipe screen and no
        // explanation. A refusal must stay on the popup and say so.
        // Branch on the RETURNED outcome, never on `derivation.state` after the await:
        // that is React state captured in THIS render, so a success would read back as
        // `idle` and the popup would close for the wrong reason — or not at all.
        void Promise.resolve(derivation.useThisRecipe()).then((outcome) => {
          if (outcome.status === 'done') onDerived();
        });
      }}
      derivationMessage={derivationRefusalMessage(derivation)}
      onCreateMyOwn={onCreateMyOwn}
    />
  );
}
