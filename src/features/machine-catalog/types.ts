/**
 * PINGÜINO Machine Catalog — pure types (UI/UX master spec §9).
 *
 * The Home machine catalog is a VERSIONED DATA LAYER (like the serving-mode
 * matrix in `@/features/customer-flow`): capacities are never hard-coded in
 * components, and every record carries market, source, verification date slot
 * and an honest specification status (§9.2/§9.3).
 *
 * HARD SCOPE (test-pinned, mirrors the customer-flow layer):
 *  - pure data + pure functions — no IO, no DOM, no clock, no randomness;
 *  - NO engine math and NO recipe modifiers of any kind. A machine profile is
 *    ONLY: routing to an EXISTING visible serving mode + capacity/UX facts
 *    (pre-freeze, serving style, batch suggestion inputs). Owner rule (§10.1):
 *    technology → mode is routing to the existing safe mode; any future
 *    per-technology recipe modifiers must arrive as a SEPARATE versioned,
 *    reversible, feature-flagged config — default neutral. This model has no
 *    modifier fields at all, which is the strongest neutrality guarantee.
 *  - volumes are stored in MILLILITRES. The ONLY permitted ml→grams
 *    arithmetic anywhere is the owner's explicit, versioned Home safety-factor
 *    rule (`homeBatchRule.ts`, owner correction 2026-07-17), applied ONLY to a
 *    confirmed usable capacity — never a blind density guess, never applied to
 *    a physical bowl volume, and never to a conflicted figure.
 */
import type { ServingModeId } from '@/features/customer-flow';

/**
 * Machine technology (§9.2 + §8.3). `respin_soft` is the Ninja Swirl class:
 * a HOME re-spin machine with a soft dispense — it is NEVER classified as a
 * professional `continuous_soft_serve` machine (§8.3).
 */
export type MachineTechnology =
  | 'respin'
  | 'respin_soft'
  | 'compressor'
  | 'frozen_bowl'
  | 'continuous_soft_serve';

/**
 * Honest provenance status of a specification record (§9.2/§9.3).
 *  - `verified`            — re-confirmed in the official manual of the exact
 *                            model AND market. Nothing in the Annex-A seed pass
 *                            is allowed to carry this status.
 *  - `provisional`         — seeded from an official source, pending manual
 *                            re-confirmation per model + market.
 *  - `needs_review`        — data missing or not yet confirmed at all.
 *  - `conflicting_sources` — official sources disagree (e.g. product page vs
 *                            accessories page). BLOCKS activation until an
 *                            owner resolves it with the model's manual (§9.3).
 */
export type MachineSpecificationStatus =
  | 'verified'
  | 'provisional'
  | 'needs_review'
  | 'conflicting_sources';

/** Where a specification record's numbers come from (§8.6). */
export type MachineSpecificationSource = 'manufacturer_official' | 'user_declared';

/**
 * The ONLY visible modes a Home machine may resolve to — a strict subset of
 * the EXISTING owner-approved `ServingModeId` union (§10). No parallel mode
 * system: `fresh` routes to the existing −11 °C cell, `ninja_gelato` and
 * `ninja_swirl` are the existing Ninja machine modes.
 */
export type HomeVisibleModeId = Extract<ServingModeId, 'fresh' | 'ninja_gelato' | 'ninja_swirl'>;

/** What must be pre-frozen before the machine can run (§9.2). */
export type PreFreezeTarget = 'mixture' | 'bowl' | 'none';

/** How the finished product is served (§9.2). */
export type MachineServingStyle = 'scoop' | 'soft' | 'both';

/**
 * A manufacturer-stated capacity for ONE product program (Annex A: e.g.
 * Moulinex Freezi — 1.0 l ice cream vs 1.4 l frozen drink; Magimix — 1.0 l ice
 * cream vs 1.3 l sorbet/granita). Kept verbatim per program so a program
 * figure is never silently promoted to a generic machine capacity.
 */
export interface MachineProgramCapacity {
  /** Stable program key, e.g. 'ice_cream', 'sorbet_granita', 'frozen_drink'. */
  readonly program: string;
  /** Manufacturer-stated capacity for that program, in millilitres. */
  readonly capacityMl: number;
}

/** Capacity fields that can carry a cross-source conflict (§9.3). */
export type ConflictableCapacityField =
  | 'vesselCapacityMl'
  | 'maximumLiquidMixMl'
  | 'workingCapacityMl'
  | 'finishedProductCapacityMl';

/**
 * A documented disagreement between OFFICIAL sources for one capacity field
 * (§9.3). The conflict is data, not a footnote: it forces
 * `specificationStatus: 'conflicting_sources'` and blocks activation until an
 * owner resolves it with the exact model's manual.
 */
export interface MachineSourceConflict {
  readonly field: ConflictableCapacityField;
  /** Every candidate value the official sources state, in millilitres. */
  readonly candidatesMl: readonly number[];
  /** Plain-language note: which sources disagree and how to resolve. */
  readonly note: string;
}

/**
 * All capacity distinctions of §9.1 — these are DIFFERENT facts and are never
 * collapsed into one number:
 *  - `vesselCapacityMl`          — physical volume of the vessel / bowl;
 *  - `maximumLiquidMixMl`        — manufacturer's max LIQUID mix;
 *  - `workingCapacityMl`         — recommended working capacity;
 *  - `minimumBatchMl`            — minimum sensible batch;
 *  - `maximumBatchMl`            — maximum batch;
 *  - `defaultBatchMl`            — default batch;
 *  - `finishedProductCapacityMl` — finished-product volume, only when the
 *                                  manufacturer states it separately (overrun
 *                                  makes it LARGER than the liquid mix — never
 *                                  suggest it as a pour amount);
 *  - `maxFillDefinedByManufacturer` — MAX FILL as a RULE, not just a number.
 *
 * `null` always means "not stated by the recorded sources" — a null is NEVER
 * guessed into a number (Annex A rule: no invented capacities or batches).
 */
export interface MachineCapacity {
  readonly vesselCapacityMl: number | null;
  readonly maximumLiquidMixMl: number | null;
  readonly workingCapacityMl: number | null;
  readonly minimumBatchMl: number | null;
  readonly maximumBatchMl: number | null;
  readonly defaultBatchMl: number | null;
  /**
   * Manufacturer-stated maximum mix quantity in GRAMS, when a manual states
   * one (owner correction 2026-07-17: field `manufacturerMaxMixGrams`; the
   * TOP source-of-truth for the recommended batch — used directly, never
   * converted from ml). Absent/null = not stated by the recorded sources.
   */
  readonly manufacturerMaxMixGrams?: number | null;
  readonly finishedProductCapacityMl?: number | null;
  /**
   * True when the RECORDED sources document a manufacturer MAX FILL rule for
   * this model (e.g. the Ninja CREAMi MAX FILL line). False means "not
   * documented in the recorded sources" — it is NOT a claim that no such line
   * exists on the physical product.
   */
  readonly maxFillDefinedByManufacturer: boolean;
  /** Number of identical vessels shipped, when sources state it (e.g. 2×473 ml). */
  readonly vesselCount?: number | null;
  /** Per-program manufacturer capacities, kept verbatim (Annex A). */
  readonly perProgram?: readonly MachineProgramCapacity[];
}

/**
 * One catalog record: a machine model FOR ONE MARKET (§9.3 — the same family
 * can ship different vessels in EU, UK and US, so records are per-region).
 */
export interface HomeMachineProfile {
  /** Stable unique id, unique per (model, market). */
  readonly id: string;
  readonly brand: string;
  readonly family: string;
  /** Manufacturer model codes covered by this record (may be empty for custom). */
  readonly modelCodes: readonly string[];
  /** Market/region token(s) this record applies to, '/'-separated (e.g. 'EU/ES'). */
  readonly market: string;
  readonly technology: MachineTechnology;
  /**
   * The EXISTING visible serving mode this machine routes to (§10). Must agree
   * with `visibleModeForTechnology(technology)`; `continuous_soft_serve` has
   * no Home mode, so such a profile can never validate for Home.
   */
  readonly resolvedVisibleMode: HomeVisibleModeId;
  readonly capacity: MachineCapacity;
  readonly requiresPreFreeze: boolean;
  readonly preFreezeTarget: PreFreezeTarget;
  /**
   * Manufacturer-stated minimum pre-freeze duration in hours, when the
   * recorded sources state one (e.g. KitchenAid: min. 16 h). Null = unstated.
   */
  readonly preFreezeMinimumHours?: number | null;
  readonly servingStyle: MachineServingStyle;
  /** Provenance: official manufacturer data vs user-declared custom machine. */
  readonly specificationSource: MachineSpecificationSource;
  /** Official source URL (Annex B) backing this record's numbers. */
  readonly specificationSourceUrl?: string;
  /** ISO date of the LAST per-model+market manual re-confirmation. Absent until verified. */
  readonly specificationVerifiedAt?: string;
  readonly specificationStatus: MachineSpecificationStatus;
  /** Documented cross-source disagreements (§9.3). Non-empty ⇒ conflicting_sources. */
  readonly sourceConflicts?: readonly MachineSourceConflict[];
  /**
   * Only used for user-declared custom machines: marks the conservative,
   * FLAGGED fallback of §8.4 when the user only knew the total vessel
   * capacity. No mix/batch number is derived from it (that would require an
   * invented safety factor) — the profile stays editable and the batch
   * suggestion honestly returns none.
   */
  readonly capacityFallback?: 'vessel_capacity_only' | null;
  /** Whether this record is offered in the Home catalog. Conflicts force false. */
  readonly active: boolean;
}
