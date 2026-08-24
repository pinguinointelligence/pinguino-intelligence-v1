/**
 * SWEETENER FUNCTIONAL-ROLE AUDIT — the blast radius of the PAC/POD unit fix.
 *
 * Regenerates `reports/SWEETENER_FUNCTIONAL_ROLE_AUDIT.csv` from the Mapper
 * dataset for every row that participates in sugar-role resolution, so the
 * before/after of the unit-contract fix is inspectable rather than asserted.
 *
 * `roleBeforeUnitFix` is the HISTORICAL rule, reproduced verbatim from the
 * pre-fix `resolveFunctionalRole` sugar branch (`pac_value >= 1.3` read against
 * a stored per-100 g POINT). It exists only to produce the audit's "before"
 * column and to pin, structurally, that the defect was real.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineIngredient } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import {
  normalizeStoredPointsToRoleFactor,
  resolveFunctionalRole,
  type FunctionalRole,
} from './ingredientRoles';
import { HARD_ROLES } from './formulate';

const MAPPER_SOURCE = readFileSync(
  resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const [HEADER = [], ...RECORDS] = parseCsv(MAPPER_SOURCE);
const INDEX = new Map(HEADER.map((name, position) => [name, position]));
const NUMERIC = new Set(
  HEADER.filter((field) =>
    /_percent$|_value$|_factor$|brix|kcal|cost_per_kg|shelf_life_days|stabilizer_activity/.test(
      field,
    ),
  ),
);

const toRow = (record: readonly string[]): IngredientRow =>
  Object.fromEntries(
    HEADER.map((field, position) => {
      const raw = record[position]?.trim() ?? '';
      if (NUMERIC.has(field)) return [field, raw === '' ? null : Number(raw)];
      if (field === 'approved_for_base' || field === 'approved_for_engines' || field === 'is_active')
        return [field, raw.toLocaleLowerCase('en') === 'true'];
      if (field === 'verification_date' || field === 'last_reviewed_at') return [field, raw || null];
      return [field, raw];
    }),
  ) as unknown as IngredientRow;

/** The pre-fix sugar branch, verbatim — the unit mismatch preserved on purpose. */
function roleBeforeUnitFix(ingredient: EngineIngredient): FunctionalRole | null {
  if (ingredient.category !== 'sugar') return null;
  const c = ingredient.composition;
  const controlSugars = c.dextrose_percent + c.fructose_percent + c.glucose_percent;
  const pac = ingredient.pac_value; // ← stored POINTS compared to a FACTOR threshold
  if (controlSugars > c.sucrose_percent || (pac !== null && pac >= 1.3)) {
    return 'sugar_freezing_control';
  }
  return 'sweetener_sucrose';
}

/** Rows that participate in sugar-role resolution, plus the sweetener-shaped
 *  Mapper categories that land in other engine buckets (blast-radius context). */
const SUGAR_ROLE_CATEGORIES = new Set([
  'sweetener',
  'sugar',
  'icing_powder',
  'flavor_syrup',
  'variegate',
]);

interface AuditRow {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  engineCategory: string;
  rawPod: number | null;
  rawPac: number | null;
  normPod: number | null;
  normPac: number | null;
  before: FunctionalRole | null;
  after: FunctionalRole;
}

const AUDIT: readonly AuditRow[] = RECORDS.filter(
  (record) =>
    record.length > 5 && SUGAR_ROLE_CATEGORIES.has(record[INDEX.get('ingredient_category')!] ?? ''),
).map((record) => {
  const row = toRow(record);
  const engine = ingredientRowToEngineIngredient(row);
  return {
    id: row.ingredient_id,
    name: engine.name,
    category: row.ingredient_category,
    subcategory: row.ingredient_subcategory,
    engineCategory: engine.category,
    rawPod: engine.pod_value,
    rawPac: engine.pac_value,
    normPod: normalizeStoredPointsToRoleFactor(engine.pod_value),
    normPac: normalizeStoredPointsToRoleFactor(engine.pac_value),
    before: roleBeforeUnitFix(engine),
    after: resolveFunctionalRole(engine),
  };
});

const explain = (row: AuditRow): string => {
  if (row.engineCategory !== 'sugar')
    return `engine category ${row.engineCategory} — never entered the sugar branch; unchanged`;
  if (row.before === row.after) return 'unchanged by the unit fix';
  if (row.after === 'sweetener_sucrose')
    return 'sucrose-dominant row whose stored PAC (points) used to trip the 1.3 FACTOR separator';
  return 'no longer reaches the sucrose role as a residual — it is not a sucrose sweetener';
};

describe('sweetener functional-role audit', () => {
  it('regenerates reports/SWEETENER_FUNCTIONAL_ROLE_AUDIT.csv', () => {
    const header = [
      'ingredient_id',
      'ingredient_name',
      'category',
      'subcategory',
      'engine_category',
      'raw_pod',
      'raw_pac',
      'normalized_pod_for_role',
      'normalized_pac_for_role',
      'current_role_before',
      'role_after',
      'local_corrector_eligible_before',
      'local_corrector_eligible_after',
      'explanation',
    ].join(',');
    const csv = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
    const num = (value: number | null) => (value === null ? '' : String(value));
    const rows = AUDIT.map((row) =>
      [
        row.id,
        csv(row.name),
        row.category,
        row.subcategory,
        row.engineCategory,
        num(row.rawPod),
        num(row.rawPac),
        num(row.normPod),
        num(row.normPac),
        row.before ?? 'n/a (not a sugar-category row)',
        row.after,
        // "Can this row satisfy the sucrose HARD role a milk-gelato template
        // demands?" — the gate that decides local correction vs full formulation.
        String(row.before === 'sweetener_sucrose' && HARD_ROLES.has('sweetener_sucrose')),
        String(row.after === 'sweetener_sucrose' && HARD_ROLES.has('sweetener_sucrose')),
        csv(explain(row)),
      ].join(','),
    );
    mkdirSync('reports', { recursive: true });
    writeFileSync(
      'reports/SWEETENER_FUNCTIONAL_ROLE_AUDIT.csv',
      `${[header, ...rows].join('\n')}\n`,
      'utf8',
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('pins the defect: before the fix no ordinary Mapper sweetener was sucrose', () => {
    const sugarRows = AUDIT.filter((row) => row.engineCategory === 'sugar');
    const sucroseBefore = sugarRows.filter((row) => row.before === 'sweetener_sucrose');
    // The ONE row that reached the role did so because its stored PAC is 0 —
    // an artificial high-intensity sweetener, not a sucrose sweetener.
    expect(sucroseBefore.map((row) => row.id)).toEqual(['PI-ING-001427']);
    expect(sucroseBefore[0]!.rawPac).toBe(0);
  });

  it('after the fix the sucrose role is held only by sucrose-dominant rows', () => {
    const sucroseAfter = AUDIT.filter((row) => row.after === 'sweetener_sucrose');
    expect(sucroseAfter.length).toBeGreaterThan(0);
    for (const row of sucroseAfter) {
      const record = RECORDS.find((r) => r[INDEX.get('ingredient_id')!] === row.id)!;
      const sucrose = Number(record[INDEX.get('sucrose_percent')!]);
      expect(sucrose).toBeGreaterThanOrEqual(50);
      expect(row.normPac!).toBeLessThan(1.3);
    }
    // and canonical Sucrose is one of them
    expect(sucroseAfter.map((row) => row.id)).toContain('PI-ING-000514');
  });
});
