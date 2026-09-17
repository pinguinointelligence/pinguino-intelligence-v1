/**
 * DESIGN V3.0 VIII — „Znaleźliśmy pasujące receptury.” A match is an OPTION, never a
 * replacement: nothing is chosen by opening, scrolling or closing this layer.
 *
 *   • tap a card        → it is chosen (ring + ✓); „Wybierz” becomes available;
 *   • „Wybierz”         → that recipe opens as the customer's working copy;
 *   • „Tworzę swoją”    → the customer's own recipe from their own ingredients;
 *   • „Pomiń” / Escape  → back to the idea (before the CTA) or on with the own recipe
 *                          (after it) — the caller decides which, by where it opened.
 *
 * CUSTOMER LANGUAGE ONLY: no canonical id, rank score or matching vocabulary, and never
 * a gram (a card carries identity, a photo and ingredient NAMES only).
 */
import { useRef, useState } from 'react';
import { DialogShell } from '@/components/ui/DialogShell';
import { homeCreatorCopy } from '../homeCreatorCopy';
import type { HomeSuggestionCard } from '../matching/homeIdeaSuggestions';
import {
  HomeRecipeCarousel,
  HomeRecipeCarouselNav,
  type HomeRecipeCarouselHandle,
} from './HomeRecipeCarousel';

/**
 * Owner 2026-09-17: „Zawiera też” is a SHORT, secondary line on the card. The full list
 * is not lost — the chosen card shows it in full under the carousel, and every card
 * carries it in its accessible name. No extra panel, no extra step, never empty.
 */
const ALSO_INCLUDES_ON_CARD = 3;

export function HomeSuggestionsSheet({
  cards,
  ideaLabel,
  selectedId,
  onSelect,
  onChoose,
  onCreateOwn,
  onSkip,
  busy = false,
  message = null,
}: {
  cards: readonly HomeSuggestionCard[];
  ideaLabel: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChoose: (card: HomeSuggestionCard) => void;
  onCreateOwn: () => void;
  onSkip: () => void;
  busy?: boolean;
  /** A refusal of the chosen recipe, in customer language. It stays on the layer. */
  message?: string | null;
}) {
  const copy = homeCreatorCopy.match;
  const carousel = useRef<HomeRecipeCarouselHandle>(null);
  const [hint, setHint] = useState<string | null>(null);
  const chosen = cards.find((card) => card.id === selectedId) ?? null;
  const alsoIncludesLines = (names: readonly string[]) => {
    if (names.length === 0) return { short: null, full: null };
    const shown = names.slice(0, ALSO_INCLUDES_ON_CARD);
    const rest = names.length - shown.length;
    return {
      short: `${copy.alsoIncludes} ${shown.join(', ')}${rest > 0 ? ` ${copy.alsoIncludesMore(rest)}` : ''}`,
      full: `${copy.alsoIncludes} ${names.join(', ')}`,
    };
  };
  const chosenAlsoIncludes = chosen ? alsoIncludesLines(chosen.alsoIncludes) : null;

  return (
    <DialogShell
      label={copy.suggestionsTitle}
      testId="home-suggestions"
      panelTestId="home-suggestions-panel"
      placement="home-layer"
      size="wide"
      dismissOnBackdrop
      onClose={onSkip}
    >
      <div className="home-sugg-hd">
        <div>
          <b className="home-sugg-title">{copy.suggestionsTitle}</b>
          <small className="home-sugg-sub">{copy.suggestionsSubtitle}</small>
        </div>
        <HomeRecipeCarouselNav
          onScroll={(direction) => carousel.current?.scrollByCard(direction)}
          previousLabel={copy.previousCards}
          nextLabel={copy.nextCards}
        />
      </div>
      <div className="home-sugg-body">
        <HomeRecipeCarousel
          ref={carousel}
          cards={cards.map((card) => {
            const includes = alsoIncludesLines(card.alsoIncludes);
            return {
              id: card.id,
              title: card.title,
              imageUrl: card.imageUrl,
              eyebrow: card.eyebrow,
              subline: card.subline,
              basedOn: card.basedOn ? `${copy.basedOnOriginal} ${card.basedOn}` : null,
              usedForm: card.usedForm ? `${copy.usedForm} ${card.usedForm}` : null,
              alsoIncludes: includes.short,
              alsoIncludesFull: includes.full,
              searchIncomplete: card.searchIncomplete ? copy.searchIncomplete : null,
            };
          })}
          selectedId={selectedId}
          onSelect={(id) => {
            setHint(null);
            onSelect(id);
          }}
          label={copy.suggestionsCarousel(ideaLabel)}
          testId="home-suggestions-carousel"
        />
        {chosenAlsoIncludes?.full && chosenAlsoIncludes.full !== chosenAlsoIncludes.short ? (
          <p className="home-sugg-also" data-testid="home-suggestions-also-full">
            {chosenAlsoIncludes.full}
          </p>
        ) : null}
        {message || hint ? (
          <p className="home-sugg-note" role="status" data-testid="home-suggestions-message">
            {message ?? hint}
          </p>
        ) : null}
      </div>
      <div className="home-sugg-foot">
        <div className="home-sugg-pair">
          <button
            type="button"
            className="home-pill"
            onClick={onCreateOwn}
            data-testid="home-suggestions-create-own"
          >
            {copy.createOwnShort}
          </button>
          <button
            type="button"
            className="home-pill"
            onClick={onSkip}
            data-testid="home-suggestions-skip"
          >
            {copy.skip}
          </button>
        </div>
        <button
          type="button"
          className="home-cta"
          aria-disabled={chosen === null || busy}
          data-testid="home-suggestions-choose"
          onClick={() => {
            if (busy) return;
            if (chosen === null) {
              setHint(copy.chooseFirst);
              return;
            }
            onChoose(chosen);
          }}
        >
          {copy.choose}
        </button>
      </div>
    </DialogShell>
  );
}
