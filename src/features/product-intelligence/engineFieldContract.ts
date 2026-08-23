/**
 * What the Engine actually requires of a product — read from the Engine, not assumed.
 *
 * Readiness was previously judged against `MAPPER_ENGINE_REQUIRED_FIELDS`, which
 * is the Mapper's CURATION standard: what a hand-verified basement row owes the
 * catalogue. Holding imported commercial products to it demands `pod_value` and
 * `pac_value` as source data, which the Engine does not ask for.
 *
 * The audit behind this file (`src/engine`):
 *
 *   • `ingredientRowToEngineIngredient` coerces every absent composition
 *     component to 0 at the seam, so the Engine never crashes on a gap — but a
 *     zero is a real contribution, so "accepted" is not "meaningful". That is
 *     exactly what a readiness gate is for.
 *   • `pod_value` / `pac_value` / `de_value` are NULLABLE on `EngineIngredient`
 *     and preserved verbatim. The Engine's sweetening path falls back to the
 *     typed sugar breakdown, and its freezing path to the DE anchors and then
 *     the breakdown. They are DERIVED values, not source evidence.
 *   • That fallback yields ZERO when the sugar spectrum is unknown. For a sugary
 *     product a silent zero is the dangerous case, so the contract requires a
 *     resolvable sweetening/freezing PATH rather than the stored numbers.
 *   • `polyol_percent` is first-class: it enters composition, and
 *     the nutrition stage charges it 2.4 kcal/g against carbohydrate-minus-polyol.
 *     But `pod.ts` states plainly that the breakdown fallback contributes 0 for
 *     polyols — their correct path is a stored `pod_value`, or one of the five
 *     named polyols in `POLYOL_COEFFICIENTS`.
 *
 * This file is DATA, not behaviour. The readiness decision it informs stays in
 * `productWorkingValues`, which already owns it — this only records what the
 * Engine was found to require, so the decision can be checked against evidence
 * instead of memory.
 */
import type { WorkingNumericField } from './productFieldTruth';

export type FieldRequirement =
  /** The Engine cannot produce a meaningful result without it. */
  | 'required'
  /** Required, but satisfiable by its complement or by derivation. */
  | 'required_or_derived'
  /** Only required when the product's own composition makes it matter. */
  | 'conditional'
  /** Read when present, harmless when absent. */
  | 'optional'
  /** Never a product input: the Engine computes it. */
  | 'derived_by_engine';

export interface FieldContractEntry {
  field: WorkingNumericField | 'sucrose_percent' | 'dextrose_percent' | 'glucose_percent' |
    'fructose_percent' | 'lactose_percent' | 'polyol_percent' | 'saturated_fat_percent';
  requirement: FieldRequirement;
  /** Where the Engine consumes or derives it. */
  engineSite: string;
  /** Why readiness treats it this way. */
  note: string;
}

/**
 * The audited matrix. Kept as data so it can be asserted against and shown to
 * the owner, rather than living implicitly inside a predicate.
 */
export const ENGINE_FIELD_CONTRACT: readonly FieldContractEntry[] = Object.freeze([
  {
    field: 'water_percent',
    requirement: 'required_or_derived',
    engineSite: 'composition.ts — mass balance',
    note: 'water and solids are one unknown; either one determines the other',
  },
  {
    field: 'total_solids_percent',
    requirement: 'required_or_derived',
    engineSite: 'composition.ts — solids_percent',
    note: 'complement of water; never counted as a second independent gap',
  },
  {
    field: 'fat_percent',
    requirement: 'required',
    engineSite: 'composition.ts, nutrition.ts',
    note: 'no derivation exists; a coerced 0 would silently misstate the product',
  },
  {
    field: 'protein_percent',
    requirement: 'required',
    engineSite: 'composition.ts, nutrition.ts',
    note: 'no derivation exists',
  },
  {
    field: 'carbohydrate_percent',
    requirement: 'required',
    engineSite: 'composition.ts, nutrition.ts',
    note: 'no derivation exists; also bounds total sugars',
  },
  {
    field: 'total_sugars_percent',
    requirement: 'required',
    engineSite: 'composition.ts — sugar_percent',
    note: 'drives the sweetening/freezing path and the sugar closure checks',
  },
  {
    field: 'sucrose_percent',
    requirement: 'conditional',
    engineSite: 'pod.ts / pac.ts typed breakdown',
    note: 'part of the spectrum that resolves POD/PAC when they are not stored',
  },
  {
    field: 'dextrose_percent',
    requirement: 'conditional',
    engineSite: 'pod.ts / pac.ts typed breakdown',
    note: 'as above',
  },
  {
    field: 'glucose_percent',
    requirement: 'conditional',
    engineSite: 'pod.ts / pac.ts typed breakdown',
    note: 'as above',
  },
  {
    field: 'fructose_percent',
    requirement: 'conditional',
    engineSite: 'pod.ts / pac.ts typed breakdown',
    note: 'as above',
  },
  {
    field: 'lactose_percent',
    requirement: 'conditional',
    engineSite: 'pod.ts / pac.ts typed breakdown',
    note: 'as above; only meaningful for dairy-bearing products',
  },
  {
    field: 'polyol_percent',
    requirement: 'conditional',
    engineSite: 'composition.ts, nutrition.ts (2.4 kcal/g)',
    note: 'composition and energy are supported; POD/PAC are NOT derivable from an unnamed polyol',
  },
  {
    field: 'fiber_percent',
    requirement: 'optional',
    engineSite: 'composition.ts, nutrition.ts',
    note: 'absent means no fibre contribution, which is a safe reading',
  },
  {
    field: 'salt_percent',
    requirement: 'optional',
    engineSite: 'composition.ts, NPAC coefficients',
    note: 'affects net freezing depression only at levels food rarely reaches',
  },
  {
    field: 'alcohol_percent',
    requirement: 'conditional',
    engineSite: 'NPAC coefficients',
    note: 'must be known when the product is alcoholic; absent means none',
  },
  {
    field: 'saturated_fat_percent',
    requirement: 'optional',
    engineSite: 'EngineIngredient optional field',
    note: 'kept absent rather than invented as 0',
  },
  {
    field: 'pod_value',
    requirement: 'derived_by_engine',
    engineSite: 'engine sweetening path — stored value, else typed sugar breakdown',
    note: 'NOT source evidence; requiring it of a commercial product is a curation rule, not an Engine rule',
  },
  {
    field: 'pac_value',
    requirement: 'derived_by_engine',
    engineSite: 'engine freezing path — stored value, else DE anchors, else breakdown',
    note: 'as above',
  },
  {
    field: 'kcal_per_100g',
    requirement: 'derived_by_engine',
    engineSite: 'engine nutrition stage — Atwater with polyols at 2.4',
    note: 'the Engine computes energy; a stored value is a cross-check, not an input',
  },
]);

/** Fields a normal commercial product must genuinely hold. */
export const REQUIRED_COMPOSITION_FIELDS = [
  'fat_percent',
  'protein_percent',
  'carbohydrate_percent',
  'total_sugars_percent',
] as const satisfies readonly WorkingNumericField[];

/** Sugars whose presence lets the Engine resolve POD/PAC without a stored value. */
export const SUGAR_SPECTRUM_FIELDS = [
  'sucrose_percent',
  'dextrose_percent',
  'glucose_percent',
  'fructose_percent',
  'lactose_percent',
] as const;
