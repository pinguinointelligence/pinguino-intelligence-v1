/**
 * Track F — pure view-models for the live Mapper search:
 *  • two-source tabs (Składniki PI default);
 *  • debounce + stale-request cancellation as deterministic reducers/helpers;
 *  • honest phases (loading / empty / error / unavailable — never fake-empty);
 *  • stable PI-ING-* selection routed through the EXISTING readiness gate;
 *  • compact row view-models (dense rows, no metadata walls).
 */
import { describe, expect, it } from 'vitest';
import {
  createResolutionState,
  pickProduct,
  ingredientResolutionSummary,
} from '@/features/ingredient-resolution';
import type { MapperSearchOutcome, SafeMapperSearchRow } from '@/services/productPicker/mapperSearch';
import {
  DEFAULT_PICKER_SOURCE,
  INITIAL_LIVE_SEARCH,
  LIVE_SEARCH_DEBOUNCE_MS,
  PICKER_SOURCE_ORDER,
  compactIngredientRow,
  compactProductRow,
  createDebouncer,
  ingredientPickInput,
  liveSearchMoreStarted,
  liveSearchSettled,
  liveSearchStarted,
  safeRowToHit,
  type SafeIngredientHit,
} from './mapperLiveSearch';
import type { ProductPickResult } from './productPickerContracts';

const safeRow = (over: Partial<SafeMapperSearchRow> = {}): SafeMapperSearchRow => ({
  ingredient_id: 'PI-ING-000001',
  ingredient_name_display: 'Czekolada gorzka 70%',
  ingredient_name_internal: 'dark_chocolate_70',
  ingredient_category: 'chocolate_cocoa',
  ingredient_subcategory: 'dark',
  vegan: 'unknown',
  dairy_free: 'false',
  gluten_free: 'true',
  contains_alcohol: 'false',
  approved_for_base: true,
  approved_for_engines: true,
  dataset_version: 'v1.0',
  ...over,
});

const results = (rows: SafeMapperSearchRow[], hasMore = false): MapperSearchOutcome => ({
  kind: 'results',
  rows,
  hasMore,
});

/* ----------------------------------------------------------- two-source tabs */

describe('two-source tab view-model', () => {
  it('offers exactly the two sources, Mapper library first', () => {
    expect(PICKER_SOURCE_ORDER).toEqual(['pi_ingredients', 'products']);
  });

  it('opens on Składniki PI (owner decision)', () => {
    expect(DEFAULT_PICKER_SOURCE).toBe('pi_ingredients');
  });
});

/* -------------------------------------------------------------- hit mapping */

describe('safeRowToHit', () => {
  it('maps the demo-safe fields and carries the stable PI-ING-* id', () => {
    expect(safeRowToHit(safeRow())).toEqual({
      ingredientId: 'PI-ING-000001',
      displayName: 'Czekolada gorzka 70%',
      internalName: 'dark_chocolate_70',
      category: 'chocolate_cocoa',
      subcategory: 'dark',
      engineApproved: true,
    });
  });

  it('never invents engine approval (null/false stay false)', () => {
    expect(safeRowToHit(safeRow({ approved_for_engines: null })).engineApproved).toBe(false);
    expect(safeRowToHit(safeRow({ approved_for_engines: false })).engineApproved).toBe(false);
  });
});

/* ------------------------------------------------- lifecycle + cancellation */

describe('live search lifecycle reducers', () => {
  it('a fresh search clears prior hits and enters loading', () => {
    const withHits = liveSearchSettled(
      liveSearchStarted(INITIAL_LIVE_SEARCH, 'czek', 1),
      1,
      results([safeRow()]),
      'replace',
    );
    const next = liveSearchStarted(withHits, 'wan', 2);
    expect(next).toMatchObject({ phase: 'loading', query: 'wan', hits: [], requestId: 2 });
  });

  it('a STALE settlement is dropped — the newest request owns the UI', () => {
    const s1 = liveSearchStarted(INITIAL_LIVE_SEARCH, 'czek', 1);
    const s2 = liveSearchStarted(s1, 'czeko', 2);
    // request 1 settles late — ignored
    const afterStale = liveSearchSettled(s2, 1, results([safeRow()]), 'replace');
    expect(afterStale).toBe(s2);
    // request 2 settles — applied
    const applied = liveSearchSettled(s2, 2, results([safeRow()]), 'replace');
    expect(applied.phase).toBe('ready');
    expect(applied.hits).toHaveLength(1);
  });

  it('zero rows is an honest EMPTY phase (query preserved for the message)', () => {
    const s = liveSearchSettled(liveSearchStarted(INITIAL_LIVE_SEARCH, 'xyz', 1), 1, results([]), 'replace');
    expect(s.phase).toBe('empty');
    expect(s.query).toBe('xyz');
  });

  it('unavailable is NEVER presented as zero results', () => {
    const s = liveSearchSettled(
      liveSearchStarted(INITIAL_LIVE_SEARCH, 'czek', 1),
      1,
      { kind: 'unavailable', reason: 'view_missing' },
      'replace',
    );
    expect(s.phase).toBe('unavailable');
    expect(s.unavailableReason).toBe('view_missing');
  });

  it('error phase keeps already-loaded hits on a failed incremental page', () => {
    const loaded = liveSearchSettled(
      liveSearchStarted(INITIAL_LIVE_SEARCH, 'czek', 1),
      1,
      results([safeRow()], true),
      'replace',
    );
    const more = liveSearchMoreStarted(loaded, 2);
    expect(more.phase).toBe('loading_more');
    expect(more.hits).toHaveLength(1); // existing hits stay visible while loading
    const failed = liveSearchSettled(more, 2, { kind: 'error', message: 'boom' }, 'append');
    expect(failed.phase).toBe('error');
    expect(failed.hits).toHaveLength(1);
  });

  it('an incremental page APPENDS and dedupes on the stable id', () => {
    const page1 = liveSearchSettled(
      liveSearchStarted(INITIAL_LIVE_SEARCH, 'a', 1),
      1,
      results([safeRow({ ingredient_id: 'PI-ING-1' }), safeRow({ ingredient_id: 'PI-ING-2' })], true),
      'replace',
    );
    const page2 = liveSearchSettled(
      liveSearchMoreStarted(page1, 2),
      2,
      results([safeRow({ ingredient_id: 'PI-ING-2' }), safeRow({ ingredient_id: 'PI-ING-3' })], false),
      'append',
    );
    expect(page2.hits.map((h) => h.ingredientId)).toEqual(['PI-ING-1', 'PI-ING-2', 'PI-ING-3']);
    expect(page2.hasMore).toBe(false);
    expect(page2.phase).toBe('ready');
  });

  it('an aborted settlement changes nothing (the superseding request settles)', () => {
    const s = liveSearchStarted(INITIAL_LIVE_SEARCH, 'czek', 3);
    expect(liveSearchSettled(s, 3, { kind: 'aborted' }, 'replace')).toBe(s);
  });
});

/* ------------------------------------------------------------------ debounce */

describe('debouncer (injected timers — deterministic)', () => {
  const fakeTimers = () => {
    const pending = new Map<number, () => void>();
    let id = 0;
    return {
      timers: {
        set: (run: () => void) => {
          pending.set(++id, run);
          return id;
        },
        clear: (h: unknown) => void pending.delete(h as number),
      },
      fire: () => {
        const runs = [...pending.values()];
        pending.clear();
        runs.forEach((r) => r());
      },
      pendingCount: () => pending.size,
    };
  };

  it('rapid keystrokes collapse to ONE live query (the last one)', () => {
    const t = fakeTimers();
    const ran: string[] = [];
    const d = createDebouncer(LIVE_SEARCH_DEBOUNCE_MS, t.timers);
    d.schedule(() => ran.push('c'));
    d.schedule(() => ran.push('cz'));
    d.schedule(() => ran.push('cze'));
    expect(t.pendingCount()).toBe(1);
    t.fire();
    expect(ran).toEqual(['cze']);
  });

  it('cancel drops the pending run (sheet closed mid-typing)', () => {
    const t = fakeTimers();
    const ran: string[] = [];
    const d = createDebouncer(LIVE_SEARCH_DEBOUNCE_MS, t.timers);
    d.schedule(() => ran.push('x'));
    d.cancel();
    t.fire();
    expect(ran).toEqual([]);
  });
});

/* ---------------------------------------- selection → EXISTING readiness gate */

describe('stable-ID selection → resolution state (reused gate, no new gate)', () => {
  const hit: SafeIngredientHit = {
    ingredientId: 'PI-ING-000123',
    displayName: 'Czekolada gorzka 70%',
    internalName: 'dark_chocolate_70',
    category: 'chocolate_cocoa',
    subcategory: 'dark',
    engineApproved: true,
  };
  const state = () =>
    createResolutionState({
      workingRecipeId: 'wr-1',
      lines: [{ lineId: 'flavor:czekolada', ingredientName: 'Czekolada', requirementKind: 'needs_ingredient' }],
    });

  it('with rich-view pac/pod the line RESOLVES via reference-linked values and the Monitor gate opens', () => {
    const next = pickProduct(
      state(),
      'flavor:czekolada',
      ingredientPickInput(hit, {
        ingredient_id: 'PI-ING-000123',
        ingredient_name_display: 'Czekolada gorzka 70%',
        pac_value: 190,
        pod_value: 100,
      }),
    );
    const line = next.lines[0]!;
    expect(line.state).toBe('resolved');
    expect(line.attachedProductId).toBe('PI-ING-000123'); // the stable id travels
    expect(line.engineValues).toMatchObject({
      pac_value: 190,
      pod_value: 100,
      provenance: 'reference_linked',
      not_independently_measured: true, // honest: linked, not lab-measured here
    });
    expect(next.engineRerunToken).toBe(1); // exactly the product-flow gate opening
    expect(ingredientResolutionSummary(next).allResolved).toBe(true);
  });

  it('without engine values (anon / missing) the line goes honest needs_data — readiness is never faked', () => {
    const next = pickProduct(state(), 'flavor:czekolada', ingredientPickInput(hit, null));
    const line = next.lines[0]!;
    expect(line.state).toBe('needs_data');
    expect(line.attachedProductId).toBe('PI-ING-000123');
    expect(line.engineValues).toBeNull();
    expect(line.message).toBeTruthy();
    expect(next.engineRerunToken).toBe(0); // the Monitor gate stays closed
    expect(ingredientResolutionSummary(next).allResolved).toBe(false);
  });

  it('the synthetic pick input never invents a measurement', () => {
    const input = ingredientPickInput(hit, null);
    expect(input.product.pac_value).toBeNull();
    expect(input.product.pod_value).toBeNull();
    expect(input.product.matched_basement_id).toBe('PI-ING-000123');
  });
});

/* ------------------------------------------------------------- compact rows */

describe('compact row view-models (owner spec: dense rows)', () => {
  const labels = { engineApproved: 'Zatwierdzony dla silników PI', needsVerification: 'Do weryfikacji po wyborze' };

  it('Mapper row: display name, small internal name, category, compact id, readiness', () => {
    const vm = compactIngredientRow(safeRowToHit(safeRow()), labels);
    expect(vm).toEqual({
      key: 'PI-ING-000001',
      title: 'Czekolada gorzka 70%',
      subtitle: 'dark_chocolate_70',
      metaLine: 'chocolate_cocoa · dark',
      idLabel: 'PI-ING-000001',
      readinessLabel: 'Zatwierdzony dla silników PI',
      readinessTone: 'ready',
    });
  });

  it('Mapper row stays honest for a non-engine-approved hit', () => {
    const vm = compactIngredientRow(
      safeRowToHit(safeRow({ approved_for_engines: false, ingredient_subcategory: null })),
      labels,
    );
    expect(vm.readinessTone).toBe('needs_data');
    expect(vm.readinessLabel).toBe('Do weryfikacji po wyborze');
    expect(vm.metaLine).toBe('chocolate_cocoa');
  });

  it('Product row: name, brand+package, compact id/EAN, status, readiness', () => {
    const result = {
      entry: {
        productId: 'PR-ING-000042',
        productCode: 'PR-ING-000042',
        displayName: 'Crema de pistacho',
        internalName: null,
        brand: 'Marka',
        ean: '5901234123457',
        category: 'nut_paste',
        packageSize: '200 g',
        imageUrl: null,
        status: 'pi_generated',
        readiness: {},
        reference: null,
      },
      matchedOn: 'name_contains',
      readiness: { exactReady: true, badge: 'Gotowy do przeliczenia', message: null, referenceLinked: true },
      statusLabel: 'Wygenerowany przez PI',
    } as unknown as ProductPickResult;
    expect(compactProductRow(result, 'EAN')).toEqual({
      key: 'PR-ING-000042',
      title: 'Crema de pistacho',
      subtitle: 'Marka · 200 g',
      idLabel: 'PR-ING-000042 · EAN 5901234123457',
      statusLabel: 'Wygenerowany przez PI',
      readinessLabel: 'Gotowy do przeliczenia',
      readinessTone: 'ready',
    });
  });
});
