import { describe, expect, it } from 'vitest';
import { DEFAULT_RECIPE_INTENT, normalizeRecipeIntent } from './normalizeRecipeIntent';
import type { RawRecipeIntentInput, SavedRecipePreferences } from './types';

const codes = (result: { warnings: { code: string }[] }) => result.warnings.map((w) => w.code);

const SAVED: SavedRecipePreferences = {
  userId: 'user-1',
  defaultProductProfile: 'sorbet',
  defaultQualityTier: 'premium',
  defaultServingTemperatureC: -13,
  defaultTexturePreference: 'soft',
  defaultSweetnessPreference: 'low',
  defaultCostPriority: 'premium',
  naturalOnly: true,
  allowBoosters: false,
  excludedIngredientIds: ['ing-x'],
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
};

describe('normalizeRecipeIntent — system defaults (locked §8)', () => {
  it('empty input returns the safe locked defaults', () => {
    const result = normalizeRecipeIntent({});
    expect(result.productProfile).toBe('standard_gelato');
    expect(result.qualityTier).toBe('classic');
    expect(result.servingTemperatureC).toBe(-12);
    expect(result.texturePreference).toBe('medium');
    expect(result.sweetnessPreference).toBe('balanced');
    expect(result.costPriority).toBe('balanced');
    expect(result.flavorGroup).toBe('unknown');
    expect(result.flavorTags).toEqual([]);
    expect(result.naturalOnly).toBe(false);
    expect(result.allowBoosters).toBe(true);
    expect(result.dietary).toEqual(DEFAULT_RECIPE_INTENT.dietary);
    expect(result.constraints).toEqual(DEFAULT_RECIPE_INTENT.constraints);
    expect(result.contractVersion).toBe('1.0.0');
    expect(result.source).toBe('fallback');
    expect(codes(result)).toEqual(['fallback_default_used']);
  });

  it('never shares mutable arrays/objects with DEFAULT_RECIPE_INTENT', () => {
    const result = normalizeRecipeIntent({});
    expect(result.flavorTags).not.toBe(DEFAULT_RECIPE_INTENT.flavorTags);
    expect(result.dietary).not.toBe(DEFAULT_RECIPE_INTENT.dietary);
    expect(result.constraints).not.toBe(DEFAULT_RECIPE_INTENT.constraints);
    expect(result.constraints.excludedIngredientIds).not.toBe(
      DEFAULT_RECIPE_INTENT.constraints.excludedIngredientIds,
    );
  });

  it('is pure and deterministic and does not mutate its input', () => {
    const input: RawRecipeIntentInput = { flavorText: 'czekoladowe', qualityTier: 'premium' };
    const snapshot = JSON.stringify(input);
    expect(normalizeRecipeIntent({ input })).toEqual(normalizeRecipeIntent({ input }));
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('normalizeRecipeIntent — saved defaults precedence', () => {
  it('saved defaults apply when explicit input is missing', () => {
    const result = normalizeRecipeIntent({ savedDefaults: SAVED });
    expect(result.productProfile).toBe('sorbet');
    expect(result.qualityTier).toBe('premium');
    expect(result.servingTemperatureC).toBe(-13);
    expect(result.texturePreference).toBe('soft');
    expect(result.sweetnessPreference).toBe('low');
    expect(result.costPriority).toBe('premium');
    expect(result.naturalOnly).toBe(true);
    expect(result.allowBoosters).toBe(false);
    expect(result.constraints.excludedIngredientIds).toEqual(['ing-x']);
    expect(result.source).toBe('saved_defaults');
    expect(codes(result)).toContain('saved_default_used');
    expect(codes(result)).not.toContain('fallback_default_used');
  });

  it('explicit input overrides saved defaults', () => {
    const result = normalizeRecipeIntent({
      input: { productProfile: 'gelato', qualityTier: 'eco', servingTemperatureC: -11 },
      savedDefaults: SAVED,
    });
    expect(result.productProfile).toBe('standard_gelato');
    expect(result.qualityTier).toBe('eco');
    expect(result.servingTemperatureC).toBe(-11);
    expect(result.source).toBe('user_input');
  });

  it('saved defaults never suppress warnings from explicit invalid input', () => {
    const result = normalizeRecipeIntent({
      input: { qualityTier: 'ultra', servingTemperatureC: -18 },
      savedDefaults: SAVED,
    });
    expect(result.qualityTier).toBe('premium'); // saved fallback
    expect(result.servingTemperatureC).toBe(-13); // saved fallback
    expect(codes(result)).toContain('invalid_quality_tier');
    expect(codes(result)).toContain('invalid_serving_temperature');
    expect(codes(result)).toContain('saved_default_used');
  });

  it('saved defaults never override explicit vegan/sorbet/chocolate intent', () => {
    const vegan = normalizeRecipeIntent({ input: { flavorText: 'vegan chocolate' }, savedDefaults: SAVED });
    expect(vegan.productProfile).toBe('vegan_gelato');

    const chocolate = normalizeRecipeIntent({ input: { productProfile: 'chocolate' }, savedDefaults: SAVED });
    expect(chocolate.productProfile).toBe('chocolate_gelato');
  });
});

describe('normalizeRecipeIntent — product profile normalization', () => {
  it.each([
    ['gelato', 'standard_gelato'],
    ['milk_gelato', 'standard_gelato'],
    ['fruit_gelato', 'standard_gelato'],
    ['vegan', 'vegan_gelato'],
    ['chocolate', 'chocolate_gelato'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeRecipeIntent({ input: { productProfile: raw } }).productProfile).toBe(expected);
  });

  it('legacy aliases carry the legacy_profile_normalized info warning', () => {
    expect(codes(normalizeRecipeIntent({ input: { productProfile: 'gelato' } }))).toContain(
      'legacy_profile_normalized',
    );
  });

  it('granita warns with granita_unsupported_v1 and never silently activates', () => {
    const result = normalizeRecipeIntent({ input: { productProfile: 'granita' } });
    expect(codes(result)).toContain('granita_unsupported_v1');
    expect(result.productProfile).toBe('standard_gelato'); // safe fallback VALUE, flagged above
  });

  it('protein_gelato warns as unsupported and is not implemented as active', () => {
    const result = normalizeRecipeIntent({ input: { productProfile: 'protein_gelato' } });
    expect(codes(result)).toContain('unsupported_product_profile');
    expect(result.productProfile).toBe('standard_gelato');
  });

  it('protein wording in flavor text is recognized as unsupported intent only', () => {
    for (const text of ['proteinowe', 'high protein', 'białkowe', 'więcej proteiny']) {
      const result = normalizeRecipeIntent({ input: { flavorText: text } });
      expect(codes(result), text).toContain('unsupported_product_profile');
      expect(result.productProfile, text).toBe('standard_gelato');
    }
  });

  it('unknown profile strings warn and fall back — never silently mapped', () => {
    const result = normalizeRecipeIntent({ input: { productProfile: 'mystery' } });
    expect(codes(result)).toContain('unsupported_product_profile');
    expect(result.productProfile).toBe('standard_gelato');
  });

  it('accepts the legacy productType/category fields as profile sources', () => {
    expect(normalizeRecipeIntent({ input: { productType: 'sorbet' } }).productProfile).toBe('sorbet');
    expect(normalizeRecipeIntent({ input: { category: 'milk_gelato' } }).productProfile).toBe(
      'standard_gelato',
    );
  });
});

describe('normalizeRecipeIntent — flavor parsing + locked safe routing', () => {
  it('czekoladowe routes to chocolate_gelato with profile_forced_by_flavor', () => {
    const result = normalizeRecipeIntent({ input: { flavorText: 'czekoladowe' } });
    expect(result.productProfile).toBe('chocolate_gelato');
    expect(result.flavorGroup).toBe('chocolate');
    expect(result.flavorTags).toContain('chocolate');
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'profile_forced_by_flavor', severity: 'info' }),
    );
  });

  it('dark chocolate gelato routes to chocolate_gelato', () => {
    const result = normalizeRecipeIntent({ input: { flavorText: 'dark chocolate gelato' } });
    expect(result.productProfile).toBe('chocolate_gelato');
    expect(result.flavorGroup).toBe('chocolate');
  });

  it('explicit standard gelato with chocolate flavor still routes to chocolate_gelato', () => {
    const result = normalizeRecipeIntent({
      input: { productProfile: 'standard_gelato', flavorText: 'chocolate' },
    });
    expect(result.productProfile).toBe('chocolate_gelato');
    expect(codes(result)).toContain('profile_forced_by_flavor');
  });

  it('vegan chocolate stays vegan_gelato with chocolate flavor — never dairy chocolate', () => {
    for (const input of [
      { productProfile: 'vegan', flavorText: 'chocolate' },
      { flavorText: 'vegan chocolate' },
      { flavorText: 'wegańskie czekoladowe' },
    ]) {
      const result = normalizeRecipeIntent({ input });
      expect(result.productProfile, JSON.stringify(input)).toBe('vegan_gelato');
      expect(result.flavorGroup).toBe('chocolate');
      expect(result.dietary.vegan).toBe(true);
      expect(codes(result)).not.toContain('profile_forced_by_flavor');
    }
  });

  it('chocolate sorbet stays sorbet with a conflict warning', () => {
    for (const input of [
      { productProfile: 'sorbet', flavorText: 'chocolate' },
      { flavorText: 'chocolate sorbet' },
    ]) {
      const result = normalizeRecipeIntent({ input });
      expect(result.productProfile, JSON.stringify(input)).toBe('sorbet');
      expect(result.flavorGroup).toBe('chocolate');
      expect(codes(result)).toContain('flavor_product_profile_conflict');
    }
  });

  it('fruit does not automatically mean sorbet', () => {
    const strawberry = normalizeRecipeIntent({ input: { flavorText: 'truskawkowe' } });
    expect(strawberry.productProfile).toBe('standard_gelato');
    expect(strawberry.flavorGroup).toBe('fruit');
    expect(strawberry.flavorTags).toContain('strawberry');

    const mangoSorbet = normalizeRecipeIntent({ input: { flavorText: 'mango sorbet' } });
    expect(mangoSorbet.productProfile).toBe('sorbet');
    expect(mangoSorbet.flavorGroup).toBe('fruit');
    expect(mangoSorbet.flavorTags).toContain('mango');

    const veganMango = normalizeRecipeIntent({ input: { flavorText: 'vegan mango' } });
    expect(veganMango.productProfile).toBe('vegan_gelato');
    expect(veganMango.flavorGroup).toBe('fruit');
  });

  it('pistacjowe is standard_gelato + nut', () => {
    const result = normalizeRecipeIntent({ input: { flavorText: 'pistacjowe' } });
    expect(result.productProfile).toBe('standard_gelato');
    expect(result.flavorGroup).toBe('nut');
    expect(result.flavorTags).toContain('pistachio');
  });

  it('waniliowe maps to the vanilla/neutral group', () => {
    const result = normalizeRecipeIntent({ input: { flavorText: 'waniliowe' } });
    expect(['vanilla', 'neutral']).toContain(result.flavorGroup);
    expect(result.productProfile).toBe('standard_gelato');
  });

  it('coffee terms map to the coffee group without rerouting the profile', () => {
    const result = normalizeRecipeIntent({ input: { flavorText: 'kawowe' } });
    expect(result.flavorGroup).toBe('coffee');
    expect(result.productProfile).toBe('standard_gelato');
  });

  it('alcohol terms set flavorGroup alcohol and dietary.alcohol true', () => {
    for (const text of ['rum', 'whisky', 'likier']) {
      const result = normalizeRecipeIntent({ input: { flavorText: text } });
      expect(result.flavorGroup, text).toBe('alcohol');
      expect(result.dietary.alcohol, text).toBe(true);
    }
  });

  it('alcohol words inside another flavor keep the stronger group but still flag dietary.alcohol', () => {
    const result = normalizeRecipeIntent({ input: { flavorText: 'chocolate rum' } });
    expect(result.flavorGroup).toBe('chocolate');
    expect(result.dietary.alcohol).toBe(true);
  });

  it('unknown flavor stays unknown and invents nothing', () => {
    const result = normalizeRecipeIntent({ input: { flavorText: 'zupa pomidorowa' } });
    expect(result.flavorGroup).toBe('unknown');
    expect(result.flavorTags).toEqual([]);
    expect(result.productProfile).toBe('standard_gelato');
  });

  it('word boundaries prevent false friends (coconut is not a nut match)', () => {
    const result = normalizeRecipeIntent({ input: { flavorText: 'coconut' } });
    expect(result.flavorGroup).toBe('unknown');
  });

  it('preserves the raw flavor text on the output', () => {
    expect(normalizeRecipeIntent({ input: { flavorText: 'Mango Sorbet' } }).flavorText).toBe(
      'Mango Sorbet',
    );
    expect(normalizeRecipeIntent({ input: { flavor: 'czekolada' } }).flavorText).toBe('czekolada');
  });
});

describe('normalizeRecipeIntent — preference aliases', () => {
  it.each([
    ['twarde', 'firm'],
    ['hard', 'firm'],
    ['średnie', 'medium'],
    ['normal', 'medium'],
    ['miękkie', 'soft'],
    ['creamy', 'soft'],
  ])('texture %s -> %s', (raw, expected) => {
    expect(normalizeRecipeIntent({ input: { texturePreference: raw } }).texturePreference).toBe(expected);
  });

  it.each([
    ['mało słodkie', 'low'],
    ['malo slodkie', 'low'],
    ['słodkie', 'balanced'],
    ['normal', 'balanced'],
    ['bardzo słodkie', 'high'],
    ['sweet', 'high'],
  ])('sweetness %s -> %s', (raw, expected) => {
    expect(normalizeRecipeIntent({ input: { sweetnessPreference: raw } }).sweetnessPreference).toBe(
      expected,
    );
  });

  it.each([
    ['cheap', 'low'],
    ['tanie', 'low'],
    ['quality', 'premium'],
    ['premium', 'premium'],
    ['normal', 'balanced'],
  ])('cost priority %s -> %s', (raw, expected) => {
    expect(normalizeRecipeIntent({ input: { costPriority: raw } }).costPriority).toBe(expected);
  });

  it('quality tier accepts the four locked tiers via qualityTier or legacy mode', () => {
    expect(normalizeRecipeIntent({ input: { qualityTier: 'signature' } }).qualityTier).toBe('signature');
    expect(normalizeRecipeIntent({ input: { mode: 'eco' } }).qualityTier).toBe('eco');
  });

  it('invalid preference values fall back with their specific warnings', () => {
    const result = normalizeRecipeIntent({
      input: {
        qualityTier: 'ultra',
        texturePreference: 'crunchy',
        sweetnessPreference: 'extreme',
        costPriority: 'free',
      },
    });
    expect(result.qualityTier).toBe('classic');
    expect(result.texturePreference).toBe('medium');
    expect(result.sweetnessPreference).toBe('balanced');
    expect(result.costPriority).toBe('balanced');
    for (const code of [
      'invalid_quality_tier',
      'invalid_texture_preference',
      'invalid_sweetness_preference',
      'invalid_cost_priority',
    ]) {
      expect(codes(result)).toContain(code);
    }
  });
});

describe('normalizeRecipeIntent — serving temperature', () => {
  it.each([-11, -12, -13])('%d is accepted', (temp) => {
    const result = normalizeRecipeIntent({ input: { servingTemperatureC: temp } });
    expect(result.servingTemperatureC).toBe(temp);
    expect(codes(result)).not.toContain('invalid_serving_temperature');
  });

  it('-18 warns and falls back to -12 without saved defaults', () => {
    const result = normalizeRecipeIntent({ input: { servingTemperatureC: -18 } });
    expect(result.servingTemperatureC).toBe(-12);
    expect(codes(result)).toContain('invalid_serving_temperature');
  });

  it('invalid temperature falls back to the saved default when available', () => {
    const result = normalizeRecipeIntent({
      input: { servingTemperatureC: -18 },
      savedDefaults: SAVED,
    });
    expect(result.servingTemperatureC).toBe(-13);
    expect(codes(result)).toContain('invalid_serving_temperature');
  });

  it('accepts the legacy targetTemperatureC field', () => {
    expect(normalizeRecipeIntent({ input: { targetTemperatureC: -11 } }).servingTemperatureC).toBe(-11);
  });
});

describe('normalizeRecipeIntent — naturalOnly / boosters / dietary / constraints', () => {
  it('naturalOnly disables boosters unless explicit current input says otherwise', () => {
    expect(normalizeRecipeIntent({ input: { naturalOnly: true } }).allowBoosters).toBe(false);
    const overridden = normalizeRecipeIntent({ input: { naturalOnly: true, allowBoosters: true } });
    expect(overridden.naturalOnly).toBe(true);
    expect(overridden.allowBoosters).toBe(true);
  });

  it('explicit allowBoosters false is respected', () => {
    expect(normalizeRecipeIntent({ input: { allowBoosters: false } }).allowBoosters).toBe(false);
  });

  it('explicit dietary.vegan forces vegan_gelato unless sorbet is explicit', () => {
    expect(normalizeRecipeIntent({ input: { dietary: { vegan: true } } }).productProfile).toBe(
      'vegan_gelato',
    );
    const sorbet = normalizeRecipeIntent({
      input: { productProfile: 'sorbet', dietary: { vegan: true } },
    });
    expect(sorbet.productProfile).toBe('sorbet');
    expect(sorbet.dietary.vegan).toBe(true);
  });

  it('lactose-free wording sets dietary.lactoseFree without implying vegan', () => {
    const result = normalizeRecipeIntent({ input: { flavorText: 'truskawkowe bez laktozy' } });
    expect(result.dietary.lactoseFree).toBe(true);
    expect(result.dietary.vegan).toBe(false);
    expect(result.productProfile).toBe('standard_gelato');
  });

  it('normalizes batch and capacity grams honestly (positive finite or null)', () => {
    const result = normalizeRecipeIntent({
      input: { batchSizeG: 5000, machineCapacityG: Number.NaN },
    });
    expect(result.constraints.batchSizeG).toBe(5000);
    expect(result.constraints.machineCapacityG).toBeNull();
    expect(normalizeRecipeIntent({ input: { batchSizeG: -1 } }).constraints.batchSizeG).toBeNull();
  });

  it('carries locked/hero/excluded ingredient ids from explicit input', () => {
    const result = normalizeRecipeIntent({
      input: {
        excludedIngredientIds: ['a'],
        lockedIngredientIds: ['b'],
        heroIngredientIds: ['c'],
      },
    });
    expect(result.constraints.excludedIngredientIds).toEqual(['a']);
    expect(result.constraints.lockedIngredientIds).toEqual(['b']);
    expect(result.constraints.heroIngredientIds).toEqual(['c']);
  });
});
