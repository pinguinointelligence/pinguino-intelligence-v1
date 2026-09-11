// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeStore } from '@/stores/recipeStore';

vi.mock('@/features/design-review/useReviewMode', () => ({ useReviewMode: () => false }));
vi.mock('@/features/design-review/useOwnerReviewAccess', () => ({
  useOwnerReviewAccess: () => false,
}));
const runtime = vi.hoisted(() => ({ persona: 'pro' as 'demo' | 'home' | 'pro' }));
vi.mock('@/features/pro-core/useProCorePersona', () => ({
  useProCorePersona: () => runtime.persona,
}));

/** Current FINAL Mapper display names (mapper_basement.csv, sha a6a849a5…). */
const FINAL_NAMES: Record<string, string> = {
  'PI-ING-000236': 'MILK · 3.5% FAT · Chilled',
  'PI-ING-000270': 'SKIMMED MILK POWDER · 0.8% FAT · Dairy · Dry',
  'PI-ING-000494': 'DEXTROSE MONOHYDRATE · Sweetener · Dry',
  'PI-ING-000456': 'INULIN · Fibre · Powder',
  'PI-ING-001579': 'ALKALIZED COCOA POWDER · 11% FAT · Unsweetened',
};
const HISTORICAL_NAMES = [
  'MILK 3.5% · Milk · Chilled',
  'SKIMMED MILK · Milk',
  'DEXTROSE · Sweetener · Dry',
  'INULIN · Specialty',
  'DEFATTED COCOA 12% · Cocoa Powder',
];
const services = vi.hoisted(() => ({
  listIngredientsByIds: vi.fn(),
  getCatalogMarketPreferences: vi.fn(),
  resolveCountryProductsForSlots: vi.fn(),
}));
vi.mock('@/services/ingredients', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/ingredients')>()),
  listIngredientsByIds: services.listIngredientsByIds,
}));
vi.mock('@/services/globalCatalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/globalCatalog')>()),
  getCatalogMarketPreferences: services.getCatalogMarketPreferences,
  resolveCountryProductsForSlots: services.resolveCountryProductsForSlots,
}));

const { RecipesHubPage } = await import('./RecipesHubPage');

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

describe('Recipes hub — official Gellatti library', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    runtime.persona = 'pro';
    useRecipeStore.getState().resetToDemo();
    useConstraintStudioStore.getState().resetDraftSession();
    services.listIngredientsByIds.mockReset().mockImplementation(async (ids: string[]) =>
      ids.map((id) => ({ ingredient_id: id, ingredient_name_display: FINAL_NAMES[id] ?? `CURRENT ${id}` })),
    );
    services.getCatalogMarketPreferences.mockReset().mockResolvedValue({
      primaryMarket: 'PL',
      additionalMarkets: [],
      preferredRetailers: [],
      defaultScope: 'my_markets',
    });
    services.resolveCountryProductsForSlots
      .mockReset()
      .mockImplementation(async ({ mapperIngredientIds }: { mapperIngredientIds: string[] }) =>
        mapperIngredientIds.includes('PI-ING-000236')
          ? [
              {
                mapperIngredientId: 'PI-ING-000236',
                source: 'COUNTRY_PRIMARY_DEFAULT',
                country: 'PL',
                product: {
                  id: 'prod-laciate',
                  mappedIngredientId: 'PI-ING-000236',
                  displayName: 'Mleko płynne Łaciate 3,5%',
                  brand: 'Łaciate',
                },
              },
            ]
          : [],
      );
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const renderAt = async (path: string) => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  <LocationProbe />
                  <RecipesHubPage />
                </>
              }
            />
          </Routes>
        </MemoryRouter>,
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  const location = () => host.querySelector('[data-testid="location"]')?.textContent;
  const all = (selector: string) => Array.from(host.querySelectorAll<HTMLElement>(selector));

  it('orders the strip Gellatti · Moje · Udostępnione · Community · Top 100, with no Inspiracje', async () => {
    await renderAt('/recipes');
    expect(
      all('[data-testid^="recipes-tab-"], [data-testid^="recipes-link-"]').map((entry) =>
        entry.textContent?.trim(),
      ),
    ).toEqual(['Gellatti', 'Moje', 'Udostępnione', 'Community', 'Top 100']);
    expect(host.textContent).not.toContain('Inspiracje');
    expect(host.textContent).not.toContain('Udostępnione mi');
    expect(host.querySelector('#recipes-tab-pinguino')?.getAttribute('aria-selected')).toBe('true');
  });

  it('retires the old Inspiracje address into the Gellatti library', async () => {
    await renderAt('/recipes?tab=inspiration');
    expect(host.querySelector('[data-testid="official-collections"]')).not.toBeNull();
    expect(host.querySelector('#recipes-panel-inspiration')).toBeNull();
    expect(location()).toBe('/recipes');
  });

  it('presents the five official collections in order with the owner hero images', async () => {
    await renderAt('/recipes');
    const cards = all('[data-testid^="official-collection-card-"]');
    expect(cards.map((card) => card.dataset.testid)).toEqual([
      'official-collection-card-classics',
      'official-collection-card-icons',
      'official-collection-card-cocktails_spirits',
      'official-collection-card-lost_legendary',
      'official-collection-card-technical_bases',
    ]);
    expect(cards.map((card) => card.querySelector('img')?.getAttribute('src'))).toEqual([
      '/recipes/official/collections/classics-960.webp',
      '/recipes/official/collections/icons-960.webp',
      '/recipes/official/collections/cocktails_spirits-960.webp',
      '/recipes/official/collections/lost_legendary-960.webp',
      '/recipes/official/collections/technical_bases-960.webp',
    ]);
  });

  it.each([
    ['classics', 77, 'GEL-001', 'GEL-077'],
    ['icons', 25, 'GEL-078', 'GEL-102'],
    ['cocktails_spirits', 48, 'GEL-103', 'GEL-150'],
    ['lost_legendary', 15, 'GEL-151', 'GEL-165'],
    ['technical_bases', 12, 'GEL-166', 'GEL-177'],
  ])('opens %s with %i recipes, each on its own numbered image', async (id, count, first, last) => {
    await renderAt(`/recipes?collection=${id}`);
    const cards = all('[data-testid^="official-recipe-card-"]');
    expect(cards).toHaveLength(count);
    const images = cards.map((card) => card.querySelector('img')?.getAttribute('src'));
    expect(images[0]).toBe(`/recipes/official/${first}-480.webp`);
    expect(images.at(-1)).toBe(`/recipes/official/${last}-480.webp`);
    for (const card of cards) {
      const number = String(card.dataset.recipeNumber).padStart(3, '0');
      expect(card.querySelector('img')?.getAttribute('src')).toBe(
        `/recipes/official/GEL-${number}-480.webp`,
      );
    }
  });

  it('shows recipe #001 with its image, grams, current Mapper names and the market product', async () => {
    await renderAt('/recipes?recipe=classic-dark-chocolate');
    expect(host.querySelector('[data-testid="official-recipe-image"]')?.getAttribute('src')).toBe(
      '/recipes/official/GEL-001-960.webp',
    );
    const lines = all('[data-testid="official-recipe-line"]');
    expect(lines).toHaveLength(9);
    expect(all('[data-testid="official-line-grams"]').map((cell) => cell.textContent)).toEqual([
      '490 g', '80 g', '25 g', '80 g', '65 g', '53 g', '150 g', '55 g', '2 g',
    ]);
    const names = all('[data-testid="official-line-canonical-name"]').map((cell) => cell.textContent);
    for (const current of Object.values(FINAL_NAMES)) expect(names).toContain(current);
    for (const historical of HISTORICAL_NAMES) expect(host.textContent).not.toContain(historical);
    expect(all('[data-testid="official-line-pi"]').map((cell) => cell.textContent)).toContain('PI-ING-000236');
    expect(host.querySelector('[data-testid="official-line-market-product"]')?.textContent).toContain(
      'Łaciate · Mleko płynne Łaciate 3,5%',
    );
    expect(host.querySelector('[data-testid="official-recipe-market-summary"]')?.textContent).toContain('PL');
    expect(host.querySelector<HTMLButtonElement>('[data-testid="official-recipe-use"]')?.disabled).toBe(false);
  });

  it('shows recipe #177 with image 177', async () => {
    await renderAt('/recipes?recipe=tech-vegan-13');
    expect(host.querySelector('[data-testid="official-recipe-image"]')?.getAttribute('src')).toBe(
      '/recipes/official/GEL-177-960.webp',
    );
  });

  it('keeps a BRAK line visible, unresolved and blocking the use (#020)', async () => {
    await renderAt('/recipes?collection=classics');
    const card20 = all('[data-testid^="official-recipe-card-"]').find((card) => card.dataset.recipeNumber === '20')!;
    await act(async () => card20.click());
    const unresolved = all('[data-line-kind="unresolved"]');
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]!.textContent).toContain('Birthday cake pieces');
    expect(unresolved[0]!.textContent).toContain('75 g');
    expect(unresolved[0]!.querySelector('[data-testid="official-line-pi"]')).toBeNull();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="official-recipe-use"]')?.disabled).toBe(true);
    const state = host.querySelector<HTMLElement>('[data-testid="official-recipe-use-state"]')!;
    expect(state.dataset.useState).toBe('unresolved_identity');
    expect(state.textContent).toContain('Birthday cake pieces');
  });

  it('keeps the Sorbet scaffold Main dynamic (#169)', async () => {
    await renderAt('/recipes?recipe=tech-sorbet-11');
    expect(all('[data-line-kind="dynamic_main"]')).toHaveLength(1);
    expect(host.querySelector('[data-testid="official-line-unresolved"]')).toBeNull();
    expect(host.querySelector<HTMLElement>('[data-testid="official-recipe-use-state"]')?.dataset.useState).toBe(
      'dynamic_main_required',
    );
    expect(host.querySelector<HTMLButtonElement>('[data-testid="official-recipe-use"]')?.disabled).toBe(true);
  });

  it('hides every gram from Demo and does not query product data', async () => {
    runtime.persona = 'demo';
    await renderAt('/recipes?recipe=classic-dark-chocolate');
    expect(host.querySelector('[data-testid="official-line-grams"]')).toBeNull();
    expect(host.textContent).not.toContain('490 g');
    expect(host.querySelector('[data-testid="official-recipe-use"]')).toBeNull();
    expect(services.listIngredientsByIds).not.toHaveBeenCalled();
    expect(services.resolveCountryProductsForSlots).not.toHaveBeenCalled();
  });

  it('shows Home the exact grams without the Pro working-copy action', async () => {
    runtime.persona = 'home';
    await renderAt('/recipes?recipe=classic-dark-chocolate');
    expect(all('[data-testid="official-line-grams"]')).toHaveLength(9);
    expect(host.querySelector('[data-testid="official-recipe-use"]')).toBeNull();
  });

  it('opens a Pro working copy through the one-shot handoff URL', async () => {
    await renderAt('/recipes?recipe=classic-dark-chocolate');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="official-recipe-use"]')!.click());
    const params = new URLSearchParams(location()!.split('?')[1]);
    expect(location()!.startsWith('/pro/recipe?')).toBe(true);
    expect(params.get('source')).toBe('official_recipe');
    expect(params.get('officialRecipe')).toBe('classic-dark-chocolate');
  });
});
