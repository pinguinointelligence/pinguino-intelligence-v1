/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard: the legacy `public.ingredients` table (pre-v0.95, sole npac_value carrier) must stay
 * code-unreferenced, so it remains safe to read-only-lock / archive. The active ingredient
 * service reads `public.mapper_basement`, never the legacy table.
 */
describe('legacy public.ingredients — orphaned (safe to lock/archive)', () => {
  const dir = import.meta.dirname;
  const serviceFiles = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  it('no service reads or writes the legacy `ingredients` table', () => {
    for (const f of serviceFiles) {
      const src = readFileSync(join(dir, f), 'utf8');
      // a bare .from('ingredients') would hit the legacy table; the active code uses mapper_basement
      expect(/\.from\(\s*['"]ingredients['"]\s*\)/.test(src), f).toBe(false);
    }
  });

  it('the active ingredient service targets mapper_basement', () => {
    const src = readFileSync(join(dir, 'ingredients.ts'), 'utf8');
    expect(src.includes('mapper_basement')).toBe(true);
    expect(/\.from\(\s*['"]ingredients['"]\s*\)/.test(src)).toBe(false);
  });

  it('the active products + ingredients services carry no npac_value (the legacy column stays orphaned)', () => {
    for (const f of ['products.ts', 'ingredients.ts']) {
      const src = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(/npac_value/i.test(src), f).toBe(false);
    }
  });
});
