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
import { resolveRecipesRepository } from '@/features/pro-core/proCoreRecipeRepo';
import { useRecipeStore } from '@/stores/recipeStore';
import { homeCreatorCopy } from '../homeCreatorCopy';
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

/**
 * Open the freshly derived recipe in HOME.
 *
 * By default `useRecipeDerivation` opens the result by navigating to `/pro/recipe`,
 * where the Pro workspace loads the recipe by id. A HOME subscriber never lands there
 * — §13 correctly redirects them back — so the derivation SUCCEEDED server-side
 * (recipe + lineage written) while the customer was returned to an empty intent
 * screen. Observed on staging 2026-08-31.
 *
 * HOME therefore passes this as the hook's `openDerived`, so the hook does not
 * navigate at all and the recipe is opened where the customer actually is.
 *
 * This adds no HOME-specific derive or copy logic: the recipe was created entirely by
 * the canonical flow. It only READS the result through the same repository the Pro
 * workspace reads, and loads it into the one shared store with `loadRecipeInput` —
 * exactly the pattern `RecipeVersionsSection` uses.
 */
async function openDerivedRecipe(recipeId: string): Promise<void> {
  const { repository } = resolveRecipesRepository();
  if (!repository) return;
  const recipe = await repository.getRecipe(recipeId);
  if (!recipe) return;
  const versions = await repository.getVersions(recipeId);
  // Pick by version NUMBER, not array position: ordering is a property of the backend
  // query, not of the port contract, and opening the wrong version would be silent.
  const latest = versions.reduce<(typeof versions)[number] | null>(
    (best, v) => (best === null || v.versionNumber > best.versionNumber ? v : best),
    null,
  );
  if (!latest) return;
  useRecipeStore.getState().loadRecipeInput(latest.recipeInput, {
    savedId: recipeId,
    savedName: recipe.title,
    versionNumber: latest.versionNumber,
    versionId: latest.versionId,
    versionDate: latest.createdAt,
    composition: latest.productComposition,
  });
}

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
    { openDerived: openDerivedRecipe },
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
