/**
 * OWNER RULING 2026-09-06 — THE ALLERGEN LINE IS NEVER A GATE, FOR ANY INGREDIENT.
 *
 * One channel: `allergensText`. When a source states it we keep it; when nobody states it the value
 * is UNKNOWN. UNKNOWN never means "contains no allergens" and never means "may contain allergens",
 * and it blocks nothing — not the product, the Mapper, Rescue, a role, a recipe, production or a
 * label. The rule is identical for Base, Main, Topping, a scanned article, a Mapper row and a
 * Registry product: there is no per-role exception, and nothing else about Base/Main/Topping
 * qualification changes.
 *
 * These are SOURCE contracts. They read the code itself, so the gate cannot quietly come back in a
 * predicate, a refusal reason or a required question.
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
    } else if (/\.(ts|tsx)$/.test(full) && !/\.test\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

/** the CURRENT definition of a SQL predicate: the last migration that redefines or patches it wins */
function currentSql(needle: string): string {
  const files = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => read(join('supabase/migrations', f)).includes(needle));
  expect(files.length, `no migration mentions ${needle}`).toBeGreaterThan(0);
  return read(join('supabase/migrations', files[files.length - 1]!));
}

/**
 * A patch migration necessarily QUOTES the predicate it replaces, so the file contains the old text
 * as an anchor. What matters is the REPLACEMENT.
 */
const replacementsIn = (sql: string): string[] =>
  [...sql.matchAll(/v_new := \$new\$([\s\S]*?)\$new\$/g)].map((m) => m[1] ?? '');

describe('the allergen line never gates anything (owner, 2026-09-06)', () => {
  it('the catalogue classifier does not require the allergen line for TOPPING', () => {
    const topping = replacementsIn(currentSql('classify_catalog_product_behavior_v2')).find((r) =>
      r.includes('v_topping'),
    );
    expect(topping, 'no v_topping replacement found').toBeDefined();
    expect(topping!).not.toMatch(/allergensText/);
    // every other condition of the role stays exactly as it was
    expect(topping!).toMatch(/ingredientsText/);
    expect(topping!).toMatch(/nutrition/);
  });

  it('the label gate does not require the allergen line', () => {
    const gate = replacementsIn(currentSql('v_has_allergens :=')).find((r) =>
      r.includes('v_has_allergens'),
    );
    expect(gate, 'no v_has_allergens replacement found').toBeDefined();
    expect(gate!).not.toMatch(/allergensText/);
    expect(gate!).toMatch(/ingredientsText/);
  });

  it('the server authority never refuses over the allergen line', () => {
    expect(read('src/features/product-intelligence/productBehaviorAuthority.ts')).not.toMatch(
      /allergen_statement_required/,
    );
  });

  it('no customer surface demands the allergen line as a required answer', () => {
    const logic = read('src/features/scan-flow/scanFlowLogic.ts');
    const field = logic.slice(logic.indexOf("key: 'allergensText'"));
    expect(field.slice(0, field.indexOf('});'))).toMatch(/required: false/);
  });

  it('absence is never presented as "no allergens" on a customer surface', () => {
    const forbidden =
      /(bez alergenów|nie zawiera alergen|brak alergenów|allergen[- ]?free|no allergens)/i;
    // comments are where the rule is EXPLAINED; only what a customer could read is checked
    const withoutComments = (text: string) =>
      text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const file of [...walk('src/features/scan-flow'), ...walk('src/scan-import-v2')])
      expect(withoutComments(read(file)), file).not.toMatch(forbidden);
  });

  it('no second allergen structure is introduced beside the one line', () => {
    // `declaredAllergens` / `mayContainAllergens` exist in the pre-existing global ingest contract and
    // are deliberately left alone; nothing NEW may be built in the scanner's own surfaces
    for (const file of walk('src/features/scan-flow'))
      expect(read(file), file).not.toMatch(/allergenFree|containsAllergens|allergenAuthority/);
  });
});
