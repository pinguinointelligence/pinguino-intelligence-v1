/**
 * DESIGN V3.0 IX — „Receptury” search, live while the customer types.
 *
 *   • debounce — a word being typed is looked up once, 300 ms after the last key;
 *   • version  — only the answer for the CURRENT words is shown; an older lookup is aborted
 *                and its late answer dropped;
 *   • order    — official matches are synchronous and appear first; the one Community
 *                proposal follows when the Top 100 oracle answers.
 *
 * The lookup itself is `homeLibrarySearch` — the central resolver and the §32–§36
 * matching the suggestions layer uses. This hook only schedules it.
 */
import { useEffect, useState } from 'react';
import { suggestionCards, type HomeSuggestionCard } from './homeIdeaSuggestions';
import type { CommunityMatch } from './communityMatchService';
import {
  communityLibraryMatch,
  officialLibraryMatches,
  resolveLibraryQuery,
} from './homeLibrarySearch';

export const LIBRARY_SEARCH_DEBOUNCE_MS = 300;
/** Shorter than this is still a word being typed, not a flavour. */
export const LIBRARY_SEARCH_MIN_LENGTH = 2;

export type HomeLibrarySearch =
  | { readonly status: 'idle' }
  | { readonly status: 'searching'; readonly word: string }
  | {
      readonly status: 'results';
      readonly word: string;
      readonly cards: readonly HomeSuggestionCard[];
      /** Gellatti recipes among the cards (the Community proposal is counted apart). */
      readonly officialCount: number;
      /** The canonical address behind the Community card, for the Community door. */
      readonly community: CommunityMatch | null;
    }
  | { readonly status: 'none'; readonly word: string }
  | { readonly status: 'unavailable'; readonly word: string };

export function useHomeLibrarySearch(text: string): HomeLibrarySearch {
  const word = text.trim();
  const active = word.length >= LIBRARY_SEARCH_MIN_LENGTH;
  const [answer, setAnswer] = useState<HomeLibrarySearch>({ status: 'idle' });

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let current = true;
    const timer = setTimeout(() => {
      void (async () => {
        const query = await resolveLibraryQuery(word, controller.signal).catch(
          () => ({ kind: 'unavailable' }) as const,
        );
        if (!current) return;
        if (query.kind !== 'query') {
          setAnswer({ status: query.kind, word });
          return;
        }
        const official = officialLibraryMatches(query);
        if (official.length > 0) {
          setAnswer({
            status: 'results',
            word,
            cards: suggestionCards({ official, community: null }),
            officialCount: official.length,
            community: null,
          });
        }
        const community = await communityLibraryMatch(query).catch(() => null);
        if (!current) return;
        if (official.length === 0 && !community?.match) {
          setAnswer({ status: 'none', word });
          return;
        }
        setAnswer({
          status: 'results',
          word,
          cards: suggestionCards({
            official,
            community: community?.match ?? null,
            communityPartial: community?.partial,
          }),
          officialCount: official.length,
          community: community?.target ?? null,
        });
      })();
    }, LIBRARY_SEARCH_DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, word]);

  if (!active) return { status: 'idle' };
  if (answer.status !== 'idle' && answer.word === word) return answer;
  // While the next word is being looked up, the cards found so far stay (they still say
  // which word they answer), so typing narrows the list instead of blinking it away.
  // Anything else for other words is never shown as the answer for these.
  return answer.status === 'results' ? answer : { status: 'searching', word };
}
