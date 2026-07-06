/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KEFIR_ANCHOR_MAX_MEAN_PP,
  MILK_SERIES_MIN_ANCHORS,
  SAME_CLASS_ANCHOR_MAX_MEAN_PP,
  resolveProductIntelligence,
  type ResolverInput,
  type ResolverProductInput,
  type ResolverReferenceInput,
} from './productIntelligenceResolver';

/* ── synthetic fixtures (test values, NOT real calibration data) ───────────── */

const liquidMilk16: ResolverReferenceInput = {
  ingredient_id: 'PI-TEST-MILK-16',
  ingredient_name_display: 'Milk 1.5 % — Standard',
  fat_percent: 1.6,
  carbohydrate_percent: 4.8,
  total_sugars_percent: 4.9,
  protein_percent: 3.4,
  salt_percent: 0.11,
  pac_value: 30,
  pod_value: 25,
};

const liquidMilk36: ResolverReferenceInput = {
  ingredient_id: 'PI-TEST-MILK-36',
  ingredient_name_display: 'Milk 3,5% — Standard',
  fat_percent: 3.6,
  carbohydrate_percent: 4.7,
  total_sugars_percent: 4.7,
  protein_percent: 3.3,
  salt_percent: 0.1,
  pac_value: 26,
  pod_value: 24,
};

const milkPowder: ResolverReferenceInput = {
  ingredient_id: 'PI-TEST-MILK-POWDER',
  ingredient_name_display: 'Skimmed Milk Powder — Standard',
  fat_percent: 0.8,
  carbohydrate_percent: 52,
  total_sugars_percent: 52,
  protein_percent: 34,
  salt_percent: 1,
  pac_value: 99,
  pod_value: 40,
};

const yogurtAnchor: ResolverReferenceInput = {
  ingredient_id: 'PI-TEST-YOGURT',
  ingredient_name_display: 'Natural Yogurt — Standard',
  fat_percent: 2.8,
  carbohydrate_percent: 4.6,
  total_sugars_percent: 4.4,
  protein_percent: 3.6,
  salt_percent: 0.1,
  pac_value: 6.1,
  pod_value: 3.4,
};

const greekAnchor: ResolverReferenceInput = {
  ingredient_id: 'PI-TEST-GREEK',
  ingredient_name_display: 'Greek Yogurt — Standard',
  fat_percent: 7.5,
  carbohydrate_percent: 4.7,
  total_sugars_percent: 4.7,
  protein_percent: 4.5,
  salt_percent: 0.12,
  pac_value: 7.2,
  pod_value: 4.1,
};

const condensedMilk: ResolverReferenceInput = {
  ingredient_id: 'PI-TEST-CONDENSED',
  ingredient_name_display: 'Condensed Milk — Standard',
  fat_percent: 3.1,
  carbohydrate_percent: 4.6,
  total_sugars_percent: 4.4,
  protein_percent: 3.5,
  salt_percent: 0.1,
  pac_value: 44,
  pod_value: 30,
};

const peanutPaste: ResolverReferenceInput = {
  ingredient_id: 'PI-TEST-PEANUT',
  ingredient_name_display: 'Peanut Paste — Standard',
  fat_percent: 50.1,
  carbohydrate_percent: 13.4,
  total_sugars_percent: 4.1,
  protein_percent: 23.5,
  salt_percent: 0.41,
  pac_value: 8.1,
  pod_value: 7.4,
};

const skimMilkProduct: ResolverProductInput = {
  product_name_display: 'Leche desnatada Hacendado',
  product_category: 'dairy',
  fat_percent: 0.3,
  carbohydrate_percent: 4.8,
  total_sugars_percent: 4.8,
  protein_percent: 3.2,
  salt_percent: 0.13,
  mapper_status: 'unmatched',
};

const run = (
  product: ResolverProductInput,
  candidateReferences: ResolverReferenceInput[] = [],
  matchedReference: ResolverReferenceInput | null = null,
) => resolveProductIntelligence({ product, candidateReferences, matchedReference } satisfies ResolverInput);

/* ── reference_linked ──────────────────────────────────────────────────────── */

describe('resolveProductIntelligence — reference_linked (existing behavior preserved)', () => {
  const matched: ResolverProductInput = {
    product_name_display: 'Nata 35% Hacendado',
    mapper_status: 'matched',
    matched_basement_id: 'PI-TEST-CREAM',
  };
  const creamRef: ResolverReferenceInput = {
    ingredient_id: 'PI-TEST-CREAM',
    ingredient_name_display: 'Cream 35% — Standard',
    pac_value: 5.2,
    pod_value: 2.1,
  };

  it('a confirmed match resolves reference_linked and engine-ready', () => {
    const result = run(matched, [], creamRef);
    expect(result.outcome).toBe('reference_linked');
    expect(result.value_basis).toBe('reference_linked');
    expect(result.engine_ready).toBe(true);
    expect(result.rule_id).toBe('reference_link');
    expect(result.basis_reference_ids).toEqual(['PI-TEST-CREAM']);
    expect(result.derived).toBeNull(); // linked, never derived
    expect(result.recommended_status).toBe('pi_generated'); // existing status policy, unchanged
  });

  it('matched but the reference lacks pac/pod → reference_linked yet NOT engine-ready', () => {
    const result = run(matched, [], { ...creamRef, pac_value: null });
    expect(result.outcome).toBe('reference_linked');
    expect(result.engine_ready).toBe(false);
    expect(result.confidence).toBe('low');
    expect(result.warnings.join(' ')).toMatch(/not engine-ready/i);
  });
});

/* ── milk fat series ───────────────────────────────────────────────────────── */

describe('resolveProductIntelligence — milk fat-series rule (R1)', () => {
  it('skim milk with two calibrated liquid anchors → pi_calculated with EXTRAPOLATED values', () => {
    const result = run(skimMilkProduct, [liquidMilk16, liquidMilk36]);
    expect(result.outcome).toBe('pi_calculated');
    expect(result.value_basis).toBe('class_derived');
    expect(result.rule_id).toBe('milk_fat_series_v1');
    expect(result.engine_ready).toBe(true);
    expect(result.recommended_status).toBe('pi_calculated');
    // linear over (1.6→30, 3.6→26): slope −2/pp → at 0.3: 30 + (0.3−1.6)·(−2) = 32.6
    expect(result.derived).toEqual({ pac_value: 32.6, pod_value: 25.65, method: 'linear_fat_interpolation' });
    expect(result.basis_reference_ids.sort()).toEqual(['PI-TEST-MILK-16', 'PI-TEST-MILK-36']);
    expect(result.confidence).toBe('low'); // extrapolated below the anchor range
    expect(result.warnings.join(' ')).toMatch(/OUTSIDE the anchor fat range/);
    expect(result.warnings.join(' ')).toMatch(/never written to the product/);
  });

  it('a label fat inside the anchor range interpolates with medium confidence', () => {
    const semi: ResolverProductInput = { ...skimMilkProduct, product_name_display: 'Leche semidesnatada', fat_percent: 2.6 };
    const result = run(semi, [liquidMilk16, liquidMilk36]);
    expect(result.outcome).toBe('pi_calculated');
    expect(result.confidence).toBe('medium');
    // midpoint of 1.6..3.6 → pac 28, pod 24.5
    expect(result.derived).toEqual({ pac_value: 28, pod_value: 24.5, method: 'linear_fat_interpolation' });
  });

  it(`fewer than ${MILK_SERIES_MIN_ANCHORS} distinct liquid anchors → blocked, never guessed`, () => {
    const result = run(skimMilkProduct, [liquidMilk16]);
    expect(result.outcome).toBe('blocked');
    expect(result.blocked_class).toBe('no_safe_class_rule');
    expect(result.blocked_reason).toMatch(/at least 2 calibrated liquid-milk anchors/);
    expect(result.derived).toBeNull();
  });

  it('milk POWDER references are never fat-series anchors', () => {
    const result = run(skimMilkProduct, [liquidMilk16, liquidMilk36, milkPowder]);
    expect(result.outcome).toBe('pi_calculated');
    expect(result.basis_reference_ids).not.toContain('PI-TEST-MILK-POWDER');
  });

  it('missing label fat blocks the milk rule with the exact reason', () => {
    const noFat: ResolverProductInput = { ...skimMilkProduct, fat_percent: null };
    const result = run(noFat, [liquidMilk16, liquidMilk36]);
    expect(result.outcome).toBe('blocked');
    expect(result.blocked_reason).toMatch(/label fat_percent/);
  });
});

/* ── yogurt / greek / kefir ────────────────────────────────────────────────── */

describe('resolveProductIntelligence — cultured dairy rules (R2–R4)', () => {
  const plainYogurt: ResolverProductInput = {
    product_name_display: 'Yogur natural Hacendado',
    product_category: 'dairy',
    fat_percent: 3,
    carbohydrate_percent: 4.5,
    total_sugars_percent: 4.5,
    protein_percent: 3.5,
    salt_percent: 0.1,
    mapper_status: 'unmatched',
  };

  it('plain yogurt with a same-class yogurt anchor → pi_calculated (adopted values + provenance)', () => {
    const result = run(plainYogurt, [yogurtAnchor, condensedMilk]);
    expect(result.outcome).toBe('pi_calculated');
    expect(result.rule_id).toBe('plain_yogurt_class_anchor_v1');
    expect(result.derived).toEqual({ pac_value: 6.1, pod_value: 3.4, method: 'class_anchor_adoption' });
    expect(result.basis_reference_ids).toEqual(['PI-TEST-YOGURT']);
    expect(result.confidence).toBe('medium');
    expect(result.warnings.join(' ')).toMatch(/never PI Verified without independent provenance/);
  });

  it('yogurt is NEVER anchored to condensed milk (numeric twin, wrong class)', () => {
    const result = run(plainYogurt, [condensedMilk]); // 0-distance twin but not yogurt-named
    expect(result.outcome).toBe('blocked');
    expect(result.blocked_class).toBe('no_safe_class_rule');
    expect(result.blocked_reason).toMatch(/never yogurt anchors/);
  });

  it(`a yogurt anchor beyond ${SAME_CLASS_ANCHOR_MAX_MEAN_PP} pp mean distance is refused`, () => {
    const farYogurt: ResolverReferenceInput = { ...yogurtAnchor, fat_percent: 9, protein_percent: 9 };
    const result = run(plainYogurt, [farYogurt]);
    expect(result.outcome).toBe('blocked');
    expect(result.blocked_reason).toMatch(/pp away/);
  });

  it('greek yogurt adopts the greek anchor with a fat-variant warning — never PI Verified', () => {
    const greekProduct: ResolverProductInput = {
      ...plainYogurt,
      product_name_display: 'Yogur griego natural Hacendado',
      fat_percent: 10,
      protein_percent: 4,
      carbohydrate_percent: 4,
      total_sugars_percent: 4,
    };
    const result = run(greekProduct, [greekAnchor, yogurtAnchor]);
    expect(result.outcome).toBe('pi_calculated');
    expect(result.rule_id).toBe('greek_yogurt_fat_variant_v1');
    expect(result.basis_reference_ids).toEqual(['PI-TEST-GREEK']);
    expect(result.recommended_status).toBe('pi_calculated');
    expect(result.recommended_status).not.toBe('pi_verified');
    expect(result.warnings.join(' ')).toMatch(/dedicated basement fat-variant later/);
  });

  it('kefir adopts a close fermented-dairy anchor WITH the mandatory fermentation warning', () => {
    const kefirProduct: ResolverProductInput = {
      product_name_display: 'Kéfir natural Hacendado',
      product_category: 'dairy',
      fat_percent: 4.2,
      carbohydrate_percent: 5.1,
      total_sugars_percent: 2.3,
      protein_percent: 3.9,
      salt_percent: 0.08,
      mapper_status: 'unmatched',
    };
    const closeYogurt: ResolverReferenceInput = {
      ...yogurtAnchor,
      fat_percent: 3.5,
      carbohydrate_percent: 5,
      total_sugars_percent: 2.7,
      protein_percent: 4,
      salt_percent: 0.1,
    };
    const result = run(kefirProduct, [closeYogurt]);
    expect(result.outcome).toBe('pi_calculated');
    expect(result.rule_id).toBe('kefir_fermented_dairy_v1');
    expect(result.confidence).toBe('low');
    expect(result.warnings.join(' ')).toMatch(/FERMENTATION WARNING/);
  });

  it(`kefir beyond ${KEFIR_ANCHOR_MAX_MEAN_PP} pp is blocked instead`, () => {
    const kefirProduct: ResolverProductInput = {
      product_name_display: 'Kéfir natural',
      fat_percent: 4.2,
      carbohydrate_percent: 5.1,
      total_sugars_percent: 2.3,
      protein_percent: 3.9,
      salt_percent: 0.08,
    };
    const result = run(kefirProduct, [yogurtAnchor]); // sugars Δ2.1 alone pushes the mean over 0.75
    expect(result.outcome).toBe('blocked');
    expect(result.blocked_class).toBe('no_safe_class_rule');
  });
});

/* ── label staging (pi_generated) ──────────────────────────────────────────── */

describe('resolveProductIntelligence — species-exact label staging (R6)', () => {
  const almond: ResolverProductInput = {
    product_name_display: 'Almendra molida 100% Hacendado',
    product_category: 'nut',
    fat_percent: 53,
    carbohydrate_percent: 7,
    total_sugars_percent: 4.5,
    protein_percent: 22,
    salt_percent: 0.01,
    mapper_status: 'unmatched',
  };

  it('almond with a complete label → pi_generated, NOT engine-ready, no values invented', () => {
    const result = run(almond, []);
    expect(result.outcome).toBe('pi_generated');
    expect(result.value_basis).toBe('label_derived');
    expect(result.engine_ready).toBe(false);
    expect(result.derived).toBeNull(); // pac/pod never guessed from the label
    expect(result.recommended_status).toBe('draft'); // ≠ the legacy pi_generated STATUS (reference-linked)
    expect(result.warnings.join(' ')).toMatch(/owner calibration/i);
  });

  it('cross-species references are never adopted for a nut (peanut ≠ almond)', () => {
    const result = run(almond, [peanutPaste]);
    expect(result.outcome).toBe('pi_generated');
    expect(result.basis_reference_ids).toEqual([]);
    expect(result.derived).toBeNull();
  });

  it('an incomplete label cannot stage a profile', () => {
    const thin: ResolverProductInput = { ...almond, carbohydrate_percent: null, salt_percent: null };
    const result = run(thin, []);
    expect(result.outcome).toBe('blocked');
    expect(result.blocked_reason).toMatch(/at least 4 of 5 composition fields/);
  });
});

/* ── hard-blocked classes ──────────────────────────────────────────────────── */

describe('resolveProductIntelligence — hard-blocked classes stay blocked', () => {
  const cases: Array<[string, ResolverProductInput, string]> = [
    ['lactose-free milk', { product_name_display: 'Leche semidesnatada sin lactosa', fat_percent: 1.55 }, 'lactose_free_dairy'],
    ['erythritol', { product_name_display: 'Eritritol granulado' }, 'sweetener_or_polyol'],
    ['maltitol', { product_name_display: 'Maltitol en polvo' }, 'sweetener_or_polyol'],
    ['stevia', { product_name_display: 'Edulcorante de stevia' }, 'sweetener_or_polyol'],
    ['sucralose', { product_name_display: 'Sucralosa líquida' }, 'sweetener_or_polyol'],
    ['saccharin', { product_name_display: 'Sacarina en sobres' }, 'sweetener_or_polyol'],
    ['protein product', { product_name_display: 'Batido +Proteínas chocolate' }, 'protein_fortified'],
    ['jam / composite', { product_name_display: 'Mermelada de fresa' }, 'composite_or_blend'],
    ['cocoa a la taza composite', { product_name_display: 'Cacao en polvo a la taza' }, 'composite_or_blend'],
    ['torrefacto coffee', { product_name_display: 'Café molido torrefacto' }, 'torrefacto_coffee'],
    ['vanilla aroma (proprietary blend)', { product_name_display: 'Aroma de vainilla' }, 'composite_or_blend'],
  ];

  it.each(cases)('%s → blocked', (_label, product, blockedClass) => {
    const result = run(product, [liquidMilk16, liquidMilk36, yogurtAnchor]);
    expect(result.outcome).toBe('blocked');
    expect(result.blocked_class).toBe(blockedClass);
    expect(result.engine_ready).toBe(false);
    expect(result.derived).toBeNull();
    expect(result.recommended_status).toBe('draft');
    expect(result.blocked_reason).not.toBeNull();
  });

  it('lactose-free stays blocked even with a perfect-twin milk candidate available', () => {
    const result = run(
      { product_name_display: 'Leche sin lactosa', fat_percent: 1.55, carbohydrate_percent: 4.7, total_sugars_percent: 4.7, protein_percent: 3.2, salt_percent: 0.13 },
      [liquidMilk16, liquidMilk36],
    );
    expect(result.outcome).toBe('blocked');
    expect(result.blocked_class).toBe('lactose_free_dairy');
  });

  it('the sugar-free-claim cocoa powder stays red-flag blocked (PI Generation goes via the proposal path)', () => {
    const cocoa: ResolverProductInput = {
      product_name_display: 'Cacao puro en polvo 0% azúcares añadidos',
      fat_percent: 14,
      carbohydrate_percent: 16,
      total_sugars_percent: 2,
      protein_percent: 21,
      salt_percent: 0.1,
    };
    const result = run(cocoa, []);
    expect(result.outcome).toBe('blocked');
    expect(result.blocked_class).toBe('red_flagged_label');
  });

  it('vanilla paste (no aroma word) has no rule yet — blocked as no_safe_class_rule, not composite', () => {
    const result = run({ product_name_display: 'Pasta de vainilla' }, []);
    expect(result.outcome).toBe('blocked');
    expect(result.blocked_class).toBe('no_safe_class_rule');
  });
});

/* ── adversarial-review regressions (all findings verified REAL, all fixed) ── */

describe('resolveProductIntelligence — review regressions: cross-class hijack (critical)', () => {
  const kefirComposition = {
    fat_percent: 4.2,
    carbohydrate_percent: 5.1,
    total_sugars_percent: 2.3,
    protein_percent: 3.9,
    salt_percent: 0.08,
  };
  const closeYogurt: ResolverReferenceInput = {
    ...yogurtAnchor,
    fat_percent: 3.5,
    carbohydrate_percent: 5,
    total_sugars_percent: 2.7,
    protein_percent: 4,
    salt_percent: 0.1,
  };

  it('a kefir that MENTIONS its milk takes the kefir rule, never the milk fat series', () => {
    const result = run(
      { product_name_display: 'Kéfir elaborado con leche entera', ...kefirComposition },
      [liquidMilk16, liquidMilk36, closeYogurt],
    );
    expect(result.rule_id).toBe('kefir_fermented_dairy_v1');
    expect(result.warnings.join(' ')).toMatch(/FERMENTATION WARNING/);
    expect(result.basis_reference_ids).not.toContain('PI-TEST-MILK-16');
  });

  it('a yogurt that mentions its milk takes the yogurt rule, never the milk fat series', () => {
    const plainComposition = {
      fat_percent: 3,
      carbohydrate_percent: 4.5,
      total_sugars_percent: 4.5,
      protein_percent: 3.5,
      salt_percent: 0.1,
    };
    const result = run(
      { product_name_display: 'Yogur natural elaborado con leche desnatada', ...plainComposition },
      [liquidMilk16, liquidMilk36, yogurtAnchor],
    );
    expect(result.rule_id).toBe('plain_yogurt_class_anchor_v1');
    expect(result.basis_reference_ids).toEqual(['PI-TEST-YOGURT']);
  });

  it('a greek yogurt that mentions whole milk never takes the milk rule', () => {
    const result = run(
      { product_name_display: 'Yogur griego elaborado con leche entera', fat_percent: 10, carbohydrate_percent: 4, total_sugars_percent: 4, protein_percent: 4, salt_percent: 0.1 },
      [liquidMilk16, liquidMilk36, greekAnchor],
    );
    expect(result.rule_id).toBe('greek_yogurt_fat_variant_v1');
  });

  it('a coffee drink naming its milk never interpolates milk values', () => {
    const result = run(
      { product_name_display: 'Café con leche desnatada', fat_percent: 0.4, carbohydrate_percent: 5, total_sugars_percent: 5, protein_percent: 3, salt_percent: 0.1 },
      [liquidMilk16, liquidMilk36],
    );
    expect(result.outcome).toBe('blocked');
    expect(result.blocked_class).toBe('no_safe_class_rule');
    expect(result.derived).toBeNull();
  });
});

describe('resolveProductIntelligence — review regressions: milk-form + composition guards (major)', () => {
  it('powdered milk never interpolates as liquid milk (product side)', () => {
    const result = run(
      { product_name_display: 'Leche desnatada en polvo', fat_percent: 0.8, carbohydrate_percent: 52, total_sugars_percent: 52, protein_percent: 34, salt_percent: 1 },
      [liquidMilk16, liquidMilk36],
    );
    expect(result.outcome).toBe('blocked');
    expect(result.blocked_reason).toMatch(/Powdered \/ condensed \/ evaporated/);
  });

  it('condensed milk never interpolates as liquid milk', () => {
    const result = run(
      { product_name_display: 'Leche condensada desnatada', fat_percent: 0.4, carbohydrate_percent: 60, total_sugars_percent: 60, protein_percent: 8, salt_percent: 0.3 },
      [liquidMilk16, liquidMilk36],
    );
    expect(result.outcome).toBe('blocked');
    expect(result.derived).toBeNull();
  });

  it('a milk-named product whose composition is far from the liquid-milk family is refused', () => {
    // "evaporada" is caught by the form tokens; this stresses the composition-proximity guard
    // with a clean name but a non-milk composition.
    const result = run(
      { product_name_display: 'Leche entera especial', fat_percent: 3.4, carbohydrate_percent: 12, total_sugars_percent: 11, protein_percent: 6.5, salt_percent: 0.4 },
      [liquidMilk16, liquidMilk36],
    );
    expect(result.outcome).toBe('blocked');
    expect(result.blocked_reason).toMatch(/not the liquid-milk class/);
  });

  it('evaporated milk is refused by the form tokens', () => {
    const result = run(
      { product_name_display: 'Leche evaporada entera', fat_percent: 7.5, carbohydrate_percent: 10, total_sugars_percent: 10, protein_percent: 6.8, salt_percent: 0.2 },
      [liquidMilk16, liquidMilk36],
    );
    expect(result.outcome).toBe('blocked');
  });

  it('extrapolation beyond the 1.5 pp fat margin is refused (no runaway values ever)', () => {
    // composition sits INSIDE the milk family, only the fat is below the margin (0.05 < 1.6 − 1.5)
    const result = run(
      { product_name_display: 'Leche desnatada ultra ligera', fat_percent: 0.05, carbohydrate_percent: 4.8, total_sugars_percent: 4.8, protein_percent: 3.2, salt_percent: 0.13 },
      [liquidMilk16, liquidMilk36],
    );
    expect(result.outcome).toBe('blocked');
    expect(result.blocked_reason).toMatch(/extrapolation refused/);
  });

  it('an extreme-fat "milk" fails the composition-proximity guard (never interpolated)', () => {
    const result = run(
      { product_name_display: 'Leche entera extra grasa', fat_percent: 35, carbohydrate_percent: 4.7, total_sugars_percent: 4.7, protein_percent: 3.3, salt_percent: 0.1 },
      [liquidMilk16, liquidMilk36],
    );
    expect(result.outcome).toBe('blocked');
    expect(result.blocked_reason).toMatch(/not the liquid-milk class/);
  });
});

describe('resolveProductIntelligence — review regressions: lactose + vocabulary escapes (critical/major)', () => {
  it.each(['Leche entera deslactosada', 'Lactofree leche entera', 'Leche sinlactosa entera'])(
    '%s is hard-blocked as lactose-free dairy',
    (name) => {
      const result = run(
        { product_name_display: name, fat_percent: 3.6, carbohydrate_percent: 4.7, total_sugars_percent: 4.7, protein_percent: 3.2, salt_percent: 0.13 },
        [liquidMilk16, liquidMilk36],
      );
      expect(result.outcome).toBe('blocked');
      expect(result.blocked_class).toBe('lactose_free_dairy');
    },
  );

  it('lactose-free-named ANCHORS are never adopted by a regular product', () => {
    const lactoseFreeAnchor: ResolverReferenceInput = {
      ...yogurtAnchor,
      ingredient_id: 'PI-TEST-YOGURT-SL',
      ingredient_name_display: 'Yogur natural sin lactosa',
      fat_percent: 3,
      carbohydrate_percent: 4.5,
      total_sugars_percent: 4.5,
      protein_percent: 3.5,
      salt_percent: 0.1,
    };
    const result = run(
      { product_name_display: 'Yogur natural Hacendado', fat_percent: 3, carbohydrate_percent: 4.5, total_sugars_percent: 4.5, protein_percent: 3.5, salt_percent: 0.1 },
      [lactoseFreeAnchor], // 0-distance twin, but a hydrolysed-lactose variant
    );
    expect(result.outcome).toBe('blocked');
    expect(result.basis_reference_ids).toEqual([]);
  });

  it('greek anchors must be yogurts — a greek-named non-yogurt is never adopted', () => {
    const greekDessert: ResolverReferenceInput = {
      ...greekAnchor,
      ingredient_id: 'PI-TEST-GREEK-DESSERT',
      ingredient_name_display: 'Greek Style Dessert Base',
    };
    const result = run(
      { product_name_display: 'Yogur griego natural', fat_percent: 10, carbohydrate_percent: 4, total_sugars_percent: 4, protein_percent: 4, salt_percent: 0.1 },
      [greekDessert],
    );
    expect(result.outcome).toBe('blocked');
  });

  it('powdered kefir base mixes are never kefir anchors', () => {
    const kefirPowder: ResolverReferenceInput = {
      ingredient_id: 'PI-TEST-KEFIR-POWDER',
      ingredient_name_display: 'Sprint Kefir Powdered Ice Cream Mix',
      fat_percent: 4.2,
      carbohydrate_percent: 5.1,
      total_sugars_percent: 2.3,
      protein_percent: 3.9,
      salt_percent: 0.08,
      pac_value: 88,
      pod_value: 33,
    };
    const result = run(
      { product_name_display: 'Kéfir natural', fat_percent: 4.2, carbohydrate_percent: 5.1, total_sugars_percent: 2.3, protein_percent: 3.9, salt_percent: 0.08 },
      [kefirPowder],
    );
    expect(result.outcome).toBe('blocked');
  });

  it.each([
    ['Greek yogurt sweetened with erythritol', 'sweetener_or_polyol'],
    ['Yogur griego con xylitol', 'sweetener_or_polyol'],
    ['Greek Protein Yogurt', 'protein_fortified'],
    ['Yogur líquido +prote', 'protein_fortified'],
  ])('%s is hard-blocked by the extended EN vocabulary screen', (name, blockedClass) => {
    const result = run(
      { product_name_display: name, fat_percent: 5, carbohydrate_percent: 4.7, total_sugars_percent: 4.7, protein_percent: 4.5, salt_percent: 0.12 },
      [greekAnchor, yogurtAnchor],
    );
    expect(result.outcome).toBe('blocked');
    expect(result.blocked_class).toBe(blockedClass);
  });

  it('E-number sweetener codes in the detected text are hard-blocked', () => {
    const result = run(
      {
        product_name_display: 'Yogur natural',
        detected_text: 'ingredientes: leche, fermentos, E968, E955',
        fat_percent: 3,
        carbohydrate_percent: 4.5,
        total_sugars_percent: 4.5,
        protein_percent: 3.5,
        salt_percent: 0.1,
      },
      [yogurtAnchor],
    );
    expect(result.outcome).toBe('blocked');
    expect(result.blocked_class).toBe('sweetener_or_polyol');
  });
});

describe('resolveProductIntelligence — review regressions: provenance truthfulness (minor)', () => {
  it('a matched RED-FLAGGED product keeps its mapping but downgrades confidence and surfaces the flags', () => {
    const result = run(
      { product_name_display: 'Leche semidesnatada sin lactosa', mapper_status: 'matched', matched_basement_id: 'PI-TEST-MILK-16' },
      [],
      liquidMilk16,
    );
    expect(result.outcome).toBe('reference_linked'); // human-confirmed mapping stands (documented exception)
    expect(result.confidence).toBe('medium'); // downgraded from high
    expect(result.warnings.join(' ')).toMatch(/Risk signal \(confidence downgraded, human-confirmed mapping stands\)/);
    expect(result.warnings.join(' ')).toMatch(/hydrolysed-lactose spelling/);
  });

  it('a matched product with OWN measured pac/pod is labelled product_measured with no reference credit', () => {
    const result = run(
      { product_name_display: 'Nata 35%', mapper_status: 'matched', matched_basement_id: 'PI-TEST-CREAM', pac_value: 5.0, pod_value: 2.0 },
      [],
      null, // reference not even needed — own measurement wins
    );
    expect(result.outcome).toBe('reference_linked');
    expect(result.value_basis).toBe('product_measured');
    expect(result.rule_id).toBe('product_measured');
    expect(result.basis_reference_ids).toEqual([]);
    expect(result.engine_ready).toBe(true);
  });

  it('an UNMATCHED product with OWN measured pac/pod wins over class derivation', () => {
    const result = run(
      { ...skimMilkProduct, pac_value: 31, pod_value: 25 },
      [liquidMilk16, liquidMilk36],
    );
    expect(result.outcome).toBe('pi_calculated');
    expect(result.value_basis).toBe('product_measured');
    expect(result.derived).toBeNull(); // measured, not derived
    expect(result.engine_ready).toBe(true);
    expect(result.recommended_status).toBe('draft'); // status needs a confirmed mapping flow
  });

  it('the greek fat-variant warning states the actual fats instead of a false "leaner" claim', () => {
    const lighterGreek = run(
      { product_name_display: 'Yogur griego ligero', fat_percent: 5, carbohydrate_percent: 4.7, total_sugars_percent: 4.7, protein_percent: 4.5, salt_percent: 0.12 },
      [greekAnchor], // anchor fat 7.5 is FATTER than the 5% label
    );
    expect(lighterGreek.outcome).toBe('pi_calculated');
    expect(lighterGreek.warnings.join(' ')).toMatch(/anchor fat 7\.5% vs label fat 5%/);
    expect(lighterGreek.warnings.join(' ')).not.toMatch(/leaner/);
  });
});

/* ── purity + determinism ──────────────────────────────────────────────────── */

describe('resolveProductIntelligence — purity, determinism, no persistence anywhere', () => {
  it('is deterministic and never mutates its input', () => {
    const input: ResolverInput = {
      product: { ...skimMilkProduct },
      candidateReferences: [liquidMilk16, liquidMilk36],
    };
    const snapshot = JSON.stringify(input);
    expect(resolveProductIntelligence(input)).toEqual(resolveProductIntelligence(input));
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('module source has no DB client, no services, no writes, no IO, no nondeterminism', () => {
    const src = readFileSync(join(resolve(import.meta.dirname), 'productIntelligenceResolver.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(/supabase|service_role/i.test(src)).toBe(false);
    expect(/@\/services\//.test(src)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(src.includes(verb), verb).toBe(false);
    }
    expect(/fetch\s*\(|XMLHttpRequest|localStorage/.test(src)).toBe(false);
    expect(/process\.env|import\.meta\.env/.test(src)).toBe(false);
    expect(/Math\.random|Date\.now|new Date\(/.test(src)).toBe(false);
    expect(/npac/i.test(src)).toBe(false);
  });

  it('derived values exist ONLY on the in-memory resolution object (never a patch/write shape)', () => {
    const result = run(skimMilkProduct, [liquidMilk16, liquidMilk36]);
    // the resolution carries no products-table write fields — structural check
    expect(Object.keys(result)).not.toContain('pac_value');
    expect(Object.keys(result)).not.toContain('pod_value');
    expect(result.derived).not.toBeNull();
  });
});
