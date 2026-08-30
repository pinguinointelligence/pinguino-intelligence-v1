/**
 * §36 — "Znaleźliśmy podobne receptury".
 *
 * A match is an OPTION, never a replacement. So `Tworzę własną recepturę` is a
 * first-class action, not a dismissal in the corner, and Escape / backdrop also leave
 * the user creating — there is no way to get trapped here (§35, user control).
 *
 * CUSTOMER LANGUAGE ONLY. Nothing internal to matching reaches this screen: no
 * canonical id, no rank score, no containment or tier vocabulary, no confidence
 * number. The only technical-looking thing shown is the Community position, which is
 * an existing public Gellatti concept (Top 100), rendered in words.
 *
 * Grams are NOT this component's business: it shows a recipe's identity and its
 * ingredients by name, and the existing entitlement authority governs grams wherever
 * the recipe is subsequently opened.
 */
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { homeCreatorCopy } from '../homeCreatorCopy';
import type { RecipeMatch } from '../homeRecipeMatching';

function MatchCard({ match, onChoose }: { match: RecipeMatch; onChoose: () => void }) {
  const candidate = match.candidate;
  const isCommunity = candidate.source === 'community';
  return (
    <li>
      <button
        type="button"
        onClick={onChoose}
        data-testid={`home-match-option-${candidate.id}`}
        className="flex w-full items-start gap-3 rounded-[12px] border p-3 text-left transition-colors hover:bg-black/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        style={{ borderColor: 'var(--g-line)', background: '#ffffff' }}
      >
        {candidate.imageUrl ? (
          <img
            src={candidate.imageUrl}
            alt=""
            aria-hidden="true"
            className="h-14 w-14 shrink-0 rounded-[10px] object-cover"
          />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold" style={{ color: 'var(--g-ink)' }}>
            {candidate.title}
          </span>

          {isCommunity && candidate.authorName ? (
            <span className="mt-0.5 block text-[13px]" style={{ color: 'var(--g-text-muted)' }}>
              {candidate.authorName}
              {typeof candidate.rank === 'number'
                ? ` · ${homeCreatorCopy.match.rank} ${candidate.rank}`
                : ''}
            </span>
          ) : null}

          {/* §38 — the ORIGINAL creator, never the intermediate remixer. */}
          {candidate.originalCreatorName ? (
            <span
              className="mt-0.5 block text-[12px]"
              data-testid="home-match-based-on"
              style={{ color: 'var(--g-text-muted)' }}
            >
              {homeCreatorCopy.match.basedOnOriginal} {candidate.originalCreatorName}
            </span>
          ) : null}

          {/* §32 — extra ingredients are shown by NAME. Never a quantity. */}
          {match.alsoIncludes.length > 0 ? (
            <span
              className="mt-1 block text-[12px]"
              data-testid="home-match-also-includes"
              style={{ color: 'var(--g-text-secondary)' }}
            >
              {homeCreatorCopy.match.alsoIncludes} {match.alsoIncludes.join(', ')}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

export function HomeMatchPopup({
  official,
  community,
  onChooseOfficial,
  onChooseCommunity,
  onCreateMyOwn,
}: {
  official: readonly RecipeMatch[];
  community: RecipeMatch | null;
  onChooseOfficial: (match: RecipeMatch) => void;
  onChooseCommunity: (match: RecipeMatch) => void;
  /** §35 — always available, and what every dismissal resolves to. */
  onCreateMyOwn: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const createMyOwnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Escape leaves the user CREATING — never in an ambiguous half-state.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCreateMyOwn();
    };
    window.addEventListener('keydown', onKey);
    createMyOwnRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onCreateMyOwn]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      data-testid="home-match-popup"
      role="dialog"
      aria-modal="true"
      aria-label={homeCreatorCopy.match.title}
    >
      <button
        type="button"
        aria-label={homeCreatorCopy.match.close}
        onClick={onCreateMyOwn}
        className="absolute inset-0 bg-black/35"
        data-testid="home-match-backdrop"
      />
      <div
        ref={dialogRef}
        className={cn(
          'relative w-full max-w-[560px] overflow-y-auto rounded-t-[18px] sm:rounded-[18px]',
          'max-h-[88svh] p-5 sm:p-6',
        )}
        style={{ background: 'var(--g-ivory)' }}
      >
        <h2
          className="text-[20px] leading-tight font-semibold tracking-[-0.015em]"
          style={{ color: 'var(--g-ink)' }}
        >
          {homeCreatorCopy.match.title}
        </h2>
        <p className="mt-1 text-[14px]" style={{ color: 'var(--g-text-secondary)' }}>
          {homeCreatorCopy.match.subtitle}
        </p>

        {official.length > 0 ? (
          <section className="mt-5" data-testid="home-match-official">
            <h3
              className="text-[11px] font-bold tracking-[0.12em] uppercase"
              style={{ color: 'var(--g-text-muted)' }}
            >
              {homeCreatorCopy.match.gellattiSection}
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {official.map((match) => (
                <MatchCard
                  key={match.candidate.id}
                  match={match}
                  onChoose={() => onChooseOfficial(match)}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {/* §34 — at most ONE Community result, the highest-ranked exact match. */}
        {community ? (
          <section className="mt-5" data-testid="home-match-community">
            <h3
              className="text-[11px] font-bold tracking-[0.12em] uppercase"
              style={{ color: 'var(--g-text-muted)' }}
            >
              {homeCreatorCopy.match.communitySection}
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              <MatchCard match={community} onChoose={() => onChooseCommunity(community)} />
            </ul>
          </section>
        ) : null}

        <button
          ref={createMyOwnRef}
          type="button"
          onClick={onCreateMyOwn}
          data-testid="home-match-create-my-own"
          className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center rounded-full px-6 text-[15px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
          style={{ background: 'var(--g-ink)', color: '#ffffff' }}
        >
          {homeCreatorCopy.match.continueCreating}
        </button>
        <p className="mt-2 text-center text-[12px]" style={{ color: 'var(--g-text-muted)' }}>
          {homeCreatorCopy.match.createMyOwnHint}
        </p>
      </div>
    </div>
  );
}
