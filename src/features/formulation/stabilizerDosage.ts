/**
 * APPROVED STABILIZER DOSAGE (owner Phase 9 — tara 5 g forensic audit, NIGHTLY).
 *
 * Connects the EXISTING, already-approved Mapper dosage recommendation into the
 * formulation layer — as SAFETY BOUNDS and honest QA diagnostics. NOTHING here
 * is invented (science freeze):
 *  - the window 0.2–1 comes VERBATIM from the Mapper v1.0 row and its schema
 *    unit contract (`recommended_dosage_percent_min/max`, "0–100 · of total
 *    mix" — PINGUINO_BASE_INGREDIENTS_SCHEMA.md), re-verified READ-ONLY on
 *    staging (project tunabqqrwabacxjcxxkz, table mapper_basement, 2026-07-24):
 *    PI-ING-000492 "TARA GUM · Stabilizer", subcategory `tara_gum` (PURE gum:
 *    water 9.5 / solids 90.5 / fiber 86.5 / protein 2, pod 0 / pac 0),
 *    recommended_dosage_percent_min 0.2 / max 1, Verified, approved_for_engines;
 *  - PI-ING-000490 "IC · Solmix Stabilizer", subcategory `stabilizer_blend`,
 *    carries its OWN window (also 0.2–1) — recorded as a SEPARATE identity.
 *
 * DOMAIN RULE (owner Phase 9 — pure-gum vs blend identity): dosage windows are
 * keyed to the EXACT canonical ingredient identity. A blend's dosage can never
 * map onto a pure-gum row and vice versa — there is NO kind-level or
 * category-level fallback. An unregistered stabilizer has NO approved window
 * (honest `no_approved_window`), never a borrowed one.
 *
 * UNITS are explicit on every field: `percent_of_total_mix` (percent of the
 * recipe's total planned mass, 0–100) and `grams`. Template quantities remain
 * grams at the template's base batch; the Engine consumes grams only.
 *
 * SCIENTIFIC LIMIT (honest): the Engine has NO stabilizer-activity metric or
 * band (`detectViolations` covers pod/npac/ice/water/solids/fat/protein/
 * lactose/sandiness/alcohol only, and `tara_gum` appears in no solver
 * SELECTION_RULES entry), so moving the stabilizer dose produces no
 * engine-verified gradient. These bounds therefore act as CLAMPS on any
 * solver-produced movement plus honest diagnostics — the template-controlled
 * seed itself is NEVER silently rewritten (templates are verbatim approved /
 * reference-derived records) and dose OPTIMIZATION stays scientifically
 * unresolved pending the owner's stabilizer-activity target.
 */
import type { CorrectionAction, RecipeInput } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { resolveFunctionalRole } from './ingredientRoles';
import { gelatoStabilizerSystemApplies } from '@/features/recipe-constraints/gelatoStabilizerSystemAuthority';
import { assessSorbetStabilizerSystem } from '@/features/recipe-constraints/sorbetStabilizerSystemAuthority';

export type StabilizerIdentityKind = 'pure_gum' | 'stabilizer_blend';

export interface ApprovedStabilizerDosage {
  /** Stable canonical Mapper id (staging-verified 2026-07-24, read-only). */
  mapperId: string;
  /** Engine correction-candidate id carrying the same identity (null = none). */
  toolboxId: string | null;
  namePl: string;
  /** Pure gum vs blend — dosage windows NEVER cross this identity line. */
  kind: StabilizerIdentityKind;
  /** UNIT: percent of TOTAL MIX mass (Mapper schema "0–100 · of total mix"). */
  minPercentOfTotalMix: number;
  maxPercentOfTotalMix: number;
  unit: 'percent_of_total_mix';
  provenance: string;
}

const APPROVED_STABILIZER_DOSAGES: readonly ApprovedStabilizerDosage[] = [
  {
    mapperId: 'PI-ING-000492',
    toolboxId: 'tara_gum',
    namePl: 'Guma tara',
    kind: 'pure_gum',
    minPercentOfTotalMix: 0.2,
    maxPercentOfTotalMix: 1,
    unit: 'percent_of_total_mix',
    provenance:
      'mapper_basement v1.0 PI-ING-000492 recommended_dosage_percent_min/max ' +
      '(percent of total mix; staging-verified read-only 2026-07-24)',
  },
  {
    mapperId: 'PI-ING-000490',
    toolboxId: null,
    namePl: 'IC · Solmix Stabilizer',
    kind: 'stabilizer_blend',
    minPercentOfTotalMix: 0.2,
    maxPercentOfTotalMix: 1,
    unit: 'percent_of_total_mix',
    provenance:
      'mapper_basement v1.0 PI-ING-000490 recommended_dosage_percent_min/max ' +
      '(percent of total mix; staging-verified read-only 2026-07-24)',
  },
];

/** EXACT-identity lookup (engine toolbox id OR stable Mapper id). No fallback
 * of any kind — an unregistered ingredient has no approved window. */
export function approvedStabilizerDosage(ingredientId: string): ApprovedStabilizerDosage | null {
  return (
    APPROVED_STABILIZER_DOSAGES.find(
      (entry) => entry.mapperId === ingredientId || entry.toolboxId === ingredientId,
    ) ?? null
  );
}

/**
 * Kind-checked lookup (owner Phase 9, test 17 — pure-gum vs blend
 * non-interchange): resolves ONLY when the registered identity's kind matches
 * the expected kind. A blend dosage can never map onto a pure-gum row.
 */
export function approvedStabilizerDosageOfKind(
  ingredientId: string,
  expectedKind: StabilizerIdentityKind,
): ApprovedStabilizerDosage | null {
  const entry = approvedStabilizerDosage(ingredientId);
  return entry !== null && entry.kind === expectedKind ? entry : null;
}

/** The approved window expressed in grams for a given total mix mass. */
export function stabilizerDosageWindowGrams(
  entry: ApprovedStabilizerDosage,
  totalMixGrams: number,
): { minGrams: number; maxGrams: number; unit: 'grams' } {
  return {
    minGrams: (entry.minPercentOfTotalMix / 100) * totalMixGrams,
    maxGrams: (entry.maxPercentOfTotalMix / 100) * totalMixGrams,
    unit: 'grams',
  };
}

export type StabilizerDosageStatus =
  | 'within_window'
  | 'below_window'
  | 'above_window'
  | 'no_approved_window';

export interface StabilizerDosageAssessment {
  lineId: string;
  ingredientId: string;
  ingredientName: string;
  /** Registered identity kind (null = not in the approved registry). */
  kind: StabilizerIdentityKind | null;
  /** UNIT: grams (the recipe line's planned amount). */
  grams: number;
  unitGrams: 'grams';
  /** UNIT: percent of total mix (null when the mix carries no mass). */
  percentOfTotalMix: number | null;
  unitPercent: 'percent_of_total_mix';
  /** The approved window for THIS exact identity (null = none approved). */
  window: ApprovedStabilizerDosage | null;
  status: StabilizerDosageStatus;
}

const sumPlanned = (input: RecipeInput): number =>
  input.items.reduce((sum, item) => sum + item.planned_grams, 0);
const DOSAGE_EPS = 1e-9;

/**
 * A stabilizer carrier has an approved identity/dose contract, but no approved
 * Engine activity gradient. Its dosage window is a safety clamp only: it is
 * never permission for PI to move the dose while chasing POD, NPAC or a
 * Direction preference. Inulin resolves to `fiber_body`, so it deliberately
 * remains an adjustable solids/body lever.
 */
export const isTemplateControlledStabilizer = (
  ingredient: RecipeInput['items'][number]['ingredient'],
): boolean => resolveFunctionalRole(ingredient) === 'stabilizer';

/**
 * Solver-only exact holds for every stabilizer line in the state being
 * optimized. These holds are not written into the user's visible §17 locks;
 * they enforce the existing template contract inside every shared correction
 * and formulation search. A user may explicitly change the current dose; the
 * next search then holds that newly chosen value exactly.
 */
export function withTemplateControlledStabilizerLocks(
  input: RecipeInput,
  set: ConstraintSet,
): ConstraintSet {
  const stabilizers = input.items.filter((item) => isTemplateControlledStabilizer(item.ingredient));
  if (stabilizers.length === 0) return set;
  const byLineId = { ...set.byLineId };
  for (const item of stabilizers) {
    const visible = set.byLineId[item.id];
    // A percent lock is an explicit proportional contract. At the current
    // batch it still holds the dose exactly, while the batch-rescale route may
    // carry the same percentage to another batch.
    if (visible?.mode === 'percent') {
      byLineId[item.id] = visible;
      continue;
    }
    if (visible === undefined && item.lock_type === 'percent' && input.target_batch_grams > 0) {
      byLineId[item.id] = {
        mode: 'percent',
        percent: (item.planned_grams / input.target_batch_grams) * 100,
      };
      continue;
    }
    const heldGrams =
      visible?.mode === 'locked'
        ? visible.grams
        : visible?.mode === 'range'
          ? Math.min(Math.max(item.planned_grams, visible.minGrams), visible.maxGrams)
          : item.planned_grams;
    byLineId[item.id] = { mode: 'locked', grams: heldGrams };
  }
  return { byLineId };
}

export interface TemplateControlledStabilizerViolation {
  lineId: string;
  ingredientName: string;
  code: 'line_missing' | 'dose_changed';
}

export interface TemplateControlledStabilizerComparisonOptions {
  /** Explicit batch-rescale is the one approved path that scales an unlocked
   * template dose proportionally with the whole recipe. */
  proportionalBatchRatio?: number;
  /** User-visible §17/native locks stay byte-exact even during batch scale. */
  fixedLineIds?: ReadonlySet<string>;
  /** Narrow exception re-derived from an approved formulation template. */
  approvedFormulationSeed?: {
    totalGrams: number;
    allowedLineIds: ReadonlySet<string>;
  };
}

/**
 * Trustless Apply invariant. A positive stabilizer dose already present in the
 * current draft is established recipe intent and must survive byte-exactly.
 * A missing/zero template role may still be filled by an approved formulation
 * seed; explicit §17 zero locks are guarded independently by the constraint
 * door.
 */
export function templateControlledStabilizerViolations(
  current: RecipeInput,
  proposed: RecipeInput,
  options: TemplateControlledStabilizerComparisonOptions = {},
): TemplateControlledStabilizerViolation[] {
  if (gelatoStabilizerSystemApplies(current.category)) return [];
  const proposedByLineId = new Map(proposed.items.map((item) => [item.id, item]));
  const violations: TemplateControlledStabilizerViolation[] = [];
  const currentStabilizers = current.items.filter((item) =>
    isTemplateControlledStabilizer(item.ingredient),
  );
  const proposedStabilizers = proposed.items.filter((item) =>
    isTemplateControlledStabilizer(item.ingredient),
  );
  const hasEstablishedPositiveDose = currentStabilizers.some((item) => item.planned_grams > 0);
  // A legacy Sorbet dose (notably S01–S03 at 0.8 g) is historical evidence,
  // not executable intent under the owner whole-gram aggregate policy. Permit
  // only the approved formulation seed to rebuild that invalid dose. Once the
  // current Sorbet system is valid, the established-dose invariant resumes and
  // a forged in-window mutation remains blocked.
  const sorbetLegacyRebuild =
    current.category === 'sorbet' && assessSorbetStabilizerSystem(current).issues.length > 0;
  const seed =
    !hasEstablishedPositiveDose || sorbetLegacyRebuild
      ? options.approvedFormulationSeed
      : undefined;
  const positiveProposedStabilizers = proposedStabilizers.filter(
    (item) => item.planned_grams > DOSAGE_EPS,
  );
  const seedIsExact =
    seed !== undefined &&
    positiveProposedStabilizers.length > 0 &&
    positiveProposedStabilizers.every((item) => seed.allowedLineIds.has(item.id)) &&
    Math.abs(
      positiveProposedStabilizers.reduce((sum, item) => sum + item.planned_grams, 0) -
        seed.totalGrams,
    ) <= DOSAGE_EPS;
  for (const item of currentStabilizers) {
    const next = proposedByLineId.get(item.id);
    if (!next) {
      violations.push({
        lineId: item.id,
        ingredientName: item.ingredient.name,
        code: 'line_missing',
      });
      continue;
    }
    if (seedIsExact && seed?.allowedLineIds.has(item.id)) continue;
    const mayScale =
      options.proportionalBatchRatio !== undefined && !options.fixedLineIds?.has(item.id);
    const expectedGrams = mayScale
      ? item.planned_grams * options.proportionalBatchRatio!
      : item.planned_grams;
    if (Math.abs(next.planned_grams - expectedGrams) > DOSAGE_EPS) {
      violations.push({
        lineId: item.id,
        ingredientName: item.ingredient.name,
        code: 'dose_changed',
      });
    }
  }
  const currentLineIds = new Set(currentStabilizers.map((item) => item.id));
  for (const item of proposedStabilizers) {
    if (currentLineIds.has(item.id) || (seedIsExact && seed?.allowedLineIds.has(item.id))) continue;
    violations.push({
      lineId: item.id,
      ingredientName: item.ingredient.name,
      code: 'dose_changed',
    });
  }
  return violations;
}

/**
 * Assess every stabilizer-role line of the recipe against its OWN approved
 * dosage window (exact identity, explicit units). PURE, diagnostic — never
 * mutates and never blocks; consumers decide (QA rows, solver-action clamp).
 */
export function assessStabilizerDosage(input: RecipeInput): StabilizerDosageAssessment[] {
  const totalMix = sumPlanned(input);
  const assessments: StabilizerDosageAssessment[] = [];
  for (const item of input.items) {
    if (resolveFunctionalRole(item.ingredient) !== 'stabilizer') continue;
    const window = approvedStabilizerDosage(canonicalIngredientId(item.ingredient));
    const percent = totalMix > 0 ? (item.planned_grams / totalMix) * 100 : null;
    let status: StabilizerDosageStatus = 'no_approved_window';
    if (window !== null && percent !== null) {
      status =
        percent < window.minPercentOfTotalMix - DOSAGE_EPS
          ? 'below_window'
          : percent > window.maxPercentOfTotalMix + DOSAGE_EPS
            ? 'above_window'
            : 'within_window';
    }
    assessments.push({
      lineId: item.id,
      ingredientId: item.ingredient.id,
      ingredientName: item.ingredient.name,
      kind: window?.kind ?? null,
      grams: item.planned_grams,
      unitGrams: 'grams',
      percentOfTotalMix: percent,
      unitPercent: 'percent_of_total_mix',
      window,
      status,
    });
  }
  return assessments;
}

/**
 * SAFETY CLAMP (owner Phase 9 — the approved-bounds wiring): TRUE when a
 * solver action would move a REGISTERED stabilizer identity outside its
 * approved Mapper window — an `add` pushing the dose above the max percent of
 * the (mass-change-aware) total mix, or a `reduce` cutting it below the min.
 * Unregistered ingredients and non-stabilizer actions are never touched.
 * The formulation pipeline rejects such actions at candidate-selection time;
 * it NEVER rewrites the template-controlled seed itself.
 */
export function violatesApprovedStabilizerDosage(
  current: RecipeInput,
  action: Pick<CorrectionAction, 'type' | 'ingredient_id' | 'grams'>,
): boolean {
  // Correction actions may carry a private/product line source id while the
  // approved window is keyed by the canonical Mapper identity. Resolve from
  // the actual current line before applying the clamp.
  const actionLine = current.items.find((item) => item.ingredient.id === action.ingredient_id);
  const entry = approvedStabilizerDosage(
    actionLine ? canonicalIngredientId(actionLine.ingredient) : action.ingredient_id,
  );
  if (entry === null) return false;
  const totalMix = sumPlanned(current);
  if (totalMix <= 0) return false;
  const currentGrams = current.items
    .filter(
      (item) =>
        item.ingredient.id === action.ingredient_id ||
        approvedStabilizerDosage(canonicalIngredientId(item.ingredient))?.mapperId ===
          entry.mapperId,
    )
    .reduce((sum, item) => sum + item.planned_grams, 0);
  if (action.type === 'add') {
    const nextPercent = ((currentGrams + action.grams) / (totalMix + action.grams)) * 100;
    return nextPercent > entry.maxPercentOfTotalMix + DOSAGE_EPS;
  }
  if (action.type === 'reduce') {
    const nextGrams = Math.max(0, currentGrams - action.grams);
    const nextMix = Math.max(DOSAGE_EPS, totalMix - action.grams);
    const nextPercent = (nextGrams / nextMix) * 100;
    return nextPercent < entry.minPercentOfTotalMix - DOSAGE_EPS;
  }
  return false;
}

export function listApprovedStabilizerDosages(): readonly ApprovedStabilizerDosage[] {
  return APPROVED_STABILIZER_DOSAGES;
}
