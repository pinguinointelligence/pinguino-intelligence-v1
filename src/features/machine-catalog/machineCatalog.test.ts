/// <reference types="node" />
/**
 * Machine Catalog — spec §25.1 rows + §9.3 activation rule + the owner's
 * default-neutrality guarantee (machines route to EXISTING modes and carry
 * capacity/UX facts ONLY — no recipe math, no modifiers, no ml→g conversion).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { approvedMassForMode, isServingModeId } from '@/features/customer-flow';
import {
  CUISINART_ICE21E,
  CUISINART_ICE30BCE,
  CUISINART_ICE100E,
  KITCHENAID_5KSMICM,
  MACHINE_CATALOG,
  MACHINE_CATALOG_META,
  MACHINE_CATALOG_VERSION,
  MAGIMIX_GELATO_EXPERT,
  MOULINEX_FREEZI_MJ803AF0,
  NINJA_CREAMI_DELUXE_NC502EU,
  NINJA_CREAMI_NC302EU,
  NINJA_CREAMI_SCOOP_SWIRL_NC7,
  SAGE_SMART_SCOOP_BCI600,
} from './machineCatalogData';
import {
  HOME_TECHNOLOGY_TO_VISIBLE_MODE,
  isHomeSupportedTechnology,
  visibleModeForTechnology,
} from './technologyMode';
import {
  deriveMachineSetup,
  findMachineByModelCode,
  isMachineActivatable,
  listActiveHomeMachines,
  machinesForMarket,
  marketMatchesRegion,
  validateHomeMachineProfile,
} from './machineDerivation';
import type { HomeMachineProfile } from './types';

/* ------------------------------------------------------------------ */
/* §10 — technology → EXISTING visible mode                            */
/* ------------------------------------------------------------------ */

describe('technology → existing visible mode (§10)', () => {
  it('maps exactly per the spec table', () => {
    expect(HOME_TECHNOLOGY_TO_VISIBLE_MODE).toEqual({
      respin: 'ninja_gelato',
      respin_soft: 'ninja_swirl',
      compressor: 'fresh',
      frozen_bowl: 'fresh',
      continuous_soft_serve: null,
    });
  });

  it('every Home mode is an EXISTING ServingModeId (no parallel mode system)', () => {
    for (const mode of Object.values(HOME_TECHNOLOGY_TO_VISIBLE_MODE)) {
      if (mode !== null) expect(isServingModeId(mode)).toBe(true);
    }
  });

  it('continuous_soft_serve is NOT Home-selectable (Pro / future)', () => {
    expect(visibleModeForTechnology('continuous_soft_serve')).toBeNull();
    expect(isHomeSupportedTechnology('continuous_soft_serve')).toBe(false);
  });

  it('Ninja Swirl is respin_soft — never continuous soft serve', () => {
    expect(visibleModeForTechnology('respin_soft')).toBe('ninja_swirl');
    expect(NINJA_CREAMI_SCOOP_SWIRL_NC7.technology).toBe('respin_soft');
    expect(NINJA_CREAMI_SCOOP_SWIRL_NC7.resolvedVisibleMode).toBe('ninja_swirl');
  });
});

/* ------------------------------------------------------------------ */
/* Annex A seed — model → technology → mode → capacity, per region     */
/* ------------------------------------------------------------------ */

interface ExpectedRow {
  profile: HomeMachineProfile;
  market: string;
  technology: string;
  mode: string;
  status: string;
  active: boolean;
}

const EXPECTED_ROWS: readonly ExpectedRow[] = [
  {
    profile: NINJA_CREAMI_NC302EU,
    market: 'EU/ES',
    technology: 'respin',
    mode: 'ninja_gelato',
    status: 'conflicting_sources',
    active: false,
  },
  {
    profile: NINJA_CREAMI_DELUXE_NC502EU,
    market: 'EU/ES',
    technology: 'respin',
    mode: 'ninja_gelato',
    status: 'conflicting_sources',
    active: false,
  },
  {
    profile: NINJA_CREAMI_SCOOP_SWIRL_NC7,
    market: 'EU/ES',
    technology: 'respin_soft',
    mode: 'ninja_swirl',
    status: 'provisional',
    active: true,
  },
  {
    profile: MOULINEX_FREEZI_MJ803AF0,
    market: 'ES',
    technology: 'compressor',
    mode: 'fresh',
    status: 'provisional',
    active: true,
  },
  {
    profile: MAGIMIX_GELATO_EXPERT,
    market: 'EU',
    technology: 'compressor',
    mode: 'fresh',
    status: 'provisional',
    active: true,
  },
  {
    profile: CUISINART_ICE100E,
    market: 'EU',
    technology: 'compressor',
    mode: 'fresh',
    status: 'provisional',
    active: true,
  },
  {
    profile: CUISINART_ICE21E,
    market: 'EU',
    technology: 'frozen_bowl',
    mode: 'fresh',
    status: 'provisional',
    active: true,
  },
  {
    profile: CUISINART_ICE30BCE,
    market: 'EU',
    technology: 'frozen_bowl',
    mode: 'fresh',
    status: 'provisional',
    active: true,
  },
  {
    profile: KITCHENAID_5KSMICM,
    market: 'UK/EU',
    technology: 'frozen_bowl',
    mode: 'fresh',
    status: 'provisional',
    active: true,
  },
  {
    profile: SAGE_SMART_SCOOP_BCI600,
    market: 'UK/EU',
    technology: 'compressor',
    mode: 'fresh',
    status: 'needs_review',
    active: false,
  },
];

describe('Annex A seed catalog — model → technology → mode → status', () => {
  it('contains exactly the ten Annex A records with unique ids', () => {
    expect(MACHINE_CATALOG).toHaveLength(10);
    expect(new Set(MACHINE_CATALOG.map((p) => p.id)).size).toBe(10);
    for (const row of EXPECTED_ROWS) expect(MACHINE_CATALOG).toContain(row.profile);
  });

  it.each(EXPECTED_ROWS.map((row): [string, ExpectedRow] => [row.profile.id, row]))(
    '%s carries the Annex A market/technology/mode/status',
    (_id, row) => {
      expect(row.profile.market).toBe(row.market);
      expect(row.profile.technology).toBe(row.technology);
      expect(row.profile.resolvedVisibleMode).toBe(row.mode);
      expect(row.profile.specificationStatus).toBe(row.status);
      expect(row.profile.active).toBe(row.active);
      expect(row.profile.specificationSource).toBe('manufacturer_official');
      expect(row.profile.specificationSourceUrl).toMatch(/^https:\/\//);
    },
  );

  it('every record passes the structural invariants', () => {
    for (const profile of MACHINE_CATALOG) {
      expect(validateHomeMachineProfile(profile)).toEqual([]);
    }
  });

  it('nothing is verified in this pass (Annex A demands per-model+market re-confirmation)', () => {
    for (const profile of MACHINE_CATALOG) {
      expect(profile.specificationStatus).not.toBe('verified');
      expect(profile.specificationVerifiedAt).toBeUndefined();
    }
  });

  it('the catalog is versioned', () => {
    expect(MACHINE_CATALOG_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(MACHINE_CATALOG_META.version).toBe(MACHINE_CATALOG_VERSION);
    expect(MACHINE_CATALOG_META.verifiedOnline).toBe(false);
  });
});

describe('Annex A capacities — exact numbers, per §9.1 field, never guessed', () => {
  it('Ninja NC302EU: 473 ml × 2 (product page) with the 450 ml accessories conflict', () => {
    const c = NINJA_CREAMI_NC302EU.capacity;
    expect(c.vesselCapacityMl).toBe(473);
    expect(c.vesselCount).toBe(2);
    expect(c.maxFillDefinedByManufacturer).toBe(true); // Annex A: "Używaj MAX FILL"
    expect(NINJA_CREAMI_NC302EU.sourceConflicts).toEqual([
      expect.objectContaining({ field: 'vesselCapacityMl', candidatesMl: [473, 450] }),
    ]);
    expect(NINJA_CREAMI_NC302EU.preFreezeTarget).toBe('mixture');
  });

  it('Ninja Deluxe NC502EU: 706 ml × 2 vs 680 ml accessories → conflicting_sources', () => {
    const c = NINJA_CREAMI_DELUXE_NC502EU.capacity;
    expect(c.vesselCapacityMl).toBe(706);
    expect(c.vesselCount).toBe(2);
    expect(NINJA_CREAMI_DELUXE_NC502EU.sourceConflicts).toEqual([
      expect.objectContaining({ field: 'vesselCapacityMl', candidatesMl: [706, 680] }),
    ]);
  });

  it('Ninja Scoop & Swirl NC7: 480 ml, pre-freeze the mixture', () => {
    expect(NINJA_CREAMI_SCOOP_SWIRL_NC7.capacity.vesselCapacityMl).toBe(480);
    expect(NINJA_CREAMI_SCOOP_SWIRL_NC7.requiresPreFreeze).toBe(true);
    expect(NINJA_CREAMI_SCOOP_SWIRL_NC7.preFreezeTarget).toBe('mixture');
  });

  it('Moulinex Freezi: capacities kept PER PROGRAM (1.0 l ice cream / 1.4 l frozen drink)', () => {
    const c = MOULINEX_FREEZI_MJ803AF0.capacity;
    expect(c.perProgram).toEqual([
      { program: 'ice_cream', capacityMl: 1000 },
      { program: 'frozen_drink', capacityMl: 1400 },
    ]);
    expect(c.finishedProductCapacityMl).toBe(1000);
    expect(c.vesselCapacityMl).toBeNull(); // not stated — never guessed
    expect(c.maximumLiquidMixMl).toBeNull();
  });

  it('Magimix Gelato Expert: 2 l bowls are NOT a working capacity; programs 1.0 l / 1.3 l', () => {
    const c = MAGIMIX_GELATO_EXPERT.capacity;
    expect(c.vesselCapacityMl).toBe(2000);
    expect(c.workingCapacityMl).toBeNull(); // Annex A warning — never conflated
    expect(c.perProgram).toEqual([
      { program: 'ice_cream', capacityMl: 1000 },
      { program: 'sorbet_granita', capacityMl: 1300 },
    ]);
  });

  it('Cuisinart ICE100E: 1.5 l FINISHED dessert; max liquid mix left null to verify', () => {
    const c = CUISINART_ICE100E.capacity;
    expect(c.finishedProductCapacityMl).toBe(1500);
    expect(c.maximumLiquidMixMl).toBeNull();
  });

  it('Cuisinart frozen bowls: ICE21E 1.4 l, ICE30BCE 2.0 l (~12 h pre-freeze), bowl pre-freeze', () => {
    expect(CUISINART_ICE21E.capacity.vesselCapacityMl).toBe(1400);
    expect(CUISINART_ICE21E.preFreezeTarget).toBe('bowl');
    expect(CUISINART_ICE21E.preFreezeMinimumHours).toBeNull(); // not stated
    expect(CUISINART_ICE30BCE.capacity.vesselCapacityMl).toBe(2000);
    expect(CUISINART_ICE30BCE.preFreezeMinimumHours).toBe(12);
  });

  it('KitchenAid: 1.9 l finished ≠ 1.4 l max liquid mix (kept separate); 16 h pre-freeze', () => {
    const c = KITCHENAID_5KSMICM.capacity;
    expect(c.finishedProductCapacityMl).toBe(1900);
    expect(c.maximumLiquidMixMl).toBe(1400);
    expect(KITCHENAID_5KSMICM.preFreezeMinimumHours).toBe(16);
    expect(KITCHENAID_5KSMICM.preFreezeTarget).toBe('bowl');
  });

  it('Sage BCI600: technology confirmed, EVERY capacity null, needs_review, inactive', () => {
    const c = SAGE_SMART_SCOOP_BCI600.capacity;
    expect(c.vesselCapacityMl).toBeNull();
    expect(c.maximumLiquidMixMl).toBeNull();
    expect(c.workingCapacityMl).toBeNull();
    expect(c.minimumBatchMl).toBeNull();
    expect(c.maximumBatchMl).toBeNull();
    expect(c.defaultBatchMl).toBeNull();
    expect(c.finishedProductCapacityMl).toBeNull();
    expect(SAGE_SMART_SCOOP_BCI600.specificationStatus).toBe('needs_review');
    expect(SAGE_SMART_SCOOP_BCI600.active).toBe(false);
  });

  it('no record invents min/default/max batch — Annex A states none', () => {
    for (const profile of MACHINE_CATALOG) {
      expect(profile.capacity.minimumBatchMl).toBeNull();
      expect(profile.capacity.maximumBatchMl).toBeNull();
      expect(profile.capacity.defaultBatchMl).toBeNull();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Region-aware lookup (§9.3)                                          */
/* ------------------------------------------------------------------ */

describe('region-aware lookup (§9.3 — records are per model AND market)', () => {
  it('market tokens match exactly and case-insensitively', () => {
    expect(marketMatchesRegion('EU/ES', 'es')).toBe(true);
    expect(marketMatchesRegion('EU/ES', 'EU')).toBe(true);
    expect(marketMatchesRegion('EU/ES', 'US')).toBe(false);
    expect(marketMatchesRegion('UK/EU', 'uk')).toBe(true);
    expect(marketMatchesRegion('ES', 'E')).toBe(false); // no substring guessing
    expect(marketMatchesRegion('ES', '')).toBe(false);
  });

  it('ES sees the ES-token records; EU sees the EU-token records', () => {
    const es = machinesForMarket(MACHINE_CATALOG, 'ES').map((p) => p.id);
    expect(es).toEqual([
      'ninja-creami-nc302eu-eu-es',
      'ninja-creami-deluxe-nc502eu-eu-es',
      'ninja-creami-scoop-swirl-nc7-eu-es',
      'moulinex-freezi-mj803af0-es',
    ]);
    const eu = machinesForMarket(MACHINE_CATALOG, 'EU').map((p) => p.id);
    expect(eu).not.toContain('moulinex-freezi-mj803af0-es'); // ES-only record
    expect(eu).toContain('magimix-gelato-expert-eu');
    expect(eu).toContain('kitchenaid-5ksmicm-uk-eu');
    expect(eu).toHaveLength(9);
  });

  it('model-code lookup is region-aware and case-insensitive', () => {
    expect(findMachineByModelCode(MACHINE_CATALOG, 'nc302eu', 'ES')).toBe(NINJA_CREAMI_NC302EU);
    expect(findMachineByModelCode(MACHINE_CATALOG, 'NC302EU', 'US')).toBeNull();
    expect(findMachineByModelCode(MACHINE_CATALOG, '5KSMICM', 'UK')).toBe(KITCHENAID_5KSMICM);
    expect(findMachineByModelCode(MACHINE_CATALOG, 'BCI600')).toBe(SAGE_SMART_SCOOP_BCI600);
    expect(findMachineByModelCode(MACHINE_CATALOG, '')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Activation — conflicting_sources BLOCKS active (§9.3)               */
/* ------------------------------------------------------------------ */

describe('activation (§9.3)', () => {
  it('conflicting_sources records are inactive in the data AND not activatable', () => {
    for (const profile of MACHINE_CATALOG) {
      if (profile.specificationStatus === 'conflicting_sources') {
        expect(profile.active).toBe(false);
        expect(isMachineActivatable(profile)).toBe(false);
      }
    }
    expect(isMachineActivatable(NINJA_CREAMI_NC302EU)).toBe(false);
    expect(isMachineActivatable(NINJA_CREAMI_DELUXE_NC502EU)).toBe(false);
  });

  it('a conflicting record force-flagged active still fails validation and the active list', () => {
    const tampered: HomeMachineProfile = { ...NINJA_CREAMI_NC302EU, active: true };
    expect(validateHomeMachineProfile(tampered)).not.toEqual([]);
    expect(listActiveHomeMachines([tampered])).toEqual([]);
  });

  it('the active Home list is exactly the seven resolvable Annex A machines', () => {
    expect(listActiveHomeMachines(MACHINE_CATALOG).map((p) => p.id)).toEqual([
      'ninja-creami-scoop-swirl-nc7-eu-es',
      'moulinex-freezi-mj803af0-es',
      'magimix-gelato-expert-eu',
      'cuisinart-ice100e-eu',
      'kitchenaid-5ksmicm-uk-eu',
      'cuisinart-ice21e-eu',
      'cuisinart-ice30bce-eu',
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Derivation — batch is NEVER an ml→g conversion                      */
/* ------------------------------------------------------------------ */

describe('deriveMachineSetup — mode routing + honest batch suggestion', () => {
  it('Ninja machines REUSE the owner-approved serving-mode masses (never ml-derived)', () => {
    const nc7 = deriveMachineSetup(NINJA_CREAMI_SCOOP_SWIRL_NC7);
    expect(nc7.resolvedVisibleMode).toBe('ninja_swirl');
    expect(nc7.batchSuggestion).toEqual({
      kind: 'approved_mass_g',
      massG: approvedMassForMode('ninja_swirl'),
      servingModeId: 'ninja_swirl',
      source: 'serving_mode_preset',
    });

    const nc302 = deriveMachineSetup(NINJA_CREAMI_NC302EU);
    expect(nc302.resolvedVisibleMode).toBe('ninja_gelato');
    // 700 g is the approved ninja_gelato preset — NOT derivable from 473 ml.
    expect(nc302.batchSuggestion).toMatchObject({
      kind: 'approved_mass_g',
      massG: 700,
      source: 'serving_mode_preset',
    });
    expect(approvedMassForMode('ninja_gelato')).toBe(700);
  });

  it('KitchenAid suggests 1400 ml (max LIQUID mix) with the explicit ml_not_grams marker', () => {
    const d = deriveMachineSetup(KITCHENAID_5KSMICM);
    expect(d.resolvedVisibleMode).toBe('fresh');
    expect(d.batchSuggestion).toEqual({
      kind: 'capacity_ml',
      ml: 1400,
      unit: 'ml_not_grams',
      basis: 'maximum_liquid_mix',
    });
    // NEVER the finished-product 1900 ml (overrun) and never grams.
  });

  it('fresh-mode machines without a confirmed MIX quantity honestly suggest nothing', () => {
    // Vessel volume (brim) and finished-product volume are never pour amounts.
    for (const profile of [
      MAGIMIX_GELATO_EXPERT,
      CUISINART_ICE100E,
      CUISINART_ICE21E,
      CUISINART_ICE30BCE,
      MOULINEX_FREEZI_MJ803AF0,
      SAGE_SMART_SCOOP_BCI600,
    ]) {
      expect(deriveMachineSetup(profile).batchSuggestion).toEqual({
        kind: 'none',
        reason: 'no_confirmed_mix_capacity',
      });
    }
  });

  it('carries the pre-freeze facts and the MAX FILL rule through', () => {
    const d = deriveMachineSetup(CUISINART_ICE30BCE);
    expect(d.requiresPreFreeze).toBe(true);
    expect(d.preFreezeTarget).toBe('bowl');
    expect(d.preFreezeMinimumHours).toBe(12);
    expect(deriveMachineSetup(NINJA_CREAMI_NC302EU).maxFillDefinedByManufacturer).toBe(true);
  });

  it('a continuous_soft_serve profile derives an honest unsupported state', () => {
    const soft: HomeMachineProfile = {
      ...SAGE_SMART_SCOOP_BCI600,
      id: 'hypothetical-soft-serve',
      technology: 'continuous_soft_serve',
      active: false,
    };
    const d = deriveMachineSetup(soft);
    expect(d.homeSupport).toBe('unsupported_for_home');
    expect(d.resolvedVisibleMode).toBeNull();
    expect(d.batchSuggestion).toEqual({ kind: 'none', reason: 'machine_not_home_supported' });
    expect(isMachineActivatable(soft)).toBe(false);
    expect(validateHomeMachineProfile(soft)).not.toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Owner rule — default neutrality (no recipe math in machine data)    */
/* ------------------------------------------------------------------ */

const FORBIDDEN_KEY_WORDS = new Set([
  'pac',
  'pod',
  'npac',
  'sugar',
  'sugars',
  'sucrose',
  'dextrose',
  'fructose',
  'lactose',
  'fat',
  'fats',
  'stabilizer',
  'stabiliser',
  'emulsifier',
  'solids',
  'msnf',
  'protein',
  'temperature',
  'coefficient',
  'modifier',
  'modifiers',
  'correction',
  'corrections',
  'band',
  'bands',
]);

function collectKeys(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, into);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      into.add(key);
      collectKeys(nested, into);
    }
  }
}

function keyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);
}

describe('owner rule — machine profiles are default-neutral (routing + capacity/UX only)', () => {
  it('no profile or derivation carries any recipe-parameter-like field', () => {
    const keys = new Set<string>();
    for (const profile of MACHINE_CATALOG) {
      collectKeys(profile, keys);
      collectKeys(deriveMachineSetup(profile), keys);
    }
    for (const key of keys) {
      for (const word of keyWords(key)) {
        expect(FORBIDDEN_KEY_WORDS.has(word), `recipe-math-like key '${key}'`).toBe(false);
      }
    }
  });

  it('the derivation output shape is pinned (no modifier field can sneak in silently)', () => {
    const derivation = deriveMachineSetup(NINJA_CREAMI_SCOOP_SWIRL_NC7);
    expect(Object.keys(derivation).sort()).toEqual([
      'batchSuggestion',
      'homeSupport',
      'maxFillDefinedByManufacturer',
      'preFreezeMinimumHours',
      'preFreezeTarget',
      'requiresPreFreeze',
      'resolvedVisibleMode',
      'workingCapacityMl',
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Source hygiene — no 'Ninja 2', no engine imports, marker present    */
/* ------------------------------------------------------------------ */

const FEATURE_DIR = import.meta.dirname;

function featureSourceFiles(): string[] {
  return (readdirSync(FEATURE_DIR) as string[])
    .filter((name) => /\.ts$/.test(name) && !/\.test\.ts$/.test(name))
    .map((name) => join(FEATURE_DIR, name));
}

describe('source hygiene', () => {
  it('the banned name "Ninja 2" appears nowhere (data or source)', () => {
    for (const profile of MACHINE_CATALOG) {
      const text = JSON.stringify(profile);
      expect(/ninja[\s_-]*2\b/i.test(text), profile.id).toBe(false);
    }
    for (const file of featureSourceFiles()) {
      expect(/ninja[\s_-]*2\b/i.test(readFileSync(file, 'utf8')), file).toBe(false);
    }
  });

  it('the feature never imports the engine (pure data layer, no recipe math)', () => {
    for (const file of featureSourceFiles()) {
      const text = readFileSync(file, 'utf8');
      expect(/from\s+['"]@\/engine/.test(text), `engine import in ${file}`).toBe(false);
    }
  });

  it("the explicit 'ml_not_grams' marker is the derivation module's unit contract", () => {
    const text = readFileSync(join(FEATURE_DIR, 'machineDerivation.ts'), 'utf8');
    expect(text.includes("'ml_not_grams'")).toBe(true);
  });
});
