/**
 * §32–§40 — the suggestions layer's controller (DESIGN V3.0 VIII).
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
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useRecipeDerivation } from '@/features/community/useRecipeDerivation';
import { useAuthStore } from '@/stores/authStore';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { presentLoadedRecipeInHome } from '../homeLoadedRecipe';
import type { RecipeMatch } from '../homeRecipeMatching';
import { HomeSuggestionsSheet } from '../ui/HomeSuggestionsSheet';
import type { CommunityMatch } from './communityMatchService';
import type { HomeSuggestionCard } from './homeIdeaSuggestions';

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
  cards,
  communityMatch,
  ideaLabel,
  selectedId,
  onSelect,
  onChooseOfficial,
  onCreateMyOwn,
  onSkip,
  onDerived,
  busy = false,
  message = null,
}: {
  cards: readonly HomeSuggestionCard[];
  /** The oracle row behind the Community card, carrying its canonical address. */
  communityMatch: CommunityMatch | null;
  ideaLabel: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChooseOfficial: (match: RecipeMatch) => void;
  onCreateMyOwn: () => void;
  onSkip: () => void;
  onDerived: () => void;
  busy?: boolean;
  message?: string | null;
}) {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const openAuthModal = useAuthModalStore((state) => state.open);
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
    <HomeSuggestionsSheet
      cards={cards}
      ideaLabel={ideaLabel}
      selectedId={selectedId}
      onSelect={onSelect}
      busy={busy || derivation.state.status === 'working'}
      message={message ?? derivationRefusalMessage(derivation)}
      onChoose={(card) => {
        if (card.source === 'official') {
          onChooseOfficial(card.match);
          return;
        }
        if (communityMatch === null) return;
        // A derivation is saved to an account. A guest is asked to sign in first and the
        // layer stays with the choice — exactly as the official-recipe path does.
        if (!userId) {
          openAuthModal();
          return;
        }
        // §37: the ORIGINAL is never modified — this creates an editable derivation
        // through the canonical authority, which records lineage and preserves the
        // root creator. HOME contributes nothing to that decision.
        //
        // ONLY a completed derivation may close the layer. `useRecipeDerivation`
        // returns a TYPED refusal (not entitled, source unavailable, save failed); a
        // refused derivation must stay on the layer and say so (served QA 2026-08-31:
        // an unconditional close marked the recipe ready with ZERO lines).
        // Branch on the RETURNED outcome, never on `derivation.state` after the await.
        void Promise.resolve(derivation.useThisRecipe()).then((outcome) => {
          if (outcome.status === 'done') onDerived();
        });
      }}
      onCreateOwn={onCreateMyOwn}
      onSkip={onSkip}
    />
  );
}
