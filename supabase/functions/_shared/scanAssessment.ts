/**
 * ONE canonical assessment per scan — the contract that makes Preview and Finalize the same verdict.
 *
 * OWNER QA 2026-09-07. Cola Zero and Vitamin Well were previewed ready/high and SAVED not-ready/low
 * on the very same scan session. The persisted traces reconstruct exactly, component by component:
 *
 *   run                     ean  nutrition  recognition  physics  behaviour  ingredients   total
 *   preview (Cola Zero)      2      42.6         7        21.52       8           4        85.12
 *   saved   (Cola Zero)      2      36.0         7        20.40       4           4        73.40
 *   saved   (Vitamin Well)   2      36.0         5.5      20.40       4           4        71.90
 *
 * Two independent losses, both of them the SAME shape — a fact the scan had already established was
 * recomputed from one HTTP request instead of from the scan:
 *
 * 1. PROVENANCE. `applyCustomerCorrections` derives `confirmedEvidenceFields` from the CURRENT
 *    request's `confirmations.productFields` only, while the same handler writes the corrected
 *    result back onto the session. So on every later call in the same scan the customer's VALUES
 *    survive and their PROVENANCE does not: fields that were `user_confirmed/VERIFIED` come back as
 *    `mapper_similar_profile/ESTIMATED` (nutrition −6.6, engine physics −1.12), and a typed identity
 *    degrades to `barcode_registry`. Vitamin Well's session still holds the ingredient text the
 *    customer supplied, and the same run scored its `ingredients` evidence UNKNOWN.
 *
 * 2. RECOGNITION. `serverSemanticClassification` re-runs on every call. Its model answer is cached
 *    under a hash of the MUTATING evidence, so the moment the customer adds a fact the fingerprint
 *    changes, the cache misses, and a model that does not answer leaves the deterministic
 *    `REVIEW_REQUIRED`. `modelRequired === true` is a hard gate in both the behaviour authority and
 *    the accuracy authority, so a resolution the scan had ALREADY achieved silently becomes
 *    `PRODUCT_SEMANTICS_UNRESOLVED` (recognition −1.5, behaviour −4, and `ready` flips to false).
 *
 * The rule this module encodes: **a scan accumulates. One request never subtracts from it.**
 * Everything here is pure, so the same functions the edge function runs are the ones under test.
 */

/** Bump when the SHAPE of the snapshot changes, so an old hash can never match a new payload. */
export const SCAN_ASSESSMENT_VERSION = 'SCAN_ASSESSMENT_V1';

const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** What the scan has established so far, carried on the session between calls. */
export type PersistedScanEvidence = {
  /** every evidence field the customer has confirmed at ANY point in this scan */
  confirmedFields: readonly string[];
  /** the last RESOLVED semantic classification, if the scan ever reached one */
  recognition: Record<string, unknown> | null;
};

export const EMPTY_SCAN_EVIDENCE: PersistedScanEvidence = {
  confirmedFields: [],
  recognition: null,
};

export function readPersistedScanEvidence(validationJson: unknown): PersistedScanEvidence {
  const carried = objectValue(objectValue(validationJson).scanEvidence);
  const fields = Array.isArray(carried.confirmedFields)
    ? carried.confirmedFields.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const recognition =
    carried.recognition && typeof carried.recognition === 'object'
      ? objectValue(carried.recognition)
      : null;
  return { confirmedFields: fields, recognition };
}

/**
 * The union, in first-seen order. A customer answer is a fact about the SCAN: once they have told
 * us the fat content, no later request may make the pipeline forget that they did.
 *
 * It is a union and not a replacement because the completion form only ever shows what is STILL
 * missing — so every round legitimately carries fewer fields than the one before it.
 */
export function mergeConfirmedEvidenceFields(
  persisted: readonly string[],
  current: readonly string[],
): string[] {
  return [...new Set([...persisted, ...current])];
}

/**
 * A classification is RESOLVED when the authorities can act on it. `modelRequired` is the exact
 * gate both of them read (productProductionAccuracy → PRODUCT_SEMANTICS_UNRESOLVED,
 * productBehaviorAuthority → unknown_requires_review), so it is the gate used here too — no second
 * definition of "resolved" is invented.
 */
export function recognitionIsResolved(recognition: unknown): boolean {
  const value = objectValue(recognition);
  if (Object.keys(value).length === 0) return false;
  return (
    value.modelRequired !== true &&
    value.productArchetype !== 'UNKNOWN' &&
    value.ingredientFamily !== 'unknown' &&
    value.physicalForm !== 'UNKNOWN' &&
    value.intendedUsageRole !== 'NEITHER_REVIEW'
  );
}

export type RecognitionCarryForward = {
  recognition: Record<string, unknown>;
  carriedForward: boolean;
};

/**
 * Keep the resolution the scan already has.
 *
 * A fresh attempt may fail to reach the model — a cache miss on changed evidence, a cap, an outage —
 * and the deterministic fallback is `REVIEW_REQUIRED`. Accepting that would mean a customer who
 * ADDS a fact gets a WORSE verdict than one who adds nothing, which is what happened to Vitamin
 * Well. So a fresh UNRESOLVED classification never replaces a stored RESOLVED one.
 *
 * It is not a cache of a verdict. A fresh RESOLVED classification always wins, and so does a fresh
 * classification that has settled on a DIFFERENT ingredient family — if the scan's understanding of
 * what the product IS has moved (the customer corrected their family answer, the label turned out to
 * say something else), the old verdict is stale and must not be resurrected. The carried value is
 * stamped so the trace says plainly where it came from.
 */
export function carryForwardRecognition(input: {
  fresh: Record<string, unknown>;
  persisted: Record<string, unknown> | null;
}): RecognitionCarryForward {
  const { fresh, persisted } = input;
  if (recognitionIsResolved(fresh)) return { recognition: fresh, carriedForward: false };
  if (!persisted || !recognitionIsResolved(persisted))
    return { recognition: fresh, carriedForward: false };
  const freshFamily = fresh.ingredientFamily;
  if (
    typeof freshFamily === 'string' &&
    freshFamily !== 'unknown' &&
    freshFamily !== persisted.ingredientFamily
  )
    return { recognition: fresh, carriedForward: false };
  return {
    recognition: { ...persisted, carriedForwardFromScan: true },
    carriedForward: true,
  };
}

/** Deterministic JSON: object keys sorted at every depth, so two equal values hash equal. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The FINAL ASSESSMENT SNAPSHOT. One scan, one versioned verdict — the thing Preview shows, the
 * thing Finalize saves and the thing routing classifies. Every field the owner's contract names is
 * here, and the hash covers all of them.
 */
export type ScanAssessmentSnapshot = {
  assessmentVersion: string;
  sessionId: string;
  barcode: string | null;
  identity: { displayName: string | null; brand: string | null };
  evidence: {
    confirmedFields: readonly string[];
    labelFields: number;
    externalSources: number;
    ingredientsText: boolean;
    allergensText: boolean;
    nutritionBasis: string | null;
  };
  semanticFamily: string | null;
  classification: Record<string, unknown>;
  classificationCarriedForward: boolean;
  behavior: Record<string, unknown>;
  mapperDonorId: string | null;
  missingFields: readonly string[];
  criticalGaps: readonly string[];
  productionReady: boolean;
  roleReadiness: string | null;
  finalConfidence: number | null;
  engineUsable: boolean;
  assessmentHash: string;
};

export type ScanAssessmentInput = {
  sessionId: string;
  barcode: string | null;
  result: Record<string, unknown>;
  confirmedFields: readonly string[];
  recognition: Record<string, unknown>;
  recognitionCarriedForward: boolean;
  behavior: Record<string, unknown>;
  profile: Record<string, unknown>;
};

const stringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;
const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

export async function scanAssessmentSnapshot(
  input: ScanAssessmentInput,
): Promise<ScanAssessmentSnapshot> {
  const identity = objectValue(input.result.identity);
  const nutrition = objectValue(input.result.nutrition);
  const assessment = objectValue(objectValue(input.profile).productAccuracyAssessment);
  const readiness = objectValue(assessment.gellattiReadiness);
  const accuracy = objectValue(input.profile).productAccuracy;

  const payload = {
    assessmentVersion: SCAN_ASSESSMENT_VERSION,
    sessionId: input.sessionId,
    barcode: input.barcode,
    identity: {
      displayName: stringOrNull(identity.displayName) ?? stringOrNull(identity.originalName),
      brand: stringOrNull(identity.brand),
    },
    evidence: {
      // sorted: the union's insertion order must not change the hash
      confirmedFields: [...input.confirmedFields].sort(),
      labelFields: Array.isArray(input.result.evidence) ? input.result.evidence.length : 0,
      externalSources: Array.isArray(input.result.externalSources)
        ? input.result.externalSources.length
        : 0,
      ingredientsText: typeof input.result.ingredientsText === 'string',
      allergensText: typeof input.result.allergensText === 'string',
      nutritionBasis: stringOrNull(nutrition.basis),
    },
    semanticFamily: stringOrNull(input.recognition.ingredientFamily),
    classification: input.recognition,
    behavior: input.behavior,
    mapperDonorId: stringOrNull(objectValue(input.profile).profileReferenceMapperIngredientId),
    missingFields: stringList(objectValue(readiness.issues).missing),
    criticalGaps: stringList(assessment.criticalBlockers),
    productionReady: readiness.ready === true,
    roleReadiness: stringOrNull(assessment.roleReadiness),
    finalConfidence: typeof accuracy === 'number' ? accuracy : null,
    engineUsable: objectValue(input.profile).engineUsable === true,
  };
  /*
    THE HASH COVERS THE VERDICT, NOT HOW IT WAS REACHED.

    `carriedForwardFromScan` records that this classification came from an earlier call in the same
    scan, and whether it did depends on something outside the verdict — whether the model answered
    this time. Hashing it would make the hash flip for exactly the reason the carry-forward exists to
    absorb, and a customer who typed nothing would have their save refused as "stale". So the
    provenance stamp travels in the snapshot, where the trace can read it, and stays out of the hash.
  */
  const hashedClassification = Object.fromEntries(
    Object.entries(input.recognition).filter(([key]) => key !== 'carriedForwardFromScan'),
  );
  const assessmentHash = await sha256Hex(
    stableJson({ ...payload, classification: hashedClassification }),
  );
  return {
    ...payload,
    classificationCarriedForward: input.recognitionCarriedForward,
    assessmentHash,
  };
}
