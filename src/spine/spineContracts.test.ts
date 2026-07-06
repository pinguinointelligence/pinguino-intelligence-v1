/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_CAPABILITIES, PAID_CAPABILITIES, type AccessContext } from './access';
import { SPINE_CONTRACT_VERSION, type NormalizedRecipeIntent } from './types';

describe('Spine contracts — locked version', () => {
  it('contract version is 1.0.0', () => {
    expect(SPINE_CONTRACT_VERSION).toBe('1.0.0');
  });

  it('NormalizedRecipeIntent carries the full locked shape (compile-time lock + runtime spot check)', () => {
    const intent: NormalizedRecipeIntent = {
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
      source: 'fallback',
      warnings: [],
      contractVersion: SPINE_CONTRACT_VERSION,
    };
    expect(intent.contractVersion).toBe('1.0.0');
    expect(intent.constraints.batchSizeG).toBeNull();
  });

  it('AccessContext carries the full locked shape (compile-time lock + runtime spot check)', () => {
    const context: AccessContext = {
      userId: null,
      accessLevel: 'demo',
      planId: null,
      capabilities: DEMO_CAPABILITIES,
      isLoggedIn: false,
      isSubscriptionActive: false,
      source: 'anonymous_demo',
      warnings: [],
      contractVersion: SPINE_CONTRACT_VERSION,
    };
    expect(context.accessLevel).toBe('demo');
    expect(context.capabilities.canViewExactRecipeGrams).toBe(false);
  });
});

describe('Spine access capabilities — demo vs paid (locked defaults)', () => {
  it('demo matches the locked capability set exactly', () => {
    expect(DEMO_CAPABILITIES).toEqual({
      canStartUserFlow: true,
      canViewRecipeDirection: true,
      canViewTechnologyWarnings: true,
      canViewExactRecipeGrams: false,
      canViewExactCorrectionGrams: false,
      canViewExactBeforeAfterValues: false,
      canUseAutoFix: false,
      canApplyAutoFix: false,
      canSavePreferences: true,
      canSaveRecipeDrafts: true,
      canSaveFullRecipes: false,
      canUseActualBatchRescue: false,
      canUseStockShortageWorkflow: false,
      canUseProductionBatchMode: false,
      canViewExpertMetrics: false,
    });
  });

  it('paid matches the locked capability set exactly (all capabilities on)', () => {
    expect(Object.values(PAID_CAPABILITIES).every((value) => value === true)).toBe(true);
    expect(Object.keys(PAID_CAPABILITIES).sort()).toEqual(Object.keys(DEMO_CAPABILITIES).sort());
  });

  it('demo cannot see exact grams, exact corrections or use Auto Fix / production rescue', () => {
    expect(DEMO_CAPABILITIES.canViewExactRecipeGrams).toBe(false);
    expect(DEMO_CAPABILITIES.canViewExactCorrectionGrams).toBe(false);
    expect(DEMO_CAPABILITIES.canUseAutoFix).toBe(false);
    expect(DEMO_CAPABILITIES.canUseActualBatchRescue).toBe(false);
  });

  it('paid can see exact grams and use Auto Fix, full saves, rescue and shortage workflows', () => {
    expect(PAID_CAPABILITIES.canViewExactRecipeGrams).toBe(true);
    expect(PAID_CAPABILITIES.canViewExactCorrectionGrams).toBe(true);
    expect(PAID_CAPABILITIES.canUseAutoFix).toBe(true);
    expect(PAID_CAPABILITIES.canSaveFullRecipes).toBe(true);
    expect(PAID_CAPABILITIES.canUseActualBatchRescue).toBe(true);
    expect(PAID_CAPABILITIES.canUseStockShortageWorkflow).toBe(true);
  });

  it('capabilities are pure booleans — no plan names, prices or provider data inside', () => {
    for (const caps of [DEMO_CAPABILITIES, PAID_CAPABILITIES]) {
      for (const value of Object.values(caps)) {
        expect(typeof value).toBe('boolean');
      }
    }
  });
});

describe('Spine boundary — the foundation layer stays pure (static)', () => {
  const SPINE_DIR = resolve(import.meta.dirname);
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const sourceFiles = readdirSync(SPINE_DIR).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
  );

  it('covers the slice modules', () => {
    expect(sourceFiles.sort()).toEqual([
      'access.ts',
      'designRecipe.ts',
      'index.ts',
      'normalizeProductProfile.ts',
      'normalizeRecipeIntent.ts',
      'productProfiles.ts',
      'types.ts',
    ]);
  });

  it.each(sourceFiles)('%s imports only within src/spine', (file) => {
    const src = strip(readFileSync(join(SPINE_DIR, file), 'utf8'));
    for (const match of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      expect(match[1], `${file} imports ${match[1]}`).toMatch(/^\.\//);
    }
  });

  it.each(sourceFiles)('%s has no IO, env, DOM, network or DB access', (file) => {
    const src = strip(readFileSync(join(SPINE_DIR, file), 'utf8'));
    expect(/fetch\s*\(|XMLHttpRequest|WebSocket/.test(src), 'network').toBe(false);
    expect(/process\.env|import\.meta\.env/.test(src), 'env').toBe(false);
    expect(/window\.|document\.|localStorage|sessionStorage/.test(src), 'DOM').toBe(false);
    expect(/supabase|service_role/i.test(src), 'DB client').toBe(false);
    expect(/stripe|oauth|password|api[_-]?key/i.test(src), 'auth/billing provider').toBe(false);
    expect(/Math\.random|Date\.now|new Date\(/.test(src), 'nondeterminism').toBe(false);
  });
});
