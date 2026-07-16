/**
 * PINGÜINO Machine Catalog — versioned Annex-A seed data (EU/ES focus).
 *
 * Every number below comes STRAIGHT from spec Annex A (2026-07-16); source
 * URLs come from Annex B. Nothing was re-verified online in this pass, so per
 * the Annex-A rule ("re-confirm in the official manual of the exact model and
 * market before marking verified") NO record is `verified`:
 *  - numbers straight from Annex A            → `provisional`
 *  - official sources disagreeing (§9.3)      → `conflicting_sources` + inactive
 *  - capacity not confirmed at all (Sage)     → `needs_review` + inactive
 *
 * `null` means "the recorded sources do not state this" — never a guess. No
 * min/default/max batch and no working capacity is invented anywhere; batch
 * suggestions are derived honestly in `machineDerivation.ts`.
 *
 * This file is DATA ONLY: no engine references, no recipe modifiers, no
 * temperatures. Routing to existing modes lives in `technologyMode.ts`.
 */
import type { HomeMachineProfile } from './types';

/**
 * Catalog data version (spec §10.1 configVersion idea): bump on every data
 * change so a saved recipe / machine selection can name the exact catalog
 * revision it was created against.
 */
export const MACHINE_CATALOG_VERSION = '2026-07-16.1';

/** Provenance meta for the whole seed (report + future persistence track). */
export const MACHINE_CATALOG_META = {
  version: MACHINE_CATALOG_VERSION,
  seededFrom: 'UI/UX master spec Annex A + Annex B (2026-07-16)',
  verifiedOnline: false,
} as const;

/**
 * Ninja CREAMi NC302EU (EU/ES) — respin → existing Ninja Gelato mode.
 * Product page: 2 × 473 ml; official accessories pages also state 450 ml —
 * Annex A says resolve per container/model, and §9.3 forbids arbitrarily
 * picking one number, so the record is `conflicting_sources` and INACTIVE
 * until an owner resolves it with the model's manual. Annex A: use MAX FILL.
 */
export const NINJA_CREAMI_NC302EU: HomeMachineProfile = {
  id: 'ninja-creami-nc302eu-eu-es',
  brand: 'Ninja',
  family: 'CREAMi',
  modelCodes: ['NC302EU'],
  market: 'EU/ES',
  technology: 'respin',
  resolvedVisibleMode: 'ninja_gelato',
  capacity: {
    vesselCapacityMl: 473, // product-page figure; disputed — see sourceConflicts
    maximumLiquidMixMl: null,
    workingCapacityMl: null,
    minimumBatchMl: null,
    maximumBatchMl: null,
    defaultBatchMl: null,
    finishedProductCapacityMl: null,
    maxFillDefinedByManufacturer: true, // Annex A: "Używaj MAX FILL"
    vesselCount: 2,
  },
  requiresPreFreeze: true,
  preFreezeTarget: 'mixture',
  preFreezeMinimumHours: null, // duration not stated in Annex A — do not guess
  servingStyle: 'scoop',
  specificationSource: 'manufacturer_official',
  specificationSourceUrl: 'https://ninjakitchen.es/productos/ninja-creami-nc302eu-zidNC302EU',
  specificationStatus: 'conflicting_sources',
  sourceConflicts: [
    {
      field: 'vesselCapacityMl',
      candidatesMl: [473, 450],
      note:
        'Strona produktu podaje 2 × 473 ml, oficjalne strony akcesoriów podają również 450 ml — ' +
        'rozstrzygnąć per pojemnik/model instrukcją przed aktywacją (Annex A / §9.3).',
    },
  ],
  active: false,
};

/**
 * Ninja CREAMi Deluxe NC502EU (EU/ES) — respin → existing Ninja Gelato mode.
 * Catalog/product page: 2 × 706 ml; official accessories page states 680 ml —
 * Annex A explicitly marks this `conflicting_sources`, so the record is
 * INACTIVE until resolved with the model's manual.
 */
export const NINJA_CREAMI_DELUXE_NC502EU: HomeMachineProfile = {
  id: 'ninja-creami-deluxe-nc502eu-eu-es',
  brand: 'Ninja',
  family: 'CREAMi Deluxe',
  modelCodes: ['NC502EU'],
  market: 'EU/ES',
  technology: 'respin',
  resolvedVisibleMode: 'ninja_gelato',
  capacity: {
    vesselCapacityMl: 706, // catalog/product-page figure; disputed — see sourceConflicts
    maximumLiquidMixMl: null,
    workingCapacityMl: null,
    minimumBatchMl: null,
    maximumBatchMl: null,
    defaultBatchMl: null,
    finishedProductCapacityMl: null,
    maxFillDefinedByManufacturer: false, // MAX FILL not documented for NC5 in the recorded sources
    vesselCount: 2,
  },
  requiresPreFreeze: true,
  preFreezeTarget: 'mixture',
  preFreezeMinimumHours: null,
  servingStyle: 'scoop',
  specificationSource: 'manufacturer_official',
  specificationSourceUrl: 'https://ninjakitchen.es/catalogo-ninja/heladeras-ninja/',
  specificationStatus: 'conflicting_sources',
  sourceConflicts: [
    {
      field: 'vesselCapacityMl',
      candidatesMl: [706, 680],
      note:
        'Katalog/strona produktu podaje 2 × 706 ml; oficjalna strona akcesoriów ' +
        '(https://ninjakitchen.es/productos/tarrinas-con-tapa-2-unidades-para-creami-deluxe-nc5-zidXSKPNTLD2EUUK) ' +
        'podaje 680 ml — oznaczone conflicting_sources do rozstrzygnięcia instrukcją (Annex A / §9.3).',
    },
  ],
  active: false,
};

/**
 * Ninja CREAMi Scoop & Swirl NC7 (EU/ES) — respin_soft → existing Ninja Swirl
 * mode. 480 ml per the official catalog. Annex A: never classify as a
 * continuous soft-serve machine.
 */
export const NINJA_CREAMI_SCOOP_SWIRL_NC7: HomeMachineProfile = {
  id: 'ninja-creami-scoop-swirl-nc7-eu-es',
  brand: 'Ninja',
  family: 'CREAMi Scoop & Swirl',
  modelCodes: ['NC7'],
  market: 'EU/ES',
  technology: 'respin_soft',
  resolvedVisibleMode: 'ninja_swirl',
  capacity: {
    vesselCapacityMl: 480,
    maximumLiquidMixMl: null,
    workingCapacityMl: null,
    minimumBatchMl: null,
    maximumBatchMl: null,
    defaultBatchMl: null,
    finishedProductCapacityMl: null,
    maxFillDefinedByManufacturer: false, // not documented for NC7 in the recorded sources
    vesselCount: null, // tub count not stated in Annex A
  },
  requiresPreFreeze: true,
  preFreezeTarget: 'mixture',
  preFreezeMinimumHours: null,
  servingStyle: 'both', // "Scoop & Swirl" — scooped and soft dispense (name-level fact)
  specificationSource: 'manufacturer_official',
  specificationSourceUrl: 'https://ninjakitchen.es/catalogo-ninja/heladeras-ninja/',
  specificationStatus: 'provisional',
  active: true,
};

/**
 * Moulinex Freezi MJ803AF0 (ES) — compressor → existing Świeże (fresh) mode.
 * Capacities are PER PROGRAM (Annex A): up to 1.0 l ice cream, 1.4 l frozen
 * drink. The flat finished-product field carries the ice-cream program figure
 * (the PINGÜINO-relevant program); other programs stay verbatim per program.
 */
export const MOULINEX_FREEZI_MJ803AF0: HomeMachineProfile = {
  id: 'moulinex-freezi-mj803af0-es',
  brand: 'Moulinex',
  family: 'Freezi',
  modelCodes: ['MJ803AF0'],
  market: 'ES',
  technology: 'compressor',
  resolvedVisibleMode: 'fresh',
  capacity: {
    vesselCapacityMl: null, // bowl volume not stated in Annex A
    maximumLiquidMixMl: null,
    workingCapacityMl: null,
    minimumBatchMl: null,
    maximumBatchMl: null,
    defaultBatchMl: null,
    finishedProductCapacityMl: 1000, // ice-cream program
    maxFillDefinedByManufacturer: false,
    perProgram: [
      { program: 'ice_cream', capacityMl: 1000 },
      { program: 'frozen_drink', capacityMl: 1400 },
    ],
  },
  requiresPreFreeze: false,
  preFreezeTarget: 'none',
  servingStyle: 'scoop',
  specificationSource: 'manufacturer_official',
  specificationSourceUrl:
    'https://www.moulinex.es/p/heladera-freezi-prepara-helados-y-bebidas-heladas-al-momento-5-programas-automaticos-silenciosa-8-raciones-blanca/8010001501',
  specificationStatus: 'provisional',
  active: true,
};

/**
 * Magimix Gelato Expert — compressor → existing Świeże (fresh) mode. Annex A:
 * 1.0 l ice cream / 1.3 l sorbet-granita per program; PHYSICAL bowls are 2 l —
 * bowl volume must never be confused with working capacity, so working
 * capacity stays null. Market not stated per-row in Annex A; recorded as 'EU'
 * (international manufacturer page) pending per-market confirmation.
 */
export const MAGIMIX_GELATO_EXPERT: HomeMachineProfile = {
  id: 'magimix-gelato-expert-eu',
  brand: 'Magimix',
  family: 'Gelato Expert',
  modelCodes: [],
  market: 'EU',
  technology: 'compressor',
  resolvedVisibleMode: 'fresh',
  capacity: {
    vesselCapacityMl: 2000, // physical bowl volume — NOT a working capacity
    maximumLiquidMixMl: null,
    workingCapacityMl: null, // deliberately null (Annex A warning)
    minimumBatchMl: null,
    maximumBatchMl: null,
    defaultBatchMl: null,
    finishedProductCapacityMl: 1000, // ice-cream program
    maxFillDefinedByManufacturer: false,
    perProgram: [
      { program: 'ice_cream', capacityMl: 1000 },
      { program: 'sorbet_granita', capacityMl: 1300 },
    ],
  },
  requiresPreFreeze: false,
  preFreezeTarget: 'none',
  servingStyle: 'scoop',
  specificationSource: 'manufacturer_official',
  specificationSourceUrl:
    'https://www.magimix.com/en/gelato-expert/112-gelato-expert-5018399116801.html',
  specificationStatus: 'provisional',
  active: true,
};

/**
 * Cuisinart ICE100E (EU) — compressor → existing Świeże (fresh) mode. 1.5 l of
 * FINISHED dessert per the manufacturer; the maximum liquid mix is NOT stated
 * in the recorded sources and must be verified in the manual (Annex A) — it
 * stays null rather than being guessed from the finished volume.
 */
export const CUISINART_ICE100E: HomeMachineProfile = {
  id: 'cuisinart-ice100e-eu',
  brand: 'Cuisinart',
  family: 'ICE-100',
  modelCodes: ['ICE100E'],
  market: 'EU',
  technology: 'compressor',
  resolvedVisibleMode: 'fresh',
  capacity: {
    vesselCapacityMl: null,
    maximumLiquidMixMl: null, // Annex A: verify in the manual — do not guess
    workingCapacityMl: null,
    minimumBatchMl: null,
    maximumBatchMl: null,
    defaultBatchMl: null,
    finishedProductCapacityMl: 1500,
    maxFillDefinedByManufacturer: false,
  },
  requiresPreFreeze: false,
  preFreezeTarget: 'none',
  servingStyle: 'scoop',
  specificationSource: 'manufacturer_official',
  specificationSourceUrl:
    'https://www.cuisinart.eu/fr_FR/cuisinart-ice-cream-gelato-professional-ICE100E.html',
  specificationStatus: 'provisional',
  active: true,
};

/**
 * Cuisinart ICE21E (EU) — frozen bowl → Świeże as the neutral base (§10;
 * capacity/UX profile only, NO recipe modifiers). Annex A states 1.4 l; the
 * figure is recorded as the bowl (vessel) volume per frozen-bowl marketing —
 * confirm the exact meaning in the manual before verifying. Bowl pre-freeze
 * required (duration not stated).
 */
export const CUISINART_ICE21E: HomeMachineProfile = {
  id: 'cuisinart-ice21e-eu',
  brand: 'Cuisinart',
  family: 'ICE-21',
  modelCodes: ['ICE21E'],
  market: 'EU',
  technology: 'frozen_bowl',
  resolvedVisibleMode: 'fresh',
  capacity: {
    vesselCapacityMl: 1400,
    maximumLiquidMixMl: null,
    workingCapacityMl: null,
    minimumBatchMl: null,
    maximumBatchMl: null,
    defaultBatchMl: null,
    finishedProductCapacityMl: null,
    maxFillDefinedByManufacturer: false,
  },
  requiresPreFreeze: true,
  preFreezeTarget: 'bowl',
  preFreezeMinimumHours: null, // not stated in Annex A
  servingStyle: 'scoop',
  specificationSource: 'manufacturer_official',
  specificationSourceUrl:
    'https://www.cuisinart.eu/fr_FR/cuisinart-cool-scoops-sorbeti%C3%A8re-ICE21E.html',
  specificationStatus: 'provisional',
  active: true,
};

/**
 * Cuisinart ICE30BCE (EU) — frozen bowl → Świeże as the neutral base. Annex A:
 * 2.0 l (recorded as bowl volume, as for ICE21E); bowl needs ~12 h pre-freeze.
 */
export const CUISINART_ICE30BCE: HomeMachineProfile = {
  id: 'cuisinart-ice30bce-eu',
  brand: 'Cuisinart',
  family: 'ICE-30',
  modelCodes: ['ICE30BCE'],
  market: 'EU',
  technology: 'frozen_bowl',
  resolvedVisibleMode: 'fresh',
  capacity: {
    vesselCapacityMl: 2000,
    maximumLiquidMixMl: null,
    workingCapacityMl: null,
    minimumBatchMl: null,
    maximumBatchMl: null,
    defaultBatchMl: null,
    finishedProductCapacityMl: null,
    maxFillDefinedByManufacturer: false,
  },
  requiresPreFreeze: true,
  preFreezeTarget: 'bowl',
  preFreezeMinimumHours: 12, // Annex A: "około 12 h" — approximate manufacturer guidance
  servingStyle: 'scoop',
  specificationSource: 'manufacturer_official',
  specificationSourceUrl:
    'https://www.cuisinart.eu/fr_FR/cuisinart-sorbeti%C3%A8re-deluxe-2l-ICE30BCE.html',
  specificationStatus: 'provisional',
  active: true,
};

/**
 * KitchenAid 5KSMICM (UK/EU) — frozen bowl → Świeże as the neutral base.
 * Annex A: 1.9 l of finished ice cream from at most 1.4 l of liquid mix
 * (the two figures are DIFFERENT §9.1 facts and stay separate); bowl
 * pre-freeze minimum 16 h.
 */
export const KITCHENAID_5KSMICM: HomeMachineProfile = {
  id: 'kitchenaid-5ksmicm-uk-eu',
  brand: 'KitchenAid',
  family: 'Ice Cream Maker',
  modelCodes: ['5KSMICM'],
  market: 'UK/EU',
  technology: 'frozen_bowl',
  resolvedVisibleMode: 'fresh',
  capacity: {
    vesselCapacityMl: null, // bowl volume itself not stated in Annex A
    maximumLiquidMixMl: 1400,
    workingCapacityMl: null,
    minimumBatchMl: null,
    maximumBatchMl: null,
    defaultBatchMl: null,
    finishedProductCapacityMl: 1900,
    maxFillDefinedByManufacturer: false,
  },
  requiresPreFreeze: true,
  preFreezeTarget: 'bowl',
  preFreezeMinimumHours: 16,
  servingStyle: 'scoop',
  specificationSource: 'manufacturer_official',
  specificationSourceUrl:
    'https://www.kitchenaid.co.uk/mixer-attachments/859711690400/ice-cream-maker-5ksmicm-white',
  specificationStatus: 'provisional',
  active: true,
};

/**
 * Sage / Breville Smart Scoop BCI600 — compressor technology is confirmed, but
 * EVERY capacity requires confirmation in the manual of the exact market
 * (Annex A: "nie zgaduj batchu"). All capacity fields stay null, the record is
 * `needs_review` and INACTIVE until an owner confirms the numbers. Market
 * recorded from the UK manufacturer page pending per-market confirmation.
 */
export const SAGE_SMART_SCOOP_BCI600: HomeMachineProfile = {
  id: 'sage-smart-scoop-bci600-uk-eu',
  brand: 'Sage / Breville',
  family: 'Smart Scoop',
  modelCodes: ['BCI600'],
  market: 'UK/EU',
  technology: 'compressor',
  resolvedVisibleMode: 'fresh',
  capacity: {
    vesselCapacityMl: null,
    maximumLiquidMixMl: null,
    workingCapacityMl: null,
    minimumBatchMl: null,
    maximumBatchMl: null,
    defaultBatchMl: null,
    finishedProductCapacityMl: null,
    maxFillDefinedByManufacturer: false,
  },
  requiresPreFreeze: false,
  preFreezeTarget: 'none',
  servingStyle: 'scoop',
  specificationSource: 'manufacturer_official',
  specificationSourceUrl: 'https://www.sageappliances.com/en-gb/product/bci600',
  specificationStatus: 'needs_review',
  active: false,
};

/** The full versioned catalog, in the §8.2 onboarding family order. */
export const MACHINE_CATALOG: readonly HomeMachineProfile[] = [
  NINJA_CREAMI_NC302EU,
  NINJA_CREAMI_DELUXE_NC502EU,
  NINJA_CREAMI_SCOOP_SWIRL_NC7,
  MOULINEX_FREEZI_MJ803AF0,
  SAGE_SMART_SCOOP_BCI600,
  MAGIMIX_GELATO_EXPERT,
  CUISINART_ICE100E,
  KITCHENAID_5KSMICM,
  CUISINART_ICE21E,
  CUISINART_ICE30BCE,
];
