/**
 * DESIGN V3.0 IX — ONE recipe card and carousel for HOME. A tap CHOOSES (black ring and
 * ✓, never green: choosing is not a confirmation); scrolling never chooses. On a phone
 * the first card is whole and the next one peeks in; dots only on touch with ≤ 8 cards.
 * A wide layout has no swipe, so the caller renders ‹ › (`HomeRecipeCarouselNav`).
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import './homeRecipeCards.css';

export interface HomeRecipeCardView {
  readonly id: string;
  readonly title: string;
  readonly imageUrl: string | null;
  readonly eyebrow: string | null;
  readonly subline: string | null;
  /** Short, secondary line on the card („Zawiera też: A, B, C +2 więcej”). */
  readonly alsoIncludes?: string | null;
  /** The same information in full, for the accessible name — nothing is lost. */
  readonly alsoIncludesFull?: string | null;
  readonly basedOn?: string | null;
  readonly usedForm?: string | null;
  /** Quiet honesty line: this matched, but the search did not cover everything. */
  readonly searchIncomplete?: string | null;
}

export interface HomeRecipeCarouselHandle {
  scrollByCard: (direction: -1 | 1) => void;
}

/** Where the track stands, so ‹ › can say which way there is still something to see. */
export interface HomeRecipeCarouselEdges {
  readonly atStart: boolean;
  readonly atEnd: boolean;
  /** Every card is visible at once — there is nothing to scroll. */
  readonly fits: boolean;
}

/** Sub-pixel scroll positions (zoom, snap rounding) still count as the edge. */
const EDGE_TOLERANCE_PX = 2;

const trackEdges = (track: HTMLElement): HomeRecipeCarouselEdges => {
  const maxScroll = track.scrollWidth - track.clientWidth;
  return {
    atStart: track.scrollLeft <= EDGE_TOLERANCE_PX,
    atEnd: track.scrollLeft >= maxScroll - EDGE_TOLERANCE_PX,
    fits: track.scrollWidth <= track.clientWidth,
  };
};

const CheckGlyph = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="m3.5 8.4 2.9 2.9 6.1-6.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const HomeRecipeCarousel = forwardRef<
  HomeRecipeCarouselHandle,
  {
    cards: readonly HomeRecipeCardView[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    label: string;
    testId?: string;
    /** Reported on mount, on scroll and on resize — only when it changes. */
    onEdgesChange?: (edges: HomeRecipeCarouselEdges) => void;
  }
>(function HomeRecipeCarousel({ cards, selectedId, onSelect, label, testId, onEdgesChange }, ref) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const cardStep = useCallback((): number => {
    const track = trackRef.current;
    const first = track?.firstElementChild as HTMLElement | null;
    const second = first?.nextElementSibling as HTMLElement | null;
    if (!first) return 0;
    return second ? second.offsetLeft - first.offsetLeft : first.offsetWidth;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      scrollByCard: (direction) => {
        const step = cardStep();
        trackRef.current?.scrollBy({ left: direction * step, behavior: 'smooth' });
      },
    }),
    [cardStep],
  );

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let reported: HomeRecipeCarouselEdges | null = null;
    const reportEdges = () => {
      if (!onEdgesChange) return;
      const next = trackEdges(track);
      if (
        reported?.atStart === next.atStart &&
        reported.atEnd === next.atEnd &&
        reported.fits === next.fits
      ) {
        return;
      }
      reported = next;
      onEdgesChange(next);
    };
    const onScroll = () => {
      const step = cardStep();
      if (step > 0) setActiveIndex(Math.max(0, Math.round(track.scrollLeft / step)));
      reportEdges();
    };
    reportEdges();
    track.addEventListener('scroll', onScroll, { passive: true });
    // The layer's width follows the window; a wider track can come to hold every card.
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reportEdges);
    resize?.observe(track);
    return () => {
      track.removeEventListener('scroll', onScroll);
      resize?.disconnect();
    };
  }, [cardStep, cards.length, onEdgesChange]);

  return (
    <>
      <div
        ref={trackRef}
        className="home-rcar"
        role="group"
        aria-label={label}
        data-testid={testId}
      >
        {cards.map((card, index) => {
          const selected = card.id === selectedId;
          return (
            <button
              key={card.id}
              type="button"
              className="home-rcard"
              aria-pressed={selected}
              aria-label={[
                card.title,
                card.eyebrow,
                card.subline,
                card.basedOn,
                card.usedForm,
                card.alsoIncludesFull ?? card.alsoIncludes,
                card.searchIncomplete,
              ]
                .filter(Boolean)
                .join(' · ')}
              data-testid={`home-recipe-card-${card.id}`}
              onClick={() => onSelect(card.id)}
            >
              <span className="home-rcard-img">
                {card.imageUrl ? (
                  <img
                    src={card.imageUrl}
                    alt=""
                    width={480}
                    height={480}
                    loading={index < 3 ? 'eager' : 'lazy'}
                    decoding="async"
                  />
                ) : null}
                <i className="home-rcard-ck">
                  <CheckGlyph />
                </i>
              </span>
              <span className="home-rcard-b">
                {card.eyebrow ? <span className="home-rcard-eyebrow">{card.eyebrow}</span> : null}
                <span className="home-rcard-name">{card.title}</span>
                {card.subline ? <span className="home-rcard-sub">{card.subline}</span> : null}
                {card.basedOn ? (
                  <span className="home-rcard-also" data-testid="home-recipe-card-based-on">
                    {card.basedOn}
                  </span>
                ) : null}
                {card.usedForm ? (
                  <span className="home-rcard-also" data-testid="home-recipe-card-used-form">
                    {card.usedForm}
                  </span>
                ) : null}
                {card.alsoIncludes ? (
                  <span className="home-rcard-also">{card.alsoIncludes}</span>
                ) : null}
                {card.searchIncomplete ? (
                  <span className="home-rcard-also" data-testid="home-recipe-card-incomplete">
                    {card.searchIncomplete}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      {cards.length > 1 && cards.length <= 8 ? (
        <div className="home-rdots" aria-hidden="true">
          {cards.map((card, index) => (
            <i key={card.id} data-on={index === Math.min(activeIndex, cards.length - 1)} />
          ))}
        </div>
      ) : null}
    </>
  );
});

const ChevronGlyph = ({ direction }: { direction: -1 | 1 }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      d={direction < 0 ? 'm10 3-5 5 5 5' : 'm6 3 5 5-5 5'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * ‹ › for pointer layouts: they only scroll, they choose nothing. An arrow with nowhere to
 * go is disabled, and when every card already fits there is no nav at all.
 */
export function HomeRecipeCarouselNav({
  onScroll,
  previousLabel,
  nextLabel,
  edges = null,
}: {
  onScroll: (direction: -1 | 1) => void;
  previousLabel: string;
  nextLabel: string;
  /** The track's position; `null` (not measured) leaves both arrows available. */
  edges?: HomeRecipeCarouselEdges | null;
}) {
  if (edges?.fits) return null;
  return (
    <span className="home-rnav">
      <button
        type="button"
        aria-label={previousLabel}
        disabled={edges?.atStart ?? false}
        onClick={() => onScroll(-1)}
      >
        <ChevronGlyph direction={-1} />
      </button>
      <button
        type="button"
        aria-label={nextLabel}
        disabled={edges?.atEnd ?? false}
        onClick={() => onScroll(1)}
      >
        <ChevronGlyph direction={1} />
      </button>
    </span>
  );
}
