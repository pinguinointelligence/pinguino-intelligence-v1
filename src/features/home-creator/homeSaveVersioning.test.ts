/**
 * HOME saves into the SAME aggregate it created, and never a second one.
 *
 * A HOME customer who saves, changes a gram and saves again must get version 2 of their
 * recipe — not a second recipe with the same name. That behaviour is not HOME's to
 * implement: it belongs to `useCanonicalRecipeSave`, which creates the aggregate on the
 * first save and appends an immutable version on every later one. All HOME has to do is
 * ask the right one of the two, and stay linked in between.
 *
 * These are source contracts because the alternative — a real round-trip — needs an
 * authenticated session against the shared staging database. They pin the WIRING, which
 * is where this can silently regress; they do not stand in for the served proof.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HOME_PAGE = readFileSync('src/pages/home/HomeCreatorPage.tsx', 'utf8');
const SAVE_HOOK = readFileSync('src/features/recipes/useCanonicalRecipeSave.ts', 'utf8');

describe('HOME persists through the one canonical handler', () => {
  it('uses the canonical hook and defines no save of its own', () => {
    expect(HOME_PAGE).toContain('useCanonicalRecipeSave');
    // A second persistence path is the failure this whole architecture exists to prevent.
    expect(HOME_PAGE).not.toContain('createRecipe(');
    expect(HOME_PAGE).not.toContain('saveNewVersion(');
  });

  it('appends a version once an aggregate exists, and creates one only before that', () => {
    const branch = HOME_PAGE.replace(/\s+/g, ' ');
    expect(branch).toContain(
      'recipe.savedRecipeId ? recipeSave.saveVersion() : recipeSave.createNew(name.trim())',
    );
  });

  it('stays linked to the aggregate it created, unlike the older /start shell', () => {
    // `/start` owns its own engine result and passes `linkStoreDraft: false` so it cannot
    // hijack a Pro draft. HOME is the opposite case by design: it DRIVES the recipe store,
    // so it must keep the default link — without it every save would make a new recipe.
    expect(HOME_PAGE).not.toContain('linkStoreDraft');
    expect(SAVE_HOOK).toContain('const linkStoreDraft = options.linkStoreDraft ?? true;');
  });

  it('only the linked path writes the aggregate id back into the store', () => {
    // This is what makes the SECOND save a version: `markSaved` is what sets
    // `savedRecipeId`, and it is reached only when the draft is linked.
    // Both names appear in the INTERFACE above the implementation, so the anchor must be
    // the implementation's own signature and the end searched FORWARD from it — otherwise
    // the slice runs backwards and silently matches nothing.
    const createStart = SAVE_HOOK.indexOf('createNew: (title, note) =>');
    const create = SAVE_HOOK.slice(createStart, SAVE_HOOK.indexOf('saveVersion:', createStart));
    expect(create.length).toBeGreaterThan(200);
    expect(create).toContain('if (linkStoreDraft)');
    expect(create).toContain('markSaved(');
  });
});
