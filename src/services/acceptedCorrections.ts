/**
 * Accepted-corrections service (Spine Slice 24) — the ONLY Supabase access for
 * accepted optimizer corrections. Opens the write path designed in Slice 16
 * under the locked owner decisions A–I
 * (docs/spine/ACCEPTED_CORRECTION_PERSISTENCE_PLAN.md §0).
 *
 * Table: public.accepted_corrections (migration 0012) — a separate IMMUTABLE
 * audit table. Write-once: insert + select + delete only; there is NO update
 * function here ON PURPOSE, and the DB backs that up twice (no update grant,
 * no update policy). Revisions are new inserts.
 *
 * RLS scopes every row to the signed-in owner (`auth.uid() = user_id`, insert
 * additionally checks `created_by`); the client sends the user's JWT (anon key
 * only — never a privileged server key). UI reaches these functions, never the
 * client directly.
 *
 * Input gate: only a validated `AcceptedCorrectionDraft` (Slice 16) is
 * accepted — the draft builder already enforces Pro capability, a verified
 * rerun and real gram actions; `guardDraftForInsert` re-checks ownership and
 * re-validates here so the service holds on its own. Tier enforcement is
 * service/client-side for v1 (decision F): an Edge-Function-mediated insert is
 * REQUIRED hardening before wider production scale.
 *
 * This service NEVER touches Mapper, products, PAC/POD, mapper_basement,
 * product statuses, PI Calculated activations, saved_recipes, or inventory
 * (decision I) — `draftToRow` maps a closed key set to a closed column set.
 */
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser, type AuthUser } from '@/services/auth';
import {
  validateAcceptedCorrectionDraft,
  type AcceptedCorrectionDraft,
} from '@/features/optimization/acceptedCorrectionDraft';

const TABLE = 'accepted_corrections';
const UNAVAILABLE = 'Saving is not available in this build.';

/**
 * The insert row — the draft's CLOSED key set mapped 1:1 to snake_case
 * columns. `id` / `created_at` are DB defaults and never sent.
 */
export interface AcceptedCorrectionRow {
  schema_version: AcceptedCorrectionDraft['schemaVersion'];
  user_id: string;
  recipe_id: string | null;
  source_recipe_hash: string;
  original_recipe_snapshot: AcceptedCorrectionDraft['originalRecipeSnapshot'];
  corrected_recipe_snapshot: AcceptedCorrectionDraft['correctedRecipeSnapshot'];
  optimizer_decision: AcceptedCorrectionDraft['optimizerDecision'];
  correction_actions: AcceptedCorrectionDraft['correctionActions'];
  before_metrics: AcceptedCorrectionDraft['beforeMetrics'];
  after_metrics: AcceptedCorrectionDraft['afterMetrics'];
  target_mode: AcceptedCorrectionDraft['targetMode'];
  product_profile: string;
  serving_temperature_c: number;
  warnings: AcceptedCorrectionDraft['warnings'];
  trace: AcceptedCorrectionDraft['trace'];
  engine_version: string;
  config_version: string;
  created_by: string;
}

/** A persisted record as returned by the DB (row + generated id/created_at). */
export interface AcceptedCorrectionRecord extends AcceptedCorrectionRow {
  id: string;
  created_at: string;
}

/** The closed column set `draftToRow` produces — pinned by tests. */
export const ACCEPTED_CORRECTION_ROW_KEYS: readonly (keyof AcceptedCorrectionRow)[] = [
  'schema_version',
  'user_id',
  'recipe_id',
  'source_recipe_hash',
  'original_recipe_snapshot',
  'corrected_recipe_snapshot',
  'optimizer_decision',
  'correction_actions',
  'before_metrics',
  'after_metrics',
  'target_mode',
  'product_profile',
  'serving_temperature_c',
  'warnings',
  'trace',
  'engine_version',
  'config_version',
  'created_by',
];

/**
 * EXPLICIT camelCase → snake_case mapping (pure). Field-by-field on purpose —
 * no spread, no dynamic key transform — so an unknown draft key can never ride
 * into the insert and a column rename shows up as a type error here.
 */
export function draftToRow(draft: AcceptedCorrectionDraft): AcceptedCorrectionRow {
  return {
    schema_version: draft.schemaVersion,
    user_id: draft.ownerId,
    recipe_id: draft.recipeId,
    source_recipe_hash: draft.sourceRecipeHash,
    original_recipe_snapshot: draft.originalRecipeSnapshot,
    corrected_recipe_snapshot: draft.correctedRecipeSnapshot,
    optimizer_decision: draft.optimizerDecision,
    correction_actions: draft.correctionActions,
    before_metrics: draft.beforeMetrics,
    after_metrics: draft.afterMetrics,
    target_mode: draft.targetMode,
    product_profile: draft.productProfile,
    serving_temperature_c: draft.servingTemperatureC,
    warnings: draft.warnings,
    trace: draft.trace,
    engine_version: draft.engineVersion,
    config_version: draft.configVersion,
    created_by: draft.createdBy,
  };
}

export type PersistGuardResult = { ok: true } | { ok: false; message: string };

/**
 * Pure pre-insert guard: signed-in → ownership match → full draft
 * re-validation (closed key set, saveable decision, positive gram actions,
 * hash agreement). The service refuses to insert anything this rejects.
 */
export function guardDraftForInsert(
  user: Pick<AuthUser, 'id'> | null,
  draft: AcceptedCorrectionDraft,
): PersistGuardResult {
  if (!user || !user.id) {
    return { ok: false, message: 'You must be signed in to save corrections.' };
  }
  if (user.id !== draft.ownerId) {
    return { ok: false, message: 'This correction belongs to a different account.' };
  }
  const validation = validateAcceptedCorrectionDraft(draft);
  if (!validation.valid) {
    return { ok: false, message: `Correction is not saveable: ${validation.errors.join(', ')}` };
  }
  return { ok: true };
}

/** Persist one accepted correction (write-once). Returns the stored record. */
export async function createAcceptedCorrection(
  draft: AcceptedCorrectionDraft,
): Promise<AcceptedCorrectionRecord> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const user = await getCurrentUser();
  const guard = guardDraftForInsert(user, draft);
  if (!guard.ok) throw new Error(guard.message);
  const { data, error } = await supabase
    .from(TABLE)
    .insert(draftToRow(draft))
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as AcceptedCorrectionRecord;
}

/** All correction records owned by the current user (RLS enforces ownership). */
export async function listMyAcceptedCorrections(): Promise<AcceptedCorrectionRecord[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AcceptedCorrectionRecord[];
}

/** Owner-only delete (decision E). RLS makes a foreign id a silent no-op. */
export async function deleteAcceptedCorrection(id: string): Promise<void> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be signed in to delete corrections.');
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// NO updateAcceptedCorrection — accepted corrections are write-once audit
// records (decision D). The DB refuses updates for every role even if a bug
// tried (no grant + no policy, proven in the Slice 24 §8 RLS tests).
