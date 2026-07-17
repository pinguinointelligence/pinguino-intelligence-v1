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
export const MACHINE_CATALOG_VERSION = '2026-07-17.2';

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
 * ml-conflict investigation (2026-07-17, live official ES pages; the Annex-B
 * URL ninjakitchen.es/productos/ninja-creami-nc302eu-zidNC302EU now
 * 301-redirects to www.sharkninja.es): product page and accessories pages
 * STILL disagree (473 vs 450 ml per tub) and neither page qualifies its
 * figure as a different concept — see the conflict note for verbatim quotes.
 * §9.3 forbids picking a number, so the vessel figure stays conflicting.
 *
 * Owner correction (2026-07-17): the recommended Home batch is DERIVED from a
 * CONFIRMED usable capacity via the 0.95 rule — a conflicted figure never
 * produces a number, so this record stays `conflicting_sources` and INACTIVE
 * until the owner resolves 473-vs-450 per the exact model+market. The two
 * candidate derivations (473→450 g vs 450→430 g) are in the slice report.
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
  // Live destination of the Annex-B URL (301 from ninjakitchen.es, 2026-07-17).
  specificationSourceUrl:
    'https://www.sharkninja.es/ninja-creami-6-funciones-2-tarrinas-grisnegro/NC302EU.html',
  specificationStatus: 'conflicting_sources',
  sourceConflicts: [
    {
      field: 'vesselCapacityMl',
      candidatesMl: [473, 450],
      note:
        'Oficjalne źródła ES nadal się różnią (sprawdzone na żywo 2026-07-17; ninjakitchen.es → ' +
        '301 → www.sharkninja.es). Strona produktu NC302EU: „Incluye 2 tarrinas (sin BPA) con ' +
        'tapa, de 473 ml cada una (capacidad total 950 ml)” — a w dłuższym opisie „capacidad ' +
        'total 1 L aprox.” (https://www.sharkninja.es/ninja-creami-6-funciones-2-tarrinas-grisnegro/NC302EU.html). ' +
        'Strona katalogowa: „CREAMi clásica … Tarrinas de 473 ml.” Oficjalne strony akcesoriów: ' +
        '„Capacidad: 450 ml por tarrina. Compatible con la Heladera Ninja CREAMi (modelos ' +
        'NC300EU/NC302EU)” (XSK2PNT300EUK i XSK4PINTEUUK). ŻADNA z tych stron nie rozróżnia ' +
        'pojęć (brak słów MAX FILL, brak „pojemność użytkowa vs po brzegi”), więc nie ma dowodu, ' +
        'że 473 i 450 to różne koncepty — rozstrzygnąć instrukcją dokładnego modelu (§9.3). ' +
        'Reguła 0.95 daje 473→450 g albo 450→430 g — decyzja właściciela po rozstrzygnięciu.',
    },
  ],
  active: false,
};

/**
 * Ninja CREAMi Deluxe NC502EU (EU/ES) — respin → existing Ninja Gelato mode.
 *
 * ml-conflict investigation (2026-07-17, live official ES pages): product
 * page and the Deluxe accessory-tub page STILL disagree (706 vs 680 ml per
 * tub) and neither qualifies its figure as a different concept — verbatim
 * quotes in the conflict note. The vessel figure stays conflicting (§9.3).
 *
 * Owner correction (2026-07-17): a conflicted figure never produces a
 * recommended batch, so the record stays `conflicting_sources` and INACTIVE
 * until the owner resolves 706-vs-680 per the exact model+market. Candidate
 * derivations (706→670 g vs 680→650 g) are in the slice report.
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
  // Model-exact live product page (stronger source than the old catalog URL,
  // which now 301-redirects to the sharkninja.es catalog; re-read 2026-07-17).
  specificationSourceUrl:
    'https://www.sharkninja.es/ninja-creami-deluxe-10-funciones-2-tarrinas-grisnegro/NC502EU.html',
  specificationStatus: 'conflicting_sources',
  sourceConflicts: [
    {
      field: 'vesselCapacityMl',
      candidatesMl: [706, 680],
      note:
        'Oficjalne źródła ES nadal się różnią (sprawdzone na żywo 2026-07-17; ninjakitchen.es → ' +
        '301 → www.sharkninja.es). Strona produktu NC502EU: „Incluye 2 tarrinas (sin BPA) de ' +
        '706 ml cada una (1,4 L en total)” oraz „Con las tarrinas grandes CREAMi Deluxe de 706 ml…” ' +
        '(https://www.sharkninja.es/ninja-creami-deluxe-10-funciones-2-tarrinas-grisnegro/NC502EU.html). ' +
        'Strona katalogowa: „CREAMi Deluxe … Tarrinas de 706 ml.” Oficjalna strona akcesoriów ' +
        '(dawniej ninjakitchen.es/productos/tarrinas-con-tapa-2-unidades-para-creami-deluxe-nc5-zidXSKPNTLD2EUUK, ' +
        'teraz https://www.sharkninja.es/2-tarrinas-con-tapa-creami-deluxe-nc5/XSKPNTLD2EUUK.html): ' +
        '„Capacidad: 680 ml por tarrina. Compatible con la Heladera Ninja CREAMi Deluxe, modelos ' +
        'NC501EU / NC502EU.” ŻADNA strona nie rozróżnia pojęć (brak MAX FILL, brak „użytkowa vs ' +
        'po brzegi”) — brak dowodu, że 706 i 680 to różne koncepty; rozstrzygnąć instrukcją modelu (§9.3). ' +
        'Reguła 0.95 daje 706→670 g albo 680→650 g — decyzja właściciela po rozstrzygnięciu.',
    },
  ],
  active: false,
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
