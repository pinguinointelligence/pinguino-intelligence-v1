/**
 * The raw infrastructure message can never reach a user again (owner v1.4).
 *
 * Reproducer: staging 2026-08-23 06:34:05Z, session 4c969b3f (Cacao Puro / La Chocolatera).
 * `product-scan-analyze` returned 200 with the full result; `product-scan-finalize` returned
 * HTTP 400 `{"error":"product_ingest_failed"}`; `finalizeProductScan` did
 * `throw new Error(error.message)` and the SDK's `FunctionsHttpError` message —
 * „Edge Function returned a non-2xx status code" — was rendered under the result.
 */
import { describe, expect, it } from 'vitest';
import { classifyScannerError, SCANNER_ERROR_COPY } from './scannerErrors';
import {
  assertUserSafeScannerMessage,
  isRawInfrastructureMessage,
} from '@/services/scannerErrorGuard';

const OWNER_LEAK = 'Edge Function returned a non-2xx status code';

describe('scannerErrors — the owner leak', () => {
  it('classifies the exact failing call (finalize, product_ingest_failed) as a save failure', () => {
    const error = classifyScannerError({
      stage: 'save',
      serverCode: 'product_ingest_failed',
      rawMessage: OWNER_LEAK,
    });
    expect(error.code).toBe('save_failed');
    expect(error.messagePl).toBe(SCANNER_ERROR_COPY.save_failed);
    expect(error.analysisRetained).toBe(true);
  });

  it('keeps the raw transport text in diagnostics only — never in the user message', () => {
    const error = classifyScannerError({
      stage: 'save',
      serverCode: 'product_ingest_failed',
      rawMessage: OWNER_LEAK,
    });
    expect(error.diagnostic).toContain(OWNER_LEAK);
    expect(error.messagePl).not.toContain(OWNER_LEAK);
    expect(isRawInfrastructureMessage(error.messagePl)).toBe(false);
  });

  it('replaces the raw message even if it somehow reaches the render gate', () => {
    expect(assertUserSafeScannerMessage(OWNER_LEAK, 'save')).toBe(SCANNER_ERROR_COPY.save_failed);
    expect(assertUserSafeScannerMessage(OWNER_LEAK, 'analysis')).toBe(
      SCANNER_ERROR_COPY.analysis_failed,
    );
  });
});

describe('scannerErrors — no infrastructure vocabulary survives the gate', () => {
  const RAW = [
    OWNER_LEAK,
    'FunctionsHttpError: Edge Function returned a non-2xx status code',
    'new row violates row-level security policy for table "products"',
    'duplicate key value violates unique constraint "products_pkey"',
    'PGRST202: Could not find the function public.ingest_product_v1 in the schema cache',
    'permission denied for table product_versions',
    'ERROR:  P0001: classification entity not found (kind=catalog_product_version, id=…)',
    'relation "product_scan_sessions" does not exist',
    'TypeError: Cannot read properties of undefined (reading \'result\')',
    '    at handler (file:///deno/index.ts:120:9)',
    'Request failed with status code 400',
  ];

  it('recognizes every raw phrasing observed so far', () => {
    for (const message of RAW) expect(isRawInfrastructureMessage(message)).toBe(true);
  });

  it('never renders any of them', () => {
    for (const message of RAW) {
      for (const stage of ['analysis', 'save'] as const) {
        const rendered = assertUserSafeScannerMessage(message, stage);
        expect(isRawInfrastructureMessage(rendered)).toBe(false);
        expect(Object.values(SCANNER_ERROR_COPY)).toContain(rendered);
      }
    }
  });

  it('replaces an UNKNOWN server code rather than printing it', () => {
    // A code the map has never seen must still not reach the screen as a bare identifier.
    expect(assertUserSafeScannerMessage('some_future_failure_v9', 'save')).toBe(
      SCANNER_ERROR_COPY.save_failed,
    );
    const error = classifyScannerError({ stage: 'save', serverCode: 'some_future_failure_v9' });
    expect(error.messagePl).toBe(SCANNER_ERROR_COPY.save_failed);
  });

  it('every user-facing string is product language, not transport language', () => {
    for (const message of Object.values(SCANNER_ERROR_COPY)) {
      expect(isRawInfrastructureMessage(message)).toBe(false);
      expect(message).not.toMatch(/[a-z]+_[a-z]+/); // no snake_case identifiers
    }
  });
});

describe('scannerErrors — categories the user can act on', () => {
  it('separates a failed analysis from a failed save', () => {
    expect(
      classifyScannerError({ stage: 'analysis', serverCode: 'scanner_provider_unavailable' }).code,
    ).toBe('analysis_failed');
    expect(
      classifyScannerError({ stage: 'save', serverCode: 'scanner_overlay_finalize_failed' }).code,
    ).toBe('save_failed');
  });

  it('only a failed ANALYSIS discards the analysis on screen', () => {
    expect(
      classifyScannerError({ stage: 'analysis', serverCode: 'scanner_provider_unavailable' })
        .analysisRetained,
    ).toBe(false);
    for (const code of [
      'product_ingest_failed',
      'scanner_product_quota_reached',
      'scan_not_ready_for_creation',
    ]) {
      expect(classifyScannerError({ stage: 'save', serverCode: code }).analysisRetained).toBe(true);
    }
  });

  it('names a quota, an auth loss and a connection loss distinctly', () => {
    expect(classifyScannerError({ stage: 'analysis', serverCode: 'session_vision_limit' }).code).toBe(
      'quota_reached',
    );
    expect(
      classifyScannerError({ stage: 'save', serverCode: 'authentication_required' }).code,
    ).toBe('auth_required');
    expect(
      classifyScannerError({ stage: 'save', rawMessage: 'Failed to fetch', networkFailure: true })
        .code,
    ).toBe('connection');
  });
});
