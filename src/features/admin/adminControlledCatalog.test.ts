/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8');
const base = read('supabase', 'migrations', '20260826120000_admin_partner_controlled_catalog.sql');
const readModels = read('supabase', 'migrations', '20260826121000_controlled_catalog_read_models.sql');
const partner = read('supabase', 'migrations', '20260826122000_partner_workspace_and_public_links.sql');
const operations = read('supabase', 'migrations', '20260826123000_admin_operational_actions.sql');

describe('controlled customer product intake', () => {
  it('revokes the historical Scanner product-creation RPCs and uses a request on no exact match', () => {
    expect(base).toContain('revoke execute on function public.reserve_product_scan_creation_v1');
    expect(base).toContain('revoke execute on function public.complete_product_scan_creation_v1');
    const finalize = read('supabase', 'functions', 'product-scan-finalize', 'index.ts');
    expect(finalize).toContain("requestResult.kind !== 'product_request'");
    expect(finalize).toContain("'gellatti_submit_product_request_v1'");
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
  });

  it('stores immutable events and separates user archive from terminal request status', () => {
    expect(base).toContain('product_add_request_user_state');
    expect(base).toContain('user_archived_at');
    expect(base).toContain('product_add_request_events_immutable');
    expect(base).toContain("raise exception 'immutable_history'");
    expect(base).toContain("'USER_CANCELED'");
  });
});

describe('Admin server and RLS boundaries', () => {
  it('supports six permission-bearing roles and rejects client-only authority', () => {
    for (const role of ['super_admin','catalog_admin','support_admin','partner_admin','finance_admin','content_moderator']) {
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
    expect(edge).toContain("createSignedUrl(item.storage_path, 300)");
    expect(edge).not.toContain('getPublicUrl');
  });

  it('exposes operational catalog actions but makes Mapper/PI fail closed', () => {
    expect(operations).toContain('gellatti_admin_catalog_action_v1');
    expect(operations).toContain('mapper_reference_is_read_only');
    expect(operations).toContain('public.ingest_product_v1');
    expect(operations).toContain("'operation','retire'");
    expect(operations).not.toMatch(/(insert|update|delete)\s+(into\s+|from\s+)?public\.mapper_basement/i);
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
  });
});

describe('server-confirmed Admin finance notifications', () => {
  it('dedupes by paid invoice and excludes zero/failed payments from sound', () => {
    const webhook = read('supabase', 'functions', 'stripe-webhook', 'index.ts');
    expect(webhook).toContain("invoice.status !== 'paid' || invoice.amount_paid <= 0");
    expect(webhook).toContain('stripe-payment:${event.livemode ? \'live\' : \'test\'}:${invoice.id}');
    expect(webhook).toContain('sound_eligible: true');
    expect(webhook).toContain('sound_eligible: false');
    expect(webhook).toContain(".update({ state: 'received' })");
    expect(readModels).toContain("'soundPlayedAt', q.sound_played_at");
  });
});

describe('staging Admin fixture safety', () => {
  it('requires the exact staging ref and never embeds a service-role key', () => {
    const seed = read('scripts', 'seed-staging-admin.mjs');
    expect(seed).toContain("const STAGING_REF = 'tunabqqrwabacxjcxxkz'");
    expect(seed).toContain("const EMAIL = 'admin@admin.com'");
    expect(seed).toContain("required('SUPABASE_SERVICE_ROLE_KEY')");
    expect(seed).not.toMatch(/eyJ[a-zA-Z0-9_-]{20,}/);
  });
});
