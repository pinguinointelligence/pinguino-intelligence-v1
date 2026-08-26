/**
 * product-scan-finalize's save contract, pinned at the SOURCE (owner v1.4 §14–§15).
 *
 * These are guarantees about the deployed Edge function's behaviour that must not silently drift:
 * the allergen semantics the owner explicitly asked to preserve, the idempotency that makes a retry
 * after a failed save safe, and the quota release that keeps a failed save from consuming a scan.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(import.meta.dirname, '..', '..', '..');
const FINALIZE = readFileSync(
  join(REPO, 'supabase', 'functions', 'product-scan-finalize', 'index.ts'),
  'utf8',
);

describe('allergen confirmation — absence of a statement is NOT "no allergens"', () => {
  it('records the confirmation as an observation about the STATEMENT, not about allergens', () => {
    expect(FINALIZE).toContain("kind: 'no_additional_statement_visible'");
    expect(FINALIZE).toContain('confirmedBy: auth.user.id');
  });

  it('stores text that says so explicitly, in the user’s words', () => {
    expect(FINALIZE).toContain(
      'Osobna deklaracja alergenów niewidoczna na dostarczonej etykiecie — potwierdzone przez ' +
        'użytkownika; nie oznacza to automatycznie braku alergenów.',
    );
  });

  it('carries the warning into the persisted evidence', () => {
    expect(FINALIZE).toContain("'allergen_statement_absence_owner_confirmed'");
    expect(FINALIZE).toContain("warning: 'absence_of_statement_is_not_no_allergens'");
  });

  it('never collapses the confirmation into a "no allergens" claim', () => {
    expect(FINALIZE).not.toMatch(/allergens\s*:\s*(\[\]|'none'|"none"|null)\s*,?\s*\/\/\s*confirmed/i);
    expect(FINALIZE).not.toContain('brak alergenów.');
  });

  it('only accepts the confirmation when it is the ONLY thing missing and risk is not high', () => {
    expect(FINALIZE).toContain("missingCriticalFields[0] === 'allergen_confirmation'");
    expect(FINALIZE).toContain('missingCriticalFields.length === 1');
    expect(FINALIZE).toContain('validation.highRiskAuthorityRequired !== true');
  });
});

describe('save contract — one request per accepted scan, retries included', () => {
  it('an already-finalized session returns the SAME overlay instead of creating a second product', () => {
    expect(FINALIZE).toContain("if (session.state === 'finalized')");
    expect(FINALIZE).toContain("return json({ kind: 'idempotent', ...overlay })");
  });

  it('uses the request authority to return either an idempotent request or exact product', () => {
    expect(FINALIZE).toContain("'gellatti_submit_product_request_v1'");
    expect(FINALIZE).toContain("requestResult.kind !== 'product_request'");
    expect(FINALIZE).toContain("requestResult.kind !== 'existing_product'");
  });

  it('routes the caller-supplied idempotency key through the request transaction', () => {
    expect(FINALIZE).toContain('p_idempotency_key: idempotencyKey');
    expect(FINALIZE.match(/p_idempotency_key: idempotencyKey/g)?.length).toBe(1);
  });
});

describe('save contract — a failed request never consumes product creation quota', () => {
  it('does not reserve or consume the retired PM creation slot', () => {
    expect(FINALIZE).not.toContain('reserve_product_scan_creation_v1');
    expect(FINALIZE).not.toContain('finalize_product_scan_creation_v1');
    expect(FINALIZE).not.toContain("service.rpc('ingest_product_v1'");
  });
});

describe('save contract — evidence request and private commerce stay separated', () => {
  it('never sends raw image bytes or private commerce into the request payload', () => {
    const requestPayload = FINALIZE.slice(FINALIZE.indexOf('p_payload: {'), FINALIZE.indexOf('},\n    },\n  );'));
    expect(requestPayload).not.toContain('privateOverlay');
    expect(requestPayload).not.toContain('privatePrice');
    expect(requestPayload).not.toContain('base64');
  });

  it('preserves the complete scanner result as review evidence without creating an article', () => {
    expect(FINALIZE).toContain('result: scanResult');
    expect(FINALIZE).toContain('controlledCatalog: true');
    expect(FINALIZE).toContain('usableProductCreated: false');
  });
});
