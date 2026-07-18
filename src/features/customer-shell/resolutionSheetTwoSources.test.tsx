/**
 * Ingredient-resolution picker sheet (static render, no DOM). Owner 2026-07-18:
 *  • primary source is „Składniki PI" (live Mapper search) — for demo/anon the ONLY
 *    source, rendered with NO empty second tab (no shared 66-product sample anymore);
 *  • „Moje produkty" (private) is an OPTIONAL second tab, shown only when the controller
 *    offers more than one source (authenticated + flag on) — never backed by a sample;
 *  • live pane: dense rows (name / internal / category / PI-ING id / readiness),
 *    „załaduj więcej", honest loading/empty/error/unavailable states;
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
  INITIAL_LIVE_SEARCH,
  type LiveSearchState,
  type PickerSourceId,
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
  const sources: readonly PickerSourceId[] = ['pi_ingredients'];
  return {
    summary: { allResolved: false, unresolvedCount: 1, unresolvedNames: ['Czekolada'] },
    activeLineId: 'l1',
    activeLine: line,
    view: 'picker',
    actions: [],
    forms: INGREDIENT_FORMS,
    query: '',
    sources,
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

describe('picker sources', () => {
  it('renders a SINGLE „Składniki PI" source by default — no second tab, no shared sample', () => {
    const html = render({});
    // With ONE source there is no tab chrome at all (no tablist, no tab labels),
    // and the removed public „Produkty" sample tab / „Moje produkty" tab are absent.
    expect(html).not.toContain('role="tab"');
    expect(html).not.toContain(R.sources.my_products);
    expect(html).not.toContain('Produkty');
    // The live Mapper search („Składniki PI") is the pane shown directly.
    expect(html).toContain(R.ingredientsSearchLabel);
    expect(html).toContain(R.ingredientsSourceNote);
  });

  it('offers „Moje produkty" as an optional second tab when the controller exposes it', () => {
    const html = render({ sources: ['pi_ingredients', 'my_products'] });
    expect(html).toContain(R.sources.pi_ingredients);
    expect(html).toContain(R.sources.my_products);
    expect(html).toContain('role="tab"');
    const piTab = html.slice(html.indexOf('role="tab"'), html.indexOf(R.sources.pi_ingredients!));
    expect(piTab).toContain('aria-selected="true"');
  });

  it('the „Moje produkty" pane shows an honest empty state, never a shared sample', () => {
    const html = render({ sources: ['pi_ingredients', 'my_products'], sourceTab: 'my_products' });
    expect(html).toContain(R.myProductsEmpty);
    // No live-search UI on the private pane.
    expect(html).not.toContain(R.ingredientsSearchLabel);
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
