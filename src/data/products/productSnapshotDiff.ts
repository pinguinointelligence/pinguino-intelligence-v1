/**
 * Pure product-snapshot extraction + change detection. Turns a product (row or insert) into
 * the snapshot field set, and diffs it against the previous snapshot to decide whether to
 * record a new one and what `change_type` it is.
 *
 *   - PURE: no DB, no service, no IO. Deterministic. No npac_value.
 *   - HONEST: unknown numerics coerce via toFiniteNumber (DB strings) and stay null when
 *     absent — never a fake 0. A diff with no real change returns `changed: false`.
 */
import { toFiniteNumber } from './productMatcher';

export type SnapshotChangeType =
  | 'created' | 'price' | 'package' | 'nutrition' | 'ingredients' | 'image' | 'source' | 'other';

export interface SnapshotFields {
  price: number | null;
  package_size: string | null;
  ingredients_text: string | null;
  source_url: string | null;
  ocr_text: string | null;
  fat_percent: number | null;
  saturated_fat_percent: number | null;
  carbohydrate_percent: number | null;
  total_sugars_percent: number | null;
  protein_percent: number | null;
  salt_percent: number | null;
  kcal_per_100g: number | null;
}

/** What a product/insert row looks like to the snapshot extractor (structural subset). */
export interface SnapshotSource {
  cost_per_kg?: number | string | null;
  package_size?: string | null;
  detected_text?: string | null;
  source_url?: string | null;
  product_url?: string | null;
  ocr_text?: string | null;
  fat_percent?: number | string | null;
  saturated_fat_percent?: number | string | null;
  carbohydrate_percent?: number | string | null;
  total_sugars_percent?: number | string | null;
  protein_percent?: number | string | null;
  salt_percent?: number | string | null;
  kcal_per_100g?: number | string | null;
}

const str = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
};

/** Extract the snapshot field set from a product row or insert candidate. */
export function extractSnapshotFields(p: SnapshotSource): SnapshotFields {
  return {
    price: toFiniteNumber(p.cost_per_kg),
    package_size: str(p.package_size),
    ingredients_text: str(p.detected_text),
    source_url: str(p.source_url) ?? str(p.product_url),
    ocr_text: str(p.ocr_text),
    fat_percent: toFiniteNumber(p.fat_percent),
    saturated_fat_percent: toFiniteNumber(p.saturated_fat_percent),
    carbohydrate_percent: toFiniteNumber(p.carbohydrate_percent),
    total_sugars_percent: toFiniteNumber(p.total_sugars_percent),
    protein_percent: toFiniteNumber(p.protein_percent),
    salt_percent: toFiniteNumber(p.salt_percent),
    kcal_per_100g: toFiniteNumber(p.kcal_per_100g),
  };
}

/** Coerce a STORED snapshot row (DB numerics deserialize as strings) back to typed
 * SnapshotFields, so a diff compares like with like. */
export function normalizeSnapshotFields(row: Record<string, unknown>): SnapshotFields {
  return {
    price: toFiniteNumber(row.price),
    package_size: str(row.package_size as string | null | undefined),
    ingredients_text: str(row.ingredients_text as string | null | undefined),
    source_url: str(row.source_url as string | null | undefined),
    ocr_text: str(row.ocr_text as string | null | undefined),
    fat_percent: toFiniteNumber(row.fat_percent),
    saturated_fat_percent: toFiniteNumber(row.saturated_fat_percent),
    carbohydrate_percent: toFiniteNumber(row.carbohydrate_percent),
    total_sugars_percent: toFiniteNumber(row.total_sugars_percent),
    protein_percent: toFiniteNumber(row.protein_percent),
    salt_percent: toFiniteNumber(row.salt_percent),
    kcal_per_100g: toFiniteNumber(row.kcal_per_100g),
  };
}

const NUTRITION: ReadonlyArray<keyof SnapshotFields> = [
  'fat_percent', 'saturated_fat_percent', 'carbohydrate_percent', 'total_sugars_percent',
  'protein_percent', 'salt_percent', 'kcal_per_100g',
];

export interface SnapshotDiff {
  changed: boolean;
  change_type: SnapshotChangeType;
  detected_changes: Record<string, { from: unknown; to: unknown }>;
}

/**
 * Diff the current snapshot fields against the previous snapshot (or null for the first one).
 * Returns whether anything changed, the dominant change_type, and a per-field from→to map.
 */
export function diffSnapshot(current: SnapshotFields, previous: SnapshotFields | null): SnapshotDiff {
  if (previous === null) {
    return { changed: true, change_type: 'created', detected_changes: {} };
  }
  const detected_changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(current) as Array<keyof SnapshotFields>) {
    if (current[key] !== previous[key]) {
      detected_changes[key] = { from: previous[key], to: current[key] };
    }
  }
  const changedKeys = Object.keys(detected_changes);
  if (changedKeys.length === 0) {
    return { changed: false, change_type: 'other', detected_changes };
  }
  // dominant change_type by priority
  let change_type: SnapshotChangeType = 'other';
  if (NUTRITION.some((k) => k in detected_changes)) change_type = 'nutrition';
  else if ('ingredients_text' in detected_changes) change_type = 'ingredients';
  else if ('price' in detected_changes) change_type = 'price';
  else if ('package_size' in detected_changes) change_type = 'package';
  else if ('source_url' in detected_changes) change_type = 'source';
  else if ('ocr_text' in detected_changes) change_type = 'image';
  return { changed: true, change_type, detected_changes };
}
