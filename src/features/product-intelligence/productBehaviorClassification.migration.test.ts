import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const migrationPath = path.join(
  ROOT,
  'supabase/migrations/20260813110400_product_behavior_classification_queue.sql',
);
const auditPath = path.join(ROOT, 'reports/MAPPER_2088_PRODUCT_BEHAVIOR_AUDIT.csv');
const migration = fs.readFileSync(migrationPath, 'utf8');

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"'; index += 1;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((char === '\r' || char === '\n') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field); field = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += char;
  }
  const [headers, ...data] = rows;
  return data.map((values) => Object.fromEntries(headers!.map((header, index) => [header, values[index] ?? ''])));
}

describe('product behavior classification v2 migration', () => {
  it('separates ordinary behavior role from Main policy coverage', () => {
    expect(migration).toContain('add column if not exists behavior_role text');
    expect(migration).toContain('add column if not exists main_policy_status text');
    expect(migration).toContain("'STRUCTURAL_ONLY'");
    expect(migration).toContain("'UNKNOWN_REQUIRES_EVIDENCE'");
    expect(migration).toContain("'BLOCKED_DATA','BLOCKED_SCIENCE'");
  });

  it('routes unchanged owner dairy evidence through the live milk_gelato profile', () => {
    for (const policy of [
      'main-fruit-fresh-dairy',
      'main-fruit-puree-dairy',
      'main-berry-fresh-dairy',
      'main-berry-puree-dairy',
      'main-kiwi-fresh-dairy',
      'main-banana-fresh-dairy',
      'main-pure-nut-paste-dairy',
    ]) {
      expect(migration).toMatch(new RegExp(`'${policy}',2[^\\n]*'milk_gelato'`));
    }
    expect(migration).toContain("25,35,45,1,true,30,'owner_provisional','OWNER_PROVISIONAL'");
    expect(migration).toContain("10,15,20,1,true,30,'owner_provisional','OWNER_PROVISIONAL'");
    expect(migration).toContain("10,20,30,1,true,30,'owner_provisional','OWNER_PROVISIONAL'");
    expect(migration).toContain("8,15,15,1,true,30,'owner_provisional','OWNER_PROVISIONAL'");
  });

  it('adds only exact accepted Sorbet/Vegan fixture policies and keeps Protein sensory science blocked', () => {
    for (const policy of [
      'main-sorbet-strawberry-fresh-1553',
      'main-sorbet-lime-fresh-0369',
      'main-sorbet-mango-puree-0340',
      'main-vegan-strawberry-fresh-1553',
      'main-vegan-banana-puree-1589',
      'main-vegan-pistachio-paste-0614',
      'main-vegan-cocoa-powder-1578',
    ]) expect(migration).toContain(`'${policy}'`);
    expect(migration).toContain("'PI-ING-001553','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',60,60,60");
    expect(migration).toContain("'PI-ING-000614','MAIN_PROFILE_SPECIFIC','NUT_EQUIVALENT',11.99,11.99,11.99");
    expect(migration).toContain("'PI-ING-001578','MAIN_PROFILE_SPECIFIC','COCOA_SOLIDS_EQUIVALENT',5.96,5.96,5.96");
    expect(migration).toContain('Protein flavour fixtures intentionally remain BLOCKED_SCIENCE');
    expect(migration).not.toMatch(/'protein_gelato'[^\n]*'PINGUINO_CALIBRATED'/);
  });

  it('uses exact deterministic policy precedence and rejects an ambiguous best match', () => {
    const resolver = migration.slice(migration.indexOf('create or replace function public.resolve_product_behavior_v1'));
    expect(resolver).toContain('when p.exact_catalog_product_version_id is not null then 500');
    expect(resolver).toContain('when p.exact_mapper_ingredient_id is not null then 400');
    expect(resolver).toContain('when p.subfamily_id is not null and p.form_id is not null then 300');
    expect(resolver).toContain('when p.family_id is not null and p.subfamily_id is null and p.form_id is not null then 200');
    expect(resolver).toContain("array['ambiguous_main_policy']");
    expect(resolver).toContain('and not v_policy_ambiguous');
  });

  it('provides a service-only resumable idempotent queue and atomic current publication', () => {
    expect(migration).toContain('create table if not exists public.product_behavior_reclassification_queue');
    expect(migration).toContain("status in ('pending','running','succeeded','failed')");
    expect(migration).toContain('attempt_count integer not null default 0');
    expect(migration).toContain('idempotency_key text not null unique');
    expect(migration).toContain('for update skip locked');
    expect(migration).toContain('where q.status in (\'pending\',\'failed\') and q.attempt_count<q.max_attempts');
    expect(migration).toContain('set is_current=false');
    expect(migration).toContain('set is_current=true where id=v_binding');
    expect(migration).toContain('revoke all on public.product_behavior_reclassification_queue from public,anon,authenticated');
  });

  it('enqueues taxonomy, policy, mapping, product and immutable version changes', () => {
    for (const trigger of [
      'product_behavior_policy_reclassify_v1',
      'product_taxonomy_node_reclassify_v1',
      'product_taxonomy_alias_reclassify_v1',
      'product_version_reclassify_v2',
      'canonical_product_mapping_reclassify_v2',
      'product_reclassify_v2',
    ]) expect(migration).toContain(trigger);
  });

  it('writes canonical product behavior only and leaves compatibility views read-only', () => {
    expect(migration).toContain('insert into public.product_behavior_bindings');
    expect(migration).toContain('from public.product_versions');
    expect(migration).toContain('update public.products set current_behavior_binding_id=v_binding');
    expect(migration).toContain("perform set_config('app.canonical_product_ingest','v1',true)");
    expect(migration).not.toMatch(/insert into public\.catalog_product_behavior_bindings/i);
    expect(migration).not.toMatch(/insert into public\.global_catalog_product_versions/i);
    expect(migration).not.toMatch(/insert into public\.global_catalog_products/i);
  });

  it('returns immutable shared facts separately from the authenticated private overlay', () => {
    const resolver = migration.slice(migration.indexOf('create or replace function public.resolve_product_behavior_v1'));
    expect(resolver).toContain("'sharedFacts',v_shared_facts");
    expect(resolver).toContain("'privateOverlay',v_private_overlay");
    expect(resolver).toContain('from public.user_product_relations r');
    expect(resolver).toContain('where r.user_id=auth.uid() and r.product_id=v_product_id');
    expect(resolver).toContain("'technicalComposition'");
    expect(resolver).toContain("'nutritionPer100g'");
    expect(resolver).toContain("'processEvidence'");
    expect(resolver).toContain("'profileEligibility'");
    expect(resolver).toContain("'referencePrice'");
    expect(resolver).toContain('into v_mapper_composition');
    expect(resolver).toContain("and m.approved_for_base and m.approved_for_engines");
    expect(resolver).toContain("'technicalComposition',v_mapper_composition");
    expect(resolver).not.toContain("then v_public_facts->'technicalComposition'");
  });

  it('returns the complete downstream module matrix and derives state from the requested module', () => {
    const resolver = migration.slice(migration.indexOf('create or replace function public.resolve_product_behavior_v1'));
    for (const module of [
      'ALLERGENS', 'PROCESS', 'SUMMARY', 'BATCH_RESCUE', 'MASTER_LABEL',
      'RECIPE_VERSION', 'RESTORE', 'EXPORT',
    ]) expect(resolver).toContain(`'${module}'`);
    expect(resolver).toContain("v_allowed := coalesce(v_module_eligibility->>v_module,'blocked') in ('eligible','label_only')");
    expect(resolver).toContain("'moduleEligibility',v_module_eligibility");
  });

  it('resolves only current canonical versions/bindings and active exact Mapper references', () => {
    const resolver = migration.slice(migration.indexOf('create or replace function public.resolve_product_behavior_v1'));
    expect(resolver).toContain('where b.product_version_id=v_version_id and b.is_current');
    expect(resolver).toContain('and p.current_version_id=v_version_id');
    expect(resolver).toContain("where p.product_kind='mapper_reference'");
    expect(resolver).toContain("and p.normalized_identity='mapper:'||p_entity_id");
    expect(resolver).toContain('join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id');
    expect(resolver).toContain('and m.is_active and m.approved_for_base');
  });

  it('atomically mirrors every Mapper classification into its canonical reference binding', () => {
    const classifier = migration.slice(
      migration.indexOf('create or replace function public.classify_mapper_product_behavior_v2'),
      migration.indexOf('create or replace function public.classify_catalog_product_behavior_v2'),
    );
    expect(classifier).toContain("p.product_kind='mapper_reference'");
    expect(classifier).toContain("p.normalized_identity='mapper:'||v_mapper.ingredient_id");
    expect(classifier).toContain('insert into public.product_behavior_bindings');
    expect(classifier).toContain('set is_current=false');
    expect(classifier).toContain('set is_current=true where id=v_canonical_binding');
    expect(classifier).toContain('set current_behavior_binding_id=v_canonical_binding');
    expect(migration).toContain("raise exception 'canonical Mapper reference behavior backfill is incomplete'");
  });

  it('provides an authenticated server gate for stale or forged recipe snapshots', () => {
    const validator = migration.slice(migration.indexOf('create or replace function public.validate_recipe_behavior_v1'));
    expect(validator).toContain('p_lines jsonb');
    expect(validator).toContain('p_context jsonb');
    expect(validator).toContain("if auth.uid() is null then raise exception 'authentication required'");
    expect(validator).toContain('v_resolved := public.resolve_product_behavior_v1');
    for (const reason of [
      'product_identity_stale', 'product_version_stale', 'behavior_binding_stale',
      'behavior_binding_version_stale', 'facts_fingerprint_stale', 'taxonomy_version_stale',
      'mapper_mapping_stale', 'main_policy_stale', 'requested_module_not_eligible',
      'classification_pending', 'classification_failed',
    ]) expect(validator).toContain(`'${reason}'`);
    expect(validator).toContain("'staleLineIds',v_stale_ids");
    expect(validator).toContain('to authenticated,service_role');
  });

  it('fails closed while a replacement classification is pending or has failed', () => {
    const resolver = migration.slice(migration.indexOf('create or replace function public.resolve_product_behavior_v1'));
    expect(resolver).toContain("(q.status in ('pending','running') or q.status='failed')");
    expect(resolver).toContain('q.source_fingerprint=public.product_behavior_entity_fingerprint_v1');
    expect(resolver).toContain("then 'classification_failed' else 'classification_pending' end");
    expect(resolver).toContain("'state','blocked'");
  });
});

describe('exhaustive Mapper behavior audit', () => {
  const rows = parseCsv(fs.readFileSync(auditPath, 'utf8'));

  it('contains exactly 2,088 uniquely classified Mapper rows', () => {
    expect(rows).toHaveLength(2088);
    expect(new Set(rows.map((row) => row.ingredient_id)).size).toBe(2088);
    for (const row of rows) {
      expect(row.behavior_role).not.toBe('');
      expect(row.main_policy_status).not.toBe('');
      expect(row.profile_applicability).not.toBe('');
    }
  });

  it('gives every unknown automatic-Main candidate an exact evidence reason', () => {
    const unknowns = rows.filter((row) => row.behavior_role === 'UNKNOWN_REQUIRES_EVIDENCE');
    expect(unknowns.length).toBeGreaterThan(0);
    expect(unknowns.every((row) => row.exact_reason_codes !== 'NONE')).toBe(true);
    expect(unknowns.every((row) =>
      row.main_policy_status === 'BLOCKED_DATA' || row.main_policy_status === 'BLOCKED_SCIENCE',
    )).toBe(true);
  });

  it('keeps exact owner fixtures covered and classifies technical products without flavour science', () => {
    const byId = new Map(rows.map((row) => [row.ingredient_id, row]));
    for (const id of [
      'PI-ING-001553', 'PI-ING-000345', 'PI-ING-000366', 'PI-ING-000369',
      'PI-ING-000340', 'PI-ING-001589', 'PI-ING-000614', 'PI-ING-001578',
    ]) {
      expect(byId.get(id)).toMatchObject({
        behavior_role: 'MAIN_PROFILE_SPECIFIC',
        main_policy_status: 'COVERED',
      });
    }
    expect(byId.get('PI-ING-001553')?.profile_applicability).toBe('milk_gelato;sorbet;vegan_gelato');
    expect(byId.get('PI-ING-000369')?.profile_applicability).toBe('sorbet');
    expect(byId.get('PI-ING-000614')?.profile_applicability).toBe('vegan_gelato');
    expect(byId.get('PI-ING-000614')?.exact_reason_codes)
      .toContain('protein_flavour_envelope_not_sensory_calibrated');
    expect(rows.filter((row) => row.ingredient_category === 'stabilizer')
      .every((row) => row.behavior_role === 'STRUCTURAL_ONLY')).toBe(true);
    expect(rows.filter((row) => row.ingredient_category === 'protein')
      .every((row) => row.behavior_role === 'PROTEIN_CONTRIBUTOR_ONLY')).toBe(true);
  });
});
