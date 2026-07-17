/**
 * PINGÜINO Machine Catalog — Home onboarding contracts (§8).
 *
 * Three pure contracts:
 *  1. the §8.2 starter tile list (families, not dozens of models);
 *  2. the §8.3 "Nie widzę mojej maszyny" behavior question — FOUR
 *     plain-language answers about what the machine DOES (never the words
 *     "re-spin", "kompresor" or "frozen bowl"), each mapping to an internal
 *     technology. The soft-serve-dispenser answer maps to
 *     `continuous_soft_serve`, which has NO Home mode — it resolves to an
 *     HONEST unsupported state instead of being bent onto Ninja Swirl;
 *  3. the §8.4 custom-machine input contract: optional brand/model, vessel
 *     capacity, MAX FILL existence, manufacturer max mix, ml/l input stored
 *     internally in ml, and a conservative FLAGGED `user_declared` fallback
 *     when only the total vessel capacity is known.
 */
import type {
  HomeMachineProfile,
  HomeVisibleModeId,
  MachineTechnology,
  PreFreezeTarget,
} from './types';
import {
  isHomeSupportedTechnology,
  visibleModeForTechnology,
  type HomeSupportedTechnology,
} from './technologyMode';

/* ------------------------------------------------------------------ */
/* §8.2 — starter tiles                                                */
/* ------------------------------------------------------------------ */

/** One §8.2 onboarding tile: a machine family, or the "not listed" escape. */
export interface MachineOnboardingTile {
  readonly id: string;
  /** Exact §8.2 label. */
  readonly label: string;
  readonly kind: 'catalog_family' | 'not_listed';
  /**
   * Catalog record ids behind the tile. More than one id means the model must
   * be disambiguated ONLY because it changes capacity or technology (§8.2),
   * e.g. the two frozen-bowl Cuisinarts (1.4 l vs 2.0 l).
   */
  readonly catalogIds: readonly string[];
}

/** The §8.2 starter list, in spec order (last tile = "not listed"). */
export const MACHINE_ONBOARDING_TILES: readonly MachineOnboardingTile[] = [
  {
    id: 'tile-ninja-creami',
    label: 'Ninja CREAMi',
    kind: 'catalog_family',
    catalogIds: ['ninja-creami-nc302eu-eu-es'],
  },
  {
    id: 'tile-ninja-creami-deluxe',
    label: 'Ninja CREAMi Deluxe',
    kind: 'catalog_family',
    catalogIds: ['ninja-creami-deluxe-nc502eu-eu-es'],
  },
  {
    id: 'tile-ninja-creami-scoop-swirl',
    label: 'Ninja CREAMi Scoop & Swirl',
    kind: 'catalog_family',
    catalogIds: ['ninja-creami-scoop-swirl-nc7-eu-es'],
  },
  {
    id: 'tile-moulinex-freezi',
    label: 'Moulinex Freezi',
    kind: 'catalog_family',
    catalogIds: ['moulinex-freezi-mj803af0-es'],
  },
  {
    id: 'tile-sage-smart-scoop',
    label: 'Sage / Breville Smart Scoop',
    kind: 'catalog_family',
    catalogIds: ['sage-smart-scoop-bci600-uk-eu'],
  },
  {
    id: 'tile-magimix-gelato-expert',
    label: 'Magimix Gelato Expert',
    kind: 'catalog_family',
    catalogIds: ['magimix-gelato-expert-eu'],
  },
  {
    id: 'tile-cuisinart-ice-100',
    label: 'Cuisinart ICE-100',
    kind: 'catalog_family',
    catalogIds: ['cuisinart-ice100e-eu'],
  },
  {
    id: 'tile-kitchenaid-ice-cream-maker',
    label: 'KitchenAid Ice Cream Maker',
    kind: 'catalog_family',
    catalogIds: ['kitchenaid-5ksmicm-uk-eu'],
  },
  {
    id: 'tile-cuisinart-frozen-bowl',
    label: 'Cuisinart z misą chłodzoną',
    kind: 'catalog_family',
    catalogIds: ['cuisinart-ice21e-eu', 'cuisinart-ice30bce-eu'],
  },
  {
    id: 'tile-not-listed',
    label: 'Nie widzę mojej maszyny',
    kind: 'not_listed',
    catalogIds: [],
  },
];

/* ------------------------------------------------------------------ */
/* §8.3 — behavior question                                            */
/* ------------------------------------------------------------------ */

/** Stable ids for the four §8.3 plain-language answers. */
export type MachineBehaviorAnswerId =
  | 'freeze_mixture_first'
  | 'machine_cools_itself'
  | 'freeze_bowl_first'
  | 'soft_serve_dispenser';

export interface MachineBehaviorAnswer {
  readonly id: MachineBehaviorAnswerId;
  /** Exact §8.3 user-facing answer (plain language, no technology jargon). */
  readonly answer: string;
  /** Exact §8.3 helper description. */
  readonly helper: string;
  /** Internal mapping — never shown to the user. */
  readonly technology: MachineTechnology;
}

/**
 * The §8.3 table, verbatim. Note there is deliberately NO answer mapping to
 * `respin_soft`: Ninja Swirl class machines are picked from the §8.2 tiles;
 * the dispenser answer describes true continuous soft-serve machines only.
 */
export const MACHINE_BEHAVIOR_ANSWERS: readonly MachineBehaviorAnswer[] = [
  {
    id: 'freeze_mixture_first',
    answer: 'Najpierw zamrażam całą mieszankę',
    helper: 'Maszyna później rozdrabnia zamrożony blok.',
    technology: 'respin',
  },
  {
    id: 'machine_cools_itself',
    answer: 'Maszyna sama chłodzi mieszankę',
    helper: 'Wlewam płynną bazę, a urządzenie ją chłodzi i miesza.',
    technology: 'compressor',
  },
  {
    id: 'freeze_bowl_first',
    answer: 'Najpierw zamrażam tylko misę',
    helper: 'Zamrożona misa chłodzi mieszankę podczas mieszania.',
    technology: 'frozen_bowl',
  },
  {
    id: 'soft_serve_dispenser',
    answer: 'Maszyna wydaje miękkie lody z dozownika',
    helper: 'Płynna baza jest chłodzona i wydawana jako soft.',
    technology: 'continuous_soft_serve', // only-if-supported → unsupported for Home today
  },
];

/** Resolution of one behavior answer for the HOME experience. */
export type BehaviorAnswerResolution =
  | {
      readonly outcome: 'supported';
      readonly technology: HomeSupportedTechnology;
      readonly visibleMode: HomeVisibleModeId;
    }
  | {
      readonly outcome: 'unsupported_for_home';
      readonly technology: MachineTechnology;
      /** Honest reason for the UI — no fake fallback onto a Ninja mode. */
      readonly reasonCode: 'continuous_soft_serve_not_home_supported';
    };

const BEHAVIOR_BY_ID: ReadonlyMap<string, MachineBehaviorAnswer> = new Map(
  MACHINE_BEHAVIOR_ANSWERS.map((a) => [a.id, a] as const),
);

/** The behavior answer for an id (or null when unknown). */
export function behaviorAnswerById(id: string | null | undefined): MachineBehaviorAnswer | null {
  if (id == null) return null;
  return BEHAVIOR_BY_ID.get(id) ?? null;
}

/**
 * Resolve a §8.3 answer to a Home outcome. `continuous_soft_serve` is mapped
 * to an honest unsupported state (§10: Pro / future — not selectable in Home).
 */
export function resolveBehaviorAnswer(id: MachineBehaviorAnswerId): BehaviorAnswerResolution {
  const answer = BEHAVIOR_BY_ID.get(id);
  // The id union is closed, but stay honest if data and type ever drift.
  const technology = answer ? answer.technology : 'continuous_soft_serve';
  const visibleMode = visibleModeForTechnology(technology);
  if (visibleMode === null || !isHomeSupportedTechnology(technology)) {
    return {
      outcome: 'unsupported_for_home',
      technology,
      reasonCode: 'continuous_soft_serve_not_home_supported',
    };
  }
  return { outcome: 'supported', technology, visibleMode };
}

/* ------------------------------------------------------------------ */
/* §8.4 — custom machine                                               */
/* ------------------------------------------------------------------ */

/** A user-entered volume with its unit. Stored internally in ml (§8.4). */
export interface CustomMachineVolumeInput {
  readonly value: number;
  readonly unit: 'ml' | 'l';
}

/**
 * Normalize a user volume input to millilitres. This is a VOLUME unit
 * conversion (l → ml) — never a volume→grams conversion. Returns null for
 * non-finite / non-positive values instead of guessing.
 */
export function volumeInputToMl(input: CustomMachineVolumeInput | null | undefined): number | null {
  if (input == null || !Number.isFinite(input.value) || input.value <= 0) return null;
  return input.unit === 'l' ? input.value * 1000 : input.value;
}

/** The §8.4 custom-machine input contract ("Nie widzę mojej maszyny" path). */
export interface CustomMachineInput {
  /** Which §8.3 behavior the user picked. */
  readonly behaviorAnswerId: MachineBehaviorAnswerId;
  /** Market/region token for the profile record (§8.6 saves the region). */
  readonly market: string;
  /** Brand — optional (§8.4). */
  readonly brand?: string | null;
  /** Model — optional (§8.4). */
  readonly model?: string | null;
  /** Vessel / bowl capacity as entered (ml or l). */
  readonly vesselCapacity?: CustomMachineVolumeInput | null;
  /** Does a MAX FILL line exist? null = the user does not know. */
  readonly hasMaxFillLine?: boolean | null;
  /** Maximum mix quantity from the machine's manual, as entered (ml or l). */
  readonly manufacturerMaxMix?: CustomMachineVolumeInput | null;
}

/** Result of building a custom machine profile. */
export type CustomMachineResult =
  | {
      readonly outcome: 'profile';
      readonly profile: HomeMachineProfile;
      /**
       * §8.4 conservative FLAGGED fallback: 'vessel_capacity_only' when the
       * user only knew the total vessel capacity — no mix/batch number is
       * derived from it (that would need an invented safety factor); the
       * profile stays editable and the batch suggestion honestly returns none.
       */
      readonly capacityFallback: 'vessel_capacity_only' | null;
    }
  | {
      readonly outcome: 'unsupported_for_home';
      readonly technology: 'continuous_soft_serve';
      readonly reasonCode: 'continuous_soft_serve_not_home_supported';
    };

const PRE_FREEZE_BY_TECHNOLOGY: Readonly<Record<HomeSupportedTechnology, PreFreezeTarget>> = {
  respin: 'mixture',
  respin_soft: 'mixture',
  compressor: 'none',
  frozen_bowl: 'bowl',
};

/** Deterministic id slug (pure layer: no randomness, no clock). */
function customIdSlug(brand: string | null | undefined, model: string | null | undefined): string {
  const raw = [brand ?? '', model ?? '']
    .map((part) =>
      part
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-'),
    )
    .filter((part) => part.length > 0 && part !== '-')
    .join('-')
    .replace(/^-+|-+$/g, '');
  return raw.length > 0 ? raw : 'unspecified';
}

/**
 * Build a user-declared custom machine profile (§8.4/§8.6).
 *
 * Conservative by construction:
 *  - source is 'user_declared' and status 'provisional' — never 'verified';
 *  - volumes are stored in ml; NOTHING is converted to grams;
 *  - unknown MAX FILL (null) is recorded as `false` = "not documented", not
 *    as a claim about the physical product;
 *  - with only a vessel capacity, the profile carries the FLAGGED
 *    'vessel_capacity_only' fallback instead of a derived mix limit.
 */
export function buildCustomMachineProfile(input: CustomMachineInput): CustomMachineResult {
  const resolution = resolveBehaviorAnswer(input.behaviorAnswerId);
  if (resolution.outcome === 'unsupported_for_home') {
    return {
      outcome: 'unsupported_for_home',
      technology: 'continuous_soft_serve',
      reasonCode: resolution.reasonCode,
    };
  }
  const technology = resolution.technology;
  const vesselCapacityMl = volumeInputToMl(input.vesselCapacity);
  const maximumLiquidMixMl = volumeInputToMl(input.manufacturerMaxMix);
  const capacityFallback: 'vessel_capacity_only' | null =
    vesselCapacityMl !== null && maximumLiquidMixMl === null ? 'vessel_capacity_only' : null;
  const brand = input.brand?.trim() ?? '';
  const model = input.model?.trim() ?? '';
  const preFreezeTarget = PRE_FREEZE_BY_TECHNOLOGY[technology];

  const profile: HomeMachineProfile = {
    id: `custom-${customIdSlug(brand, model)}`,
    brand,
    family: 'custom',
    modelCodes: model.length > 0 ? [model] : [],
    market: input.market,
    technology,
    resolvedVisibleMode: resolution.visibleMode,
    capacity: {
      vesselCapacityMl,
      maximumLiquidMixMl,
      workingCapacityMl: null,
      minimumBatchMl: null,
      maximumBatchMl: null,
      defaultBatchMl: null,
      finishedProductCapacityMl: null,
      maxFillDefinedByManufacturer: input.hasMaxFillLine === true,
    },
    requiresPreFreeze: preFreezeTarget !== 'none',
    preFreezeTarget,
    servingStyle: 'scoop',
    specificationSource: 'user_declared',
    specificationStatus: 'provisional',
    capacityFallback,
    active: true,
  };
  return { outcome: 'profile', profile, capacityFallback };
}
