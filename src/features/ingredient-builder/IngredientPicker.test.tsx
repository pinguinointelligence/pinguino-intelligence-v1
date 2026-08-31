import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EngineIngredient } from '@/engine';
import { copy } from '@/copy/en';
import { IngredientPicker, PickerEmptyState } from './IngredientPicker';
import type { IngredientLibrary } from './ingredientLibrary';
import type { ProductLibraryProvenance } from '@/data/products/productEngineLibrary';

const prod = (id: string, name: string): EngineIngredient =>
  ({ id, name }) as unknown as EngineIngredient;
const provenance = (id: string, p: ProductLibraryProvenance) => new Map([[id, p]]);

const lib = (over: Partial<IngredientLibrary> = {}): IngredientLibrary => ({
  ingredients: [],
  searchIndex: new Map(),
  nameIndex: new Map(),
  formIndex: new Map(),
  source: 'pi_base',
  status: 'ready',
  serverSearch: false,
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
          productProvenance: provenance('PR-ING-000010', {
            reference_linked: true,
            blocked_by_red_flags: false,
            warnings: [],
            status_label: 'PI Generated',
          }),
        })}
        onAdd={() => {}}
      />,
    );
    expect(html).toMatch(/Moje produkty/);
    expect(text(html)).toContain('Nata para montar');
    expect(text(html)).toContain('PR-ING-000010');
    expect(text(html)).toMatch(/Wygenerowane/);
    expect(text(html)).toMatch(/Profil oparty na zatwierdzonym wzorcu/);
    expect(text(html)).toMatch(/parametry technologiczne nie były mierzone niezależnie/);
    expect(html).not.toMatch(/%/); // no internal confidence percentage shown
    expect(html).not.toMatch(/Mapper/i); // never the internal "Mapper" word
  });

  it('shows a pending-verification note for a red-flagged product', () => {
    const html = renderToStaticMarkup(
      <IngredientPicker
        library={lib({
          products: [prod('PR-ING-000031', 'Chocolate 0% azúcares')],
          productProvenance: provenance('PR-ING-000031', {
            reference_linked: true,
            blocked_by_red_flags: true,
            warnings: ['sweetener'],
            status_label: 'PI Generated',
          }),
        })}
        onAdd={() => {}}
      />,
    );
    expect(text(html)).toMatch(/zawiera składniki wymagające weryfikacji/i);
  });

  it('basement ingredients still render in their category group; no products → no My Products group', () => {
    const milk = {
      id: 'PI-ING-1',
      name: 'Whole Milk',
      category: 'dairy',
    } as unknown as EngineIngredient;
    const html = renderToStaticMarkup(
      <IngredientPicker
        library={lib({ ingredients: [milk], searchIndex: new Map([['PI-ING-1', 'whole milk']]) })}
        onAdd={() => {}}
      />,
    );
    expect(text(html)).toContain('Whole Milk');
    expect(html).not.toMatch(/Moje produkty/);
  });
});

/**
 * Honest picker exits — AUDIT #2 dead-end rule (owner decision, Slice C):
 * a no-results search must keep a way back. Repo pattern: no DOM env, so the
 * empty state renders via renderToStaticMarkup and the clear behavior is the
 * wired `onClear` handler (setQuery('') in IngredientPicker).
 */
describe('IngredientPicker — no-results state is not a dead end', () => {
  it('an active query with zero matches offers the honest text AND a Clear search exit', () => {
    const html = renderToStaticMarkup(<PickerEmptyState query="zzz" onClear={() => {}} />);
    expect(text(html)).toContain(copy.studio.builder.noMatches);
    expect(text(html)).toContain(copy.studio.builder.clearSearch);
  });

  it('a genuinely empty library shows the honest text without inventing an exit', () => {
    const html = renderToStaticMarkup(<PickerEmptyState query="" onClear={() => {}} />);
    expect(text(html)).toContain(copy.studio.builder.noMatches);
    expect(text(html)).not.toContain(copy.studio.builder.clearSearch);
  });

  it('the picker mounts the empty state when nothing matches (empty ready library)', () => {
    const html = renderToStaticMarkup(<IngredientPicker library={lib()} onAdd={() => {}} />);
    expect(text(html)).toContain(copy.studio.builder.noMatches);
  });
});

/**
 * Agent 4/5 fixture sweep: when the live PI library errors or is empty, the
 * picker silently serves the bundled demo/reference catalog (`status:
 * 'fallback'`). That state must be VISIBLY pink — never mistakable for the
 * 'ready' live library.
 */
describe('IngredientPicker — fallback demo catalog is visibly non-production', () => {
  it("status 'fallback' renders the pink TESTOWE / NIEPRODUKCYJNE badge with the fallback note", () => {
    const html = renderToStaticMarkup(
      <IngredientPicker library={lib({ status: 'fallback' })} onAdd={() => {}} />,
    );
    expect(html).toContain('data-testid="nonprod-marked-picker-fallback"');
    expect(html).toContain('data-testid="nonprod-badge-pro-demo-library"');
    expect(html).toContain('TESTOWE / NIEPRODUKCYJNE');
    expect(text(html)).toContain(copy.studio.builder.fallbackNote);
  });

  it("status 'ready' (the live library) shows NO pink badge and no fallback note", () => {
    const html = renderToStaticMarkup(<IngredientPicker library={lib()} onAdd={() => {}} />);
    expect(html).not.toContain('nonprod-badge');
    expect(html).not.toContain('TESTOWE / NIEPRODUKCYJNE');
    expect(text(html)).not.toContain(copy.studio.builder.fallbackNote);
  });
});
