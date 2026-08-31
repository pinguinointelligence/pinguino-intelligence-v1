/**
 * Served QA 2026-08-31 — a Community recipe the customer ADOPTED was silently
 * replaced by one HOME generated itself.
 *
 * Why it was nearly invisible: the publication was itself built from the canonical
 * milk-base starter, so a regenerated recipe has the SAME six ingredients and the SAME
 * `milk-base:*` line ids. Only the grams differed (MILK 670 g -> 672 g, TARA GUM
 * 5 g -> 3 g) and `savedRecipeId` was null. Identity-based assertions cannot catch
 * this, so these are source contracts on the two rules that prevent it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/pages/home/HomeCreatorPage.tsx', 'utf8');

const generateEffect = (): string => {
  const start = page.indexOf('const lastGeneratedFor = useRef');
  const end = page.indexOf('generateRecipe();', start);
  expect(start, 'generate effect not found').toBeGreaterThan(-1);
  expect(end, 'generateRecipe() call not found').toBeGreaterThan(start);
  return page.slice(start, end);
};

describe('HOME never generates a recipe behind an unanswered question', () => {
  it('holds generation while the match popup is open', () => {
    expect(generateEffect()).toContain('!matchPopupOpen');
  });

  it('re-runs the effect when the popup opens or closes', () => {
    // Without this in the dependency list the guard would be read from a stale render
    // and the hold would not actually take effect.
    const deps = page.slice(
      page.indexOf('generateRecipe();'),
      page.indexOf('generateRecipe();') + 400,
    );
    expect(deps).toContain('matchPopupOpen');
  });

  it('derives the popup-open condition from the same state that renders the popup', () => {
    expect(page).toContain('const matchPopupOpen = matchPopup !== null && !matchDismissed;');
    expect(page).toContain('{matchPopupOpen ? (');
  });
});

describe('an adopted recipe is not regenerated over', () => {
  it('claims the generate key when a derivation opens a recipe', () => {
    const onDerived = page.slice(
      page.indexOf('onDerived={() => {'),
      page.indexOf('onDerived={() => {') + 900,
    );
    expect(onDerived).toContain('lastGeneratedFor.current =');
    expect(onDerived).toContain('markRecipeReady(true)');
    // It must claim the key, never call the generator.
    expect(onDerived).not.toContain('generateRecipe(');
  });
});
