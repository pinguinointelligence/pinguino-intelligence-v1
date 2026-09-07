import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { labelAllergenStatement } from './masterLabel';

/*
  `none_declared` MEANS "the source declared nothing", NOT "this product contains no allergens".

  The 2026-09-07 Mapper release brings 58 new ingredients, 57 of them carrying `none_declared` and
  one `gluten_barley`. Read as a guarantee, that single word would put a false allergen-free claim
  on a printed label — the one kind of mistake on a food label that can actually hurt somebody.

  The value is currently handled correctly: masterLabel groups it with `unknown` as UNAVAILABLE and
  emits no statement at all. This file exists so that stays true, and so that nobody later
  "improves" it into a positive claim.
*/
describe('none_declared is an absence of information, never a claim', () => {
  it('produces no allergen statement at all', () => {
    for (const value of ['none_declared', 'none declared', 'NONE_DECLARED', ' unknown ']) {
      expect(
        labelAllergenStatement({ allergens: { labelStatements: [value] } } as never),
      ).toBeNull();
    }
  });

  it('still prints a real declaration, and drops only the empty one beside it', () => {
    expect(
      labelAllergenStatement({
        allergens: { labelStatements: ['none_declared', 'gluten_barley'] },
      } as never),
    ).toBe('gluten_barley');
  });

  it('no code anywhere turns the absence into an allergen-free concept', () => {
    // A grep-level guard: the moment someone introduces `allergen_free` / `allergenFree` as a
    // derived flag, this fails and the reviewer has to justify it against the rule above.
    const roots = ['src', 'supabase/functions'];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(resolve(dir, entry.name));
        else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
          const text = readFileSync(resolve(dir, entry.name), 'utf8');
          if (/\ballergen[_-]?free\b/i.test(text)) hits.push(resolve(dir, entry.name));
        }
      }
    };
    for (const root of roots) walk(resolve(process.cwd(), root));
    expect(hits).toEqual([]);
  });
});
