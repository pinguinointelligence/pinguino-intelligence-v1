/**
 * „Moje receptury" renders the SAVED recipe, not initialization defaults (owner v1.4).
 *
 * The row below is the staging row the owner screenshotted — `QA Protein v2 -12C`
 * (1d14a107-9284-4b04-9e7a-1454c6ec9c53): NULL `product_type`, NULL `serving_profile`,
 * `active_engine_label` still at migration 0001's `'−11°C Engine'` default, one immutable version
 * written at 2026-08-22T23:29:59.494922Z. The screenshot read TYP „—", TRYB „—",
 * SILNIK „−11°C Engine", ZAKTUALIZOWANO 23.08.2026 — while the Wersje tab showed „22.08.2026 · v1".
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { formatVersionDate } from '@/features/pro-core/RecipeVersionsSection';

const SAVED_AT = '2026-08-22T23:29:59.494922+00:00';

const QA_PROTEIN_ROW = {
  id: '1d14a107-9284-4b04-9e7a-1454c6ec9c53',
  user_id: 'u1',
  name: 'QA Protein v2 -12C',
  description: null,
  product_type: null,
  serving_profile: null,
  active_engine_label: '−11°C Engine',
  engine_version: '0.4.0',
  config_version: '0.7.0',
  batch_grams: 1000,
  created_at: SAVED_AT,
  updated_at: SAVED_AT,
  latest_version_number: 1,
  latest_version_at: SAVED_AT,
  recipe_input: {
    items: [],
    mode: 'classic',
    category: 'protein_gelato',
    target_temperature_c: -12,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: { formulation_strategy: 'eco' },
    pinguino_profile_v1: {
      visibleProductType: 'protein',
      mode: 'classic',
      formulationStrategy: 'eco',
      targetBatchGrams: 1000,
      machineKind: 'professional',
      machineId: null,
      machineLabel: 'Profesjonalna',
      servingModeId: 'temp_minus_12',
      targetTemperatureC: -12,
      machineCapacityGrams: null,
      directionTargets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    },
  },
};

vi.mock('@/features/recipes/useSavedRecipes', () => ({
  useSavedRecipes: () => ({ data: [QA_PROTEIN_ROW], isLoading: false }),
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

const html = renderToStaticMarkup(
  <MemoryRouter>
    <MyRecipesPage />
  </MemoryRouter>,
);

describe('Moje receptury — the QA Protein v2 -12C row', () => {
  it('shows the saved product type instead of „—"', () => {
    expect(html).toContain('Protein');
  });

  it('shows the saved ECO/OPTIMAL mode instead of „—"', () => {
    expect(html).toContain('ECO');
  });

  it('shows the SAVED serving temperature, never the −11°C build-time default', () => {
    expect(html).toContain('−12°C');
    expect(html).not.toContain('−11°C Engine');
  });

  it('shows the saved batch', () => {
    expect(html).toContain('1000 g');
  });

  it('dates the row from the immutable version, matching the Wersje tab exactly', () => {
    expect(html).toContain(formatVersionDate(SAVED_AT));
  });

  it('no cell falls back to „—" for a fully saved recipe', () => {
    // The five metadata cells; a „—" anywhere means the library lost the saved state again.
    const cells = html.split('text-sm text-ink').slice(1);
    expect(cells.length).toBeGreaterThanOrEqual(5);
    for (const cell of cells.slice(0, 5)) expect(cell.slice(0, 40)).not.toContain('—</span>');
  });
});
