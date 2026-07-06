import { describe, expect, it } from 'vitest';
import { designRecipe } from './designRecipe';
import { normalizeRecipeIntent } from './normalizeRecipeIntent';
import { CHOCOLATE_CORRECTION_FAMILIES, DAIRY_CORRECTION_FAMILIES } from './productProfiles';
import type { NormalizedRecipeIntent, ProductProfile, QualityTier } from './types';

/** Fresh, fully-isolated intent for direct designer tests. */
const intentFor = (
  overrides: Partial<NormalizedRecipeIntent> = {},
): NormalizedRecipeIntent => ({
  productProfile: 'standard_gelato',
  qualityTier: 'classic',
  servingTemperatureC: -12,
  texturePreference: 'medium',
  sweetnessPreference: 'balanced',
  costPriority: 'balanced',
  flavorGroup: 'unknown',
  flavorTags: [],
  naturalOnly: false,
  allowBoosters: true,
  dietary: {
    vegan: false,
    lactoseFree: false,
    glutenFree: false,
    allergenAware: false,
    noAddedSugar: false,
    lowSugar: false,
    alcohol: false,
  },
  constraints: {
    excludedIngredientIds: [],
    lockedIngredientIds: [],
    heroIngredientIds: [],
    batchSizeG: null,
    machineCapacityG: null,
  },
  source: 'user_input',
  warnings: [],
  contractVersion: '1.0.0',
  ...overrides,
});

const collectLeaves = (value: unknown): unknown[] =>
  value !== null && typeof value === 'object'
    ? Object.values(value as Record<string, unknown>).flatMap(collectLeaves)
    : [value];

const collectKeys = (value: unknown): string[] =>
  value !== null && typeof value === 'object'
    ? Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [k, ...collectKeys(v)])
    : [];

describe('designRecipe — core (pure, deterministic, strategy-only)', () => {
  it('is deterministic and does not mutate its input', () => {
    const intent = normalizeRecipeIntent({ input: { flavorText: 'czekoladowe', qualityTier: 'premium' } });
    const snapshot = JSON.stringify(intent);
    expect(designRecipe(intent)).toEqual(designRecipe(intent));
    expect(JSON.stringify(intent)).toBe(snapshot);
  });

  it('returns contractVersion 1.0.0', () => {
    expect(designRecipe(intentFor()).contractVersion).toBe('1.0.0');
  });

  it('never calculates chemistry — no numeric values and no POD/PAC/NPAC/gram fields in the plan', () => {
    for (const profile of ['standard_gelato', 'sorbet', 'vegan_gelato', 'chocolate_gelato'] as const) {
      const plan = designRecipe(intentFor({ productProfile: profile }));
      expect(collectLeaves(plan).some((leaf) => typeof leaf === 'number'), profile).toBe(false);
      const keys = collectKeys(plan).map((k) => k.toLowerCase());
      expect(keys.some((k) => /(^|_)(pod|pac|npac)($|_)|gram/.test(k)), profile).toBe(false);
    }
  });

  it('copies warnings and families — never shares references with the intent or registry', () => {
    const intent = normalizeRecipeIntent({ input: { flavorText: 'chocolate sorbet' } });
    const plan = designRecipe(intent);
    expect(plan.warnings).not.toBe(intent.warnings);
    expect(plan.warnings[0]).not.toBe(intent.warnings[0]);
    expect(plan.warnings).toEqual(intent.warnings);
    const again = designRecipe(intent);
    expect(plan.allowedIngredientFamilies).not.toBe(again.allowedIngredientFamilies);
  });
});

describe('designRecipe — designer profile mapping (registry-owned)', () => {
  it.each([
    ['standard_gelato', 'gelato_designer'],
    ['sorbet', 'sorbet_designer'],
    ['vegan_gelato', 'vegan_designer'],
    ['chocolate_gelato', 'chocolate_designer'],
  ] as const)('%s -> %s', (profile, designer) => {
    expect(designRecipe(intentFor({ productProfile: profile })).designerProfile).toBe(designer);
  });
});

describe('designRecipe — product-specific ingredient families', () => {
  it('standard gelato allows dairy families', () => {
    const plan = designRecipe(intentFor({ productProfile: 'standard_gelato' }));
    for (const family of DAIRY_CORRECTION_FAMILIES) {
      expect(plan.allowedIngredientFamilies).toContain(family);
    }
  });

  it('sorbet forbids dairy families', () => {
    const plan = designRecipe(intentFor({ productProfile: 'sorbet' }));
    for (const family of DAIRY_CORRECTION_FAMILIES) {
      expect(plan.allowedIngredientFamilies).not.toContain(family);
      expect(plan.forbiddenIngredientFamilies).toContain(family);
    }
  });

  it('vegan forbids dairy families', () => {
    const plan = designRecipe(intentFor({ productProfile: 'vegan_gelato' }));
    for (const family of DAIRY_CORRECTION_FAMILIES) {
      expect(plan.allowedIngredientFamilies).not.toContain(family);
      expect(plan.forbiddenIngredientFamilies).toContain(family);
    }
  });

  it('chocolate allows the chocolate/cocoa families and marks them as hero families', () => {
    const plan = designRecipe(intentFor({ productProfile: 'chocolate_gelato' }));
    for (const family of CHOCOLATE_CORRECTION_FAMILIES) {
      expect(plan.allowedIngredientFamilies).toContain(family);
      expect(plan.ingredientStrategy.heroFamilies).toContain(family);
    }
  });

  it('vegan chocolate stays vegan and never gains dairy families (end-to-end pure chain)', () => {
    const intent = normalizeRecipeIntent({ input: { flavorText: 'vegan chocolate' } });
    const plan = designRecipe(intent);
    expect(plan.productProfile).toBe('vegan_gelato');
    expect(plan.designerProfile).toBe('vegan_designer');
    expect(plan.flavorStrategy.flavorGroup).toBe('chocolate');
    for (const family of DAIRY_CORRECTION_FAMILIES) {
      expect(plan.allowedIngredientFamilies).not.toContain(family);
    }
  });
});

describe('designRecipe — gates carried from the Product Profile Registry', () => {
  it('sorbet constraints carry the disabled dairy gates', () => {
    const { disabledGates } = designRecipe(intentFor({ productProfile: 'sorbet' })).optimizerConstraints;
    for (const gate of ['lactose', 'lactose_sanding', 'dairy_fat_logic', 'aerating_dairy_protein', 'dairy_protein_share_in_solids', 'msnf_required_gate']) {
      expect(disabledGates).toContain(gate);
    }
  });

  it('vegan constraints carry the disabled dairy-only gates', () => {
    const { disabledGates } = designRecipe(intentFor({ productProfile: 'vegan_gelato' })).optimizerConstraints;
    for (const gate of ['lactose', 'lactose_sanding', 'aerating_dairy_protein', 'dairy_protein_share_in_solids', 'msnf_required_gate']) {
      expect(disabledGates).toContain(gate);
    }
  });

  it('chocolate constraints carry protein share as advisory, never a standard hard gate', () => {
    const { advisoryGates, disabledGates } = designRecipe(
      intentFor({ productProfile: 'chocolate_gelato' }),
    ).optimizerConstraints;
    expect(advisoryGates).toContain('protein_share_in_solids');
    expect(disabledGates).not.toContain('protein_share_in_solids');
    const standard = designRecipe(intentFor({ productProfile: 'standard_gelato' })).optimizerConstraints;
    expect(standard.advisoryGates).not.toContain('protein_share_in_solids');
  });

  it('stabilizerRequired is true for every active profile', () => {
    for (const profile of ['standard_gelato', 'sorbet', 'vegan_gelato', 'chocolate_gelato'] as const) {
      const plan = designRecipe(intentFor({ productProfile: profile }));
      expect(plan.optimizerConstraints.stabilizerRequired, profile).toBe(true);
      expect(plan.ingredientStrategy.stabilizerRequired, profile).toBe(true);
    }
  });
});

describe('designRecipe — quality strategy', () => {
  const heroIntent = (tier: QualityTier, profile: ProductProfile = 'standard_gelato') =>
    intentFor({ productProfile: profile, qualityTier: tier, flavorGroup: 'fruit', flavorTags: ['strawberry'] });

  it('eco is a low-cost strategy with boosters off by default', () => {
    const plan = designRecipe(heroIntent('eco'));
    expect(plan.qualityStrategy.costPosture).toBe('low_cost');
    expect(plan.qualityStrategy.heroIntensity).toBe('low');
    expect(plan.qualityStrategy.boostersPermitted).toBe(false); // even though allowBoosters=true
    expect(plan.ingredientStrategy.boosterPolicy).toBe('forbidden');
  });

  it('classic is the balanced commercial default', () => {
    const plan = designRecipe(heroIntent('classic'));
    expect(plan.qualityStrategy.costPosture).toBe('balanced');
    expect(plan.qualityStrategy.heroIntensity).toBe('standard');
    expect(plan.heroIngredientPolicy.reductionPolicy).toBe('allowed_with_warning');
  });

  it('premium protects the hero ingredient', () => {
    const plan = designRecipe(heroIntent('premium'));
    expect(plan.heroIngredientPolicy.protectHeroIngredient).toBe(true);
    expect(plan.heroIngredientPolicy.reductionPolicy).toBe('forbidden');
    expect(plan.qualityStrategy.heroIntensity).toBe('raised');
  });

  it('signature strongly protects the hero and is not blind max grams', () => {
    const plan = designRecipe(heroIntent('signature'));
    expect(plan.heroIngredientPolicy.protectHeroIngredient).toBe(true);
    expect(plan.heroIngredientPolicy.reductionPolicy).toBe('forbidden');
    expect(plan.heroIngredientPolicy.minimumRelativeLevel).toBe('maximum');
    expect(plan.qualityStrategy.strategyNotes.join(' ')).toMatch(/NOT blind maximum/);
  });

  it('naturalOnly / allowBoosters=false forbid boosters at any tier', () => {
    const naturalOnly = normalizeRecipeIntent({ input: { naturalOnly: true, qualityTier: 'signature' } });
    expect(designRecipe(naturalOnly).ingredientStrategy.boosterPolicy).toBe('forbidden');
    expect(designRecipe(naturalOnly).qualityStrategy.boostersPermitted).toBe(false);

    const noBoosters = designRecipe(intentFor({ qualityTier: 'signature', allowBoosters: false }));
    expect(noBoosters.ingredientStrategy.boosterPolicy).toBe('forbidden');
  });
});

describe('designRecipe — hero ingredient policy from flavor', () => {
  it.each([
    ['czekoladowe', 'chocolate'],
    ['truskawkowe', 'strawberry'],
    ['pistacjowe', 'pistachio'],
    ['kawowe', 'coffee'],
  ])('%s creates the %s hero', (flavorText, hero) => {
    const plan = designRecipe(normalizeRecipeIntent({ input: { flavorText } }));
    expect(plan.heroIngredientPolicy.heroFlavor).toBe(hero);
  });

  it('unknown flavor creates no hero and nothing to protect', () => {
    const plan = designRecipe(intentFor());
    expect(plan.heroIngredientPolicy.heroFlavor).toBeNull();
    expect(plan.heroIngredientPolicy.protectHeroIngredient).toBe(false);
    expect(plan.heroIngredientPolicy.reductionPolicy).toBe('allowed');
  });

  it('alcohol flavor is treated as a technical constraint, not a blindly protected hero', () => {
    const plan = designRecipe(normalizeRecipeIntent({ input: { flavorText: 'rum', qualityTier: 'premium' } }));
    expect(plan.heroIngredientPolicy.notes.join(' ')).toMatch(/technical constraint/);
  });
});

describe('designRecipe — texture and sweetness target intents (labels only)', () => {
  it.each([
    ['firm', 'lower_safe_side'],
    ['medium', 'clean_center'],
    ['soft', 'upper_safe_side'],
  ] as const)('texture %s -> %s', (texture, target) => {
    expect(designRecipe(intentFor({ texturePreference: texture })).textureTarget).toBe(target);
  });

  it.each([
    ['low', 'lower_product_safe_side'],
    ['balanced', 'product_clean_center'],
    ['high', 'upper_product_safe_side'],
  ] as const)('sweetness %s -> %s', (sweetness, target) => {
    expect(designRecipe(intentFor({ sweetnessPreference: sweetness })).sweetnessTarget).toBe(target);
  });
});

describe('designRecipe — warning propagation', () => {
  it('preserves the chocolate-sorbet conflict warning', () => {
    const plan = designRecipe(normalizeRecipeIntent({ input: { flavorText: 'chocolate sorbet' } }));
    expect(plan.warnings.map((w) => w.code)).toContain('flavor_product_profile_conflict');
  });

  it('keeps unsupported granita/protein intent warnings visible', () => {
    const granita = designRecipe(normalizeRecipeIntent({ input: { productProfile: 'granita' } }));
    expect(granita.warnings.map((w) => w.code)).toContain('granita_unsupported_v1');

    const protein = designRecipe(normalizeRecipeIntent({ input: { flavorText: 'proteinowe' } }));
    expect(protein.warnings.map((w) => w.code)).toContain('unsupported_product_profile');
  });
});
