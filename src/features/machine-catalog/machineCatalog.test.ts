/// <reference types="node" />
/**
 * Machine Catalog — spec §25.1 rows + §9.3 activation rule + the owner's
 * default-neutrality guarantee (machines route to EXISTING modes and carry
 * capacity/UX facts ONLY — no recipe math, no modifiers) + the OWNER
 * CORRECTION (2026-07-17): the universal, configurable, versioned Home batch
 * rule (0.95 safety factor over CONFIRMED usable capacity; the ONLY permitted
 * ml→g arithmetic), the source-of-truth order, and the even container split.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isServingModeId } from '@/features/customer-flow';
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
  DEFAULT_HOME_BATCH_RULE,
  HOME_BATCH_RULE_VERSION,
  HOME_CONTAINER_SAFETY_FACTOR,
  recommendMachineBatch,
  roundToNearest10,
  vesselFigureConflicted,
} from './homeBatchRule';
import {
  deriveMachineSetup,
  findMachineByModelCode,
  isMachineActivatable,
  listActiveHomeMachines,
  machinesForMarket,
  marketMatchesRegion,
  planContainerSplit,
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
  // OWNER FINAL DECISION (2026-07-17, „KOŃCOWA WIĄŻĄCA DECYZJA — POJEMNOŚCI"):
  // the capacity investigation is CLOSED. Manufacturer figures are pinned
  // (standard 473, Deluxe 706) and both records are ACTIVE + provisional; the
  // historical retail-page disputes stay in doc comments only — never
  // user-facing, never blocking.
  {
    profile: NINJA_CREAMI_NC302EU,
    market: 'EU/ES',
    technology: 'respin',
    mode: 'ninja_gelato',
    status: 'verified',
    active: true,
  },
  {
    profile: NINJA_CREAMI_DELUXE_NC502EU,
    market: 'EU/ES',
    technology: 'respin',
    mode: 'ninja_gelato',
    status: 'verified',
    active: true,
  },
  {
    profile: NINJA_CREAMI_SCOOP_SWIRL_NC7,
    market: 'EU/ES',
    technology: 'respin_soft',
    mode: 'ninja_swirl',
    status: 'verified',
    active: true,
  },
  {
    profile: MOULINEX_FREEZI_MJ803AF0,
    market: 'ES',
    technology: 'compressor',
    mode: 'fresh',
    status: 'verified',
    active: true,
  },
  {
    profile: MAGIMIX_GELATO_EXPERT,
    market: 'EU',
    technology: 'compressor',
    mode: 'fresh',
    status: 'verified',
    active: true,
  },
  {
    profile: CUISINART_ICE100E,
    market: 'EU/UK',
    technology: 'compressor',
    mode: 'fresh',
    status: 'verified',
    active: true,
  },
  {
    profile: CUISINART_ICE21E,
    market: 'EU/UK',
    technology: 'frozen_bowl',
    mode: 'fresh',
    status: 'verified',
    active: true,
  },
  {
    profile: CUISINART_ICE30BCE,
    market: 'EU/UK',
    technology: 'frozen_bowl',
    mode: 'fresh',
    status: 'verified',
    active: true,
  },
  {
    profile: KITCHENAID_5KSMICM,
    market: 'UK/EU',
    technology: 'frozen_bowl',
    mode: 'fresh',
    status: 'verified',
    active: true,
  },
  {
    profile: SAGE_SMART_SCOOP_BCI600,
    market: 'EU/ES',
    technology: 'compressor',
    mode: 'fresh',
    status: 'verified',
    active: true,
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

  it('all ten supported records carry current official evidence and are operationally complete', () => {
    expect(MACHINE_CATALOG.every((profile) => profile.specificationStatus === 'verified')).toBe(
      true,
    );
    for (const profile of MACHINE_CATALOG) {
      expect(profile.specificationVerifiedAt).toBe('2026-09-05');
      expect(profile.specificationEvidence?.length).toBeGreaterThan(0);
      expect(deriveMachineSetup(profile).recommendedBatchGrams).not.toBeNull();
    }
  });

  it('the catalog is versioned', () => {
    expect(MACHINE_CATALOG_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(MACHINE_CATALOG_META.version).toBe(MACHINE_CATALOG_VERSION);
    expect(MACHINE_CATALOG_META.verifiedOnline).toBe(true);
  });
});

describe('Annex A capacities — exact numbers, per §9.1 field, never guessed', () => {
  // OWNER FINAL DECISION (2026-07-17): the 473-vs-450 / 706-vs-680 disputes are
  // CLOSED — figures pinned to the product pages, no blocking sourceConflicts
  // entries, disputes never user-facing. The former conflict-evidence tests are
  // replaced by these activation pins (owner tests 1–2).
  it('Ninja NC302EU: owner-pinned 473 ml × 2 → ACTIVE verified, no blocking conflict', () => {
    const c = NINJA_CREAMI_NC302EU.capacity;
    expect(c.vesselCapacityMl).toBe(473);
    expect(c.vesselCount).toBe(2);
    expect(c.maxFillDefinedByManufacturer).toBe(true); // Annex A: "Używaj MAX FILL"
    expect(NINJA_CREAMI_NC302EU.sourceConflicts ?? []).toEqual([]);
    expect(vesselFigureConflicted(NINJA_CREAMI_NC302EU)).toBe(false);
    expect(NINJA_CREAMI_NC302EU.specificationStatus).toBe('verified');
    expect(NINJA_CREAMI_NC302EU.active).toBe(true);
    expect(NINJA_CREAMI_NC302EU.preFreezeTarget).toBe('mixture');
  });

  it('Ninja Deluxe NC502EU: owner-pinned 706 ml × 2 → ACTIVE verified, no blocking conflict', () => {
    const c = NINJA_CREAMI_DELUXE_NC502EU.capacity;
    expect(c.vesselCapacityMl).toBe(706);
    expect(c.vesselCount).toBe(2);
    expect(NINJA_CREAMI_DELUXE_NC502EU.sourceConflicts ?? []).toEqual([]);
    expect(vesselFigureConflicted(NINJA_CREAMI_DELUXE_NC502EU)).toBe(false);
    expect(NINJA_CREAMI_DELUXE_NC502EU.specificationStatus).toBe('verified');
    expect(NINJA_CREAMI_DELUXE_NC502EU.active).toBe(true);
  });

  it('Ninja Scoop & Swirl NC7: 480 ml (unconflicted), pre-freeze the mixture', () => {
    expect(NINJA_CREAMI_SCOOP_SWIRL_NC7.capacity.vesselCapacityMl).toBe(480);
    expect(NINJA_CREAMI_SCOOP_SWIRL_NC7.sourceConflicts ?? []).toEqual([]);
    expect(vesselFigureConflicted(NINJA_CREAMI_SCOOP_SWIRL_NC7)).toBe(false);
    expect(NINJA_CREAMI_SCOOP_SWIRL_NC7.requiresPreFreeze).toBe(true);
    expect(NINJA_CREAMI_SCOOP_SWIRL_NC7.preFreezeTarget).toBe('mixture');
  });

  it('Moulinex Freezi: capacities kept PER PROGRAM (1.0 l ice cream / 1.4 l frozen drink)', () => {
    const c = MOULINEX_FREEZI_MJ803AF0.capacity;
    expect(c.perProgram).toEqual([
      { program: 'ice_cream', capacityMl: 1000 },
      { program: 'frozen_drink_input', capacityMl: 1200 },
      { program: 'frozen_drink_finished', capacityMl: 1400 },
    ]);
    expect(c.finishedProductCapacityMl).toBe(1400);
    expect(c.vesselCapacityMl).toBeNull(); // not stated — never guessed
    expect(c.maximumLiquidMixMl).toBe(1000);
  });

  it('Magimix Gelato Expert separates 2 l bowls from 1.0 l / 1.3 l working programs', () => {
    const c = MAGIMIX_GELATO_EXPERT.capacity;
    expect(c.vesselCapacityMl).toBe(2000);
    expect(c.workingCapacityMl).toBe(1000);
    expect(c.perProgram).toEqual([
      { program: 'ice_cream', capacityMl: 1000 },
      { program: 'sorbet_granita', capacityMl: 1300 },
    ]);
  });

  it('Cuisinart ICE100E: separates 1.5 l vessel/finished volume from 1.0 l own-recipe input', () => {
    const c = CUISINART_ICE100E.capacity;
    expect(c.finishedProductCapacityMl).toBe(1500);
    expect(c.vesselCapacityMl).toBe(1500);
    expect(c.workingCapacityMl).toBe(1000);
    expect(c.maximumLiquidMixMl).toBe(1000);
  });

  it('Cuisinart frozen bowls: ICE21E 1.4 l, ICE30BCE 2.0 l (~12 h pre-freeze), bowl pre-freeze', () => {
    expect(CUISINART_ICE21E.capacity.vesselCapacityMl).toBeNull();
    expect(CUISINART_ICE21E.capacity.workingCapacityMl).toBe(1400);
    expect(CUISINART_ICE21E.preFreezeTarget).toBe('bowl');
    expect(CUISINART_ICE21E.capacity.maximumBatchMl).toBe(1400);
    expect(CUISINART_ICE21E.preFreezeMinimumHours).toBe(16);
    expect(CUISINART_ICE30BCE.capacity.vesselCapacityMl).toBe(2000);
    expect(CUISINART_ICE30BCE.capacity.workingCapacityMl).toBe(1500);
    expect(CUISINART_ICE30BCE.capacity.maximumBatchMl).toBe(1500);
    expect(CUISINART_ICE30BCE.preFreezeMinimumHours).toBe(12);
  });

  it('KitchenAid: 1.9 l finished ≠ 1.4 l max liquid mix (kept separate); 16 h pre-freeze', () => {
    const c = KITCHENAID_5KSMICM.capacity;
    expect(c.finishedProductCapacityMl).toBe(1900);
    expect(c.maximumLiquidMixMl).toBe(1400);
    expect(KITCHENAID_5KSMICM.preFreezeMinimumHours).toBe(16);
    expect(KITCHENAID_5KSMICM.preFreezeTarget).toBe('bowl');
  });

  it('Sage BCI600 / SCI600: verified 1.0 L vessel, no pre-freeze, active', () => {
    const c = SAGE_SMART_SCOOP_BCI600.capacity;
    expect(c.vesselCapacityMl).toBe(1000);
    expect(c.maximumLiquidMixMl).toBeNull();
    expect(c.workingCapacityMl).toBeNull();
    expect(c.minimumBatchMl).toBeNull();
    expect(c.maximumBatchMl).toBeNull();
    expect(c.defaultBatchMl).toBeNull();
    expect(c.finishedProductCapacityMl).toBeNull();
    expect(SAGE_SMART_SCOOP_BCI600.specificationStatus).toBe('verified');
    expect(SAGE_SMART_SCOOP_BCI600.active).toBe(true);
    expect(SAGE_SMART_SCOOP_BCI600.requiresPreFreeze).toBe(false);
    expect(SAGE_SMART_SCOOP_BCI600.operatingFeatures).toMatchObject({
      selfCooling: true,
      preCoolSupported: true,
      preCoolOptional: true,
      keepCoolSupported: true,
      keepCoolMaximumHours: 3,
      hardnessSettings: 12,
    });
  });

  it('no record invents min/default batch or a hard gram ceiling from volume', () => {
    for (const profile of MACHINE_CATALOG) {
      expect(profile.capacity.minimumBatchMl).toBeNull();
      expect(profile.capacity.defaultBatchMl).toBeNull();
      expect(profile.capacity.manufacturerMaxMixGrams ?? null).toBeNull(); // no manual states one yet
      expect(profile.capacity.hardMaximumBatchGrams).toBeNull();
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
      'sage-smart-scoop-bci600-uk-eu',
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

describe('activation (§9.3 rule intact; owner final decision activates the Ninjas)', () => {
  /** A synthetic conflicted profile — the §9.3 RULE outlives the closed dispute. */
  const conflicted = (): HomeMachineProfile => ({
    ...NINJA_CREAMI_NC302EU,
    id: 'probe-conflicted',
    specificationStatus: 'conflicting_sources',
    sourceConflicts: [{ field: 'vesselCapacityMl', candidatesMl: [473, 450], note: 'probe' }],
    active: false,
  });

  it('a conflicting_sources record is still never activatable (rule preserved)', () => {
    expect(isMachineActivatable(conflicted())).toBe(false);
    for (const profile of MACHINE_CATALOG) {
      if (profile.specificationStatus === 'conflicting_sources') {
        expect(profile.active).toBe(false);
        expect(isMachineActivatable(profile)).toBe(false);
      }
    }
  });

  it('OWNER TEST — NC302EU and NC502EU are activatable and ACTIVE (final decision)', () => {
    expect(isMachineActivatable(NINJA_CREAMI_NC302EU)).toBe(true);
    expect(isMachineActivatable(NINJA_CREAMI_DELUXE_NC502EU)).toBe(true);
    expect(NINJA_CREAMI_NC302EU.active).toBe(true);
    expect(NINJA_CREAMI_DELUXE_NC502EU.active).toBe(true);
  });

  it('a conflicting record force-flagged active still fails validation and the active list', () => {
    const tampered: HomeMachineProfile = { ...conflicted(), active: true };
    expect(validateHomeMachineProfile(tampered)).not.toEqual([]);
    expect(listActiveHomeMachines([tampered])).toEqual([]);
  });

  it('a record with an UNRESOLVED conflict entry cannot masquerade as provisional', () => {
    const mislabelled: HomeMachineProfile = {
      ...conflicted(),
      specificationStatus: 'provisional',
    };
    expect(validateHomeMachineProfile(mislabelled)).not.toEqual([]);
  });

  it('the active Home list includes all ten canonical machines after Sage verification', () => {
    expect(listActiveHomeMachines(MACHINE_CATALOG).map((p) => p.id)).toEqual([
      'ninja-creami-nc302eu-eu-es',
      'ninja-creami-deluxe-nc502eu-eu-es',
      'ninja-creami-scoop-swirl-nc7-eu-es',
      'moulinex-freezi-mj803af0-es',
      'sage-smart-scoop-bci600-uk-eu',
      'magimix-gelato-expert-eu',
      'cuisinart-ice100e-eu',
      'kitchenaid-5ksmicm-uk-eu',
      'cuisinart-ice21e-eu',
      'cuisinart-ice30bce-eu',
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* OWNER CORRECTION (2026-07-17) — the universal Home batch rule        */
/* ------------------------------------------------------------------ */

describe('owner Home batch rule — 0.95 factor over CONFIRMED usable capacity', () => {
  /** An unconflicted re-spin profile with a given tub figure (rule-2b probe). */
  const respinWithVessel = (vesselCapacityMl: number): HomeMachineProfile => ({
    ...NINJA_CREAMI_SCOOP_SWIRL_NC7,
    id: `probe-respin-${vesselCapacityMl}`,
    sourceConflicts: [],
    capacity: { ...NINJA_CREAMI_SCOOP_SWIRL_NC7.capacity, vesselCapacityMl },
  });

  it('OWNER TEST 1 — 473 ml → 450 g', () => {
    expect(roundToNearest10(473 * HOME_CONTAINER_SAFETY_FACTOR)).toBe(450);
    expect(recommendMachineBatch(respinWithVessel(473))?.grams).toBe(450);
  });

  it('OWNER TEST 2 — 480 ml → 460 g (the real NC7 Scoop & Swirl record)', () => {
    expect(roundToNearest10(480 * HOME_CONTAINER_SAFETY_FACTOR)).toBe(460);
    const recommended = recommendMachineBatch(NINJA_CREAMI_SCOOP_SWIRL_NC7);
    expect(recommended).toEqual({
      grams: 460,
      source: 'respin_vessel_ml',
      safetyFactorApplied: 0.95,
      ruleVersion: HOME_BATCH_RULE_VERSION,
      estimated: false,
    });
  });

  it('OWNER TEST 3 — 680 ml → 650 g', () => {
    expect(roundToNearest10(680 * HOME_CONTAINER_SAFETY_FACTOR)).toBe(650);
    expect(recommendMachineBatch(respinWithVessel(680))?.grams).toBe(650);
  });

  it('OWNER TEST 4 — 706 ml → 670 g (and 1000 ml → 950 g)', () => {
    expect(roundToNearest10(706 * HOME_CONTAINER_SAFETY_FACTOR)).toBe(670);
    expect(recommendMachineBatch(respinWithVessel(706))?.grams).toBe(670);
    expect(roundToNearest10(1000 * HOME_CONTAINER_SAFETY_FACTOR)).toBe(950);
  });

  it('OWNER TEST 5 — the factor is configurable AND versioned (never a magic number)', () => {
    expect(HOME_CONTAINER_SAFETY_FACTOR).toBe(0.95);
    expect(HOME_BATCH_RULE_VERSION).toContain('0.95');
    expect(DEFAULT_HOME_BATCH_RULE).toEqual({
      safetyFactor: HOME_CONTAINER_SAFETY_FACTOR,
      ruleVersion: HOME_BATCH_RULE_VERSION,
    });
    // Passing a different configured factor changes the output AND is recorded.
    const custom = recommendMachineBatch(respinWithVessel(480), {
      safetyFactor: 0.9,
      ruleVersion: 'test.v9',
    });
    expect(custom).toEqual({
      grams: 430, // 480 × 0.9 = 432 → 430
      source: 'respin_vessel_ml',
      safetyFactorApplied: 0.9,
      ruleVersion: 'test.v9',
      estimated: false,
    });
  });

  it('OWNER TEST 6 — official max mix in GRAMS is used directly: no ml conversion, no factor', () => {
    const withGrams: HomeMachineProfile = {
      ...KITCHENAID_5KSMICM,
      id: 'probe-max-mix-grams',
      capacity: { ...KITCHENAID_5KSMICM.capacity, manufacturerMaxMixGrams: 1250 },
    };
    expect(recommendMachineBatch(withGrams)).toEqual({
      grams: 1250, // NOT 1250 × 0.95 and NOT derived from the 1400 ml figure
      source: 'manufacturer_max_mix_grams',
      safetyFactorApplied: null,
      ruleVersion: HOME_BATCH_RULE_VERSION,
      estimated: false,
    });
  });

  it('OWNER TEST 7 — a physical bowl volume alone is never a batch source', () => {
    const bowlOnly: HomeMachineProfile = {
      ...CUISINART_ICE30BCE,
      id: 'probe-bowl-only',
      capacity: {
        ...CUISINART_ICE30BCE.capacity,
        maximumLiquidMixMl: null,
        workingCapacityMl: null,
        maximumBatchMl: null,
      },
    };
    expect(recommendMachineBatch(bowlOnly)).toBeNull();
  });

  it('a CONFLICTED tub figure never produces a number (rule preserved on a probe)', () => {
    // The owner's final decision CLOSED the real Ninja disputes, but the rule
    // itself stands — probed with a synthetic conflicted record.
    const probe: HomeMachineProfile = {
      ...NINJA_CREAMI_NC302EU,
      id: 'probe-conflicted-tub',
      specificationStatus: 'conflicting_sources',
      sourceConflicts: [{ field: 'vesselCapacityMl', candidatesMl: [473, 450], note: 'probe' }],
      active: false,
    };
    expect(vesselFigureConflicted(probe)).toBe(true);
    expect(recommendMachineBatch(probe)).toBeNull();
    expect(deriveMachineSetup(probe).batchSuggestion).toEqual({
      kind: 'none',
      reason: 'capacity_conflict_unresolved',
    });
  });

  it('OWNER TESTS 1–2 (final decision) — NC302EU proposes 450 g, NC502EU proposes 670 g', () => {
    expect(recommendMachineBatch(NINJA_CREAMI_NC302EU)).toEqual({
      grams: 450,
      source: 'respin_vessel_ml',
      safetyFactorApplied: 0.95,
      ruleVersion: HOME_BATCH_RULE_VERSION,
      estimated: false,
    });
    expect(recommendMachineBatch(NINJA_CREAMI_DELUXE_NC502EU)).toEqual({
      grams: 670,
      source: 'respin_vessel_ml',
      safetyFactorApplied: 0.95,
      ruleVersion: HOME_BATCH_RULE_VERSION,
      estimated: false,
    });
    expect(deriveMachineSetup(NINJA_CREAMI_NC302EU).recommendedBatchGrams).toBe(450);
    expect(deriveMachineSetup(NINJA_CREAMI_DELUXE_NC502EU).recommendedBatchGrams).toBe(670);
  });

  it('OWNER TESTS 3–4 (final decision) — NC7 proposes 460 g, KitchenAid proposes 1330 g', () => {
    expect(deriveMachineSetup(NINJA_CREAMI_SCOOP_SWIRL_NC7).recommendedBatchGrams).toBe(460);
    expect(deriveMachineSetup(KITCHENAID_5KSMICM).recommendedBatchGrams).toBe(1330);
  });

  it('official max liquid mix in ml (KitchenAid 1.4 l) → rule 2: 1400 × 0.95 = 1330 g', () => {
    expect(recommendMachineBatch(KITCHENAID_5KSMICM)).toEqual({
      grams: 1330,
      source: 'maximum_liquid_mix_ml',
      safetyFactorApplied: 0.95,
      ruleVersion: HOME_BATCH_RULE_VERSION,
      estimated: false,
    });
  });

  it('all approved normal-product defaults come from canonical working-capacity authority', () => {
    expect(
      MACHINE_CATALOG.map((profile) => [
        profile.displayName,
        deriveMachineSetup(profile).recommendedBatchGrams,
      ]),
    ).toEqual([
      ['Ninja CREAMi', 450],
      ['Ninja CREAMi Deluxe', 670],
      ['Ninja CREAMi Scoop & Swirl', 460],
      ['Moulinex Freezi', 950],
      ['Sage Smart Scoop', 950],
      ['Magimix Gelato Expert', 950],
      ['Cuisinart ICE-100', 950],
      ['KitchenAid Ice Cream Maker', 1330],
      ['Cuisinart ICE-21', 1330],
      ['Cuisinart ICE-30', 1430],
    ]);
  });

  it('resolves the batch by machine + visible product profile without treating Sorbet as a drink', () => {
    for (const productType of ['gelato', 'vegan', 'protein'] as const) {
      expect(deriveMachineSetup(MAGIMIX_GELATO_EXPERT, productType).recommendedBatchGrams).toBe(
        950,
      );
    }
    expect(deriveMachineSetup(MAGIMIX_GELATO_EXPERT, 'sorbet').recommendedBatchGrams).toBe(1240);
    for (const productType of ['gelato', 'sorbet', 'vegan', 'protein'] as const) {
      expect(deriveMachineSetup(MOULINEX_FREEZI_MJ803AF0, productType).recommendedBatchGrams).toBe(
        950,
      );
    }
  });

  it('owner-approved Sage uses the same shared 0.95 rule: 1000 ml vessel → 950 g', () => {
    expect(recommendMachineBatch(SAGE_SMART_SCOOP_BCI600)).toEqual({
      grams: 950,
      source: 'confirmed_vessel_ml',
      safetyFactorApplied: 0.95,
      ruleVersion: HOME_BATCH_RULE_VERSION,
      estimated: false,
    });
    expect(deriveMachineSetup(SAGE_SMART_SCOOP_BCI600).recommendedBatchGrams).toBe(950);
  });
});

describe('container split (owner correction) — even split, never overfill', () => {
  it('OWNER EXAMPLES @ 450 g — 900 → 2 × 450; 1000 → 3 × ~333.3; 1350 → 3 × 450', () => {
    expect(planContainerSplit(900, 450)).toEqual({
      containers: 2,
      gramsPerContainer: 450,
      totalGrams: 900,
      withinSingleContainer: false,
    });
    const thousand = planContainerSplit(1000, 450);
    expect(thousand?.containers).toBe(3);
    expect(thousand?.gramsPerContainer).toBe(333.3);
    expect(planContainerSplit(1350, 450)).toEqual({
      containers: 3,
      gramsPerContainer: 450,
      totalGrams: 1350,
      withinSingleContainer: false,
    });
  });

  it('OWNER TEST 8 — no single container ever exceeds recommendedBatchGrams (sweep)', () => {
    for (const limit of [450, 460, 650, 670, 1330]) {
      for (let requested = 1; requested <= 3000; requested += 7) {
        const plan = planContainerSplit(requested, limit);
        expect(plan).not.toBeNull();
        expect(plan!.gramsPerContainer).toBeLessThanOrEqual(limit);
        expect(plan!.containers).toBe(Math.ceil(requested / limit));
      }
    }
  });

  it('OWNER TEST 9 — a larger batch splits EVENLY across the required container count', () => {
    for (const [requested, limit] of [
      [900, 450],
      [1000, 450],
      [1350, 450],
      [1200, 460],
      [2000, 650],
    ] as const) {
      const plan = planContainerSplit(requested, limit);
      expect(plan).not.toBeNull();
      // Even split: per-container ≈ total / containers (0.1 g display rounding).
      expect(Math.abs(plan!.gramsPerContainer - requested / plan!.containers)).toBeLessThanOrEqual(
        0.05,
      );
      expect(plan!.totalGrams).toBe(requested);
    }
  });

  it('a request within the limit needs one container (the user may always prepare less)', () => {
    expect(planContainerSplit(450, 450)).toEqual({
      containers: 1,
      gramsPerContainer: 450,
      totalGrams: 450,
      withinSingleContainer: true,
    });
    expect(planContainerSplit(200, 450)?.withinSingleContainer).toBe(true);
  });

  it('invalid inputs return null — never a guessed plan', () => {
    expect(planContainerSplit(0, 450)).toBeNull();
    expect(planContainerSplit(-5, 450)).toBeNull();
    expect(planContainerSplit(Number.NaN, 450)).toBeNull();
    expect(planContainerSplit(900, 0)).toBeNull();
    expect(planContainerSplit(900, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Derivation — mode routing + honest batch                            */
/* ------------------------------------------------------------------ */

describe('deriveMachineSetup — mode routing + honest recommended batch', () => {
  it('NC7 Swirl derives 460 g via the rule (NOT the mode-level 480 g preset)', () => {
    const nc7 = deriveMachineSetup(NINJA_CREAMI_SCOOP_SWIRL_NC7);
    expect(nc7.resolvedVisibleMode).toBe('ninja_swirl');
    expect(nc7.recommendedBatchGrams).toBe(460);
    expect(nc7.batchSuggestion).toEqual({
      kind: 'recommended_grams',
      grams: 460,
      source: 'respin_vessel_ml',
      safetyFactorApplied: 0.95,
      ruleVersion: HOME_BATCH_RULE_VERSION,
      estimated: false,
      servingModeId: 'ninja_swirl',
    });
  });

  it('KitchenAid derives 1330 g from the official 1400 ml max liquid mix', () => {
    const d = deriveMachineSetup(KITCHENAID_5KSMICM);
    expect(d.resolvedVisibleMode).toBe('fresh');
    expect(d.recommendedBatchGrams).toBe(1330);
    expect(d.batchSuggestion).toMatchObject({
      kind: 'recommended_grams',
      grams: 1330,
      source: 'maximum_liquid_mix_ml',
      safetyFactorApplied: 0.95,
    });
    // NEVER the finished-product 1900 ml (overrun) and never the bowl volume.
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
    expect(d.recommendedBatchGrams).toBeNull();
    expect(d.batchSuggestion).toEqual({ kind: 'none', reason: 'machine_not_home_supported' });
    expect(isMachineActivatable(soft)).toBe(false);
    expect(validateHomeMachineProfile(soft)).not.toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Owner rule — default neutrality (no recipe math in machine data)    */
/* ------------------------------------------------------------------ */

describe('owner rule — machine profiles are default-neutral (routing + capacity/UX only)', () => {
  it('module defaults are brand-neutral and never contain ingredient-specific rules', () => {
    for (const profile of MACHINE_CATALOG) {
      const module = deriveMachineSetup(profile).homeFormulationModule;
      expect(module.preference.sweetness).toBe(0);
      expect(JSON.stringify(module)).not.toMatch(/ingredient|sucrose|dextrose|fat_/i);
    }
  });

  it('the derivation output shape is pinned (no modifier field can sneak in silently)', () => {
    const derivation = deriveMachineSetup(NINJA_CREAMI_SCOOP_SWIRL_NC7);
    expect(Object.keys(derivation).sort()).toEqual([
      'batchSuggestion',
      'engineTemperatureC',
      'hardMaximumBatchGrams',
      'homeFormulationModule',
      'homeSupport',
      'maxFillDefinedByManufacturer',
      'preFreezeMinimumHours',
      'preFreezeTarget',
      'recommendedBatchGrams',
      'requiresPreFreeze',
      'resolvedVisibleMode',
      'workingCapacityMl',
    ]);
  });

  it('OWNER TEST 10 — the batch rule never touches Base Engine math (grams in, grams out)', () => {
    // (a) The machine layer NEVER imports the engine (see source hygiene below,
    //     which scans every file of this feature including homeBatchRule.ts).
    // (b) The rule's whole output is a plain provenance-carrying number — its
    //     shape is pinned so no engine-facing field can appear silently. A
    //     recipe computed at the same final grams therefore cannot change when
    //     the safety factor changes: the factor only chooses the DEFAULT grams.
    const recommended = recommendMachineBatch(NINJA_CREAMI_SCOOP_SWIRL_NC7);
    expect(recommended).not.toBeNull();
    expect(Object.keys(recommended!).sort()).toEqual([
      'estimated',
      'grams',
      'ruleVersion',
      'safetyFactorApplied',
      'source',
    ]);
    // Different factors → different DEFAULT grams, nothing else.
    const alt = recommendMachineBatch(NINJA_CREAMI_SCOOP_SWIRL_NC7, {
      safetyFactor: 0.9,
      ruleVersion: 'probe',
    });
    expect(alt?.grams).not.toBe(recommended!.grams);
    expect(Object.keys(alt!).sort()).toEqual(Object.keys(recommended!).sort());
  });
});

/* ------------------------------------------------------------------ */
/* Source hygiene — no 'Ninja 2', no engine imports, rule contract     */
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

  it('the versioned safety-factor rule lives in ONE module (no stray factor constants)', () => {
    const ruleText = readFileSync(join(FEATURE_DIR, 'homeBatchRule.ts'), 'utf8');
    expect(ruleText.includes('HOME_CONTAINER_SAFETY_FACTOR')).toBe(true);
    expect(ruleText.includes('HOME_BATCH_RULE_VERSION')).toBe(true);
    // No other module of the feature defines a factor or multiplies by 0.95.
    for (const file of featureSourceFiles()) {
      if (file.endsWith('homeBatchRule.ts')) continue;
      const text = readFileSync(file, 'utf8');
      expect(text.includes('SAFETY_FACTOR ='), `stray factor constant in ${file}`).toBe(false);
      // Same-line multiplication only (comments may mention the factor prose-style).
      expect(
        /\*[ \t]*0\.95|0\.95[ \t]*\*/.test(text),
        `inline 0.95 multiplication in ${file}`,
      ).toBe(false);
    }
  });
});
