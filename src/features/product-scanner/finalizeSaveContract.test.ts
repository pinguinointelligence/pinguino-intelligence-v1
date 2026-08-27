import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(import.meta.dirname, '..', '..', '..');
const FINALIZE = readFileSync(
  join(REPO, 'supabase', 'functions', 'product-scan-finalize', 'index.ts'),
  'utf8',
);
const MIGRATION = readFileSync(
  join(REPO, 'supabase', 'migrations', '20260827100000_scanner_customer_added_products.sql'),
  'utf8',
);
const READINESS_MIGRATION = readFileSync(
  join(
    REPO,
    'supabase',
    'migrations',
    '20260827123000_scanner_readiness_accuracy_metadata_contract.sql',
  ),
  'utf8',
);

describe('customer product finalization contract', () => {
  it('requires a checksum-valid EAN and persists the corrected server session before authority work', () => {
    expect(FINALIZE).toContain('normalizeValidatedBarcode');
    expect(FINALIZE).toContain('customer_product_valid_ean_required');
    expect(FINALIZE.indexOf('scanner_corrections_persistence_failed')).toBeLessThan(
      FINALIZE.indexOf('const proposal = customerProductProfileProposal'),
    );
  });

  it('runs family resolution before Mapper completion and ProductBehavior', () => {
    expect(FINALIZE.indexOf('let familyResolution = resolveCustomerProductFamily')).toBeLessThan(
      FINALIZE.indexOf('profile = validateIntimportProductProfileProposal'),
    );
    expect(FINALIZE).toContain('family_confirmation_required');
    expect(FINALIZE).toContain('validateProductBehaviorAuthority');
    expect(FINALIZE).toContain('finalizeProductProductionAccuracy');
  });

  it('fails closed on shared capability readiness without a score-threshold proxy', () => {
    expect(FINALIZE).not.toContain('profile.productAccuracy >= 85');
    expect(FINALIZE).toContain('profile.productAccuracyAssessment.gellattiReadiness.ready');
    expect(FINALIZE).toContain('profile.productAccuracyAssessment.roleReadiness');
    expect(FINALIZE).toContain("roleReadiness === 'BASE_READY'");
    expect(FINALIZE).toContain("roleReadiness === 'TOPPING_READY'");
    expect(FINALIZE).toContain('profile.productAccuracyAssessment.criticalBlockers');
    expect(FINALIZE).toContain('customer_product_not_ready');
    expect(FINALIZE).not.toContain('gellatti_submit_product_request_v1');
    expect(MIGRATION).not.toContain("'PM-ING-'");
    expect(READINESS_MIGRATION).toContain('{productAccuracyAssessment,gellattiReadiness,ready}');
    expect(READINESS_MIGRATION).toContain('gellatti_upsert_customer_added_product_v1');
    expect(READINESS_MIGRATION).toContain('gellatti_admin_canonicalize_customer_added_v1');
    expect(READINESS_MIGRATION).toContain('gellatti_admin_product_request_action_v1');
    expect(READINESS_MIGRATION).toContain('scanner_admin_accuracy_threshold_predicate_not_found');
    expect(READINESS_MIGRATION).toContain('scanner_request_accuracy_threshold_predicate_not_found');
  });

  it('returns the same finalized product and saves through one exact-EAN transaction', () => {
    expect(FINALIZE).toContain("session.state === 'finalized'");
    expect(FINALIZE).toContain("kind: 'idempotent'");
    expect(FINALIZE).toContain("'gellatti_upsert_customer_added_product_v1'");
    expect(FINALIZE).toContain('p_idempotency_key: idempotencyKey');
  });

  it('keeps private commerce in the account relation and raw image bytes out of persistence', () => {
    expect(FINALIZE).toContain('p_private_overlay: privateOverlay');
    expect(FINALIZE).not.toContain('base64');
    expect(MIGRATION).toContain('public.user_product_relations');
    expect(MIGRATION).not.toMatch(/private_price.*customer_added_products/);
  });
});
