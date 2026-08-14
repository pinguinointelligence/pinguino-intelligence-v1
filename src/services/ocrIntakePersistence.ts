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
import {
  buildSessionCandidate,
  createSaveFlowState,
  saveIntakeSession,
} from '@/features/ocr-intake/session/saveFlow';
import type {
  DuplicateResolutionAction,
  SaveFlowResult,
} from '@/features/ocr-intake/session/saveFlow';
import type { ExistingProductForDedup } from '@/features/ocr-intake/session/duplicateCheck';
import type {
  IntakeSessionState,
  ProductIntakeSession,
} from '@/features/ocr-intake/intakeContracts';
import { getCatalogMarketPreferences } from '@/services/globalCatalog';
import type { CatalogSubmissionResult } from '@/features/global-catalog/contracts';
import {
  canonicalIngestFromLegacyProduct,
  ingestProduct,
  productIngestIdempotencyKey,
  type ProductIngestResult,
} from '@/services/productIngest';
import type { ProductIntakeCandidate } from '@/data/products/productTableParser';

export interface PersistSessionOptions {
  resolution?: DuplicateResolutionAction;
  duplicateProductId?: string | null;
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

async function ingestOcrCandidate(input: {
  candidate: ProductIntakeCandidate;
  session: ProductIntakeSession;
  productId?: string | null;
  duplicateProductId?: string | null;
  market?: string | null;
  retailer?: string | null;
  duplicateDecision?: 'same' | 'different' | null;
  distinguishingEvidence?: Record<string, unknown>;
  riskChallengeToken?: string | null;
  resumeBlocked?: boolean;
  idempotencyScope?: string;
}): Promise<ProductIngestResult> {
  const canonical = canonicalIngestFromLegacyProduct(input.candidate.insert);
  canonical.input.productId = input.productId ?? null;
  canonical.input.duplicateProductId = input.duplicateProductId ?? null;
  canonical.input.duplicateDecision = input.duplicateDecision ?? null;
  canonical.input.distinguishingEvidence = input.distinguishingEvidence ?? {};
  const idempotencyKey = input.idempotencyScope
    ? await productIngestIdempotencyKey('ocr', canonical.input, input.idempotencyScope)
    : `ocr:${input.session.sessionId}`;
  return ingestProduct({
    ...canonical,
    source: 'ocr',
    idempotencyKey,
    productId: input.productId ?? null,
    ocrSessionId: input.session.sessionId,
    market: input.market ?? null,
    retailer: input.retailer ?? null,
    packageLanguage: successfulLanguageHint(input.session),
    duplicateDecision: input.duplicateDecision ?? null,
    distinguishingEvidence: input.distinguishingEvidence ?? {},
    riskChallengeToken: input.riskChallengeToken ?? null,
    resumeBlocked: input.resumeBlocked === true,
  });
}

export async function retryGlobalCatalogContribution(
  result: PersistSessionResult,
  session: ProductIntakeSession,
  options: {
    duplicateDecision?: 'same' | 'different' | null;
    distinguishingEvidence?: Record<string, unknown>;
    riskChallengeToken?: string | null;
    duplicateProductId?: string | null;
    market?: string | null;
    retailer?: string | null;
    resumeBlocked?: boolean;
    explicitlyUnbranded?: boolean;
  } = {},
): Promise<CatalogSubmissionResult> {
  const pendingContribution = result.globalCatalogContribution;
  if (
    result.saveResult.kind !== 'saved' &&
    result.saveResult.kind !== 'open_existing' &&
    pendingContribution?.kind !== 'rate_limited' &&
    pendingContribution?.kind !== 'likely_duplicate' &&
    pendingContribution?.status !== 'blocked'
  ) {
    throw new Error(
      'Only a saved or explicitly confirmed existing OCR product can be contributed.',
    );
  }
  const preferences = await getCatalogMarketPreferences();
  const { candidate } = buildSessionCandidate(session, {
    explicitlyUnbranded: options.explicitlyUnbranded,
  });
  if (candidate.status === 'skip')
    throw new Error(candidate.skipReason ?? 'Product identity is incomplete.');
  const targetProductId =
    result.saveResult.kind === 'saved'
      ? result.saveResult.productId
      : result.saveResult.kind === 'open_existing'
        ? result.saveResult.existingProductId
        : (pendingContribution?.productId ?? null);
  const contribution = await ingestOcrCandidate({
    candidate,
    session,
    productId: targetProductId,
    duplicateProductId:
      options.duplicateProductId ??
      result.globalCatalogContribution?.duplicateCandidates[0]?.productId ??
      null,
    market: options.market ?? preferences.primaryMarket,
    retailer: options.retailer ?? null,
    duplicateDecision: options.duplicateDecision ?? null,
    distinguishingEvidence: options.distinguishingEvidence ?? {},
    riskChallengeToken: options.riskChallengeToken ?? null,
    resumeBlocked: options.resumeBlocked === true,
    idempotencyScope: options.duplicateDecision
      ? `duplicate-${options.duplicateDecision}:${session.sessionId}`
      : options.resumeBlocked
        ? `blocked-retry:${session.sessionId}`
        : undefined,
  });
  if (contribution.productId) {
    await updateSessionState(session.sessionId, 'saved', { savedAt: new Date().toISOString() });
  }
  return contribution;
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
  if (candidate.status === 'skip')
    throw new Error(candidate.skipReason ?? 'Product identity is incomplete.');
  // This is an owner-scoped update of the private product. Engine fields remain
  // stripped by updateProduct; the server can only publish it as BLUE afterward.
  const productId =
    result.saveResult.kind === 'saved'
      ? result.saveResult.productId
      : result.saveResult.existingProductId;
  // Evidence is append-only. Manual completion writes a new reviewed snapshot
  // before updating the owner product, so RED → BLUE derives public facts from
  // the edited evidence instead of merely changing status around stale data.
  await saveEvidence(session.sessionId, session.fields);
  const preferences = await getCatalogMarketPreferences();
  const contribution = await ingestOcrCandidate({
    candidate,
    session,
    productId,
    market: options.market ?? preferences.primaryMarket,
    retailer: options.retailer ?? null,
    resumeBlocked: true,
    idempotencyScope: `manual-completion:${session.sessionId}`,
  });
  if (contribution.productId) {
    await updateSessionState(session.sessionId, 'saved', { savedAt: new Date().toISOString() });
  }
  return contribution;
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

  await updateSessionState(session.sessionId, 'ready_to_save');
  let globalCatalogContribution: ProductIngestResult | null = null;
  let globalCatalogContributionError: string | null = null;
  let canonicalRateLimited = false;
  const marketPreferences = await getCatalogMarketPreferences();

  // 4. the ONE products write — through the EXISTING identity-aware save flow only
  const outcome = await saveIntakeSession(
    session,
    createSaveFlowState(session.sessionId),
    existing,
    {
      ...options,
      duplicateProductId: options.duplicateProductId ?? null,
      persistCandidate: async (candidate) => {
        globalCatalogContribution = await ingestOcrCandidate({
          candidate,
          session,
          market: options.market ?? marketPreferences.primaryMarket,
          retailer: options.retailer ?? null,
          duplicateDecision: options.resolution === 'create_new' ? 'different' : null,
          duplicateProductId: options.duplicateProductId ?? null,
          distinguishingEvidence:
            options.resolution === 'create_new' ? (options.distinguishingEvidence ?? {}) : {},
        });
        if (!globalCatalogContribution.productId) {
          canonicalRateLimited = globalCatalogContribution.kind === 'rate_limited';
          throw new Error(
            canonicalRateLimited
              ? 'catalog_rate_limited'
              : 'canonical_ingest_did_not_return_product',
          );
        }
        return {
          productId: globalCatalogContribution.productId,
          productCode: globalCatalogContribution.productCode ?? null,
        };
      },
    },
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
      // A durable rate reservation may defer the one canonical transaction.
      // Keep the reviewed OCR session retryable instead of terminally failing it.
      targetState = canonicalRateLimited ? 'ready_to_save' : 'failed';
      break;
    case 'open_existing':
    case 'enrichment_handoff':
      targetState = 'cancelled';
      timestamps = { cancelledAt: now };
      break;
    default:
      return assertNever(saveResult);
  }

  // Resolve an owned duplicate while the session is still in a server-bound,
  // saveable state. Cancelling it first makes the canonical contribution
  // impossible and silently drops the favorite/evidence link.
  if (saveResult.kind === 'open_existing') {
    const { candidate } = buildSessionCandidate(session, options);
    if (candidate.status !== 'skip') {
      try {
        globalCatalogContribution = await ingestOcrCandidate({
          candidate,
          session,
          productId: saveResult.existingProductId,
          duplicateProductId: saveResult.existingProductId,
          market: options.market ?? marketPreferences.primaryMarket,
          retailer: options.retailer ?? null,
          duplicateDecision: 'same',
          idempotencyScope: `existing:${session.sessionId}`,
        });
      } catch (error) {
        globalCatalogContributionError =
          error instanceof Error ? error.message : 'catalog_contribution_failed';
      }
    }
  } else if (saveResult.kind === 'failed' && globalCatalogContribution === null) {
    try {
      throw new Error(saveResult.error);
    } catch (error) {
      globalCatalogContributionError =
        error instanceof Error ? error.message : 'catalog_contribution_failed';
    }
  }

  const row = await updateSessionState(session.sessionId, targetState, timestamps);

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
  const hints = Object.values(session.ocrRuns).flatMap((outcome) =>
    outcome.ok ? outcome.result.languageHints : [],
  );
  return hints.find((hint) => hint.trim() !== '') ?? null;
}
