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
 * The frontend cannot populate `ocr_intake_sessions.saved_product_id`; the catalog
 * Edge/RPC links it only after ownership, archived evidence and rate controls pass.
 * Until that server step succeeds this orchestrator reports
 * `savedProductLinkPending: true` and never pretends the link was written.
 *
 * This module reaches Supabase ONLY through the sibling intake services and the existing
 * save flow — it imports no database client, issues no raw query, uses no service role.
 */
import { createSession, saveImageMetadata, updateSessionState } from '@/services/ocrIntakeSessions';
import type { OcrIntakeSessionRow, SessionStateTimestamps } from '@/services/ocrIntakeSessions';
import { uploadIntakeImage } from '@/services/ocrIntakeStorage';
import { recordOcrRun, saveEvidence } from '@/services/ocrIntakeEvidence';
import { buildSessionCandidate, createSaveFlowState, saveIntakeSession } from '@/features/ocr-intake/session/saveFlow';
import type { DuplicateResolutionAction, SaveFlowResult } from '@/features/ocr-intake/session/saveFlow';
import type { ExistingProductForDedup } from '@/features/ocr-intake/session/duplicateCheck';
import type { IntakeSessionState, ProductIntakeSession } from '@/features/ocr-intake/intakeContracts';
import { getCatalogMarketPreferences, submitOwnedOcrProductToGlobalCatalog } from '@/services/globalCatalog';
import type { CatalogSubmissionResult } from '@/features/global-catalog/contracts';
import { updateProduct } from '@/services/products';

export interface PersistSessionOptions {
  resolution?: DuplicateResolutionAction;
  explicitlyUnbranded?: boolean;
  market?: string | null;
  retailer?: string | null;
  distinguishingEvidence?: Record<string, unknown>;
}

export interface PersistSessionResult {
  /** The persisted session row after its terminal state transition. */
  session: OcrIntakeSessionRow;
  /** The outcome of the EXISTING save flow (the single products write). */
  saveResult: SaveFlowResult;
  /**
   * TRUE only when a product was actually saved: the catalog link into
   * `ocr_intake_sessions.saved_product_id` is still pending the guarded server step
   * (the client has no grant to write it).
   */
  savedProductLinkPending: boolean;
  /** Automatic shared-catalog contribution. Present for a saved/resolved product. */
  globalCatalogContribution: CatalogSubmissionResult | null;
  /** A private save never disappears behind a transient shared-catalog failure. */
  globalCatalogContributionError: string | null;
}

export async function retryGlobalCatalogContribution(
  result: PersistSessionResult,
  session: ProductIntakeSession,
  options: {
    duplicateDecision?: 'same' | 'different' | null;
    distinguishingEvidence?: Record<string, unknown>;
    riskChallengeToken?: string | null;
    market?: string | null;
    retailer?: string | null;
    resumeBlocked?: boolean;
  } = {},
): Promise<CatalogSubmissionResult> {
  if (result.saveResult.kind !== 'saved' && result.saveResult.kind !== 'open_existing') {
    throw new Error('Only a saved or explicitly confirmed existing OCR product can be contributed.');
  }
  const preferences = await getCatalogMarketPreferences();
  return submitOwnedOcrProductToGlobalCatalog({
    privateProductId: result.saveResult.kind === 'saved'
      ? result.saveResult.productId
      : result.saveResult.existingProductId,
    ocrSessionId: session.sessionId,
    idempotencyKey: `ocr:${session.sessionId}`,
    market: options.market ?? preferences.primaryMarket,
    retailer: options.retailer ?? null,
    packageLanguage: successfulLanguageHint(session),
    duplicateDecision: options.duplicateDecision ?? null,
    distinguishingEvidence: options.distinguishingEvidence ?? {},
    riskChallengeToken: options.riskChallengeToken ?? null,
    resumeBlocked: options.resumeBlocked === true,
  });
}

export async function completeSavedOcrProductAndRetryCatalog(
  result: PersistSessionResult,
  session: ProductIntakeSession,
  options: {
    explicitlyUnbranded?: boolean;
    market?: string | null;
    retailer?: string | null;
  } = {},
): Promise<CatalogSubmissionResult> {
  if (result.saveResult.kind !== 'saved' && result.saveResult.kind !== 'open_existing') {
    throw new Error('Only a saved or explicitly confirmed existing OCR product can be completed.');
  }
  const { candidate } = buildSessionCandidate(session, options);
  if (candidate.status === 'skip') throw new Error(candidate.skipReason ?? 'Product identity is incomplete.');
  // This is an owner-scoped update of the private product. Engine fields remain
  // stripped by updateProduct; the server can only publish it as BLUE afterward.
  const productId = result.saveResult.kind === 'saved'
    ? result.saveResult.productId
    : result.saveResult.existingProductId;
  // Evidence is append-only. Manual completion writes a new reviewed snapshot
  // before updating the owner product, so RED → BLUE derives public facts from
  // the edited evidence instead of merely changing status around stale data.
  await saveEvidence(session.sessionId, session.fields);
  await updateProduct(productId, candidate.insert);
  return retryGlobalCatalogContribution(result, session, { ...options, resumeBlocked: true });
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

  let globalCatalogContribution: CatalogSubmissionResult | null = null;
  let globalCatalogContributionError: string | null = null;
  const resolvedProductId =
    saveResult.kind === 'saved'
      ? saveResult.productId
      : saveResult.kind === 'open_existing'
        ? saveResult.existingProductId
      : null;
  if (resolvedProductId !== null) {
    const packageLanguage = successfulLanguageHint(session);
    try {
      const marketPreferences = await getCatalogMarketPreferences();
      globalCatalogContribution = await submitOwnedOcrProductToGlobalCatalog({
        privateProductId: resolvedProductId,
        ocrSessionId: session.sessionId,
        idempotencyKey: `ocr:${session.sessionId}`,
        // Country-of-origin remains separate; market comes from account preferences in
        // the server pipeline when the intake does not carry an explicit sale market.
        market: options.market ?? marketPreferences.primaryMarket,
        retailer: options.retailer ?? null,
        packageLanguage,
        // A distinct-product decision carries recognized, non-scientific variant
        // evidence. It never fabricates a composition difference.
        distinguishingEvidence:
          options.resolution === 'create_new'
            ? options.distinguishingEvidence ?? {}
            : {},
        duplicateDecision: options.resolution === 'create_new' ? 'different' : null,
      });
    } catch (error) {
      // The private save is already durable. Surface the automatic contribution as
      // retryable instead of throwing and causing the UI to repeat uploads/inserts.
      globalCatalogContributionError = error instanceof Error ? error.message : 'catalog_contribution_failed';
    }
  }

  return {
    session: row,
    saveResult,
    // a saved product exists but its saved_product_id link awaits a server/edge step
    // The service RPC writes saved_product_id only after evidence capture succeeds.
    savedProductLinkPending: saveResult.kind === 'saved' && globalCatalogContribution === null,
    globalCatalogContribution,
    globalCatalogContributionError,
  };
}

function successfulLanguageHint(session: ProductIntakeSession): string | null {
  const hints = Object.values(session.ocrRuns).flatMap((outcome) => outcome.ok ? outcome.result.languageHints : []);
  return hints.find((hint) => hint.trim() !== '') ?? null;
}
