/**
 * LIVE server-search contract (owner P0) — proves the architecture, not just
 * the ranking: per-query backend requests, no full-catalogue preload, no
 * 1,000-row snapshot dependence, abortable requests, fresh-by-default cache,
 * and the demo-safe payload.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

/* ── a capturing fake PostgREST builder ──────────────────────────────────── */

interface Captured {
  table: string;
  eq: [string, unknown][];
  or: string[];
  order: [string, unknown][];
  range: [number, number] | null;
  aborted: boolean;
  select: string;
}

const captured: Captured[] = [];
/** Total physical rows the fake backend holds — `.range` slices honestly. */
let backendRows: unknown[] = [];

function fakeClient() {
  return {
    from(table: string) {
      const cap: Captured = { table, eq: [], or: [], order: [], range: null, aborted: false, select: '' };
      captured.push(cap);
      const builder = {
        select(cols: string) { cap.select = cols; return builder; },
        eq(col: string, val: unknown) { cap.eq.push([col, val]); return builder; },
        or(expr: string) { cap.or.push(expr); return builder; },
        order(col: string, opts: unknown) { cap.order.push([col, opts]); return builder; },
        range(from: number, to: number) { cap.range = [from, to]; return builder; },
        abortSignal(signal: AbortSignal) { cap.aborted = signal.aborted; return builder; },
        in() { return builder; },
        then(onOk: (v: { data: unknown[]; error: null }) => unknown) {
          const [from, to] = cap.range ?? [0, backendRows.length - 1];
          return Promise.resolve({ data: backendRows.slice(from, to + 1), error: null }).then(onOk);
        },
      };
      return builder;
    },
  };
}

vi.mock('@/lib/supabase/client', () => ({ supabase: fakeClient() }));

import { SEARCH_DB_PAGE_ROWS, searchEngineApprovedIngredients } from '@/services/ingredients';

beforeEach(() => { captured.length = 0; backendRows = []; });

describe('per-query server request (tests 3/4/5)', () => {
  it('every settled query issues a CURRENT backend request with per-token alias OR-groups', async () => {
    await searchEngineApprovedIngredients('świeże truskawki');
    expect(captured.length).toBe(1);
    const cap = captured[0]!;
    expect(cap.table).toBe('mapper_basement');
    expect(cap.eq).toEqual([['is_active', true], ['approved_for_engines', true]]);
    expect(cap.or.length).toBe(1); // one significant token („świeże" is a stopword)
    expect(cap.or[0]).toContain('ingredient_name_display.ilike.*truskaw*');
    expect(cap.or[0]).toContain('ingredient_name_internal.ilike.*straw*');
    expect(cap.or[0]).toContain('*fragol*');
  });

  it('multi-token queries AND their groups (one .or per token)', async () => {
    await searchEngineApprovedIngredients('vanilla bean');
    expect(captured[0]!.or.length).toBe(2);
  });

  it('the filtered candidate window is small `.range` paging — never the catalogue, never a 1,000-row snapshot', async () => {
    await searchEngineApprovedIngredients('milk');
    expect(captured[0]!.range).toEqual([0, 199]); // covers the largest verified family (milk=95) whole
    expect(captured.length).toBe(1); // short page → no further windows
  });

  it('an empty query fetches NOTHING (no full-catalogue download)', async () => {
    const rows = await searchEngineApprovedIngredients('   ');
    expect(rows).toEqual([]);
    expect(captured.length).toBe(0);
  });

  it('a client window past 1,000 pages via `.range` in sub-cap windows — no PostgREST max-rows truncation', async () => {
    backendRows = Array.from({ length: 1150 }, (_, i) => ({ ingredient_id: `PI-ING-${String(i).padStart(6, '0')}` }));
    const rows = await searchEngineApprovedIngredients('milk', { limit: 1200 });
    // Every physical request stays strictly below the 1,000-row PostgREST cap …
    expect(captured.map((c) => c.range)).toEqual([[0, 499], [500, 999], [1000, 1199]]);
    for (const c of captured) {
      expect(c.range![1] - c.range![0] + 1).toBeLessThanOrEqual(SEARCH_DB_PAGE_ROWS);
      expect(SEARCH_DB_PAGE_ROWS).toBeLessThan(1000);
    }
    // … and the client still receives EVERY existing row (1,150 > the old 1,000 wall).
    expect(rows.length).toBe(1150);
    expect(rows[1149]!.ingredient_id).toBe('PI-ING-001149');
  });

  it('a short `.range` page ends paging early (no pointless extra requests)', async () => {
    backendRows = Array.from({ length: 42 }, (_, i) => ({ ingredient_id: `PI-ING-${String(i).padStart(6, '0')}` }));
    const rows = await searchEngineApprovedIngredients('milk', { limit: 1200 });
    expect(rows.length).toBe(42);
    expect(captured.length).toBe(1); // first window [0,499] came back short → stop
  });

  it('every `.range` window repeats the SAME filters and deterministic order (stable paging)', async () => {
    backendRows = Array.from({ length: 700 }, (_, i) => ({ ingredient_id: `PI-ING-${String(i).padStart(6, '0')}` }));
    await searchEngineApprovedIngredients('milk', { limit: 700 });
    expect(captured.length).toBe(2);
    for (const c of captured) {
      expect(c.eq).toEqual([['is_active', true], ['approved_for_engines', true]]);
      expect(c.or).toEqual(captured[0]!.or);
      expect(c.order.map(([col]) => col)).toEqual(['ingredient_name_display', 'ingredient_id']); // stable tiebreak
    }
  });

  it('requests are abortable (cancellation reaches PostgREST)', async () => {
    const controller = new AbortController();
    controller.abort();
    await searchEngineApprovedIngredients('milk', { signal: controller.signal });
    expect(captured[0]!.aborted).toBe(true);
  });

  it('exact stable id queries reach the id column', async () => {
    await searchEngineApprovedIngredients('PI-ING-000390');
    const all = captured[0]!.or.join(' ');
    expect(all).toContain('ingredient_id.ilike.*000390*');
  });
});

describe('safe payload (test 23)', () => {
  it('selects only identity/name/category/form columns — no PAC/POD/composition', async () => {
    await searchEngineApprovedIngredients('milk');
    const cols = captured[0]!.select.split(',');
    expect(cols).toEqual([
      'ingredient_id', 'ingredient_name_display', 'ingredient_name_internal',
      'brand', 'ingredient_category', 'ingredient_subcategory',
    ]);
    for (const banned of ['pac_value', 'pod_value', 'water_percent', 'total_solids_percent', 'data_confidence_percent']) {
      expect(captured[0]!.select).not.toContain(banned);
    }
  });
});

describe('source pins — the architecture cannot silently regress (tests 1/2 + freshness)', () => {
  it('the Pro library hook NO LONGER preloads the catalogue (no listEngineApprovedIngredients)', () => {
    const hook = read('features', 'ingredient-builder', 'useIngredientLibrary.ts');
    expect(hook).not.toContain('listEngineApprovedIngredients');
    expect(hook).toContain('serverSearchLibrary');
    expect(hook).toContain('listIngredientsByIds'); // only the exact matched reference rows
  });

  it('the search hook is fresh-by-default: short staleTime, refetchOnMount always, query in the key', () => {
    const hook = read('features', 'ingredient-builder', 'useIngredientSearch.ts');
    expect(hook).toContain("refetchOnMount: 'always'");
    expect(hook).toMatch(/SEARCH_STALE_TIME_MS = 15_000/);
    expect(hook).toContain("['ingredient-search', norm, limit]");
  });

  it('no permanent catalogue storage: the search path never touches localStorage/indexedDB', () => {
    for (const file of ['useIngredientSearch.ts', 'ServerIngredientPicker.tsx', 'useIngredientLibrary.ts']) {
      const src = read('features', 'ingredient-builder', file);
      expect(src).not.toMatch(/localStorage|indexedDB/i);
    }
  });

  it('the builder mounts the live picker for serverSearch libraries', () => {
    const src = read('features', 'ingredient-builder', 'IngredientBuilder.tsx');
    expect(src).toContain('library.serverSearch');
    expect(src).toContain('<ServerIngredientPicker');
  });

  it('stale-add protection: selection is keyed to the settled query and add resolves by exact id', () => {
    const src = read('features', 'ingredient-builder', 'ServerIngredientPicker.tsx');
    expect(src).toContain('picked.norm === search.settledNorm');
    expect(src).toContain('getIngredientById(effectiveId)');
    expect(src).toContain('disabled={!canAdd}');
    // Add stays disabled until the CURRENT query's response is in (no stale Add).
    expect(src).toContain('(!hasQuery || search.isSettled)');
  });

  it('debounce + per-query key + abort propagation: a stale response can never overwrite a newer query', () => {
    const hook = read('features', 'ingredient-builder', 'useIngredientSearch.ts');
    expect(hook).toContain('useDebouncedValue(query, SEARCH_DEBOUNCE_MS)');
    expect(hook).toMatch(/SEARCH_DEBOUNCE_MS = 250/);
    // react-query's AbortSignal reaches the PostgREST request builder
    expect(hook).toContain('queryFn: ({ signal }) => searchEngineApprovedIngredients(debounced, { limit, signal })');
  });

  it('pagination correctness: window is stored WITH its query, resets on a new query, widens truthfully', () => {
    const hook = read('features', 'ingredient-builder', 'useIngredientSearch.ts');
    // a new settled query automatically restarts at page one (derived, no reset effect)
    expect(hook).toContain("pagination?.norm === norm ? pagination.limit : SEARCH_PAGE_SIZE");
    // loadMore only widens the CURRENT query's window
    expect(hook).toContain('setPagination({ norm, limit: limit + SEARCH_PAGE_SIZE })');
    // truthful hasMore: a completely filled window means more may exist
    expect(hook).toContain('(result.data?.length ?? 0) >= limit');
  });
});
