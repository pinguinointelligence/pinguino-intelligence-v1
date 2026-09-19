/**
 * Source contracts for `useRecipeDerivation`.
 *
 * Two of these pin defects that already cost a served-QA cycle each, both of which
 * looked like success from the outside.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/features/community/useRecipeDerivation.ts', 'utf8');
const save = readFileSync('src/features/recipes/useCanonicalRecipeSave.ts', 'utf8');

describe('derive() reports its outcome by RETURN VALUE', () => {
  it('returns the terminal DerivationState rather than void', () => {
    // A caller that awaited `derive()` and then read `state` would see the value from
    // its own render — `idle` — and treat a real success as a no-op.
    expect(source).toContain('async (relation: LineageRelation): Promise<DerivationState>');
    expect(source).not.toContain('async (relation: LineageRelation): Promise<void>');
  });

  it('returns on every terminal branch, so no path resolves as undefined', () => {
    const body = source.slice(
      source.indexOf('const derive = useCallback'),
      source.indexOf('return {\n    state,'),
    );
    // A bare `return;` inside derive would resolve the promise with undefined and
    // crash the caller's `outcome.status` read.
    expect(body).not.toMatch(/\n\s+return;\n/);
  });
});

describe('the source is still never written to', () => {
  it('reads through the entitlement-gated RPC and opens a working copy — nothing is saved at open', () => {
    expect(source).toContain('const full = await readSource(target)');
    expect(source).toContain('adoptWorkingCopy({');
    expect(source).not.toContain('createRecipe(');
    expect(source).not.toContain('recordDerivation(');
  });

  it('carries the source ProductBehavior authority into the working copy', () => {
    // Nulling or inventing this is what made every ingredient-bearing recipe
    // undecidable to `assert_recipe_behavior_authority_all_lines_v1`.
    expect(source).toContain('full.productComposition');
  });

  it('stamps lineage when the working copy first becomes the customer recipe', () => {
    expect(save).toContain("source: provenance ? 'imported' : 'manual'");
    expect(save).toContain('await recordDerivation({');
    expect(save.match(/await recordDerivation\(/g) ?? []).toHaveLength(1);
  });
});

describe('opening the result is a seam, not a second derivation', () => {
  it('lets a caller supply the opener and does not navigate when it does', () => {
    expect(source).toContain('readonly openWorkingCopy?: () => void | Promise<void>');
    expect(source).toContain('if (openWorkingCopy) await openWorkingCopy();');
    expect(source).toContain("else if (persona === 'pro') navigate('/pro/recipe');");
  });

  it('exposes exactly one adoption path for every caller', () => {
    expect(source.match(/adoptWorkingCopy\(\{/g) ?? []).toHaveLength(1);
  });
});
