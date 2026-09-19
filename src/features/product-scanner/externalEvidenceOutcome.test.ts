import { describe, expect, it, vi } from 'vitest';

import {
  combineExternalEvidenceResults,
  fetchOpenFoodFactsEvidence,
  type ExternalEvidenceResult,
} from './externalEvidenceOutcome';

const EAN = '8480000110435';
const attemptedAt = '2026-09-19T10:00:00.000Z';
const metadata = { sessionId: 'session-1', canonicalGtin: EAN, attemptedAt };

const response = (status: number, body: unknown): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const fallback = (
  outcome: ExternalEvidenceResult['attempt']['outcome'],
  facts: Record<string, unknown>[] = [],
): ExternalEvidenceResult => ({
  attempt: {
    provider: 'intimport_enrich',
    outcome,
    reasonCode: `fallback_${outcome.toLowerCase()}`,
    retryable: !['FOUND', 'NOT_FOUND'].includes(outcome),
    ...metadata,
    sourceReceipt: null,
  },
  facts,
});

describe('Scanner 1.5 typed external-evidence outcomes', () => {
  it('S15-FIX-01 OFF 404 is the definitive no-record outcome', async () => {
    const result = await fetchOpenFoodFactsEvidence({
      ...metadata,
      fetcher: vi.fn(async () => response(404, undefined)),
    });

    expect(result).toMatchObject({
      attempt: { outcome: 'NOT_FOUND', retryable: false, reasonCode: 'off_http_404' },
      facts: [],
    });
  });

  it('S15-FIX-02 OFF timeout is retryable and can never become no-record', async () => {
    const result = await fetchOpenFoodFactsEvidence({
      ...metadata,
      fetcher: vi.fn(async () => {
        throw new DOMException('timed out', 'TimeoutError');
      }),
    });

    expect(result.attempt).toMatchObject({ outcome: 'TIMEOUT', retryable: true });
    expect(combineExternalEvidenceResults([result, fallback('UNAVAILABLE')])).toMatchObject({
      outcome: 'TIMEOUT',
      resolvedNothing: false,
      providerUnavailable: true,
    });
  });

  it('S15-FIX-03 OFF 429 remains rate-limited, never no-record', async () => {
    const result = await fetchOpenFoodFactsEvidence({
      ...metadata,
      fetcher: vi.fn(async () => response(429, { error: 'rate limit' })),
    });

    expect(result.attempt).toMatchObject({ outcome: 'RATE_LIMITED', retryable: true });
    expect(combineExternalEvidenceResults([result])).toMatchObject({
      resolvedNothing: false,
      providerUnavailable: true,
    });
  });

  it.each([
    ['HTTP 503', vi.fn(async () => response(503, { error: 'upstream' }))],
    [
      'network exception',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    ],
  ])('S15-FIX-04 OFF %s is unavailable', async (_case, fetcher) => {
    const result = await fetchOpenFoodFactsEvidence({ ...metadata, fetcher });
    expect(result.attempt).toMatchObject({ outcome: 'UNAVAILABLE', retryable: true });
  });

  it.each([
    [
      'unparseable JSON',
      new Response('{', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ],
    ['schema-invalid product', response(200, { status: 1, code: EAN, product: {} })],
  ])('S15-FIX-05 OFF %s is malformed', async (_case, offResponse) => {
    const result = await fetchOpenFoodFactsEvidence({
      ...metadata,
      fetcher: vi.fn(async () => offResponse),
    });
    expect(result.attempt).toMatchObject({ outcome: 'MALFORMED', retryable: true });
  });

  it('S15-FIX-06 OFF failure plus useful fallback facts retains valid evidence', async () => {
    const direct = await fetchOpenFoodFactsEvidence({
      ...metadata,
      fetcher: vi.fn(async () => response(503, undefined)),
    });
    const useful = fallback('FOUND', [
      { field: 'productName', value: 'Clásica café soluble', sourceUrl: 'https://example.test' },
    ]);

    expect(combineExternalEvidenceResults([direct, useful])).toMatchObject({
      outcome: 'FOUND',
      resolvedNothing: false,
      providerUnavailable: false,
      facts: [expect.objectContaining({ field: 'productName' })],
    });
  });

  it('S15-FIX-07 OFF failure plus fallback failure stays provider_unavailable', async () => {
    const direct = await fetchOpenFoodFactsEvidence({
      ...metadata,
      fetcher: vi.fn(async () => response(503, undefined)),
    });

    expect(combineExternalEvidenceResults([direct, fallback('FAILED')])).toMatchObject({
      resolvedNothing: false,
      providerUnavailable: true,
      facts: [],
    });
  });

  it('S15-FIX-08 only explicit no-record from every responding provider resolves nothing', async () => {
    const direct = await fetchOpenFoodFactsEvidence({
      ...metadata,
      fetcher: vi.fn(async () => response(404, undefined)),
    });

    expect(combineExternalEvidenceResults([direct, fallback('NOT_FOUND')])).toMatchObject({
      outcome: 'NOT_FOUND',
      resolvedNothing: true,
      providerUnavailable: false,
    });
  });
});
