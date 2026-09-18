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
import type { RecipeMatch } from '../homeRecipeMatching';
import { HomeSuggestionsSheet } from '../ui/HomeSuggestionsSheet';
import type { CommunityMatch } from './communityMatchService';
import type { HomeSuggestionCard } from './homeIdeaSuggestions';
import { useHomeCommunityDoor } from './useHomeCommunityDoor';

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
  // The same Community door „Receptury → Community” uses. A match chosen from the
  // customer's own idea keeps that idea next to the recipe it became.
  const door = useHomeCommunityDoor(communityMatch, { keepIdea: true });

  return (
    <HomeSuggestionsSheet
      cards={cards}
      ideaLabel={ideaLabel}
      selectedId={selectedId}
      onSelect={onSelect}
      busy={busy || door.busy}
      message={message ?? door.message}
      onChoose={(card) => {
        if (card.source === 'official') {
          onChooseOfficial(card.match);
          return;
        }
        // A guest is asked to sign in and the layer stays with the choice; a refused
        // derivation stays on the layer and says so. Only a completed one closes it.
        void door.open().then((opened) => {
          if (opened) onDerived();
        });
      }}
      onCreateOwn={onCreateMyOwn}
      onSkip={onSkip}
    />
  );
}
