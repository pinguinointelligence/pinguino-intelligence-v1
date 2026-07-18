/**
 * Track F — the two-source picker sheet (static render, no DOM):
 *  • compact segmented tabs: Składniki PI (default) + Produkty;
 *  • live pane: dense rows (name / internal / category / PI-ING id / readiness),
 *    „załaduj więcej", honest loading/empty/error/unavailable states;
 *  • products pane keeps the honest bundled-sample note (never „pełny katalog");
 *  • post-selection login-required note for anonymous sessions.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  createResolutionState,
  INGREDIENT_FORMS,
  openSheet,
  resolutionForLine,
} from '@/features/ingredient-resolution';
import {
  BUNDLED_CATALOGUE_SOURCE,
  INITIAL_LIVE_SEARCH,
  searchPickerCatalogue,
  BUNDLED_CATALOGUE_ENTRIES,
  type LiveSearchState,
  type SafeIngredientHit,
} from '@/features/product-picker';
import { ResolutionSheet } from './ResolutionSheet';
import { customerShellCopy as copy } from './customerShellCopy';
import type { IngredientResolutionController } from './useIngredientResolution';

const R = copy.resolution;

const hit = (over: Partial<SafeIngredientHit> = {}): SafeIngredientHit => ({
  ingredientId: 'PI-ING-000123',
  displayName: 'Czekolada gorzka 70%',
  internalName: 'dark_chocolate_70',
  category: 'chocolate_cocoa',
  subcategory: 'dark',
  engineApproved: true,
  ...over,
});

function controller(over: Partial<IngredientResolutionController>): IngredientResolutionController {
  const state = openSheet(
    createResolutionState({
      workingRecipeId: 'wr-1',
      lines: [{ lineId: 'l1', ingredientName: 'Czekolada', requirementKind: 'needs_ingredient' }],
    }),
    'l1',
  );
  const line = resolutionForLine(state, 'l1')!;
  const noop = () => undefined;
  return {
    summary: { allResolved: false, unresolvedCount: 1, unresolvedNames: ['Czekolada'] },
    source: BUNDLED_CATALOGUE_SOURCE,
    catalogueAvailable: true,
    activeLineId: 'l1',
    activeLine: line,
    view: 'picker',
    actions: [],
    forms: INGREDIENT_FORMS,
    query: '',
    results: [],
    sourceTab: 'pi_ingredients',
    setSourceTab: noop,
    liveSearch: INITIAL_LIVE_SEARCH,
    loadMore: noop,
    retryLiveSearch: noop,
    pickIngredient: noop,
    ingredientPick: 'idle',
    substituteName: '',
    whyOpen: false,
    open: noop,
    close: noop,
    chooseForm: noop,
    runAction: noop,
    setQuery: noop,
    pick: noop,
    setSubstituteName: noop,
    confirmSubstitute: noop,
    toggleWhy: noop,
    lineFor: () => line,
    pickedName: () => null,
    reset: noop,
    ...over,
  };
}

const render = (over: Partial<IngredientResolutionController>) =>
  renderToStaticMarkup(<ResolutionSheet controller={controller(over)} />);

const ready = (hits: SafeIngredientHit[], hasMore = false): LiveSearchState => ({
  ...INITIAL_LIVE_SEARCH,
  phase: 'ready',
  query: 'czekolada',
  hits,
  hasMore,
});

describe('two-source tabs', () => {
  it('renders both sources with Składniki PI selected by default', () => {
    const html = render({});
    expect(html).toContain(R.sources.pi_ingredients);
    expect(html).toContain(R.sources.products);
    const ingredientsTab = html.slice(html.indexOf('role="tab"'), html.indexOf(R.sources.pi_ingredients!));
    expect(ingredientsTab).toContain('aria-selected="true"');
  });

  it('the Produkty tab keeps the honest SAMPLE note (never a full-catalogue claim)', () => {
    const html = render({ sourceTab: 'products' });
    expect(html).toContain(BUNDLED_CATALOGUE_SOURCE.note);
    expect(BUNDLED_CATALOGUE_SOURCE.note).toContain('Próbka');
    expect(html).toContain(R.searchLabel);
  });
});

describe('live pane — compact rows', () => {
  it('a dense row carries name, internal name, category, the stable PI-ING id and readiness', () => {
    const html = render({ liveSearch: ready([hit()]) });
    expect(html).toContain('Czekolada gorzka 70%');
    expect(html).toContain('dark_chocolate_70');
    expect(html).toContain('chocolate_cocoa · dark');
    expect(html).toContain('PI-ING-000123');
    expect(html).toContain(R.ingredientEngineApproved);
    expect(html).toContain('min-h-[44px]'); // ≥44px touch target
  });

  it('offers „załaduj więcej" only when more pages exist', () => {
    expect(render({ liveSearch: ready([hit()], true) })).toContain(R.liveLoadMore);
    expect(render({ liveSearch: ready([hit()], false) })).not.toContain(R.liveLoadMore);
  });
});

describe('live pane — honest states', () => {
  it('empty names the query and never shows the unavailable note', () => {
    const html = render({ liveSearch: { ...INITIAL_LIVE_SEARCH, phase: 'empty', query: 'xyzzy' } });
    expect(html).toContain(`${R.liveEmptyPrefix} „xyzzy”.`);
    expect(html).not.toContain(R.liveUnavailable);
  });

  it('unavailable says the live catalogue is not ready — it never pretends zero results', () => {
    const html = render({
      liveSearch: { ...INITIAL_LIVE_SEARCH, phase: 'unavailable', unavailableReason: 'view_missing' },
    });
    expect(html).toContain(R.liveUnavailable);
    expect(html).not.toContain(R.liveEmptyPrefix);
  });

  it('error offers a retry', () => {
    const html = render({ liveSearch: { ...INITIAL_LIVE_SEARCH, phase: 'error', query: 'czek' } });
    expect(html).toContain(R.liveError);
    expect(html).toContain(R.liveRetry);
  });

  it('an anonymous pick shows the honest login-required note (readiness never faked)', () => {
    const html = render({ liveSearch: ready([hit()]), ingredientPick: 'login_required' });
    expect(html).toContain(R.pickLoginRequired);
    expect(R.pickLoginRequired).toContain('zalogowania');
  });
});

describe('products pane still resolves through the bundled sample', () => {
  it('renders compact product rows from the real bundled catalogue', () => {
    const results = searchPickerCatalogue({ text: 'pistacho', category: null }, BUNDLED_CATALOGUE_ENTRIES);
    expect(results.length).toBeGreaterThan(0);
    const html = render({ sourceTab: 'products', results });
    expect(html).toContain(results[0]!.entry.displayName);
    expect(html).toContain('min-h-[44px]');
  });
});
