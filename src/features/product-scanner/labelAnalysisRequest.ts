/**
 * WHICH LABEL FIELDS A PHOTOGRAPH IS ASKED TO READ.
 *
 * `product-scan-analyze` turns this list into the sentence the vision model is given:
 *
 *   "Requested missing fields only: <list>. Analyze only those unresolved fields from these
 *    new assets. Do not repeat or replace fields not requested."
 *
 * The client sends `missingFields: [...session.missingCritical]`. Once web discovery began
 * filling every field the readiness check tracks, that array became EMPTY — and an empty array
 * is still an array, so it was read as a wish list of length zero. The model was told to read
 * "none", complied, and returned no evidence at all: HTTP 200, one vision call spent, nothing
 * learned, the score identical before and after the photograph, and the customer asked for the
 * same photograph again.
 *
 * Absent and empty must therefore mean the same thing: read the whole label. A caller that
 * genuinely wants a narrowed read has to name the fields.
 */
export function requestedLabelFields(
  supplied: readonly unknown[] | null | undefined,
  allFields: ReadonlySet<string>,
): { fields: string[]; rejected: boolean } {
  if (!Array.isArray(supplied)) return { fields: [...allFields], rejected: false };
  const known = supplied.filter(
    (field): field is string => typeof field === 'string' && allFields.has(field),
  );
  // A caller that names an unknown field is refused rather than silently narrowed.
  if (known.length !== supplied.length) return { fields: [], rejected: true };
  if (known.length === 0) return { fields: [...allFields], rejected: false };
  return { fields: known, rejected: false };
}

export type LabelAnalysisCallKind = 'fast' | 'accurate';

export function labelAnalysisCallPlan(
  completedVisionCalls: number,
  maxVisionCalls = 2,
): {
  allowed: boolean;
  accurateRetry: boolean;
  callKind: LabelAnalysisCallKind;
  error: 'session_vision_limit' | null;
} {
  const used = Math.max(0, Math.trunc(completedVisionCalls));
  const maximum = Math.max(0, Math.trunc(maxVisionCalls));
  const accurateRetry = used > 0;
  return used >= maximum
    ? {
        allowed: false,
        accurateRetry,
        callKind: accurateRetry ? 'accurate' : 'fast',
        error: 'session_vision_limit',
      }
    : {
        allowed: true,
        accurateRetry,
        callKind: accurateRetry ? 'accurate' : 'fast',
        error: null,
      };
}

/**
 * Completed/in-flight identical payloads keep one key. A known failed attempt advances the final
 * ordinal, permitting one bounded retry while concurrent replays of that retry still deduplicate.
 */
export function analysisIdempotencyKey(
  sessionId: string,
  callKind: LabelAnalysisCallKind,
  payloadHash: string,
  priorFailedAttempts: number,
): string {
  const ordinal = Math.max(0, Math.trunc(priorFailedAttempts));
  return `${sessionId}:${callKind}:${payloadHash}:${ordinal}`;
}
