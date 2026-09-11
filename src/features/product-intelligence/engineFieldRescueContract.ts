/**
 * Auditable Product Intelligence Rescue contract for every numeric field that
 * can reach the Engine or its nutrition output. This is descriptive policy
 * data: runtime resolution stays in `productWorkingValues` and
 * `mapperValueInference`.
 */
import { CONSENSUS_BANDS, MASS_BALANCE_RESCUE_POLICY } from './mapperValueInference.ts';
import { WORKING_NUMERIC_FIELDS, type WorkingNumericField } from './productFieldTruth.ts';
import { ENGINE_ESTIMATE_READY_FLOORS } from './productWorkingValues.ts';

export type EngineRescueField = WorkingNumericField | 'saturated_fat_percent';

export interface EngineFieldRescueContractEntry {
  field: EngineRescueField;
  directProductFactAllowed: boolean;
  deterministicDerivation: string | null;
  wholeProfileDonorAllowed: boolean;
  perFieldRescueAllowed: boolean;
  minimumConfidenceForEngineUse: number | null;
  cohortRule: string;
  dispersionRule: string;
  crossFieldGuards: readonly string[];
  failClosedCondition: string;
  unresolvedReasonCode: string;
}

const GENERAL_COHORT_RULE = 'simple-name n>=1; nearest n>=3; brand sibling n>=2; family n>=3';

const GUARDS: Readonly<Partial<Record<EngineRescueField, readonly string[]>>> = Object.freeze({
  water_percent: ['0..100', 'water + solids + alcohol = 100', 'known named solids lower bound'],
  total_solids_percent: [
    '0..100',
    'water + solids + alcohol = 100',
    'fat + protein + carbohydrate + fibre + salt <= solids + 2',
  ],
  fat_percent: ['0..100', 'named components <= total solids + 2', 'energy plausibility'],
  protein_percent: ['0..100', 'named components <= total solids + 2', 'energy plausibility'],
  carbohydrate_percent: [
    '0..100',
    'total sugars <= carbohydrate + 0.5',
    'named components <= total solids + 2',
    'energy plausibility',
  ],
  total_sugars_percent: [
    '0..100',
    'total sugars <= carbohydrate + 0.5',
    'named sugar spectrum <= total sugars + 0.5',
  ],
  sucrose_percent: ['0..100', 'named sugar spectrum <= total sugars + 0.5'],
  dextrose_percent: ['0..100', 'named sugar spectrum <= total sugars + 0.5'],
  glucose_percent: ['0..100', 'named sugar spectrum <= total sugars + 0.5'],
  fructose_percent: ['0..100', 'named sugar spectrum <= total sugars + 0.5'],
  lactose_percent: ['0..100', 'named sugar spectrum <= total sugars + 0.5'],
  polyol_percent: ['0..100', 'unnamed polyol cannot resolve POD/PAC'],
  fiber_percent: ['0..100', 'named components <= total solids + 2', 'energy plausibility'],
  salt_percent: ['0..100', 'named components <= total solids + 2'],
  alcohol_percent: ['0..100', 'water + solids + alcohol = 100', 'required for alcohol semantics'],
  kcal_per_100g: ['0..900', 'Atwater consistency tolerance'],
  pod_value: ['0..400', 'accepted typed sugar/alcohol path'],
  pac_value: ['0..400', 'accepted typed sugar/alcohol path'],
  sweetness_factor: ['no substitution for POD'],
  freezing_factor: ['no substitution for PAC'],
  saturated_fat_percent: ['0..100', 'optional nutrition output only'],
});

const deterministicDerivation = (field: EngineRescueField): string | null => {
  if (field === 'water_percent') return '100 - accepted solids - accepted alcohol';
  if (field === 'total_solids_percent') return '100 - accepted water - accepted alcohol';
  if (field === 'pod_value') return 'Engine POD from accepted typed sugar spectrum';
  if (field === 'pac_value') return 'Engine NPAC from accepted typed sugar/alcohol spectrum';
  if (field === 'kcal_per_100g') return 'Engine Atwater calculation from accepted macros';
  return null;
};

const entryFor = (field: WorkingNumericField): EngineFieldRescueContractEntry => {
  const massField = field === 'water_percent' || field === 'total_solids_percent';
  const powerField = field === 'pod_value' || field === 'pac_value';
  return {
    field,
    directProductFactAllowed: true,
    deterministicDerivation: deterministicDerivation(field),
    wholeProfileDonorAllowed: true,
    perFieldRescueAllowed: !powerField,
    minimumConfidenceForEngineUse: ENGINE_ESTIMATE_READY_FLOORS[field] ?? null,
    cohortRule: massField
      ? `semantic/form/role/macro compatible; verified+Engine-approved; n>=${MASS_BALANCE_RESCUE_POLICY.minCandidates}; n_eff>=${MASS_BALANCE_RESCUE_POLICY.minEffectiveSampleSize}`
      : powerField
        ? 'cohort forbidden; exact technical fact or Engine derivation only'
        : GENERAL_COHORT_RULE,
    dispersionRule: massField
      ? `MAD<=${MASS_BALANCE_RESCUE_POLICY.maxMad}; IQR<=${MASS_BALANCE_RESCUE_POLICY.maxIqr}; range<=${MASS_BALANCE_RESCUE_POLICY.maxRange}; 3*MAD outlier rejection`
      : powerField
        ? 'not applicable to per-field Rescue'
        : `IQR half-spread<=${CONSENSUS_BANDS[field]}`,
    crossFieldGuards: GUARDS[field] ?? ['finite value', 'stronger exact evidence wins'],
    failClosedCondition: massField
      ? `unresolved semantics, >${MASS_BALANCE_RESCUE_POLICY.maxTargetUnaccountedMass}% target mass unnamed, too few/low-quality candidates, macro mismatch, high dispersion, invalid mass balance or known-fact contradiction`
      : powerField
        ? 'typed sugar/alcohol path is materially unresolved'
        : 'no eligible cohort consensus or cross-field plausibility withdraws the estimate',
    unresolvedReasonCode: massField
      ? 'RESCUE_* field-specific reason'
      : powerField
        ? 'UNRESOLVED_SWEETENING_FREEZING_PATH'
        : 'RESCUE_FIELD_DISPERSION_OR_SUPPORT_FAILED',
  };
};

export const ENGINE_FIELD_RESCUE_MATRIX: readonly EngineFieldRescueContractEntry[] = Object.freeze([
  ...WORKING_NUMERIC_FIELDS.map(entryFor),
  {
    field: 'saturated_fat_percent',
    directProductFactAllowed: true,
    deterministicDerivation: null,
    wholeProfileDonorAllowed: false,
    perFieldRescueAllowed: false,
    minimumConfidenceForEngineUse: null,
    cohortRule: 'outside current Product Intelligence working-field projection',
    dispersionRule: 'not applicable',
    crossFieldGuards: GUARDS.saturated_fat_percent ?? [],
    failClosedCondition: 'absent exact label/specification fact remains absent',
    unresolvedReasonCode: 'OPTIONAL_LABEL_FIELD_ABSENT',
  },
]);
