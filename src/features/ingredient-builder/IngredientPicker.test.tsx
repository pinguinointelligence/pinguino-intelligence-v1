import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EngineIngredient } from '@/engine';
import { IngredientPicker } from './IngredientPicker';
import type { IngredientLibrary } from './ingredientLibrary';
import type { ProductLibraryProvenance } from '@/data/products/productEngineLibrary';

const prod = (id: string, name: string): EngineIngredient => ({ id, name } as unknown as EngineIngredient);
const provenance = (id: string, p: ProductLibraryProvenance) => new Map([[id, p]]);

const lib = (over: Partial<IngredientLibrary> = {}): IngredientLibrary => ({
  ingredients: [],
  searchIndex: new Map(),
  source: 'pi_base',
  status: 'ready',
  products: [],
  productProvenance: new Map(),
  ...over,
});

const text = (h: string) => h.replace(/<[^>]*>/g, ' ');

describe('IngredientPicker — My Products', () => {
  it('renders a My Products optgroup with the product + a reference-linked provenance note', () => {
    const html = renderToStaticMarkup(
      <IngredientPicker
        library={lib({
          products: [prod('PR-ING-000010', 'Nata para montar')],
          productProvenance: provenance('PR-ING-000010', { reference_linked: true, blocked_by_red_flags: false, warnings: [] }),
        })}
        onAdd={() => {}}
      />,
    );
    expect(html).toMatch(/My Products/);
    expect(text(html)).toContain('Nata para montar');
    expect(text(html)).toContain('PR-ING-000010');
    expect(text(html)).toMatch(/Reference-linked profile/);
    expect(text(html)).toMatch(/not independently measured/);
    expect(html).not.toMatch(/%/); // no internal confidence percentage shown
  });

  it('shows a pending-verification note for a red-flagged product', () => {
    const html = renderToStaticMarkup(
      <IngredientPicker
        library={lib({
          products: [prod('PR-ING-000031', 'Chocolate 0% azúcares')],
          productProvenance: provenance('PR-ING-000031', { reference_linked: true, blocked_by_red_flags: true, warnings: ['sweetener'] }),
        })}
        onAdd={() => {}}
      />,
    );
    expect(text(html)).toMatch(/pending verification/i);
  });

  it('basement ingredients still render in their category group; no products → no My Products group', () => {
    const milk = { id: 'PI-ING-1', name: 'Whole Milk', category: 'dairy' } as unknown as EngineIngredient;
    const html = renderToStaticMarkup(
      <IngredientPicker library={lib({ ingredients: [milk], searchIndex: new Map([['PI-ING-1', 'whole milk']]) })} onAdd={() => {}} />,
    );
    expect(text(html)).toContain('Whole Milk');
    expect(html).not.toMatch(/My Products/);
  });
});
