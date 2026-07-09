/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  previewVerifiedSubstituteRecalculation,
  type VerifiedSubstituteRecalculationInput,
} from './branchRecalculationPreview';
import {
  BRANCH_RECALCULATION_SCENARIOS,
  type VerifiedSubstituteScenario,
} from './branchRecalculationFixtures';
import {
  substituteToShortageLine,
  validateVerifiedSubstitute,
  type SubstituteValidationContext,
} from './verifiedSubstituteContract';
import {
  allergenSubstituteContract,
  alcoholSubstituteContract,
  dairySubstituteContract,
  mapperSourcedSubstituteContract,
  missingCompositionSubstituteContract,
  piCalculatedSubstituteContract,
  raspberrySubstituteContract,
  sweetenerSubstituteContract,
  unverifiedSubstituteContract,
} from './verifiedSubstituteFixtures';

const HERE = import.meta.dirname;

const sorbetCtx = (over: Partial<SubstituteValidationContext> = {}): SubstituteValidationContext => ({
  productProfile: 'sorbet',
  constraints: {},
  ...over,
});

const scenario = (): VerifiedSubstituteScenario =>
  BRANCH_RECALCULATION_SCENARIOS.find((s) => s.id === 'shortage-verified-substitute')! as VerifiedSubstituteScenario;

const runSubstitute = (over: Partial<VerifiedSubstituteRecalculationInput> = {}) => {
  const s = scenario();
  return previewVerifiedSubstituteRecalculation({
    shortageIntent: s.shortageIntent,
    plannedRecipe: s.plannedRecipe,
    contract: s.contract(),
    ...over,
  });
};

describe('validateVerifiedSubstitute — the gate for exact substitution', () => {
  it('accepts a verified same-family substitute (with the hero identity warning)', () => {
    const v = validateVerifiedSubstitute(raspberrySubstituteContract(), sorbetCtx());
    expect(v.valid).toBe(true);
    expect(v.blockedReasons).toEqual([]);
    expect(v.warnings).toContain('hero_ingredient_substitution_changes_product_identity');
  });

  it('rejects an unverified product', () => {
    const v = validateVerifiedSubstitute(unverifiedSubstituteContract(), sorbetCtx());
    expect(v.valid).toBe(false);
    expect(v.blockedReasons).toContain('unverified_substitute');
  });

  it('rejects a PI Calculated product — calculated is never verified', () => {
    const v = validateVerifiedSubstitute(piCalculatedSubstituteContract(), sorbetCtx());
    expect(v.valid).toBe(false);
    expect(v.blockedReasons).toContain('pi_calculated_never_verified_substitute');
  });

  it('rejects a Mapper product candidate — match candidates are never calibrated references', () => {
    const v = validateVerifiedSubstitute(mapperSourcedSubstituteContract(), sorbetCtx());
    expect(v.valid).toBe(false);
    expect(v.blockedReasons).toContain('mapper_products_never_calibrated_substitutes');
  });

  it('rejects an unknown source even when flagged verified', () => {
    const v = validateVerifiedSubstitute(
      raspberrySubstituteContract({ provenance: { source: 'random_website', verification: 'verified_reference' } }),
      sorbetCtx(),
    );
    expect(v.blockedReasons).toContain('substitute_source_not_allowed');
  });

  it('rejects missing / invalid composition', () => {
    const v = validateVerifiedSubstitute(missingCompositionSubstituteContract(), sorbetCtx());
    expect(v.valid).toBe(false);
    expect(v.blockedReasons).toContain('missing_or_invalid_composition');
    const inconsistent = validateVerifiedSubstitute(
      raspberrySubstituteContract({
        composition: { ...raspberrySubstituteContract().composition, solids_percent: 50 },
      }),
      sorbetCtx(),
    );
    expect(inconsistent.blockedReasons).toContain('composition_water_solids_inconsistent');
  });

  it('dairy into sorbet/vegan blocks — NO approval flag can override', () => {
    for (const productProfile of ['sorbet', 'vegan_gelato']) {
      const v = validateVerifiedSubstitute(
        dairySubstituteContract(),
        sorbetCtx({
          productProfile,
          constraints: {
            allergenSubstitutionApproved: true,
            alcoholSubstitutionApproved: true,
            sweetenerSubstitutionRuleApproved: true,
          },
          crossFamilyApproved: true,
        }),
      );
      expect(v.valid).toBe(false);
      expect(v.blockedReasons).toContain('dairy_substitute_forbidden_for_profile');
    }
  });

  it('allergen substitution requires explicit approval', () => {
    const noFlag = validateVerifiedSubstitute(allergenSubstituteContract(), sorbetCtx());
    expect(noFlag.blockedReasons).toContain('allergen_substitution_requires_explicit_approval');
    const withFlag = validateVerifiedSubstitute(
      allergenSubstituteContract(),
      sorbetCtx({ constraints: { allergenSubstitutionApproved: true } }),
    );
    expect(withFlag.valid).toBe(true);
  });

  it('alcohol substitution requires explicit approval', () => {
    const noFlag = validateVerifiedSubstitute(alcoholSubstituteContract(), sorbetCtx());
    expect(noFlag.blockedReasons).toContain('alcohol_substitution_requires_explicit_approval');
    const withFlag = validateVerifiedSubstitute(
      alcoholSubstituteContract(),
      sorbetCtx({ constraints: { alcoholSubstitutionApproved: true } }),
    );
    expect(withFlag.valid).toBe(true);
  });

  it('sweetener/polyol/HIS substitution requires an explicit supported rule', () => {
    const noRule = validateVerifiedSubstitute(sweetenerSubstituteContract(), sorbetCtx());
    expect(noRule.blockedReasons).toContain('sweetener_polyol_his_substitution_requires_supported_rule');
    const withRule = validateVerifiedSubstitute(
      sweetenerSubstituteContract(),
      sorbetCtx({ constraints: { sweetenerSubstitutionRuleApproved: true } }),
    );
    expect(withRule.valid).toBe(true);
  });

  it('family mismatch blocks unless explicitly supported; unknown families block', () => {
    const mismatch = validateVerifiedSubstitute(
      raspberrySubstituteContract({ originalFamily: 'sucrose' }),
      sorbetCtx(),
    );
    expect(mismatch.blockedReasons).toContain('substitute_family_mismatch_requires_explicit_support');
    const approved = validateVerifiedSubstitute(
      raspberrySubstituteContract({ originalFamily: 'sucrose' }),
      sorbetCtx({ crossFamilyApproved: true }),
    );
    expect(approved.valid).toBe(true);
    const unknown = validateVerifiedSubstitute(
      raspberrySubstituteContract({ substituteFamily: null }),
      sorbetCtx(),
    );
    expect(unknown.blockedReasons).toContain('substitute_family_unknown');
    const notAllowed = validateVerifiedSubstitute(
      raspberrySubstituteContract({ substituteFamily: 'cocoa_powder', originalFamily: 'cocoa_powder' }),
      sorbetCtx(),
    );
    expect(notAllowed.blockedReasons).toContain('substitute_family_not_allowed_for_profile');
  });

  it('substituteToShortageLine derives flags from the VALIDATION result, never independently', () => {
    const contract = mapperSourcedSubstituteContract();
    const failed = validateVerifiedSubstitute(contract, sorbetCtx());
    expect(substituteToShortageLine(contract, failed).hasVerifiedIngredientData).toBe(false);
    const ok = raspberrySubstituteContract();
    const passed = validateVerifiedSubstitute(ok, sorbetCtx());
    expect(substituteToShortageLine(ok, passed).hasVerifiedIngredientData).toBe(true);
  });
});

describe('previewVerifiedSubstituteRecalculation — engine + regulator verified swap', () => {
  it('the verified raspberry substitute recalculates through the REAL engine and regulator', () => {
    const r = runSubstitute();
    expect(r.routeDecision).toBe('substitution_possible');
    expect(r.exactStatus).toBe('calculated');
    expect(r.substitution).not.toBeNull();
    expect(r.substitution!.availableOriginalG).toBe(240);
    expect(r.substitution!.substituteG).toBe(360);
    expect(r.substitution!.verification).toBe('verified_reference');
    expect(['acceptable', 'tradeoff']).toContain(r.substitution!.verdict);
    // the swap splits the line: keep 240 g strawberry + 360 g raspberry
    expect(r.exactActions).toEqual([
      { type: 'keep', ingredient: 'Strawberry', grams: 240 },
      { type: 'substitute', ingredient: 'Raspberry puree', grams: 360 },
    ]);
    const swapped = r.proposedRecipeSnapshot as { items: { id: string; planned_grams: number }[] };
    expect(swapped.items.find((i) => i.id === 'strawberry')!.planned_grams).toBe(240);
    expect(swapped.items.find((i) => i.id === 'strawberry-substitute')!.planned_grams).toBe(360);
    // real before/after metrics from calculateRecipe
    expect(Number.isFinite(r.beforeMetrics!.npac)).toBe(true);
    expect(Number.isFinite(r.afterMetrics!.npac)).toBe(true);
    // hero identity change is warned
    expect(r.warnings).toContain('hero_ingredient_substitution_changes_product_identity');
  });

  it('an unsafe contract (dairy into sorbet) is unsafe — never calculated, even with all flags', () => {
    const s = scenario();
    const r = previewVerifiedSubstituteRecalculation({
      shortageIntent: {
        ...s.shortageIntent,
        constraints: {
          ...s.shortageIntent.constraints,
          allergenSubstitutionApproved: true,
          alcoholSubstitutionApproved: true,
          sweetenerSubstitutionRuleApproved: true,
        },
      },
      plannedRecipe: s.plannedRecipe,
      contract: dairySubstituteContract(),
      crossFamilyApproved: true,
    });
    expect(r.exactStatus).toBe('unsafe');
    expect(r.exactActions).toEqual([]);
    expect(r.proposedRecipeSnapshot).toBeNull();
  });

  it('unverified / Mapper / PI Calculated contracts never calculate', () => {
    for (const contract of [unverifiedSubstituteContract(), mapperSourcedSubstituteContract(), piCalculatedSubstituteContract()]) {
      const r = runSubstitute({ contract });
      expect(r.exactStatus).toBe('not_supported');
      expect(r.exactActions).toEqual([]);
      expect(r.proposedRecipeSnapshot).toBeNull();
    }
  });

  it('missing composition blocks as missing data', () => {
    const r = runSubstitute({ contract: missingCompositionSubstituteContract() });
    expect(r.exactStatus).toBe('blocked_missing_data');
    expect(r.exactStatusReason).toBe('substitute_composition_missing_or_invalid');
  });

  it('a contract for a line the recipe does not have blocks honestly', () => {
    const r = runSubstitute({ contract: raspberrySubstituteContract({ lineId: 'nonexistent-line' }) });
    expect(['blocked_missing_data']).toContain(r.exactStatus);
  });

  it('never mutates the planned recipe or the shortage intent', () => {
    const s = scenario();
    const recipeSnapshot = JSON.stringify(s.plannedRecipe);
    const intentSnapshot = JSON.stringify(s.shortageIntent);
    runSubstitute();
    expect(JSON.stringify(s.plannedRecipe)).toBe(recipeSnapshot);
    expect(JSON.stringify(s.shortageIntent)).toBe(intentSnapshot);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(runSubstitute())).toBe(JSON.stringify(runSubstitute()));
  });
});

describe('verifiedSubstituteContract — boundary (pure, no writes)', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const sources = ['verifiedSubstituteContract.ts', 'verifiedSubstituteFixtures.ts'].map((f) =>
    strip(readFileSync(join(HERE, f), 'utf8')),
  );

  it('no DB / Mapper / inventory / services coupling; engine barrel types only', () => {
    for (const src of sources) {
      expect(/from\s+['"]@\/engine\/[^'"]+['"]/.test(src)).toBe(false);
      expect(/@\/services\/|@\/lib\/|@\/data\/products|service_role/i.test(src)).toBe(false);
      expect(/writeInventory|updateStock|decrementStock/i.test(src)).toBe(false);
      for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(', 'fetch(']) {
        expect(src.includes(verb), verb).toBe(false);
      }
      expect(/saveRecipe|persistRecipe|\.save\(/.test(src)).toBe(false);
      expect(/pac_value\s*[:=]|pod_value\s*[:=]|setProductLifecycleStatus/.test(src)).toBe(false);
    }
  });
});
