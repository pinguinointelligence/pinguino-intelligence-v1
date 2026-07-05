/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { ProductRow } from '@/data/products/productRow';
import { canonicalEan, matchProduct, normalizeName, toFiniteNumber } from './productMatcher';

/* ── fixture builders (all-null by default; honest "unknown") ───────────────── */

function basementRow(over: Partial<IngredientRow>): IngredientRow {
  return {
    ingredient_id: 'B-DEFAULT',
    ingredient_name_internal: '',
    ingredient_name_display: '',
    brand: '',
    supplier: '',
    country: '',
    ean_code: '',
    ingredient_category: '',
    ingredient_subcategory: '',
    approved_for_base: true,
    approved_for_engines: true,
    verification_status: 'verified',
    verification_source: '',
    verification_date: null,
    data_confidence_percent: null,
    water_percent: null,
    total_solids_percent: null,
    fat_percent: null,
    saturated_fat_percent: null,
    milk_fat_percent: null,
    non_fat_milk_solids_percent: null,
    protein_percent: null,
    aerating_protein_percent: null,
    carbohydrate_percent: null,
    total_sugars_percent: null,
    sucrose_percent: null,
    dextrose_percent: null,
    glucose_percent: null,
    fructose_percent: null,
    lactose_percent: null,
    polyol_percent: null,
    fiber_percent: null,
    salt_percent: null,
    alcohol_percent: null,
    ash_percent: null,
    acidity_percent: null,
    brix: null,
    dry_matter_percent: null,
    pod_value: null,
    pac_value: null,
    de_value: null,
    sweetness_factor: null,
    freezing_factor: null,
    stabilizer_activity: null,
    recommended_dosage_percent_min: null,
    recommended_dosage_percent_max: null,
    kcal_per_100g: null,
    cost_per_kg: null,
    currency: '',
    allergens: '',
    vegan: 'unknown',
    dairy_free: 'unknown',
    gluten_free: 'unknown',
    contains_alcohol: 'unknown',
    storage_type: 'unknown',
    shelf_life_days: null,
    usage_notes: '',
    engine_notes: '',
    source_url: '',
    screenshot_reference: '',
    last_reviewed_by: '',
    last_reviewed_at: null,
    dataset_version: 'v0.95',
    is_active: true,
    created_at: '2026-06-16',
    updated_at: '2026-06-16',
    ...over,
  };
}

function productRow(over: Partial<ProductRow>): ProductRow {
  return {
    id: 'P-DEFAULT',
    owner_user_id: 'user-1',
    created_by: null,
    brand: null,
    supplier: null,
    ean_code: null,
    barcode: null,
    product_name_internal: null,
    product_name_display: null,
    product_category: null,
    product_subcategory: null,
    country: null,
    water_percent: null,
    total_solids_percent: null,
    fat_percent: null,
    saturated_fat_percent: null,
    milk_fat_percent: null,
    non_fat_milk_solids_percent: null,
    protein_percent: null,
    aerating_protein_percent: null,
    carbohydrate_percent: null,
    total_sugars_percent: null,
    sucrose_percent: null,
    dextrose_percent: null,
    glucose_percent: null,
    fructose_percent: null,
    lactose_percent: null,
    polyol_percent: null,
    fiber_percent: null,
    salt_percent: null,
    alcohol_percent: null,
    ash_percent: null,
    acidity_percent: null,
    brix: null,
    dry_matter_percent: null,
    pod_value: null,
    pac_value: null,
    de_value: null,
    sweetness_factor: null,
    freezing_factor: null,
    stabilizer_activity: null,
    recommended_dosage_percent_min: null,
    recommended_dosage_percent_max: null,
    kcal_per_100g: null,
    cost_per_kg: null,
    currency: null,
    allergens: null,
    vegan: null,
    dairy_free: null,
    gluten_free: null,
    contains_alcohol: null,
    storage_type: null,
    shelf_life_days: null,
    usage_notes: null,
    engine_notes: null,
    product_image_url: null,
    detected_text: null,
    extracted_json: null,
    catalog_source: null,
    status: 'draft',
    source_type: 'manual',
    reviewed_by: null,
    reviewed_at: null,
    review_notes: null,
    promoted_to_basement: false,
    promoted_at: null,
    dataset_version: null,
    is_active: true,
    created_at: '2026-06-19',
    updated_at: '2026-06-19',
    // Mapper-result columns (0008) — NULL on an unmapped fixture row (D3 fills them).
    matched_basement_id: null,
    match_confidence: null,
    match_method: null,
    mapper_status: null,
    mapper_notes: null,
    normalized_name: null,
    normalized_category: null,
    needs_review_reason: null,
    missing_fields_json: null,
    candidate_ids: null,
    candidate_count: null,
    // Product identity (0009) — DB-managed code + normalized cols default to a fixture
    // placeholder / empty string; the writable identity columns default to null.
    product_code: 'PR-ING-000000',
    ean_code_normalized: '',
    barcode_normalized: '',
    product_url: null,
    source_url: null,
    package_size: null,
    product_identity_hash: null,
    ...over,
  };
}

/** A product carrying its own engine values (so a clean match isn't downgraded). */
const engineReady = { pac_value: 5, pod_value: 5 } satisfies Partial<ProductRow>;

/* ── pure helpers ──────────────────────────────────────────────────────────── */

describe('normalizeName', () => {
  it('trims, lowercases, collapses whitespace + punctuation, keeps letters/digits', () => {
    expect(normalizeName('  Whole   Milk 3.5% ')).toBe('whole milk 3 5');
    expect(normalizeName('Crumbolé® Cocoa')).toBe('crumbolé cocoa');
  });
  it('is idempotent and null-safe', () => {
    const once = normalizeName('Dark-Chocolate 72%');
    expect(normalizeName(once)).toBe(once);
    expect(normalizeName(null)).toBe('');
  });
});

describe('canonicalEan', () => {
  it('strips separators but PRESERVES leading zeros', () => {
    expect(canonicalEan('0049-000 028911')).toBe('0049000028911');
    expect(canonicalEan('49000028911')).toBe('49000028911');
    // leading zero is meaningful: the two are NOT equal
    expect(canonicalEan('0049000028911')).not.toBe(canonicalEan('49000028911'));
  });
  it('is null/blank-safe', () => {
    expect(canonicalEan(null)).toBe('');
    expect(canonicalEan('--')).toBe('');
  });
});

describe('toFiniteNumber — coercion (numbers + DB numeric strings)', () => {
  it('accepts finite numbers and preserves zero', () => {
    expect(toFiniteNumber(3.5)).toBe(3.5);
    expect(toFiniteNumber(0)).toBe(0);
    expect(toFiniteNumber(-2)).toBe(-2);
  });
  it('accepts clearly-numeric dot strings (how PostgREST serializes numeric), preserving zero', () => {
    expect(toFiniteNumber('3.5')).toBe(3.5);
    expect(toFiniteNumber('104.161')).toBe(104.161);
    expect(toFiniteNumber('0')).toBe(0);
    expect(toFiniteNumber(' 12 ')).toBe(12);
  });
  it('accepts a single EU decimal comma', () => {
    expect(toFiniteNumber('3,5')).toBe(3.5);
  });
  it('rejects blank / null / undefined / NaN / Infinity and non-numeric or ambiguous strings', () => {
    for (const v of ['', '   ', null, undefined, NaN, Infinity, -Infinity, 'abc', '1,234', '1.2.3', '1.234,5']) {
      expect(toFiniteNumber(v as unknown), String(v)).toBeNull();
    }
  });
});

describe('matchProduct — composition is robust to numeric DB strings (regression)', () => {
  const s = (v: string) => v as unknown as number; // a numeric column serialized as a string

  it('category_composition_similarity fires when composition arrives as numeric strings', () => {
    const cream = basementRow({
      ingredient_id: 'B-CREAM-STR', ingredient_category: 'dairy', ingredient_name_display: 'Cream 30%',
      fat_percent: s('30'), carbohydrate_percent: s('3.2'), total_sugars_percent: s('3.2'),
      protein_percent: s('2.3'), salt_percent: s('0.08'), pac_value: s('1'), pod_value: s('1'),
    });
    const product = productRow({
      product_category: 'dairy', product_name_display: 'Generic Cream',
      fat_percent: s('30.2'), carbohydrate_percent: s('3'), total_sugars_percent: s('3'),
      protein_percent: s('2.4'), salt_percent: s('0.1'), pac_value: s('5'), pod_value: s('5'),
    });
    const r = matchProduct(product, [cream]);
    expect(r.match_method).toBe('category_composition_similarity');
    expect(r.matched_basement_id).toBe('B-CREAM-STR');
  });

  it('an exact match supplies pac/pod even when the reference values are numeric strings', () => {
    const b = basementRow({ ingredient_id: 'B-EAN-STR', ean_code: '99999999', pac_value: s('1'), pod_value: s('1') });
    const r = matchProduct(productRow({ ean_code: '99999999' }), [b]); // product missing pac/pod
    expect(r.mapper_status).toBe('matched');
    expect(r.match_confidence).toBe('exact');
    expect(r.matched_basement_id).toBe('B-EAN-STR');
  });
});

/* ── matching levels (priority order) ──────────────────────────────────────── */

describe('matchProduct — levels', () => {
  it('exact EAN match preserves leading zeros (only the zero-prefixed row matches)', () => {
    const withZero = basementRow({ ingredient_id: 'B-ZERO', ean_code: '0049000028911', pac_value: 1, pod_value: 1 });
    const withoutZero = basementRow({ ingredient_id: 'B-NOZERO', ean_code: '49000028911', pac_value: 1, pod_value: 1 });
    const r = matchProduct(productRow({ ean_code: '0049-000 028911', ...engineReady }), [withZero, withoutZero]);
    expect(r.mapper_status).toBe('matched');
    expect(r.match_method).toBe('exact_ean');
    expect(r.match_confidence).toBe('exact');
    expect(r.matched_basement_id).toBe('B-ZERO');
  });

  it('exact normalized name match → exact when the reference row is verified', () => {
    const milk = basementRow({ ingredient_id: 'B-MILK', ingredient_name_display: 'Whole Milk 3.5%', verification_status: 'verified', pac_value: 1, pod_value: 1 });
    const r = matchProduct(productRow({ product_name_display: 'whole   milk 3.5 %', ...engineReady }), [milk]);
    expect(r.match_method).toBe('exact_normalized_name');
    expect(r.match_confidence).toBe('exact');
    expect(r.matched_basement_id).toBe('B-MILK');
  });

  it('exact normalized name match → high when the reference row is not verified', () => {
    const milk = basementRow({ ingredient_id: 'B-MILK', ingredient_name_display: 'Whole Milk', verification_status: 'label_data', pac_value: 1, pod_value: 1 });
    const r = matchProduct(productRow({ product_name_display: 'whole milk', ...engineReady }), [milk]);
    expect(r.match_method).toBe('exact_normalized_name');
    expect(r.match_confidence).toBe('high');
  });

  it('brand + name containment → high', () => {
    const b = basementRow({ ingredient_id: 'B-CRUMBLE', brand: 'Babbi', ingredient_name_display: 'Crumble Frutti Di Bosco Babbi', pac_value: 1, pod_value: 1 });
    const r = matchProduct(productRow({ brand: 'Babbi', product_name_display: 'Crumble Frutti', ...engineReady }), [b]);
    expect(r.match_method).toBe('brand_name');
    expect(r.match_confidence).toBe('high');
    expect(r.matched_basement_id).toBe('B-CRUMBLE');
  });

  it('category + composition similarity → medium', () => {
    const cream = basementRow({ ingredient_id: 'B-CREAM', ingredient_category: 'dairy', ingredient_name_display: 'Cream 30%', fat_percent: 30, carbohydrate_percent: 3.2, total_sugars_percent: 3.2, protein_percent: 2.3, salt_percent: 0.08, pac_value: 1, pod_value: 1 });
    const r = matchProduct(
      productRow({ product_category: 'dairy', product_name_display: 'Generic Cream', fat_percent: 30.2, carbohydrate_percent: 3, total_sugars_percent: 3, protein_percent: 2.4, salt_percent: 0.1, ...engineReady }),
      [cream],
    );
    expect(r.match_method).toBe('category_composition_similarity');
    expect(r.match_confidence).toBe('medium');
    expect(r.matched_basement_id).toBe('B-CREAM');
  });

  it('ingredient-type fallback when composition is too far → low', () => {
    const smp = basementRow({ ingredient_id: 'B-SMP', ingredient_category: 'dairy', ingredient_name_display: 'Skimmed Milk Powder', fat_percent: 1, carbohydrate_percent: 52, total_sugars_percent: 52, protein_percent: 35, salt_percent: 1, pac_value: 1, pod_value: 1 });
    const r = matchProduct(
      productRow({ product_category: 'dairy', product_name_display: 'Mystery Dairy Item', fat_percent: 5, carbohydrate_percent: 5, total_sugars_percent: 5, protein_percent: 3, salt_percent: 0.1, ...engineReady }),
      [smp],
    ); // 5 shared, mean distance ≈ 25 pp → far past threshold
    expect(r.match_method).toBe('ingredient_type');
    expect(r.match_confidence).toBe('low');
  });

  it('fuzzy substring fallback → low', () => {
    const choc = basementRow({ ingredient_id: 'B-DARK', ingredient_name_display: 'Dark Chocolate 72%', pac_value: 1, pod_value: 1 });
    const r = matchProduct(productRow({ product_name_display: 'choco', ...engineReady }), [choc]);
    expect(r.match_method).toBe('fuzzy_name');
    expect(r.match_confidence).toBe('low');
    expect(r.matched_basement_id).toBe('B-DARK');
  });

  it('no confident match → unmatched', () => {
    const milk = basementRow({ ingredient_id: 'B-MILK', ingredient_name_display: 'Whole Milk', ingredient_category: 'dairy' });
    const r = matchProduct(productRow({ product_name_display: 'zzzqqq widget', ...engineReady }), [milk]);
    expect(r.mapper_status).toBe('unmatched');
    expect(r.match_method).toBe('no_confident_match');
    expect(r.match_confidence).toBe('needs_review');
    expect(r.matched_basement_id).toBeNull();
  });
});

/* ── ambiguity, review, and honesty ────────────────────────────────────────── */

describe('matchProduct — ambiguity & review', () => {
  it('two candidates tying at the winning level → ambiguous, never a silent pick', () => {
    const a = basementRow({ ingredient_id: 'B-A', ean_code: '12345678', pac_value: 1, pod_value: 1 });
    const b = basementRow({ ingredient_id: 'B-B', ean_code: '12345678', pac_value: 1, pod_value: 1 });
    const r = matchProduct(productRow({ ean_code: '1234-5678', ...engineReady }), [a, b]);
    expect(r.mapper_status).toBe('ambiguous');
    expect(r.match_method).toBe('exact_ean');
    expect(r.match_confidence).toBe('needs_review');
    expect(r.matched_basement_id).toBeNull();
    expect(r.candidate_count).toBe(2);
    expect(r.candidate_ids).toEqual(['B-A', 'B-B']);
  });

  it('a single non-exact match but the product is missing engine values → needs_review', () => {
    const b = basementRow({ ingredient_id: 'B-CRUMBLE', brand: 'Babbi', ingredient_name_display: 'Crumble Frutti Di Bosco', pac_value: 1, pod_value: 1 });
    const r = matchProduct(productRow({ brand: 'Babbi', product_name_display: 'Crumble Frutti' }), [b]); // no pac/pod
    expect(r.mapper_status).toBe('needs_review');
    expect(r.match_method).toBe('brand_name');
    expect(r.matched_basement_id).toBe('B-CRUMBLE');
    expect(r.match_confidence).toBe('needs_review');
    expect(r.missing_fields).toEqual(['pac_value', 'pod_value']);
    expect(r.needs_review_reason).toMatch(/missing engine source values/);
  });

  it('an EXACT match is kept even when the product is missing engine values (the match supplies them)', () => {
    const b = basementRow({ ingredient_id: 'B-EAN', ean_code: '99999999', pac_value: 1, pod_value: 1 });
    const r = matchProduct(productRow({ ean_code: '99999999' }), [b]); // no pac/pod
    expect(r.mapper_status).toBe('matched');
    expect(r.match_confidence).toBe('exact');
    expect(r.matched_basement_id).toBe('B-EAN');
    // still reported so D3 knows to fill them from the matched reference row
    expect(r.missing_fields).toEqual(['pac_value', 'pod_value']);
  });

  it('missing numeric values are never treated as 0 (no fake-zero composition match)', () => {
    // basement row has all-zero composition; product composition is all NULL.
    const zeroDairy = basementRow({ ingredient_id: 'B-ZERO-DAIRY', ingredient_category: 'dairy', water_percent: 0, fat_percent: 0, protein_percent: 0, total_sugars_percent: 0, total_solids_percent: 0, pac_value: 1, pod_value: 1 });
    const r = matchProduct(productRow({ product_category: 'dairy', product_name_display: 'No Comp Data', ...engineReady }), [zeroDairy]);
    // if nulls were coerced to 0 this would be a (perfect) composition match; instead
    // there are 0 shared fields, so it falls through to the ingredient-type level.
    expect(r.match_method).toBe('ingredient_type');
    expect(r.match_method).not.toBe('category_composition_similarity');
  });

  it('reports missing engine source values in missing_fields (never invented)', () => {
    const r = matchProduct(productRow({ product_name_display: 'anything' }), []);
    expect(r.missing_fields).toEqual(['pac_value', 'pod_value']);
  });
});

/* ── D2 adversarial-review hardening (confirmed findings) ───────────────────── */

describe('matchProduct — composition threshold + shared-field boundaries', () => {
  const dairy = (over: Partial<IngredientRow>) =>
    basementRow({ ingredient_id: 'B-DAIRY', ingredient_category: 'dairy', pac_value: 1, pod_value: 1, ...over });

  it('5 shared fields at avg distance exactly 2 → composition match (pins THRESHOLD low side)', () => {
    const b = dairy({ fat_percent: 20, carbohydrate_percent: 20, total_sugars_percent: 20, protein_percent: 20, salt_percent: 20 });
    const r = matchProduct(
      productRow({ product_category: 'dairy', product_name_display: 'C', fat_percent: 22, carbohydrate_percent: 22, total_sugars_percent: 22, protein_percent: 22, salt_percent: 22, ...engineReady }),
      [b],
    ); // diffs 2,2,2,2,2 → avg 2.0
    expect(r.match_method).toBe('category_composition_similarity');
    expect(r.match_confidence).toBe('medium');
  });

  it('5 shared fields at avg distance just over 2 → falls through (pins THRESHOLD high side)', () => {
    const b = dairy({ fat_percent: 20, carbohydrate_percent: 20, total_sugars_percent: 20, protein_percent: 20, salt_percent: 20 });
    const r = matchProduct(
      productRow({ product_category: 'dairy', product_name_display: 'C', fat_percent: 22, carbohydrate_percent: 22, total_sugars_percent: 22, protein_percent: 22, salt_percent: 23, ...engineReady }),
      [b],
    ); // diffs 2,2,2,2,3 → avg 2.2
    expect(r.match_method).toBe('ingredient_type');
  });

  it('only 3 shared fields, even a perfect match, is rejected (pins MIN_SHARED=4)', () => {
    const b = dairy({ fat_percent: 20, carbohydrate_percent: 20, total_sugars_percent: 20 }); // protein/salt null
    const r = matchProduct(
      productRow({ product_category: 'dairy', product_name_display: 'C', fat_percent: 20, carbohydrate_percent: 20, total_sugars_percent: 20, ...engineReady }),
      [b],
    );
    expect(r.match_method).toBe('ingredient_type');
  });

  it('4 shared fields within threshold → composition match (MIN_SHARED=4 is enough)', () => {
    const b = dairy({ fat_percent: 20, carbohydrate_percent: 20, total_sugars_percent: 20, protein_percent: 20 }); // salt null
    const r = matchProduct(
      productRow({ product_category: 'dairy', product_name_display: 'C', fat_percent: 21, carbohydrate_percent: 21, total_sugars_percent: 21, protein_percent: 21, ...engineReady }),
      [b],
    ); // 4 shared, diffs 1,1,1,1 → avg 1.0
    expect(r.match_method).toBe('category_composition_similarity');
  });

  it('only fields present in BOTH rows count — a lone-sided field never contributes as 0', () => {
    // shared fat/carb/sugars/protein (diffs 1,1,1,1 → avg 1). product salt=999 (basement null)
    // must be IGNORED; if it were coerced to 0 and counted, the avg would blow far past 2.
    const b = dairy({ fat_percent: 21, carbohydrate_percent: 21, total_sugars_percent: 21, protein_percent: 21 });
    const r = matchProduct(
      productRow({ product_category: 'dairy', product_name_display: 'C', fat_percent: 20, carbohydrate_percent: 20, total_sugars_percent: 20, protein_percent: 20, salt_percent: 999, ...engineReady }),
      [b],
    );
    expect(r.match_method).toBe('category_composition_similarity');
  });
});

/* ── Slice 1: measured-field composition (carbohydrate + salt) ──────────────── */

describe('matchProduct — Slice 1 measured-field composition (carbohydrate + salt)', () => {
  const dairy = (id: string, over: Partial<IngredientRow>) =>
    basementRow({ ingredient_id: id, ingredient_category: 'dairy', pac_value: 1, pod_value: 1, ...over });

  it('carbohydrate separates two same-category rows that tie on fat/protein/sugars', () => {
    // A and B are identical on fat/protein/total_sugars; only carbohydrate differs. On the old
    // 3-field metric both tied (→ ambiguous); carbohydrate now singles out the true candidate.
    const a = dairy('B-A', { fat_percent: 10, total_sugars_percent: 5, protein_percent: 4, salt_percent: 0.1, carbohydrate_percent: 6 });
    const b = dairy('B-B', { fat_percent: 10, total_sugars_percent: 5, protein_percent: 4, salt_percent: 0.1, carbohydrate_percent: 40 });
    const product = productRow({ product_category: 'dairy', product_name_display: 'P', fat_percent: 10, total_sugars_percent: 5, protein_percent: 4, salt_percent: 0.1, carbohydrate_percent: 7, ...engineReady });
    const r = matchProduct(product, [a, b]);
    expect(r.match_method).toBe('category_composition_similarity');
    expect(r.matched_basement_id).toBe('B-A'); // only A is within threshold; B's carb gap (33) excludes it
    expect(r.candidate_count).toBe(1);
  });

  it('salt contributes to the distance (a large salt gap pushes a row out of range)', () => {
    const b = dairy('B-SALT', { fat_percent: 10, carbohydrate_percent: 5, total_sugars_percent: 5, protein_percent: 4, salt_percent: 0.1 });
    const near = productRow({ product_category: 'dairy', product_name_display: 'P', fat_percent: 10, carbohydrate_percent: 5, total_sugars_percent: 5, protein_percent: 4, salt_percent: 0.3, ...engineReady });
    const far = productRow({ product_category: 'dairy', product_name_display: 'P', fat_percent: 10, carbohydrate_percent: 5, total_sugars_percent: 5, protein_percent: 4, salt_percent: 11, ...engineReady });
    expect(matchProduct(near, [b]).match_method).toBe('category_composition_similarity'); // tiny salt gap → matches
    expect(matchProduct(far, [b]).match_method).toBe('ingredient_type'); // salt gap 10.9 → avg >2 → out
  });
});

describe('matchProduct — same-category macro-twins surface for review, never auto-matched', () => {
  // Composition alone cannot reject a genuine macro-twin inside the same category — the two
  // real false positives sit in the same distance band as true matches. The safety net is:
  // a single composition candidate + a product missing pac/pod → needs_review (never matched).
  // Both were correctly human-rejected from that review queue.
  it('protein chocolate drink vs natural yogurt → needs_review, not matched', () => {
    const yogurt = basementRow({ ingredient_id: 'PI-YOG', ingredient_category: 'dairy', ingredient_name_display: 'Natural Yogurt', fat_percent: 2, carbohydrate_percent: 5.4, total_sugars_percent: 3.6, protein_percent: 4.7, salt_percent: 0.13, pac_value: 1, pod_value: 1 });
    const drink = productRow({ product_category: 'dairy', product_name_display: 'Batido proteinas chocolate', fat_percent: 1, carbohydrate_percent: 6, total_sugars_percent: 4, protein_percent: 9, salt_percent: 0.2 }); // no pac/pod
    const r = matchProduct(drink, [yogurt]);
    expect(r.match_method).toBe('category_composition_similarity');
    expect(r.mapper_status).toBe('needs_review');
    expect(r.mapper_status).not.toBe('matched');
  });

  it('stracciatella yogurt vs condensed milk → needs_review, not matched', () => {
    const condensed = basementRow({ ingredient_id: 'PI-CM', ingredient_category: 'dairy', ingredient_name_display: 'Condensed Milk', fat_percent: 7.5, carbohydrate_percent: 11, total_sugars_percent: 11, protein_percent: 5.5, salt_percent: 0.18, pac_value: 1, pod_value: 1 });
    const yog = productRow({ product_category: 'dairy', product_name_display: 'Yogur griego stracciatella', fat_percent: 9, carbohydrate_percent: 12, total_sugars_percent: 11, protein_percent: 4, salt_percent: 0.1 }); // no pac/pod
    const r = matchProduct(yog, [condensed]);
    expect(r.match_method).toBe('category_composition_similarity');
    expect(r.mapper_status).toBe('needs_review');
    expect(r.mapper_status).not.toBe('matched');
  });
});

describe('matchProduct — confirmed-good cases still produce composition candidates', () => {
  it('cream 35% still finds the cream 30% reference (real values, 5 fields)', () => {
    const cream = basementRow({ ingredient_id: 'PI-CREAM30', ingredient_category: 'dairy', ingredient_name_display: 'Cream 30%', fat_percent: 30, carbohydrate_percent: 3.2, total_sugars_percent: 3.2, protein_percent: 2.3, salt_percent: 0.08, pac_value: 1, pod_value: 1 });
    const product = productRow({ product_category: 'dairy', product_name_display: 'Nata para montar', fat_percent: 35, carbohydrate_percent: 3.1, total_sugars_percent: 3.1, protein_percent: 2, salt_percent: 0.1, ...engineReady });
    const r = matchProduct(product, [cream]); // mean ≈ 1.10 pp
    expect(r.match_method).toBe('category_composition_similarity');
    expect(r.matched_basement_id).toBe('PI-CREAM30');
    expect(r.mapper_status).toBe('matched'); // product engineReady → not downgraded
  });

  it('maltitol chocolate still finds the maltitol chocolate reference (real values, 5 fields)', () => {
    const choc = basementRow({ ingredient_id: 'PI-CHOC', ingredient_category: 'chocolate', ingredient_name_display: 'Chocolate Malchoc', fat_percent: 36.6, carbohydrate_percent: 50.4, total_sugars_percent: 0, protein_percent: 6.8, salt_percent: 0.2, pac_value: 1, pod_value: 1 });
    const product = productRow({ product_category: 'chocolate_cocoa', product_name_display: 'Chocolate 0% azucar', fat_percent: 35, carbohydrate_percent: 48, total_sugars_percent: 1, protein_percent: 8, salt_percent: 0.2, ...engineReady });
    const r = matchProduct(product, [choc]); // mean ≈ 1.24 pp
    expect(r.match_method).toBe('category_composition_similarity');
    expect(r.matched_basement_id).toBe('PI-CHOC');
  });
});

describe('matchProduct — determinism + input immutability', () => {
  const buildBasement = () => [
    basementRow({ ingredient_id: 'B-1', ean_code: '12345678', ingredient_name_display: 'Alpha', pac_value: 1, pod_value: 1 }),
    basementRow({ ingredient_id: 'B-2', ingredient_category: 'dairy', ingredient_name_display: 'Beta', pac_value: 1, pod_value: 1 }),
  ];

  it('is deterministic: same input yields a deeply equal result', () => {
    const product = productRow({ ean_code: '12345678', ...engineReady });
    const basement = buildBasement();
    expect(matchProduct(product, basement)).toEqual(matchProduct(product, basement));
  });

  it('does not mutate the product or the basement array/rows', () => {
    const product = productRow({ product_category: 'dairy', product_name_display: 'Gamma', ...engineReady });
    const basement = buildBasement();
    const productBefore = structuredClone(product);
    const basementBefore = structuredClone(basement);
    Object.freeze(product);
    Object.freeze(basement);
    basement.forEach((row) => Object.freeze(row));
    expect(() => matchProduct(product, basement)).not.toThrow();
    expect(product).toEqual(productBefore);
    expect(basement).toEqual(basementBefore);
  });
});

describe('matchProduct — the pure core never emits the human-only "rejected" value', () => {
  it('no input yields a rejected status or confidence', () => {
    const basement = [
      basementRow({ ingredient_id: 'B-EAN', ean_code: '12345678', pac_value: 1, pod_value: 1 }),
      basementRow({ ingredient_id: 'B-EAN2', ean_code: '12345678', pac_value: 1, pod_value: 1 }),
      basementRow({ ingredient_id: 'B-NAME', ingredient_name_display: 'Whole Milk', verification_status: 'verified', pac_value: 1, pod_value: 1 }),
      basementRow({ ingredient_id: 'B-DAIRY', ingredient_category: 'dairy', pac_value: 1, pod_value: 1 }),
    ];
    const products = [
      productRow({ ean_code: '12345678', ...engineReady }), // ambiguous
      productRow({ product_name_display: 'Whole Milk', ...engineReady }), // matched
      productRow({ brand: 'X', product_name_display: 'Whole Milk' }), // needs_review path
      productRow({ product_name_display: 'zzz nothing here', ...engineReady }), // unmatched
      productRow({ product_category: 'dairy', product_name_display: 'q', ...engineReady }), // ingredient_type
    ];
    for (const p of products) {
      const r = matchProduct(p, basement);
      expect(r.mapper_status).not.toBe('rejected');
      expect(r.match_confidence).not.toBe('rejected');
    }
  });
});

describe('matchProduct — ambiguity beyond EAN + candidate cap', () => {
  it('two rows tying at ingredient_type → ambiguous, never a silent pick', () => {
    const a = basementRow({ ingredient_id: 'B-D1', ingredient_category: 'dairy', ingredient_name_display: 'One', pac_value: 1, pod_value: 1 });
    const b = basementRow({ ingredient_id: 'B-D2', ingredient_category: 'dairy', ingredient_name_display: 'Two', pac_value: 1, pod_value: 1 });
    const r = matchProduct(productRow({ product_category: 'dairy', product_name_display: 'Mystery', ...engineReady }), [a, b]);
    expect(r.mapper_status).toBe('ambiguous');
    expect(r.match_method).toBe('ingredient_type');
    expect(r.matched_basement_id).toBeNull();
    expect(r.candidate_count).toBe(2);
  });

  it('caps candidate_ids at 20 while reporting the true candidate_count', () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      basementRow({ ingredient_id: `B-${i}`, ean_code: '55555555', pac_value: 1, pod_value: 1 }),
    );
    const r = matchProduct(productRow({ ean_code: '55555555', ...engineReady }), rows);
    expect(r.mapper_status).toBe('ambiguous');
    expect(r.candidate_count).toBe(25);
    expect(r.candidate_ids).toHaveLength(20);
  });
});

describe('matchProduct — missing-values review keys on confidence, not on a specific method', () => {
  it('verified exact-name match stays matched/exact when the reference supplies the values', () => {
    // discriminates a mutant gating on match_method==='exact_ean' (would wrongly downgrade this)
    const b = basementRow({ ingredient_id: 'B-V', ingredient_name_display: 'Whole Milk', verification_status: 'verified', pac_value: 1, pod_value: 1 });
    const r = matchProduct(productRow({ product_name_display: 'Whole Milk' }), [b]); // product missing pac/pod
    expect(r.mapper_status).toBe('matched');
    expect(r.match_confidence).toBe('exact');
    expect(r.matched_basement_id).toBe('B-V');
  });

  it('a composition (medium) match with missing product values → needs_review', () => {
    const b = basementRow({ ingredient_id: 'B-C', ingredient_category: 'dairy', fat_percent: 20, carbohydrate_percent: 5, total_sugars_percent: 5, protein_percent: 3, salt_percent: 0.1, pac_value: 1, pod_value: 1 });
    const r = matchProduct(productRow({ product_category: 'dairy', product_name_display: 'X', fat_percent: 20, carbohydrate_percent: 5, total_sugars_percent: 5, protein_percent: 3, salt_percent: 0.1 }), [b]);
    expect(r.match_method).toBe('category_composition_similarity');
    expect(r.mapper_status).toBe('needs_review');
    expect(r.match_confidence).toBe('needs_review');
  });

  it('an exact match whose reference ALSO lacks pac/pod → needs_review (cannot be filled)', () => {
    const b = basementRow({ ingredient_id: 'B-NULL', ean_code: '77777777' }); // reference pac/pod null
    const r = matchProduct(productRow({ ean_code: '77777777' }), [b]); // product pac/pod null
    expect(r.mapper_status).toBe('needs_review');
    expect(r.match_method).toBe('exact_ean');
    expect(r.matched_basement_id).toBe('B-NULL');
    expect(r.needs_review_reason).toMatch(/matched reference also lacks/);
  });
});

describe('matchProduct — blank-field handling', () => {
  it('falls back to product_name_internal when product_name_display is blank/whitespace', () => {
    const b = basementRow({ ingredient_id: 'B-WM', ingredient_name_display: 'Whole Milk', verification_status: 'verified', pac_value: 1, pod_value: 1 });
    const r = matchProduct(productRow({ product_name_display: '   ', product_name_internal: 'Whole Milk', ...engineReady }), [b]);
    expect(r.match_method).toBe('exact_normalized_name');
    expect(r.normalized_name).toBe('whole milk');
    expect(r.matched_basement_id).toBe('B-WM');
  });

  it('treats a whitespace-only category as absent (no bogus "other", no approximate note)', () => {
    const r = matchProduct(productRow({ product_category: '   ', product_name_display: 'x', ...engineReady }), []);
    expect(r.normalized_category).toBeNull();
    expect(r.mapper_notes).toBeNull();
  });
});

describe('matchProduct — result-field coverage (category, notes, barcode, lone ingredient_type)', () => {
  it('a lone same-category row resolves to a single confident ingredient_type match', () => {
    const b = basementRow({ ingredient_id: 'B-ONLY', ingredient_category: 'dairy', ingredient_name_display: 'Some Dairy', pac_value: 1, pod_value: 1 });
    const r = matchProduct(productRow({ product_category: 'dairy', product_name_display: 'Unrelated', ...engineReady }), [b]);
    expect(r.mapper_status).toBe('matched');
    expect(r.match_method).toBe('ingredient_type');
    expect(r.match_confidence).toBe('low');
    expect(r.matched_basement_id).toBe('B-ONLY');
  });

  it('derives normalized_category through mapDatasetCategory (chocolate → chocolate_cocoa), no note when exact', () => {
    const r = matchProduct(productRow({ product_category: 'chocolate', product_name_display: 'no match here', ...engineReady }), []);
    expect(r.normalized_category).toBe('chocolate_cocoa');
    expect(r.mapper_notes).toBeNull();
  });

  it('an approximate category surfaces a note AND never matches via composition/ingredient_type', () => {
    const b = basementRow({ ingredient_id: 'B-COCO', ingredient_category: 'coconut', ingredient_name_display: 'Coconut Milk Powder', water_percent: 3, fat_percent: 65, protein_percent: 6, total_sugars_percent: 8, total_solids_percent: 97, pac_value: 1, pod_value: 1 });
    const r = matchProduct(
      productRow({ product_category: 'coconut', product_name_display: 'Generic Coconut Item', water_percent: 3, fat_percent: 65, protein_percent: 6, total_sugars_percent: 8, total_solids_percent: 97, ...engineReady }),
      [b],
    );
    expect(r.normalized_category).toBe('other');
    expect(r.mapper_notes).toMatch(/category mapping approximate/);
    expect(r.match_method).not.toBe('category_composition_similarity');
    expect(r.match_method).not.toBe('ingredient_type');
  });

  it('honors the barcode field as a second EAN source (leading zeros preserved)', () => {
    const b = basementRow({ ingredient_id: 'B-BAR', ean_code: '0049000028911', pac_value: 1, pod_value: 1 });
    const r = matchProduct(productRow({ barcode: '0049-000 028911', ...engineReady }), [b]);
    expect(r.match_method).toBe('exact_ean');
    expect(r.matched_basement_id).toBe('B-BAR');
  });
});

/* ── purity / boundary guards (static source scan) ─────────────────────────── */

describe('productMatcher — purity & boundaries', () => {
  const SRC_DIR = resolve(import.meta.dirname, '..', '..');
  const read = (...p: string[]) => readFileSync(join(SRC_DIR, ...p), 'utf8');
  // Scan comment-stripped ("executable") text: the header intentionally documents
  // the no-Supabase / no-npac boundary, which must not trip a forbidden-literal scan.
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const MATCHER = stripComments(read('data', 'products', 'productMatcher.ts'));

  it('is pure: no Supabase, no service imports, no engine, no AI/billing, no DB writes', () => {
    expect(/supabase/i.test(MATCHER)).toBe(false);
    expect(/@\/services\//.test(MATCHER)).toBe(false);
    expect(/@\/engine/.test(MATCHER)).toBe(false);
    expect(/\b(openai|stripe)\b/i.test(MATCHER)).toBe(false);
    for (const write of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(MATCHER.includes(write), `matcher must not ${write}`).toBe(false);
    }
  });

  it('contains no npac_value and never coerces unknowns to 0', () => {
    expect(/npac_value/i.test(MATCHER)).toBe(false);
    expect(/\?\?\s*0\b/.test(MATCHER)).toBe(false);
  });

  it('its sole runtime (value) dependency — categoryMapping — is also pure', () => {
    const CATEGORY = stripComments(read('data', 'ingredients', 'categoryMapping.ts'));
    expect(/supabase/i.test(CATEGORY)).toBe(false);
    expect(/@\/services\//.test(CATEGORY)).toBe(false);
    expect(/\b(openai|stripe)\b/i.test(CATEGORY)).toBe(false);
    for (const write of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(CATEGORY.includes(write), `categoryMapping must not ${write}`).toBe(false);
    }
    // its only engine reference is a TYPE-only import (erased at runtime), never a value import.
    expect(/import\s+type\b[^;]*from\s+'@\/engine'/.test(CATEGORY)).toBe(true);
    expect(/import\s+\{[^}]*\}\s+from\s+'@\/engine'/.test(CATEGORY)).toBe(false);
  });

  it('the runtime ingredient service still reads mapper_basement, read-only', () => {
    const INGREDIENTS = read('services', 'ingredients.ts');
    expect(INGREDIENTS.includes("const TABLE = 'mapper_basement'")).toBe(true);
    for (const w of ['.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(INGREDIENTS.includes(w)).toBe(false);
    }
  });

  it('the products service still targets only the products table', () => {
    const PRODUCTS = read('services', 'products.ts');
    expect(/const TABLE = 'products'/.test(PRODUCTS)).toBe(true);
    const code = PRODUCTS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(/mapper_basement/i.test(code)).toBe(false);
  });
});

/* ── name-concept tiebreaker integration (narrow an ambiguous pool by name) ──── */

describe('matchProduct — name tiebreaker over an ambiguous pool', () => {
  // shared composition so >1 candidate pools at category_composition_similarity
  const comp = { fat_percent: 50, carbohydrate_percent: 7, total_sugars_percent: 4, protein_percent: 22, salt_percent: 0.01 };
  const nutRef = (id: string, name: string) => basementRow({ ingredient_id: id, ingredient_category: 'nut', ingredient_name_display: name, pac_value: 1, pod_value: 1, ...comp });

  it('peanut butter narrows to the peanut paste (not hazelnut)', () => {
    const pool = [nutRef('B-PEANUT', 'Peanut Paste'), nutRef('B-HAZELNUT', 'Hazelnut Paste')];
    const r = matchProduct(productRow({ product_category: 'nut', product_name_display: 'Crema de cacahuete Hacendado', ...comp, ...engineReady }), pool);
    expect(r.matched_basement_id).toBe('B-PEANUT');
    expect(r.candidate_count).toBe(2); // pool preserved for audit
    expect(r.mapper_notes).toMatch(/name tiebreaker narrowed/);
  });

  it('pistachio cream narrows to the pistachio reference (not hazelnut)', () => {
    const pool = [nutRef('B-PISTACHIO', 'Pistachio Paste'), nutRef('B-HAZELNUT', 'Hazelnut Paste')];
    const r = matchProduct(productRow({ product_category: 'nut', product_name_display: 'Crema de pistacho', ...comp, ...engineReady }), pool);
    expect(r.matched_basement_id).toBe('B-PISTACHIO');
  });

  it('dark chocolate narrows to the dark chocolate reference (not white)', () => {
    const choc = (id: string, name: string) => basementRow({ ingredient_id: id, ingredient_category: 'chocolate', ingredient_name_display: name, pac_value: 1, pod_value: 1, ...comp });
    const r = matchProduct(productRow({ product_category: 'chocolate', product_name_display: 'Chocolate negro 72% cacao Hacendado', ...comp, ...engineReady }), [choc('B-WHITE', 'White Chocolate'), choc('B-DARK', 'Dark Chocolate 70%')]);
    expect(r.matched_basement_id).toBe('B-DARK');
  });

  it('vanilla sugar narrows to the vanillin sugar reference (not plain sugar)', () => {
    const sug = (id: string, name: string) => basementRow({ ingredient_id: id, ingredient_category: 'sweetener', ingredient_name_display: name, pac_value: 1, pod_value: 1, ...comp });
    const r = matchProduct(productRow({ product_category: 'sweetener', product_name_display: 'Azúcar vainillado Hacendado', ...comp, ...engineReady }), [sug('B-SUGAR', 'Plain Sugar'), sug('B-VANILLIN', 'Vanillin Sugar')]);
    expect(r.matched_basement_id).toBe('B-VANILLIN');
  });

  it('almond product stays ambiguous when NO almond reference exists (no false narrow to hazelnut/peanut)', () => {
    const pool = [nutRef('B-HAZELNUT', 'Hazelnut Paste'), nutRef('B-PEANUT', 'Peanut Paste')];
    const r = matchProduct(productRow({ product_category: 'nut', product_name_display: 'Almendra molida Hacendado', ...comp, ...engineReady }), pool);
    expect(r.mapper_status).toBe('ambiguous');
    expect(r.matched_basement_id).toBeNull();
  });

  it('yogurt does NOT narrow to condensed milk (narrows to the yogurt reference)', () => {
    const dairy = (id: string, name: string) => basementRow({ ingredient_id: id, ingredient_category: 'dairy', ingredient_name_display: name, pac_value: 1, pod_value: 1, ...comp });
    const r = matchProduct(productRow({ product_category: 'dairy', product_name_display: 'Yogur griego natural Hacendado', ...comp, ...engineReady }), [dairy('B-CONDENSED', 'Condensed Milk'), dairy('B-YOGURT', 'Greek Yogurt')]);
    expect(r.matched_basement_id).toBe('B-YOGURT');
    expect(r.matched_basement_id).not.toBe('B-CONDENSED');
  });

  it('protein drink (no recognized concept) stays ambiguous — does not narrow to yogurt', () => {
    const dairy = (id: string, name: string) => basementRow({ ingredient_id: id, ingredient_category: 'dairy', ingredient_name_display: name, pac_value: 1, pod_value: 1, ...comp });
    const r = matchProduct(productRow({ product_category: 'dairy', product_name_display: 'Batido alto en proteínas Hacendado', ...comp, ...engineReady }), [dairy('B-YOGURT', 'Greek Yogurt'), dairy('B-MILK2', 'Skimmed Milk')]);
    expect(r.mapper_status).toBe('ambiguous');
    expect(r.matched_basement_id).toBeNull();
  });

  it('coffee does not false-match when no coffee reference exists in the flavor pool', () => {
    const flavor = (id: string, name: string) => basementRow({ ingredient_id: id, ingredient_category: 'flavor', ingredient_name_display: name, pac_value: 1, pod_value: 1, ...comp });
    const r = matchProduct(productRow({ product_category: 'flavor', product_name_display: 'Café molido natural Hacendado', ...comp, ...engineReady }), [flavor('B-VANILLA', 'Vanilla Paste'), flavor('B-HAZELNUT-F', 'Hazelnut Paste')]);
    expect(r.mapper_status).toBe('ambiguous');
    expect(r.matched_basement_id).toBeNull();
  });
});

/* ── coffee special-case pool (coffee_tea refs, name-gated on BOTH sides) ────── */

describe('matchProduct — coffee special-case pool', () => {
  const coffeeTea = (id: string, name: string, comp: Partial<IngredientRow> = {}) =>
    basementRow({ ingredient_id: id, ingredient_category: 'coffee_tea', ingredient_name_display: name, pac_value: 1, pod_value: 1, fat_percent: 15.4, carbohydrate_percent: 42.9, total_sugars_percent: 0, protein_percent: 12.4, salt_percent: 0.2, ...comp });
  // mirrors the live basement: real roasted-ground coffee, instant coffee, the cereal "Grain
  // Coffee" SUBSTITUTE (carb 79!), and two teas that must never pool with coffee products.
  const ground = coffeeTea('B-GROUND', 'Coffee Bean Roasted Ground — Standard');
  const instant = coffeeTea('B-INSTANT', 'Coffee Instant Powder — Standard', { fat_percent: 1.7, carbohydrate_percent: 45.5, total_sugars_percent: 6.5, protein_percent: 16.5, salt_percent: 0.102 });
  const grainSub = coffeeTea('B-GRAIN-SUB', 'Grain Coffee — Standard', { fat_percent: 0.2, carbohydrate_percent: 79, total_sugars_percent: 12, protein_percent: 4.8, salt_percent: 0.19 });
  const tea = coffeeTea('B-TEA', 'Matcha Tea — Standard');
  const vanilla = basementRow({ ingredient_id: 'B-VANILLA-P', ingredient_category: 'flavor_paste', ingredient_name_display: 'Vanilla Paste Pi-Nuts', pac_value: 1, pod_value: 1 });
  const pool = [vanilla, grainSub, ground, instant, tea];
  const flavorProduct = (name: string) => productRow({ product_category: 'flavor', product_name_display: name, ...engineReady });

  it('ground coffee (molido/espresso/mezcla) reaches the coffee refs and narrows to roasted-ground', () => {
    for (const name of ['Café molido natural Hacendado', 'Café molido natural Hacendado Espresso', 'Café molido mezcla Hacendado Espresso']) {
      const r = matchProduct(flavorProduct(name), pool);
      expect(r.matched_basement_id, name).toBe('B-GROUND');
      expect(r.mapper_notes, name).toMatch(/coffee special-case pool/);
      expect(r.candidate_ids, name).not.toContain('B-TEA');
    }
  });

  it('bean coffee (grano) REACHES the coffee refs but does NOT narrow — never onto the grain substitute', () => {
    for (const name of ['Café en grano natural Hacendado', 'Café en grano extra fuerte Hacendado']) {
      const r = matchProduct(flavorProduct(name), pool);
      expect(r.mapper_status, name).toBe('ambiguous');
      expect(r.matched_basement_id, name).toBeNull();
      expect(r.candidate_ids, name).toEqual(expect.arrayContaining(['B-GRAIN-SUB', 'B-GROUND', 'B-INSTANT']));
      expect(r.candidate_ids, name).not.toContain('B-TEA');
      // the coffee refs rank above the non-coffee flavor paste
      expect(r.candidate_ids!.indexOf('B-VANILLA-P'), name).toBeGreaterThan(r.candidate_ids!.indexOf('B-GROUND'));
    }
  });

  it('vanilla aroma and generic flavor products never reach the coffee refs', () => {
    for (const name of ['Aroma de vainilla Hacendado bote', 'Pasta saborizante genérica']) {
      const r = matchProduct(flavorProduct(name), pool);
      for (const id of ['B-GROUND', 'B-INSTANT', 'B-GRAIN-SUB', 'B-TEA']) {
        expect(r.candidate_ids ?? [], `${name} → ${id}`).not.toContain(id);
      }
    }
  });

  it('a real coffee product (zeros composition, no pac/pod) becomes a needs_review SUGGESTION, never an auto-match', () => {
    const real = productRow({
      product_category: 'flavor', product_name_display: 'Café molido natural Hacendado',
      fat_percent: 0, carbohydrate_percent: 0, total_sugars_percent: 0, protein_percent: 0, salt_percent: 0,
    });
    const r = matchProduct(real, pool);
    expect(r.mapper_status).toBe('needs_review');
    expect(r.matched_basement_id).toBe('B-GROUND');
    expect(r.missing_fields).toEqual(['pac_value', 'pod_value']);
  });
});
