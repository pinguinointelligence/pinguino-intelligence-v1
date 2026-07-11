/**
 * OCR intake SESSIONS service (migrations 0022) — the ONLY access to the mutable intake
 * spine: `ocr_intake_batches`, `ocr_intake_sessions`, `ocr_intake_images`.
 *
 * RLS scopes every row to the signed-in owner; the client sends the anon key + the user's
 * JWT only (never the privileged server key). Reads degrade to null/[] when the client is
 * unconfigured; writes throw UNAVAILABLE.
 *
 * COLUMN-LEVEL WRITE BOUNDARIES (0022 grants — the client has NO grant for these, so they
 * are NEVER included in any insert/update payload here):
 *   • ocr_intake_sessions.saved_product_id — service role only (the soft catalog link is
 *     set by a future server/edge step, never the frontend);
 *   • ocr_intake_sessions.user_id on UPDATE — immutable owner (stamped on insert only);
 *   • ocr_intake_images.(file_name, mime, byte_size, checksum_sha256, width, height) on
 *     UPDATE — write-once file identity (replacing an image is delete + insert).
 * Update patch types structurally EXCLUDE these columns and a whitelist strip enforces it
 * at runtime (mirrors STRIPPED_ENGINE_FIELDS in products.ts).
 *
 * A batch's outcome is DERIVED from its member sessions' states at read time (0022 header:
 * deliberately NO stored counter) — see `sessionStateToOutcome` / `loadBatch`.
 */
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser } from '@/services/auth';
import type {
  AcceptedMime,
  BatchIntake,
  BatchItemOutcome,
  IntakeImage,
  IntakeImageRole,
  IntakeImageState,
  IntakeSessionState,
} from '@/features/ocr-intake/intakeContracts';

const SESSIONS_TABLE = 'ocr_intake_sessions';
const IMAGES_TABLE = 'ocr_intake_images';
const BATCHES_TABLE = 'ocr_intake_batches';
const UNAVAILABLE = 'OCR intake is not available in this build.';

/* ── row shapes (mirror the migration columns) ───────────────────────────── */

export interface OcrIntakeBatchRow {
  id: string;
  user_id: string;
  created_at: string;
}

export interface OcrIntakeSessionRow {
  id: string;
  user_id: string;
  state: IntakeSessionState;
  manual_ean: string | null;
  batch_id: string | null;
  /** SOFT catalog link — service role only; the client can only ever READ it. */
  saved_product_id: string | null;
  cancelled_at: string | null;
  saved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OcrIntakeImageRow {
  id: string;
  session_id: string;
  role: IntakeImageRole;
  display_order: number;
  file_name: string;
  mime: AcceptedMime;
  byte_size: number;
  checksum_sha256: string;
  width: number | null;
  height: number | null;
  state: IntakeImageState;
  failure: string | null;
  created_at: string;
  updated_at: string;
}

/* ── batches ─────────────────────────────────────────────────────────────── */

/** Start a new intake batch owned by the current user (0022). */
export async function createBatch(): Promise<OcrIntakeBatchRow> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be signed in to start an intake batch.');
  const { data, error } = await supabase
    .from(BATCHES_TABLE)
    .insert({ user_id: user.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as OcrIntakeBatchRow;
}

/** Every batch owned by the current user, newest first (RLS scopes to the owner). */
export async function listBatches(): Promise<OcrIntakeBatchRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(BATCHES_TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as OcrIntakeBatchRow[];
}

/**
 * Derive a batch item outcome from a session's state. NEVER stored — the sessions are the
 * single truth (0022 header). Exhaustive over `IntakeSessionState`.
 */
export function sessionStateToOutcome(state: IntakeSessionState): BatchItemOutcome {
  switch (state) {
    case 'saved':
      return 'saved';
    case 'duplicate_blocked':
      return 'duplicate';
    case 'failed':
    case 'cancelled':
      return 'failed';
    case 'review':
    case 'ready_to_save':
      return 'needs_review';
    case 'collecting_images':
    case 'extracting':
    case 'saving':
      return 'pending';
  }
}

/**
 * Load a batch as a `BatchIntake` with per-session outcomes DERIVED from the member
 * sessions' current states (never a stored counter). Sessions keep their queue position
 * (ordered by creation). Returns null when the batch is absent / not owned.
 */
export async function loadBatch(batchId: string): Promise<BatchIntake | null> {
  if (!supabase) return null;
  const { data: batch, error } = await supabase
    .from(BATCHES_TABLE)
    .select('*')
    .eq('id', batchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!batch) return null;

  const sessions = await listSessions({ batchId });
  const outcomes: Record<string, BatchItemOutcome> = {};
  for (const session of sessions) outcomes[session.id] = sessionStateToOutcome(session.state);
  return {
    batchId: (batch as OcrIntakeBatchRow).id,
    sessionIds: sessions.map((session) => session.id),
    outcomes,
  };
}

/* ── sessions ────────────────────────────────────────────────────────────── */

export interface CreateSessionInput {
  manualEan?: string | null;
  batchId?: string | null;
  /** Optional explicit id (lets an in-memory session reuse its own id as the row id). */
  id?: string;
}

/** Create a `collecting_images` session owned by the current user (0022). */
export async function createSession(input: CreateSessionInput = {}): Promise<OcrIntakeSessionRow> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be signed in to start an intake session.');
  const payload: Record<string, unknown> = {
    user_id: user.id,
    state: 'collecting_images',
    manual_ean: input.manualEan ?? null,
    batch_id: input.batchId ?? null,
  };
  if (input.id !== undefined) payload.id = input.id;
  const { data, error } = await supabase.from(SESSIONS_TABLE).insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as OcrIntakeSessionRow;
}

/** A single owned session by id (RLS still applies), or null. */
export async function loadSession(id: string): Promise<OcrIntakeSessionRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from(SESSIONS_TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OcrIntakeSessionRow | null) ?? null;
}

export interface ListSessionsFilter {
  batchId?: string;
  state?: IntakeSessionState;
}

/** Owned sessions, optionally filtered by batch and/or state, in queue order (oldest first). */
export async function listSessions(filter: ListSessionsFilter = {}): Promise<OcrIntakeSessionRow[]> {
  if (!supabase) return [];
  let query = supabase.from(SESSIONS_TABLE).select('*');
  if (filter.batchId !== undefined) query = query.eq('batch_id', filter.batchId);
  if (filter.state !== undefined) query = query.eq('state', filter.state);
  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as OcrIntakeSessionRow[];
}

/** Terminal-state timestamps — the ONLY companions of a state transition (0022 CHECKs). */
export interface SessionStateTimestamps {
  cancelledAt?: string | null;
  savedAt?: string | null;
}

/**
 * Transition a session's state. Writes ONLY (state, cancelled_at, saved_at) — the grantable
 * transition columns — so `saved_product_id` and `user_id` can never travel in the patch.
 * The saved/cancelled CHECK shapes are honoured by passing the matching timestamp.
 */
export async function updateSessionState(
  id: string,
  state: IntakeSessionState,
  timestamps: SessionStateTimestamps = {},
): Promise<OcrIntakeSessionRow> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const patch: { state: IntakeSessionState; cancelled_at?: string | null; saved_at?: string | null } = {
    state,
  };
  if (timestamps.cancelledAt !== undefined) patch.cancelled_at = timestamps.cancelledAt;
  if (timestamps.savedAt !== undefined) patch.saved_at = timestamps.savedAt;
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Intake session not found or not owned.');
  return data as OcrIntakeSessionRow;
}

/** Edit the manual EAN (a grantable column). */
export async function setSessionManualEan(
  id: string,
  manualEan: string | null,
): Promise<OcrIntakeSessionRow> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .update({ manual_ean: manualEan })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Intake session not found or not owned.');
  return data as OcrIntakeSessionRow;
}

/** Join or leave a batch (a grantable column; null unbatches). */
export async function setSessionBatch(
  id: string,
  batchId: string | null,
): Promise<OcrIntakeSessionRow> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .update({ batch_id: batchId })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Intake session not found or not owned.');
  return data as OcrIntakeSessionRow;
}

/* ── images ──────────────────────────────────────────────────────────────── */

/**
 * Insert one image row (full file identity, INCLUDING its id). Images carry no user_id —
 * the parent session is the ownership anchor (RLS checks it), so nothing is owner-stamped
 * here. File identity is write-once (see updateImageReview's boundary).
 */
export async function saveImageMetadata(
  sessionId: string,
  img: IntakeImage,
): Promise<OcrIntakeImageRow> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { data, error } = await supabase
    .from(IMAGES_TABLE)
    .insert({
      id: img.imageId,
      session_id: sessionId,
      role: img.role,
      display_order: img.order,
      file_name: img.fileName,
      mime: img.mime,
      byte_size: img.byteSize,
      checksum_sha256: img.checksumSha256,
      width: img.width,
      height: img.height,
      state: img.state,
      failure: img.failure,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as OcrIntakeImageRow;
}

/** Every image of a session, in display order. */
export async function listSessionImages(sessionId: string): Promise<OcrIntakeImageRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(IMAGES_TABLE)
    .select('*')
    .eq('session_id', sessionId)
    .order('display_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as OcrIntakeImageRow[];
}

/** Review patch: ONLY the four grantable columns — the write-once file-identity columns
 * (file_name, mime, byte_size, checksum_sha256, width, height) are absent at the TYPE
 * level and stripped at runtime. */
export interface ImageReviewPatch {
  role?: IntakeImageRole;
  display_order?: number;
  state?: IntakeImageState;
  failure?: string | null;
}

/** The whitelist of grantable image columns (0022 grant). */
const IMAGE_REVIEW_COLUMNS = ['role', 'display_order', 'state', 'failure'] as const;

/** Keep ONLY the grantable columns — a hostile/legacy caller can never sneak a file-identity
 * column past this (mirrors products.ts stripEngineValues, as a whitelist). */
function sanitizeImageReviewPatch(patch: ImageReviewPatch): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  const raw = patch as Record<string, unknown>;
  for (const col of IMAGE_REVIEW_COLUMNS) {
    if (raw[col] !== undefined) safe[col] = raw[col];
  }
  return safe;
}

/**
 * Update the reviewable image columns (role / display_order / state / failure). File
 * identity is IMMUTABLE — it is type-excluded AND runtime-stripped, so this path can never
 * rewrite the stored bytes' recorded metadata.
 */
export async function updateImageReview(
  imageId: string,
  patch: ImageReviewPatch,
): Promise<OcrIntakeImageRow> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { data, error } = await supabase
    .from(IMAGES_TABLE)
    .update(sanitizeImageReviewPatch(patch))
    .eq('id', imageId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Intake image not found or not owned.');
  return data as OcrIntakeImageRow;
}

/** Delete an image row (RLS scopes it through the parent session). */
export async function deleteImage(id: string): Promise<void> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { error } = await supabase.from(IMAGES_TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
}
