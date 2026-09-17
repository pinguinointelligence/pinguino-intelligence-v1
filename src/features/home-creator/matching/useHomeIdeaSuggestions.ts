/**
 * Owner 2026-09-17 (B) + DESIGN V3.0 VIII — recognise the idea and look for matching
 * recipes WHILE it is being described, before „Create my recipe”.
 *
 * Nothing new is searched: chips resolve through the same `resolveOne` door the CTA uses
 * (central concept defaults, then the literal catalogue), and matches come from the same
 * §32–§36 sources (the official library and the Community Top 100 oracle).
 *
 *   • debounce — a burst of chips (a spoken sentence) resolves once, 250 ms after it lands;
 *   • dedupe   — a chip is resolved once per identity; a Community query once per idea version;
 *   • version  — results are kept only for the idea signature they were computed for; a
 *                 removed chip aborts its resolution and a stale answer is dropped;
 *   • order    — official matches are synchronous and appear first; Community follows.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHomeDraftStore, type IntentChip } from '../homeDraftStore';
import { decideMatch, highestRankedCommunityMatch, type RecipeMatch } from '../homeRecipeMatching';
import type { IntentIngredientOutcome } from '../useHomeIntentIngredients';
import { ideaFingerprint, markHomeTiming } from '../homeTimingMarks';
import type { CommunityMatch } from './communityMatchService';
import {
  ideaSuggestionSignature,
  requestedFromChips,
  suggestionCards,
  type HomeSuggestionCard,
} from './homeIdeaSuggestions';
import {
  NO_MATCH,
  searchCommunityMatches,
  searchOfficialMatches,
  type HomeMatchQuery,
  type HomeMatchResult,
} from './homeMatchSearch';

export const IDEA_SUGGESTION_DEBOUNCE_MS = 250;

interface CommunityState {
  readonly signature: string;
  readonly community: RecipeMatch | null;
  readonly communityMatches: readonly CommunityMatch[];
}

type CommunityAnswer = Awaited<ReturnType<typeof searchCommunityMatches>>;

export interface HomeIdeaSuggestions {
  /** The current idea version ('' = nothing resolved yet). */
  readonly signature: string;
  readonly cards: readonly HomeSuggestionCard[];
  readonly official: readonly RecipeMatch[];
  readonly community: RecipeMatch | null;
  readonly communityMatch: CommunityMatch | null;
  readonly communitySettled: boolean;
  /** Chips whose identity is being resolved right now. */
  readonly resolvingChipIds: readonly string[];
  readonly isDismissed: (signature: string) => boolean;
  readonly dismiss: (signature: string) => void;
  /** Wait for this idea's resolutions and matching, then return its §35 verdict. */
  readonly settle: () => Promise<{ readonly signature: string; readonly result: HomeMatchResult }>;
}

export function useHomeIdeaSuggestions({
  resolveOne,
  enabled,
}: {
  resolveOne: (chip: IntentChip, signal?: AbortSignal) => Promise<IntentIngredientOutcome>;
  enabled: boolean;
}): HomeIdeaSuggestions {
  const chips = useHomeDraftStore((state) => state.chips);
  const profile = useHomeDraftStore((state) => state.profile);
  const [communityState, setCommunityState] = useState<CommunityState | null>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const dismissedNow = useRef(new Set<string>());
  const [resolvingChipIds, setResolvingChipIds] = useState<readonly string[]>([]);
  const inFlight = useRef(
    new Map<string, { controller: AbortController; promise: Promise<unknown> }>(),
  );
  const attempted = useRef(new Set<string>());
  const communityByIdea = useRef(new Map<string, Promise<CommunityAnswer>>());

  const signature = useMemo(() => ideaSuggestionSignature(chips, profile), [chips, profile]);

  const communityFor = useCallback((idea: string, query: HomeMatchQuery) => {
    let pending = communityByIdea.current.get(idea);
    if (!pending) {
      markHomeTiming('community-start', { idea: ideaFingerprint(idea) });
      pending = searchCommunityMatches(query).then(
        (answer) => {
          markHomeTiming('community-end', {
            idea: ideaFingerprint(idea),
            count: answer.community.length,
          });
          return answer;
        },
        () => ({ community: [], communityMatches: [] }) as CommunityAnswer,
      );
      communityByIdea.current.set(idea, pending);
    }
    return pending;
  }, []);

  // 1 — resolve committed chips before the CTA (debounced, cancellable, once per chip).
  useEffect(() => {
    const live = new Set(chips.map((chip) => chip.id));
    for (const [chipId, entry] of inFlight.current) {
      if (!live.has(chipId)) {
        entry.controller.abort();
        inFlight.current.delete(chipId);
        attempted.current.delete(chipId);
      }
    }
    if (!enabled) return;
    const pending = chips.filter(
      (chip) =>
        chip.productId === null &&
        !chip.ambiguous &&
        !attempted.current.has(chip.id) &&
        !inFlight.current.has(chip.id),
    );
    if (pending.length === 0) return;
    const timer = setTimeout(() => {
      for (const candidate of pending) {
        const chip = useHomeDraftStore.getState().chips.find((entry) => entry.id === candidate.id);
        if (!chip || chip.productId !== null || chip.ambiguous) continue;
        const controller = new AbortController();
        attempted.current.add(chip.id);
        markHomeTiming('resolve-start', { source: chip.source });
        const promise = resolveOne(chip, controller.signal)
          .then((outcome) =>
            markHomeTiming('resolve-end', { status: outcome.status, source: chip.source }),
          )
          .catch(() => undefined)
          .finally(() => {
            inFlight.current.delete(chip.id);
            setResolvingChipIds([...inFlight.current.keys()]);
            const everyChip = useHomeDraftStore.getState().chips;
            if (everyChip.length > 0 && everyChip.every((entry) => entry.productId !== null)) {
              markHomeTiming('recognised', { chips: everyChip.length });
            }
          });
        inFlight.current.set(chip.id, { controller, promise });
      }
      setResolvingChipIds([...inFlight.current.keys()]);
    }, IDEA_SUGGESTION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [chips, enabled, resolveOne]);

  useEffect(() => {
    const controllers = inFlight.current;
    return () => {
      for (const entry of controllers.values()) entry.controller.abort();
      controllers.clear();
    };
  }, []);

  // 2 — match the current idea version: official synchronously (pure, keyed by the version),
  // Community debounced, deduped per version and dropped when the idea has moved on.
  const official = useMemo(
    () =>
      enabled && signature !== ''
        ? searchOfficialMatches({ requested: requestedFromChips(chips), profile })
        : [],
    // `signature` is exactly the resolved identities + roles + profile the query reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, signature],
  );

  useEffect(() => {
    if (!enabled || signature === '') return;
    markHomeTiming('official-ready', { idea: ideaFingerprint(signature), count: official.length });
  }, [enabled, official.length, signature]);

  useEffect(() => {
    if (!enabled || signature === '') return;
    const query: HomeMatchQuery = { requested: requestedFromChips(chips), profile };
    let current = true;
    const timer = setTimeout(() => {
      void communityFor(signature, query).then((answer) => {
        if (!current) return;
        setCommunityState({
          signature,
          community: highestRankedCommunityMatch(answer.community),
          communityMatches: answer.communityMatches,
        });
      });
    }, IDEA_SUGGESTION_DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
    // The query is fully described by `signature`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityFor, enabled, signature]);

  const settle = useCallback(async () => {
    await Promise.allSettled([...inFlight.current.values()].map((entry) => entry.promise));
    const draft = useHomeDraftStore.getState();
    const idea = ideaSuggestionSignature(draft.chips, draft.profile);
    if (idea === '') return { signature: idea, result: NO_MATCH };
    const query: HomeMatchQuery = {
      requested: requestedFromChips(draft.chips),
      profile: draft.profile,
    };
    const officialNow = searchOfficialMatches(query);
    const { community, communityMatches } = await communityFor(idea, query);
    return {
      signature: idea,
      result: { decision: decideMatch({ official: officialNow, community }), communityMatches },
    };
  }, [communityFor]);

  const settled = communityState !== null && communityState.signature === signature;
  const community = settled ? communityState.community : null;
  const cards = useMemo(() => suggestionCards({ official, community }), [official, community]);
  const communityMatch =
    community === null || !settled
      ? null
      : (communityState.communityMatches.find(
          (entry) => entry.publicationId === community.candidate.id,
        ) ?? null);

  const dismiss = useCallback((idea: string) => {
    if (dismissedNow.current.has(idea)) return;
    dismissedNow.current.add(idea);
    setDismissed(new Set(dismissedNow.current));
  }, []);
  const isDismissed = useCallback((idea: string) => dismissed.has(idea), [dismissed]);

  return {
    signature,
    cards,
    official,
    community,
    communityMatch,
    communitySettled: signature === '' || settled,
    resolvingChipIds,
    isDismissed,
    dismiss,
    settle,
  };
}
