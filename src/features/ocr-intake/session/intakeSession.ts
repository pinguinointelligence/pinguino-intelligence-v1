/**
 * OCR product-intake SESSION state machine (spec §4, §9) — PURE, deterministic
 * transitions over the LOCKED `ProductIntakeSession` contract. Every function takes a
 * session and returns a NEW session (no mutation); every refused operation throws a
 * TYPED `IntakeSessionError` — nothing is ever silently ignored or silently coerced.
 *
 * Boundaries:
 *   • pure — no OCR engine import, no services, no DB, no IO, no network;
 *   • sessionId is stamped through: OCR runs and field evidence are asserted to
 *     reference ONLY this session's images (cross-product safety, spec §4/§9);
 *   • re-running extraction from review is DELIBERATE: previous fields are replaced
 *     and manual edits are discarded WITH an explicit warning — never silently;
 *   • no field value is ever invented here; the review actions only choose, edit,
 *     mark-unknown, or confirm what the (injected) extractor produced.
 *
 * The evidence extractor itself is Track G's module — this file only defines the
 * injected function seam (`EvidenceExtractorFn`) and never imports an extractor.
 */
import type {
  AcceptedMime,
  DuplicateAssessment,
  IntakeImage,
  IntakeImageRole,
  IntakeImageState,
  IntakeSessionState,
  ProductIntakeSession,
  OcrRunOutcome,
  RawOcrResult,
  ReviewedField,
  IntakeFieldKey,
} from '../intakeContracts';
import { normalizeEan } from '@/data/products/productIdentity';
import { blockingFieldKeys } from './reviewedFields';

/* ── limits (typed refusals, spec §4) ────────────────────────────────────── */

/** Maximum images one intake session may hold (front/back/nutrition/… ≤ 8). */
export const MAX_IMAGES_PER_SESSION = 8;

/** Maximum bytes per image — mirrors the OCR engine's cap (MAX_LABEL_IMAGE_BYTES,
 * 10 MiB, itself aligned to the storage-enforced bucket limit; asserted equal by
 * test so the two caps can never drift apart). */
export const MAX_INTAKE_IMAGE_BYTES = 10 * 1024 * 1024;

const IMAGE_ROLES: readonly IntakeImageRole[] = [
  'front',
  'back',
  'nutrition_table',
  'ingredients',
  'barcode',
  'claims_allergens',
  'other',
];

const ACCEPTED_MIMES: readonly AcceptedMime[] = ['image/png', 'image/jpeg', 'image/webp'];

const SHA256_HEX = /^[0-9a-f]{64}$/i;

/* ── typed errors ────────────────────────────────────────────────────────── */

export type IntakeSessionErrorCode =
  | 'illegal_transition'
  | 'invalid_role'
  | 'unsupported_mime'
  | 'image_limit'
  | 'image_too_large'
  | 'empty_image'
  | 'invalid_checksum'
  | 'duplicate_upload'
  | 'duplicate_image_id'
  | 'unknown_image'
  | 'invalid_reorder'
  | 'image_not_failed'
  | 'invalid_image_state'
  | 'foreign_evidence'
  | 'foreign_run'
  | 'unknown_field'
  | 'conflict_unresolved'
  | 'invalid_candidate'
  | 'unresolved_fields'
  | 'no_images'
  | 'no_readable_images'
  | 'invalid_ean'
  | 'session_mismatch';

export class IntakeSessionError extends Error {
  readonly code: IntakeSessionErrorCode;

  constructor(code: IntakeSessionErrorCode, message: string) {
    super(message);
    this.name = 'IntakeSessionError';
    this.code = code;
  }
}

const refuse = (code: IntakeSessionErrorCode, message: string): never => {
  throw new IntakeSessionError(code, message);
};

/* ── the transition table (spec §4) ──────────────────────────────────────── */

/** Every LEGAL session transition. Anything not listed throws `illegal_transition`. */
export const SESSION_TRANSITIONS: Readonly<Record<IntakeSessionState, readonly IntakeSessionState[]>> = {
  collecting_images: ['extracting', 'cancelled', 'failed'],
  extracting: ['review', 'cancelled', 'failed'],
  review: ['extracting', 'ready_to_save', 'duplicate_blocked', 'cancelled', 'failed'],
  ready_to_save: ['saving', 'duplicate_blocked', 'review', 'cancelled', 'failed'],
  duplicate_blocked: ['ready_to_save', 'cancelled', 'failed'],
  saving: ['saved', 'failed'],
  saved: [],
  cancelled: [],
  failed: [],
};

function transition(
  session: ProductIntakeSession,
  to: IntakeSessionState,
  via: string,
): ProductIntakeSession {
  const allowed = SESSION_TRANSITIONS[session.state] ?? [];
  if (!allowed.includes(to)) {
    refuse(
      'illegal_transition',
      `illegal transition ${session.state} → ${to} (via ${via}); allowed from ${session.state}: [${allowed.join(', ')}]`,
    );
  }
  return { ...session, state: to };
}

function requireState(
  session: ProductIntakeSession,
  states: readonly IntakeSessionState[],
  via: string,
): void {
  if (!states.includes(session.state)) {
    refuse(
      'illegal_transition',
      `${via} requires session state [${states.join(', ')}] but the session is '${session.state}'`,
    );
  }
}

/* ── session creation ────────────────────────────────────────────────────── */

export function createIntakeSession(sessionId: string): ProductIntakeSession {
  const id = sessionId.trim();
  if (id === '') refuse('session_mismatch', 'a session needs a non-empty sessionId');
  return {
    sessionId: id,
    state: 'collecting_images',
    images: [],
    manualEan: null,
    ocrRuns: {},
    fields: [],
    warnings: [],
    duplicate: null,
  };
}

/* ── image lifecycle (spec §4.4) ─────────────────────────────────────────── */

export interface AddImageInput {
  imageId: string;
  role: IntakeImageRole;
  fileName: string;
  mime: AcceptedMime;
  byteSize: number;
  checksumSha256: string;
  width?: number | null;
  height?: number | null;
}

function validateImageInput(input: AddImageInput): void {
  if (!IMAGE_ROLES.includes(input.role)) {
    refuse('invalid_role', `"${String(input.role)}" is not a valid intake image role`);
  }
  if (!ACCEPTED_MIMES.includes(input.mime)) {
    refuse('unsupported_mime', `"${String(input.mime)}" is not an accepted upload type (PNG/JPEG/WebP)`);
  }
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
    refuse('empty_image', `"${input.fileName}" is empty (0 bytes) or has no valid size`);
  }
  if (input.byteSize > MAX_INTAKE_IMAGE_BYTES) {
    const mb = (input.byteSize / (1024 * 1024)).toFixed(1);
    refuse(
      'image_too_large',
      `"${input.fileName}" is ${mb} MB — the per-image limit is ${MAX_INTAKE_IMAGE_BYTES / (1024 * 1024)} MB`,
    );
  }
  if (!SHA256_HEX.test(input.checksumSha256)) {
    refuse('invalid_checksum', `"${input.fileName}" has no valid SHA-256 hex checksum`);
  }
}

function buildImage(input: AddImageInput, order: number): IntakeImage {
  return {
    imageId: input.imageId,
    role: input.role,
    order,
    fileName: input.fileName,
    mime: input.mime,
    byteSize: input.byteSize,
    checksumSha256: input.checksumSha256.toLowerCase(),
    width: input.width ?? null,
    height: input.height ?? null,
    state: 'uploaded',
    failure: null,
  };
}

function imageById(session: ProductIntakeSession, imageId: string): IntakeImage {
  const image = session.images.find((i) => i.imageId === imageId);
  if (!image) refuse('unknown_image', `image "${imageId}" is not part of session ${session.sessionId}`);
  return image as IntakeImage;
}

/** Re-assign contiguous 0-based order following the array order (stable). */
const withContiguousOrder = (images: readonly IntakeImage[]): IntakeImage[] =>
  images.map((image, index) => (image.order === index ? image : { ...image, order: index }));

/** Add an image while collecting. Enforces role/mime/size limits, the per-session
 * image cap, unique imageIds, and checksum-based duplicate-upload rejection. */
export function addImage(session: ProductIntakeSession, input: AddImageInput): ProductIntakeSession {
  requireState(session, ['collecting_images'], 'addImage');
  validateImageInput(input);
  if (session.images.length >= MAX_IMAGES_PER_SESSION) {
    refuse('image_limit', `this session already holds ${MAX_IMAGES_PER_SESSION} images (the limit)`);
  }
  if (session.images.some((i) => i.imageId === input.imageId)) {
    refuse('duplicate_image_id', `imageId "${input.imageId}" already exists in this session`);
  }
  const checksum = input.checksumSha256.toLowerCase();
  const duplicate = session.images.find((i) => i.checksumSha256 === checksum);
  if (duplicate) {
    refuse(
      'duplicate_upload',
      `"${input.fileName}" was already uploaded in this session as "${duplicate.fileName}" (${duplicate.imageId}) — identical bytes`,
    );
  }
  return { ...session, images: [...session.images, buildImage(input, session.images.length)] };
}

/** Remove an image; the remaining images keep their relative order (re-numbered
 * contiguously) and the removed image's OCR run is discarded. */
export function removeImage(session: ProductIntakeSession, imageId: string): ProductIntakeSession {
  requireState(session, ['collecting_images'], 'removeImage');
  imageById(session, imageId);
  const images = withContiguousOrder(session.images.filter((i) => i.imageId !== imageId));
  const ocrRuns = { ...session.ocrRuns };
  delete ocrRuns[imageId];
  return { ...session, images, ocrRuns };
}

/**
 * REPLACE an image: the new image inherits the old image's role and order; the old
 * OCR run is discarded. Allowed while collecting, and during extraction ONLY for a
 * FAILED image (swap in a better photo instead of retrying identical bytes).
 */
export function replaceImage(
  session: ProductIntakeSession,
  imageId: string,
  replacement: Omit<AddImageInput, 'role'>,
): ProductIntakeSession {
  requireState(session, ['collecting_images', 'extracting'], 'replaceImage');
  const old = imageById(session, imageId);
  if (session.state === 'extracting' && old.state !== 'failed') {
    refuse('image_not_failed', `during extraction only a FAILED image may be replaced; "${imageId}" is '${old.state}'`);
  }
  const input: AddImageInput = { ...replacement, role: old.role };
  validateImageInput(input);
  if (replacement.imageId !== imageId && session.images.some((i) => i.imageId === replacement.imageId)) {
    refuse('duplicate_image_id', `imageId "${replacement.imageId}" already exists in this session`);
  }
  const checksum = replacement.checksumSha256.toLowerCase();
  const duplicate = session.images.find((i) => i.imageId !== imageId && i.checksumSha256 === checksum);
  if (duplicate) {
    refuse(
      'duplicate_upload',
      `"${replacement.fileName}" duplicates "${duplicate.fileName}" (${duplicate.imageId}) — identical bytes`,
    );
  }
  const fresh = buildImage(input, old.order); // inherits role (forced above) + order
  const images = session.images.map((i) => (i.imageId === imageId ? fresh : i));
  const ocrRuns = { ...session.ocrRuns };
  delete ocrRuns[imageId]; // the old recognition is void for the new bytes
  return { ...session, images, ocrRuns };
}

/** Reorder images to exactly the given id sequence (a permutation of the session's
 * images). Orders stay contiguous; the given sequence IS the new stable order. */
export function reorderImages(session: ProductIntakeSession, orderedIds: readonly string[]): ProductIntakeSession {
  requireState(session, ['collecting_images'], 'reorderImages');
  const current = new Set(session.images.map((i) => i.imageId));
  const given = new Set(orderedIds);
  if (orderedIds.length !== session.images.length || given.size !== orderedIds.length || [...given].some((id) => !current.has(id))) {
    refuse(
      'invalid_reorder',
      `reorder must list each of the session's ${session.images.length} imageIds exactly once`,
    );
  }
  const byId = new Map(session.images.map((i) => [i.imageId, i]));
  const images = withContiguousOrder(orderedIds.map((id) => byId.get(id) as IntakeImage));
  return { ...session, images };
}

/* ── per-image OCR lifecycle: uploaded → analysing → needs_review/ready/failed ── */

function withImageState(
  session: ProductIntakeSession,
  imageId: string,
  state: IntakeImageState,
  failure: string | null,
): ProductIntakeSession {
  return {
    ...session,
    images: session.images.map((i) => (i.imageId === imageId ? { ...i, state, failure } : i)),
  };
}

/** uploaded → analysing (recognition started). Extraction phase only. */
export function beginImageAnalysis(session: ProductIntakeSession, imageId: string): ProductIntakeSession {
  requireState(session, ['extracting'], 'beginImageAnalysis');
  const image = imageById(session, imageId);
  if (image.state !== 'uploaded') {
    refuse('invalid_image_state', `image "${imageId}" is '${image.state}' — only an 'uploaded' image can start analysis`);
  }
  return withImageState(session, imageId, 'analysing', null);
}

/**
 * analysing → needs_review / ready / failed, recording the run outcome. The outcome's
 * imageId MUST match (cross-image/cross-session safety). A successful recognition
 * defaults to needs_review — 'ready' is an explicit caller decision, never assumed.
 */
export function completeImageAnalysis(
  session: ProductIntakeSession,
  imageId: string,
  outcome: OcrRunOutcome,
  resolution: 'needs_review' | 'ready' = 'needs_review',
): ProductIntakeSession {
  requireState(session, ['extracting'], 'completeImageAnalysis');
  const image = imageById(session, imageId);
  if (image.state !== 'analysing') {
    refuse('invalid_image_state', `image "${imageId}" is '${image.state}' — only an 'analysing' image can complete`);
  }
  if (outcome.ok && outcome.result.imageId !== imageId) {
    refuse(
      'foreign_run',
      `OCR result for image "${outcome.result.imageId}" cannot be recorded on image "${imageId}" (session ${session.sessionId})`,
    );
  }
  const next: ProductIntakeSession = { ...session, ocrRuns: { ...session.ocrRuns, [imageId]: outcome } };
  if (!outcome.ok) {
    const failure =
      outcome.failure.kind === 'engine_error'
        ? `engine_error: ${outcome.failure.message}`
        : outcome.failure.kind === 'unsupported_format'
          ? `unsupported_format: ${outcome.failure.mime}`
          : outcome.failure.kind;
    return withImageState(next, imageId, 'failed', failure);
  }
  return withImageState(next, imageId, resolution, null);
}

/** Retry a FAILED image: failed → analysing; its failed run is discarded. */
export function retryImage(session: ProductIntakeSession, imageId: string): ProductIntakeSession {
  requireState(session, ['extracting'], 'retryImage');
  const image = imageById(session, imageId);
  if (image.state !== 'failed') {
    refuse('image_not_failed', `image "${imageId}" is '${image.state}' — only a failed image can be retried`);
  }
  const ocrRuns = { ...session.ocrRuns };
  delete ocrRuns[imageId];
  return withImageState({ ...session, ocrRuns }, imageId, 'analysing', null);
}

/* ── manual EAN (distinct candidate source, spec §4) ─────────────────────── */

/**
 * Record a manually entered/scanned EAN (normalized via the SAME digit normalization
 * the identity layer uses — leading zeros preserved). Coexists with OCR ean evidence;
 * `null` clears it. Allowed until the session reaches ready_to_save.
 */
export function setManualEan(session: ProductIntakeSession, raw: string | null): ProductIntakeSession {
  requireState(session, ['collecting_images', 'extracting', 'review'], 'setManualEan');
  if (raw === null) return { ...session, manualEan: null };
  const normalized = normalizeEan(raw);
  if (normalized === '') {
    refuse('invalid_ean', `"${raw}" contains no digits — not a usable EAN`);
  }
  const warnings =
    normalized.length < 8
      ? [...session.warnings, `manual EAN "${normalized}" has only ${normalized.length} digits (looks short)`]
      : session.warnings;
  return { ...session, manualEan: normalized, warnings };
}

/* ── extraction phase (spec §4) ──────────────────────────────────────────── */

/** collecting_images → extracting. Requires at least one image. */
export function beginExtraction(session: ProductIntakeSession): ProductIntakeSession {
  requireState(session, ['collecting_images'], 'beginExtraction');
  if (session.images.length === 0) refuse('no_images', 'add at least one image before extracting');
  return transition(session, 'extracting', 'beginExtraction');
}

/**
 * DELIBERATE re-extraction: review → extracting. The previous reviewed fields are
 * REPLACED and any manual edits are DISCARDED — recorded as an explicit session
 * warning (never silently). OCR runs and images are kept.
 */
export function rerunExtraction(session: ProductIntakeSession): ProductIntakeSession {
  requireState(session, ['review'], 'rerunExtraction');
  const edits = session.fields.filter((f) => f.reviewStatus === 'edited').length;
  const confirmations = session.fields.filter((f) => f.reviewStatus === 'confirmed').length;
  const warning =
    `re-running extraction replaced ${session.fields.length} reviewed field(s) and DISCARDED ` +
    `${edits} manual edit(s) and ${confirmations} confirmation(s) from the previous review`;
  const next = transition(session, 'extracting', 'rerunExtraction');
  return { ...next, fields: [], duplicate: null, warnings: [...session.warnings, warning] };
}

/** Cross-product safety invariant: every evidence ref inside `fields` must point at
 * an image of THIS session. Throws `foreign_evidence` otherwise. Exported for tests. */
export function assertNoForeignEvidence(
  session: ProductIntakeSession,
  fields: readonly ReviewedField[],
): void {
  const own = new Set(session.images.map((i) => i.imageId));
  for (const field of fields) {
    for (const candidate of field.candidates) {
      const ref = candidate.evidence;
      if (ref && !own.has(ref.imageId)) {
        refuse(
          'foreign_evidence',
          `field "${field.fieldKey}" carries evidence from image "${ref.imageId}" which is NOT part of session ${session.sessionId} — cross-product evidence is forbidden`,
        );
      }
    }
  }
}

/**
 * extracting → review with the extractor's merged fields. Requires every image to be
 * in a terminal per-image state and at least one readable (non-failed) image; every
 * evidence ref is asserted to belong to this session (spec §4 cross-product safety).
 */
export function completeExtraction(
  session: ProductIntakeSession,
  fields: readonly ReviewedField[],
): ProductIntakeSession {
  requireState(session, ['extracting'], 'completeExtraction');
  const pending = session.images.filter((i) => i.state === 'uploaded' || i.state === 'analysing');
  if (pending.length > 0) {
    refuse(
      'invalid_image_state',
      `image(s) ${pending.map((i) => `"${i.imageId}"`).join(', ')} have not finished analysis`,
    );
  }
  if (!session.images.some((i) => i.state === 'ready' || i.state === 'needs_review')) {
    refuse('no_readable_images', 'every image failed OCR — nothing to review (retry, replace, or cancel)');
  }
  assertNoForeignEvidence(session, fields);
  const next = transition(session, 'review', 'completeExtraction');
  return { ...next, fields: [...fields] };
}

/** The injected evidence-extractor seam (Track G provides the real implementation;
 * the orchestrator wires it at integration — this feature only defines the type). */
export type EvidenceExtractorFn = (
  runs: readonly RawOcrResult[],
  images: readonly IntakeImage[],
) => ReviewedField[];

/** Successful OCR results in image order (the extractor's input). */
export function successfulRuns(session: ProductIntakeSession): RawOcrResult[] {
  return [...session.images]
    .sort((a, b) => a.order - b.order)
    .map((i) => session.ocrRuns[i.imageId])
    .filter((run): run is Extract<OcrRunOutcome, { ok: true }> => run !== undefined && run.ok)
    .map((run) => run.result);
}

/** Run the INJECTED extractor over this session's successful runs and enter review.
 * Purely orchestrates `successfulRuns` + `completeExtraction`; extraction logic
 * itself lives behind the injected function. */
export function extractSessionFields(
  session: ProductIntakeSession,
  extract: EvidenceExtractorFn,
): ProductIntakeSession {
  return completeExtraction(session, extract(successfulRuns(session), session.images));
}

/* ── review actions (spec §9) ────────────────────────────────────────────── */

function fieldByKey(session: ProductIntakeSession, key: IntakeFieldKey): ReviewedField {
  const field = session.fields.find((f) => f.fieldKey === key);
  if (!field) refuse('unknown_field', `no reviewed field "${key}" in this session`);
  return field as ReviewedField;
}

function withField(
  session: ProductIntakeSession,
  key: IntakeFieldKey,
  patch: Partial<ReviewedField>,
): ProductIntakeSession {
  return {
    ...session,
    fields: session.fields.map((f) => (f.fieldKey === key ? { ...f, ...patch } : f)),
  };
}

/** Choose one of a field's candidates (resolves a conflict) → confirmed. */
export function chooseCandidate(
  session: ProductIntakeSession,
  key: IntakeFieldKey,
  candidateIndex: number,
): ProductIntakeSession {
  requireState(session, ['review'], 'chooseCandidate');
  const field = fieldByKey(session, key);
  if (!Number.isInteger(candidateIndex) || candidateIndex < 0 || candidateIndex >= field.candidates.length) {
    refuse('invalid_candidate', `field "${key}" has ${field.candidates.length} candidate(s); index ${candidateIndex} does not exist`);
  }
  return withField(session, key, {
    chosenCandidate: candidateIndex,
    editedValue: null,
    reviewStatus: 'confirmed',
  });
}

/** Type a manual correction for a field → edited (overrides candidates). */
export function editFieldValue(
  session: ProductIntakeSession,
  key: IntakeFieldKey,
  value: string,
): ProductIntakeSession {
  requireState(session, ['review'], 'editFieldValue');
  fieldByKey(session, key);
  return withField(session, key, {
    editedValue: value,
    chosenCandidate: null,
    reviewStatus: 'edited',
  });
}

/** The human states the value is unknown → marked_unknown (resolves to null, honestly). */
export function markFieldUnknown(session: ProductIntakeSession, key: IntakeFieldKey): ProductIntakeSession {
  requireState(session, ['review'], 'markFieldUnknown');
  fieldByKey(session, key);
  return withField(session, key, {
    chosenCandidate: null,
    editedValue: null,
    reviewStatus: 'marked_unknown',
  });
}

/** Explicitly confirm a needs_confirmation field. A CONFLICT (multiple candidates,
 * none chosen) cannot be blanket-confirmed — choose / edit / mark unknown instead. */
export function confirmFieldReview(session: ProductIntakeSession, key: IntakeFieldKey): ProductIntakeSession {
  requireState(session, ['review'], 'confirmFieldReview');
  const field = fieldByKey(session, key);
  if (field.reviewStatus === 'conflict_unresolved') {
    refuse(
      'conflict_unresolved',
      `field "${key}" has ${field.candidates.length} conflicting candidates — choose one (or edit / mark unknown); a blanket confirm would hide the conflict`,
    );
  }
  return withField(session, key, { reviewStatus: 'confirmed' });
}

/* ── gates + terminal transitions (spec §4, §9) ──────────────────────────── */

/** review → ready_to_save. GATE: zero needs_confirmation / conflict_unresolved fields. */
export function markReadyToSave(session: ProductIntakeSession): ProductIntakeSession {
  requireState(session, ['review'], 'markReadyToSave');
  const blocking = blockingFieldKeys(session.fields);
  if (blocking.length > 0) {
    refuse('unresolved_fields', `cannot mark ready_to_save — unresolved field(s): ${blocking.join(', ')}`);
  }
  return transition(session, 'ready_to_save', 'markReadyToSave');
}

/** ready_to_save → review (change your mind before saving; the gate re-runs later). */
export function reopenReview(session: ProductIntakeSession): ProductIntakeSession {
  requireState(session, ['ready_to_save'], 'reopenReview');
  return transition(session, 'review', 'reopenReview');
}

/** review/ready_to_save → duplicate_blocked with the assessment recorded. */
export function blockOnDuplicate(
  session: ProductIntakeSession,
  assessment: DuplicateAssessment,
): ProductIntakeSession {
  requireState(session, ['review', 'ready_to_save'], 'blockOnDuplicate');
  const next = transition(session, 'duplicate_blocked', 'blockOnDuplicate');
  return { ...next, duplicate: assessment };
}

/** duplicate_blocked → ready_to_save after the user chose an allowed action.
 * (WHICH actions are allowed is the saveFlow's judgement — this is the transition.) */
export function resumeAfterDuplicate(session: ProductIntakeSession): ProductIntakeSession {
  requireState(session, ['duplicate_blocked'], 'resumeAfterDuplicate');
  return transition(session, 'ready_to_save', 'resumeAfterDuplicate');
}

/** ready_to_save → saving (the save flow is starting its single import call). */
export function beginSave(session: ProductIntakeSession): ProductIntakeSession {
  requireState(session, ['ready_to_save'], 'beginSave');
  return transition(session, 'saving', 'beginSave');
}

/** saving → saved. */
export function markSaved(session: ProductIntakeSession): ProductIntakeSession {
  requireState(session, ['saving'], 'markSaved');
  return transition(session, 'saved', 'markSaved');
}

/** Cancel from any PRE-SAVING state (never mid-save, never after a terminal state). */
export function cancelSession(session: ProductIntakeSession): ProductIntakeSession {
  requireState(
    session,
    ['collecting_images', 'extracting', 'review', 'ready_to_save', 'duplicate_blocked'],
    'cancelSession',
  );
  return transition(session, 'cancelled', 'cancelSession');
}

/** Fail the session from any non-terminal state, recording the reason as a warning. */
export function failSession(session: ProductIntakeSession, reason: string): ProductIntakeSession {
  requireState(
    session,
    ['collecting_images', 'extracting', 'review', 'ready_to_save', 'duplicate_blocked', 'saving'],
    'failSession',
  );
  const next = transition(session, 'failed', 'failSession');
  return { ...next, warnings: [...session.warnings, `session failed: ${reason}`] };
}
