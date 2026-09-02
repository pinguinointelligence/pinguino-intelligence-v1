import { describe, expect, it } from 'vitest';
import type { CatalogCandidateInput, CatalogProductSearchHit } from './contracts';
import { findCatalogDuplicates, disputeHasDistinguishingEvidence } from './duplicateDetection';
import { aliasesForFamily, canonicalFamilyFor, isValidGtin, normalizeCatalogText, normalizeNetQuantity } from './normalization';
import {
  createPipelineCatalogState,
  submitCatalogCandidate,
  unstarCatalogProduct,
  updateCatalogProductVersion,
} from './pipeline';
import { evaluateCatalogRateLimit, type CatalogRateEvent } from './rateLimit';
import { preserveServerProductRank, rankCatalogHits } from './ranking';
import { catalogEngineEligibility, verifyCatalogCandidate } from './verification';
import { labelOnlyCatalogToppingIngredient, mappedCatalogIngredient } from './catalogIngredient';
import { resolveCatalogMarketScope } from './useGlobalCatalogPicker';
import {
  duplicateFactDifferences,
  duplicateSimilarityPercent,
  existingDuplicateFacts,
} from './duplicateComparison';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';

function candidate(overrides: Partial<CatalogCandidateInput> = {}): CatalogCandidateInput {
  return {
    idempotencyKey: 'scan-1',
    submittingAccountId: 'account-a',
    source: 'ocr_automatic',
    originalName: 'Erdbeeren tiefgefroren',
    displayName: 'Truskawki mrożone 500 g',
    originalLanguage: 'de',
    brand: 'REWE Beste Wahl',
    explicitlyUnbranded: false,
    ean: '5901234123457',
    netQuantity: 500,
    netUnit: 'g',
    market: 'Niemcy',
    countryOfOrigin: 'Polska',
    retailer: 'REWE',
    category: 'fruit',
    variant: 'frozen',
    canonicalFamily: 'strawberry',
    mappedIngredientId: 'PI-ING-000100',
    nutrition: {
      basis: 'per_100g',
      energyKcal: 48,
      fat: 0.4,
      saturatedFat: 0.1,
      carbohydrate: 7,
      sugars: 6,
      protein: 0.8,
      salt: 0.02,
      fibre: 2,
    },
    evidence: {
      ocrConfidence: 94,
      normalizationConfidence: 96,
      imageRoles: ['front', 'nutrition_table', 'ingredients', 'barcode'],
      ingredientsText: 'Truskawki 100%',
      allergensText: 'Brak',
      originalLabelText: 'Erdbeeren tiefgefroren. Nährwerte je 100 g…',
      imagePerceptualHashes: ['0000000000000000'],
    },
    manuallyCompletedFields: [],
    ...overrides,
  };
}

describe('catalog market scope', () => {
  it('preserves an account default of global unless the user selects a market explicitly', () => {
    expect(resolveCatalogMarketScope({
      forceGlobal: false,
      hasSelectedMarkets: false,
      defaultScope: 'global',
    })).toBe('global');
    expect(resolveCatalogMarketScope({
      forceGlobal: false,
      hasSelectedMarkets: true,
      defaultScope: 'global',
    })).toBe('strict_market');
  });
});

describe('global catalog normalization and deterministic verification', () => {
  it('keeps duplicate similarity in its existing 0..100 scale and lists concrete differences', () => {
    expect(duplicateSimilarityPercent(96)).toBe(96);
    expect(duplicateSimilarityPercent(140)).toBe(100);
    const existing = existingDuplicateFacts({
      id: 'p-1',
      product_name_display: 'Pistachio Cream',
      brand: 'Brand A',
      package_size: '500 g',
      country: 'Spain',
      ean_code: '12345678',
    });
    expect(duplicateFactDifferences({
      name: 'Pistachio Cream',
      brand: 'Brand B',
      package: '750 g',
      market: 'Spain',
      ean: '87654321',
    }, existing)).toEqual([
      'Marka: Brand A -> Brand B',
      'Opakowanie: 500 g -> 750 g',
      'Rynek: brak danych -> Spain',
      'EAN: 12345678 -> 87654321',
    ]);
  });
  it('normalizes Unicode, package units and multilingual canonical families', () => {
    expect(normalizeCatalogText('  ŚWIEŻE—Truskawki  ')).toBe('swieze truskawki');
    expect(normalizeNetQuantity(0.5, 'kg')).toEqual({ value: 500, unit: 'g' });
    expect(normalizeNetQuantity(1.5, 'l')).toEqual({ value: 1500, unit: 'ml' });
    for (const query of ['truskawka', 'strawberry', 'fresa', 'Erdbeere', 'fragola', 'fraise']) {
      expect(canonicalFamilyFor(query)).toBe('strawberry');
    }
    expect(aliasesForFamily('strawberry')).toContain('erdbeeren');
  });

  it('validates GTIN check digits rather than accepting arbitrary digits', () => {
    expect(isValidGtin('5901234123457')).toBe(true);
    expect(isValidGtin('5901234123458')).toBe(false);
    expect(isValidGtin('123')).toBe(false);
  });

  it('emits GREEN only for complete coherent high-confidence evidence', () => {
    expect(verifyCatalogCandidate(candidate())).toMatchObject({
      status: 'verified',
      method: 'automatic',
      usable: true,
      missingFields: [],
      invalidFields: [],
    });
  });

  it('emits BLUE after minimum manual completion without pretending it was verified', () => {
    const outcome = verifyCatalogCandidate(candidate({
      source: 'manual_completion',
      evidence: { ...candidate().evidence, ocrConfidence: 20, normalizationConfidence: 40, imageRoles: [] },
      manuallyCompletedFields: ['product_name', 'nutrition'],
    }));
    expect(outcome.status).toBe('manual_unverified');
    expect(outcome.method).toBe('manual_unverified');
    expect(outcome.usable).toBe(true);
  });

  it('emits RED with exact defects and never treats absent nutrition as zero', () => {
    const outcome = verifyCatalogCandidate(candidate({
      netQuantity: null,
      evidence: { ...candidate().evidence, ingredientsText: null, imageRoles: ['front'] },
      nutrition: { ...candidate().nutrition, energyKcal: null, sugars: 20, carbohydrate: 5 },
    }));
    expect(outcome.status).toBe('blocked');
    expect(outcome.usable).toBe(false);
    expect(outcome.missingFields).toEqual(expect.arrayContaining(['net_quantity_unit', 'nutrition_energyKcal', 'ingredients_text', 'nutrition_image']));
    expect(outcome.invalidFields).toContain('nutrition_sugars_gt_carbohydrate');
  });

  it('keeps catalog verification separate from Engine approval', () => {
    expect(catalogEngineEligibility({ status: 'verified', mappedIngredientId: null })).toEqual({ base: false, topping: true });
    expect(catalogEngineEligibility({ status: 'manual_unverified', mappedIngredientId: 'PI-1' })).toEqual({ base: true, topping: true });
    expect(catalogEngineEligibility({ status: 'blocked', mappedIngredientId: 'PI-1' })).toEqual({ base: true, topping: true });
    expect(catalogEngineEligibility({ status: 'blocked', mappedIngredientId: null })).toEqual({ base: false, topping: false });
  });
});

describe('layered duplicate protection', () => {
  const reference = {
    productId: 'catalog-existing',
    eans: ['5901234123457'],
    imagePerceptualHashes: ['0000000000000000'],
    brand: 'REWE Beste Wahl',
    name: 'Truskawki mrożone 500 g',
    variant: 'frozen',
    markets: ['Niemcy'],
    ingredientsText: 'Truskawki 100%',
    allergensText: 'Brak',
    nutrition: candidate().nutrition,
    netQuantity: 500,
    netUnit: 'g',
  };

  it('Layer 1 exact EAN wins', () => {
    expect(findCatalogDuplicates(candidate(), [reference])[0]).toMatchObject({ strength: 'exact', reasons: ['ean_gtin_exact'] });
  });

  it('Layers 2–4 find likely products without EAN', () => {
    const matches = findCatalogDuplicates(candidate({ ean: null, evidence: { ...candidate().evidence, imagePerceptualHashes: ['0000000000000001'] } }), [reference]);
    expect(matches[0]?.strength).toBe('exact');
    expect(matches[0]?.reasons).toEqual(expect.arrayContaining(['package_image_near_exact', 'normalized_identity_exact', 'composition_fingerprint_exact']));
  });

  it('compares perceptual hashes by bits, not by hexadecimal character count', () => {
    const matches = findCatalogDuplicates(candidate({
      ean: null,
      brand: 'Other',
      displayName: 'Unrelated product',
      variant: null,
      nutrition: { ...candidate().nutrition, fat: 20 },
      evidence: {
        ...candidate().evidence,
        ingredientsText: 'Other ingredients',
        imagePerceptualHashes: ['ff00000000000000'],
      },
    }), [reference]);
    expect(matches).toEqual([]);
  });

  it('a dispute needs distinguishing evidence and cannot be an unlimited bare override', () => {
    expect(disputeHasDistinguishingEvidence({})).toBe(false);
    expect(disputeHasDistinguishingEvidence({ market: 'Polska' })).toBe(true);
  });
});

describe('fixtures A–E: automatic shared growth, favorite and consolidated review', () => {
  it('A creates one GREEN shared product, favorites it privately, and never shares private price', () => {
    const state = createPipelineCatalogState();
    state.privatePricesByAccount.set('account-a', new Map([['private-source', 9.99]]));
    const out = submitCatalogCandidate({ state, candidate: candidate(), now: '2026-08-12T10:00:00Z' });
    expect(out).toMatchObject({ kind: 'created', status: 'verified', autoFavorited: true });
    expect(state.products).toHaveLength(1);
    expect(state.favoritesByAccount.get('account-a')?.has(out.productId!)).toBe(true);
    expect(state.favoritesByAccount.get('account-b')).toBeUndefined();
    expect(state.privatePricesByAccount.get('account-a')?.get('private-source')).toBe(9.99);
    expect(JSON.stringify(state.products[0])).not.toContain('9.99');
  });

  it('B reuses existing EAN, creates no duplicate and auto-favorites it', () => {
    const state = createPipelineCatalogState();
    const first = submitCatalogCandidate({ state, candidate: candidate(), now: '2026-08-12T10:00:00Z' });
    const second = submitCatalogCandidate({ state, candidate: candidate({ idempotencyKey: 'scan-2', submittingAccountId: 'account-b' }), now: '2026-08-12T11:00:00Z' });
    expect(second).toMatchObject({ kind: 'existing', productId: first.productId, autoFavorited: true });
    expect(state.products).toHaveLength(1);
    expect(state.favoritesByAccount.get('account-b')?.has(first.productId!)).toBe(true);
  });

  it('C pauses on a likely match, then reuses it after customer confirmation', () => {
    const state = createPipelineCatalogState();
    const first = submitCatalogCandidate({ state, candidate: candidate(), now: '2026-08-12T10:00:00Z' });
    const scan = candidate({ idempotencyKey: 'scan-c', ean: null, evidence: { ...candidate().evidence, imagePerceptualHashes: [] }, nutrition: { ...candidate().nutrition, fibre: 2.1 } });
    const pending = submitCatalogCandidate({ state, candidate: scan, now: '2026-08-12T12:00:00Z' });
    expect(pending.kind).toBe('likely_duplicate');
    scan.idempotencyKey = 'scan-c-confirmed';
    const confirmed = submitCatalogCandidate({ state, candidate: scan, now: '2026-08-12T12:01:00Z', duplicateDecision: 'same' });
    expect(confirmed).toMatchObject({ kind: 'existing', productId: first.productId });
    expect(state.products).toHaveLength(1);
  });

  it('D requires evidence for a different product and creates BLUE + one aggregated dispute case', () => {
    const state = createPipelineCatalogState();
    submitCatalogCandidate({ state, candidate: candidate(), now: '2026-08-12T10:00:00Z' });
    const disputed = candidate({ idempotencyKey: 'scan-d', ean: null, nutrition: { ...candidate().nutrition, fibre: 2.1 }, evidence: { ...candidate().evidence, imagePerceptualHashes: [] } });
    const withoutEvidence = submitCatalogCandidate({ state, candidate: disputed, now: '2026-08-12T13:00:00Z', duplicateDecision: 'different' });
    expect(withoutEvidence).toMatchObject({ kind: 'blocked', missingFields: ['distinguishing_duplicate_evidence'] });
    disputed.idempotencyKey = 'scan-d-evidence';
    const withEvidence = submitCatalogCandidate({ state, candidate: disputed, now: '2026-08-13T13:01:00Z', duplicateDecision: 'different', distinguishingEvidence: { nutrition: { fibre: 2.1 } } });
    expect(withEvidence).toMatchObject({ kind: 'created', status: 'manual_unverified', autoFavorited: true });
    expect(withEvidence.reviewCaseKey).toMatch(/^duplicate_dispute:/);
  });

  it('E keeps missing data RED; manual completion creates BLUE and a review case', () => {
    const state = createPipelineCatalogState();
    const incomplete = candidate({ idempotencyKey: 'scan-e', netQuantity: null, nutrition: { ...candidate().nutrition, energyKcal: null } });
    const red = submitCatalogCandidate({ state, candidate: incomplete, now: '2026-08-12T14:00:00Z' });
    expect(red).toMatchObject({ kind: 'blocked', status: 'blocked', autoFavorited: false });
    expect(red.missingFields).toEqual(expect.arrayContaining(['net_quantity_unit', 'nutrition_energyKcal']));
    const completed = candidate({ idempotencyKey: 'scan-e-complete', source: 'manual_completion', manuallyCompletedFields: ['net_quantity', 'nutrition'], evidence: { ...candidate().evidence, ocrConfidence: 30 } });
    const blue = submitCatalogCandidate({ state, candidate: completed, now: '2026-08-13T14:01:00Z' });
    expect(blue).toMatchObject({ kind: 'existing', status: 'manual_unverified', autoFavorited: true });
    expect(blue.reviewCaseKey).toMatch(/^manual_unverified:/);
  });

  it('idempotent retries do not duplicate products or human work', () => {
    const state = createPipelineCatalogState();
    const first = submitCatalogCandidate({ state, candidate: candidate(), now: '2026-08-12T10:00:00Z' });
    const retry = submitCatalogCandidate({ state, candidate: candidate(), now: '2026-08-12T10:00:01Z' });
    expect(retry).toEqual(first);
    expect(state.products).toHaveLength(1);
  });

  it('supports immediate unstar without deleting the shared product', () => {
    const state = createPipelineCatalogState();
    const out = submitCatalogCandidate({ state, candidate: candidate(), now: '2026-08-12T10:00:00Z' });
    unstarCatalogProduct(state, 'account-a', out.productId!);
    expect(state.favoritesByAccount.get('account-a')?.has(out.productId!)).toBe(false);
    expect(state.products).toHaveLength(1);
  });

  it('preserves immutable product versions rather than overwriting history', () => {
    const state = createPipelineCatalogState();
    const out = submitCatalogCandidate({ state, candidate: candidate(), now: '2026-08-12T10:00:00Z' });
    const updated = updateCatalogProductVersion({ state, productId: out.productId!, candidate: candidate({ netQuantity: 750 }), now: '2026-09-01T10:00:00Z' });
    expect(updated.version).toBe(2);
    expect(updated.versions.map((item) => item.snapshot.netQuantity)).toEqual([500, 750]);
  });
});

describe('fixtures F–I: multilingual, markets, favorites and context ranking', () => {
  const hit = (overrides: Partial<CatalogProductSearchHit>): CatalogProductSearchHit => ({
    id: 'catalog-1', entityKind: 'commercial_product', status: 'verified', displayName: 'Truskawki mrożone',
    originalName: 'Erdbeeren tiefgefroren', originalLanguage: 'de', brand: 'REWE', canonicalFamily: 'strawberry',
    category: 'fruit', mappedIngredientId: 'PI-STRAWBERRY', markets: ['Niemcy'], retailers: ['REWE'],
    eans: ['5901234123457'], aliases: aliasesForFamily('strawberry'), favorite: false, recentlyUsedAt: null,
    usableInBase: true, usableAsTopping: true, missingFields: [], invalidFields: [], verificationMethod: 'automatic', publicData: {},
    ...overrides,
  });
  const preferences = { primaryMarket: 'Polska', additionalMarkets: ['Niemcy'], preferredRetailers: ['REWE'], defaultScope: 'my_markets_and_global' as const };

  it('F reaches the same family through PL/EN/ES/DE/IT', () => {
    const strawberry = hit({});
    for (const query of ['truskawka', 'strawberry', 'fresa', 'Erdbeere', 'fragola']) {
      expect(rankCatalogHits({ hits: [strawberry], query, context: 'base', preferences })[0]?.id).toBe(strawberry.id);
    }
  });

  it('preserves the server order and does not discard typo/alias hits locally', () => {
    const serverHits = [
      hit({ id: 'fresh-strawberry', relevance: 140 }),
      hit({ id: 'strawberry-puree', displayName: 'Puree truskawkowe', relevance: 110 }),
    ];
    expect(preserveServerProductRank(serverHits, preferences).map((item) => item.id))
      .toEqual(['fresh-strawberry', 'strawberry-puree']);
  });

  it('G ranks primary/additional market products before equally relevant global products', () => {
    const ranked = rankCatalogHits({
      hits: [hit({ id: 'global', markets: ['USA'] }), hit({ id: 'de', markets: ['Niemcy'] }), hit({ id: 'pl', markets: ['Polska'] })],
      query: 'truskawka', context: 'base', preferences,
    });
    expect(ranked.map((item) => item.id)).toEqual(['pl', 'de', 'global']);
  });

  it('uses preferred retailer only as a tie-breaker after relevance and market', () => {
    const ranked = rankCatalogHits({
      hits: [hit({ id: 'other-retailer', retailers: ['Carrefour'] }), hit({ id: 'rewe', retailers: ['REWE'] })],
      query: 'truskawka', context: 'base', preferences,
    });
    expect(ranked.map((item) => item.id)).toEqual(['rewe', 'other-retailer']);
  });

  it('H favorites act only as a tie-breaker among relevant results', () => {
    const ranked = rankCatalogHits({
      hits: [hit({ id: 'milk', displayName: 'Milk', canonicalFamily: null, aliases: ['milk'], favorite: true }), hit({ id: 'strawberry', favorite: false })],
      query: 'truskawka', context: 'base', preferences,
    });
    expect(ranked.map((item) => item.id)).toEqual(['strawberry']);
  });

  it('I ranks actual fruit before soda in Base but keeps broad Topping results', () => {
    const fruit = hit({ id: 'fruit', category: 'fruit' });
    const soda = hit({ id: 'soda', displayName: 'Strawberry Soda', category: 'beverage', mappedIngredientId: null, usableInBase: false });
    expect(rankCatalogHits({ hits: [soda, fruit], query: 'strawberry', context: 'base', preferences }).map((item) => item.id)).toEqual(['fruit', 'soda']);
    expect(rankCatalogHits({ hits: [soda, fruit], query: 'strawberry', context: 'topping', preferences }).map((item) => item.id)).toEqual(expect.arrayContaining(['fruit', 'soda']));
  });
});

describe('server-equivalent rate contract', () => {
  const events = (count: number, action: CatalogRateEvent['action'], at: string): CatalogRateEvent[] =>
    Array.from({ length: count }, (_, index) => ({ accountId: 'a', action, at: new Date(new Date(at).getTime() - index * 1000).toISOString() }));

  it('enforces burst/hour/day OCR limits and isolates accounts', () => {
    const now = '2026-08-12T10:00:00Z';
    expect(evaluateCatalogRateLimit({ accountId: 'a', action: 'ocr_scan', now, events: events(3, 'ocr_scan', now) }).reason).toBe('burst');
    expect(evaluateCatalogRateLimit({ accountId: 'b', action: 'ocr_scan', now, events: events(100, 'ocr_scan', now) }).allowed).toBe(true);
  });

  it('enforces manual, human-review and dispute limits separately', () => {
    const now = '2026-08-12T10:00:00Z';
    expect(evaluateCatalogRateLimit({ accountId: 'a', action: 'manual_candidate', now, events: events(10, 'manual_candidate', now) }).allowed).toBe(false);
    expect(evaluateCatalogRateLimit({ accountId: 'a', action: 'duplicate_dispute', now, events: events(2, 'duplicate_dispute', now) }).allowed).toBe(false);
    expect(evaluateCatalogRateLimit({ accountId: 'a', action: 'review_escalation', now, events: events(1, 'review_escalation', now) }).reason).toBe('cooldown');
  });

  it('supports trusted-account configurable multipliers and payload collapse', () => {
    const now = '2026-08-12T10:00:00Z';
    expect(evaluateCatalogRateLimit({ accountId: 'a', action: 'ocr_scan', now, events: events(3, 'ocr_scan', now), trust: { trusted: true, multiplier: 5 } }).allowed).toBe(true);
    const duplicate = [{ accountId: 'a', action: 'ocr_scan' as const, at: now, payloadHash: 'same' }];
    expect(evaluateCatalogRateLimit({ accountId: 'a', action: 'ocr_scan', now, events: duplicate, payloadHash: 'same' }).reason).toBe('duplicate_payload');
  });
});

describe('product handoffs never invent Engine science', () => {
  const row = {
    ingredient_id: 'PI-ING-000100', ingredient_name_display: 'STRAWBERRIES', ingredient_name_internal: 'Truskawka',
    ingredient_category: 'fruit', ingredient_subcategory: 'fresh_fruit_profile', brand: null, is_active: true,
    approved_for_engines: true, water_percent: 90, total_solids_percent: 10, fat_percent: 0.4,
    saturated_fat_percent: 0.1, milk_fat_percent: 0, non_fat_milk_solids_percent: 0, protein_percent: 0.8,
    aerating_protein_percent: 0, carbohydrate_percent: 7, total_sugars_percent: 6, sucrose_percent: 0,
    dextrose_percent: 0, glucose_percent: 3, fructose_percent: 3, lactose_percent: 0, polyol_percent: 0,
    fiber_percent: 2, salt_percent: 0.02, alcohol_percent: 0, ash_percent: 0, acidity_percent: 0,
    brix: null, dry_matter_percent: 10, pod_value: 6, pac_value: 6, de_value: null, sweetness_factor: null,
    freezing_factor: null, stabilizer_activity: null, recommended_dosage_percent_min: null,
    recommended_dosage_percent_max: null, kcal_per_100g: 48, cost_per_kg: null, currency: null,
    allergens: null, vegan: 'true', dairy_free: 'true', gluten_free: 'true', contains_alcohol: 'false',
    storage_type: 'frozen', shelf_life_days: null, usage_notes: null, engine_notes: null, source_type: 'verified_db',
    confidence_score: 100, data_confidence_percent: 100, verification_status: 'Verified', is_verified: true,
    flags: null, created_at: '', updated_at: '',
  } as unknown as IngredientRow;
  const hit: CatalogProductSearchHit = {
    id: 'catalog-1', entityKind: 'commercial_product', status: 'verified', displayName: 'Truskawki', originalName: null,
    originalLanguage: 'pl', brand: 'Brand', canonicalFamily: 'strawberry', category: 'fruit', mappedIngredientId: row.ingredient_id,
    markets: ['Polska'], retailers: [], eans: [], aliases: [], favorite: false, recentlyUsedAt: null, usableInBase: true,
    usableAsTopping: true, missingFields: [], invalidFields: [], verificationMethod: 'automatic', publicData: {
      ingredientsText: 'Truskawki 100%',
      allergensText: 'Brak zadeklarowanych alergenów',
      nutrition: {
        basis: 'per_100g', energyKcal: 48, fat: 0.4, saturatedFat: 0.1,
        carbohydrate: 7, sugars: 6, protein: 0.8, salt: 0.02, fibre: 2,
      },
    },
  };
  it('Base uses only the mapped canonical reference science', () => {
    const ingredient = mappedCatalogIngredient(hit, row);
    expect(ingredient.canonical_ingredient_id).toBe(row.ingredient_id);
    expect(ingredient.pac_value).toBe(6);
    expect(ingredient.pod_value).toBe(6);
  });
  it('hands an unmapped commercial product to Topping as label-only product data', () => {
    const topping = labelOnlyCatalogToppingIngredient({
      ...hit,
      mappedIngredientId: null,
      usableInBase: false,
      privatePricePerKg: 8.5,
      privatePriceCurrency: 'EUR',
    });
    expect(topping).toMatchObject({
      kind: 'catalog_label_topping',
      canonical_ingredient_id: 'catalog:catalog-1',
      catalog_product_id: 'catalog-1',
      verification_status: 'verified',
      label_nutrition_per_100g: {
        basis: 'per_100g',
        energyKcal: 48,
        sugars: 6,
      },
      cost_per_kg: 8.5,
      cost_currency: 'EUR',
    });
    expect(topping).not.toHaveProperty('composition');
    expect(topping).not.toHaveProperty('pac_value');
    expect(topping).not.toHaveProperty('pod_value');
  });

  it('accepts missing optional label facts and preserves them as unknown', () => {
    const optionalMissing = {
      ...hit,
      publicData: {
        ...hit.publicData,
        nutrition: {
          ...(hit.publicData.nutrition as Record<string, unknown>),
          saturatedFat: undefined,
          sugars: undefined,
          fibre: undefined,
        },
      },
    };
    expect(labelOnlyCatalogToppingIngredient(optionalMissing)?.label_nutrition_per_100g)
      .toMatchObject({ saturatedFat: null, sugars: null, fibre: null });
  });

  it('refuses label-only Topping when a required declared fact is absent', () => {
    const incomplete = {
      ...hit,
      mappedIngredientId: null,
      usableInBase: false,
      publicData: {
        ...hit.publicData,
        nutrition: { ...(hit.publicData.nutrition as Record<string, unknown>), protein: undefined },
      },
    };
    expect(labelOnlyCatalogToppingIngredient(incomplete)).toBeNull();
  });
});
