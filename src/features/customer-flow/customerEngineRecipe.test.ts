import { describe, expect, it } from 'vitest';
import { buildCustomerEngineRecipe } from './customerEngineRecipe';
import { createCustomerFlow, setProductType, selectServingMode, setBatchGrams } from './customerFlow';

/**
 * The customer result must run the REAL engine (calculateRecipe) via the shared
 * starter-template bridge — not a hardcoded preview skeleton. These tests pin that
 * a real RecipeInput + real metrics come out for supported profiles, and that
 * unsupported profiles / incomplete state resolve honestly (never a faked recipe).
 */
const gelatoFlow = (text: string, mode: 'temp_minus_12' | 'ninja_swirl' | 'ninja_gelato', batch?: number) => {
  let s = createCustomerFlow({ text });
  s = setProductType(s, 'gelato');
  s = selectServingMode(s, mode);
  if (batch !== undefined) s = setBatchGrams(s, batch);
  return s;
};

describe('customer → REAL engine bridge', () => {
  it('a standard gelato produces a REAL calculateRecipe result (real RecipeInput + metrics)', () => {
    const r = buildCustomerEngineRecipe(gelatoFlow('lody waniliowe', 'temp_minus_12', 1000));
    expect(r.calculated).toBe(true);
    expect(r.reason).toBe('ok');
    expect(r.draft?.status).toBe('ready');
    // A real RecipeInput with real reference ingredients + planned grams.
    expect(r.draft?.recipeInput?.items.length).toBeGreaterThan(0);
    expect(r.draft?.recipeInput?.items.every((i) => i.planned_grams > 0)).toBe(true);
    // Real engine metrics (config/engine version proves calculateRecipe actually ran).
    expect(r.draft?.enginePreview?.configVersion).toBeTruthy();
    expect(r.draft?.enginePreview?.engineVersion).toBeTruthy();
    expect(typeof r.draft?.enginePreview?.podPoints).toBe('number');
  });

  it('the serving mode drives the engine temperature (Ninja Swirl → −11 into RecipeInput)', () => {
    const r = buildCustomerEngineRecipe(gelatoFlow('lody waniliowe', 'ninja_swirl'));
    // Ninja Swirl auto-sets 480 g and routes −11 → both reach the real RecipeInput.
    expect(r.calculated).toBe(true);
    expect(r.draft?.recipeInput?.target_temperature_c).toBe(-11);
    expect(r.draft?.recipeInput?.target_batch_grams).toBe(480);
  });

  it('a chocolate intent uses the chocolate base and still computes a real recipe', () => {
    const r = buildCustomerEngineRecipe(gelatoFlow('gelato czekoladowe', 'ninja_gelato'));
    expect(r.calculated).toBe(true);
    expect(r.draft?.productProfile).toBe('chocolate_gelato');
    expect(r.draft?.recipeInput?.category).toBe('chocolate_gelato');
    expect(r.draft?.recipeInput?.target_temperature_c).toBe(-13);
    expect(r.draft?.recipeInput?.target_batch_grams).toBe(700);
  });

  it('sorbet has no safe reference base yet → honest no_template, never a faked recipe', () => {
    let s = createCustomerFlow({ text: 'sorbet malinowy' });
    s = setProductType(s, 'sorbet');
    s = selectServingMode(s, 'temp_minus_12');
    s = setBatchGrams(s, 1000);
    const r = buildCustomerEngineRecipe(s);
    expect(r.calculated).toBe(false);
    expect(r.reason).toBe('no_template');
    expect(r.draft?.recipeInput).toBeNull();
  });

  it('protein resolves to an honest unsupported gap (no engine profile)', () => {
    let s = createCustomerFlow();
    s = setProductType(s, 'protein');
    s = selectServingMode(s, 'temp_minus_12');
    const r = buildCustomerEngineRecipe(s);
    expect(r.calculated).toBe(false);
    expect(r.reason).toBe('profile_unsupported');
  });

  it('an incomplete flow (no mode/batch) does not fabricate a recipe', () => {
    let s = createCustomerFlow({ text: 'lody waniliowe' });
    s = setProductType(s, 'gelato');
    const r = buildCustomerEngineRecipe(s); // no mode, no batch
    expect(r.calculated).toBe(false);
    expect(r.reason).toBe('incomplete');
  });
});
