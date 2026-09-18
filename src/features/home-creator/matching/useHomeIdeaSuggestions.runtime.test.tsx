/** @vitest-environment jsdom */
/**
 * Owner 2026-09-17 (B) — recipe suggestions while the idea is described: debounce,
 * dedupe, idea-version keying and cancellation, driven through the real hook.
 */
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  community: vi.fn(),
  /** The v2 oracle — `unavailable` by default, so the cases before the v2 block run v1. */
  communityV2: vi.fn(),
  /** Set to hold the frozen release back, the way a cold page load does. */
  runtimeHold: null as null | Promise<unknown>,
  runtimeValue: null as unknown,
}));

vi.mock('./communityMatchService', () => ({
  matchCommunityTop100: mocks.community,
  matchCommunityTop100Groups: mocks.communityV2,
}));
// The REAL frozen Search release, read from disk instead of fetched.
vi.mock('@/features/mapper-search-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/mapper-search-runtime')>();
  const { createTestMapperSearchRuntime } =
    await import('@/features/mapper-search-runtime/testRelease');
  const runtime = createTestMapperSearchRuntime();
  mocks.runtimeValue = runtime;
  return {
    ...actual,
    loadMapperSearchRuntime: async () =>
      mocks.runtimeHold ? await mocks.runtimeHold : mocks.runtimeValue,
  };
});

import { useHomeDraftStore, type IntentChip } from '../homeDraftStore';
import type { IntentIngredientOutcome } from '../useHomeIntentIngredients';
import { loadConceptMatchContext, searchOfficialMatches } from './homeMatchSearch';
import { officialCandidates } from './officialLibraryCandidates';
import {
  COMMUNITY_ANSWER_TIMEOUT_MS,
  IDEA_SUGGESTION_DEBOUNCE_MS,
  useHomeIdeaSuggestions,
  type HomeIdeaSuggestions,
} from './useHomeIdeaSuggestions';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const STRAWBERRY = 'PI-ING-001553';
let host: HTMLDivElement;
let root: Root;
const probe: { latest?: HomeIdeaSuggestions } = {};
const resolveOne =
  vi.fn<(chip: IntentChip, signal?: AbortSignal) => Promise<IntentIngredientOutcome>>();

function Probe({ enabled = true }: { enabled?: boolean }) {
  const value = useHomeIdeaSuggestions({ resolveOne, enabled });
  useEffect(() => {
    probe.latest = value;
  });
  return null;
}

const chip = (id: string, label: string): IntentChip => ({
  id,
  label,
  concept: 'strawberry',
  segment: label,
  role: null,
  source: 'text',
  productId: null,
  productName: null,
  ambiguous: false,
});

const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  mocks.runtimeHold = null;
  vi.useFakeTimers();
  useHomeDraftStore.getState().startNew();
  resolveOne.mockReset();
  mocks.community.mockReset().mockResolvedValue([]);
  mocks.communityV2.mockReset().mockResolvedValue({ kind: 'unavailable' });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Probe />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe('B — recognition before the CTA', () => {
  it('B-01: committed chips resolve once, after the debounce, through the CTA door', async () => {
    resolveOne.mockImplementation(async (resolving) => {
      useHomeDraftStore.getState().resolveChip(resolving.id, {
        productId: STRAWBERRY,
        productName: 'STRAWBERRIES · Fresh Fruit',
      });
      return { chipId: resolving.id, status: 'added' };
    });
    act(() => useHomeDraftStore.getState().addChip(chip('c1', 'truskawka')));
    await flush(IDEA_SUGGESTION_DEBOUNCE_MS - 50);
    expect(resolveOne).not.toHaveBeenCalled();
    await flush(60);
    expect(resolveOne).toHaveBeenCalledTimes(1);
    expect(resolveOne.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
    await flush(IDEA_SUGGESTION_DEBOUNCE_MS * 2);
    // Never twice for the same chip.
    expect(resolveOne).toHaveBeenCalledTimes(1);
  });

  it('B-02: removing the chip cancels its resolution', async () => {
    let signal: AbortSignal | undefined;
    resolveOne.mockImplementation((_chip, abort) => {
      signal = abort;
      return new Promise(() => undefined);
    });
    act(() => useHomeDraftStore.getState().addChip(chip('c1', 'truskawka')));
    await flush(IDEA_SUGGESTION_DEBOUNCE_MS + 10);
    expect(signal?.aborted).toBe(false);
    act(() => useHomeDraftStore.getState().removeChip('c1'));
    await flush(0);
    expect(signal?.aborted).toBe(true);
  });
});

describe('B — matching keyed to the idea version', () => {
  const resolvedStrawberry = () =>
    act(() =>
      useHomeDraftStore.getState().addChip({
        ...chip('c1', 'truskawka'),
        productId: STRAWBERRY,
        productName: 'STRAWBERRIES · Fresh Fruit',
      }),
    );

  it('B-03: official cards come first, the Community card follows for the same version', async () => {
    let answer: (rows: unknown[]) => void = () => undefined;
    mocks.community.mockImplementation(
      () => new Promise((resolve) => (answer = resolve as (rows: unknown[]) => void)),
    );
    resolvedStrawberry();
    const official = searchOfficialMatches({
      requested: [{ productId: STRAWBERRY, statedRole: null, displayName: 'truskawka' }],
      profile: null,
    });
    expect(probe.latest!.official).toHaveLength(official.length);
    expect(probe.latest!.communitySettled).toBe(false);
    await flush(IDEA_SUGGESTION_DEBOUNCE_MS + 10);
    expect(mocks.community).toHaveBeenCalledTimes(1);
    await act(async () => {
      answer([
        {
          publication: 'p1',
          candidate: {
            id: 'p1',
            title: 'Truskawki z mascarpone',
            source: 'community',
            profile: 'gelato',
            ingredients: [],
            imageUrl: null,
            authorName: 'Anna',
            rank: 4,
          },
          alsoIncludes: [],
          slug: 's',
          publicationId: 'p1',
          handle: 'anna',
          title: 'Truskawki z mascarpone',
          creatorDisplayName: 'Anna',
        },
      ]);
    });
    expect(probe.latest!.communitySettled).toBe(true);
    expect(probe.latest!.cards.at(-1)).toMatchObject({
      source: 'community',
      title: 'Truskawki z mascarpone',
    });
  });

  it('B-04: a Community answer for an idea that has moved on is dropped', async () => {
    let answer: (rows: unknown[]) => void = () => undefined;
    mocks.community.mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve as (rows: unknown[]) => void)),
    );
    resolvedStrawberry();
    await flush(IDEA_SUGGESTION_DEBOUNCE_MS + 10);
    act(() => useHomeDraftStore.getState().removeChip('c1'));
    await act(async () => {
      answer([{ candidate: { id: 'late', source: 'community', rank: 1 }, alsoIncludes: [] }]);
    });
    expect(probe.latest!.signature).toBe('');
    expect(probe.latest!.cards).toHaveLength(0);
  });

  it('B-05: a dismissal applies to its own idea only — another ingredient is a new offer', async () => {
    resolvedStrawberry();
    const first = probe.latest!.signature;
    act(() => probe.latest!.dismiss(first));
    expect(probe.latest!.isDismissed(first)).toBe(true);
    act(() =>
      useHomeDraftStore.getState().addChip({
        ...chip('c2', 'bazylia'),
        concept: 'basil',
        productId: 'PI-ING-000999',
        productName: 'BASIL',
      }),
    );
    expect(probe.latest!.signature).not.toBe(first);
    expect(probe.latest!.isDismissed(probe.latest!.signature)).toBe(false);
  });

  it('B-06: settle waits for the resolution in flight and returns the §35 verdict of that version', async () => {
    let finish: () => void = () => undefined;
    resolveOne.mockImplementation(
      (resolving) =>
        new Promise((resolve) => {
          finish = () => {
            useHomeDraftStore.getState().resolveChip(resolving.id, { productId: STRAWBERRY });
            resolve({ chipId: resolving.id, status: 'added' });
          };
        }),
    );
    act(() => useHomeDraftStore.getState().addChip(chip('c1', 'truskawka')));
    await flush(IDEA_SUGGESTION_DEBOUNCE_MS + 10);
    let settled: Awaited<ReturnType<HomeIdeaSuggestions['settle']>> | null = null;
    const pending = probe.latest!.settle().then((value) => (settled = value));
    await flush(0);
    expect(settled).toBeNull();
    await act(async () => finish());
    await act(async () => {
      await pending;
    });
    expect(settled).not.toBeNull();
    expect(settled!.signature).toContain(STRAWBERRY);
    expect(['auto_adopt_official', 'show_popup', 'create_my_own']).toContain(
      settled!.result.decision.kind,
    );
  });
});

describe('B — a generic idea is offered the recipes of its concept (never adopted by them)', () => {
  const BANANA = 'PI-ING-000345';
  const RASPBERRY = 'PI-ING-000394';
  const generic = (id: string, productId: string, conceptKey: string): IntentChip => ({
    ...chip(id, conceptKey),
    concept: conceptKey,
    productId,
    productName: conceptKey,
    resolvedBy: { authority: 'SA03_CONCEPT_DEFAULT', conceptKey, scope: null },
  });

  it('B-07: „malina” (SA-03 default) is offered the official raspberry recipes by concept link', async () => {
    expect(
      searchOfficialMatches({
        requested: [{ productId: RASPBERRY, statedRole: null, displayName: 'malina' }],
        profile: null,
      }),
    ).toHaveLength(0);
    act(() => useHomeDraftStore.getState().addChip(generic('r1', RASPBERRY, 'raspberry')));
    await flush(0);
    const ids = probe.latest!.official.map((match) => match.candidate.id);
    expect(ids).toEqual(
      expect.arrayContaining(['classic-raspberry', 'classic-white-choc-raspberry']),
    );
    expect(probe.latest!.cards.map((card) => card.id)).toEqual(expect.arrayContaining(ids));
  });

  it('B-08: the same product chosen EXACTLY keeps identity matching', async () => {
    act(() =>
      useHomeDraftStore.getState().addChip({
        ...chip('r2', 'malina'),
        productId: RASPBERRY,
        productName: 'RASPBERRIES',
        resolvedBy: { authority: 'LITERAL_CATALOGUE' },
      }),
    );
    await flush(0);
    expect(probe.latest!.official).toHaveLength(0);
  });

  it('B-09: §35 never auto-adopts a concept suggestion — a single one stays an option', async () => {
    act(() => useHomeDraftStore.getState().addChip(generic('b1', BANANA, 'banana')));
    await flush(0);
    expect(probe.latest!.official.map((match) => match.candidate.id)).toContain('classic-banana');
    let settled: Awaited<ReturnType<HomeIdeaSuggestions['settle']>> | null = null;
    await act(async () => {
      settled = await probe.latest!.settle();
    });
    expect(settled!.result.decision.kind).toBe('create_my_own');
  });
});

describe('B — review 2026-09-17: one door, one dismissal, one answer', () => {
  const STRAWBERRY_NAME = 'STRAWBERRIES · Fresh Fruit';
  const resolvedChip = (id: string): IntentChip => ({
    ...chip(id, 'truskawka'),
    productId: STRAWBERRY,
    productName: STRAWBERRY_NAME,
  });

  it('B-10: „Tworzę swoją” in the same render is honoured — settle reports the dismissal', async () => {
    act(() => useHomeDraftStore.getState().addChip(resolvedChip('c1')));
    const idea = probe.latest!.signature;
    act(() => probe.latest!.dismiss(idea));
    let settled: Awaited<ReturnType<HomeIdeaSuggestions['settle']>> | null = null;
    await act(async () => {
      settled = await probe.latest!.settle();
    });
    expect(settled!.dismissed).toBe(true);
  });

  it('B-11: a dismissal survives the profile the flow asks for afterwards', async () => {
    act(() => useHomeDraftStore.getState().addChip(resolvedChip('c1')));
    const before = probe.latest!.signature;
    act(() => probe.latest!.dismiss(before));
    act(() => useHomeDraftStore.getState().setProfile('sorbet'));
    expect(probe.latest!.signature).not.toBe(before);
    // Narrowing the same matches by profile is not a new offer.
    expect(probe.latest!.isDismissed(probe.latest!.signature)).toBe(true);
  });

  it('B-12: settle stores the Community answer it waited for', async () => {
    mocks.community.mockResolvedValue([
      {
        publication: 'p1',
        candidate: {
          id: 'p1',
          title: 'Truskawki z mascarpone',
          source: 'community',
          profile: 'gelato',
          ingredients: [],
          imageUrl: null,
          authorName: 'Anna',
          rank: 4,
        },
        alsoIncludes: [],
        slug: 's',
        publicationId: 'p1',
        handle: 'anna',
        title: 'Truskawki z mascarpone',
        creatorDisplayName: 'Anna',
      },
    ]);
    act(() => useHomeDraftStore.getState().addChip(resolvedChip('c1')));
    expect(probe.latest!.communitySettled).toBe(false);
    await act(async () => {
      await probe.latest!.settle();
    });
    expect(probe.latest!.communitySettled).toBe(true);
    expect(probe.latest!.cards.at(-1)).toMatchObject({ source: 'community' });
  });

  it('B-13: the idea is „recognising” until every committed chip has an answer', async () => {
    let finish: () => void = () => undefined;
    resolveOne.mockImplementation(
      (resolving) =>
        new Promise((resolve) => {
          finish = () => {
            useHomeDraftStore.getState().resolveChip(resolving.id, { productId: STRAWBERRY });
            resolve({ chipId: resolving.id, status: 'added' });
          };
        }),
    );
    act(() => useHomeDraftStore.getState().addChip(chip('c1', 'truskawka')));
    expect(probe.latest!.recognising).toBe(true);
    await flush(IDEA_SUGGESTION_DEBOUNCE_MS + 10);
    expect(probe.latest!.recognising).toBe(true);
    await act(async () => finish());
    expect(probe.latest!.recognising).toBe(false);
  });

  it('B-14: the CTA resolves each chip once and never re-answers an identity question', async () => {
    resolveOne.mockImplementation(async (resolving) => {
      useHomeDraftStore.getState().resolveChip(resolving.id, { ambiguous: true });
      return { chipId: resolving.id, status: 'ambiguous' };
    });
    act(() => useHomeDraftStore.getState().addChip(chip('c1', 'truskawka')));
    await flush(IDEA_SUGGESTION_DEBOUNCE_MS + 10);
    expect(resolveOne).toHaveBeenCalledTimes(1);
    // The customer answers the question the first resolution raised.
    act(() =>
      useHomeDraftStore.getState().resolveChip('c1', {
        productId: STRAWBERRY,
        productName: STRAWBERRY_NAME,
        ambiguous: false,
      }),
    );
    await act(async () => {
      await probe.latest!.resolveRemaining();
    });
    expect(resolveOne).toHaveBeenCalledTimes(1);
    expect(useHomeDraftStore.getState().chips[0]?.productId).toBe(STRAWBERRY);
  });
});

describe('B — review 2026-09-17: the Community answer tells the truth', () => {
  const STRAWBERRY_ID = 'PI-ING-001553';
  const generic = (id: string): IntentChip => ({
    ...chip(id, 'truskawkowe'),
    concept: 'strawberry',
    productId: STRAWBERRY_ID,
    productName: 'STRAWBERRIES · Fresh Fruit',
    resolvedBy: { authority: 'SA03_CONCEPT_DEFAULT', conceptKey: 'strawberry', scope: null },
  });

  it('B-15: a search made before the frozen release loaded is never reused for the wider one', async () => {
    let releaseRuntime: (value: unknown) => void = () => undefined;
    mocks.runtimeHold = new Promise((resolve) => (releaseRuntime = resolve));
    mocks.community.mockResolvedValue([]);
    act(() => useHomeDraftStore.getState().addChip(generic('c1')));
    await flush(IDEA_SUGGESTION_DEBOUNCE_MS + 10);
    // Without the central authority the oracle can only be asked for the requested identity.
    expect(mocks.community).toHaveBeenCalledTimes(1);
    expect(mocks.community.mock.calls[0]?.[0]?.ingredientIds).toEqual([STRAWBERRY_ID]);

    await act(async () => {
      releaseRuntime(mocks.runtimeValue);
      await Promise.resolve();
    });
    await flush(IDEA_SUGGESTION_DEBOUNCE_MS + 10);
    // Once the approved forms are known the same idea is asked again — the narrow answer
    // is not served as if it had covered them.
    expect(mocks.community.mock.calls.length).toBeGreaterThan(1);
    const widened = mocks.community.mock.calls.map((call) => call[0]?.ingredientIds?.[0]);
    expect(new Set(widened).size).toBeGreaterThan(1);
  });

  it('B-17: after the profile is chosen the layer settles again — generation is never held forever', async () => {
    mocks.community.mockResolvedValue([]);
    act(() => useHomeDraftStore.getState().addChip(generic('c1')));
    await flush(IDEA_SUGGESTION_DEBOUNCE_MS + 10);
    await act(async () => {
      await probe.latest!.settle();
    });
    expect(probe.latest!.communitySettled).toBe(true);
    // The flow asks for the profile AFTER the CTA: the idea version changes.
    act(() => useHomeDraftStore.getState().setProfile('sorbet'));
    expect(probe.latest!.communitySettled).toBe(false);
    await flush(IDEA_SUGGESTION_DEBOUNCE_MS + 10);
    await flush(0);
    expect(probe.latest!.communitySettled).toBe(true);
  });

  it('B-16: the deadline only bounds what is SHOWN — the real answer still lands', async () => {
    const pending: (() => void)[] = [];
    const row = {
      publication: 'p9',
      candidate: {
        id: 'p9',
        title: 'Truskawkowe z bazylią',
        source: 'community',
        profile: 'gelato',
        ingredients: [],
        imageUrl: null,
        authorName: 'Ola',
        rank: 2,
      },
      alsoIncludes: [],
      slug: 's',
      publicationId: 'p9',
      handle: 'ola',
      title: 'Truskawkowe z bazylią',
      creatorDisplayName: 'Ola',
    };
    mocks.community.mockImplementation(
      ({ ingredientIds }: { ingredientIds: string[] }) =>
        new Promise((resolve) => {
          pending.push(() => resolve(ingredientIds[0] === STRAWBERRY_ID ? [row] : []));
        }),
    );
    act(() => useHomeDraftStore.getState().addChip(generic('c1')));
    // The debounce, then the central authority landing and asking again, then the deadline.
    await flush(IDEA_SUGGESTION_DEBOUNCE_MS + 10);
    await flush(COMMUNITY_ANSWER_TIMEOUT_MS + 10);
    await flush(COMMUNITY_ANSWER_TIMEOUT_MS + 10);
    // The layer stopped waiting, and says so instead of claiming there is no match.
    expect(probe.latest!.communitySettled).toBe(true);
    expect(probe.latest!.cards.some((card) => card.source === 'community')).toBe(false);

    // The sets are asked in chunks, so answering releases the next chunk: drain them all.
    for (let round = 0; round < 6 && pending.length > 0; round += 1) {
      const ready = pending.splice(0, pending.length);
      await act(async () => {
        for (const resolve of ready) resolve();
        await Promise.resolve();
      });
      await flush(0);
    }
    expect(probe.latest!.cards.at(-1)).toMatchObject({
      source: 'community',
      title: 'Truskawkowe z bazylią',
    });
  });
});

describe('Owner 2026-09-18 — one v2 request per idea, through the live layer', () => {
  const v2Card = (id: string, title: string, matchedIds: readonly string[]) => ({
    publicationId: id,
    slug: `s-${id}`,
    handle: 'ola',
    title,
    creatorDisplayName: 'Ola',
    alsoIncludes: [],
    matchedIds,
    candidate: {
      id,
      title,
      source: 'community',
      profile: 'gelato',
      ingredients: [],
      imageUrl: null,
      authorName: 'Ola',
      rank: 2,
    },
  });
  const genericStrawberry = (id: string): IntentChip => ({
    ...chip(id, 'truskawkowe'),
    productId: STRAWBERRY,
    productName: 'STRAWBERRIES · Fresh Fruit',
    resolvedBy: { authority: 'SA03_CONCEPT_DEFAULT', conceptKey: 'strawberry', scope: null },
  });

  it('V2-HOOK-01: an exact idea asks v2 ONCE — for the live cards and the CTA together', async () => {
    mocks.communityV2.mockResolvedValue({
      kind: 'ok',
      rejected: 0,
      matches: [v2Card('p1', 'Truskawkowe', [STRAWBERRY])],
    });
    act(() =>
      useHomeDraftStore.getState().addChip({
        ...chip('c1', 'truskawka'),
        productId: STRAWBERRY,
        productName: 'STRAWBERRIES · Fresh Fruit',
      }),
    );
    await flush(IDEA_SUGGESTION_DEBOUNCE_MS + 10);
    await act(async () => {
      await probe.latest!.settle();
    });
    // The central authority loaded at the CTA: the same question is not asked again.
    await flush(IDEA_SUGGESTION_DEBOUNCE_MS + 10);
    expect(mocks.communityV2).toHaveBeenCalledTimes(1);
    expect(mocks.communityV2.mock.calls[0]?.[0]).toEqual({ groups: [[STRAWBERRY]], profile: null });
    expect(mocks.community).not.toHaveBeenCalled();
    expect(probe.latest!.cards.at(-1)).toMatchObject({
      source: 'community',
      title: 'Truskawkowe',
      usedForm: null,
      searchIncomplete: false,
    });
  });

  it('V2-HOOK-02: a generic idea sends every approved form in ONE group; the card names the form from matched_ids', async () => {
    const context = await loadConceptMatchContext();
    const answeredBy = (groups: readonly (readonly string[])[]) =>
      groups[0]!.slice(1).find((id) => context.nameOf(id) !== null) ?? groups[0]![0]!;
    mocks.communityV2.mockImplementation(async ({ groups }: { groups: string[][] }) => ({
      kind: 'ok',
      rejected: 0,
      matches: [v2Card('p2', 'Truskawkowe z bazylią', [answeredBy(groups)])],
    }));
    act(() => useHomeDraftStore.getState().addChip(genericStrawberry('c1')));
    await act(async () => {
      await probe.latest!.settle();
    });
    const groups = mocks.communityV2.mock.calls.at(-1)![0].groups as string[][];
    expect(groups).toHaveLength(1);
    expect(groups[0]![0]).toBe(STRAWBERRY);
    expect(groups[0]!.length).toBeGreaterThan(1);
    const form = answeredBy(groups);
    expect(form).not.toBe(STRAWBERRY);
    expect(probe.latest!.cards.at(-1)).toMatchObject({
      source: 'community',
      usedForm: context.nameOf(form),
      searchIncomplete: false,
    });
    expect(mocks.community).not.toHaveBeenCalled();
  });

  const singleOfficialCarrier = () => {
    const carriers = new Map<string, string[]>();
    for (const candidate of officialCandidates()) {
      for (const ingredient of candidate.ingredients) {
        carriers.set(ingredient.productId, [
          ...(carriers.get(ingredient.productId) ?? []),
          candidate.id,
        ]);
      }
    }
    const [productId, [ownerId]] = [...carriers].find(([, ids]) => ids.length === 1)!;
    return {
      productId,
      profile: officialCandidates().find((candidate) => candidate.id === ownerId)!.profile,
    };
  };

  it.each([
    ['answered completely', { kind: 'ok', matches: [], rejected: 0 }, 'auto_adopt_official', false],
    ['failed', { kind: 'error', reason: 'failed' }, 'show_popup', true],
    ['timed out', { kind: 'error', reason: 'timeout' }, 'show_popup', true],
  ] as const)(
    'V2-HOOK-03: v2 %s → the §35 verdict at the CTA is %s',
    async (_label, outcome, verdict, partial) => {
      mocks.communityV2.mockResolvedValue(outcome);
      const carrier = singleOfficialCarrier();
      act(() => {
        useHomeDraftStore.getState().setProfile(carrier.profile);
        useHomeDraftStore.getState().addChip({
          ...chip('c1', 'x'),
          productId: carrier.productId,
          productName: carrier.productId,
        });
      });
      let settled: Awaited<ReturnType<HomeIdeaSuggestions['settle']>> | null = null;
      await act(async () => {
        settled = await probe.latest!.settle();
      });
      expect(settled!.result.decision.kind).toBe(verdict);
      expect(settled!.result.coverage.partial).toBe(partial);
      // A failed v2 never becomes a v1 answer, nor a Community card.
      expect(mocks.community).not.toHaveBeenCalled();
      expect(probe.latest!.cards.some((card) => card.source === 'community')).toBe(false);
    },
  );
});
