import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { calculateRecipe } from '@/engine';
import { SurfaceToneContext } from '@/components/ui/surface';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  CompositionMassSummary,
  IngredientBuilder,
} from '@/features/ingredient-builder/IngredientBuilder';
import { ProductPickerPopover } from '@/features/ingredient-builder/ProductPickerPopover';
import { productPickerUnavailableReason } from '@/features/ingredient-builder/productPickerModel';
import type { IngredientLibrary } from '@/features/ingredient-builder/ingredientLibrary';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

const library: IngredientLibrary = {
  ingredients: [],
  searchIndex: new Map(),
  nameIndex: new Map(),
  formIndex: new Map(),
  source: 'pi_base',
  status: 'ready',
  serverSearch: false,
  products: [],
  productProvenance: new Map(),
};

describe('Base/Topping owner entry points', () => {
  beforeEach(() => {
    useRecipeStore.getState().loadRecipeInput(starterMilkBase());
  });

  it('uses one premium picker component with two explicit process scopes', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const base = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ProductPickerPopover library={library} scope="BASE_FORMULATION" onAdd={() => {}} />
      </QueryClientProvider>,
    );
    const topping = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ProductPickerPopover library={library} scope="POST_PROCESS_ADDON" onAdd={() => {}} />
      </QueryClientProvider>,
    );
    expect(base).toContain('data-picker-scope="BASE_FORMULATION"');
    expect(base).toContain('Dodaj składnik');
    expect(topping).toContain('data-picker-scope="POST_PROCESS_ADDON"');
    expect(topping).toContain('Dodaj topping');
    for (const html of [base, topping]) {
      expect(html).toContain('aria-haspopup="dialog"');
      expect(html).toContain('aria-expanded="false"');
    }
    const together = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ProductPickerPopover library={library} scope="BASE_FORMULATION" onAdd={() => {}} />
        <ProductPickerPopover library={library} scope="POST_PROCESS_ADDON" onAdd={() => {}} />
      </QueryClientProvider>,
    );
    const controls = [...together.matchAll(/aria-controls="([^"]+)"/g)].map((match) => match[1]);
    expect(controls).toHaveLength(2);
    expect(new Set(controls).size).toBe(2);
  });

  it('renders Base first, toppings below it, and three unambiguous masses', () => {
    const input = starterMilkBase();
    const calculated = calculateRecipe(input);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <SurfaceToneContext.Provider value="paper">
          <IngredientBuilder
            items={calculated.items}
            totalBatchG={calculated.total_batch_g}
            targetBatchG={input.target_batch_grams}
            demo
            layout="workbench"
            recipeActionDock={<div data-testid="test-recipe-action-dock">Dock</div>}
          />
        </SurfaceToneContext.Provider>
      </QueryClientProvider>,
    );
    const baseIndex = html.indexOf('data-testid="base-mass-total"');
    const actionsIndex = html.indexOf('data-testid="ingredient-action-toolbar"');
    const toppingIndex = html.indexOf('id="topping-section-heading"');
    const finalIndex = html.indexOf('data-testid="composition-mass-summary"');
    expect(baseIndex).toBeGreaterThan(-1);
    expect(actionsIndex).toBeGreaterThan(baseIndex);
    expect(toppingIndex).toBeGreaterThan(actionsIndex);
    expect(finalIndex).toBeGreaterThan(toppingIndex);
    expect(html.match(/Toppingi po produkcji/g)).toHaveLength(1);
    expect(html).toContain('data-testid="topping-mass-total"');
    const totals = renderToStaticMarkup(
      <CompositionMassSummary baseMassG={1000} toppingMassG={130} />,
    );
    expect(totals).not.toContain('Toppingi');
    expect(totals).toContain('Produkt finalny');
    expect(totals).toContain('1130');
  });

  it('keeps Base roles limited to Main/Standard and isolates topping actions', () => {
    const row = read('features', 'ingredient-builder', 'IngredientRow.tsx');
    const topping = read('features', 'ingredient-builder', 'ToppingRow.tsx');
    expect(row).toContain("setRole('main')");
    expect(row).toContain("setRole('standard')");
    expect(row).not.toContain("setRole('addition')");
    expect(topping).not.toContain('setMainIngredient');
    expect(topping).toContain('Usuń topping');
    expect(topping).toContain('Przesuń wyżej');
    expect(topping).toContain('Przesuń niżej');
    const builder = read('features', 'ingredient-builder', 'IngredientBuilder.tsx');
    expect(builder).toContain('Pozycja ${Math.max(position, 1)} z ${orderedIds.length}');
    expect(builder).toContain('Pozycja ${Math.max(position, 1)} z ${ordered.length}');
  });

  it('routes completed Summary facts through the one LabelWorkspace authority', () => {
    const summary = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    const labels = read('features', 'master-label', 'LabelWorkspace.tsx');
    expect(summary).toContain('<LabelWorkspace snapshot={completed} />');
    expect(summary).not.toContain('summary-final-nutrition-cost');
    expect(labels).toContain('title="Baza techniczna"');
    expect(labels).toContain('data-testid="label-internal-overview"');
    expect(labels).toContain('snapshot.finalResult.percentages');
    const monitor = read('features', 'pro-workbench', 'MonitorPanelContent.tsx');
    const production = read('features', 'production-workspace', 'ProductionCockpit.tsx');
    expect(monitor).toContain('<CatalogVerificationBadge');
    expect(production).toContain('production-completed-catalog-provenance');
    expect(production).toContain('<CatalogVerificationBadge');
  });

  it('explains unavailable products for the selected scope and keeps the reason focusable', () => {
    const hit: CatalogProductSearchHit = {
      id: 'catalog-ml',
      entityKind: 'commercial_product',
      status: 'manual_unverified',
      displayName: 'Sos',
      originalName: null,
      originalLanguage: null,
      brand: 'Marka',
      canonicalFamily: null,
      category: null,
      mappedIngredientId: null,
      markets: ['PL'],
      retailers: [],
      eans: [],
      aliases: [],
      favorite: false,
      recentlyUsedAt: null,
      usableInBase: false,
      usableAsTopping: false,
      missingFields: [],
      invalidFields: ['nutrition_basis_per_100ml_requires_density_for_gram_topping'],
      verificationMethod: 'manual_unverified',
      publicData: {},
    };
    expect(productPickerUnavailableReason('BASE_FORMULATION', hit)).toContain(
      'pole currentVersionId',
    );
    expect(productPickerUnavailableReason('BASE_FORMULATION', hit)).toContain('ID catalog-ml');
    expect(productPickerUnavailableReason('POST_PROCESS_ADDON', hit)).toContain('100 ml');
    expect(productPickerUnavailableReason('POST_PROCESS_ADDON', hit)).toContain('gęstość');
    const picker = read('features', 'ingredient-builder', 'ProductPickerPopover.tsx');
    expect(picker).toContain('aria-disabled={!option.selectable}');
    expect(picker).not.toMatch(/data-option-index=\{index\}\s+disabled=/);
    expect(picker).toContain('data-testid="product-picker-unavailable-reason"');
    expect(picker).toContain('option.verification.status');
    expect(picker).toMatch(
      /option\.selectable\s*\?\s*'Dostępny w wybranym zakresie'\s*:\s*'Wymaga uzupełnienia'/,
    );
    expect(picker).toMatch(
      /data-picker-data-confidence=\{\s*option\.confidencePercent \?\? undefined\s*\}/,
    );
    expect(picker).not.toContain("'RED, wymaga uzupełnienia'");
    expect(picker).toMatch(/!option\.selectable\s*\?\s*'bg-red-100 text-red-700'/);
  });
});
