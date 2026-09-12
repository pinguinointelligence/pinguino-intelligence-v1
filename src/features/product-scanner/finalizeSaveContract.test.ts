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
const SHARED_ONBOARDING = readFileSync(
  join(REPO, 'supabase', 'functions', '_shared', 'sharedProductOnboarding.ts'),
  'utf8',
);
const SHARED_SEMANTIC_BINDING = readFileSync(
  join(REPO, 'supabase', 'functions', '_shared', 'sharedProductSemanticBinding.ts'),
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
    const handlerStart = FINALIZE.indexOf('Deno.serve');
    expect(FINALIZE.indexOf('let familyResolution = resolveCustomerProductFamily')).toBeLessThan(
      FINALIZE.indexOf('validateSharedProductOnboarding', handlerStart),
    );
    expect(FINALIZE).toContain('family_confirmation_required');
    expect(FINALIZE).toContain('validateSharedProductOnboarding');
    expect(SHARED_ONBOARDING).toContain('validateIntimportProductProfileProposal');
    expect(SHARED_ONBOARDING).toContain('validateProductBehaviorAuthority');
    expect(SHARED_ONBOARDING).toContain('finalizeProductProductionAccuracy');
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

  it('PRING-EDGE-01 persists the FINAL Search proposal through the same scanner transaction', () => {
    expect(FINALIZE).toContain('await buildSharedProductSemanticBindingProposal({');
    expect(FINALIZE).toContain(
      'const profileWithSemanticBinding = { ...profile, semanticBindingProposal }',
    );
    expect(FINALIZE).toContain('p_product_profile: profileWithSemanticBinding');
    expect(FINALIZE).toContain(".select('id,product_name_display,brand')");
    expect(FINALIZE).toContain('exactCanonicalProduct?.product_name_display');
    expect(SHARED_SEMANTIC_BINDING).toContain('resolveFinalProductSemanticSearch');
    expect(SHARED_SEMANTIC_BINDING).toContain("productId: 'SERVER_ASSIGNED_PRODUCT'");
    expect(SHARED_SEMANTIC_BINDING).toContain("productVersionId: 'SERVER_ASSIGNED_VERSION'");
  });

  it('PRING-EDGE-02 uses the nullable semantic description without assuming raw claims', () => {
    expect(FINALIZE).toContain('description: recognitionEvidence.description');
    expect(FINALIZE).not.toContain('recognitionEvidence.claims.join');
  });

  it('keeps private commerce in the account relation and raw image bytes out of persistence', () => {
    expect(FINALIZE).toContain('p_private_overlay: privateOverlay');
    expect(FINALIZE).not.toContain('base64');
    expect(MIGRATION).toContain('public.user_product_relations');
    expect(MIGRATION).not.toMatch(/private_price.*customer_added_products/);
  });
});
