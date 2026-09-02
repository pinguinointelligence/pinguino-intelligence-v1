/**
 * One carbonation vocabulary for PI, PR, PM, Scanner, INTIMPORT, Recipe and
 * Production. This is process metadata only; it must never enter Engine math.
 */
export const CARBONATION_STATUSES = [
  'CARBONATED',
  'NON_CARBONATED',
  'UNKNOWN',
] as const;

export type CarbonationStatus = (typeof CARBONATION_STATUSES)[number];

export const EXACT_CARBONATION_EVIDENCE_SOURCES = [
  'EXACT_LABEL',
  'EXACT_MANUFACTURER',
  'EXACT_EAN_PRODUCT',
  'EXACT_AUTHORITATIVE_RETAILER',
] as const;

export type CarbonationEvidenceSource =
  (typeof EXACT_CARBONATION_EVIDENCE_SOURCES)[number];

export interface CarbonationEvidence {
  source: CarbonationEvidenceSource;
  /** Exact assertion used for this decision. A product name is never one. */
  assertion: string;
  assertionPath: string | null;
  sourceUrl: string | null;
  sourceDomain: string | null;
  sourceAuthorityClass: string | null;
  evidenceReceipt: string | null;
  retrievedAt: string | null;
}

export interface CarbonationProfile {
  status: CarbonationStatus;
  evidence: CarbonationEvidence[];
  decision:
    | 'EXPLICIT_CARBONATED_ASSERTION'
    | 'EXPLICIT_NON_CARBONATED_ASSERTION'
    | 'CONFLICTING_EXACT_ASSERTIONS'
    | 'NO_EXACT_ASSERTION';
}

const normalize = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

// Negative assertions are evaluated first so "non-carbonated" can never be
// promoted by the positive word embedded inside it.
const EXPLICIT_NON_CARBONATED = [
  /\bnon[ -]?carbonated\b/,
  /\bnot carbonated\b/,
  /\bniegazowan(?:y|a|e|ego|ej)\b/,
  /\bbez gazu\b/,
  /\bstill (?:water|beverage|drink)\b/,
] as const;

const EXPLICIT_CARBONATED = [
  /\bcarbonated (?:water|beverage|drink)\b/,
  /\bsparkling (?:water|beverage|drink)\b/,
  /\bwoda gazowana\b/,
  /\bnapoj gazowany\b/,
  /\bgazowan(?:y|a|e|ego|ej)\b/,
  /\bcarbon dioxide\b/,
  /\bdwutlenek wegla\b/,
  /\bco2\b/,
  /\be[ -]?290\b/,
] as const;

const assertionVerdict = (assertion: string): Exclude<CarbonationStatus, 'UNKNOWN'> | null => {
  const text = normalize(assertion);
  if (EXPLICIT_NON_CARBONATED.some((pattern) => pattern.test(text))) {
    return 'NON_CARBONATED';
  }
  if (EXPLICIT_CARBONATED.some((pattern) => pattern.test(text))) return 'CARBONATED';
  return null;
};

/**
 * Classify only exact, product-bound assertions. Names such as "cola", "soda"
 * or "drink" are deliberately absent from the vocabulary and remain UNKNOWN.
 */
export function classifyCarbonation(
  evidence: readonly CarbonationEvidence[],
): CarbonationProfile {
  const accepted = evidence
    .filter(
      (item) =>
        (EXACT_CARBONATION_EVIDENCE_SOURCES as readonly string[]).includes(item.source) &&
        item.assertion.trim() !== '',
    )
    .map((item) => ({ ...item, assertion: item.assertion.slice(0, 2_000) }));
  const verdicts = new Set(accepted.map((item) => assertionVerdict(item.assertion)).filter(Boolean));
  if (verdicts.size > 1) {
    return { status: 'UNKNOWN', evidence: accepted, decision: 'CONFLICTING_EXACT_ASSERTIONS' };
  }
  if (verdicts.has('CARBONATED')) {
    return { status: 'CARBONATED', evidence: accepted, decision: 'EXPLICIT_CARBONATED_ASSERTION' };
  }
  if (verdicts.has('NON_CARBONATED')) {
    return {
      status: 'NON_CARBONATED',
      evidence: accepted,
      decision: 'EXPLICIT_NON_CARBONATED_ASSERTION',
    };
  }
  return { status: 'UNKNOWN', evidence: accepted, decision: 'NO_EXACT_ASSERTION' };
}

export function parseCarbonationStatus(value: unknown): CarbonationStatus {
  return (CARBONATION_STATUSES as readonly unknown[]).includes(value)
    ? (value as CarbonationStatus)
    : 'UNKNOWN';
}

/** Read the canonical public-profile shape without trusting arbitrary values. */
export function carbonationProfileFromPublicData(
  publicData: Record<string, unknown>,
): CarbonationProfile {
  const raw =
    typeof publicData.carbonation === 'object' &&
    publicData.carbonation !== null &&
    !Array.isArray(publicData.carbonation)
      ? (publicData.carbonation as Record<string, unknown>)
      : {};
  return {
    status: parseCarbonationStatus(raw.status ?? publicData.carbonationStatus),
    evidence: Array.isArray(raw.evidence)
      ? raw.evidence.filter(
          (item): item is CarbonationEvidence =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as CarbonationEvidence).assertion === 'string' &&
            (EXACT_CARBONATION_EVIDENCE_SOURCES as readonly unknown[]).includes(
              (item as CarbonationEvidence).source,
            ),
        )
      : [],
    decision:
      raw.decision === 'EXPLICIT_CARBONATED_ASSERTION' ||
      raw.decision === 'EXPLICIT_NON_CARBONATED_ASSERTION' ||
      raw.decision === 'CONFLICTING_EXACT_ASSERTIONS'
        ? raw.decision
        : 'NO_EXACT_ASSERTION',
  };
}
