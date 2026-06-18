/// <reference types="node" />
/**
 * Slice B2 runtime guard — RUNTIME code must use the Mapper Basement names only.
 *
 * After the cutover, no non-test runtime source may reference a legacy approval
 * column name (`approved_for_pinguino_base` / `approved_for_minus_11_engine`) or
 * the legacy table. Test files keep the legacy names as rollback guards, and the
 * legacy migrations/seeds live under supabase/ — both are intentionally excluded
 * from the scan (it walks src/ and skips *.test.* / *.d.ts).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(REPO, ...p), 'utf8');

const LEGACY_APPROVAL = /approved_for_pinguino_base|approved_for_minus_11_engine/;

const isRuntimeSource = (file: string) =>
  (file.endsWith('.ts') || file.endsWith('.tsx')) &&
  !file.endsWith('.test.ts') &&
  !file.endsWith('.test.tsx') &&
  !file.endsWith('.d.ts');

function walkRuntimeSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkRuntimeSources(full, acc);
    else if (isRuntimeSource(full)) acc.push(full);
  }
  return acc;
}

describe('Slice B2 — runtime cutover to mapper_basement / approved_for_engines', () => {
  it('the ingredients service queries mapper_basement and filters approved_for_engines', () => {
    const svc = read('src', 'services', 'ingredients.ts');
    expect(svc.includes('mapper_basement')).toBe(true);
    expect(svc.includes('approved_for_engines')).toBe(true);
    expect(svc.includes('ingredients_final_v0_95_no_npac')).toBe(false);
    expect(LEGACY_APPROVAL.test(svc)).toBe(false);
  });

  it('IngredientRow and the intake schema use the renamed approval fields only', () => {
    for (const rel of [
      ['src', 'data', 'ingredients', 'ingredientRow.ts'] as const,
      ['src', 'data', 'ingredients', 'ingredientIntakeColumns.ts'] as const,
    ]) {
      const src = read(...rel);
      expect(src.includes('approved_for_base')).toBe(true);
      expect(src.includes('approved_for_engines')).toBe(true);
      expect(LEGACY_APPROVAL.test(src)).toBe(false);
    }
  });

  it('no runtime source file (non-test) references a legacy approval column name', () => {
    const offenders = walkRuntimeSources(join(REPO, 'src'))
      .filter((f) => LEGACY_APPROVAL.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(REPO.length + 1).replace(/\\/g, '/'));
    expect(offenders).toEqual([]);
  });
});
