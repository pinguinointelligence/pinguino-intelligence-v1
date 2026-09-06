/**
 * OWNER RULING 2026-09-06 — THE ALLERGEN LINE IS NEVER A GATE, FOR ANY INGREDIENT.
 *
 * One channel: `allergensText`. When a source states it we keep it; when nobody states it the value
 * is UNKNOWN. UNKNOWN never means "contains no allergens" and never means "may contain allergens",
 * and it blocks nothing — not the product, the Mapper, Rescue, a role, a recipe, production or a
 * label. The rule is identical for Base, Main, Topping, a scanned article, a Mapper row and a
 * Registry product: there is no per-role exception.
 *
 * These are SOURCE contracts. They read the code itself, so the rule cannot quietly come back in a
 * predicate, a refusal reason or a required question — in any layer, for any kind of ingredient.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(rel, 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__snapshots__') continue;
      walk(full, out);
    } else if (/\.(ts|tsx|sql)$/.test(full) && !/\.test\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

/** the CURRENT definition of a SQL function: the last migration that redefines or patches it wins */
function currentSql(fnName: string): string {
  const files = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => read(join('supabase/migrations', f)).includes(fnName));
  expect(files.length, `no migration defines ${fnName}`).toBeGreaterThan(0);
  return read(join('supabase/migrations', files[files.length - 1]!));
}

describe('the allergen line never gates anything (owner, 2026-09-06)', () => {
  it('the server authority refuses only on the INGREDIENT declaration, never the allergen line', () => {
    const authority = read('src/features/product-intelligence/productBehaviorAuthority.ts');
    expect(authority).not.toMatch(/allergen_statement_required/);
    expect(authority).toMatch(/ingredients_statement_required/);
  });

  /**
   * A patch migration necessarily QUOTES the predicate it replaces, so the file contains the old
   * text as an anchor. What matters is the REPLACEMENT — every `v_new` in the newest migration that
   * touches these predicates.
   */
  const replacementsIn = (sql: string): string[] =>
    [...sql.matchAll(/v_new := \$new\$([\s\S]*?)\$new\$/g)].map((m) => m[1] ?? '');

  it('the catalogue classifier no longer requires the allergen line for TOPPING', () => {
    const replacements = replacementsIn(currentSql('classify_catalog_product_behavior_v2'));
    const topping = replacements.find((r) => r.includes('v_topping'));
    expect(topping, 'no v_topping replacement found').toBeDefined();
    expect(topping!).not.toMatch(/allergensText/);
    // every other condition of the role stays exactly as it was
    expect(topping!).toMatch(/ingredientsText/);
    expect(topping!).toMatch(/nutrition/);
  });

  it('the label gate no longer requires the allergen line', () => {
    const replacements = replacementsIn(currentSql('v_has_allergens :='));
    const gate = replacements.find((r) => r.includes('v_has_allergens'));
    expect(gate, 'no v_has_allergens replacement found').toBeDefined();
    expect(gate!).not.toMatch(/allergensText/);
    expect(gate!).toMatch(/ingredientsText/);
  });

  it('no customer surface demands the allergen line as a required answer', () => {
    const logic = read('src/features/scan-flow/scanFlowLogic.ts');
    const field = logic.slice(logic.indexOf("key: 'allergensText'"));
    expect(field.slice(0, field.indexOf('});'))).toMatch(/required: false/);
  });

  it('nothing refuses to add an ingredient to a recipe over a missing allergen line', () => {
    const door = read('src/features/home-creator/homeScannedCatalogProduct.ts');
    expect(door).not.toMatch(/allergen_facts_missing/);
  });

  it('absence is never presented as "no allergens" anywhere in the product surfaces', () => {
    const forbidden =
      /(bez alergenów|nie zawiera alergen|brak alergenów|allergen[- ]?free|no allergens)/i;
    // comments are where the rule is EXPLAINED; only what a customer could read is checked
    const withoutComments = (text: string) =>
      text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const file of [
      ...walk('src/features/scan-flow'),
      ...walk('src/features/product-intelligence'),
      ...walk('src/features/home-creator'),
      ...walk('src/scan-import-v2'),
    ]) {
      expect(withoutComments(read(file)), file).not.toMatch(forbidden);
    }
  });

  it('no second allergen structure is introduced beside the one line', () => {
    // `declaredAllergens` / `mayContainAllergens` exist in the pre-existing global ingest contract and
    // are deliberately left alone; nothing NEW may be built in the scanner's own surfaces
    for (const file of [...walk('src/features/scan-flow'), ...walk('src/features/home-creator')]) {
      expect(read(file), file).not.toMatch(/allergenFree|containsAllergens|allergenAuthority/);
    }
  });
});
