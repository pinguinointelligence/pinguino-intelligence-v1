import { describe, expect, it } from 'vitest';
import type { ProductCategory, RecipeIntent, TargetMetric } from './types';
import * as engine from './index';
import {
  DEFAULT_ENGINE_CONFIG,
  DENSITY_DEFAULTS,
  GOLDEN_MIDDLE_PRIORITY,
  MODES,
  NPAC_COEFFICIENTS,
  NPAC_NORMALIZATION,
  PAC_COEFFICIENTS,
  POD_COEFFICIENTS,
  SYRUP_DE_ANCHORS,
  TARGET_BANDS,
} from './index';
import { ALLOWED_ENGINE_FUNCTIONS } from './__fixtures__/allowedEngineFunctions';
import { CONFIG_VERSION, ENGINE_VERSION } from './config/version';

const SEMVER = /^\d+\.\d+\.\d+$/;

describe('versioning (spec §17)', () => {
  it('defines semver-shaped engine and config versions', () => {
    expect(ENGINE_VERSION).toMatch(SEMVER);
    expect(CONFIG_VERSION).toMatch(SEMVER);
    expect(DEFAULT_ENGINE_CONFIG.version).toEqual({
      engine_version: ENGINE_VERSION,
      config_version: CONFIG_VERSION,
    });
  });

  it('CONFIG 0.6.0 — the temperature-aware TARGET_BANDS bump (engine pipeline unchanged at 0.4.0)', () => {
    expect(CONFIG_VERSION).toBe('0.6.0');
    expect(ENGINE_VERSION).toBe('0.4.0');
  });
});

describe('POD coefficients (spec §7)', () => {
  it('uses sucrose as the exact 1.00 reference', () => {
    expect(POD_COEFFICIENTS.sucrose).toBe(1.0);
  });

  it('keeps defaults inside the spec ranges', () => {
    expect(POD_COEFFICIENTS.dextrose).toBeGreaterThanOrEqual(0.7);
    expect(POD_COEFFICIENTS.dextrose).toBeLessThanOrEqual(0.75);
    expect(POD_COEFFICIENTS.glucose).toBeGreaterThanOrEqual(0.7);
    expect(POD_COEFFICIENTS.glucose).toBeLessThanOrEqual(0.75);
    expect(POD_COEFFICIENTS.fructose).toBeGreaterThanOrEqual(1.7);
    expect(POD_COEFFICIENTS.fructose).toBeLessThanOrEqual(1.75);
    expect(POD_COEFFICIENTS.lactose).toBeGreaterThanOrEqual(0.15);
    expect(POD_COEFFICIENTS.lactose).toBeLessThanOrEqual(0.2);
  });
});

describe('PAC / NPAC coefficients (spec §8)', () => {
  it('dextrose, glucose and fructose must exceed sucrose in freezing power', () => {
    expect(PAC_COEFFICIENTS.dextrose).toBeGreaterThan(PAC_COEFFICIENTS.sucrose);
    expect(PAC_COEFFICIENTS.glucose).toBeGreaterThan(PAC_COEFFICIENTS.sucrose);
    expect(PAC_COEFFICIENTS.fructose).toBeGreaterThan(PAC_COEFFICIENTS.sucrose);
  });

  it('alcohol strongly increases freezing depression (above every sugar)', () => {
    expect(NPAC_COEFFICIENTS.alcohol).toBe(7.4);
    const sugars = [
      NPAC_COEFFICIENTS.sucrose,
      NPAC_COEFFICIENTS.dextrose,
      NPAC_COEFFICIENTS.glucose,
      NPAC_COEFFICIENTS.fructose,
      NPAC_COEFFICIENTS.lactose,
      NPAC_COEFFICIENTS.invert,
    ];
    for (const s of sugars) expect(NPAC_COEFFICIENTS.alcohol).toBeGreaterThan(s);
  });

  it('includes a salt coefficient (flagged calibration-sensitive)', () => {
    expect(NPAC_COEFFICIENTS.salt).toBeGreaterThan(0);
  });

  it('defaults to per_water_mass normalization (externally confirmed, CONFIG 0.5.0)', () => {
    expect(NPAC_NORMALIZATION).toBe('per_water_mass');
  });

  it('provides syrup DE anchors in ascending, monotonic order', () => {
    expect(SYRUP_DE_ANCHORS.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < SYRUP_DE_ANCHORS.length; i++) {
      const prev = SYRUP_DE_ANCHORS[i - 1]!;
      const curr = SYRUP_DE_ANCHORS[i]!;
      expect(curr.de).toBeGreaterThan(prev.de);
      expect(curr.pod).toBeGreaterThanOrEqual(prev.pod);
      expect(curr.pac).toBeGreaterThanOrEqual(prev.pac);
    }
    expect(SYRUP_DE_ANCHORS.some((a) => a.de === 39)).toBe(true); // externalReference fixture anchor
  });
});

describe('target ranges (spec §9)', () => {
  const ALL_METRICS: TargetMetric[] = [
    'pod',
    'npac',
    'ice_fraction',
    'lactose',
    'lactose_sandiness_risk',
    'fat',
    'aerating_protein',
    'protein_in_solids',
    'total_solids',
    'water',
    'alcohol',
  ];

  it('seeds milk gelato @ −11 °C with the exact LOCKED-spec bounds', () => {
    const band = TARGET_BANDS.find(
      (b) => b.category === 'milk_gelato' && b.temperature_c === -11,
    );
    expect(band).toBeDefined();
    expect(band!.status).toBe('seeded');
    const m = band!.metrics;
    expect(m.pod).toMatchObject({ min: 12, max: 17 });
    expect(m.npac).toMatchObject({ min: 33, max: 42 });
    expect(m.ice_fraction).toMatchObject({ min: 45, max: 54.5 });
    expect(m.lactose).toMatchObject({ min: 4, max: 6 });
    expect(m.lactose_sandiness_risk).toMatchObject({ min: 5, max: 9 });
    expect(m.fat).toMatchObject({ min: 5, max: 12 });
    expect(m.aerating_protein).toMatchObject({ min: 3, max: 6 });
    expect(m.protein_in_solids).toMatchObject({ min: 9, max: 13 });
    expect(m.total_solids).toMatchObject({ min: 31, max: 45 });
    expect(m.water).toMatchObject({ min: 57, max: 70 });
    expect(m.alcohol).toMatchObject({ min: 0, max: 2.5, warn_above: 2.5 });
  });

  it('every declared metric range has min ≤ max; every band is seeded with pod/npac/solids/water', () => {
    for (const band of TARGET_BANDS) {
      expect(band.status).toBe('seeded');
      for (const metric of ALL_METRICS) {
        const range = band.metrics[metric];
        if (range) expect(range.min, `${band.category}@${band.temperature_c} ${metric}`).toBeLessThanOrEqual(range.max);
      }
      // the core structural metrics are present in every seeded cell
      for (const metric of ['pod', 'npac', 'ice_fraction', 'total_solids', 'water', 'alcohol'] as const) {
        expect(band.metrics[metric], `${band.category}@${band.temperature_c} ${metric}`).toBeDefined();
      }
    }
  });

  it('CONFIG 0.6.0 seeds all 12 locked profile×temperature cells (milk/chocolate/sorbet/vegan × −11/−12/−13)', () => {
    const cells = TARGET_BANDS.map((b) => `${b.category}@${b.temperature_c}`).sort();
    expect(cells).toEqual(
      [
        'milk_gelato@-11',
        'milk_gelato@-12',
        'milk_gelato@-13',
        'chocolate_gelato@-11',
        'chocolate_gelato@-12',
        'chocolate_gelato@-13',
        'sorbet@-11',
        'sorbet@-12',
        'sorbet@-13',
        'vegan_gelato@-11',
        'vegan_gelato@-12',
        'vegan_gelato@-13',
      ].sort(),
    );
  });

  it('milk/chocolate bands declare all 11 metrics; sorbet/vegan OMIT the regulator-DISABLED dairy gates', () => {
    const DAIRY = ['lactose', 'lactose_sandiness_risk', 'aerating_protein', 'protein_in_solids'] as const;
    for (const band of TARGET_BANDS) {
      const name = `${band.category}@${band.temperature_c}`;
      if (band.category === 'milk_gelato' || band.category === 'chocolate_gelato') {
        for (const metric of ALL_METRICS) expect(band.metrics[metric], `${name} ${metric}`).toBeDefined();
      }
      if (band.category === 'sorbet') {
        for (const gate of [...DAIRY, 'fat'] as const) expect(band.metrics[gate], `${name} ${gate}`).toBeUndefined();
      }
      if (band.category === 'vegan_gelato') {
        for (const gate of DAIRY) expect(band.metrics[gate], `${name} ${gate}`).toBeUndefined();
        expect(band.metrics.fat, `${name} fat`).toBeDefined();
      }
      if (band.category === 'chocolate_gelato') {
        // the LOCKED advisory hard-minimum, never the milk band's 9
        expect(band.metrics.protein_in_solids).toMatchObject({ min: 7, max: 13 });
      }
    }
  });
});

describe('product modes (spec §11–§12)', () => {
  it('defines all four modes', () => {
    expect(Object.keys(MODES).sort()).toEqual(['classic', 'eco', 'premium', 'signature']);
  });

  it('score weights sum to 1 for every mode', () => {
    for (const policy of Object.values(MODES)) {
      const sum = policy.score_weights.cost + policy.score_weights.technical + policy.score_weights.flavor;
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    }
  });

  it('PREMIUM and SIGNATURE protect the main ingredient (reduce forbidden)', () => {
    expect(MODES.premium.main_ingredient.reduce_forbidden).toBe(true);
    expect(MODES.signature.main_ingredient.reduce_forbidden).toBe(true);
    expect(MODES.eco.main_ingredient.reduce_forbidden).toBe(false);
    expect(MODES.classic.main_ingredient.reduce_forbidden).toBe(false);
  });

  it('mode policies match the spec objectives', () => {
    expect(MODES.eco.candidate_ranking).toBe('cheapest_first');
    expect(MODES.signature.boosters).toBe('suggested');
    expect(MODES.eco.boosters).toBe('none');
  });
});

describe('Golden Middle priority order (spec §10)', () => {
  it('is the exact 11-step order', () => {
    expect([...GOLDEN_MIDDLE_PRIORITY]).toEqual([
      'feasibility_safety',
      'freezing_stability',
      'npac_pac',
      'pod',
      'water_solids',
      'fat',
      'protein',
      'lactose_sandiness',
      'stabilizer_ratio',
      'flavor_priority',
      'cost',
    ]);
  });
});

describe('density defaults', () => {
  it('covers every product category with a plausible g/ml value', () => {
    const categories: ProductCategory[] = [
      'milk_gelato',
      'fruit_gelato',
      'nut_gelato',
      'chocolate_gelato',
      'alcohol_gelato',
      'sorbet',
      'vegan_gelato',
      'custom',
    ];
    for (const category of categories) {
      const density = DENSITY_DEFAULTS[category];
      expect(density).toBeGreaterThan(0.9);
      expect(density).toBeLessThan(1.3);
    }
  });
});

describe('export allowlist (implemented stages only — no scoring/corrections yet)', () => {
  it('exports exactly the implemented stage functions and nothing else', () => {
    const functionNames = Object.entries(engine)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);
    expect(functionNames.sort()).toEqual([...ALLOWED_ENGINE_FUNCTIONS].sort());
  });
});

describe('AI boundary type contracts (spec §19)', () => {
  it('RecipeIntent is constructible as specified', () => {
    const intent = {
      product_type: 'milk_gelato',
      recipe_mode: 'premium',
      target_temperature_c: -11,
      batch_grams: 2000,
      main_ingredient: 'raspberry',
      flavour_priority: 'maximum',
      dietary: [],
      missing_information: [],
      next_action: 'build_starting_recipe',
    } satisfies RecipeIntent;
    expect(intent.recipe_mode).toBe('premium');
  });
});
