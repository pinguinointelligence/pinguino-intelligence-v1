/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8');
const base = read('supabase', 'migrations', '20260826120000_admin_partner_controlled_catalog.sql');
const readModels = read(
  'supabase',
  'migrations',
  '20260826121000_controlled_catalog_read_models.sql',
);
const partner = read(
  'supabase',
  'migrations',
  '20260826122000_partner_workspace_and_public_links.sql',
);
const operations = read('supabase', 'migrations', '20260826123000_admin_operational_actions.sql');
const missingFieldConflict = read(
  'supabase',
  'migrations',
  '20260826124000_product_request_missing_field_conflict_fix.sql',
);
const catalogGuard = read(
  'supabase',
  'migrations',
  '20260826125000_admin_catalog_guard_context_fix.sql',
);
const partnerRandom = read(
  'supabase',
  'migrations',
  '20260826126000_partner_content_link_random_fix.sql',
);
const requestPrAuthority = read(
  'supabase',
  'migrations',
  '20260826127000_admin_product_request_pr_authority.sql',
);
const requestRoleReadiness = read(
  'supabase',
  'migrations',
  '20260826128000_product_request_persisted_role_readiness.sql',
);
const catalogRetirePreflight = read(
  'supabase',
  'migrations',
  '20260826129000_admin_catalog_retire_preflight.sql',
);
const catalogRetireHashKey = read(
  'supabase',
  'migrations',
  '20260826130000_admin_catalog_retire_preflight_hash_key.sql',
);
const referralClickConflict = read(
  'supabase',
  'migrations',
  '20260826131000_referral_click_dedupe_conflict_fix.sql',
);
const requestFilterProjection = read(
  'supabase',
  'migrations',
  '20260826132000_admin_product_request_filter_projection.sql',
);
const requestExactCandidateColumns = read(
  'supabase',
  'migrations',
  '20260826133000_admin_product_request_exact_candidate_columns.sql',
);

describe('controlled customer product intake', () => {
  it('keeps historical PM creation revoked while final Scanner uses customer-added authority', () => {
    expect(base).toContain('revoke execute on function public.reserve_product_scan_creation_v1');
    expect(base).toContain('revoke execute on function public.complete_product_scan_creation_v1');
    const finalize = read('supabase', 'functions', 'product-scan-finalize', 'index.ts');
    expect(finalize).toContain("'gellatti_upsert_customer_added_product_v1'");
    expect(finalize).toContain("origin: 'CUSTOMER_ADDED'");
    expect(finalize).not.toContain('reserve_product_scan_creation_v1');
    expect(finalize).not.toContain('complete_product_scan_creation_v1');
  });

  it('keeps requests out of products and requires canonical Admin approval', () => {
    expect(base).toContain('create table if not exists public.product_add_requests');
    expect(base).toContain("if not public.gellatti_admin_has_permission_v1('CATALOG',v_admin)");
    expect(base).toContain('canonical_admin_pr_ingest_required');
    expect(base).toContain('publishable_product_authority_required');
    const submit = read('supabase', 'functions', 'catalog-submit', 'index.ts');
    expect(submit).toContain('administrator_required');
    expect(submit).toContain('requireApprovalReady');
    expect(submit).toContain('approval_not_ready');
    expect(submit).toContain('product_request_approval_binding_required');
    expect(submit).toContain("canonicalInput.provenance !== 'product_add_request_admin_v1'");
    expect(requestPrAuthority).toContain('product_add_request_admin_v1');
    expect(requestPrAuthority).toContain(
      "request_authority.status in ('SUBMITTED','ADMIN_REVIEW','NEEDS_INFO','RESUBMITTED')",
    );
    expect(requestRoleReadiness).toContain('productBehaviorAuthority,baseRecipeEligible');
    expect(requestRoleReadiness).toContain("pb.profile_permissions->>'BASE_RECIPE'");
  });

  it('stores immutable events and separates user archive from terminal request status', () => {
    expect(base).toContain('product_add_request_user_state');
    expect(base).toContain('user_archived_at');
    expect(base).toContain('product_add_request_events_immutable');
    expect(base).toContain("raise exception 'immutable_history'");
    expect(base).toContain("'USER_CANCELED'");
  });

  it('projects source and exact catalog candidates for the complete Admin filter set', () => {
    expect(requestFilterProjection).toContain("''source'',r.source");
    expect(requestFilterProjection).toContain("''exactMatchCandidate'',exists(");
    expect(requestExactCandidateColumns).toContain('candidate.is_active');
    expect(requestExactCandidateColumns).toContain('candidate.canonical_verification_status');
    expect(requestExactCandidateColumns).toContain('candidate.ean_code_normalized');
    expect(requestExactCandidateColumns).toContain('candidate_variant.ean');
    const workspace = read('src', 'pages', 'admin', 'AdminWorkspacePage.tsx');
    for (const label of [
      'Filtr użytkownika',
      'Filtr marki',
      'Filtr EAN',
      'Filtr kraju rynku',
      'Filtr daty zgłoszenia od',
      'Filtr daty zgłoszenia do',
      'Minimalny wiek w dniach',
      'Filtr przypisanego administratora',
      'Filtr brakującego pola',
      'Filtr dokładnego dopasowania',
      'Filtr źródła zgłoszenia',
    ])
      expect(workspace).toContain(`aria-label="${label}"`);
    expect(workspace).toContain('aria-label="Podgląd przed zatwierdzeniem"');
    expect(workspace).toContain('Rola produktu');
    expect(workspace).toContain('Gotowość użycia');
    expect(workspace).toContain('aria-label="Podgląd wiadomości do użytkownika"');
  });
});

describe('Admin server and RLS boundaries', () => {
  it('supports six permission-bearing roles and rejects client-only authority', () => {
    for (const role of [
      'super_admin',
      'catalog_admin',
      'support_admin',
      'partner_admin',
      'finance_admin',
      'content_moderator',
    ]) {
      expect(base).toContain(`'${role}'`);
    }
    expect(base).toContain('security definer');
    expect(base).toContain('administrator_required');
    expect(base).toContain('alter table public.product_add_requests enable row level security');
  });

  it('keeps request uploads private and issues only short-lived signed Admin URLs', () => {
    expect(base).toContain("'product-request-evidence','product-request-evidence',false");
    expect(operations).toContain('product_request_evidence_read_admin');
    const edge = read('supabase', 'functions', 'admin-control', 'index.ts');
    expect(edge).toContain('createSignedUrl(item.storage_path, 300)');
    expect(edge).not.toContain('getPublicUrl');
  });

  it('exposes operational catalog actions but makes Mapper/PI fail closed', () => {
    expect(operations).toContain('gellatti_admin_catalog_action_v1');
    expect(operations).toContain('mapper_reference_is_read_only');
    expect(operations).toContain('public.ingest_product_v1');
    expect(operations).toContain("'operation','retire'");
    expect(operations).not.toMatch(
      /(insert|update|delete)\s+(into\s+|from\s+)?public\.mapper_basement/i,
    );
    expect(catalogGuard).toContain("set_config('app.canonical_product_ingest','v1',true)");
    expect(catalogGuard).toContain('v_prior_ingest_context');
    expect(catalogRetirePreflight).toContain('preflight_product_ingest_v1');
    expect(catalogRetirePreflight).toContain("'rateReservationId',v_preflight->>'reservationId'");
    expect(catalogRetireHashKey).toContain("'preflightPayloadHash',v_rate_hash");
  });

  it('keeps REQUEST_INFO conflict handling immediate and scoped to open fields', () => {
    expect(missingFieldConflict).toContain('drop constraint if exists');
    expect(missingFieldConflict).toContain("where status='REQUESTED'");
  });
});

describe('country, Partner and invitation invariants', () => {
  it('uses exact SKU-to-market many-to-many and leaves favorites independent', () => {
    expect(operations).toContain('product_variant_markets');
    expect(base).toContain('account_product_market_preferences');
    const picker = read('src', 'features', 'global-catalog', 'useGlobalCatalogPicker.ts');
    expect(picker).toContain('const favoritesIgnoreMarket = input.favoritesOnly');
    expect(picker).toContain('forceGlobal: input.forceGlobal === true || favoritesIgnoreMarket');
  });

  it('limits Partners to three active codes and never reassigns archived public codes', () => {
    expect(base).toContain('partner_active_code_limit_reached');
    expect(base).toContain('partner_codes_code_permanent_uniq');
    expect(partner).toContain("p_action='ARCHIVE'");
    expect(partner).toContain("status='retired'");
    expect(partnerRandom).toContain('extensions.gen_random_bytes(12)');
  });

  it('keeps one-time Home codes separate, exact-email-bound and one use only', () => {
    expect(operations).toContain('gellatti_admin_mint_home_invite_v1');
    expect(operations).toContain('gellatti_redeem_home_invite_v1');
    expect(operations).toContain('invite_email_mismatch');
    expect(operations).toContain("'invite_home_trial'");
    const edge = read('supabase', 'functions', 'admin-control', 'index.ts');
    expect(edge).toContain("Deno.env.get('INVITE_CODE_PEPPER')");
    expect(edge).toContain('plaintextReturnedOnce: true');
  });

  it('keeps Partner analytics owner-scoped and Connect server-provisioned', () => {
    expect(partner).toContain('gellatti_partner_workspace_v1');
    expect(partner).toContain('where p.user_id=auth.uid()');
    const edge = read('supabase', 'functions', 'admin-control', 'index.ts');
    expect(edge).toContain("type: 'express'");
    expect(edge).toContain('gellatti_admin_register_partner_connect_v1');
    expect(referralClickConflict).toContain('create unique index referral_clicks_dedupe_key_uniq');
    expect(referralClickConflict).not.toContain('where dedupe_key is not null');
  });
});

describe('server-confirmed Admin finance notifications', () => {
  it('dedupes by paid invoice and excludes zero/failed payments from sound', () => {
    expect(operations).toContain("new.event_type in ('invoice.paid','invoice.payment_succeeded')");
    expect(operations).toContain('v_amount>0');
    expect(operations).toContain(
      "'stripe-payment:'||case when new.livemode then 'live' else 'test' end||':'||v_object_id",
    );
    expect(operations).toContain('sound_eligible');
    expect(operations).toContain('on conflict(dedupe_key) do nothing');
    expect(readModels).toContain("'soundPlayedAt', q.sound_played_at");
  });
});

describe('staging Admin fixture safety', () => {
  it('requires the exact staging ref and never embeds a service-role key', () => {
    const seed = read('scripts', 'seed-staging-admin.mjs');
    expect(seed).toContain("const STAGING_REF = 'tunabqqrwabacxjcxxkz'");
    expect(seed).toContain("email: 'admin@admin.com'");
    expect(seed).toContain("required('SUPABASE_SERVICE_ROLE_KEY')");
    expect(seed).not.toMatch(/eyJ[a-zA-Z0-9_-]{20,}/);
  });
});
