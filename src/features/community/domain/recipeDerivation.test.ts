import { describe, expect, it } from 'vitest';
import {
  DERIVATION_PLAN,
  buildDerivedRecipe,
  canDerive,
  derivationRpcArgs,
  derivedTitle,
  type DerivationInput,
} from './recipeDerivation';
import { findDemoLeaks } from './demoSafeRecipe';

const SOURCE_INPUT = {
  mode: 'PRO',
  category: 'GELATO_WHITE',
  target_batch_grams: 1000,
  items: [{ id: 'l1', planned_grams: 512, ingredient: { name: 'MLEKO 3,2%' } }],
};

const input = (over: Partial<DerivationInput> = {}): DerivationInput => ({
  relation: 'copy',
  source: {
    kind: 'publication',
    publicationId: 'pub-1',
    handle: 'marysia',
    slug: 'pistachio-salted-caramel',
  },
  recipeInput: SOURCE_INPUT,
  sourceTitle: 'Pistachio Salted Caramel',
  sourceCreatorDisplayName: 'Marysia',
  engineVersion: 'e1',
  configVersion: 'c1',
  totalBatchG: 1000,
  ...over,
});

describe('§21 — „Użyj tej receptury" produces an independent copy', () => {
  it('keeps the original name: it IS that recipe, in your library', () => {
    expect(derivedTitle('copy', 'Pistachio Salted Caramel')).toBe('Pistachio Salted Caramel');
  });

  it('carries the SOURCE snapshot forward verbatim', () => {
    const payload = buildDerivedRecipe(input());
    expect(payload.recipeInput).toBe(SOURCE_INPUT);
    expect(payload.engineVersion).toBe('e1');
    expect(payload.configVersion).toBe('c1');
    expect(payload.totalBatchG).toBe(1000);
  });

  it('names the source in the recipe note, as a courtesy not a record', () => {
    expect(buildDerivedRecipe(input()).notes).toContain('Pistachio Salted Caramel');
    expect(buildDerivedRecipe(input()).notes).toContain('Marysia');
  });
});

describe('§22 — „Stwórz moją wersję" is a remix, and says so', () => {
  it('renames the copy so it never impersonates the original', () => {
    expect(derivedTitle('remix', 'Pistachio Salted Caramel')).toBe(
      'Pistachio Salted Caramel — moja wersja',
    );
  });

  it('records „Na podstawie" in the note', () => {
    const payload = buildDerivedRecipe(input({ relation: 'remix' }));
    expect(payload.notes).toMatch(/^Na podstawie/);
    expect(payload.notes).toContain('Marysia');
  });

  it('falls back to a safe title when the source has none', () => {
    expect(derivedTitle('copy', '   ')).toBe('Receptura');
    expect(derivedTitle('remix', '')).toBe('Receptura — moja wersja');
  });

  it('bounds the generated title', () => {
    expect(derivedTitle('remix', 'x'.repeat(400)).length).toBeLessThanOrEqual(120);
  });
});

describe('the RPC arguments follow the source, never the other way round', () => {
  it('a Community source names the publication and no share', () => {
    expect(
      derivationRpcArgs(
        { kind: 'publication', publicationId: 'pub-1', handle: 'm', slug: 's' },
        'copy',
        'recipe-new',
      ),
    ).toEqual({
      derivedRecipeId: 'recipe-new',
      relation: 'copy',
      publicationId: 'pub-1',
      shareLinkId: null,
    });
  });

  it('a direct-share source names the share and no publication', () => {
    expect(derivationRpcArgs({ kind: 'share', shareLinkId: 'share-1' }, 'remix', 'recipe-new')).toEqual({
      derivedRecipeId: 'recipe-new',
      relation: 'remix',
      publicationId: null,
      shareLinkId: 'share-1',
    });
  });

  it('never sends a creator, sharer or partner id — those are the server\'s to resolve', () => {
    const args = derivationRpcArgs({ kind: 'share', shareLinkId: 'share-1' }, 'copy', 'r');
    const keys = Object.keys(args).join(',');
    expect(keys).not.toMatch(/creator|partner|owner|shared/i);
  });
});

describe('the plan never writes to the source (§21: „Do not mutate original")', () => {
  it('is exactly read → create → stamp → open', () => {
    expect(DERIVATION_PLAN).toEqual([
      'read_source',
      'create_independent_recipe',
      'stamp_lineage_and_usage',
      'open_in_editor',
    ]);
  });

  it('has no step that could modify the source', () => {
    for (const step of DERIVATION_PLAN) {
      expect(step).not.toMatch(/update_source|write_source|modify/);
    }
  });
});

describe('§21/§50 — a retry is not a second use', () => {
  it('refuses while a derivation is already in flight', () => {
    expect(canDerive({ isEntitled: true, inFlight: true, sourceAvailable: true })).toEqual({
      ok: false,
      reason: 'already_in_flight',
    });
  });

  it('refuses without entitlement and without a source', () => {
    expect(canDerive({ isEntitled: false, inFlight: false, sourceAvailable: true })).toEqual({
      ok: false,
      reason: 'not_entitled',
    });
    expect(canDerive({ isEntitled: true, inFlight: false, sourceAvailable: false })).toEqual({
      ok: false,
      reason: 'source_unavailable',
    });
  });

  it('allows a clean start', () => {
    expect(canDerive({ isEntitled: true, inFlight: false, sourceAvailable: true })).toEqual({
      ok: true,
    });
  });
});

describe('the derived payload is the entitled read, not a demo projection', () => {
  it('carries the real formulation — this path is only reachable when entitled', () => {
    // The opposite of the Demo guarantee: here grams SHOULD be present,
    // because the server already decided the caller may have them.
    expect(findDemoLeaks(buildDerivedRecipe(input()).recipeInput).length).toBeGreaterThan(0);
  });
});
