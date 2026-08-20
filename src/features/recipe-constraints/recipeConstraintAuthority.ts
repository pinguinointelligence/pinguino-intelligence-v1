import {
  calculateRecipe,
  type RecipeInput,
  type RecipeResult,
} from '@/engine';
import { veganRecipeEligibilityIssues } from '@/data/ingredients/veganEligibility';
import { veganProfileConstraintIssues } from '@/features/formulation/veganProfileConstraints';
import { classifyViolationBands } from '@/features/formulation/violationBands';
import { normalizeFormulationStrategy } from '@/features/formulation-strategy/strategy';
import {
  assessProductDosages,
  productBehaviorModuleGate,
  productBehaviorRequiredLineIds,
  verifyMainEnvelope,
  type MainEnvelopeViolation,
  type ProductBehaviorModule,
  type ProductBehaviorSnapshot,
  type ProductDosageViolation,
} from '@/features/product-intelligence';
import { assessProteinTarget } from '@/features/protein-gelato/proteinTarget';
import { BATCH_SUM_TOLERANCE_G } from './constraintSet';

export type RecipeConstraintAuthorityIssue =
  | { source: 'batch'; code: 'batch_total_mismatch'; lineIds: string[]; messagePl: string }
  | { source: 'engine'; code: 'native_band_violation'; lineIds: string[]; metric: string; messagePl: string }
  | { source: 'engine'; code: 'critical_warning'; lineIds: string[]; metric: string; messagePl: string }
  | { source: 'profile'; code: 'profile_evidence_missing' | 'profile_not_eligible'; lineIds: string[]; messagePl: string }
  | { source: 'profile'; code: 'vegan_ingredient_invalid' | 'vegan_profile_invalid' | 'protein_target_unmet'; lineIds: string[]; messagePl: string }
  | { source: 'product_behavior'; code: 'product_behavior_invalid'; lineIds: string[]; messagePl: string }
  | { source: 'product_behavior'; code: 'product_dosage_invalid'; lineIds: string[]; messagePl: string; violation: ProductDosageViolation }
  | { source: 'main'; code: MainEnvelopeViolation['code']; lineIds: string[]; messagePl: string };

export interface RecipeConstraintAuthorityResult {
  valid: boolean;
  result: RecipeResult;
  issues: RecipeConstraintAuthorityIssue[];
}

export interface RecipeConstraintAuthorityInput {
  recipe: RecipeInput;
  snapshots?: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  module?: ProductBehaviorModule;
  /** Test-only/synthetic recipes without catalog lineage may opt out. Runtime
   * mutation and terminal paths must leave this true. */
  requireProductBehavior?: boolean;
  technicalOnlyMainLineIds?: readonly string[];
  enforceMainFloor?: boolean;
}

/**
 * One exact-candidate hard gate. It composes existing Engine bands, profile
 * rules and immutable ProductBehavior/Main authorities without copying a
 * scientific constant. Solver code may use the same underlying bounds early;
 * this independent final evaluation is the terminal truth for the vector.
 */
export function evaluateRecipeConstraintAuthority(
  input: RecipeConstraintAuthorityInput,
): RecipeConstraintAuthorityResult {
  const { recipe } = input;
  const snapshots = input.snapshots ?? {};
  const requireProductBehavior = input.requireProductBehavior ?? true;
  const result = calculateRecipe(recipe);
  const issues: RecipeConstraintAuthorityIssue[] = [];
  const plannedTotal = recipe.items.reduce((sum, item) => sum + item.planned_grams, 0);
  if (Math.abs(plannedTotal - recipe.target_batch_grams) > BATCH_SUM_TOLERANCE_G) {
    issues.push({
      source: 'batch',
      code: 'batch_total_mismatch',
      lineIds: recipe.items.map((item) => item.id),
      messagePl:
        `Suma receptury ${plannedTotal.toFixed(1)} g nie odpowiada partii ` +
        `${recipe.target_batch_grams.toFixed(1)} g.`,
    });
  }

  const native = classifyViolationBands(recipe);
  for (const metric of native.hardMetrics) {
    issues.push({
      source: 'engine',
      code: 'native_band_violation',
      lineIds: recipe.items.map((item) => item.id),
      metric,
      messagePl: `Parametr ${metric} jest poza zatwierdzonym zakresem profilu.`,
    });
  }
  for (const warning of result.warnings.filter((entry) => entry.severity === 'critical')) {
    issues.push({
      source: 'engine',
      code: 'critical_warning',
      lineIds: recipe.items.map((item) => item.id),
      metric: warning.code,
      messagePl: `Krytyczne ostrzeżenie Engine: ${warning.code}.`,
    });
  }

  if (recipe.category === 'vegan_gelato') {
    const eligibility = veganRecipeEligibilityIssues(recipe.items);
    if (eligibility.length > 0) {
      issues.push({
        source: 'profile',
        code: 'vegan_ingredient_invalid',
        lineIds: eligibility.map((issue) => issue.lineId),
        messagePl:
          'Profil Wegański zawiera składniki bez zatwierdzonej zgodności Vegan: ' +
          eligibility.map((issue) => issue.ingredientName).join(', '),
      });
    }
    const profile = veganProfileConstraintIssues(recipe);
    if (profile.length > 0) {
      issues.push({
        source: 'profile',
        code: 'vegan_profile_invalid',
        lineIds: profile.flatMap((issue) => issue.lineId ? [issue.lineId] : []),
        messagePl: 'Receptura przekracza zatwierdzoną kopertę profilu Wegańskiego.',
      });
    }
  }
  const protein = assessProteinTarget(recipe, result);
  if (protein.applicable && !protein.reached) {
    issues.push({
      source: 'profile',
      code: 'protein_target_unmet',
      lineIds: recipe.items.map((item) => item.id),
      messagePl:
        `Profil Protein wymaga celu ${protein.targetPercent?.toFixed(1)}%; ` +
        `kandydat ma ${protein.actualPercent?.toFixed(1)}%.`,
    });
  }

  const requiredLineIds = productBehaviorRequiredLineIds({ items: recipe.items });
  if (requireProductBehavior && requiredLineIds.length > 0) {
    const technicalOnlyMainLineIds = new Set(input.technicalOnlyMainLineIds ?? []);
    const sensoryMainLineIds = new Set(
      recipe.items
        .filter(
          (item) => item.lock_type === 'main' && !technicalOnlyMainLineIds.has(item.id),
        )
        .map((item) => item.id),
    );
    const module = input.module ??
      (normalizeFormulationStrategy(recipe.goals?.formulation_strategy ?? recipe.mode) === 'eco'
        ? 'ECO'
        : 'OPTIMAL');
    const behavior = productBehaviorModuleGate(snapshots, module, requiredLineIds);
    if (!behavior.ready) {
      issues.push({
        source: 'product_behavior',
        code: 'product_behavior_invalid',
        lineIds: behavior.blockedLineIds,
        messagePl: behavior.reason ?? 'Brak aktualnego ProductBehavior dla receptury.',
      });
    }
    for (const lineId of requiredLineIds) {
      // profileEligibility is derived from published sensory Main policies.
      // Standard/structural products legitimately have an empty list, so it
      // is not a recipe-wide ingredient allow-list. Vegan/Protein ingredient
      // eligibility remains owned by their canonical profile authorities.
      if (!sensoryMainLineIds.has(lineId)) continue;
      const snapshot = snapshots[lineId];
      if (!snapshot || snapshot.resolutionState !== 'RESOLVED') continue;
      const eligible = snapshot.sharedFacts?.profileEligibility;
      if (!Array.isArray(eligible)) {
        issues.push({
          source: 'profile',
          code: 'profile_evidence_missing',
          lineIds: [lineId],
          messagePl: 'Brak zamrożonej zgodności produktu z wybranym profilem.',
        });
      } else if (!eligible.includes(recipe.category)) {
        issues.push({
          source: 'profile',
          code: 'profile_not_eligible',
          lineIds: [lineId],
          messagePl: 'Produkt nie jest zatwierdzony dla wybranego profilu receptury.',
        });
      }
    }
    for (const violation of assessProductDosages(recipe, snapshots)) {
      issues.push({
        source: 'product_behavior',
        code: 'product_dosage_invalid',
        lineIds: [violation.lineId],
        messagePl: violation.messagePl,
        violation,
      });
    }
    // A missing/stale product snapshot is the root blocker. Do not cascade a
    // derived Main/carrier verdict from incomplete evidence.
    if (behavior.ready) {
      const main = verifyMainEnvelope({
        recipe,
        snapshots,
        mode: normalizeFormulationStrategy(recipe.goals?.formulation_strategy ?? recipe.mode),
        enforceFloor: input.enforceMainFloor,
        technicalOnlyMainLineIds: input.technicalOnlyMainLineIds,
      });
      if (!main.ok) {
        issues.push(
          ...main.violations.map((violation) => ({
            source: 'main' as const,
            code: violation.code,
            lineIds: violation.lineIds,
            messagePl: violation.messagePl,
          })),
        );
      }
    }
  }

  return { valid: issues.length === 0, result, issues };
}

/** Solver probes need a cheap shared predicate over the same final authority. */
export function recipeCandidateIsHardValid(input: RecipeConstraintAuthorityInput): boolean {
  return evaluateRecipeConstraintAuthority(input).valid;
}
