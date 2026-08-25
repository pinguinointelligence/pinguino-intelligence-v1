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

describe('save contract — one product per accepted scan, retries included', () => {
  it('an already-finalized session returns the SAME overlay instead of creating a second product', () => {
    expect(FINALIZE).toContain("if (session.state === 'finalized')");
    expect(FINALIZE).toContain("return json({ kind: 'idempotent', ...overlay })");
  });

  it('a consumed quota reservation also short-circuits to the existing product', () => {
    expect(FINALIZE).toContain('quotaResult.consumed === true');
  });

  it('routes the caller-supplied idempotency key through both preflight and ingest', () => {
    expect(FINALIZE).toContain('p_idempotency_key: idempotencyKey');
    expect(FINALIZE.match(/p_idempotency_key: idempotencyKey/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('save contract — a failed save does not consume the scan', () => {
  it('releases the creation slot on every failure path after it was reserved', () => {
    const afterReservation = FINALIZE.slice(FINALIZE.indexOf('const releaseCreationSlot'));
    // profile, behavior, preflight, rate-limit, ingest and invalid-result failures all release.
    expect(afterReservation.match(/await releaseCreationSlot\(\);/g)?.length).toBe(6);
    for (const failure of [
      'pm_product_profile_unavailable',
      'pm_product_behavior_unavailable',
      'product_ingest_preflight_failed',
      'product_ingest_rate_limited',
      'product_ingest_failed',
      'product_ingest_result_invalid',
    ]) {
      const at = afterReservation.indexOf(failure);
      expect(at).toBeGreaterThan(-1);
      // the release precedes the error response it belongs to
      expect(afterReservation.lastIndexOf('await releaseCreationSlot();', at)).toBeGreaterThan(-1);
    }
  });
});

describe('save contract — public facts and private overlay stay separated', () => {
  it('never sends raw image bytes or the private overlay into the public evidence block', () => {
    expect(FINALIZE).toContain('Raw image bytes and private overlay are deliberately absent.');
    const evidence = FINALIZE.slice(
      FINALIZE.indexOf('p_evidence: {'),
      FINALIZE.indexOf('p_private_overlay:'),
    );
    expect(evidence).not.toContain('privatePrice');
    expect(evidence).not.toContain('base64');
  });

  it('normalizes the package quantity for storage and keeps the raw label separately', () => {
    expect(FINALIZE).toContain('packageSize:');
    expect(FINALIZE).toContain('netQuantityText: text(packageValue.netQuantityText)');
    expect(FINALIZE).toContain('`${packageValue.netQuantity} ${text(packageValue.unit) ?? \'\'}`');
  });
});
