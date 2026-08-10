import type {
  HeatProcessReasonType,
  ProcessEvidenceDecision,
  RecipeProcessEvidence,
} from './processClassification';

export type MapperProcessDecision =
  | 'COLD_PROCESS_OK'
  | 'HEAT_REQUIRED_FOR_FUNCTION'
  | 'HEAT_REQUIRED_FOR_SAFETY'
  | 'HEAT_REQUIRED_FOR_BOTH'
  | 'UNKNOWN';

export interface MapperProcessMetadataRow {
  ingredient_id: string;
  process_decision: MapperProcessDecision;
  reason_type: Exclude<HeatProcessReasonType, 'missing_data'>;
  explanation_pl: string;
  heat_sensitive: boolean;
  late_addition_guidance_pl: string | null;
  source_label: string;
  source_reference: string;
  verification_status: 'verified' | 'provisional' | 'unknown';
  dataset_version: string;
}

const decisionsFor = (decision: MapperProcessDecision): ProcessEvidenceDecision[] => {
  switch (decision) {
    case 'COLD_PROCESS_OK':
      return ['cold_process_approved'];
    case 'HEAT_REQUIRED_FOR_FUNCTION':
      return ['heat_required_for_function'];
    case 'HEAT_REQUIRED_FOR_SAFETY':
      return ['heat_required_for_safety'];
    case 'HEAT_REQUIRED_FOR_BOTH':
      return ['heat_required_for_function', 'heat_required_for_safety'];
    case 'UNKNOWN':
      return [];
  }
};

export function mapperProcessRowsToEvidence(
  rows: readonly MapperProcessMetadataRow[],
): RecipeProcessEvidence[] {
  return rows.flatMap((row) =>
    decisionsFor(row.process_decision).map((decision) => ({
      decision,
      reasonType:
        decision === 'heat_required_for_safety' ? ('food_safety' as const) : row.reason_type,
      affectedIngredientIds: [row.ingredient_id],
      explanation:
        row.heat_sensitive && row.late_addition_guidance_pl
          ? `${row.explanation_pl} ${row.late_addition_guidance_pl}`
          : row.explanation_pl,
      source: {
        id: `${row.dataset_version}:${row.ingredient_id}:${decision}`,
        label: row.source_label,
        reference: row.source_reference,
        verificationStatus: row.verification_status,
      },
    })),
  );
}
