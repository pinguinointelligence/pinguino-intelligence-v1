import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260813110300_canonical_product_root_and_ingest.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const classifierSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260813110400_product_behavior_classification_queue.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('canonical product root forward migration', () => {
  it('uses public.products as the only writable identity root', () => {
    expect(sql).toContain('alter table public.products alter column owner_user_id drop not null');
    expect(sql).toContain('add column if not exists product_kind text');
    expect(sql).toContain('add column if not exists visibility text');
    expect(sql).toContain('products_canonical_write_guard');
    expect(sql).toContain("raise exception 'canonical product writes require ingest_product_v1'");
    expect(sql).toContain('revoke insert,update,delete on public.products from authenticated');
  });

  it('creates the six canonical dependent models with private overlays separated', () => {
    for (const table of [
      'product_versions',
      'product_evidence',
      'product_behavior_bindings',
      'product_ingest_events',
      'product_review_cases',
      'user_product_relations',
    ]) expect(sql).toContain(`create table public.${table}`);
    const versions = sql.slice(sql.indexOf('create table public.product_versions'), sql.indexOf('create table public.product_behavior_bindings'));
    expect(versions).not.toMatch(/private_price|supplier|notes|stock/);
    expect(sql).toContain('user_product_relations_own');
    expect(sql).toContain('user_id=auth.uid()');
  });

  it('backfills every active Mapper identity without changing Mapper facts', () => {
    expect(sql).toContain("'mapper_reference','internal',null");
    expect(sql).toContain("'mapper:'||m.ingredient_id");
    expect(sql).toContain("md5('pinguino:mapper-reference:'||m.dataset_version||':'||m.ingredient_id)::uuid");
    expect(sql).toContain("raise exception 'canonical Mapper reference UUID collision'");
    expect(sql).toContain("'mapperIngredientId',m.ingredient_id,'mapperDatasetVersion',m.dataset_version");
    expect(sql).toContain("p.product_kind='mapper_reference'");
    expect(sql).not.toMatch(/insert\s+into\s+public\.mapper_basement/i);
    expect(sql).not.toMatch(/update\s+public\.mapper_basement/i);
  });

  it('preserves global identity and immutable version UUIDs before retiring old roots', () => {
    expect(sql).toContain('select\n  g.id,null,null,g.brand');
    expect(sql).toContain('select v.id,v.product_id,v.version,v.snapshot');
    expect(sql.indexOf('insert into public.product_versions')).toBeLessThan(
      sql.indexOf('alter table public.global_catalog_product_versions rename'),
    );
    expect(sql).toContain("raise exception 'global catalog product identity was not preserved'");
    expect(sql).toContain("raise exception 'global catalog product version was not preserved'");
  });

  it('turns the former catalog roots into read-only compatibility views', () => {
    expect(sql).toContain('alter table public.global_catalog_products rename to global_catalog_products_archive_20260813');
    expect(sql).toContain('alter table public.global_catalog_product_versions rename to global_catalog_product_versions_archive_20260813');
    expect(sql).toContain('create view public.global_catalog_products with (security_invoker=true) as');
    expect(sql).toContain('create view public.global_catalog_product_versions with (security_invoker=true) as');
    expect(sql).toContain('global_catalog_products_archive_readonly');
    expect(sql).toContain('revoke execute on function public.submit_owned_product_to_global_catalog_v2');
  });

  it('replaces search with canonical versions, behavior and private relations', () => {
    const replacement = sql.slice(sql.lastIndexOf('drop function if exists public.search_global_catalog'));
    expect(replacement).toContain('from public.products p');
    expect(replacement).toContain('join public.product_versions v');
    expect(replacement).toContain('join public.product_behavior_bindings b');
    expect(replacement).toContain('left join public.user_product_relations r');
    expect(replacement).toContain('left join public.mapper_basement m');
    expect(replacement).not.toContain('left join public.account_catalog_product_data private_data');
  });

  it('provides one service-role-only transaction with idempotency, rate limits, duplicates and atomic outputs', () => {
    expect(sql).toContain('create or replace function public.ingest_product_v1(');
    expect(sql).toContain('unique(actor_user_id,source,idempotency_key)');
    expect(sql).toContain("raise exception 'idempotency key payload mismatch'");
    expect(sql).toContain('public.reserve_global_catalog_rate_slot(');
    expect(sql).toContain("'duplicate_dispute'");
    expect(sql).toContain("perform set_config('app.canonical_product_ingest','v1',true)");
    expect(sql).toContain('insert into public.product_versions');
    expect(sql).toContain('insert into public.product_evidence');
    expect(sql).toContain('insert into public.product_behavior_bindings');
    expect(sql).toContain('insert into public.product_ingest_events');
    expect(sql).toContain('insert into public.user_product_relations');
    expect(sql).toContain('grant execute on function public.ingest_product_v1');
    expect(sql).toContain('to service_role');
    expect(sql).not.toMatch(/grant execute on function public\.ingest_product_v1[^;]+authenticated/i);
  });

  it('supports guarded upsert and authorized soft retirement through the same ingest transaction', () => {
    expect(sql).toContain("v_operation text:=coalesce(nullif(p_input->>'operation',''),'upsert')");
    expect(sql).toContain("if v_operation not in ('upsert','retire')");
    expect(sql).toContain("if v_operation='retire' then");
    expect(sql).toContain("raise exception 'product not found or retirement is not authorized'");
    expect(sql).toContain("raise exception 'product status guard refused operation'");
    expect(sql).toContain("update public.products set is_active=false,updated_at=now()");
    expect(sql).toContain("'kind','retired'");
    expect(sql).toContain("'productCode',v_existing.product_code");
    expect(sql).toContain("status text not null check(status in ('accepted','duplicate','blocked','review','retired'))");
  });

  it('routes lifecycle decisions through an admin-only audited branch', () => {
    expect(sql).toContain("v_lifecycle_decision text:=nullif(p_input->>'lifecycleDecision','')");
    expect(sql).toContain("if not v_is_admin then raise exception 'administrator lifecycle decision required'");
    expect(sql).toContain("'admin_lifecycle'");
    expect(sql).toContain("PI Verified lifecycle decision requires independent provenance and clean red flags");
    expect(sql).toContain("canonical_verification_method=case");
  });

  it('keeps Mapper authorization version-bound and administrator-only', () => {
    expect(sql).toContain("v_mapper_decision jsonb:=coalesce(p_input->'mapperDecision','{}'::jsonb)");
    expect(sql).toContain("if not v_is_admin then raise exception 'administrator Mapper decision required'");
    expect(sql).toContain("Mapper authorization target is not active, approved and verified");
    expect(sql).toContain("Mapper review signoff does not authorize this mapping");
    expect(sql).toContain("v_binding_id:=public.classify_catalog_product_behavior_v2(");
    expect(sql).toContain("'admin_mapper_decision'");
    expect(sql).toContain("'mapper_authorization_required'");
    expect(sql).toContain("mapper_status=case when v_mapper_ingredient_id is null then 'rejected' else 'matched' end");
    expect(sql).toContain("mapper_status='needs_review'");
    expect(sql).toContain('Mapper candidate requires an independently verified sign-off.');
    expect(sql).not.toMatch(/grant execute on function public\.ingest_product_v1[^;]+authenticated/i);
  });

  it('uses exact canonical module permission keys', () => {
    expect(sql).toContain("'RECIPE_VERSION',true");
    expect(sql).toContain("'PROCESS',false");
    expect(sql).not.toContain("'RECIPE_VERSIONS'");
    expect(sql).not.toContain("'PROCESS_GUIDE'");
  });

  it('locks correction targets and never trusts adapter identity keys over canonical keys', () => {
    expect(sql).toMatch(/where p\.id=v_requested_product_id[\s\S]+?for update;/);
    expect(sql).toContain('v_has_existing:=found');
    expect(sql).toContain("v_facts:=coalesce(p_input->'facts','{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(");
    expect(sql).toContain("raise exception 'duplicate product decision does not match canonical identity'");
    expect(sql).toContain("p.visibility='shared' and p.canonical_verification_status<>'verified' and exists(");
    expect(sql).toContain("v_existing.visibility='shared' and v_existing.canonical_verification_status<>'verified' and exists(");
  });

  it('fails closed without inventing Mapper or Engine science', () => {
    expect(sql).toContain("'UNKNOWN_REQUIRES_EVIDENCE'");
    expect(sql).toContain("array['behavior_classification_required']");
    expect(sql).not.toMatch(/insert\s+into\s+public\.mapper_basement/i);
    expect(sql).not.toMatch(/update\s+public\.mapper_basement/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.mapper_basement/i);
  });

  it('preserves PI Base relationships while commercial overlays have one owner table', () => {
    expect(sql).toContain('global_catalog_favorites_pi_base_own');
    expect(sql).toContain('global_catalog_recent_pi_base_own');
    expect(sql).toContain("entity_kind='pi_base'");
    expect(sql).not.toContain('revoke insert,update,delete on public.global_catalog_favorites,public.global_catalog_recent_usage');
  });

  it('never promotes OCR to GREEN without an exact server attestation', () => {
    expect(sql).toContain('from public.global_catalog_server_ocr_attestations a');
    expect(sql).toContain("a.actor_user_id=p_actor_user_id and s.user_id=p_actor_user_id");
    expect(sql).toContain("a.overall_confidence>=85");
    expect(sql).toContain("i.state='ready'");
    expect(sql).toContain("if v_attested then");
    expect(sql).toContain("v_status:='verified'");
    expect(sql).toContain("v_method:='automatic'");
  });

  it('orders 10300 before a canonical-only 10400 classifier', () => {
    expect(sql).toContain('create table public.product_versions');
    expect(sql).toContain('create table public.product_behavior_bindings');
    expect(classifierSql).toContain('public.product_versions');
    expect(classifierSql).toContain('public.product_behavior_bindings');
    expect(classifierSql).not.toMatch(/(?:insert\s+into|update|delete\s+from|trigger[^;]*on)\s+public\.global_catalog_products\b/i);
    expect(classifierSql).not.toMatch(/(?:insert\s+into|update|delete\s+from|trigger[^;]*on)\s+public\.global_catalog_product_versions\b/i);
    expect(classifierSql).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.catalog_product_behavior_bindings\b/i);
    expect(classifierSql).not.toContain('public.global_catalog_engine_mappings');
  });
});
