/**
 * OCR PRODUCT INTAKE — shared contracts (types only, no logic).
 *
 * The single normalized shape every intake layer speaks (spec §5): the
 * provider adapters emit RawOcrResult; the deterministic extractor emits
 * FieldEvidence per contract field; the session/review layer manages
 * ProductIntakeSession; the batch layer manages BatchIntake. UI renders these
 * verbatim. Locked rules: evidence is EXPLICIT about provenance (explicit /
 * calculated / inferred / absent — never collapsed into one number), "not
 * detected" is NEVER zero, mapper_basement is never written, PAC/POD are never
 * populated from OCR, and saving goes ONLY through the existing identity-aware
 * import path (ProductIntakeCandidate → mapRowToProductInsert →
 * importProductCatalog), never around it.
 */

/* ── image intake ────────────────────────────────────────────────────────── */

/** What part of the package an image shows (spec §4.4). */
export type IntakeImageRole =
  | 'front'
  | 'back'
  | 'nutrition_table'
  | 'ingredients'
  | 'barcode'
  | 'claims_allergens'
  | 'other';

/** Accepted upload types. HEIC/HEIF only when the runtime can convert. */
export type AcceptedMime = 'image/png' | 'image/jpeg' | 'image/webp';

export type IntakeImageState =
  | 'uploaded'
  | 'analysing'
  | 'needs_review'
  | 'ready'
  | 'failed';

export interface IntakeImage {
  /** Stable id inside the session (never an index — ordering is separate). */
  imageId: string;
  role: IntakeImageRole;
  /** 0-based display/processing order; contiguous within a session. */
  order: number;
  fileName: string;
  mime: AcceptedMime;
  byteSize: number;
  /** SHA-256 hex of the bytes — duplicate-upload detection + evidence identity. */
  checksumSha256: string;
  width: number | null;
  height: number | null;
  state: IntakeImageState;
  /** Failure reason when state === 'failed' (typed upstream, message here). */
  failure: string | null;
}

/* ── provider abstraction (spec §7) ──────────────────────────────────────── */

export interface OcrWord {
  text: string;
  /** 0..100 provider confidence for this word. */
  confidence: number;
  /** Bounding box in source-image pixels, when the provider reports one. */
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
}

export interface OcrLine {
  text: string;
  confidence: number;
  words: OcrWord[];
}

/** Normalized provider output — every adapter maps its vendor shape to this. */
export interface RawOcrResult {
  providerId: string;
  /** Which intake image this recognition ran on. */
  imageId: string;
  fullText: string;
  lines: OcrLine[];
  /** 0..100 overall confidence as reported/derived by the adapter. */
  overallConfidence: number;
  languageHints: string[];
  durationMs: number;
}

export type OcrRunFailure =
  | { kind: 'unreadable_image' }
  | { kind: 'cancelled' }
  | { kind: 'unsupported_format'; mime: string }
  | { kind: 'engine_error'; message: string };

export type OcrRunOutcome =
  | { ok: true; result: RawOcrResult }
  | { ok: false; failure: OcrRunFailure };

/** The provider seam. Implementations: tesseract adapter, fixture provider. */
export interface OcrProvider {
  readonly providerId: string;
  recognize(input: {
    imageId: string;
    bytes: Uint8Array;
    mime: AcceptedMime;
    languages: string[];
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
  }): Promise<OcrRunOutcome>;
}

/* ── field evidence (spec §5) ────────────────────────────────────────────── */

/** How a value came to exist. NEVER collapsed into the confidence number. */
export type EvidenceProvenance = 'explicit' | 'calculated' | 'inferred' | 'absent';

export type FieldReviewStatus =
  | 'auto_accepted'
  | 'needs_confirmation'
  | 'confirmed'
  | 'edited'
  | 'marked_unknown'
  | 'conflict_unresolved';

export interface EvidenceRef {
  imageId: string;
  /** Line index inside that image's RawOcrResult, when locatable. */
  lineIndex: number | null;
  /** The raw text span the value was read from (verbatim, untrusted data). */
  sourceText: string | null;
}

/** One candidate value for a field, with full provenance. */
export interface FieldEvidence<T = string> {
  /** Verbatim extracted text (null when provenance === 'absent'). */
  extractedRaw: string | null;
  /** Deterministically normalized value (null = not normalizable/absent). */
  normalized: T | null;
  evidence: EvidenceRef | null;
  /** 0..100 — OCR read quality for the source region. */
  extractionConfidence: number | null;
  /** 0..100 — how unambiguous the deterministic normalization was. */
  normalizationConfidence: number | null;
  provenance: EvidenceProvenance;
  warnings: string[];
}

/** A reviewed field: candidates + resolution. Multiple candidates = conflict. */
export interface ReviewedField<T = string> {
  fieldKey: IntakeFieldKey;
  candidates: FieldEvidence<T>[];
  /** Index into candidates chosen at review, or null (edited/unknown/absent). */
  chosenCandidate: number | null;
  /** Manual correction typed by the reviewer (overrides candidates). */
  editedValue: T | null;
  reviewStatus: FieldReviewStatus;
}

/** Every field the intake contract can carry evidence for (spec §5). */
export type IntakeFieldKey =
  // identity
  | 'product_name'
  | 'brand'
  | 'package_size'
  | 'package_unit'
  | 'ean_code'
  | 'country'
  | 'supplier'
  | 'category'
  | 'subcategory'
  // nutrition (per declared basis)
  | 'nutrition_basis' // 'per_100g' | 'per_100ml' | 'serving_only'
  | 'energy_kcal'
  | 'energy_kj'
  | 'fat'
  | 'saturated_fat'
  | 'carbohydrate'
  | 'sugars'
  | 'protein'
  | 'salt'
  | 'sodium' // recorded as evidence; NEVER auto-converted to salt
  | 'fibre'
  // ingredients & claims
  | 'ingredients_text'
  | 'allergens_text'
  | 'may_contain_text'
  | 'claim_vegan'
  | 'claim_vegetarian'
  | 'claim_gluten_free'
  | 'claim_lactose_free'
  | 'claims_other';

/* ── session / review (spec §4, §9) ──────────────────────────────────────── */

export type IntakeSessionState =
  | 'collecting_images'
  | 'extracting'
  | 'review'
  | 'ready_to_save'
  | 'saving'
  | 'saved'
  | 'duplicate_blocked'
  | 'cancelled'
  | 'failed';

export interface ProductIntakeSession {
  sessionId: string;
  state: IntakeSessionState;
  images: IntakeImage[];
  /** Manually entered/scanned EAN (normalized), independent of OCR evidence. */
  manualEan: string | null;
  /** Per-image raw OCR outcomes keyed by imageId. */
  ocrRuns: Record<string, OcrRunOutcome>;
  /** The merged, per-field reviewed evidence. */
  fields: ReviewedField[];
  warnings: string[];
  /** Duplicate check result (spec §10) — null until the check ran. */
  duplicate: DuplicateAssessment | null;
}

/* ── duplicate handling (spec §10) ───────────────────────────────────────── */

export type DuplicateVerdict = 'exact_duplicate' | 'likely_duplicate' | 'new_product';

export interface DuplicateAssessment {
  verdict: DuplicateVerdict;
  /** Why (each check that fired). */
  reasons: Array<
    | { check: 'ean_match'; existingProductId: string }
    | { check: 'identity_hash_match'; existingProductId: string }
    | { check: 'normalized_identity_match'; existingProductId: string; score: number }
  >;
  /** What the user may do, per the locked identity rules. */
  allowedActions: Array<'open_existing' | 'update_existing_with_review' | 'create_new'>;
}

/* ── batch (spec §13) ────────────────────────────────────────────────────── */

export type BatchItemOutcome = 'saved' | 'duplicate' | 'needs_review' | 'failed' | 'pending';

export interface BatchIntake {
  batchId: string;
  /** Stable ordering: sessions keep their queue position forever. */
  sessionIds: string[];
  outcomes: Record<string, BatchItemOutcome>;
}

export interface BatchSummary {
  processed: number;
  saved: number;
  duplicate: number;
  needsReview: number;
  failed: number;
  pending: number;
}
