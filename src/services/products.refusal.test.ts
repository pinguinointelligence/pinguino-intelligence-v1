/**
 * A refused ingest must say what was refused. The generic
 * "did not return a canonical product" hid an exhausted daily quota behind a
 * sentence that reads like a bug.
 */
import { describe, expect, it } from 'vitest';
import { productIngestRefusal } from './products';

describe('productIngestRefusal', () => {
  it('names the quota and when it frees up', () => {
    const message = productIngestRefusal({
      kind: 'rate_limited',
      rateReason: 'daily',
      retryAt: '2026-08-25T07:35:00Z',
    });
    expect(message).toContain('limit zapisów');
    expect(message).toContain('daily');
    expect(message).toContain('2026-08-25T07:35:00Z');
  });

  it('reports a block with the fields it is missing', () => {
    const message = productIngestRefusal({ kind: 'blocked', missingFields: ['brand'] });
    expect(message).toContain('zablokował');
    expect(message).toContain('brand');
  });

  it('still says something useful for an unexpected kind', () => {
    expect(productIngestRefusal({ kind: null })).toContain('brak');
  });
});
