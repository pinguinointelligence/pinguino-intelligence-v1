/**
 * §22/§56 — HOME resolves identities through the canonical Pro paths, not its own.
 *
 * This is a BOUNDARY test: it asserts which functions the service calls, because the
 * failure it guards against is subtle. A search row carries no composition, so an
 * implementation that skipped the fresh `getEngineApprovedIngredientById` read and
 * built a line straight from the search hit would still "work" — and would put an
 * ingredient with invented science into a real recipe.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  join(process.cwd(), 'src/features/home-creator/homeIntentResolutionService.ts'),
  'utf8',
);

describe('HOME identity resolution uses the canonical catalogue paths', () => {
  it('searches with the same RPC the Pro picker and Products page use', () => {
    expect(SOURCE).toContain('searchCanonicalMapperIngredients');
    expect(SOURCE).toContain("from '@/services/productPicker/mapperSearch'");
  });

  it('hydrates a full EngineIngredient by stable id before it can become a line', () => {
    expect(SOURCE).toContain('getEngineApprovedIngredientById');
    expect(SOURCE).toContain('ingredientRowToEngineIngredient');
  });

  it('never builds an ingredient from a search row', () => {
    // A search row has no composition. Constructing an EngineIngredient literal here
    // would mean inventing water/solids/fat/sugar values.
    expect(SOURCE).not.toMatch(/water_percent|solids_percent|pac_value|pod_value/);
  });

  it('reports an unavailable catalogue distinctly from "no such product"', () => {
    // Collapsing the two would silently turn an outage into "we do not have that",
    // which is how a user ends up being offered a substitute they never asked for.
    expect(SOURCE).toContain("kind: 'unavailable'");
    expect(SOURCE).toContain("kind: 'unresolved'");
  });

  it('delegates the choice between candidates to the pure ranking module', () => {
    expect(SOURCE).toContain("from './homeIdentityResolution'");
    expect(SOURCE).toContain('resolveIdentity');
  });
});
