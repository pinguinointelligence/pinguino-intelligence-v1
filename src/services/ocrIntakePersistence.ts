/**
 * OCR intake PERSISTENCE orchestrator (migrations 0022–0024) — composes the file-first
 * intake write in one honest sequence:
 *
 *   1. createSession                          (ocr_intake_sessions)
 *   2. per image: uploadIntakeImage → saveImageMetadata   (storage bucket + ocr_intake_images)
 *   3. recordOcrRun (successful runs) + saveEvidence       (ocr_extraction_runs / ocr_field_evidence)
 *   4. saveIntakeSession(...)  ← the EXISTING identity-aware save flow: the ONLY products
 *      write (it goes through importProductCatalog); this module NEVER writes public.products
 *      directly and never names it;
 *   5. updateSessionState to mirror the SaveFlowResult.
 *
 * HONESTY / KNOWN LIMITATION (documented, never hidden): the frontend CANNOT populate
 * `ocr_intake_sessions.saved_product_id` — that column has NO client grant (0022; it is
 * service role only and needs a future server/edge step). So on a successful save this
 * orchestrator records state 'saved' + saved_at but does NOT attempt to write
 * saved_product_id, and surfaces `savedProductLinkPending: true` on its result. It never
 * silently pretends the catalog link was written.
 *
 * This module reaches Supabase ONLY through the sibling intake services and the existing
 * save flow — it imports no database client, issues no raw query, uses no service role.
 */
import { createSession, saveImageMetadata, updateSessionState } from '@/services/ocrIntakeSessions';
import type { OcrIntakeSessionRow, SessionStateTimestamps } from '@/services/ocrIntakeSessions';
import { uploadIntakeImage } from '@/services/ocrIntakeStorage';
import { recordOcrRun, saveEvidence } from '@/services/ocrIntakeEvidence';
import { createSaveFlowState, saveIntakeSession } from '@/features/ocr-intake/session/saveFlow';
import type { DuplicateResolutionAction, SaveFlowResult } from '@/features/ocr-intake/session/saveFlow';
import type { ExistingProductForDedup } from '@/features/ocr-intake/session/duplicateCheck';
import type { IntakeSessionState, ProductIntakeSession } from '@/features/ocr-intake/intakeContracts';

export interface PersistSessionOptions {
  resolution?: DuplicateResolutionAction;
}

export interface PersistSessionResult {
  /** The persisted session row after its terminal state transition. */
  session: OcrIntakeSessionRow;
  /** The outcome of the EXISTING save flow (the single products write). */
  saveResult: SaveFlowResult;
  /**
   * TRUE only when a product was actually saved: the catalog link into
   * `ocr_intake_sessions.saved_product_id` is still PENDING a future server/edge step
   * (the client has no grant to write it). Honest signal — never a claim that the link
   * exists.
   */
  savedProductLinkPending: boolean;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled save flow result: ${JSON.stringify(value)}`);
}

/**
 * Persist a reviewed in-memory session to the file-first intake tables, then save the
 * product through the EXISTING import path, then reflect the outcome in the session state.
 * `imageBytes` maps each image's id to its raw bytes; `existing` is the caller-fetched
 * owned rows for the mandatory duplicate check.
 */
export async function persistSessionAndSave(
  session: ProductIntakeSession,
  imageBytes: Map<string, Uint8Array | Blob>,
  existing: readonly ExistingProductForDedup[],
  options: PersistSessionOptions = {},
): Promise<PersistSessionResult> {
  // 1. the mutable session row (reuse the in-memory session id as the row id)
  await createSession({ id: session.sessionId, manualEan: session.manualEan });

  // 2. every image: upload the bytes, then record the file-identity row
  for (const image of session.images) {
    const bytes = imageBytes.get(image.imageId);
    if (bytes === undefined) {
      throw new Error(`No bytes provided for intake image "${image.imageId}".`);
    }
    await uploadIntakeImage(session.sessionId, image.imageId, bytes, image.mime);
    await saveImageMetadata(session.sessionId, image);
  }

  // 3. verbatim evidence: only SUCCESSFUL runs, then the per-field candidate audit
  for (const [imageId, outcome] of Object.entries(session.ocrRuns)) {
    if (outcome.ok) await recordOcrRun(session.sessionId, imageId, outcome.result);
  }
  await saveEvidence(session.sessionId, session.fields);

  // 4. the ONE products write — through the EXISTING identity-aware save flow only
  const outcome = await saveIntakeSession(
    session,
    createSaveFlowState(session.sessionId),
    existing,
    options,
  );
  const saveResult = outcome.result;

  // 5. mirror the outcome in the session state (grantable transition columns only)
  const now = new Date().toISOString();
  let targetState: IntakeSessionState;
  let timestamps: SessionStateTimestamps = {};
  switch (saveResult.kind) {
    case 'saved':
      targetState = 'saved';
      timestamps = { savedAt: now };
      break;
    case 'duplicate_blocked':
      targetState = 'duplicate_blocked';
      break;
    case 'failed':
      targetState = 'failed';
      break;
    case 'open_existing':
    case 'enrichment_handoff':
      targetState = 'cancelled';
      timestamps = { cancelledAt: now };
      break;
    default:
      return assertNever(saveResult);
  }

  const row = await updateSessionState(session.sessionId, targetState, timestamps);

  return {
    session: row,
    saveResult,
    // a saved product exists but its saved_product_id link awaits a server/edge step
    savedProductLinkPending: saveResult.kind === 'saved',
  };
}
