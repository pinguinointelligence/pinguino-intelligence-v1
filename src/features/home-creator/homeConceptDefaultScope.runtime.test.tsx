/**
 * Review of PR #398 — a frozen SA-03 default chosen before the customer states the
 * profile is re-chosen for the profile's SA-04 scope before it becomes a recipe line.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeDemoViewState } from '@/features/mapper-search-runtime/testMapperDemoView';

const mocks = vi.hoisted(() => ({
  searchProducts: vi.fn(),
  state: { table: [], searchPage: null, calls: [] } as FakeDemoViewState,
  hydrate: vi.fn(),
}));

vi.mock('@/features/mapper-search-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/mapper-search-runtime')>();
  const { createTestMapperSearchRuntime } =
    await import('@/features/mapper-search-runtime/testRelease');
  const runtime = createTestMapperSearchRuntime();
  return {
    ...actual,
    loadMapperSearchRuntime: async () => runtime,
    planMapperCatalogSearch: async (
      text: string,
      options: Parameters<typeof actual.planMapperCatalogSearch>[1] = {},
    ) =>
      actual.createMapperCatalogSearchPlan(runtime, text, {
        ...options,
        telemetry: { record() {} },
      }),
  };
});
vi.mock('@/lib/supabase/client', async () => {
  const { createFakeDemoViewSupabase } =
    await import('@/features/mapper-search-runtime/testMapperDemoView');
  return { isSupabaseConfigured: true, supabase: createFakeDemoViewSupabase(mocks.state) };
});
vi.mock('@/services/globalCatalog', () => ({ searchProducts: mocks.searchProducts }));
vi.mock('@/services/ingredients', () => ({ getEngineApprovedIngredientById: mocks.hydrate }));
vi.mock('@/services/productIntelligence', () => ({
  resolveProductBehaviorForSelection: vi.fn(async () => null),
}));

import { MAPPER_CONCEPT_DEFAULTS } from '@/features/mapper-search-runtime/generated/conceptDefaults';
import { demoViewRowsFromRelease } from '@/features/mapper-search-runtime/testMapperDemoView';
import { useHomeDraftStore, type IntentChip } from './homeDraftStore';
import { parseIntent } from './homeIntentParsing';
import { useHomeIntentIngredients } from './useHomeIntentIngredients';

const decision = (key: string) =>
  MAPPER_CONCEPT_DEFAULTS.defaults.find((row) => row.conceptKey === key)!;

function hook() {
  let api: ReturnType<typeof useHomeIntentIngredients>;
  const Probe = () => {
    api = useHomeIntentIngredients();
    return null;
  };
  renderToStaticMarkup(<Probe />);
  return api!;
}

const chip = (label: string): IntentChip => ({
  id: `scope-${label}`,
  label,
  concept: null,
  segment: label,
  role: null,
  source: 'text',
  productId: null,
  productName: null,
  ambiguous: false,
});

beforeEach(() => {
  mocks.searchProducts.mockReset().mockResolvedValue([]);
  mocks.hydrate.mockReset().mockResolvedValue(null);
  mocks.state.calls = [];
  const milk = decision('milk_chocolate');
  const spread = decision('hazelnut_cocoa_spread');
  const maple = decision('maple_syrup');
  mocks.state.table = demoViewRowsFromRelease([
    milk.defaultPiId,
    ...milk.alternativePiIds,
    spread.defaultPiId,
    ...spread.alternativePiIds,
    maple.defaultPiId,
    ...maple.alternativePiIds,
  ]);
  useHomeDraftStore.getState().startNew();
});

describe('HOME-SCOPE: profile stated after the idea', { timeout: 60_000 }, () => {
  it('HOME-SCOPE-01: milk chocolate chosen for ANY is withdrawn when the recipe becomes a Sorbet', async () => {
    const api = hook();
    const idea = chip('czekolada mleczna');
    useHomeDraftStore.getState().addChip(idea);
    await api.resolveOne(idea);
    const resolved = useHomeDraftStore.getState().chips[0]!;
    expect(resolved).toMatchObject({
      productId: decision('milk_chocolate').defaultPiId,
      resolvedBy: { authority: 'SA03_CONCEPT_DEFAULT', scope: null },
    });

    useHomeDraftStore.getState().setProfile('sorbet');
    await expect(api.prepareResolvedChip(resolved)).resolves.toBeNull();
    expect(useHomeDraftStore.getState().chips[0]).toMatchObject({
      productId: null,
      productName: null,
    });
    expect(mocks.hydrate).not.toHaveBeenCalled();
  });

  it('HOME-SCOPE-02: Gelato keeps the ANY default without a second selection', async () => {
    const api = hook();
    const idea = chip('czekolada mleczna');
    useHomeDraftStore.getState().addChip(idea);
    await api.resolveOne(idea);
    const resolved = useHomeDraftStore.getState().chips[0]!;
    mocks.state.calls = [];
    useHomeDraftStore.getState().setProfile('gelato');
    await api.prepareResolvedChip(resolved);
    expect(mocks.state.calls.some((call) => call.method === 'in')).toBe(false);
    expect(mocks.hydrate).toHaveBeenCalledWith(decision('milk_chocolate').defaultPiId);
  });
});

describe('HOME-PHRASE: one product named in several words', { timeout: 60_000 }, () => {
  it('HOME-PHRASE-01: „syrop klonowy” becomes one chip and one product, never two', async () => {
    const api = hook();
    for (const term of parseIntent('syrop klonowy').terms) {
      useHomeDraftStore.getState().addChip({
        id: `phrase-${term.raw}`,
        label: term.raw,
        concept: term.concept,
        segment: term.segment,
        role: term.role,
        source: 'text',
        productId: null,
        productName: null,
        ambiguous: false,
      });
    }
    expect(useHomeDraftStore.getState().chips).toHaveLength(2);
    for (const chipToResolve of [...useHomeDraftStore.getState().chips]) {
      await api.resolveOne(chipToResolve);
    }
    const chips = useHomeDraftStore.getState().chips;
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({
      label: 'syrop klonowy',
      productId: decision('maple_syrup').defaultPiId,
      ambiguous: false,
      resolvedBy: { authority: 'SA03_CONCEPT_DEFAULT', conceptKey: 'maple_syrup' },
    });
  });
});
