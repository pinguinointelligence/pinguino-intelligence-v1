import { describe, expect, it } from 'vitest';
import { FLAVOR_CATALOGUE } from './flavorCatalogue';
import {
  flavorInspirationStartIntent,
  inspirationStartHref,
  parseInspirationStartIntent,
} from './inspirationHandoff';

describe('inspiration → current workbench handoff', () => {
  const entry = FLAVOR_CATALOGUE[0]!;

  it('carries flavour intent and canonical product family without final grams', () => {
    const intent = flavorInspirationStartIntent(entry);
    const serialized = JSON.stringify(intent);
    expect(intent.definingIngredients).toEqual(entry.mainIngredients.slice(0, 4));
    expect(intent.canonicalIngredientIds).toEqual([]);
    expect(['gelato', 'sorbet', 'vegan', 'protein']).toContain(intent.productType);
    expect(serialized).not.toMatch(/gram|dose|planned_grams|actual_grams/i);
  });

  it('opens the existing /start recipe flow and round-trips the intent', () => {
    const intent = flavorInspirationStartIntent(entry);
    const href = inspirationStartHref(intent);
    expect(href.startsWith('/start?')).toBe(true);
    const parsed = parseInspirationStartIntent(new URLSearchParams(href.split('?')[1]));
    expect(parsed).toMatchObject({
      source: 'flavor_inspiration',
      sourceId: entry.flavorCode,
      productType: entry.visibleProductType,
      prompt: intent.prompt,
    });
  });

  it('routes an authenticated Pro executable mapping directly to the canonical Pro workbench', () => {
    const intent = flavorInspirationStartIntent(entry);
    const href = inspirationStartHref(intent, {
      persona: 'pro',
      executableTemplateId: 'fantasy-rocero-v1',
      returnTo: '/recipes?tab=inspiration',
    });
    expect(href.startsWith('/pro/recipe?')).toBe(true);
    expect(href).not.toMatch(/^\/(home|start)(?:\?|$)/);
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('libraryTemplate')).toBe('fantasy-rocero-v1');
    expect(params.get('returnTo')).toBe('/recipes?tab=inspiration');
  });

  it('does not change the accepted non-Pro destination', () => {
    const intent = flavorInspirationStartIntent(entry);
    expect(inspirationStartHref(intent, { persona: 'home' })).toBe(inspirationStartHref(intent));
    expect(inspirationStartHref(intent, { persona: 'demo' })).toBe(inspirationStartHref(intent));
    expect(inspirationStartHref(intent, {
      persona: 'home',
      executableTemplateId: 'fantasy-rocero-v1',
      returnTo: '/recipes?tab=inspiration',
    })).toBe(inspirationStartHref(intent));
  });

  it('rejects malformed or foreign query strings', () => {
    expect(parseInspirationStartIntent(new URLSearchParams('source=other&idea=x'))).toBeNull();
    expect(
      parseInspirationStartIntent(
        new URLSearchParams('source=flavor_inspiration&inspiration=x&product=keto&idea=x'),
      ),
    ).toBeNull();
  });
});
