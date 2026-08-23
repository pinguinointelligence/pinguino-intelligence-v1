/**
 * RecipeVersionsSection (Wersje tab) — S2 UX: per-recipe history, no global recipe list.
 *
 * The version label formatter yields `DD.MM.YYYY`; with no recipe open the section shows a hint
 * to open one (never a global „name · vN" list). Version rows are scoped to the opened recipe.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy/en';
import { formatSavedRecipeDate } from '@/features/recipes/savedRecipeDate';

vi.mock('@/features/pro-core/useProCorePersona', () => ({ useProCorePersona: () => 'pro' }));
vi.mock('@/features/pro-core/proCoreRecipeRepo', () => ({
  resolveRecipesRepository: () => ({ repository: {}, unavailable: false, isLocalDev: false, mode: 'supabase' }),
}));

const { RecipeVersionsSection, formatVersionDate } = await import('./RecipeVersionsSection');
const c = copy.proCore;

describe('RecipeVersionsSection — per-recipe version history (S2)', () => {
  it('formats version labels as DD.MM.YYYY', () => {
    expect(formatVersionDate('2026-07-21T10:00:00.000Z')).toBe('21.07.2026');
    expect(formatVersionDate('2026-07-21T10:00:00.000Z')).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });

  /**
   * v1.4: this used to assert the UTC calendar day (`'2026-07-22T23:59:00.000Z'` → „22.07.2026"),
   * which is precisely the defect the owner reported — „Moje receptury" formatted the same instant
   * in the viewer's LOCAL day, so one save at 2026-08-22T23:29:59Z read as ZAKTUALIZOWANO 23.08.2026
   * next to „22.08.2026 · v1" and looked like a save that produced no version. The label is now the
   * viewer's calendar day on both surfaces; agreement is the property worth pinning, not UTC.
   */
  it('uses the SAME calendar as the recipe library for a late-evening save', () => {
    const lateEvening = '2026-08-22T23:29:59.494922+00:00';
    expect(formatVersionDate(lateEvening)).toBe(formatSavedRecipeDate(lateEvening));
  });

  it('with no recipe open, shows the "open a recipe" hint — NOT a global recipe list', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <RecipeVersionsSection />
      </QueryClientProvider>,
    );
    expect(html).toContain('data-testid="pro-core-versions"'); // the section still exists in Wersje
    expect(html).toContain(c.openToSeeVersions);
    // no global list of recipes (the duplicate that was removed from Moje receptury)
    expect(html).not.toContain('data-testid="pro-core-recipe-row"');
    expect(html).not.toContain(c.recipesHeading); // 'Receptury' heading is gone
  });
});
