/**
 * PINGÜINO Machine Catalog — versioned Annex-A seed data (EU/ES focus).
 *
 * Every supported record below was re-checked against current official
 * manufacturer evidence on 2026-09-05. Evidence names the exact facts used;
 * the shared Gellatti fill rule remains the only authority that turns an
 * approved working/cycle capacity into an operating batch in grams.
 *
 * `null` means "the recorded sources do not state this" — never a guess. No
 * min/default/max batch and no working capacity is invented anywhere; batch
 * suggestions are derived honestly in `machineDerivation.ts`.
 *
 * This file is DATA ONLY: no engine formulas or ingredient rules. It assigns
 * the brand-neutral formulation module and records official capacity facts.
 */
import type { HomeMachineProfile } from './types';

/**
 * Catalog data version (spec §10.1 configVersion idea): bump on every data
 * change so a saved recipe / machine selection can name the exact catalog
 * revision it was created against.
 *
 * 2026-07-17.2 — owner CORRECTION („UNIWERSALNY MARGINES BEZPIECZEŃSTWA
 * HOME”) + capacity-conflict investigation, recorded together:
 *  1. WITHDRAWN: fixed per-model gram constants (CREAMi standard 450 g /
 *     Deluxe 660 g) — no record stores hardcoded grams. The recommended Home
 *     batch is DERIVED by the configurable, versioned rule in
 *     `homeBatchRule.ts` (0.95 safety factor over a CONFIRMED usable
 *     capacity; manufacturer max-mix grams used directly; physical bowl
 *     volume never auto-used; conflicted figures never produce a number).
 *  2. Capacity-conflict INVESTIGATION (2026-07-17, live official ES pages;
 *     ninjakitchen.es now 301-redirects to www.sharkninja.es): the product
 *     pages and the accessories pages still disagree (473 vs 450 ml; 706 vs
 *     680 ml) and NO official page qualifies either figure as a different
 *     CONCEPT (no MAX FILL wording, no usable-vs-brim distinction anywhere on
 *     the ES retail pages). Evidence quoted in each record's conflict note.
 *     Verdict: INCONCLUSIVE — NC302EU and NC502EU therefore stay
 *     `conflicting_sources` and INACTIVE (no derivable recommended batch; a
 *     number is never invented), pending the owner's per-model resolution.
 *     Scoop & Swirl NC7 (480 ml, official catalog, UNCONFLICTED) derives
 *     460 g via the rule. Sage stays inactive (`needs_review`).
 */
/*
 * 2026-07-17.3 — OWNER FINAL DECISION („KOŃCOWA WIĄŻĄCA DECYZJA — POJEMNOŚCI,
 * EDYCJA WSADU I WDROŻENIE"): the capacity investigation is CLOSED — no new
 * statuses, exceptions or blocks. Manufacturer ml figures are pinned per
 * model (standard 473, Deluxe 706, Swirl 480, KitchenAid 1400) and the
 * universal ×0.95 rule derives the recommended batch (450 / 670 / 460 /
 * 1330 g) as a SOFT starting proposal — always editable, never a hard limit.
 * NC302EU and NC502EU become ACTIVE with status `provisional`; their
 * historical retail-page figure disputes remain in doc comments as
 * provenance only (never user-facing, never blocking).
 */
/*
 * 2026-08-28.1 — Sage Smart Scoop exact EU/ES product + BCI600/SCI600 manual
 * verification activates the existing record. Owner approval applies the same
 * shared ×0.95 operating-vessel policy as the Ninja Home profiles: the verified
 * 1.0 L vessel derives 950 g as Gellatti guidance, not manufacturer grams.
 * 2026-08-28.2 — complete current manufacturer evidence, working/cycle
 * capacities and product-aware batch authority for all ten supported records.
 */
export const MACHINE_CATALOG_VERSION = '2026-09-05.1';

/** Provenance meta for the whole seed (report + future persistence track). */
export const MACHINE_CATALOG_META = {
  version: MACHINE_CATALOG_VERSION,
  seededFrom: 'UI/UX master spec Annex A + Annex B (2026-07-16)',
  verifiedOnline: true,
  exactRecordsVerifiedOnline: [
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
  ],
} as const;

/**
 * Ninja CREAMi NC302EU (EU/ES) — respin → existing Ninja Gelato mode.
 *
 * OWNER FINAL DECISION (2026-07-17, „KOŃCOWA WIĄŻĄCA DECYZJA — POJEMNOŚCI"):
 * the capacity investigation is CLOSED. The manufacturer figure is pinned to
 * the product-page 473 ml and the universal 0.95 rule yields the recommended
 * batch (473 × 0.95 = 449.35 → 450 g) — a soft starting proposal, never a
 * hard limit. The record is ACTIVE with status `provisional`; the historical
 * 473-vs-450 retail-page dispute (product page „tarrinas de 473 ml" vs
 * accessory pages XSK2PNT300EUK/XSK4PINTEUUK „Capacidad: 450 ml por tarrina",
 * both live-read 2026-07-17 after the ninjakitchen.es → sharkninja.es 301) is
 * kept HERE as provenance only — it is never shown to users and never blocks
 * selection.
 */
export const NINJA_CREAMI_NC302EU: HomeMachineProfile = {
  id: 'ninja-creami-nc302eu-eu-es',
  displayName: 'Ninja CREAMi',
  searchAliases: ['Ninja CREAMi NC302EU'],
  brand: 'Ninja',
  family: 'CREAMi',
  modelCodes: ['NC302EU'],
  market: 'EU/ES',
  technology: 'respin',
  homeFormulationModuleId: 'FROZEN_PINT',
  resolvedVisibleMode: 'ninja_gelato',
  capacity: {
    vesselCapacityMl: 473, // owner-pinned figure (final decision 2026-07-17) → 450 g via ×0.95
    maximumLiquidMixMl: null,
    workingCapacityMl: null,
    minimumBatchMl: null,
    maximumBatchMl: 473,
    hardMaximumBatchGrams: null,
    trueHardMaximumDocumented: true,
    defaultBatchMl: null,
    finishedProductCapacityMl: null,
    maxFillDefinedByManufacturer: true, // Annex A: "Używaj MAX FILL"
    maxFillRules: [
      {
        kind: 'marked_line',
        scope: 'CREAMi tub',
        exception: 'A Ninja-authored recipe may explicitly instruct filling above the line.',
      },
    ],
    vesselCount: 2,
  },
  recommendedBatchBasis: 'confirmed_vessel_capacity',
  requiresPreFreeze: true,
  preFreezeTarget: 'mixture',
  preFreezeMinimumHours: null, // duration not stated in Annex A — do not guess
  servingStyle: 'scoop',
  specificationSource: 'manufacturer_official',
  // Live destination of the Annex-B URL (301 from ninjakitchen.es, 2026-07-17).
  specificationSourceUrl:
    'https://www.sharkninja.es/ninja-creami-6-funciones-pack-ahorro-6-tarrinas/NC302EUBES.html',
  // Owner final decision (2026-07-17): provisional + ACTIVE; the retail-page
  // figure dispute lives in the doc comment above as provenance — no blocking
  // sourceConflicts entry, nothing user-facing.
  specificationEvidence: [
    {
      kind: 'product_page',
      url: 'https://www.sharkninja.es/ninja-creami-6-funciones-pack-ahorro-6-tarrinas/NC302EUBES.html',
      verifiedFacts: ['nc302eu_family', 'two_473_ml_tubs', 'max_fill', 'mixture_pre_freeze'],
    },
  ],
  specificationVerifiedAt: '2026-09-05',
  specificationStatus: 'verified',
  active: true,
};

/**
 * Ninja CREAMi Deluxe NC502EU (EU/ES) — respin → existing Ninja Gelato mode.
 *
 * OWNER FINAL DECISION (2026-07-17, „KOŃCOWA WIĄŻĄCA DECYZJA — POJEMNOŚCI"):
 * investigation CLOSED; the manufacturer figure is pinned to the product-page
 * 706 ml and the 0.95 rule yields the recommended batch (706 × 0.95 = 670.70
 * → 670 g) — a soft starting proposal, never a hard limit. ACTIVE +
 * `provisional`. The historical 706-vs-680 dispute (product page „tarrinas de
 * 706 ml" vs accessory page XSKPNTLD2EUUK „Capacidad: 680 ml por tarrina",
 * live-read 2026-07-17) stays HERE as provenance only — never user-facing,
 * never blocking.
 */
export const NINJA_CREAMI_DELUXE_NC502EU: HomeMachineProfile = {
  id: 'ninja-creami-deluxe-nc502eu-eu-es',
  displayName: 'Ninja CREAMi Deluxe',
  searchAliases: ['Ninja CREAMi Deluxe NC502EU'],
  brand: 'Ninja',
  family: 'CREAMi Deluxe',
  modelCodes: ['NC502EU'],
  market: 'EU/ES',
  technology: 'respin',
  homeFormulationModuleId: 'FROZEN_PINT',
  resolvedVisibleMode: 'ninja_gelato',
  capacity: {
    vesselCapacityMl: 706, // owner-pinned figure (final decision 2026-07-17) → 670 g via ×0.95
    maximumLiquidMixMl: null,
    workingCapacityMl: null,
    minimumBatchMl: null,
    maximumBatchMl: 706,
    hardMaximumBatchGrams: null,
    trueHardMaximumDocumented: true,
    defaultBatchMl: null,
    finishedProductCapacityMl: null,
    maxFillDefinedByManufacturer: true,
    maxFillRules: [{ kind: 'marked_line', scope: 'Deluxe tub (24 fl oz line)' }],
    vesselCount: 2,
  },
  recommendedBatchBasis: 'confirmed_vessel_capacity',
  requiresPreFreeze: true,
  preFreezeTarget: 'mixture',
  preFreezeMinimumHours: null,
  servingStyle: 'scoop',
  specificationSource: 'manufacturer_official',
  // Model-exact live product page (stronger source than the old catalog URL,
  // which now 301-redirects to the sharkninja.es catalog; re-read 2026-07-17).
  specificationSourceUrl:
    'https://www.sharkninja.es/ninja-creami-deluxe-10-funciones-pack-ahorro-4-tarrinas/NC502EUBES.html',
  // Owner final decision (2026-07-17): provisional + ACTIVE; dispute history
  // lives in the doc comment above as provenance — never user-facing, never
  // blocking.
  specificationEvidence: [
    {
      kind: 'product_page',
      url: 'https://www.sharkninja.es/ninja-creami-deluxe-10-funciones-pack-ahorro-4-tarrinas/NC502EUBES.html',
      verifiedFacts: ['nc502eu_family', 'two_706_ml_tubs', 'mixture_pre_freeze'],
    },
  ],
  specificationVerifiedAt: '2026-09-05',
  specificationStatus: 'verified',
  active: true,
};

/**
 * Ninja CREAMi Scoop & Swirl NC7 (EU/ES) — respin_soft → existing Ninja Swirl
 * mode. 480 ml per the official catalog (re-read live 2026-07-17 on the
 * sharkninja.es catalog page: „CREAMi Scoop & Swirl … Tarrinas de 480 ml.” —
 * UNCONFLICTED). Annex A: never classify as a continuous soft-serve machine.
 *
 * Owner correction (2026-07-17): no hardcoded grams — the recommended batch
 * derives from the model's own confirmed tub figure via the universal 0.95
 * rule (480 ml → 460 g, an owner worked example). The six-mode flow's own
 * 480 g ninja_swirl preset is mode-level behavior outside this catalog.
 */
export const NINJA_CREAMI_SCOOP_SWIRL_NC7: HomeMachineProfile = {
  id: 'ninja-creami-scoop-swirl-nc7-eu-es',
  displayName: 'Ninja CREAMi Scoop & Swirl',
  searchAliases: ['Ninja Scoop & Swirl', 'Ninja NC7'],
  brand: 'Ninja',
  family: 'CREAMi Scoop & Swirl',
  modelCodes: ['NC7', 'NC701EU'],
  market: 'EU/ES',
  technology: 'respin_soft',
  homeFormulationModuleId: 'SOFT_DISPENSE',
  resolvedVisibleMode: 'ninja_swirl',
  capacity: {
    vesselCapacityMl: 480,
    maximumLiquidMixMl: null,
    workingCapacityMl: null,
    minimumBatchMl: null,
    maximumBatchMl: 480,
    hardMaximumBatchGrams: null,
    trueHardMaximumDocumented: true,
    defaultBatchMl: null,
    finishedProductCapacityMl: null,
    maxFillDefinedByManufacturer: true,
    maxFillRules: [{ kind: 'marked_line', scope: 'Swirl tub (16 fl oz line)' }],
    vesselCount: 2,
  },
  recommendedBatchBasis: 'confirmed_vessel_capacity',
  requiresPreFreeze: true,
  preFreezeTarget: 'mixture',
  preFreezeMinimumHours: null,
  servingStyle: 'both', // "Scoop & Swirl" — scooped and soft dispense (name-level fact)
  specificationSource: 'manufacturer_official',
  specificationSourceUrl:
    'https://www.sharkninja.es/ninja-creami-scoop-swirl-12-funciones-2-tarrinas-grisnegro/NC701EU.html',
  specificationEvidence: [
    {
      kind: 'product_page',
      url: 'https://www.sharkninja.es/ninja-creami-scoop-swirl-12-funciones-2-tarrinas-grisnegro/NC701EU.html',
      verifiedFacts: ['nc7_family', '480_ml_tub', 'scoop_and_soft_dispense', 'mixture_pre_freeze'],
    },
  ],
  specificationVerifiedAt: '2026-09-05',
  specificationStatus: 'verified',
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
  displayName: 'Moulinex Freezi',
  searchAliases: ['Moulinex Freezi MJ803AF0'],
  brand: 'Moulinex',
  family: 'Freezi',
  modelCodes: ['MJ803AF0'],
  market: 'ES',
  technology: 'compressor',
  homeFormulationModuleId: 'COMPRESSOR',
  resolvedVisibleMode: 'fresh',
  capacity: {
    vesselCapacityMl: null, // bowl volume not stated in Annex A
    maximumLiquidMixMl: 1000,
    workingCapacityMl: 1000,
    minimumBatchMl: null,
    maximumBatchMl: 1000,
    hardMaximumBatchGrams: null,
    trueHardMaximumDocumented: true,
    defaultBatchMl: null,
    finishedProductCapacityMl: 1400,
    maxFillDefinedByManufacturer: true,
    maxFillRules: [
      { kind: 'marked_line', scope: 'ice cream / frozen yogurt: 550–1000 ml input' },
      { kind: 'marked_line', scope: 'frozen drinks: 550–1200 ml input' },
    ],
    vesselCount: 1,
    perProgram: [
      { program: 'ice_cream', capacityMl: 1000 },
      { program: 'frozen_drink_input', capacityMl: 1200 },
      { program: 'frozen_drink_finished', capacityMl: 1400 },
    ],
  },
  productWorkingCapacities: [
    { productProfile: 'gelato', workingCapacityMl: 1000 },
    { productProfile: 'sorbet', workingCapacityMl: 1000 },
    { productProfile: 'vegan', workingCapacityMl: 1000 },
    { productProfile: 'protein', workingCapacityMl: 1000 },
    { productProfile: 'frozen_drink', workingCapacityMl: 1200 },
  ],
  requiresPreFreeze: false,
  preFreezeTarget: 'none',
  servingStyle: 'scoop',
  specificationSource: 'manufacturer_official',
  specificationSourceUrl:
    'https://www.moulinex.es/instrucciones-de-uso/coccion-electrica/helados/heladera-freezi-prepara-helados-y-bebidas-heladas-al-momento-5-programas-automaticos-silenciosa-8-raciones-blanca/csp/8010001501',
  specificationEvidence: [
    {
      kind: 'product_page',
      url: 'https://www.moulinex.es/instrucciones-de-uso/coccion-electrica/helados/heladera-freezi-prepara-helados-y-bebidas-heladas-al-momento-5-programas-automaticos-silenciosa-8-raciones-blanca/csp/8010001501',
      verifiedFacts: [
        'mj803af0_family',
        'self_cooling',
        'five_programs',
        'frozen_drink_capacity_1400',
      ],
    },
    {
      kind: 'manual',
      url: 'https://dam.groupeseb.com/m/4992c4f36c96c2f3/original/8020013190-IFU-pdf.pdf',
      verifiedFacts: ['ice_cream_input_550_to_1000_ml', 'frozen_drink_input_550_to_1200_ml'],
    },
  ],
  specificationVerifiedAt: '2026-09-05',
  specificationStatus: 'verified',
  operatingFeatures: {
    selfCooling: true,
    preCoolSupported: false,
    preCoolOptional: false,
    keepCoolSupported: false,
    keepCoolMaximumHours: null,
    hardnessSettings: null,
    dessertFamilies: ['Ice Cream', 'Frozen Yogurt', 'Sorbet', 'Frozen Drink'],
  },
  active: true,
};

/**
 * Magimix Gelato Expert — compressor → existing Świeże (fresh) mode. Annex A:
 * 1.0 l ice cream / 1.3 l sorbet-granita per program; PHYSICAL bowls are 2 l —
 * bowl volume must never be confused with the separately recorded program
 * working capacities. Market not stated per-row in Annex A; recorded as 'EU'
 * (international manufacturer page) pending per-market confirmation.
 */
export const MAGIMIX_GELATO_EXPERT: HomeMachineProfile = {
  id: 'magimix-gelato-expert-eu',
  displayName: 'Magimix Gelato Expert',
  searchAliases: ['Magimix Gelato Expert'],
  brand: 'Magimix',
  family: 'Gelato Expert',
  modelCodes: [],
  market: 'EU',
  technology: 'compressor',
  homeFormulationModuleId: 'COMPRESSOR',
  resolvedVisibleMode: 'fresh',
  capacity: {
    vesselCapacityMl: 2000, // physical bowl volume — NOT a working capacity
    maximumLiquidMixMl: 1000,
    workingCapacityMl: 1000, // verified ice-cream/Gelato working program, not the 2 L bowl
    minimumBatchMl: null,
    maximumBatchMl: 1000,
    hardMaximumBatchGrams: null,
    trueHardMaximumDocumented: true,
    defaultBatchMl: null,
    finishedProductCapacityMl: 1000, // ice-cream program
    maxFillDefinedByManufacturer: true,
    maxFillRules: [
      { kind: 'fraction_of_vessel', fraction: 0.5, program: 'gelato' },
      { kind: 'fraction_of_vessel', fraction: 2 / 3, program: 'sorbet_granita' },
    ],
    vesselCount: 2,
    perProgram: [
      { program: 'ice_cream', capacityMl: 1000 },
      { program: 'sorbet_granita', capacityMl: 1300 },
    ],
  },
  productWorkingCapacities: [
    { productProfile: 'gelato', workingCapacityMl: 1000 },
    { productProfile: 'sorbet', workingCapacityMl: 1300 },
    { productProfile: 'vegan', workingCapacityMl: 1000 },
    { productProfile: 'protein', workingCapacityMl: 1000 },
  ],
  requiresPreFreeze: false,
  preFreezeTarget: 'none',
  servingStyle: 'scoop',
  specificationSource: 'manufacturer_official',
  specificationSourceUrl:
    'https://www.magimix.com/en/gelato-expert/112-gelato-expert-5018399116801.html',
  specificationEvidence: [
    {
      kind: 'product_page',
      url: 'https://www.magimix.com/en/gelato-expert/112-gelato-expert-5018399116801.html',
      verifiedFacts: [
        'two_two_litre_bowls',
        'one_litre_ice_cream_working_capacity',
        'one_point_three_litre_sorbet_granita_working_capacity',
        'built_in_freezer',
        'no_bowl_pre_freeze',
      ],
    },
    {
      kind: 'manual',
      url: 'https://www.magimix.com/en/faq?category=10',
      verifiedFacts: ['half_bowl_gelato_fill', 'two_thirds_bowl_sorbet_fill'],
    },
  ],
  specificationVerifiedAt: '2026-09-05',
  specificationStatus: 'verified',
  operatingFeatures: {
    selfCooling: true,
    preCoolSupported: false,
    preCoolOptional: false,
    keepCoolSupported: false,
    keepCoolMaximumHours: null,
    hardnessSettings: null,
    dessertFamilies: ['Ice Cream', 'Gelato', 'Sorbet', 'Granita'],
  },
  active: true,
};

/**
 * Cuisinart ICE100E (EU) — compressor → existing Świeże (fresh) mode. 1.5 l of
 * FINISHED dessert per the manufacturer; its manual separately limits an own
 * liquid recipe to about 1.0 l and requires 4 cm expansion clearance.
 */
export const CUISINART_ICE100E: HomeMachineProfile = {
  id: 'cuisinart-ice100e-eu',
  displayName: 'Cuisinart ICE-100',
  searchAliases: ['Cuisinart ICE100E'],
  brand: 'Cuisinart',
  family: 'ICE-100',
  modelCodes: ['ICE100E', 'ICE100BCU'],
  market: 'EU/UK',
  technology: 'compressor',
  homeFormulationModuleId: 'COMPRESSOR',
  resolvedVisibleMode: 'fresh',
  capacity: {
    vesselCapacityMl: 1500,
    maximumLiquidMixMl: 1000,
    workingCapacityMl: 1000,
    minimumBatchMl: null,
    maximumBatchMl: 1000,
    hardMaximumBatchGrams: null,
    trueHardMaximumDocumented: true,
    defaultBatchMl: null,
    finishedProductCapacityMl: 1500,
    maxFillDefinedByManufacturer: true,
    maxFillRules: [{ kind: 'clearance_from_rim', clearanceMm: 40, scope: 'own liquid recipe' }],
    vesselCount: 1,
  },
  requiresPreFreeze: false,
  preFreezeTarget: 'none',
  servingStyle: 'scoop',
  specificationSource: 'manufacturer_official',
  specificationSourceUrl:
    'https://www.cuisinart.eu/en/cuisinart-ice-cream-gelato-professional-ICE100E.html',
  specificationEvidence: [
    {
      kind: 'product_page',
      url: 'https://www.cuisinart.eu/en/cuisinart-ice-cream-gelato-professional-ICE100E.html',
      verifiedFacts: [
        'one_point_five_litre_capacity',
        'professional_compressor',
        'no_bowl_pre_freeze',
      ],
    },
    {
      kind: 'manual',
      url: 'https://www.cuisinart.eu/on/demandware.static/-/Sites-master-eu/fr_FR/v1773615795596/information-booklets/EU/ICE100E%20-%20Notice.pdf',
      verifiedFacts: ['one_point_five_litre_bowl', 'own_recipe_max_one_litre', 'four_cm_clearance'],
    },
  ],
  specificationVerifiedAt: '2026-09-05',
  specificationStatus: 'verified',
  operatingFeatures: {
    selfCooling: true,
    preCoolSupported: false,
    preCoolOptional: false,
    keepCoolSupported: true,
    keepCoolMaximumHours: null,
    hardnessSettings: null,
    dessertFamilies: ['Ice Cream', 'Gelato', 'Sorbet', 'Frozen Yogurt'],
  },
  active: true,
};

/**
 * Cuisinart ICE21E (EU) — frozen bowl → Świeże as the neutral base (§10;
 * capacity/UX profile only, NO recipe modifiers). Official evidence states a
 * 1.4 l recipe yield ceiling without establishing the bowl's physical brim
 * volume. The manual requires a 16–24 hour bowl pre-freeze.
 */
export const CUISINART_ICE21E: HomeMachineProfile = {
  id: 'cuisinart-ice21e-eu',
  displayName: 'Cuisinart ICE-21',
  searchAliases: ['Cuisinart ICE21E'],
  brand: 'Cuisinart',
  family: 'ICE-21',
  modelCodes: ['ICE21E', 'ICE21U'],
  market: 'EU/UK',
  technology: 'frozen_bowl',
  homeFormulationModuleId: 'FROZEN_BOWL',
  resolvedVisibleMode: 'fresh',
  capacity: {
    vesselCapacityMl: null,
    maximumLiquidMixMl: null,
    workingCapacityMl: 1400,
    minimumBatchMl: null,
    maximumBatchMl: 1400,
    hardMaximumBatchGrams: null,
    trueHardMaximumDocumented: true,
    defaultBatchMl: null,
    finishedProductCapacityMl: 1400,
    maxFillDefinedByManufacturer: false,
    vesselCount: 1,
  },
  requiresPreFreeze: true,
  preFreezeTarget: 'bowl',
  preFreezeMinimumHours: 16,
  servingStyle: 'scoop',
  specificationSource: 'manufacturer_official',
  specificationSourceUrl:
    'https://www.cuisinart.eu/en/cuisinart-cool-scoops-ice-cream-maker-ICE21E.html',
  specificationEvidence: [
    {
      kind: 'product_page',
      url: 'https://www.cuisinart.eu/en/cuisinart-cool-scoops-ice-cream-maker-ICE21E.html',
      verifiedFacts: [
        'one_point_four_litre_capacity',
        'freezer_bowl',
        'twelve_hour_bowl_pre_freeze',
      ],
    },
    {
      kind: 'manual',
      url: 'https://www.cuisinart.eu/on/demandware.static/-/Sites-master-eu/fr_FR/v1776330276668/information-booklets/ICE21E_Manual.pdf',
      verifiedFacts: [
        'recipe_yield_no_more_than_1400_ml',
        'sixteen_to_twenty_four_hour_bowl_pre_freeze',
      ],
    },
  ],
  specificationVerifiedAt: '2026-09-05',
  specificationStatus: 'verified',
  active: true,
};

/**
 * Cuisinart ICE30BCE (EU) — frozen bowl → Świeże as the neutral base. Annex A:
 * 2.0 l (recorded as bowl volume, as for ICE21E); bowl needs ~12 h pre-freeze.
 */
export const CUISINART_ICE30BCE: HomeMachineProfile = {
  id: 'cuisinart-ice30bce-eu',
  displayName: 'Cuisinart ICE-30',
  searchAliases: ['Cuisinart ICE30BCE'],
  brand: 'Cuisinart',
  family: 'ICE-30',
  modelCodes: ['ICE30BCE', 'ICE30BCU'],
  market: 'EU/UK',
  technology: 'frozen_bowl',
  homeFormulationModuleId: 'FROZEN_BOWL',
  resolvedVisibleMode: 'fresh',
  capacity: {
    vesselCapacityMl: 2000,
    maximumLiquidMixMl: 1500,
    workingCapacityMl: 1500,
    minimumBatchMl: null,
    maximumBatchMl: 1500,
    hardMaximumBatchGrams: null,
    trueHardMaximumDocumented: true,
    defaultBatchMl: null,
    finishedProductCapacityMl: 2000,
    maxFillDefinedByManufacturer: true,
    maxFillRules: [{ kind: 'clearance_from_rim', clearanceMm: 20, scope: 'liquid recipe' }],
    vesselCount: 1,
  },
  requiresPreFreeze: true,
  preFreezeTarget: 'bowl',
  preFreezeMinimumHours: 12, // Annex A: "około 12 h" — approximate manufacturer guidance
  servingStyle: 'scoop',
  specificationSource: 'manufacturer_official',
  specificationSourceUrl: 'https://www.cuisinart.eu/en/cuisinart-ice-cream-maker-2l-ICE30BCE.html',
  specificationEvidence: [
    {
      kind: 'product_page',
      url: 'https://www.cuisinart.eu/en/cuisinart-ice-cream-maker-2l-ICE30BCE.html',
      verifiedFacts: ['two_litre_capacity', 'freezer_bowl', 'twelve_hour_bowl_pre_freeze'],
    },
    {
      kind: 'manual',
      url: 'https://www.cuisinart.eu/on/demandware.static/-/Sites-master-eu/default/v1776589445503/information-booklets/EU/ICE30BCE%20-%20Notice.pdf',
      verifiedFacts: ['liquid_mix_no_more_than_1500_ml', 'two_cm_clearance'],
    },
  ],
  specificationVerifiedAt: '2026-09-05',
  specificationStatus: 'verified',
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
  displayName: 'KitchenAid Ice Cream Maker',
  searchAliases: ['KitchenAid 5KSMICM'],
  brand: 'KitchenAid',
  family: 'Ice Cream Maker',
  modelCodes: ['5KSMICM'],
  market: 'UK/EU',
  technology: 'frozen_bowl',
  homeFormulationModuleId: 'FROZEN_BOWL',
  resolvedVisibleMode: 'fresh',
  capacity: {
    vesselCapacityMl: 1900,
    maximumLiquidMixMl: 1400,
    workingCapacityMl: 1400,
    minimumBatchMl: null,
    maximumBatchMl: 1400,
    hardMaximumBatchGrams: null,
    trueHardMaximumDocumented: true,
    defaultBatchMl: null,
    finishedProductCapacityMl: 1900,
    maxFillDefinedByManufacturer: false,
    vesselCount: 1,
  },
  requiresPreFreeze: true,
  preFreezeTarget: 'bowl',
  preFreezeMinimumHours: 16,
  servingStyle: 'scoop',
  specificationSource: 'manufacturer_official',
  specificationSourceUrl:
    'https://www.kitchenaid.co.uk/mixer-attachments/859711690400/ice-cream-maker-5ksmicm-white',
  specificationEvidence: [
    {
      kind: 'product_page',
      url: 'https://www.kitchenaid.co.uk/mixer-attachments/859711690400/ice-cream-maker-5ksmicm-white',
      verifiedFacts: [
        'one_point_four_litre_initial_mix',
        'one_point_nine_litre_finished_product',
        'freezer_bowl',
        'sixteen_hour_bowl_pre_freeze',
      ],
    },
  ],
  specificationVerifiedAt: '2026-09-05',
  specificationStatus: 'verified',
  active: true,
};

/**
 * Sage Smart Scoop BCI600 / SCI600 — exact EU/ES official evidence re-verified
 * 2026-08-28. The manufacturer states a 1.0 L removable bowl, self-cooling
 * operation, optional PRE-COOL, KEEP COOL up to 3 hours and four dessert
 * programs. The owner separately approved the shared Gellatti Home fill rule
 * for this confirmed vessel: 1000 × 0.95 → 950 g. That is a Gellatti operating
 * recommendation, never a manufacturer-stated gram value.
 */
export const SAGE_SMART_SCOOP_BCI600: HomeMachineProfile = {
  id: 'sage-smart-scoop-bci600-uk-eu',
  displayName: 'Sage Smart Scoop',
  searchAliases: [
    'Sage Smart Scoop',
    'Sage the Smart Scoop',
    'Breville Smart Scoop',
    'BCI600',
    'SCI600',
    'SCI600BSS2EEU1',
  ],
  brand: 'Sage',
  family: 'Smart Scoop',
  modelCodes: ['BCI600', 'SCI600', 'SCI600BSS2EEU1'],
  market: 'EU/ES',
  technology: 'compressor',
  homeFormulationModuleId: 'COMPRESSOR',
  resolvedVisibleMode: 'fresh',
  capacity: {
    vesselCapacityMl: 1000,
    maximumLiquidMixMl: null,
    workingCapacityMl: null,
    minimumBatchMl: null,
    maximumBatchMl: null,
    hardMaximumBatchGrams: null,
    trueHardMaximumDocumented: false,
    defaultBatchMl: null,
    finishedProductCapacityMl: null,
    maxFillDefinedByManufacturer: false,
    vesselCount: 1,
  },
  recommendedBatchBasis: 'confirmed_vessel_capacity',
  requiresPreFreeze: false,
  preFreezeTarget: 'none',
  servingStyle: 'scoop',
  specificationSource: 'manufacturer_official',
  specificationSourceUrl: 'https://www.sageappliances.com/es-es/product/bci600',
  specificationEvidence: [
    {
      kind: 'product_page',
      url: 'https://www.sageappliances.com/es-es/product/bci600',
      verifiedFacts: [
        'pre_cool',
        'keep_cool_three_hours',
        'twelve_hardness_settings',
        'four_dessert_families',
      ],
    },
    {
      kind: 'manual',
      url: 'https://assets.sageappliances.com/BCI600/SCI600_EU_UG8_F23_FA_Online.pdf',
      verifiedFacts: [
        'bci600_sci600_family',
        'one_litre_bowl',
        'self_cooling',
        'no_bowl_pre_freeze',
        'operation_sequence',
        'electrical_specification',
      ],
    },
  ],
  specificationVerifiedAt: '2026-09-05',
  specificationStatus: 'verified',
  operatingFeatures: {
    selfCooling: true,
    preCoolSupported: true,
    preCoolOptional: true,
    keepCoolSupported: true,
    keepCoolMaximumHours: 3,
    hardnessSettings: 12,
    dessertFamilies: ['Sorbet', 'Frozen Yogurt', 'Gelato', 'Ice Cream'],
    instructionTitle: 'SAGE SMART SCOOP',
    operationalInstructions: [
      'Włóż misę i mieszadło do urządzenia.',
      'Jeśli chcesz, użyj PRE-COOL przed wlaniem mieszanki.',
      'Wlej dobrze schłodzoną bazę do misy.',
      'Wybierz odpowiedni program urządzenia: Gelato / Ice Cream / Sorbet / Frozen Yogurt.',
      'Uruchom mieszanie.',
      'Dodatki dodaj, gdy urządzenie zasygnalizuje właściwy moment.',
      'Po zakończeniu wyjmij gotowy produkt.',
      'Funkcja KEEP COOL może utrzymywać produkt w odpowiedniej temperaturze do 3 godzin.',
    ],
  },
  electricalSpecification: {
    voltageRangeV: [220, 240],
    powerRangeW: [170, 200],
  },
  active: true,
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
