import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813110500_product_behavior_current_version_enqueue.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const diagnostics = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813110600_product_behavior_fingerprint_diagnostics.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const visibility = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813110700_product_behavior_fingerprint_visibility.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const policyAndRetention = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813110800_product_relation_policy_and_actor_retention.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const actorAnonymization = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813110900_canonical_product_actor_anonymization.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const evidenceAnonymization = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813111000_product_evidence_actor_anonymization.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const ingestActorAnonymization = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813111100_product_ingest_actor_anonymization.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const deleteDiagnostic = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260813111200_account_delete_diagnostic.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const genericWriteGuard = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813111300_generic_write_guard_anonymization.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const writeGuardDiagnostics = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813111400_canonical_write_guard_diagnostics.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const writeGuardColumns = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813111500_canonical_write_guard_column_diagnostics.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const generatedColumns = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813111600_canonical_actor_generated_columns.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const deleteDiagnosticRemoval = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813111700_remove_account_delete_diagnostic.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const internalDeleteDiagnostic = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813111800_internal_account_delete_diagnostic.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const orphanRetirement = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813111900_retire_orphaned_private_products.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const internalDiagnosticRemoval = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813112000_remove_internal_account_delete_diagnostic.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const registryDmlRevocation = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260813112100_revoke_client_policy_taxonomy_dml.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');

describe('current-version behavior enqueue hotfix', () => {
  it('waits for the canonical current-version pointer before fingerprinting', () => {
    expect(sql).toContain(
      'create or replace function public.enqueue_catalog_product_behavior_entity_change_v1()',
    );
    expect(sql).toContain('join public.products p on p.id=v.product_id');
    expect(sql).toContain('and p.current_version_id=v.id');
    expect(sql).toContain('and p.is_active');
    expect(sql).toContain('and p.merged_into_product_id is null');
    expect(sql.indexOf('and p.current_version_id=v.id')).toBeLessThan(
      sql.indexOf('perform public.enqueue_product_behavior_reclassification_v1('),
    );
  });

  it('keeps fingerprints fail-closed with fact-free invariant diagnostics', () => {
    expect(diagnostics).toContain(
      'create or replace function public.product_behavior_entity_fingerprint_v1(',
    );
    expect(diagnostics).toContain("p_entity_kind='catalog_product_version'");
    expect(diagnostics).toContain('v_version_exists,v_product_exists,v_is_current');
    expect(diagnostics).toContain('classification entity not found (kind=%, id=%, version=%, product=%, current=%)');
    expect(diagnostics).toContain('public.product_behavior_authority_fingerprint_v1()');
  });

  it('uses a fresh command snapshot while ingest creates and classifies one version', () => {
    expect(visibility).toContain(
      'alter function public.product_behavior_entity_fingerprint_v1(text,text) volatile',
    );
    expect(visibility).not.toContain(' stable');
  });

  it('lets RLS evaluate its narrow helper and anonymizes actors on account deletion', () => {
    expect(policyAndRetention).toContain(
      'grant execute on function public.can_use_product_relation_v1(uuid,uuid)',
    );
    expect(policyAndRetention).toContain('alter column actor_user_id drop not null');
    expect(policyAndRetention).toContain(
      'foreign key(actor_user_id) references auth.users(id) on delete set null',
    );
  });

  it('preserves product history while allowing only FK actor anonymization outside ingest', () => {
    expect(actorAnonymization).toContain(
      'foreign key(owner_user_id) references auth.users(id) on delete set null',
    );
    expect(actorAnonymization).toContain(
      "to_jsonb(new)-array['owner_user_id','created_by','owning_account_id','updated_at']",
    );
    expect(actorAnonymization).toContain('new.created_by is null');
    expect(actorAnonymization).toContain(
      "raise exception 'canonical product writes require ingest_product_v1'",
    );
  });

  it('anonymizes only the evidence owner while retaining immutable evidence bytes', () => {
    expect(evidenceAnonymization).toContain("tg_table_name='product_evidence'");
    expect(evidenceAnonymization).toContain(
      "(to_jsonb(new)-'owner_user_id')=(to_jsonb(old)-'owner_user_id')",
    );
    expect(evidenceAnonymization).toContain(
      "raise exception 'canonical product history is immutable and ingest-owned'",
    );
  });

  it('anonymizes only the ingest-event actor while retaining the audit record', () => {
    expect(ingestActorAnonymization).toContain(
      "tg_table_name='product_ingest_events'",
    );
    expect(ingestActorAnonymization).toContain('new.actor_user_id is null');
    expect(ingestActorAnonymization).toContain(
      "(to_jsonb(new)-'actor_user_id')=(to_jsonb(old)-'actor_user_id')",
    );
  });

  it('keeps the temporary account-delete diagnostic service-only and rollback-bound', () => {
    expect(deleteDiagnostic).toContain('delete from auth.users where id=p_user_id');
    expect(deleteDiagnostic).toContain("raise exception 'diagnostic_delete_would_succeed'");
    expect(deleteDiagnostic).toContain('get stacked diagnostics');
    expect(deleteDiagnostic).toContain(
      'revoke all on function public.diagnose_account_delete_v1(uuid) from public,anon,authenticated',
    );
  });

  it('uses table-shape-safe JSONB comparisons in the generic write guard', () => {
    expect(genericWriteGuard).toContain('v_new:=to_jsonb(new)');
    expect(genericWriteGuard).toContain('v_old:=to_jsonb(old)');
    expect(genericWriteGuard).toContain("v_new->'actor_user_id'='null'::jsonb");
    expect(genericWriteGuard).not.toMatch(/new\.actor_user_id|new\.owner_user_id/);
  });

  it('reports fact-free trigger coordinates for any remaining denied system write', () => {
    expect(writeGuardDiagnostics).toContain(
      'canonical product writes require ingest_product_v1 (table=%, op=%)',
    );
    expect(writeGuardDiagnostics).toContain('tg_table_name,tg_op');
  });

  it('diagnoses denied writes by column name without including values', () => {
    expect(writeGuardColumns).toContain('from jsonb_each(v_new) e');
    expect(writeGuardColumns).toContain('columns=%');
    expect(writeGuardColumns).not.toContain('e.value::text');
  });

  it('permits only database-generated identity columns beside actor anonymization', () => {
    expect(generatedColumns).toContain("'ean_code_normalized','barcode_normalized'");
    expect(generatedColumns).toContain("v_new->'created_by'='null'::jsonb");
    expect(generatedColumns).toContain('columns=%');
  });

  it('removes the bounded account-delete diagnostic after staging proof', () => {
    expect(deleteDiagnosticRemoval).toContain(
      'drop function if exists public.diagnose_account_delete_v1(uuid)',
    );
  });

  it('keeps the internal-product account diagnostic rollback-bound and service-only', () => {
    expect(internalDeleteDiagnostic).toContain('delete from auth.users where id=p_user_id');
    expect(internalDeleteDiagnostic).toContain(
      "raise exception 'diagnostic_delete_would_succeed'",
    );
    expect(internalDeleteDiagnostic).toContain('to service_role');
  });

  it('soft-retires private products when their owning account is anonymized', () => {
    expect(orphanRetirement).toContain(
      "visibility='account_private' and (owning_account_id is not null or not is_active)",
    );
    expect(orphanRetirement).toContain("new.is_active:=false");
    expect(orphanRetirement).toContain(
      "v_new->'owning_account_id'='null'::jsonb",
    );
  });

  it('removes the internal-product deletion diagnostic after proof', () => {
    expect(internalDiagnosticRemoval).toContain(
      'drop function if exists public.diagnose_internal_account_delete_v1(uuid)',
    );
  });

  it('prevents zero-row customer DML from firing full registry reclassification', () => {
    expect(registryDmlRevocation).toContain('revoke insert,update,delete on table');
    for (const table of [
      'product_taxonomy_versions',
      'product_taxonomy_nodes',
      'product_taxonomy_aliases',
      'product_behavior_policy_versions',
    ]) {
      expect(registryDmlRevocation).toContain(`public.${table}`);
    }
    expect(registryDmlRevocation).toContain('from public,anon,authenticated');
    expect(registryDmlRevocation).toContain('to authenticated');
  });
});
