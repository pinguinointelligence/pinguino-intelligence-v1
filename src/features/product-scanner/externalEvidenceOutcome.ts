import { openFoodFactsApiUrl, openFoodFactsFactsForExactEan } from './openFoodFactsDirectLookup';

export type ExternalEvidenceOutcome =
  'FOUND' | 'NOT_FOUND' | 'UNAVAILABLE' | 'RATE_LIMITED' | 'TIMEOUT' | 'MALFORMED' | 'FAILED';

export type ExternalEvidenceProvider = 'open_food_facts' | 'intimport_enrich';

export interface ExternalEvidenceAttempt {
  provider: ExternalEvidenceProvider;
  outcome: ExternalEvidenceOutcome;
  reasonCode: string;
  retryable: boolean;
  attemptedAt: string;
  sessionId: string;
  canonicalGtin: string;
  sourceReceipt: string | null;
}

export interface ExternalEvidenceResult {
  attempt: ExternalEvidenceAttempt;
  facts: Record<string, unknown>[];
}

export interface CombinedExternalEvidenceResult {
  outcome: ExternalEvidenceOutcome;
  resolvedNothing: boolean;
  providerUnavailable: boolean;
  retryable: boolean;
  facts: Record<string, unknown>[];
  attempts: ExternalEvidenceAttempt[];
}

const retryableOutcome = (outcome: ExternalEvidenceOutcome): boolean =>
  ['UNAVAILABLE', 'RATE_LIMITED', 'TIMEOUT', 'MALFORMED', 'FAILED'].includes(outcome);

function attempt(
  metadata: Pick<ExternalEvidenceAttempt, 'attemptedAt' | 'sessionId' | 'canonicalGtin'>,
  outcome: ExternalEvidenceOutcome,
  reasonCode: string,
  sourceReceipt: string | null = null,
): ExternalEvidenceAttempt {
  return {
    provider: 'open_food_facts',
    outcome,
    reasonCode,
    retryable: retryableOutcome(outcome),
    ...metadata,
    sourceReceipt,
  };
}

const isTimeoutError = (error: unknown): boolean => {
  const name = error && typeof error === 'object' ? String((error as { name?: unknown }).name) : '';
  return name === 'AbortError' || name === 'TimeoutError';
};

/**
 * One exact OpenFoodFacts request with an explicit result state. HTTP/transport failures never
 * become an empty fact list that a caller could mistake for authoritative absence.
 */
export async function fetchOpenFoodFactsEvidence(input: {
  sessionId: string;
  canonicalGtin: string;
  attemptedAt: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}): Promise<ExternalEvidenceResult> {
  const metadata = {
    sessionId: input.sessionId,
    canonicalGtin: input.canonicalGtin,
    attemptedAt: input.attemptedAt,
  };
  const endpoint = new URL(openFoodFactsApiUrl(input.canonicalGtin));
  endpoint.searchParams.set(
    'fields',
    [
      'code',
      'product_name',
      'generic_name',
      'brands',
      'quantity',
      'categories',
      'categories_tags',
      'ingredients_text',
      'allergens',
      'allergens_tags',
      'origins',
      'origins_tags',
      'nutrition_data_per',
      'nutriments',
    ].join(','),
  );

  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(endpoint, {
      method: 'GET',
      signal: input.signal ?? AbortSignal.timeout(8_000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GellattiProductScanner/1.0 (https://pinguinoai.com)',
      },
    });
  } catch (error) {
    const outcome: ExternalEvidenceOutcome = isTimeoutError(error) ? 'TIMEOUT' : 'UNAVAILABLE';
    return {
      attempt: attempt(
        metadata,
        outcome,
        outcome === 'TIMEOUT' ? 'off_timeout' : 'off_fetch_failed',
      ),
      facts: [],
    };
  }

  if (response.status === 404) {
    return { attempt: attempt(metadata, 'NOT_FOUND', 'off_http_404'), facts: [] };
  }
  if (response.status === 429) {
    return { attempt: attempt(metadata, 'RATE_LIMITED', 'off_http_429'), facts: [] };
  }
  if (response.status >= 500) {
    return { attempt: attempt(metadata, 'UNAVAILABLE', `off_http_${response.status}`), facts: [] };
  }
  if (!response.ok) {
    return { attempt: attempt(metadata, 'FAILED', `off_http_${response.status}`), facts: [] };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { attempt: attempt(metadata, 'MALFORMED', 'off_invalid_json'), facts: [] };
  }
  const parsed = openFoodFactsFactsForExactEan(payload, input.canonicalGtin, input.attemptedAt);
  if (parsed.outcome === 'found') {
    const sourceReceipt =
      parsed.facts.find((fact) => typeof fact.sourceReceiptId === 'string')?.sourceReceiptId ??
      `off:${input.canonicalGtin}:${input.attemptedAt}`;
    return {
      attempt: attempt(metadata, 'FOUND', 'off_exact_gtin_found', String(sourceReceipt)),
      facts: parsed.facts,
    };
  }
  if (parsed.outcome === 'not_found') {
    return { attempt: attempt(metadata, 'NOT_FOUND', 'off_body_not_found'), facts: [] };
  }
  return {
    attempt: attempt(metadata, 'MALFORMED', `off_${parsed.outcome}`),
    facts: [],
  };
}

/**
 * A final no-record verdict requires every provider that participated to say NOT_FOUND.
 * Any useful facts win over another provider's failure, while a failure can never erase them.
 */
export function combineExternalEvidenceResults(
  results: readonly ExternalEvidenceResult[],
): CombinedExternalEvidenceResult {
  const attempts = results.map((result) => result.attempt);
  const facts = results.flatMap((result) => result.facts);
  if (facts.length > 0 || attempts.some((item) => item.outcome === 'FOUND')) {
    return {
      outcome: 'FOUND',
      resolvedNothing: false,
      providerUnavailable: false,
      retryable: false,
      facts,
      attempts,
    };
  }
  if (attempts.length > 0 && attempts.every((item) => item.outcome === 'NOT_FOUND')) {
    return {
      outcome: 'NOT_FOUND',
      resolvedNothing: true,
      providerUnavailable: false,
      retryable: false,
      facts: [],
      attempts,
    };
  }
  const priority: ExternalEvidenceOutcome[] = [
    'TIMEOUT',
    'RATE_LIMITED',
    'MALFORMED',
    'UNAVAILABLE',
    'FAILED',
  ];
  const outcome = priority.find((candidate) => attempts.some((item) => item.outcome === candidate));
  return {
    outcome: outcome ?? 'FAILED',
    resolvedNothing: false,
    providerUnavailable: true,
    retryable: attempts.some((item) => item.retryable),
    facts: [],
    attempts,
  };
}
