/**
 * VEGAN FREEZING AUTHORITY — provenance boundary (Vegan Engine v2, §14/§15).
 *
 * This module changes NO number. It exists to state one uncomfortable truth
 * explicitly, in code, so it can never be forgotten and can later be replaced
 * in exactly one place:
 *
 *   `ICE_ANCHOR_ROWS` contains seeded rows for `milk_gelato` and
 *   `protein_gelato` only. Vegan has NO ice anchor of its own, so its ice
 *   fraction is estimated through the documented `milk_gelato` category
 *   fallback — a DAIRY calibration.
 *
 * That fallback is a baseline/legacy calibrated authority. It is NOT direct
 * plant validation and must never be presented as such. Today's behaviour is
 * preserved exactly (owner §14.1): Vegan does not regress, and Vegan is not
 * made globally unavailable over an unresolved science question. The
 * professional Monitor status is already stricter and refuses to certify GOOD
 * freezing stability on a borrowed number
 * (`features/recipe-constraints/freezingStabilityStatus.ts`).
 *
 * REPLACEMENT SEAM: the borrowed-row rule lives in ONE named function,
 * `resolveIceAnchorRows` in `config/iceAnchors.ts`. Seed `vegan_gelato` rows in `ICE_ANCHOR_ROWS` (or give
 * Vegan its own composition solver) and every function here flips to
 * `own_seeded_anchor` / plant-validated with no other edit. Nothing else in the
 * codebase encodes the dairy dependency.
 *
 * Sorbet is deliberately excluded from the fallback and answers from its own
 * composition-sensitive solver; that behaviour is unchanged.
 */
import { ICE_ANCHOR_CATEGORY_FALLBACK, ICE_ANCHOR_ROWS, type IceAnchorRow } from './iceAnchors';
import type { ProductCategory } from '../types';

export type IceAuthorityKind =
  /** The category owns a seeded anchor row at this exact temperature. */
  | 'own_seeded_anchor'
  /** The estimate is borrowed from the dairy `milk_gelato` calibration. */
  | 'borrowed_dairy_anchor'
  /** Sorbet — the composition-sensitive freezing solver. */
  | 'composition_solver'
  /** No authority at all at this temperature. */
  | 'none';

/**
 * Truthful label for provenance / Monitor surfaces. `baseline_legacy_calibrated`
 * deliberately does NOT claim experimental validation for the category it
 * serves.
 */
export type IceAuthorityLabel =
  | 'direct_category_authority'
  | 'baseline_legacy_calibrated'
  | 'unavailable';

export interface IceAuthorityProvenance {
  category: ProductCategory;
  temperatureC: number;
  kind: IceAuthorityKind;
  /** Which category's calibration actually answers. */
  sourceCategory: ProductCategory | null;
  /** True ONLY when the authority was calibrated on this category's own matrix. */
  categoryValidated: boolean;
  label: IceAuthorityLabel;
  note: string;
}

const seededAt = (
  anchors: readonly IceAnchorRow[],
  category: ProductCategory,
  temperatureC: number,
): boolean =>
  anchors.some(
    (row) =>
      row.category === category && row.temperature_c === temperatureC && row.status === 'seeded',
  );

/**
 * True when Vegan finally owns a plant-validated ice authority. It returns
 * `false` today, on purpose, and is the single predicate future Vegan freezing
 * work has to satisfy.
 */
export function hasOwnPlantValidatedVeganIceAuthority(
  anchors: readonly IceAnchorRow[] = ICE_ANCHOR_ROWS,
): boolean {
  return anchors.some((row) => row.category === 'vegan_gelato' && row.status === 'seeded');
}

/** Honest classification of which calibration answers for (category, temperature). */
export function resolveIceAuthorityProvenance(
  category: ProductCategory,
  temperatureC: number,
  anchors: readonly IceAnchorRow[] = ICE_ANCHOR_ROWS,
): IceAuthorityProvenance {
  if (category === 'sorbet') {
    return {
      category,
      temperatureC,
      kind: 'composition_solver',
      sourceCategory: 'sorbet',
      categoryValidated: true,
      label: 'direct_category_authority',
      note: 'Sorbet ice comes from the composition-sensitive freezing solver and never borrows dairy anchors.',
    };
  }
  if (seededAt(anchors, category, temperatureC)) {
    return {
      category,
      temperatureC,
      kind: 'own_seeded_anchor',
      sourceCategory: category,
      categoryValidated: true,
      label: 'direct_category_authority',
      note: 'Seeded anchor row of this category at this exact serving temperature.',
    };
  }
  if (seededAt(anchors, ICE_ANCHOR_CATEGORY_FALLBACK, temperatureC)) {
    return {
      category,
      temperatureC,
      kind: 'borrowed_dairy_anchor',
      sourceCategory: ICE_ANCHOR_CATEGORY_FALLBACK,
      categoryValidated: false,
      label: 'baseline_legacy_calibrated',
      note: 'Estimated through the documented milk_gelato (dairy) category fallback. Baseline/legacy calibrated authority — NOT direct plant validation.',
    };
  }
  return {
    category,
    temperatureC,
    kind: 'none',
    sourceCategory: null,
    categoryValidated: false,
    label: 'unavailable',
    note: 'No seeded anchor row answers at this serving temperature.',
  };
}

/* ── Vegan target-band provenance (§15) ───────────────────────────────────── */

/**
 * Calibration provenance of each supported Vegan serving temperature, quoted
 * from the temperature-regulator lock ids in `config/targets.ts`. This is
 * DOCUMENTATION with a test behind it: the bands themselves are unchanged and
 * are NOT recalibrated by Vegan v2.
 */
export type VeganBandCalibration = 'externally_anchored' | 'internal_unconfirmed';

export interface VeganTemperatureBandProvenance {
  temperatureC: number;
  calibration: VeganBandCalibration;
  /** Exact regulator lock id recorded for this cell. */
  lockedReference: string;
  note: string;
}

export const VEGAN_TEMPERATURE_BAND_PROVENANCE: readonly VeganTemperatureBandProvenance[] = [
  {
    temperatureC: -11,
    calibration: 'internal_unconfirmed',
    lockedReference: 'locked_pinguino_internal_v0_1',
    note: 'Derived from GELLATTI temperature logic — locked internal v0.1, not externally confirmed. Supported and numerically unchanged; weaker external calibration than −13.',
  },
  {
    temperatureC: -12,
    calibration: 'internal_unconfirmed',
    lockedReference: 'locked_pinguino_internal_v0_1',
    note: 'Derived from GELLATTI temperature logic — locked internal v0.1, not externally confirmed. Supported and numerically unchanged; weaker external calibration than −13.',
  },
  {
    temperatureC: -13,
    calibration: 'externally_anchored',
    lockedReference: 'locked_pinguino_v0_1',
    note: 'Observed calibration anchor — external calibration data directly exposed Vegan −13 °C (V02 reference).',
  },
];

export function veganTemperatureBandProvenance(
  temperatureC: number,
): VeganTemperatureBandProvenance | null {
  return (
    VEGAN_TEMPERATURE_BAND_PROVENANCE.find((entry) => entry.temperatureC === temperatureC) ?? null
  );
}
