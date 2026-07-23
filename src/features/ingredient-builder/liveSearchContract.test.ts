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
  limit: number | null;
  aborted: boolean;
  select: string;
}

const captured: Captured[] = [];

function fakeClient(rows: unknown[] = []) {
  return {
    from(table: string) {
      const cap: Captured = { table, eq: [], or: [], order: [], limit: null, aborted: false, select: '' };
      captured.push(cap);
      const builder = {
        select(cols: string) { cap.select = cols; return builder; },
        eq(col: string, val: unknown) { cap.eq.push([col, val]); return builder; },
        or(expr: string) { cap.or.push(expr); return builder; },
        order(col: string, opts: unknown) { cap.order.push([col, opts]); return builder; },
        limit(n: number) { cap.limit = n; return builder; },
        abortSignal(signal: AbortSignal) { cap.aborted = signal.aborted; return builder; },
        in() { return builder; },
        then(onOk: (v: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve({ data: rows, error: null }).then(onOk);
        },
      };
      return builder;
    },
  };
}

vi.mock('@/lib/supabase/client', () => ({ supabase: fakeClient() }));

import { searchEngineApprovedIngredients } from '@/services/ingredients';

beforeEach(() => { captured.length = 0; });

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

  it('the filtered candidate page is small — never the catalogue, never a 1,000-row snapshot', async () => {
    await searchEngineApprovedIngredients('milk');
    expect(captured[0]!.limit).toBe(200); // covers the largest verified family (milk=95) whole
  });

  it('an empty query fetches NOTHING (no full-catalogue download)', async () => {
    const rows = await searchEngineApprovedIngredients('   ');
    expect(rows).toEqual([]);
    expect(captured.length).toBe(0);
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
  });
});
