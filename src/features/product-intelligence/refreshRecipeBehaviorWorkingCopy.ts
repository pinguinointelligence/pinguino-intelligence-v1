import type { RecipeInput } from '@/engine';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import { normalizeFormulationStrategy } from '@/features/formulation-strategy/strategy';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import {
  resolveRecipeProposalBehaviorSnapshots,
  validateRecipeBehaviorOnServer,
  type RecipeBehaviorServerValidationResult,
} from '@/services/productIntelligence';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import type { ProductBehaviorModule, ProductBehaviorSnapshot } from './contracts';
import { productBehaviorRequiredLineIds } from './productBehaviorAccess';
import { productBehaviorSnapshotFingerprint } from './productBehaviorResolver';
import { buildRecipeBehaviorAuthority, recipeInputFromFrozenBehavior } from './recipeBehaviorAuthority';

export interface RefreshableProductBehaviorIssue {
  lineId: string;
  lineName: string;
  reasons: string[];
}

const REFRESHABLE_SNAPSHOT_REASON_CODES = new Set([
  'behavior_binding_stale',
  'behavior_binding_version_stale',
  'behavior_snapshot_missing_or_unresolved',
  'facts_fingerprint_stale',
  'shared_facts_stale',
  'taxonomy_version_stale',
  'product_version_stale',
  'product_identity_stale',
  'mapper_mapping_stale',
  'main_policy_stale',
  'catalog_version_identity_mismatch',
  'mapper_entity_identity_mismatch',
  'legacy_product_reference_unresolved',
]);

/** Only lifecycle/freshness failures offer the historical-version refresh.
 * Missing product science, failed classification and profile denial keep their
 * existing truthful product-data actions. */
export function productBehaviorIssuesSupportWorkingCopyRefresh(
  issues: readonly RefreshableProductBehaviorIssue[],
): boolean {
  const reasons = issues.flatMap((issue) => issue.reasons);
  return (
    reasons.length > 0 &&
    reasons.every((reason) => REFRESHABLE_SNAPSHOT_REASON_CODES.has(reason.split(':')[0] ?? reason))
  );
}

type ResolveSnapshots = typeof resolveRecipeProposalBehaviorSnapshots;
type Validate = typeof validateRecipeBehaviorOnServer;

export interface RefreshedRecipeBehaviorWorkingCopy {
  ok: true;
  recipe: RecipeInput;
  snapshots: Record<string, ProductBehaviorSnapshot>;
  previousSnapshots: Record<string, ProductBehaviorSnapshot>;
  requiredLineIds: string[];
}

export type RefreshRecipeBehaviorWorkingCopyResult =
  | RefreshedRecipeBehaviorWorkingCopy
  | {
      ok: false;
      code: 'current_authority_unresolved' | 'current_authority_invalid';
      lineIds: string[];
      issues: RefreshableProductBehaviorIssue[];
    };

const issueForLine = (
  recipe: RecipeInput,
  toppings: readonly RecipeToppingItem[],
  lineId: string,
  reasons: string[],
): RefreshableProductBehaviorIssue => ({
  lineId,
  lineName:
    recipe.items.find((item) => item.id === lineId)?.ingredient.name ??
    toppings.find((item) => item.id === lineId)?.ingredient.name ??
    lineId,
  reasons,
});

const validationIssues = (
  recipe: RecipeInput,
  toppings: readonly RecipeToppingItem[],
  validation: readonly RecipeBehaviorServerValidationResult[],
): RefreshableProductBehaviorIssue[] => {
  const lines = validation.flatMap((result) => result.lines);
  const staleLineIds = [...new Set(validation.flatMap((result) => result.staleLineIds))].sort();
  return staleLineIds.map((lineId) =>
    issueForLine(
      recipe,
      toppings,
      lineId,
      lines.find((line) => line.lineId === lineId)?.reasons ?? [
        'behavior_snapshot_missing_or_unresolved',
      ],
    ),
  );
};

/**
 * Creates a new in-memory working copy from a historical recipe snapshot.
 * The input objects are never mutated and this function performs no database
 * write. A later canonical Save appends the working copy as a new immutable
 * recipe version through the existing repository contract.
 */
export async function buildRefreshedRecipeBehaviorWorkingCopy(
  input: {
    recipe: RecipeInput;
    toppings: readonly RecipeToppingItem[];
    snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
    accountId: string;
    technicalOnlyMainLineIds?: readonly string[];
  },
  dependencies: {
    resolveSnapshots?: ResolveSnapshots;
    validate?: Validate;
  } = {},
): Promise<RefreshRecipeBehaviorWorkingCopyResult> {
  const recipe = structuredClone(input.recipe);
  const toppings = structuredClone(input.toppings);
  const requiredLineIds = productBehaviorRequiredLineIds({ items: recipe.items, toppings }).sort();
  const previousSnapshots = Object.fromEntries(
    Object.entries(input.snapshots)
      .filter((entry): entry is [string, ProductBehaviorSnapshot] => entry[1] !== undefined)
      .map(([lineId, snapshot]) => [lineId, structuredClone(snapshot)]),
  );
  const required = new Set(requiredLineIds);
  const forcedSnapshots = Object.fromEntries(
    Object.entries(previousSnapshots).map(([lineId, snapshot]) => [
      lineId,
      required.has(lineId)
        ? { ...snapshot, resolutionState: 'REVALIDATION_REQUIRED' as const }
        : snapshot,
    ]),
  );
  const module: ProductBehaviorModule =
    normalizeFormulationStrategy(recipe.goals?.formulation_strategy ?? recipe.mode) === 'eco'
      ? 'ECO'
      : 'OPTIMAL';
  const resolveSnapshots = dependencies.resolveSnapshots ?? resolveRecipeProposalBehaviorSnapshots;
  const resolved = await resolveSnapshots({
    recipe,
    toppings,
    snapshots: forcedSnapshots,
    accountId: input.accountId,
    module,
    technicalOnlyMainLineIds: input.technicalOnlyMainLineIds,
  });
  if (resolved.unresolvedLineIds.length > 0) {
    const lineIds = [...new Set(resolved.unresolvedLineIds)].sort();
    return {
      ok: false,
      code: 'current_authority_unresolved',
      lineIds,
      issues: lineIds.map((lineId) =>
        issueForLine(recipe, toppings, lineId, ['behavior_snapshot_missing_or_unresolved']),
      ),
    };
  }

  // Current technical facts belong to the new working copy. Project them
  // before the terminal server gate so that local and server validation inspect
  // one exact current vector rather than mixing old ingredients with new refs.
  const authority = buildRecipeBehaviorAuthority({
    items: recipe.items,
    toppings,
    snapshots: resolved.snapshots,
  });
  const refreshedRecipe = recipeInputFromFrozenBehavior(recipe, authority, 'technical');
  const validate = dependencies.validate ?? validateRecipeBehaviorOnServer;
  const baseRequired = productBehaviorRequiredLineIds({ items: refreshedRecipe.items });
  const toppingRequired = productBehaviorRequiredLineIds({ items: [], toppings });
  const validations: RecipeBehaviorServerValidationResult[] = [];
  if (baseRequired.length > 0) {
    validations.push(
      await validate({
        recipe: refreshedRecipe,
        snapshots: resolved.snapshots,
        module,
        accountId: input.accountId,
        technicalOnlyMainLineIds: input.technicalOnlyMainLineIds,
      }),
    );
  }
  if (toppingRequired.length > 0) {
    validations.push(
      await validate({
        recipe: { ...refreshedRecipe, items: [] },
        toppings,
        snapshots: resolved.snapshots,
        module: 'TOPPING',
        accountId: input.accountId,
      }),
    );
  }
  const issues = validationIssues(refreshedRecipe, toppings, validations);
  if (validations.some((validation) => !validation.ready) || issues.length > 0) {
    return {
      ok: false,
      code: 'current_authority_invalid',
      lineIds: issues.map((issue) => issue.lineId),
      issues,
    };
  }
  return {
    ok: true,
    recipe: refreshedRecipe,
    snapshots: structuredClone(resolved.snapshots),
    previousSnapshots,
    requiredLineIds,
  };
}

export type RefreshCurrentRecipeBehaviorWorkingCopyResult =
  | (RefreshedRecipeBehaviorWorkingCopy & {
      sourceRecipeId: string;
      sourceVersionId: string;
      sourceVersionNumber: number | null;
      refreshedAt: string;
    })
  | Exclude<RefreshRecipeBehaviorWorkingCopyResult, { ok: true }>
  | {
      ok: false;
      code: 'authentication_required' | 'saved_version_required' | 'recipe_changed' | 'working_copy_write_failed';
      lineIds: string[];
      issues: RefreshableProductBehaviorIssue[];
    };

/** User-safe lifecycle action used by the stale Preview terminal. It updates
 * only the editable working store and leaves the loaded recipe/version link in
 * place; the normal Save flow therefore appends vN+1 and never rewrites vN. */
export async function refreshCurrentRecipeBehaviorWorkingCopy(): Promise<RefreshCurrentRecipeBehaviorWorkingCopyResult> {
  const auth = useAuthStore.getState();
  const accountId = auth.status === 'authed' ? (auth.user?.id ?? null) : null;
  if (!accountId) {
    return { ok: false, code: 'authentication_required', lineIds: [], issues: [] };
  }
  const initial = useRecipeStore.getState();
  if (!initial.savedRecipeId || !initial.currentVersionId) {
    return { ok: false, code: 'saved_version_required', lineIds: [], issues: [] };
  }
  const captured = {
    accountId,
    draftContextSeq: initial.draftContextSeq,
    draftRevision: initial.draftRevision,
    snapshotFingerprint: productBehaviorSnapshotFingerprint(initial.productBehaviorSnapshots),
    sourceRecipeId: initial.savedRecipeId,
    sourceVersionId: initial.currentVersionId,
    sourceVersionNumber: initial.currentVersionNumber,
  };
  const result = await buildRefreshedRecipeBehaviorWorkingCopy({
    recipe: buildRecipeInput(initial),
    toppings: initial.toppings,
    snapshots: initial.productBehaviorSnapshots,
    accountId,
    technicalOnlyMainLineIds: initial.ownerReviewGate?.technicalOnlyMainLineIds,
  });
  if (!result.ok) return result;

  const latest = useRecipeStore.getState();
  const latestAuth = useAuthStore.getState();
  const stillCurrent =
    latestAuth.status === 'authed' &&
    latestAuth.user?.id === captured.accountId &&
    latest.savedRecipeId === captured.sourceRecipeId &&
    latest.currentVersionId === captured.sourceVersionId &&
    latest.draftContextSeq === captured.draftContextSeq &&
    latest.draftRevision === captured.draftRevision &&
    productBehaviorSnapshotFingerprint(latest.productBehaviorSnapshots) === captured.snapshotFingerprint;
  if (!stillCurrent) {
    return { ok: false, code: 'recipe_changed', lineIds: [], issues: [] };
  }
  const committed = useRecipeStore
    .getState()
    .applyVerifiedRecipeInput(result.recipe, result.snapshots, { acknowledgeRecalculation: false });
  if (!committed.ok) {
    return {
      ok: false,
      code: 'working_copy_write_failed',
      lineIds: result.requiredLineIds,
      issues: result.requiredLineIds.map((lineId) =>
        issueForLine(result.recipe, initial.toppings, lineId, [committed.code]),
      ),
    };
  }
  return {
    ...result,
    sourceRecipeId: captured.sourceRecipeId,
    sourceVersionId: captured.sourceVersionId,
    sourceVersionNumber: captured.sourceVersionNumber,
    refreshedAt: new Date().toISOString(),
  };
}
