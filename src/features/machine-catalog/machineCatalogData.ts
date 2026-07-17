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
export const MACHINE_CATALOG_VERSION = '2026-07-17.3';

/** Provenance meta for the whole seed (report + future persistence track). */
export const MACHINE_CATALOG_META = {
  version: MACHINE_CATALOG_VERSION,
  seededFrom: 'UI/UX master spec Annex A + Annex B (2026-07-16)',
  /**
   * False: "verified" is reserved for the per-model+market MANUAL. The
   * 2026-07-17 online pass re-read the official RETAIL pages of the two Ninja
   * families (evidence in their conflict notes) — retail pages are not the
   * manual, so nothing graduates to `verified` from that pass.
   */
  verifiedOnline: false,
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
  brand: 'Ninja',
  family: 'CREAMi',
  modelCodes: ['NC302EU'],
  market: 'EU/ES',
  technology: 'respin',
  resolvedVisibleMode: 'ninja_gelato',
  capacity: {
    vesselCapacityMl: 473, // owner-pinned figure (final decision 2026-07-17) → 450 g via ×0.95
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
  // Live destination of the Annex-B URL (301 from ninjakitchen.es, 2026-07-17).
  specificationSourceUrl:
    'https://www.sharkninja.es/ninja-creami-6-funciones-2-tarrinas-grisnegro/NC302EU.html',
  // Owner final decision (2026-07-17): provisional + ACTIVE; the retail-page
  // figure dispute lives in the doc comment above as provenance — no blocking
  // sourceConflicts entry, nothing user-facing.
  specificationStatus: 'provisional',
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
  brand: 'Ninja',
  family: 'CREAMi Deluxe',
  modelCodes: ['NC502EU'],
  market: 'EU/ES',
  technology: 'respin',
  resolvedVisibleMode: 'ninja_gelato',
  capacity: {
    vesselCapacityMl: 706, // owner-pinned figure (final decision 2026-07-17) → 670 g via ×0.95
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
  // Model-exact live product page (stronger source than the old catalog URL,
  // which now 301-redirects to the sharkninja.es catalog; re-read 2026-07-17).
  specificationSourceUrl:
    'https://www.sharkninja.es/ninja-creami-deluxe-10-funciones-2-tarrinas-grisnegro/NC502EU.html',
  // Owner final decision (2026-07-17): provisional + ACTIVE; dispute history
  // lives in the doc comment above as provenance — never user-facing, never
  // blocking.
  specificationStatus: 'provisional',
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
