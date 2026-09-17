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
 *
 * A generic idea resolved to its frozen SA-03 default („truskawka”) is also offered the
 * official recipes whose line belongs to the same concept by its canonical id (the Search
 * release's PI→concept links). Those are suggestions only: the §35 CTA decision stays on
 * exact identity, so nothing the customer did not choose is adopted automatically.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHomeDraftStore, type IntentChip } from '../homeDraftStore';
import {
  decideMatch,
  highestRankedCommunityMatch,
  type RecipeMatch,
  type RequestedIngredient,
} from '../homeRecipeMatching';
import type { IntentIngredientOutcome } from '../useHomeIntentIngredients';
import { ideaFingerprint, markHomeTiming } from '../homeTimingMarks';
import { SCOPE_BY_PROFILE } from '../homeIntentResolutionService';
import type { CommunityMatch } from './communityMatchService';
import {
  ideaSuggestionSignature,
  requestedFromChips,
  suggestionCards,
  type HomeSuggestionCard,
} from './homeIdeaSuggestions';
import {
  loadConceptMatchContext,
  NO_MATCH,
  searchCommunityMatches,
  searchOfficialMatches,
  type CommunitySearchCoverage,
  type ConceptMatchContext,
  type HomeMatchQuery,
  type HomeMatchResult,
} from './homeMatchSearch';

export const IDEA_SUGGESTION_DEBOUNCE_MS = 250;
/** A Community oracle that never answers must not hold the customer's own recipe back. */
export const COMMUNITY_ANSWER_TIMEOUT_MS = 6_000;

/**
 * What a dismissal applies to: the identities and roles of the idea, WITHOUT the profile.
 * Choosing „sorbet” after „Pomiń” narrows the same matches — it is not a new offer.
 */
const dismissKey = (signature: string): string => signature.slice(signature.indexOf('|') + 1);

interface CommunityState {
  readonly signature: string;
  readonly community: RecipeMatch | null;
  readonly communityMatches: readonly CommunityMatch[];
  readonly coverage: CommunitySearchCoverage;
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
  /** True while any committed chip still has no answer — the offer is not complete yet. */
  readonly recognising: boolean;
  /** Resolve every chip that still has no answer, now (the CTA door). */
  readonly resolveRemaining: () => Promise<void>;
  readonly isDismissed: (signature: string) => boolean;
  readonly dismiss: (signature: string) => void;
  /** Wait for this idea's resolutions and matching, then return its §35 verdict. */
  readonly settle: () => Promise<{
    readonly signature: string;
    readonly result: HomeMatchResult;
    /** Whether THIS version was already dismissed — read when the verdict is made. */
    readonly dismissed: boolean;
  }>;
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
  const [answered, setAnswered] = useState<ReadonlyMap<string, IntentIngredientOutcome['status']>>(
    () => new Map(),
  );
  const answeredRef = useRef(answered);
  const communityByIdea = useRef(new Map<string, Promise<CommunityAnswer>>());
  const [conceptContext, setConceptContext] = useState<ConceptMatchContext | null>(null);
  const conceptContextLoad = useRef<Promise<ConceptMatchContext | null> | null>(null);

  const signature = useMemo(() => ideaSuggestionSignature(chips, profile), [chips, profile]);
  const asksForConcept = useMemo(
    () => requestedFromChips(chips).some((item) => item.conceptKey != null),
    [chips],
  );

  const loadConceptContext = useCallback(() => {
    conceptContextLoad.current ??= loadConceptMatchContext().then(
      (context) => {
        setConceptContext(context);
        return context;
      },
      () => {
        // Unavailable release → identity matching only; a later idea may try again.
        conceptContextLoad.current = null;
        return null;
      },
    );
    return conceptContextLoad.current;
  }, []);

  useEffect(() => {
    if (enabled && asksForConcept) void loadConceptContext();
  }, [asksForConcept, enabled, loadConceptContext]);

  /** The approved forms of a generic request, for the scope the profile implies. */
  const formsFor = useCallback(
    (item: RequestedIngredient): readonly string[] =>
      item.conceptKey == null || conceptContext === null
        ? []
        : conceptContext.formsOf(item.conceptKey, profile ? SCOPE_BY_PROFILE[profile] : null),
    [conceptContext, profile],
  );

  const communityFor = useCallback((idea: string, query: HomeMatchQuery) => {
    let pending = communityByIdea.current.get(idea);
    if (!pending) {
      markHomeTiming('community-start', { idea: ideaFingerprint(idea) });
      pending = Promise.race([
        searchCommunityMatches(query),
        new Promise<CommunityAnswer>((resolve) =>
          setTimeout(
            () =>
              // A timed-out search proved nothing about the rest of the combinations.
              resolve({
                community: [],
                communityMatches: [],
                coverage: { asked: 0, combinations: 0, partial: true },
              }),
            COMMUNITY_ANSWER_TIMEOUT_MS,
          ),
        ),
      ]).then(
        (answer) => {
          markHomeTiming('community-end', {
            idea: ideaFingerprint(idea),
            count: answer.community.length,
          });
          return answer;
        },
        () =>
          ({
            community: [],
            communityMatches: [],
            coverage: { asked: 0, combinations: 0, partial: true },
          }) as CommunityAnswer,
      );
      communityByIdea.current.set(idea, pending);
    }
    return pending;
  }, []);

  // 1 — ONE resolution door: the debounced recognition below and the CTA's
  // `resolveRemaining` both go through `startResolution`, so a chip is resolved once and
  // an answered identity question is never overwritten by a second, later answer.
  const startResolution = useCallback(
    (chip: IntentChip) => {
      const running = inFlight.current.get(chip.id);
      if (running) return running.promise;
      const controller = new AbortController();
      attempted.current.add(chip.id);
      markHomeTiming('resolve-start', { source: chip.source });
      const promise = resolveOne(chip, controller.signal)
        .catch((): IntentIngredientOutcome => ({ chipId: chip.id, status: 'unavailable' }))
        .then((outcome) => {
          markHomeTiming('resolve-end', { status: outcome.status, source: chip.source });
          answeredRef.current = new Map(answeredRef.current).set(chip.id, outcome.status);
          setAnswered(answeredRef.current);
        })
        .finally(() => {
          inFlight.current.delete(chip.id);
          setResolvingChipIds([...inFlight.current.keys()]);
          const everyChip = useHomeDraftStore.getState().chips;
          if (everyChip.length > 0 && everyChip.every((entry) => entry.productId !== null)) {
            markHomeTiming('recognised', { chips: everyChip.length });
          }
        });
      inFlight.current.set(chip.id, { controller, promise });
      return promise;
    },
    [resolveOne],
  );

  /** A chip still waiting for an answer: unresolved, not asked about, not answered yet. */
  const awaitsAnswer = useCallback(
    (chip: IntentChip, answers: ReadonlyMap<string, IntentIngredientOutcome['status']>) =>
      chip.productId === null &&
      !chip.ambiguous &&
      // An answer the customer never got („unavailable”) is retried at the CTA.
      (!answers.has(chip.id) || answers.get(chip.id) === 'unavailable'),
    [],
  );

  const resolveRemaining = useCallback(async () => {
    const pending = useHomeDraftStore
      .getState()
      .chips.filter((chip) => awaitsAnswer(chip, answeredRef.current));
    for (const chip of pending) {
      if (answeredRef.current.get(chip.id) === 'unavailable') attempted.current.delete(chip.id);
    }
    const started = pending.map((chip) => startResolution(chip));
    setResolvingChipIds([...inFlight.current.keys()]);
    await Promise.allSettled(started);
  }, [awaitsAnswer, startResolution]);

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
        void startResolution(chip);
      }
      setResolvingChipIds([...inFlight.current.keys()]);
    }, IDEA_SUGGESTION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [chips, enabled, startResolution]);

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
        ? searchOfficialMatches({
            requested: requestedFromChips(chips),
            profile,
            conceptMatcher: conceptContext?.matcher,
          })
        : [],
    // `signature` is exactly the resolved identities + roles + concepts + profile the query reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conceptContext, enabled, signature],
  );

  useEffect(() => {
    if (!enabled || signature === '') return;
    markHomeTiming('official-ready', { idea: ideaFingerprint(signature), count: official.length });
  }, [enabled, official.length, signature]);

  useEffect(() => {
    if (!enabled || signature === '') return;
    const query: HomeMatchQuery = { requested: requestedFromChips(chips), profile, formsFor };
    let current = true;
    const timer = setTimeout(() => {
      void communityFor(signature, query).then((answer) => {
        if (!current) return;
        setCommunityState({
          signature,
          community: highestRankedCommunityMatch(answer.community),
          communityMatches: answer.communityMatches,
          coverage: answer.coverage,
        });
      });
    }, IDEA_SUGGESTION_DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
    // The query is fully described by `signature` (plus the loaded central authority).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityFor, conceptContext, enabled, signature]);

  const settle = useCallback(async () => {
    await resolveRemaining();
    await Promise.allSettled([...inFlight.current.values()].map((entry) => entry.promise));
    const draft = useHomeDraftStore.getState();
    const idea = ideaSuggestionSignature(draft.chips, draft.profile);
    if (idea === '') return { signature: idea, result: NO_MATCH, dismissed: false };
    const context = await loadConceptContext();
    const query: HomeMatchQuery = {
      requested: requestedFromChips(draft.chips),
      profile: draft.profile,
      conceptMatcher: context?.matcher,
      formsFor: (item) =>
        item.conceptKey == null || !context
          ? []
          : context.formsOf(
              item.conceptKey,
              draft.profile ? SCOPE_BY_PROFILE[draft.profile] : null,
            ),
    };
    // §35 decides on exact identity only: a concept suggestion is offered, never adopted.
    const officialNow = searchOfficialMatches({ ...query, conceptMatcher: undefined });
    const { community, communityMatches, coverage } = await communityFor(idea, query);
    const best = highestRankedCommunityMatch(community);
    // The answer this door waited for is the answer the layer shows: without this the
    // Community card could arrive only after the customer's own recipe had been built.
    setCommunityState({ signature: idea, community: best, communityMatches, coverage });
    return {
      signature: idea,
      // Read at the moment of the verdict, never from the render that started the CTA.
      dismissed: dismissedNow.current.has(dismissKey(idea)),
      result: {
        decision: decideMatch({
          official: officialNow,
          community,
          communitySearchPartial: coverage.partial,
        }),
        communityMatches,
        coverage,
      },
    };
  }, [communityFor, loadConceptContext, resolveRemaining]);

  const settled = communityState !== null && communityState.signature === signature;
  const community = settled ? communityState.community : null;
  const communityPartial = settled ? communityState.coverage.partial : false;
  const cards = useMemo(
    () => suggestionCards({ official, community, communityPartial }),
    [official, community, communityPartial],
  );
  const communityMatch =
    community === null || !settled
      ? null
      : (communityState.communityMatches.find(
          (entry) => entry.publicationId === community.candidate.id,
        ) ?? null);

  const dismiss = useCallback((idea: string) => {
    const key = dismissKey(idea);
    if (dismissedNow.current.has(key)) return;
    dismissedNow.current.add(key);
    setDismissed(new Set(dismissedNow.current));
  }, []);
  const isDismissed = useCallback((idea: string) => dismissed.has(dismissKey(idea)), [dismissed]);
  const recognising = useMemo(
    () => chips.some((chip) => awaitsAnswer(chip, answered)),
    [answered, awaitsAnswer, chips],
  );

  return {
    signature,
    cards,
    official,
    community,
    communityMatch,
    communitySettled: signature === '' || settled,
    resolvingChipIds,
    recognising,
    resolveRemaining,
    isDismissed,
    dismiss,
    settle,
  };
}
