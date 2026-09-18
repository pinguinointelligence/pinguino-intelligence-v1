/**
 * DESIGN V3.0 IX — „Receptury”: where colour, photos and appetite come in, on purpose.
 * The rest of HOME stays white, black and grey; the photos do the work.
 *
 *   • search  — „Smak lub składnik, np. truskawka” narrows live and never loses focus;
 *               × clears it and returns to the level the customer was on;
 *   • level 1 — the six collections as photo tiles (the five official ones and Community);
 *   • level 2 — the collection's recipes in the ONE HOME carousel („‹ Kolekcje” goes back).
 *
 * A tap on a card CHOOSES it (black ring and ✓); scrolling never chooses, and the carousel
 * stays where it is. The choice is opened by „Rozpocznij recepturę” at the bottom of the
 * start screen, through the existing doors — nothing here opens, adopts or derives.
 *
 * Every name, count, cover and photo comes from the app's own library data
 * (`officialRecipeLibrary`), the Community card from today's Top 100, the search from the
 * central resolver + §32–§36 matching (`useHomeLibrarySearch`). No data is copied here.
 */
import { useRef, useState, type ReactNode } from 'react';
import {
  OFFICIAL_COLLECTIONS,
  officialRecipeHasImage,
  officialRecipeImage,
  officialRecipesInCollection,
  type OfficialCollectionId,
} from '@/data/recipes/official/officialRecipeLibrary';
import { homeCreatorCopy } from '../homeCreatorCopy';
import {
  communityDoorTarget,
  useHomeCommunityCollection,
  type HomeCommunityCollection,
} from '../homeCommunityCollection';
import {
  HOME_COMMUNITY_COLLECTION_ID,
  type HomeLibraryChoice,
  type HomeLibraryView,
} from '../homeLibraryModel';
import { communityRecipeSubline, officialRecipeSubline } from '../matching/homeIdeaSuggestions';
import { useHomeLibrarySearch, type HomeLibrarySearch } from '../matching/useHomeLibrarySearch';
import {
  HomeRecipeCarousel,
  HomeRecipeCarouselNav,
  type HomeRecipeCardView,
  type HomeRecipeCarouselEdges,
  type HomeRecipeCarouselHandle,
} from './HomeRecipeCarousel';
import './homeStart.css';

/** The cover the app's library already uses for Community (`OfficialCollectionsGrid`). */
const COMMUNITY_COVER = '/recipes/official/collections/community.png';

type LibraryCard = HomeRecipeCardView & { readonly choice: HomeLibraryChoice };

function officialCards(collection: OfficialCollectionId): readonly LibraryCard[] {
  return officialRecipesInCollection(collection).map((recipe) => ({
    id: recipe.recipeId,
    title: recipe.name,
    imageUrl: officialRecipeHasImage(recipe) ? officialRecipeImage(recipe).card : null,
    eyebrow: null,
    subline: officialRecipeSubline(recipe),
    choice: { kind: 'official', id: recipe.recipeId, title: recipe.name },
  }));
}

function communityCards(state: HomeCommunityCollection): readonly LibraryCard[] {
  if (state.status !== 'ready') return [];
  return state.rows.map((row, index) => ({
    id: row.publication_id,
    title: row.title,
    imageUrl: row.image_url ?? null,
    eyebrow: null,
    subline: communityRecipeSubline(row.creator.display_name, index + 1),
    choice: {
      kind: 'community',
      id: row.publication_id,
      title: row.title,
      target: communityDoorTarget(row),
    },
  }));
}

function searchCards(search: HomeLibrarySearch): readonly LibraryCard[] {
  if (search.status !== 'results') return [];
  return search.cards.flatMap((card): LibraryCard[] => {
    const view = {
      id: card.id,
      title: card.title,
      imageUrl: card.imageUrl,
      eyebrow: card.eyebrow,
      subline: card.subline,
    };
    if (card.source === 'official') {
      return [{ ...view, choice: { kind: 'official', id: card.id, title: card.title } }];
    }
    // The Community proposal opens through its canonical address — never without one.
    if (search.community === null || search.community.publicationId !== card.id) return [];
    return [
      {
        ...view,
        choice: { kind: 'community', id: card.id, title: card.title, target: search.community },
      },
    ];
  });
}

const SearchGlyph = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="m10.5 10.5 3.5 3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const CloseGlyph = () => (
  <svg viewBox="0 0 12 12" aria-hidden="true">
    <path
      d="M2 2l8 8M10 2l-8 8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const BackGlyph = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="m10 3-5 5 5 5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** One title line and the ONE HOME carousel, with ‹ › for a mouse (they choose nothing). */
function LibraryCarousel({
  title,
  subline,
  cards,
  chosenId,
  onChoose,
  label,
  testId,
}: {
  title: string;
  subline: string | null;
  cards: readonly LibraryCard[];
  chosenId: string | null;
  onChoose: (choice: HomeLibraryChoice) => void;
  label: string;
  testId: string;
}) {
  const match = homeCreatorCopy.match;
  const carousel = useRef<HomeRecipeCarouselHandle>(null);
  const [edges, setEdges] = useState<HomeRecipeCarouselEdges | null>(null);
  return (
    <>
      <div className="home-lib-hd">
        <div>
          <h3 className="home-lib-title">{title}</h3>
          {subline ? (
            <small className="home-lib-sub" data-testid={`${testId}-summary`}>
              {subline}
            </small>
          ) : null}
        </div>
        {cards.length > 0 ? (
          <HomeRecipeCarouselNav
            onScroll={(direction) => carousel.current?.scrollByCard(direction)}
            previousLabel={match.previousCards}
            nextLabel={match.nextCards}
            edges={edges}
          />
        ) : null}
      </div>
      {cards.length > 0 ? (
        <HomeRecipeCarousel
          ref={carousel}
          cards={cards}
          selectedId={chosenId}
          onSelect={(id) => {
            const card = cards.find((entry) => entry.id === id);
            if (card) onChoose(card.choice);
          }}
          label={label}
          testId={testId}
          onEdgesChange={setEdges}
        />
      ) : null}
    </>
  );
}

export function HomeRecipeLibrary({
  view,
  onViewChange,
  chosen,
  onChoose,
  onCarryIdea,
}: {
  view: HomeLibraryView;
  onViewChange: (next: HomeLibraryView) => void;
  chosen: HomeLibraryChoice | null;
  onChoose: (choice: HomeLibraryChoice) => void;
  /** „Twój pomysł” after a search that found nothing: the typed flavour becomes the idea. */
  onCarryIdea: (word: string) => void;
}) {
  const copy = homeCreatorCopy.library;
  const search = useHomeLibrarySearch(view.query);
  const community = useHomeCommunityCollection(view.collection === HOME_COMMUNITY_COLLECTION_ID);
  const chosenId = chosen?.id ?? null;
  // One letter is still a word being typed: the level underneath stays until it is one.
  const searching = search.status !== 'idle';
  const searchField = useRef<HTMLInputElement>(null);

  let body: ReactNode;
  if (searching) {
    body =
      search.status === 'results' ? (
        <LibraryCarousel
          title={copy.resultsTitle}
          subline={copy.resultsSummary(
            search.word,
            search.officialCount,
            search.community !== null,
          )}
          cards={searchCards(search)}
          chosenId={chosenId}
          onChoose={onChoose}
          label={copy.resultsCarouselLabel(search.word)}
          testId="home-library-results"
        />
      ) : search.status === 'none' ? (
        <div className="home-lib-none" data-testid="home-library-none">
          <b>{copy.noneTitle}</b>
          <small>{copy.noneBody(search.word)}</small>
          <button
            type="button"
            data-testid="home-library-carry-idea"
            onClick={() => onCarryIdea(search.word)}
          >
            {copy.noneAction}
          </button>
        </div>
      ) : (
        <p className="home-lib-note" role="status" data-testid="home-library-searching">
          {search.status === 'unavailable' ? copy.searchUnavailable : copy.searching}
        </p>
      );
  } else if (view.collection !== null) {
    const isCommunity = view.collection === HOME_COMMUNITY_COLLECTION_ID;
    const official = isCommunity
      ? null
      : (OFFICIAL_COLLECTIONS.find((entry) => entry.id === view.collection) ?? null);
    const cards = isCommunity
      ? communityCards(community)
      : officialCards(view.collection as OfficialCollectionId);
    const name = official?.name ?? copy.communityName;
    body = (
      <>
        <button
          type="button"
          className="home-lib-back"
          aria-label={copy.backToCollectionsLabel}
          data-testid="home-library-back"
          onClick={() => onViewChange({ ...view, collection: null })}
        >
          <BackGlyph />
          {copy.backToCollections}
        </button>
        <LibraryCarousel
          title={name}
          subline={isCommunity ? copy.communityLine : copy.recipeCount(cards.length)}
          cards={cards}
          chosenId={chosenId}
          onChoose={onChoose}
          label={copy.carouselLabel(name)}
          testId="home-library-carousel"
        />
        {isCommunity && community.status !== 'ready' ? (
          <p className="home-lib-note" role="status" data-testid="home-library-community-state">
            {community.status === 'failed' ? copy.communityUnavailable : copy.communityLoading}
          </p>
        ) : isCommunity && cards.length === 0 ? (
          <p className="home-lib-note" data-testid="home-library-community-state">
            {copy.communityEmpty}
          </p>
        ) : null}
      </>
    );
  } else {
    body = (
      <>
        <p className="home-lib-label">{copy.collectionsLabel}</p>
        <div className="home-lib-tiles" data-testid="home-library-collections">
          {OFFICIAL_COLLECTIONS.map((collection) => (
            <button
              key={collection.id}
              type="button"
              className="home-lib-tile"
              data-testid={`home-library-collection-${collection.id}`}
              onClick={() => onViewChange({ ...view, collection: collection.id })}
            >
              <span className="home-lib-tile-img">
                <img
                  src={collection.heroImage.small}
                  alt=""
                  width={960}
                  height={540}
                  decoding="async"
                />
              </span>
              <b>{collection.name}</b>
              <small>{copy.recipeCount(officialRecipesInCollection(collection.id).length)}</small>
            </button>
          ))}
          <button
            type="button"
            className="home-lib-tile"
            data-testid={`home-library-collection-${HOME_COMMUNITY_COLLECTION_ID}`}
            onClick={() => onViewChange({ ...view, collection: HOME_COMMUNITY_COLLECTION_ID })}
          >
            <span className="home-lib-tile-img">
              <img src={COMMUNITY_COVER} alt="" width={960} height={540} decoding="async" />
            </span>
            <b>{copy.communityName}</b>
            <small>{copy.communityTileLine}</small>
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="home-lib" data-testid="home-library">
      {/* The search stays in the start column; the collections and carousels use the
          wider area (the application frame on desktop). */}
      <div className="home-start-col">
        <div className="home-lib-search" role="search">
          <span className="home-lib-search-ic" aria-hidden="true">
            <SearchGlyph />
          </span>
          <input
            ref={searchField}
            type="search"
            value={view.query}
            onChange={(event) => onViewChange({ ...view, query: event.target.value })}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchLabel}
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            data-testid="home-library-search"
          />
          {view.query ? (
            <button
              type="button"
              className="home-lib-search-x"
              aria-label={copy.clearSearch}
              data-testid="home-library-search-clear"
              onClick={() => {
                onViewChange({ ...view, query: '' });
                // The × disappears with the words; the customer stays in the field.
                searchField.current?.focus();
              }}
            >
              <CloseGlyph />
            </button>
          ) : null}
        </div>
      </div>
      <div className="home-start-wide">{body}</div>
    </div>
  );
}
