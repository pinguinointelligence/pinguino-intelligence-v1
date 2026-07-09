/**
 * Accepted-correction DRAFT builder (Spine Slice 16) — the PURE, non-writing
 * contract for the future "save an accepted optimizer correction" write path.
 *
 * SAFETY: this slice designs persistence; it does NOT persist. This module has
 * no external DB client, no service import, no insert/update — it only builds
 * and validates an in-memory draft payload from an optimization preview. The
 * proposed table + RLS live as a NON-applied proposal in
 * docs/spine/proposals/accepted_corrections_table.proposal.sql; the plan is
 * docs/spine/ACCEPTED_CORRECTION_PERSISTENCE_PLAN.md. Live writes are a later,
 * explicitly-approved slice.
 *
 * Rules encoded here (mirrors the capability matrix + preview honesty):
 *  - an owner is required (no anonymous drafts);
 *  - saving a correction embodies EXACT grams → requires the Pro capability
 *    (`exactCorrectionGrams`); demo/free are rejected, never silently redacted;
 *  - only a REAL, rerun-verified correction is saveable: decision optimized or
 *    tradeoff with `rerun_complete`, at least one gram action, and both recipe
 *    snapshots present. blocked / impossible / no_action_needed are rejected —
 *    there is nothing true to save;
 *  - the draft carries provenance (engine + config version, target mode, trace)
 *    and a deterministic source-recipe hash so a later write can detect drift;
 *  - the persisted recipe is NEVER mutated: the draft stores SNAPSHOTS.
 */
import { CONFIG_VERSION, ENGINE_VERSION, type RecipeInput } from '@/engine';
import type { AppliedAdjustment, BaseEngineMetrics, OptimizationDecision } from '@/spine';
import type { OptimizationPreviewView, SolveResultView } from './optimizationPreviewRunner';
import type { SolverTargetMode } from './solverTargetInjection';

export const ACCEPTED_CORRECTION_SCHEMA_VERSION = '1' as const;

/** The capability subset the draft builder consults (a structural subset of `useAccess`). */
export interface AcceptedCorrectionCapabilities {
  /** Pro: exact correction grams — saving a correction embodies exact grams. */
  exactCorrectionGrams: boolean;
  /** Signed-in (free + pro): may persist things at all. */
  saveRecipes: boolean;
}

export interface AcceptedCorrectionDraftInput {
  view: OptimizationPreviewView;
  /** Which solve the user accepted — the live engine-seeded one or the regulator-shadow one. */
  acceptedSolve: SolverTargetMode;
  /** The live Studio recipe input the preview ran on (snapshotted, never mutated). */
  originalRecipe: RecipeInput;
  /** The saved-recipe row id when the recipe already exists in My Recipes, else null. */
  savedRecipeId?: string | null;
  user: { id: string } | null;
  capabilities: AcceptedCorrectionCapabilities;
}

export type AcceptedCorrectionRejection =
  | 'missing_owner'
  | 'requires_pro'
  | 'requires_signed_in_save'
  | 'solve_blocked'
  | 'decision_not_saveable'
  | 'rerun_not_verified'
  | 'no_correction_actions'
  | 'missing_original_snapshot'
  | 'missing_corrected_snapshot'
  | 'missing_after_metrics';

/** Decisions that may be persisted — a real, verified correction only. */
export type SaveableDecision = Extract<OptimizationDecision, 'optimized' | 'tradeoff'>;

/**
 * The draft payload for one accepted correction. Top-level keys are a CLOSED
 * set (`ACCEPTED_CORRECTION_DRAFT_KEYS`) — validation rejects anything extra,
 * so no product PAC/POD write, Mapper field, or status flag can ride along.
 * `created_at` is NOT here: the DB default (`now()`) stamps it on the (future)
 * insert, keeping this builder deterministic.
 */
export interface AcceptedCorrectionDraft {
  schemaVersion: typeof ACCEPTED_CORRECTION_SCHEMA_VERSION;
  ownerId: string;
  /** Existing saved-recipe id, or null when the correction is for an unsaved recipe. */
  recipeId: string | null;
  /** Deterministic hash of `originalRecipeSnapshot` — drift detection at write time. */
  sourceRecipeHash: string;
  originalRecipeSnapshot: RecipeInput;
  correctedRecipeSnapshot: unknown;
  optimizerDecision: SaveableDecision;
  correctionActions: readonly AppliedAdjustment[];
  beforeMetrics: BaseEngineMetrics;
  afterMetrics: BaseEngineMetrics;
  targetMode: SolverTargetMode;
  productProfile: string;
  servingTemperatureC: number;
  warnings: readonly string[];
  trace: {
    rerunState: string;
    improvementDetected: boolean;
    injectedMetrics: readonly string[];
    regulatorProfile: string | null;
  };
  engineVersion: string;
  configVersion: string;
  createdBy: string;
}

/** The closed top-level key set — the validator rejects any draft with extra keys. */
export const ACCEPTED_CORRECTION_DRAFT_KEYS: readonly (keyof AcceptedCorrectionDraft)[] = [
  'schemaVersion',
  'ownerId',
  'recipeId',
  'sourceRecipeHash',
  'originalRecipeSnapshot',
  'correctedRecipeSnapshot',
  'optimizerDecision',
  'correctionActions',
  'beforeMetrics',
  'afterMetrics',
  'targetMode',
  'productProfile',
  'servingTemperatureC',
  'warnings',
  'trace',
  'engineVersion',
  'configVersion',
  'createdBy',
];

export type BuildAcceptedCorrectionDraftResult =
  | { ok: true; draft: AcceptedCorrectionDraft }
  | { ok: false; reason: AcceptedCorrectionRejection };

/** Deterministic FNV-1a 32-bit hash (hex) over the canonical JSON of a value. */
export function sourceRecipeHash(value: unknown): string {
  const s = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const isSaveableDecision = (d: OptimizationDecision): d is SaveableDecision =>
  d === 'optimized' || d === 'tradeoff';

const solveFor = (view: OptimizationPreviewView, mode: SolverTargetMode): SolveResultView =>
  mode === 'regulator_shadow' ? view.regulatorShadowSolve : view.engineSeededSolve;

/**
 * Build a validated accepted-correction draft from an optimization preview.
 * Pure and deterministic; never writes, never mutates its inputs. Rejections
 * are checked in a fixed order: owner → capability (Pro, then signed-in save)
 * → solve active → decision saveable → rerun verified → actions → snapshots.
 */
export function buildAcceptedCorrectionDraft(
  input: AcceptedCorrectionDraftInput,
): BuildAcceptedCorrectionDraftResult {
  const { view, acceptedSolve, originalRecipe, user, capabilities } = input;

  if (!user || !user.id) return { ok: false, reason: 'missing_owner' };
  // Exact grams are the Pro boundary — a saved correction IS exact grams.
  if (!capabilities.exactCorrectionGrams) return { ok: false, reason: 'requires_pro' };
  if (!capabilities.saveRecipes) return { ok: false, reason: 'requires_signed_in_save' };

  const solve = solveFor(view, acceptedSolve);
  if (!solve.active) return { ok: false, reason: 'solve_blocked' };
  if (!isSaveableDecision(solve.decision)) return { ok: false, reason: 'decision_not_saveable' };
  if (solve.rerunState !== 'rerun_complete' || !solve.rerun) {
    return { ok: false, reason: 'rerun_not_verified' };
  }
  if (solve.proposedAdjustments.length === 0) return { ok: false, reason: 'no_correction_actions' };
  if (!originalRecipe || !Array.isArray(originalRecipe.items) || originalRecipe.items.length === 0) {
    return { ok: false, reason: 'missing_original_snapshot' };
  }
  if (solve.correctedRecipeSnapshot == null) return { ok: false, reason: 'missing_corrected_snapshot' };
  if (!solve.afterMetrics) return { ok: false, reason: 'missing_after_metrics' };

  const draft: AcceptedCorrectionDraft = {
    schemaVersion: ACCEPTED_CORRECTION_SCHEMA_VERSION,
    ownerId: user.id,
    recipeId: input.savedRecipeId ?? null,
    sourceRecipeHash: sourceRecipeHash(originalRecipe),
    originalRecipeSnapshot: originalRecipe,
    correctedRecipeSnapshot: solve.correctedRecipeSnapshot,
    optimizerDecision: solve.decision,
    correctionActions: solve.proposedAdjustments,
    beforeMetrics: view.beforeMetrics,
    afterMetrics: solve.afterMetrics,
    targetMode: acceptedSolve,
    productProfile: view.productProfile,
    servingTemperatureC: view.servingTemperatureC,
    warnings: [...solve.warnings],
    trace: {
      rerunState: solve.rerunState,
      improvementDetected: solve.rerun.improvementDetected,
      injectedMetrics: [...solve.injectedMetrics],
      regulatorProfile: view.solverTargetInjection.regulatorProfile,
    },
    engineVersion: ENGINE_VERSION,
    configVersion: CONFIG_VERSION,
    createdBy: user.id,
  };
  return { ok: true, draft };
}

export interface DraftValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Re-validate a built draft (pure). Enforces the CLOSED key set (no extra
 * fields can ride into the future write), owner/creator agreement, a saveable
 * decision, positive finite gram actions, and a matching source-recipe hash.
 */
export function validateAcceptedCorrectionDraft(draft: AcceptedCorrectionDraft): DraftValidation {
  const errors: string[] = [];
  const allowed = new Set<string>(ACCEPTED_CORRECTION_DRAFT_KEYS);
  for (const key of Object.keys(draft)) {
    if (!allowed.has(key)) errors.push(`unexpected_key:${key}`);
  }
  for (const key of ACCEPTED_CORRECTION_DRAFT_KEYS) {
    if (!(key in draft)) errors.push(`missing_key:${key}`);
  }
  if (draft.schemaVersion !== ACCEPTED_CORRECTION_SCHEMA_VERSION) errors.push('unsupported_schema_version');
  if (!draft.ownerId) errors.push('missing_owner');
  if (draft.createdBy !== draft.ownerId) errors.push('creator_owner_mismatch');
  if (!isSaveableDecision(draft.optimizerDecision)) errors.push('decision_not_saveable');
  if (draft.targetMode !== 'engine_seeded' && draft.targetMode !== 'regulator_shadow') {
    errors.push('invalid_target_mode');
  }
  if (draft.correctionActions.length === 0) errors.push('no_correction_actions');
  for (const a of draft.correctionActions) {
    if (!a.ingredient || !Number.isFinite(a.grams) || a.grams <= 0) {
      errors.push(`invalid_action:${a.ingredient || 'unnamed'}`);
    }
  }
  if (draft.correctedRecipeSnapshot == null) errors.push('missing_corrected_snapshot');
  if (sourceRecipeHash(draft.originalRecipeSnapshot) !== draft.sourceRecipeHash) {
    errors.push('source_recipe_hash_mismatch');
  }
  return { valid: errors.length === 0, errors };
}
