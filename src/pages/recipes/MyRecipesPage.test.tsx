/**
 * Moje receptury (/my-recipes) — S2 duplicate-version-UI removal + Polish localization.
 *
 * Proves: ONE list of recipe aggregates (each row once), NO duplicate global „RECIPE VERSIONS"
 * section, no „name · v1" repetition, Otwórz/Usuń present, and Polish column labels. The list
 * hooks + auth are mocked (the page is otherwise store/query-driven).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy/en';

const ROWS = [
  { id: 'r1', user_id: 'u1', name: 'Pistacja Premium', description: 'moja notatka', recipe_input: {}, product_type: 'gelato', serving_profile: 'storage-minus-11', active_engine_label: '−11°C Engine', engine_version: '0.4.0', config_version: '0.7.0', batch_grams: 1000, created_at: '2026-07-21T10:00:00.000Z', updated_at: '2026-07-22T10:00:00.000Z' },
  { id: 'r2', user_id: 'u1', name: 'Baza mleczna', description: null, recipe_input: {}, product_type: 'gelato', serving_profile: 'storage-minus-11', active_engine_label: '−11°C Engine', engine_version: '0.4.0', config_version: '0.7.0', batch_grams: 1500, created_at: '2026-07-20T10:00:00.000Z', updated_at: '2026-07-21T10:00:00.000Z' },
];

vi.mock('@/features/recipes/useSavedRecipes', () => ({
  useSavedRecipes: () => ({ data: ROWS, isLoading: false }),
  useDeleteRecipe: () => ({ mutate: () => {} }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ available: true, status: 'authed', user: { id: 'u1' }, signOut: () => {} }),
}));
vi.mock('@/features/auth/authModalStore', () => ({
  useAuthModalStore: (sel: (s: unknown) => unknown) => sel({ open: () => {} }),
}));

const { MyRecipesPage } = await import('./MyRecipesPage');
const r = copy.recipes;
const count = (s: string, sub: string) => s.split(sub).length - 1;

describe('MyRecipesPage — S2 duplicate version UI removed + Polish', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <MyRecipesPage />
    </MemoryRouter>,
  );

  it('renders exactly ONE list — each recipe aggregate appears once', () => {
    expect(count(html, 'Pistacja Premium')).toBe(1);
    expect(count(html, 'Baza mleczna')).toBe(1);
  });

  it('does NOT render the duplicate global version-history section', () => {
    expect(html).not.toContain('data-testid="pro-core-versions"');
    expect(html).not.toContain('RECIPE VERSIONS');
    expect(html.toUpperCase()).not.toContain('VERSION HISTORY');
  });

  it('does not repeat every recipe with a "· v1" suffix', () => {
    expect(html).not.toContain('· v1');
    expect(html).not.toContain('Pistacja Premium · v');
  });

  it('shows the Polish page copy (title, columns, Otwórz/Usuń) — no English', () => {
    expect(html).toContain(r.title); // 'Moje receptury'
    expect(html).toContain(r.open); // 'Otwórz'
    expect(html).toContain(r.delete); // 'Usuń'
    for (const label of [r.columns.product, r.columns.serving, r.columns.engine, r.columns.batch, r.columns.updated]) {
      expect(html).toContain(label); // Typ / Tryb / Silnik / Ilość / Zaktualizowano
    }
    expect(html).not.toMatch(/>Open<|>Delete<|MY RECIPES/);
  });
});
