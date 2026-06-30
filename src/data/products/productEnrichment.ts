/**
 * Pure enrichment comparison + patch builder. Given a product and an external source (e.g. an
 * OpenFoodFacts result), it decides — per LABEL-NUTRITION field — whether the external value
 * fills a gap, agrees, or conflicts with what is stored, and builds the NARROW write patch the
 * reviewer approved.
 *
 *   - PURE: no DB, no service, no network, no secrets, no IO. Deterministic. No npac_value.
 *   - SAFE BY CONSTRUCTION: the only writable fields are the 7 label-nutrition columns
 *     (ENRICHABLE_FIELDS). `pac_value`/`pod_value`, identity (EAN/barcode/product_code), status,
 *     and the locked `mapper_basement` can NEVER appear in an enrichment patch (the type forbids
 *     it). PAC/POD is never computed here — least of all from total_sugars.
 *   - HONEST: a gap → fill (safe); equal-within-tolerance → agree (no-op); a real difference →
 *     conflict (NOT safe; needs an explicit reviewer override, defaulting to keep-stored since
 *     OpenFoodFacts is a weaker `public_composition_db` source than a producer/retailer label).
 */
import { toFiniteNumber } from './productMatcher';
import type { OffProduct } from './openFoodFactsAdapter';
import { withinTolerance, type EnrichmentSource } from './productSourceRanking';

/** The ONLY product columns enrichment may ever write — label nutrition per 100 g. */
export const ENRICHABLE_FIELDS = [
  'fat_percent',
  'saturated_fat_percent',
  'carbohydrate_percent',
  'total_sugars_percent',
  'protein_percent',
  'salt_percent',
  'kcal_per_100g',
] as const;
export type EnrichableField = (typeof ENRICHABLE_FIELDS)[number];

/** Per-field agreement tolerance (absolute, in the field's own unit). */
const TOLERANCE: Record<EnrichableField, number> = {
  fat_percent: 0.5,
  saturated_fat_percent: 0.5,
  carbohydrate_percent: 0.5,
  total_sugars_percent: 0.5,
  protein_percent: 0.5,
  salt_percent: 0.1,
  kcal_per_100g: 5,
};

export type EnrichmentDecision =
  | 'fill' // stored is null, the source has a value → safe to add
  | 'agree' // both present and equal within tolerance → no change
  | 'conflict' // both present and genuinely differ → needs explicit review
  | 'skip'; // the source has no value → nothing to offer

export interface EnrichmentFieldComparison {
  field: EnrichableField;
  stored: number | null;
  incoming: number | null;
  decision: EnrichmentDecision;
  /** safe to apply WITHOUT overriding a stored value (true only for `fill`). */
  safe: boolean;
  /** the external source's trust tier (OFF = public_composition_db). */
  incoming_source: EnrichmentSource;
}

export interface EnrichmentComparison {
  found: boolean;
  ean: string | null;
  source: EnrichmentSource | null;
  fields: EnrichmentFieldComparison[];
  fill_count: number;
  conflict_count: number;
}

/** Structural subset of a product the comparison reads (DB numerics may be strings). */
export interface EnrichmentTarget {
  fat_percent?: number | string | null;
  saturated_fat_percent?: number | string | null;
  carbohydrate_percent?: number | string | null;
  total_sugars_percent?: number | string | null;
  protein_percent?: number | string | null;
  salt_percent?: number | string | null;
  kcal_per_100g?: number | string | null;
}

/** Compare a product's stored label nutrition against an OpenFoodFacts result. */
export function compareEnrichment(product: EnrichmentTarget, off: OffProduct): EnrichmentComparison {
  if (!off.found) {
    return { found: false, ean: off.ean, source: null, fields: [], fill_count: 0, conflict_count: 0 };
  }
  const fields = ENRICHABLE_FIELDS.map<EnrichmentFieldComparison>((field) => {
    const stored = toFiniteNumber(product[field]);
    const incoming = off.nutrition[field];
    let decision: EnrichmentDecision;
    if (incoming === null) decision = 'skip';
    else if (stored === null) decision = 'fill';
    else if (withinTolerance(TOLERANCE[field])(stored, incoming)) decision = 'agree';
    else decision = 'conflict';
    return { field, stored, incoming, decision, safe: decision === 'fill', incoming_source: off.source };
  });
  return {
    found: true,
    ean: off.ean,
    source: off.source,
    fields,
    fill_count: fields.filter((f) => f.decision === 'fill').length,
    conflict_count: fields.filter((f) => f.decision === 'conflict').length,
  };
}

/** Fields safe to apply with no override — exactly the `fill` (gap) fields. */
export function safeFillFields(comparison: EnrichmentComparison): EnrichableField[] {
  return comparison.fields.filter((f) => f.decision === 'fill').map((f) => f.field);
}

export type EnrichmentPatch = Partial<Record<EnrichableField, number>>;

export interface EnrichmentWritePreview {
  /** the EXACT patch that would be written (nutrition allowlist only). */
  patch: EnrichmentPatch;
  /** the change_type the resulting snapshot would carry ('nutrition', or 'none' if no real change). */
  snapshot_change_type: 'nutrition' | 'none';
  /** the per-field from→to the snapshot would record. */
  snapshot_changes: { field: EnrichableField; from: number | null; to: number }[];
}

/**
 * Preview EXACTLY what a reviewed write would do: the patch (nutrition allowlist only) and the
 * snapshot that would be appended (change_type + per-field from→to). Pure; computes nothing the
 * service would not. A selected field whose value already matches stored produces no snapshot row.
 */
export function previewEnrichmentWrite(
  comparison: EnrichmentComparison,
  selected: ReadonlyArray<EnrichableField>,
): EnrichmentWritePreview {
  const patch = buildEnrichmentPatch(comparison, selected);
  const sel = new Set(selected);
  const snapshot_changes = comparison.fields
    .filter((f) => sel.has(f.field) && f.incoming !== null && f.stored !== f.incoming)
    .map((f) => ({ field: f.field, from: f.stored, to: f.incoming as number }));
  return {
    patch,
    snapshot_change_type: snapshot_changes.length > 0 ? 'nutrition' : 'none',
    snapshot_changes,
  };
}

/**
 * Build the narrow write patch from the reviewer's selected fields. Only selected fields whose
 * incoming value is a real number are included; the `Record<EnrichableField, number>` type makes
 * it impossible for pac/pod/identity/status to appear.
 */
export function buildEnrichmentPatch(
  comparison: EnrichmentComparison,
  selected: ReadonlyArray<EnrichableField>,
): EnrichmentPatch {
  const sel = new Set(selected);
  const patch: EnrichmentPatch = {};
  for (const c of comparison.fields) {
    if (!sel.has(c.field)) continue;
    if (c.incoming === null) continue;
    patch[c.field] = c.incoming;
  }
  return patch;
}
