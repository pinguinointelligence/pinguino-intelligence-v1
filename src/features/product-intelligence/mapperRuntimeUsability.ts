import type { IngredientRow, VerificationStatus } from '@/data/ingredients/ingredientRow';

/** Provenance is deliberately presentation-only. It must never be used as an
 * eligibility predicate for search, Base selection or technical PI. */
export type MapperProvenancePresentation =
  | 'verified'
  | 'estimated'
  | 'needs_label_review'
  | 'other';

export const MAPPER_ENGINE_REQUIRED_FIELDS = [
  'water_percent',
  'total_solids_percent',
  'fat_percent',
  'protein_percent',
  'carbohydrate_percent',
  'total_sugars_percent',
  'salt_percent',
  'pod_value',
  'pac_value',
] as const satisfies readonly (keyof IngredientRow)[];

export function mapperProvenancePresentation(
  status: VerificationStatus | string,
): MapperProvenancePresentation {
  const normalized = status.trim().toLocaleLowerCase('en');
  if (normalized.startsWith('verified')) return 'verified';
  if (normalized.includes('label review')) return 'needs_label_review';
  if (normalized.startsWith('estimated') || normalized.startsWith('pi calculated')) {
    return 'estimated';
  }
  return 'other';
}

export function mapperBaseSelectable(row: IngredientRow): boolean {
  return row.is_active === true && row.approved_for_base === true;
}

export function mapperEngineMissingFields(row: IngredientRow): string[] {
  return MAPPER_ENGINE_REQUIRED_FIELDS.filter((field) => {
    const value = row[field];
    return typeof value !== 'number' || !Number.isFinite(value) || value < 0;
  });
}

export function mapperTechnicallyCalculable(row: IngredientRow): boolean {
  return row.is_active === true &&
    row.approved_for_engines === true &&
    mapperEngineMissingFields(row).length === 0;
}
