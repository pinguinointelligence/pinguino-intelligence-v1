/**
 * Cross-field plausibility — what makes field-by-field assembly safe.
 *
 * A product may legitimately take its fat from one coherent cohort, its protein
 * from another, its water/solids from arithmetic closure and its sugars from a
 * more specific Mapper subset. Each field carries its own provenance and each
 * survived its own dispersion gate. But nine individually defensible numbers can
 * still be jointly impossible — solids that do not complement water, sugars that
 * exceed the carbohydrate they are part of, components that together outweigh
 * the dry matter containing them.
 *
 * So the assembled product is checked as a whole, and contradictions are
 * REJECTED rather than reconciled. Nothing here ever adjusts a number to make it
 * fit: silently nudging a value to satisfy a balance would manufacture exactly
 * the kind of unmeasured "fact" this layer exists to prevent.
 *
 * When a contradiction involves an estimate, the estimate is withdrawn — it was
 * the weaker claim, and the product is better with an honest gap than with a
 * confident impossibility. When a contradiction involves only measured values,
 * nothing is withdrawn: the product's own declaration is internally inconsistent,
 * which is the owner's data to correct, not ours to overwrite.
 *
 * Pure and deterministic: no DB, no network, no AI, no clock.
 */
import {
  unknownField,
  WORKING_NUMERIC_FIELDS,
  type ProductFieldTruthMap,
  type WorkingNumericField,
} from './productFieldTruth';

export type PlausibilityRuleId =
  | 'range'
  | 'water_solids_balance'
  | 'sugars_within_carbohydrate'
  | 'components_within_solids'
  | 'energy_matches_macros';

export interface PlausibilityViolation {
  rule: PlausibilityRuleId;
  /** Fields the rule read, strongest provenance first. */
  fields: WorkingNumericField[];
  /** Owner-readable statement of the impossibility. */
  detail: string;
  /** Estimated fields withdrawn to resolve it. Empty when nothing was withdrawn. */
  withdrawn: WorkingNumericField[];
}

export interface PlausibilityOutcome {
  fields: ProductFieldTruthMap;
  violations: PlausibilityViolation[];
  /** True when a contradiction remained that withdrawal could not resolve. */
  contradictedByDeclaration: boolean;
}

/** Water and solids are complements; they must add up. */
const WATER_SOLIDS_TOLERANCE = 1;
/** Sugars are part of carbohydrate; rounding aside, they cannot exceed it. */
const SUGARS_TOLERANCE = 0.5;
/** Components live inside the dry matter, with room for declaration rounding. */
const COMPONENTS_TOLERANCE = 2;
/** Atwater is a convention; energy is checked loosely, on the larger of the two. */
const ENERGY_ABSOLUTE_TOLERANCE = 40;
const ENERGY_RELATIVE_TOLERANCE = 0.15;

const value = (fields: ProductFieldTruthMap, field: WorkingNumericField): number | null =>
  fields[field].value;

const isEstimated = (fields: ProductFieldTruthMap, field: WorkingNumericField): boolean =>
  fields[field].provenance.state === 'ESTIMATED';

const round2 = (input: number): number => Math.round(input * 100) / 100;

/**
 * Withdraw the estimated members of a contradicting set.
 *
 * Returning the measured members untouched is deliberate: a measurement is not
 * made wrong by disagreeing with an estimate, and this function must never be
 * able to delete the product's own declared data.
 */
function withdrawEstimates(
  fields: ProductFieldTruthMap,
  involved: readonly WorkingNumericField[],
  reason: string,
): { fields: ProductFieldTruthMap; withdrawn: WorkingNumericField[] } {
  const withdrawn = involved.filter((field) => isEstimated(fields, field));
  if (withdrawn.length === 0) return { fields, withdrawn };
  const next = { ...fields };
  for (const field of withdrawn) next[field] = unknownField(reason);
  return { fields: next, withdrawn };
}

/**
 * Validate an assembled product and withdraw whatever cannot stand.
 *
 * Rules run in dependency order — ranges first, since an out-of-range value
 * would make every downstream balance meaningless.
 */
export function validatePlausibility(input: ProductFieldTruthMap): PlausibilityOutcome {
  let fields = input;
  const violations: PlausibilityViolation[] = [];
  let contradictedByDeclaration = false;

  const record = (
    rule: PlausibilityRuleId,
    involved: readonly WorkingNumericField[],
    detail: string,
  ): void => {
    const reason = `wycofane przez regułę spójności: ${detail}`;
    const result = withdrawEstimates(fields, involved, reason);
    fields = result.fields;
    if (result.withdrawn.length === 0) contradictedByDeclaration = true;
    violations.push({ rule, fields: [...involved], detail, withdrawn: result.withdrawn });
  };

  /* 1. every percentage must be a percentage */
  for (const field of WORKING_NUMERIC_FIELDS) {
    const current = value(fields, field);
    if (current === null) continue;
    if (field === 'kcal_per_100g') {
      if (current < 0 || current > 900) {
        record('range', [field], `${field} = ${current} poza zakresem 0–900 kcal`);
      }
      continue;
    }
    if (field === 'pod_value' || field === 'pac_value') {
      // POD/PAC are point scales (sucrose = 100), not percentages.
      if (current < 0 || current > 400) {
        record('range', [field], `${field} = ${current} poza zakresem 0–400 punktów`);
      }
      continue;
    }
    if (field === 'sweetness_factor' || field === 'freezing_factor') continue;
    if (current < 0 || current > 100) {
      record('range', [field], `${field} = ${current} poza zakresem 0–100%`);
    }
  }

  /* 2. water and solids are complements */
  const water = value(fields, 'water_percent');
  const solids = value(fields, 'total_solids_percent');
  const alcohol = value(fields, 'alcohol_percent') ?? 0;
  if (water !== null && solids !== null) {
    // Alcohol is neither water nor dry matter, so it takes its own share of 100.
    const total = water + solids + alcohol;
    if (Math.abs(total - 100) > WATER_SOLIDS_TOLERANCE) {
      record(
        'water_solids_balance',
        ['water_percent', 'total_solids_percent'],
        `woda ${water} + sucha masa ${solids}${alcohol > 0 ? ` + alkohol ${alcohol}` : ''} = ${round2(total)}, oczekiwano 100`,
      );
    }
  }

  /* 3. sugars are a subset of carbohydrate */
  const sugars = value(fields, 'total_sugars_percent');
  const carbohydrate = value(fields, 'carbohydrate_percent');
  if (sugars !== null && carbohydrate !== null && sugars > carbohydrate + SUGARS_TOLERANCE) {
    record(
      'sugars_within_carbohydrate',
      ['total_sugars_percent', 'carbohydrate_percent'],
      `cukry ${sugars} przekraczają węglowodany ${carbohydrate}`,
    );
  }

  /* 4. the named components must fit inside the dry matter */
  const solidsNow = value(fields, 'total_solids_percent');
  if (solidsNow !== null) {
    const parts: WorkingNumericField[] = [
      'fat_percent',
      'protein_percent',
      'carbohydrate_percent',
      'fiber_percent',
      'salt_percent',
    ];
    const present = parts.filter((field) => value(fields, field) !== null);
    // Only meaningful once the major contributors are known; two minor fields
    // summing under the solids proves nothing.
    const major = ['fat_percent', 'protein_percent', 'carbohydrate_percent'] as const;
    if (major.every((field) => value(fields, field) !== null)) {
      const sum = present.reduce((total, field) => total + (value(fields, field) ?? 0), 0);
      if (sum > solidsNow + COMPONENTS_TOLERANCE) {
        record(
          'components_within_solids',
          ['total_solids_percent', ...present],
          `składniki sumują się do ${round2(sum)}, a sucha masa to ${solidsNow}`,
        );
      }
    }
  }

  /* 5. energy must follow from the macros */
  const kcal = value(fields, 'kcal_per_100g');
  const fat = value(fields, 'fat_percent');
  const protein = value(fields, 'protein_percent');
  const carbs = value(fields, 'carbohydrate_percent');
  if (kcal !== null && fat !== null && protein !== null && carbs !== null) {
    const fibre = value(fields, 'fiber_percent') ?? 0;
    const expected = 9 * fat + 4 * protein + 4 * carbs + 2 * fibre;
    const tolerance = Math.max(
      ENERGY_ABSOLUTE_TOLERANCE,
      ENERGY_RELATIVE_TOLERANCE * Math.max(kcal, expected),
    );
    if (Math.abs(kcal - expected) > tolerance) {
      record(
        'energy_matches_macros',
        ['kcal_per_100g', 'fat_percent', 'protein_percent', 'carbohydrate_percent'],
        `energia ${kcal} kcal nie zgadza się z makroskładnikami (${round2(expected)} kcal wg Atwatera)`,
      );
    }
  }

  return { fields, violations, contradictedByDeclaration };
}
