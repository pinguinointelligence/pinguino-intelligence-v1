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
  ilike: [string, string][];
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
      const cap: Captured = { table, eq: [], ilike: [], or: [], order: [], range: null, aborted: false, select: '' };
      captured.push(cap);
      const builder = {
        select(cols: string) { cap.select = cols; return builder; },
        eq(col: string, val: unknown) { cap.eq.push([col, val]); return builder; },
        ilike(col: string, val: string) { cap.ilike.push([col, val]); return builder; },
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
import { isProductPickerSelectionCurrent } from './productPickerModel';

beforeEach(() => { captured.length = 0; backendRows = []; });

describe('per-query server request (tests 3/4/5)', () => {
  it('every settled query issues a CURRENT backend request with per-token alias OR-groups', async () => {
    await searchEngineApprovedIngredients('świeże truskawki');
    expect(captured.length).toBe(1);
    const cap = captured[0]!;
    expect(cap.table).toBe('mapper_basement_search');
    expect(cap.eq).toEqual([['approved_for_base', true]]);
    expect(cap.ilike).toEqual([]);
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
      expect(c.eq).toEqual([['approved_for_base', true]]);
      expect(c.ilike).toEqual([]);
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
      'ingredient_category', 'ingredient_subcategory',
      'approved_for_base', 'approved_for_engines',
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
    const hook = read('features', 'global-catalog', 'useGlobalCatalogPicker.ts');
    expect(hook).toContain("refetchOnMount: 'always'");
    expect(hook).toContain('staleTime: 15_000');
    expect(hook).toContain("['product-search-v1'");
  });

  it('no permanent catalogue storage: the search path never touches localStorage/indexedDB', () => {
    for (const [folder, file] of [['global-catalog', 'useGlobalCatalogPicker.ts'], ['ingredient-builder', 'ProductPickerPopover.tsx'], ['ingredient-builder', 'useIngredientLibrary.ts']] as const) {
      const src = read('features', folder, file);
      expect(src).not.toMatch(/localStorage|indexedDB/i);
    }
  });

  it('the builder mounts the live picker for serverSearch libraries', () => {
    const builder = read('features', 'ingredient-builder', 'IngredientBuilder.tsx');
    const picker = read('features', 'ingredient-builder', 'ProductPickerPopover.tsx');
    expect(builder).toContain('<ProductPickerPopover');
    expect(picker).toContain('library.serverSearch');
    expect(picker).toContain('useGlobalCatalogPicker');
    expect(picker).not.toContain('useIngredientSearch');
    expect(picker).toContain('getEngineApprovedIngredientById(option.catalog.mappedIngredientId)');
  });

  it('stale-add protection: the current picker rejects old server hits until the new query settles', () => {
    expect(
      isProductPickerSelectionCurrent({
        serverSearch: true,
        serverSettled: false,
        localOption: false,
      }),
    ).toBe(false);
    expect(
      isProductPickerSelectionCurrent({
        serverSearch: true,
        serverSettled: true,
        localOption: false,
      }),
    ).toBe(true);
    expect(
      isProductPickerSelectionCurrent({
        serverSearch: true,
        serverSettled: false,
        localOption: true,
      }),
    ).toBe(true);
    const src = read('features', 'ingredient-builder', 'ProductPickerPopover.tsx');
    expect(src).toContain('globalCatalog.isSettled');
    expect(src).toContain('isProductPickerSelectionCurrent');
    expect(src).toContain('getEngineApprovedIngredientById(option.catalog.mappedIngredientId)');
  });

  it('binds modal identity and the focus trap to the visible picker, never its backdrop', () => {
    const src = read('features', 'ingredient-builder', 'ProductPickerPopover.tsx');
    const backdropClass = src.indexOf('className="fixed inset-0 z-[89]');
    const backdropStart = src.lastIndexOf('<div', backdropClass);
    const dialogClass = src.indexOf("'shadow-pro-e3 fixed");
    const dialogStart = src.lastIndexOf('<div', dialogClass);
    const dialogEnd = src.indexOf('onKeyDown={(event)', dialogStart);
    const backdrop = src.slice(backdropStart, dialogStart);
    const dialog = src.slice(dialogStart, dialogEnd);
    expect(backdrop).not.toContain('id={dialogId}');
    expect(backdrop).not.toContain('ref={dialogRef}');
    expect(dialog).toContain('id={dialogId}');
    expect(dialog).toContain('ref={dialogRef}');
    expect(dialog).toContain('aria-modal="true"');
    expect(src).toContain("dialogRef.current?.querySelectorAll<HTMLElement>");
    expect(src).toContain('triggerRef.current?.focus()');
  });

  it('debounce + per-query key: a stale response can never overwrite a newer canonical query', () => {
    const hook = read('features', 'global-catalog', 'useGlobalCatalogPicker.ts');
    expect(hook).toContain('useDebouncedValue(input.query, 250)');
    expect(hook).toContain("['product-search-v1'");
    expect(hook).toContain('queryFn: async () =>');
    expect(hook).toContain('cursor: rows.length');
  });

  it('pagination is an explicit server cursor, not a client-side catalogue snapshot', () => {
    const service = read('services', 'globalCatalog.ts');
    expect(service).toContain('cursor?: number');
    expect(service).toContain('p_cursor: input.cursor ?? 0');
    expect(service).not.toContain('listEngineApprovedIngredients()');
    const picker = read('features', 'ingredient-builder', 'ProductPickerPopover.tsx');
    expect(picker).toContain('globalCatalog.hasMore');
    expect(picker).toContain('globalCatalog.loadMore()');
  });
});
