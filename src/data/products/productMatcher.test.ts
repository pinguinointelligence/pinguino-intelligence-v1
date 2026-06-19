/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { ProductRow } from '@/data/products/productRow';
import { canonicalEan, matchProduct, normalizeName } from './productMatcher';

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
    const cream = basementRow({ ingredient_id: 'B-CREAM', ingredient_category: 'dairy', ingredient_name_display: 'Cream 30%', water_percent: 64, fat_percent: 30, protein_percent: 2.3, total_sugars_percent: 3.2, total_solids_percent: 36, pac_value: 1, pod_value: 1 });
    const r = matchProduct(
      productRow({ product_category: 'dairy', product_name_display: 'Generic Cream', water_percent: 64.5, fat_percent: 30.2, protein_percent: 2.4, total_sugars_percent: 3, total_solids_percent: 36.1, ...engineReady }),
      [cream],
    );
    expect(r.match_method).toBe('category_composition_similarity');
    expect(r.match_confidence).toBe('medium');
    expect(r.matched_basement_id).toBe('B-CREAM');
  });

  it('ingredient-type fallback when composition is too far → low', () => {
    const smp = basementRow({ ingredient_id: 'B-SMP', ingredient_category: 'dairy', ingredient_name_display: 'Skimmed Milk Powder', water_percent: 3, fat_percent: 1, protein_percent: 35, total_sugars_percent: 52, total_solids_percent: 96, pac_value: 1, pod_value: 1 });
    const r = matchProduct(
      productRow({ product_category: 'dairy', product_name_display: 'Mystery Dairy Item', water_percent: 80, fat_percent: 5, protein_percent: 3, total_sugars_percent: 5, total_solids_percent: 20, ...engineReady }),
      [smp],
    );
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

  it('3 shared fields at avg distance exactly 2 → composition match (pins THRESHOLD low side)', () => {
    const b = dairy({ water_percent: 10, fat_percent: 20, protein_percent: 30 }); // diffs 2,2,2 → avg 2.0
    const r = matchProduct(
      productRow({ product_category: 'dairy', product_name_display: 'C', water_percent: 12, fat_percent: 22, protein_percent: 32, ...engineReady }),
      [b],
    );
    expect(r.match_method).toBe('category_composition_similarity');
    expect(r.match_confidence).toBe('medium');
  });

  it('3 shared fields at avg distance just over 2 → falls through (pins THRESHOLD high side)', () => {
    const b = dairy({ water_percent: 10, fat_percent: 20, protein_percent: 30 }); // diffs 2,2,3 → avg 2.33
    const r = matchProduct(
      productRow({ product_category: 'dairy', product_name_display: 'C', water_percent: 12, fat_percent: 22, protein_percent: 33, ...engineReady }),
      [b],
    );
    expect(r.match_method).toBe('ingredient_type');
  });

  it('only 2 shared fields, even a perfect match, is rejected (pins MIN_SHARED=3)', () => {
    const b = dairy({ water_percent: 10, fat_percent: 20 }); // protein/sugars/solids null
    const r = matchProduct(
      productRow({ product_category: 'dairy', product_name_display: 'C', water_percent: 10, fat_percent: 20, ...engineReady }),
      [b],
    );
    expect(r.match_method).toBe('ingredient_type');
  });

  it('only fields present in BOTH rows count — non-shared fields never contribute as 0', () => {
    // shared water/fat/protein (diffs 1,1,1 → avg 1). product sugars=999 (basement null) and
    // basement solids=999 (product null) must be IGNORED; if coerced to 0 the avg would blow up.
    const b = dairy({ water_percent: 11, fat_percent: 21, protein_percent: 31, total_solids_percent: 999 });
    const r = matchProduct(
      productRow({ product_category: 'dairy', product_name_display: 'C', water_percent: 10, fat_percent: 20, protein_percent: 30, total_sugars_percent: 999, ...engineReady }),
      [b],
    );
    expect(r.match_method).toBe('category_composition_similarity');
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
    const b = basementRow({ ingredient_id: 'B-C', ingredient_category: 'dairy', water_percent: 10, fat_percent: 20, protein_percent: 30, pac_value: 1, pod_value: 1 });
    const r = matchProduct(productRow({ product_category: 'dairy', product_name_display: 'X', water_percent: 10, fat_percent: 20, protein_percent: 30 }), [b]);
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
