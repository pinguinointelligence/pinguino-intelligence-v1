/**
 * OCR intake SAVE FLOW (spec §9 / §11 / §12) — turns a reviewed session into the
 * EXISTING product-intake pipeline and NOTHING else:
 *
 *     ReviewedFields → ProductIntakeCandidate (via the EXISTING mapRowToProductInsert)
 *                    → importProductCatalog (the EXISTING identity-aware import)
 *
 * Rules enforced here:
 *   • values come ONLY from chosen / edited / confirmed review results; unknown stays
 *     null — NEVER invented. PAC/POD and verification statuses are NEVER populated;
 *   • `detected_text` = the concatenated raw OCR of the session's successful runs;
 *     `extracted_json` = the FULL evidence audit (schema pinguino.ocr_intake_evidence.v2,
 *     extending the single-image v1 recorded by reviewState.ts);
 *   • dedup (spec §10) runs BEFORE any save; a non-new verdict blocks the save unless
 *     the user chose an action the assessment allows;
 *   • `update_existing_with_review` performs NO write here: the existing enrichment
 *     seam (`applyProductEnrichment`) is nutrition-only and reviewer-gated, so the flow
 *     emits a TYPED handoff carrying the proposed nutrition patch instead;
 *   • idempotent: a session that already saved returns its product — the import is
 *     never called twice for one session;
 *   • red flags + status recommendation (spec §11) come from the EXISTING
 *     detectRedFlags / decideProductStatus — OCR NEVER yields PI Verified;
 *   • Mapper handoff (spec §12): after a save the output instructs the caller to run
 *     the EXISTING pure matcher; `runPostSaveMatching` wraps `matchProduct` verbatim
 *     (basement rows are read-only inputs; unknown technical fields stay null).
 *
 * This is the ONE module in the feature allowed to import a service — and only
 * `importProductCatalog`. Tests mock it; nothing here writes anywhere else.
 */
import { mapRowToProductInsert, type ProductIntakeCandidate } from '@/data/products/productTableParser';
import { importProductCatalog } from '@/services/productCatalogImport';
import { detectRedFlags, blocksAutoVerify, type RedFlag, type RedFlagInput } from '@/data/products/productRedFlags';
import { decideProductStatus, type StatusDecision } from '@/data/products/productStatusDecision';
import { matchProduct, type ProductMatchResult } from '@/data/products/productMatcher';
import { ENRICHABLE_FIELDS, type EnrichmentPatch } from '@/data/products/productEnrichment';
import type { ProductRow } from '@/data/products/productRow';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { OCR_ENGINE_INFO } from '../reviewState';
import type { DuplicateAssessment, ProductIntakeSession } from '../intakeContracts';
import { assessDuplicate, type ExistingProductForDedup } from './duplicateCheck';
import {
  beginSave,
  blockOnDuplicate,
  cancelSession,
  failSession,
  markSaved,
  resumeAfterDuplicate,
  successfulRuns,
} from './intakeSession';
import { resolvedValueOf } from './reviewedFields';

/* ── typed errors ────────────────────────────────────────────────────────── */

export type SaveFlowErrorCode =
  | 'session_mismatch'
  | 'wrong_state'
  | 'no_identity'
  | 'action_not_allowed'
  | 'resolution_without_duplicate';

export class SaveFlowError extends Error {
  readonly code: SaveFlowErrorCode;

  constructor(code: SaveFlowErrorCode, message: string) {
    super(message);
    this.name = 'SaveFlowError';
    this.code = code;
  }
}

/* ── candidate building (spec §9/§5) ─────────────────────────────────────── */

export const OCR_INTAKE_EVIDENCE_SCHEMA = 'pinguino.ocr_intake_evidence.v2';

export type SessionNutritionBasis = 'per_100g' | 'per_100ml' | 'serving_only' | 'unknown';

const KNOWN_BASES: readonly SessionNutritionBasis[] = ['per_100g', 'per_100ml', 'serving_only', 'unknown'];

export type EanSource = 'manual' | 'ocr' | 'none';

export interface SessionCandidate {
  candidate: ProductIntakeCandidate;
  basis: SessionNutritionBasis;
  /** which source provided the EAN that went into the insert. */
  eanSource: EanSource;
}

/** Resolved nutrition basis of the session (unrecognized → 'unknown', honestly). */
export function sessionBasis(session: ProductIntakeSession): SessionNutritionBasis {
  const raw = resolvedValueOf(session.fields, 'nutrition_basis');
  return (KNOWN_BASES as readonly string[]).includes(raw ?? '') ? (raw as SessionNutritionBasis) : 'unknown';
}

/** Concatenated raw OCR text of the session's successful runs, in image order. */
export function concatenatedOcrText(session: ProductIntakeSession): string | null {
  const text = successfulRuns(session)
    .map((run) => run.fullText.trim())
    .filter((t) => t !== '')
    .join('\n\n');
  return text === '' ? null : text;
}

/**
 * Build the `ProductIntakeCandidate` from a session's reviewed fields via the EXISTING
 * `mapRowToProductInsert` contract — one intake pipeline, one honesty policy:
 *   • only resolved review values enter the row; unresolved / marked-unknown → absent;
 *   • the manual EAN (explicit human input) wins over OCR ean evidence;
 *   • numeric per-100 fields map ONLY under a per_100g / per_100ml basis;
 *   • sodium evidence is NEVER converted to salt; kJ has no column and stays evidence;
 *   • detected_text = concatenated raw OCR; extracted_json = the full v2 audit.
 * Pure — builds a LOCAL candidate; persisting is `saveIntakeSession`'s single import call.
 */
export function buildSessionCandidate(session: ProductIntakeSession): SessionCandidate {
  const value = (key: Parameters<typeof resolvedValueOf>[1]): string | null =>
    resolvedValueOf(session.fields, key);

  const row: Record<string, string> = {};
  const put = (header: string, v: string | null): void => {
    if (v !== null) row[header] = v;
  };

  // identity + classification (canonical HEADER_ALIASES vocabulary)
  put('product_name', value('product_name'));
  put('brand', value('brand'));
  put('supplier', value('supplier'));
  put('category', value('category'));
  put('subcategory', value('subcategory'));
  put('country', value('country'));

  // EAN: manual entry is explicit human input and wins; OCR evidence otherwise.
  const ocrEan = value('ean_code');
  const eanSource: EanSource = session.manualEan !== null ? 'manual' : ocrEan !== null ? 'ocr' : 'none';
  put('ean', session.manualEan ?? ocrEan);

  // package size (+ unit when the extractor split them)
  const size = value('package_size');
  const unit = value('package_unit');
  put('package_size', size !== null && unit !== null ? `${size} ${unit}` : size);

  // nutrition — ONLY under a usable per-100 basis (never converted, never guessed)
  const basis = sessionBasis(session);
  const mapNumbers = basis === 'per_100g' || basis === 'per_100ml';
  if (mapNumbers) {
    put('energy_kcal', value('energy_kcal'));
    put('fat', value('fat'));
    put('saturated_fat', value('saturated_fat'));
    put('carbohydrate', value('carbohydrate'));
    put('sugars', value('sugars'));
    put('protein', value('protein'));
    put('salt', value('salt'));
    put('fibre', value('fibre'));
    // 'sodium' is deliberately NOT mapped — recorded as evidence only, never salt.
    // 'energy_kj' has no ProductInsert column — evidence only.
  }

  // text + claims
  put('allergens', value('allergens_text'));
  put('vegan', value('claim_vegan'));
  put('gluten_free', value('claim_gluten_free'));
  put('lactose_free', value('claim_lactose_free'));
  // ingredients_text / may_contain_text / claim_vegetarian / claims_other stay in the
  // evidence audit only; detected_text below carries the raw OCR verbatim.

  const candidate = mapRowToProductInsert(row, 'generic', 0);

  // label-scan specifics on top of the shared mapping (same pattern as reviewState v1)
  candidate.insert.source_type = 'label_scan';
  candidate.insert.detected_text = concatenatedOcrText(session);
  candidate.insert.extracted_json = {
    schema: OCR_INTAKE_EVIDENCE_SCHEMA,
    engine: OCR_ENGINE_INFO,
    sessionId: session.sessionId,
    basis,
    manualEan: session.manualEan,
    eanSource,
    images: session.images.map((i) => ({
      imageId: i.imageId,
      role: i.role,
      order: i.order,
      fileName: i.fileName,
      mime: i.mime,
      byteSize: i.byteSize,
      checksumSha256: i.checksumSha256,
      state: i.state,
      failure: i.failure,
    })),
    ocrRuns: Object.fromEntries(
      Object.entries(session.ocrRuns).map(([imageId, outcome]) => [
        imageId,
        outcome.ok
          ? {
              ok: true,
              providerId: outcome.result.providerId,
              overallConfidence: outcome.result.overallConfidence,
              languageHints: outcome.result.languageHints,
              durationMs: outcome.result.durationMs,
            }
          : { ok: false, failure: outcome.failure },
      ]),
    ),
    /** the FULL per-field evidence audit — candidates, provenance, review resolution. */
    fields: session.fields,
    sessionWarnings: session.warnings,
  };

  if (!mapNumbers) {
    candidate.warnings.push(
      `nutrition basis is "${basis}" — numeric per-100 fields were NOT mapped (never converted or guessed)`,
    );
    if (candidate.status === 'valid') candidate.status = 'warning';
  }
  if (basis === 'per_100ml') {
    candidate.warnings.push('values are per 100 ml — density NOT applied; verify against per-100 g expectations');
    if (candidate.status === 'valid') candidate.status = 'warning';
  }

  return { candidate, basis, eanSource };
}

/* ── red flags + status recommendation (spec §11) ────────────────────────── */

export interface CandidateAssessment {
  redFlags: RedFlag[];
  /** any red flag blocks auto-verify — mirrors the existing blocksAutoVerify rule. */
  blocksAutoVerify: boolean;
  /** the EXISTING status policy's recommendation. A fresh OCR candidate has no
   * confirmed mapping, so this is 'draft' — OCR NEVER yields PI Verified. */
  statusDecision: StatusDecision;
}

/** Run the EXISTING red-flag detector + status policy over a built candidate. */
export function assessCandidate(candidate: ProductIntakeCandidate): CandidateAssessment {
  const redFlags = detectRedFlags(candidate.insert as RedFlagInput);
  const statusDecision = decideProductStatus({
    ...(candidate.insert as RedFlagInput),
    // a fresh OCR intake has NO confirmed mapping and no engine values —
    // the existing policy therefore recommends 'draft'; nothing here may claim more.
    mapper_status: null,
    matched_basement_id: null,
    pac_value: null,
    pod_value: null,
  });
  return { redFlags, blocksAutoVerify: blocksAutoVerify(redFlags), statusDecision };
}

/* ── enrichment handoff (update_existing_with_review) ────────────────────── */

/**
 * SEAM DECISION (audited): the existing update seam is `applyProductEnrichment`
 * (src/services/productEnrichment.ts). It is (a) nutrition-only — the 7
 * ENRICHABLE_FIELDS — and (b) reviewer-gated with its own PI-Verified override
 * rules. It does NOT fit a direct call from this flow (identity/text fields can't be
 * updated through it, and the reviewer step must stay human). So
 * `update_existing_with_review` produces this TYPED handoff instead of writing.
 */
export interface EnrichmentHandoff {
  kind: 'enrichment_handoff';
  existingProductId: string;
  /** candidate label-nutrition values narrowed to the seam's ENRICHABLE_FIELDS. */
  proposedPatch: EnrichmentPatch;
  note: string;
}

/** Narrow the candidate's numbers to the enrichment seam's writable fields. */
export function buildEnrichmentHandoff(
  candidate: ProductIntakeCandidate,
  existingProductId: string,
): EnrichmentHandoff {
  const proposedPatch: EnrichmentPatch = {};
  for (const field of ENRICHABLE_FIELDS) {
    const v = candidate.insert[field];
    if (typeof v === 'number' && Number.isFinite(v)) proposedPatch[field] = v;
  }
  return {
    kind: 'enrichment_handoff',
    existingProductId,
    proposedPatch,
    note:
      'update_existing_with_review requires the enrichment flow (applyProductEnrichment): ' +
      'nutrition-only, reviewer-gated — this intake flow performs no update write.',
  };
}

/* ── the save flow state (idempotency guard) ─────────────────────────────── */

export interface SaveFlowState {
  sessionId: string;
  /** set once the ONE import call for this session succeeded. */
  savedProductId: string | null;
  savedProductCode: string | null;
  /** how many times this flow actually invoked the import (stays ≤ 1). */
  importCalls: number;
}

export function createSaveFlowState(sessionId: string): SaveFlowState {
  return { sessionId, savedProductId: null, savedProductCode: null, importCalls: 0 };
}

/* ── results ─────────────────────────────────────────────────────────────── */

export type DuplicateResolutionAction = 'open_existing' | 'update_existing_with_review' | 'create_new';

export interface PostSaveMatchInstruction {
  step: 'run_existing_matcher';
  productId: string;
  note: string;
}

export type SaveFlowResult =
  | { kind: 'duplicate_blocked'; assessment: DuplicateAssessment }
  | { kind: 'open_existing'; existingProductId: string }
  | EnrichmentHandoff
  | {
      kind: 'saved';
      productId: string;
      productCode: string | null;
      /** true when this call was a no-op because the session already saved. */
      alreadySaved: boolean;
      assessment: CandidateAssessment;
      postSave: PostSaveMatchInstruction;
    }
  | { kind: 'failed'; error: string };

export interface SaveSessionOutcome {
  session: ProductIntakeSession;
  flow: SaveFlowState;
  result: SaveFlowResult;
}

const postSaveInstruction = (productId: string): PostSaveMatchInstruction => ({
  step: 'run_existing_matcher',
  productId,
  note:
    'run the EXISTING pure matcher (matchProduct) over the saved product with the caller-fetched ' +
    'basement rows (read-only); unknown technical fields stay null — see runPostSaveMatching.',
});

/* ── the save flow (spec §9/§10/§11/§12) ─────────────────────────────────── */

/**
 * Save one reviewed session through the EXISTING import path — after a MANDATORY
 * duplicate check. `existing` is the caller-fetched owned product rows (owner scoping
 * passes through; this flow does no IO besides the single import call).
 *
 *   • ready_to_save + new_product → ONE importProductCatalog call → saved;
 *   • exact/likely duplicate without a chosen resolution → duplicate_blocked;
 *   • resolution must be in the assessment's allowedActions (typed refusal otherwise):
 *       open_existing               → no write; session cancelled with a pointer;
 *       update_existing_with_review → no write; TYPED enrichment handoff;
 *       create_new (likely only)    → the one import call;
 *   • calling again after a successful save returns the SAME product (idempotent —
 *     the import is never invoked a second time for one session).
 */
export async function saveIntakeSession(
  session: ProductIntakeSession,
  flow: SaveFlowState,
  existing: readonly ExistingProductForDedup[],
  options: { resolution?: DuplicateResolutionAction } = {},
): Promise<SaveSessionOutcome> {
  if (flow.sessionId !== session.sessionId) {
    throw new SaveFlowError(
      'session_mismatch',
      `flow state belongs to session "${flow.sessionId}", not "${session.sessionId}" — cross-session saves are forbidden`,
    );
  }

  // idempotency: one session → one product, however many times save is invoked
  if (flow.savedProductId !== null) {
    return {
      session,
      flow,
      result: {
        kind: 'saved',
        productId: flow.savedProductId,
        productCode: flow.savedProductCode,
        alreadySaved: true,
        assessment: assessCandidate(buildSessionCandidate(session).candidate),
        postSave: postSaveInstruction(flow.savedProductId),
      },
    };
  }

  if (session.state !== 'ready_to_save' && session.state !== 'duplicate_blocked') {
    throw new SaveFlowError(
      'wrong_state',
      `saveIntakeSession requires state 'ready_to_save' (or 'duplicate_blocked' with a resolution); the session is '${session.state}'`,
    );
  }

  const { candidate } = buildSessionCandidate(session);
  if (candidate.status === 'skip') {
    const failed = failSession(session, candidate.skipReason ?? 'no usable identity');
    return { session: failed, flow, result: { kind: 'failed', error: candidate.skipReason ?? 'no usable identity' } };
  }

  // MANDATORY dedup before any save (spec §10)
  const assessment = assessDuplicate({ insert: candidate.insert, manualEan: session.manualEan }, existing);

  if (assessment.verdict !== 'new_product') {
    const resolution = options.resolution;
    if (resolution === undefined) {
      const blocked =
        session.state === 'duplicate_blocked'
          ? { ...session, duplicate: assessment } // already blocked — refresh the assessment
          : blockOnDuplicate(session, assessment);
      return { session: blocked, flow, result: { kind: 'duplicate_blocked', assessment } };
    }
    if (!assessment.allowedActions.includes(resolution)) {
      throw new SaveFlowError(
        'action_not_allowed',
        `"${resolution}" is not allowed for a ${assessment.verdict} — allowed: [${assessment.allowedActions.join(', ')}]`,
      );
    }
    const existingId = assessment.reasons[0]?.existingProductId ?? null;
    if (resolution === 'open_existing') {
      if (existingId === null) throw new SaveFlowError('resolution_without_duplicate', 'no existing product to open');
      const withAssessment = { ...session, duplicate: assessment };
      const closed = cancelSession(withAssessment);
      return {
        session: { ...closed, warnings: [...closed.warnings, `closed without saving — opened existing product ${existingId}`] },
        flow,
        result: { kind: 'open_existing', existingProductId: existingId },
      };
    }
    if (resolution === 'update_existing_with_review') {
      if (existingId === null) throw new SaveFlowError('resolution_without_duplicate', 'no existing product to update');
      const handoff = buildEnrichmentHandoff(candidate, existingId);
      const withAssessment = { ...session, duplicate: assessment };
      const closed = cancelSession(withAssessment);
      return {
        session: { ...closed, warnings: [...closed.warnings, `handed off to the enrichment flow for product ${existingId} — nothing written here`] },
        flow,
        result: handoff,
      };
    }
    // resolution === 'create_new' (only allowed on a likely duplicate) → fall through
  }

  // resume a blocked session, then save through the EXISTING path — ONE import call
  let current = session.state === 'duplicate_blocked' ? resumeAfterDuplicate(session) : session;
  current = { ...current, duplicate: assessment };
  current = beginSave(current);

  const nextFlow: SaveFlowState = { ...flow, importCalls: flow.importCalls + 1 };
  try {
    const summary = await importProductCatalog([candidate], { runMatch: false });
    const productId = summary.productIds[0] ?? null;
    if (summary.failed > 0 || productId === null) {
      const error = summary.rowResults[0]?.error ?? 'import did not produce a product';
      return { session: failSession(current, error), flow: nextFlow, result: { kind: 'failed', error } };
    }
    const savedFlow: SaveFlowState = {
      ...nextFlow,
      savedProductId: productId,
      savedProductCode: summary.productCodes[0] ?? null,
    };
    return {
      session: markSaved(current),
      flow: savedFlow,
      result: {
        kind: 'saved',
        productId,
        productCode: savedFlow.savedProductCode,
        alreadySaved: false,
        assessment: assessCandidate(candidate),
        postSave: postSaveInstruction(productId),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { session: failSession(current, message), flow: nextFlow, result: { kind: 'failed', error: message } };
  }
}

/* ── Mapper handoff (spec §12) ───────────────────────────────────────────── */

/**
 * The typed post-save step: run the EXISTING pure matcher over the SAVED product row
 * with caller-fetched basement rows. A verbatim pass-through to `matchProduct` — the
 * basement is a read-only input (the matcher is pure and never writes), and any
 * unknown technical field on the product simply stays null (the matcher reports
 * missing engine fields honestly; nothing is invented here).
 */
export function runPostSaveMatching(
  product: ProductRow,
  basement: readonly IngredientRow[],
): ProductMatchResult {
  return matchProduct(product, basement);
}
