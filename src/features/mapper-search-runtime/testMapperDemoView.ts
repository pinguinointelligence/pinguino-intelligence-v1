/**
 * Test-only model of the public `mapper_basement_search_demo` read model, filled from
 * the REAL frozen Mapper rows of the SA-10 release (never hand-ordered fixtures).
 *
 * Two behaviours matter for concept defaults and are modelled separately:
 *   • an exact-id read (`.in('ingredient_id', …)`) returns whichever of those rows the
 *     table holds, in database order;
 *   • a name search (`.or(…ilike…)`) returns a `searchPage` the test controls, so a
 *     "default not on the first page" situation can be reproduced.
 */
import { readTestMapperSearchRelease } from './testRelease';

export type DemoViewRow = Record<string, unknown>;

export interface DemoViewCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

export interface FakeDemoViewState {
  table: DemoViewRow[];
  searchPage: DemoViewRow[] | null;
  calls: DemoViewCall[];
}

interface ReleaseMapperRow {
  id: string;
  displayName: string;
  internalName: string;
  category: string;
  subcategory: string;
  approvedForBase: boolean;
  approvedForEngines: boolean;
  active: boolean;
}

let releaseRows: Map<string, ReleaseMapperRow> | null = null;

/** Demo-view rows for real Mapper ids, as the 0033 view projects them. */
export function demoViewRowsFromRelease(ids: readonly string[]): DemoViewRow[] {
  releaseRows ??= new Map(
    (readTestMapperSearchRelease().mapperRows as unknown as ReleaseMapperRow[]).map((row) => [
      row.id,
      row,
    ]),
  );
  return ids.map((id) => {
    const row = releaseRows!.get(id);
    if (!row) throw new Error(`Unknown Mapper id in test: ${id}`);
    return {
      ingredient_id: row.id,
      ingredient_name_display: row.displayName,
      ingredient_name_internal: row.internalName,
      ingredient_category: row.category,
      ingredient_subcategory: row.subcategory,
      vegan: null,
      dairy_free: null,
      gluten_free: null,
      contains_alcohol: null,
      approved_for_base: row.approvedForBase,
      approved_for_engines: row.approvedForEngines,
      dataset_version: 'sa10-final-frozen',
    };
  });
}

export function createFakeDemoViewSupabase(state: FakeDemoViewState) {
  const makeBuilder = () => {
    let ids: readonly string[] | null = null;
    let searched = false;
    const equals: Array<[string, unknown]> = [];
    const builder: Record<string, unknown> = {};
    const chain =
      (method: string, effect?: (...args: unknown[]) => void) =>
      (...args: unknown[]) => {
        state.calls.push({ method, args });
        effect?.(...args);
        return builder;
      };
    builder.select = chain('select');
    builder.order = chain('order');
    builder.range = chain('range');
    builder.abortSignal = chain('abortSignal');
    builder.in = chain('in', (column, values) => {
      if (column === 'ingredient_id') ids = values as readonly string[];
    });
    builder.eq = chain('eq', (column, value) => equals.push([column as string, value]));
    builder.or = chain('or', () => {
      searched = true;
    });
    const rows = () => {
      const source = searched && state.searchPage ? state.searchPage : state.table;
      return source.filter(
        (row) =>
          (ids === null || ids.includes(row.ingredient_id as string)) &&
          equals.every(([column, value]) => row[column] === value),
      );
    };
    builder.then = (onOk: (value: unknown) => unknown, onError?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: rows(), error: null }).then(onOk, onError);
    return builder;
  };
  return {
    from: (...args: unknown[]) => {
      state.calls.push({ method: 'from', args });
      return makeBuilder();
    },
  };
}
