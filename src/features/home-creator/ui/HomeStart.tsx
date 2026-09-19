/**
 * DESIGN V3.0 VI + IX — the HOME start screen.
 *
 * Two modes on top, „Twój pomysł” | „Receptury”, and ONE primary action at the bottom in
 * both: „Rozpocznij recepturę”. It is visibly inactive until there is something to start
 * from — a base idea chip or typed text, or a chosen recipe — and it never covers content:
 * the bar is pinned to the bottom of the screen but stays part of the page flow, so the
 * last tile or card can always be scrolled above it (and it respects the home indicator).
 *
 * The action opens nothing by itself. Each mode hands over to a door that already exists:
 *   • „Twój pomysł” — the page's own CTA handler (`submitIdea`: suggestions → profile …);
 *   • „Receptury”, a Gellatti recipe — the page's `adoptOfficialRecipe` (asks a guest to
 *     sign in, opens the working copy, never changes the original);
 *   • „Receptury”, a Community recipe — the Community door the suggestions layer uses
 *     (`useHomeCommunityDoor`: sign-in for a guest, the canonical derivation).
 *
 * After the idea was sent the same action goes back into the document under the composer
 * (as the old inline CTA did), so no second fixed bar ever stands over the next questions.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { homeCreatorCopy } from '../homeCreatorCopy';
import type { HomeStartMode } from '../homeComposerGate';
import { ingestIdeaText } from '../homeIdeaIngest';
import {
  EMPTY_LIBRARY_VIEW,
  type HomeLibraryChoice,
  type HomeLibraryView,
} from '../homeLibraryModel';
import { useHomeCommunityDoor } from '../matching/useHomeCommunityDoor';
import { HomeStartModes } from './HomeRecipeOrigin';
import { HomeRecipeLibrary } from './HomeRecipeLibrary';
import './homeRecipeCards.css';
import './homeStart.css';

export function HomeStart({
  draftId,
  mode,
  onModeChange,
  atStart,
  idea,
  ideaReady,
  onStartIdea,
  onOpenOfficial,
  onCommunityOpened,
  busy = false,
  libraryRefusal = null,
  onReset,
  resetEnabled,
}: {
  /** A new HOME draft (new recipe, account switch) is a fresh start screen. */
  draftId: string;
  mode: HomeStartMode;
  onModeChange: (mode: HomeStartMode) => void;
  /** Nothing was sent or opened yet: the two modes show and the action is pinned. */
  atStart: boolean;
  /** „Twój pomysł”: the composer section. */
  idea: ReactNode;
  /** „Twój pomysł” has a minimal input (`startCtaEnabled`). */
  ideaReady: boolean;
  onStartIdea: () => void;
  /** A Gellatti recipe was chosen in „Receptury”: open it through the official door. */
  onOpenOfficial: (recipeId: string) => void;
  /** The Community door completed: the working copy is now HOME's recipe. */
  onCommunityOpened: () => void;
  /** A recipe is being opened or the idea is being checked. */
  busy?: boolean;
  /** Why a Gellatti recipe chosen here could not be opened (the official door's refusal). */
  libraryRefusal?: { readonly recipeId: string; readonly message: string } | null;
  /** §H1b — „Reset" in the top workspace row: the ONE clean start, asked for first. */
  onReset: () => void;
  /** Nothing to clear yet: the action stays, quietly, instead of promising a no-op. */
  resetEnabled: boolean;
}) {
  const copy = homeCreatorCopy;
  const [view, setView] = useState<HomeLibraryView>(EMPTY_LIBRARY_VIEW);
  const [chosen, setChosen] = useState<HomeLibraryChoice | null>(null);
  // A new draft starts from nothing — never from the previous draft's chosen recipe.
  const [viewDraft, setViewDraft] = useState(draftId);
  if (viewDraft !== draftId) {
    setViewDraft(draftId);
    setView(EMPTY_LIBRARY_VIEW);
    setChosen(null);
  }
  const door = useHomeCommunityDoor(chosen?.kind === 'community' ? chosen.target : null, {
    // A recipe chosen in „Receptury” IS the new recipe, as a library handoff is.
    keepIdea: false,
  });

  const activeMode: HomeStartMode = atStart ? mode : 'idea';
  const library = activeMode === 'library';
  const working = busy || door.busy;
  const enabled = library ? chosen !== null : ideaReady;
  // A refusal belongs to the recipe it was about — never to the next card chosen.
  const refusal = libraryRefusal && chosen?.id === libraryRefusal.recipeId ? libraryRefusal : null;
  const message = library ? (refusal?.message ?? door.message) : null;
  // Pinned at the start in both modes; afterwards only where there is an idea to act on.
  const showAction = atStart || (activeMode === 'idea' && ideaReady);

  /* The pinned bar's height is reserved at the end of the page, and keyboard scrolling
     keeps a focused control above it — measured, because the bar grows with „Wybrana: …”
     or a refusal and with the home indicator. */
  const bar = useRef<HTMLDivElement>(null);
  const space = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const barElement = bar.current;
    const spaceElement = space.current;
    if (!atStart || !barElement || !spaceElement) return;
    const root = document.documentElement;
    const reserve = () => {
      const height = barElement.offsetHeight;
      spaceElement.style.height = `${height}px`;
      root.style.scrollPaddingBottom = `${height}px`;
      /* §H1b: the working area is centred in what is left between the header and THIS
         bar, so the height it takes has to be a number the stylesheet can read. */
      root.style.setProperty('--home-start-cta-height', `${height}px`);
    };
    reserve();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reserve);
    observer?.observe(barElement);
    return () => {
      observer?.disconnect();
      root.style.scrollPaddingBottom = '';
      root.style.removeProperty('--home-start-cta-height');
    };
  }, [atStart]);

  const start = () => {
    if (!enabled || working) return;
    if (!library) {
      onStartIdea();
      return;
    }
    if (chosen === null) return;
    if (chosen.kind === 'official') {
      onOpenOfficial(chosen.id);
      return;
    }
    void door.open().then((opened) => {
      if (opened) onCommunityOpened();
    });
  };

  return (
    <div
      className="home-start"
      data-testid="home-start"
      data-mode={activeMode}
      data-at-start={atStart ? 'true' : 'false'}
    >
      <div className="home-start-body">
        {atStart ? (
          <div className="home-start-col">
            {/* §H1b — THE top workspace row: where you start from on the left, „Reset" on
                the right. PRO carries the same row, so the one action a customer uses to
                begin again is in the same logical place in both presentations. */}
            <div className="home-start-top" data-testid="home-workspace-top-row">
              <HomeStartModes mode={mode} onChange={onModeChange} />
              <button
                type="button"
                className="home-start-reset"
                data-testid="home-workspace-reset"
                aria-haspopup="dialog"
                aria-disabled={!resetEnabled}
                onClick={() => {
                  if (resetEnabled) onReset();
                }}
              >
                {copy.recipeScreen.reset}
              </button>
            </div>
          </div>
        ) : null}
        {library ? (
          <HomeRecipeLibrary
            view={view}
            onViewChange={setView}
            chosen={chosen}
            onChoose={setChosen}
            onCarryIdea={(word) => {
              // DESIGN IX: nothing found → „Twój pomysł” takes the typed flavour along as
              // an idea chip, through the composer's own ingestion.
              ingestIdeaText(word, 'text');
              setView((current) => ({ ...current, query: '' }));
              onModeChange('idea');
            }}
          />
        ) : (
          <div className="home-start-col home-start-main">{idea}</div>
        )}
      </div>
      {showAction ? (
        <div
          ref={bar}
          className="home-start-cta"
          data-placement={atStart ? 'pinned' : 'inline'}
          data-testid="home-start-cta-bar"
        >
          <div className="home-start-col grid gap-2.5">
            {message ? (
              <p className="home-start-cta-note" role="alert" data-testid="home-start-message">
                {message}
              </p>
            ) : null}
            {library && chosen ? (
              <p className="home-start-chosen" data-testid="home-start-chosen">
                {copy.library.chosen} <b>{chosen.title}</b>
              </p>
            ) : null}
            <button
              type="button"
              className="home-cta"
              data-testid="home-intent-cta"
              aria-disabled={!enabled}
              aria-busy={working || undefined}
              onClick={start}
            >
              {copy.intent.cta}
            </button>
          </div>
        </div>
      ) : null}
      {atStart ? <div ref={space} aria-hidden="true" data-testid="home-start-cta-space" /> : null}
    </div>
  );
}
