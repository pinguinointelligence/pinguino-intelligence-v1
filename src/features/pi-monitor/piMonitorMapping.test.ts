import { describe, expect, it } from 'vitest';
import { SPINE_CONTRACT_VERSION, type NormalizedRecipeIntent } from '@/spine';
import { mapRecipeToAxes } from './piMonitorAxes';
import { applyAxisIntentsToIntent } from './piMonitorIntent';
import { evaluateRecalcGate } from './piMonitor';
import { NEUTRAL_AXIS_INTENTS, type PiAxisMetricValues } from './piMonitorContracts';

const HOME = { canViewExactGrams: true };
const DEMO = { canViewExactGrams: false };

// milk_gelato @ −11: pod [12,17], ice_fraction [45,54.5], fat [5,12], total_solids [31,45].
const metrics: PiAxisMetricValues = { pod: 15, iceFraction: 60, fat: 3, solids: 50 };

const baseIntent = (over: Partial<NormalizedRecipeIntent> = {}): NormalizedRecipeIntent => ({
  productProfile: 'standard_gelato',
  qualityTier: 'classic',
  servingTemperatureC: -11,
  texturePreference: 'medium',
  sweetnessPreference: 'balanced',
  costPriority: 'balanced',
  flavorGroup: 'unknown',
  flavorTags: [],
  naturalOnly: false,
  allowBoosters: true,
  dietary: { vegan: false, lactoseFree: false, glutenFree: false, allergenAware: false, noAddedSugar: false, lowSugar: false, alcohol: false },
  constraints: { excludedIngredientIds: [], lockedIngredientIds: [], heroIngredientIds: [], batchSizeG: null, machineCapacityG: null },
  source: 'user_input',
  warnings: [],
  contractVersion: SPINE_CONTRACT_VERSION,
  ...over,
});

describe('mapRecipeToAxes — direction vs the golden range (reused bands)', () => {
  it('maps the four axes onto honest customer directions', () => {
    const axes = mapRecipeToAxes({ metrics, category: 'milk_gelato', servingTemperatureC: -11, capability: HOME });
    const by = (id: string) => axes.find((a) => a.id === id)!;
    expect(by('slodycz').position).toBe('w_zakresie'); // pod 15 in [12,17]
    expect(by('miekkosc_twardosc').position).toBe('powyzej_zakresu'); // ice 60 > 54.5
    expect(by('miekkosc_twardosc').directionCopy).toBe('twardsze niż zakres');
    expect(by('kremowosc_tluszcz').position).toBe('ponizej_zakresu'); // fat 3 < 5
    expect(by('kremowosc_tluszcz').directionCopy).toBe('mniej tłuszczu niż zakres');
    expect(by('pelnia_body').position).toBe('powyzej_zakresu'); // solids 50 > 45
  });

  it('exposes value + band for Home/Pro, and redacts them for Demo (at source)', () => {
    const home = mapRecipeToAxes({ metrics, category: 'milk_gelato', servingTemperatureC: -11, capability: HOME });
    const demo = mapRecipeToAxes({ metrics, category: 'milk_gelato', servingTemperatureC: -11, capability: DEMO });
    const homeSlodycz = home.find((a) => a.id === 'slodycz')!;
    expect(homeSlodycz.value).toBe(15);
    expect(homeSlodycz.band).toEqual([12, 17]);
    for (const a of demo) {
      expect(a.value).toBeUndefined();
      expect(a.band).toBeUndefined();
    }
  });

  it('reports an axis with no band for the product as not-applicable (never faked)', () => {
    // Sorbet defines no fat band → the Kremowość–tłuszcz axis must be not-applicable.
    const axes = mapRecipeToAxes({ metrics: { pod: 20, iceFraction: 55, fat: undefined, solids: 30 }, category: 'sorbet', servingTemperatureC: -11, capability: HOME });
    const fatAxis = axes.find((a) => a.id === 'kremowosc_tluszcz')!;
    expect(fatAxis.applicable).toBe(false);
    expect(fatAxis.position).toBeNull();
    expect(fatAxis.directionCopy).toBe('nie dotyczy tego produktu');
  });
});

describe('applyAxisIntentsToIntent — stepped wishes onto real spine levers', () => {
  it('maps słodycz→sweetnessPreference and twardość→texturePreference', () => {
    const { intent, mappedAxes, advisoryWishAxes } = applyAxisIntentsToIntent(baseIntent(), {
      ...NEUTRAL_AXIS_INTENTS,
      slodycz: 'increase',
      miekkosc_twardosc: 'increase',
    });
    expect(intent.sweetnessPreference).toBe('high');
    expect(intent.texturePreference).toBe('firm');
    expect(mappedAxes).toContain('slodycz');
    expect(mappedAxes).toContain('miekkosc_twardosc');
    expect(advisoryWishAxes).toHaveLength(0);
  });

  it('records fat/body wishes as advisory (no direct lever) and leaves keep untouched', () => {
    const { intent, advisoryWishAxes } = applyAxisIntentsToIntent(baseIntent({ sweetnessPreference: 'balanced', texturePreference: 'medium' }), {
      ...NEUTRAL_AXIS_INTENTS,
      kremowosc_tluszcz: 'increase',
      pelnia_body: 'decrease',
    });
    expect(advisoryWishAxes).toEqual(['kremowosc_tluszcz', 'pelnia_body']);
    expect(intent.sweetnessPreference).toBe('balanced'); // keep → untouched
    expect(intent.texturePreference).toBe('medium');
  });
});

describe('evaluateRecalcGate — ingredient-resolution gate (honest count/plural)', () => {
  it('passes when all ingredients are resolved', () => {
    const gate = evaluateRecalcGate({ allResolved: true, unresolvedCount: 0, unresolvedNames: [] });
    expect(gate.canRecalculate).toBe(true);
    expect(gate.blockCopy).toBeNull();
  });

  it('blocks with the exact singular copy for 1 unresolved ingredient', () => {
    const gate = evaluateRecalcGate({ allResolved: false, unresolvedCount: 1, unresolvedNames: ['baza'] });
    expect(gate.canRecalculate).toBe(false);
    expect(gate.blockCopy).toBe('Najpierw wybierz konkretny produkt dla 1 składnika, aby PI mogło dokładnie przeliczyć recepturę.');
  });

  it('blocks with the honest plural for 2+ unresolved ingredients', () => {
    const gate = evaluateRecalcGate({ allResolved: false, unresolvedCount: 2, unresolvedNames: ['a', 'b'] });
    expect(gate.blockCopy).toContain('dla 2 składników');
  });
});
