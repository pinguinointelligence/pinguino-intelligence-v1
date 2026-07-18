/// <reference types="node" />
/**
 * Track F — live Mapper search service contract:
 *  • the SAFE row is CLOSED (no pac/pod/composition — compile-time AND runtime);
 *  • ilike patterns escape user `%`/`_`/`\` and quote the filter value;
 *  • limit/offset map to an honest `range` (limit+1 → hasMore);
 *  • honest typed outcomes: unavailable (not configured / view missing),
 *    unauthorized (rich view, anon), aborted, error — never a raw throw;
 *  • CAPABILITY: search runs with NO subscription/entitlement check.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* ---------------------------------------------------------------- mock client */

interface FakeResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

const h = vi.hoisted(() => {
  const state = {
    configured: true,
    result: { data: [], error: null } as FakeResult,
    calls: [] as { method: string; args: unknown[] }[],
  };
  return state;
});

vi.mock('@/lib/supabase/client', () => {
  const record = (method: string, args: unknown[]) => h.calls.push({ method, args });
  const makeBuilder = (): Record<string, unknown> => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'or', 'eq', 'order', 'range', 'abortSignal']) {
      builder[method] = (...args: unknown[]) => {
        record(method, args);
        return builder;
      };
    }
    builder.maybeSingle = (...args: unknown[]) => {
      record('maybeSingle', args);
      return Promise.resolve(h.result);
    };
    builder.then = (onOk: (v: FakeResult) => unknown) => Promise.resolve(h.result).then(onOk);
    return builder;
  };
  return {
    get supabase() {
      if (!h.configured) return null;
      return {
        from: (...args: unknown[]) => {
          record('from', args);
          return makeBuilder();
        },
      };
    },
    get isSupabaseConfigured() {
      return h.configured;
    },
  };
});

import {
  DEMO_SEARCH_VIEW,
  MAPPER_SEARCH_COLUMNS,
  RICH_SEARCH_VIEW,
  escapeLikePattern,
  fetchIngredientEngineValues,
  ilikeOrFilter,
  searchMapperIngredients,
  toSafeMapperSearchRow,
  type SafeMapperSearchRow,
} from './mapperSearch';

const calls = (method: string) => h.calls.filter((c) => c.method === method);

const demoRow = (over: Partial<SafeMapperSearchRow> = {}): Record<string, unknown> => ({
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

beforeEach(() => {
  h.configured = true;
  h.result = { data: [], error: null };
  h.calls.length = 0;
});

/* ------------------------------------------------------- closed safe contract */

describe('the SAFE search row is a closed contract', () => {
  it('has no engine/composition keys at compile time', () => {
    // Each assignment fails to COMPILE if the forbidden key ever appears on the row type.
    const noPac: 'pac_value' extends keyof SafeMapperSearchRow ? never : true = true;
    const noPod: 'pod_value' extends keyof SafeMapperSearchRow ? never : true = true;
    const noSugars: 'total_sugars_percent' extends keyof SafeMapperSearchRow ? never : true = true;
    const noFat: 'fat_percent' extends keyof SafeMapperSearchRow ? never : true = true;
    const noConfidence: 'data_confidence_percent' extends keyof SafeMapperSearchRow ? never : true = true;
    const noEan: 'ean_code' extends keyof SafeMapperSearchRow ? never : true = true;
    expect([noPac, noPod, noSugars, noFat, noConfidence, noEan]).toEqual([true, true, true, true, true, true]);
  });

  it('the closed column list never selects an engine or admin field, and never *', () => {
    const columns: readonly string[] = MAPPER_SEARCH_COLUMNS;
    for (const forbidden of [
      '*',
      'pac_value',
      'pod_value',
      'sweetness_factor',
      'freezing_factor',
      'data_confidence_percent',
      'verification_status',
      'ean_code',
    ]) {
      expect(columns.includes(forbidden), forbidden).toBe(false);
    }
    for (const col of columns) expect(col.endsWith('_percent'), col).toBe(false);
  });

  it('RUNTIME: strips engine values even if the backend response carried them', async () => {
    h.result = {
      data: [{ ...demoRow(), pac_value: 190, pod_value: 100, total_sugars_percent: 48 }],
      error: null,
    };
    const outcome = await searchMapperIngredients({ text: 'czekolada' });
    expect(outcome.kind).toBe('results');
    if (outcome.kind !== 'results') return;
    const row = outcome.rows[0] as unknown as Record<string, unknown>;
    expect(row.ingredient_id).toBe('PI-ING-000001');
    expect('pac_value' in row).toBe(false);
    expect('pod_value' in row).toBe(false);
    expect('total_sugars_percent' in row).toBe(false);
  });

  it('toSafeMapperSearchRow keeps exactly the closed columns', () => {
    const safe = toSafeMapperSearchRow({ ...demoRow(), supplier: 'X', cost_per_kg: 9 });
    expect(Object.keys(safe).sort()).toEqual([...MAPPER_SEARCH_COLUMNS].sort());
  });
});

/* ------------------------------------------------------------ ilike escaping */

describe('ilike escaping', () => {
  it('escapes %, _ and backslash so user text matches literally', () => {
    expect(escapeLikePattern('70%_kakao\\x')).toBe('70\\%\\_kakao\\\\x');
    expect(escapeLikePattern('plain')).toBe('plain');
  });

  it('quotes the or-filter value so commas and parens cannot break the filter tree', () => {
    const filter = ilikeOrFilter(['a', 'b'], 'mleko, (2%)');
    expect(filter).toBe('a.ilike."%mleko, (2\\\\%)%",b.ilike."%mleko, (2\\\\%)%"');
  });
});

/* -------------------------------------------------------------- query wiring */

describe('searchMapperIngredients query wiring', () => {
  it('queries the DEMO view with the closed column list (never *)', async () => {
    await searchMapperIngredients({ text: 'wanilia' });
    expect(calls('from')[0]?.args).toEqual([DEMO_SEARCH_VIEW]);
    expect(calls('select')[0]?.args).toEqual([MAPPER_SEARCH_COLUMNS.join(',')]);
  });

  it('searches display AND internal name with the escaped pattern', async () => {
    await searchMapperIngredients({ text: '70%' });
    expect(calls('or')[0]?.args[0]).toBe(
      'ingredient_name_display.ilike."%70\\\\%%",ingredient_name_internal.ilike."%70\\\\%%"',
    );
  });

  it('maps limit/offset to an honest range (limit+1 probe rows)', async () => {
    await searchMapperIngredients({ text: 'x', limit: 20, offset: 40 });
    expect(calls('range')[0]?.args).toEqual([40, 60]);
  });

  it('narrows by category and honors the abort signal', async () => {
    const controller = new AbortController();
    await searchMapperIngredients({ text: 'x', category: 'fruit', signal: controller.signal });
    expect(calls('eq')[0]?.args).toEqual(['ingredient_category', 'fruit']);
    expect(calls('abortSignal')[0]?.args).toEqual([controller.signal]);
  });

  it('reports hasMore only when the probe row came back, and never returns it', async () => {
    const rows = Array.from({ length: 21 }, (_, i) =>
      demoRow({ ingredient_id: `PI-ING-${String(i).padStart(6, '0')}` }),
    );
    h.result = { data: rows, error: null };
    const outcome = await searchMapperIngredients({ text: 'a', limit: 20 });
    expect(outcome).toMatchObject({ kind: 'results', hasMore: true });
    if (outcome.kind === 'results') expect(outcome.rows).toHaveLength(20);
  });
});

/* ------------------------------------------------------------ honest outcomes */

describe('honest outcomes', () => {
  it('backend not configured → unavailable (not_configured), no query attempted', async () => {
    h.configured = false;
    const outcome = await searchMapperIngredients({ text: 'x' });
    expect(outcome).toEqual({ kind: 'unavailable', reason: 'not_configured' });
    expect(h.calls).toHaveLength(0);
  });

  it('view not applied yet (42P01 / PGRST205) → unavailable (view_missing), not fake-empty', async () => {
    for (const code of ['42P01', 'PGRST205']) {
      h.result = { data: null, error: { code, message: 'relation missing' } };
      const outcome = await searchMapperIngredients({ text: 'x' });
      expect(outcome, code).toEqual({ kind: 'unavailable', reason: 'view_missing' });
    }
  });

  it('an aborted request reports aborted, not an error', async () => {
    const controller = new AbortController();
    controller.abort();
    h.result = { data: null, error: { message: 'AbortError: the operation was aborted' } };
    const outcome = await searchMapperIngredients({ text: 'x', signal: controller.signal });
    expect(outcome).toEqual({ kind: 'aborted' });
  });

  it('any other failure is a typed error, never a throw', async () => {
    h.result = { data: null, error: { code: '500', message: 'boom' } };
    const outcome = await searchMapperIngredients({ text: 'x' });
    expect(outcome).toEqual({ kind: 'error', message: 'boom' });
  });
});

/* ------------------------------------------------- rich view (post-selection) */

describe('fetchIngredientEngineValues (rich 0032 view)', () => {
  it('reads the RICH view by ingredient_id and returns the typed reference', async () => {
    h.result = {
      data: {
        ingredient_id: 'PI-ING-000123',
        ingredient_name_display: 'Czekolada gorzka 70%',
        pac_value: 190,
        pod_value: 100,
      },
      error: null,
    };
    const outcome = await fetchIngredientEngineValues('PI-ING-000123');
    expect(calls('from')[0]?.args).toEqual([RICH_SEARCH_VIEW]);
    expect(calls('eq')[0]?.args).toEqual(['ingredient_id', 'PI-ING-000123']);
    expect(outcome).toEqual({
      kind: 'values',
      reference: {
        ingredient_id: 'PI-ING-000123',
        ingredient_name_display: 'Czekolada gorzka 70%',
        pac_value: 190,
        pod_value: 100,
      },
    });
  });

  it('an anonymous session gets a typed unauthorized (42501), never a throw', async () => {
    h.result = { data: null, error: { code: '42501', message: 'permission denied' } };
    expect(await fetchIngredientEngineValues('PI-ING-1')).toEqual({ kind: 'unauthorized' });
  });

  it('missing row → not_found; missing view → unavailable; no client → unavailable', async () => {
    h.result = { data: null, error: null };
    expect(await fetchIngredientEngineValues('PI-ING-1')).toEqual({ kind: 'not_found' });
    h.result = { data: null, error: { code: 'PGRST205', message: 'no view' } };
    expect(await fetchIngredientEngineValues('PI-ING-1')).toEqual({
      kind: 'unavailable',
      reason: 'view_missing',
    });
    h.configured = false;
    expect(await fetchIngredientEngineValues('PI-ING-1')).toEqual({
      kind: 'unavailable',
      reason: 'not_configured',
    });
  });
});

/* ------------------------------------------------------- capability contract */

describe('CAPABILITY: search is not subscription-gated (owner decision)', () => {
  it('performs exactly one read against the demo view — no entitlement lookup, no extra query', async () => {
    h.result = { data: [demoRow()], error: null };
    await searchMapperIngredients({ text: 'czekolada' });
    expect(calls('from')).toHaveLength(1);
    expect(calls('from')[0]?.args).toEqual([DEMO_SEARCH_VIEW]);
  });

  it('imports no billing/entitlement/subscription module in the search path', () => {
    const source = readFileSync(join(resolve(import.meta.dirname), 'mapperSearch.ts'), 'utf8');
    const imports = source.match(/^import .*$/gm) ?? [];
    for (const line of imports) {
      expect(/billing|entitlement|subscription|tier|stripe/i.test(line), line).toBe(false);
    }
    expect(source.includes("from('subscriptions')")).toBe(false);
  });
});
