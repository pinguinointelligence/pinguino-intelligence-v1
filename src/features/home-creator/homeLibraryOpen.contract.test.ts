/**
 * Served 2026-09-18 (DESIGN H1, pro@ account, phone): „Receptury” → Classics → a recipe →
 * „Rozpocznij recepturę” on a fresh HOME answered „Bieżąca receptura ma niezapisane zmiany.
 * Potwierdź ich odrzucenie…” with nothing to confirm it — the official door's check expects the
 * library page's own confirmation. HOME now asks itself, and only when a real recipe of the
 * customer's is on screen; otherwise the chosen recipe simply opens.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/pages/home/HomeCreatorPage.tsx', 'utf8');
const door = page.slice(
  page.indexOf('onOpenOfficial={(recipeId) => {'),
  page.indexOf('onCommunityOpened'),
);
const adopt = page.slice(
  page.indexOf('const adoptOfficialRecipe'),
  page.indexOf("// The library's one-shot address"),
);
const ask = page.slice(
  page.indexOf('testId="home-library-replace"'),
  page.indexOf('<RecipeCustomMachineDialog'),
);

describe('HOME „Receptury” opens the chosen recipe (served 2026-09-18)', () => {
  it('a fresh HOME opens it without the library-page check', () => {
    expect(door).toContain('replaceConfirmed: true');
    expect(adopt).toContain('options.keepIdea || options.replaceConfirmed');
  });

  it('a real recipe on screen is replaced only after the customer agrees', () => {
    expect(door).toContain(
      'if (useHomeDraftStore.getState().recipeReady && useRecipeStore.getState().dirty) {',
    );
    expect(door.indexOf('setReplaceAsk(recipeId)')).toBeLessThan(
      door.indexOf('replaceConfirmed: true'),
    );
    expect(ask).toContain('homeCreatorCopy.draft.replaceTitle');
    expect(ask).toContain('homeCreatorCopy.draft.cancel');
    expect(ask).toContain('homeCreatorCopy.draft.startNew');
    expect(ask).toContain('replaceConfirmed: true');
  });
});
