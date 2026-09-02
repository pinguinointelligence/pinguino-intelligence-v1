import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./useLegacyRecipeBehaviorRevalidation.ts', import.meta.url),
  'utf8',
);

describe('legacy saved-recipe working-copy resolution', () => {
  it('resolves the complete legacy line set before one atomic working-copy commit', () => {
    expect(source).toContain('Promise.all(lines.map');
    expect(source).toContain('resolveLegacyRecipeBehaviorForSelection');
    expect(source).toContain('behaviorBindingId: storedSnapshot?.behaviorBindingId');
    expect(source).toContain('productVersionId:');
    expect(source).toContain('productId: storedSnapshot?.productId');
    expect(source).toContain('complete.length !== required.length');
    expect(source).toContain("resolutionState: 'RESOLVED'");
    expect(source).toContain('recipeInputFromFrozenBehavior');
    expect(source).toContain('{ acknowledgeRecalculation: false }');
    expect(source).not.toContain("historical ? 'LEGACY_RECONSTRUCTED'");
  });

  it('keeps the saved version immutable while upgrading only the editable store', () => {
    expect(source).not.toContain('saveNewVersion');
    expect(source).not.toContain('createRecipe');
    expect(source).not.toContain(".from('recipe_versions')");
    expect(source).toContain('Reconstructs missing historical recipe authority in working memory only');
  });
});
