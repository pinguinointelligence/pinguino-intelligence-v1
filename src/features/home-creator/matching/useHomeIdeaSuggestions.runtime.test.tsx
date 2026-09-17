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
}));

vi.mock('./communityMatchService', () => ({ matchCommunityTop100: mocks.community }));
// The REAL frozen Search release, read from disk instead of fetched.
vi.mock('@/features/mapper-search-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/mapper-search-runtime')>();
  const { createTestMapperSearchRuntime } =
    await import('@/features/mapper-search-runtime/testRelease');
  const runtime = createTestMapperSearchRuntime();
  return { ...actual, loadMapperSearchRuntime: async () => runtime };
});

import { useHomeDraftStore, type IntentChip } from '../homeDraftStore';
import type { IntentIngredientOutcome } from '../useHomeIntentIngredients';
import { searchOfficialMatches } from './homeMatchSearch';
import {
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
  vi.useFakeTimers();
  useHomeDraftStore.getState().startNew();
  resolveOne.mockReset();
  mocks.community.mockReset().mockResolvedValue([]);
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

  it('B-05: a dismissal applies to its own idea version only', async () => {
    resolvedStrawberry();
    const first = probe.latest!.signature;
    act(() => probe.latest!.dismiss(first));
    expect(probe.latest!.isDismissed(first)).toBe(true);
    act(() => useHomeDraftStore.getState().setProfile('sorbet'));
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
