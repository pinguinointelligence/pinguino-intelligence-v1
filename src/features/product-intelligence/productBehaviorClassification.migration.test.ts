import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const migrationPath = path.join(
  ROOT,
  'supabase/migrations/20260813110400_product_behavior_classification_queue.sql',
);
const auditPath = path.join(ROOT, 'reports/MAPPER_2089_PRODUCT_BEHAVIOR_AUDIT.csv');
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
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\r' || char === '\n') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += char;
  }
  const [headers, ...data] = rows;
  return data.map((values) =>
    Object.fromEntries(headers!.map((header, index) => [header, values[index] ?? ''])),
  );
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

  it('adds exact accepted Sorbet, Vegan and Protein fixture policies without family-wide invention', () => {
    for (const policy of [
      'main-sorbet-strawberry-fresh-1553',
      'main-sorbet-lime-fresh-0369',
      'main-sorbet-mango-puree-0340',
      'main-vegan-strawberry-fresh-1553',
      'main-vegan-banana-puree-1589',
      'main-vegan-pistachio-paste-0614',
      'main-vegan-cocoa-powder-1578',
    ])
      expect(migration).toContain(`'${policy}'`);
    expect(migration).toContain(
      "'PI-ING-001553','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',60,60,60",
    );
    expect(migration).toContain(
      "'PI-ING-000614','MAIN_PROFILE_SPECIFIC','NUT_EQUIVALENT',12,26.6,26.6",
    );
    expect(migration).toContain(
      "'PI-ING-001578','MAIN_PROFILE_SPECIFIC','COCOA_SOLIDS_EQUIVALENT',6,24,24",
    );
    for (const policy of [
      'main-protein-strawberry-1553',
      'main-protein-banana-0345',
      'main-protein-vanilla-0246',
      'main-protein-coffee-input-0166',
      'main-protein-cocoa-1578',
      'main-protein-pistachio-0614',
    ])
      expect(migration).toContain(`'${policy}'`);
    expect(migration).toContain('"multiMainGroupKey":"main-protein-fruit-combination-v2"');
    expect(migration).toContain('"retainedMass":"not_inferred"');
    expect(migration).toContain(
      "'PI-ING-001553','MAIN_PROFILE_SPECIFIC','FRUIT_EQUIVALENT',10,49.5,49.5",
    );
    expect(migration).toContain(
      "'PI-ING-000246','MAIN_PROFILE_SPECIFIC','PERCENT_OF_BASE',0.5,4.9,4.9",
    );
  });

  it('does not turn minimum-only manufacturer evidence into an invented ceiling or hard limit', () => {
    expect(migration).not.toContain("'main-exact-hazelnut-paste-0431-milk'");
    expect(migration).not.toContain("'main-exact-coffee-paste-0245-milk'");
    expect(migration).toContain('Minimum-only Hazelnut/Coffee references remain review evidence');
  });

  it('uses exact deterministic policy precedence and rejects an ambiguous best match', () => {
    const resolver = migration.slice(
      migration.indexOf('create or replace function public.resolve_product_behavior_v1'),
    );
    expect(resolver).toContain('when p.exact_catalog_product_version_id is not null then 500');
    expect(resolver).toContain('when p.exact_mapper_ingredient_id is not null then 400');
    expect(resolver).toContain(
      'when p.subfamily_id is not null and p.form_id is not null then 300',
    );
    expect(resolver).toContain(
      'when p.family_id is not null and p.subfamily_id is null and p.form_id is not null then 200',
    );
    expect(resolver).toContain("array['ambiguous_main_policy']");
    expect(resolver).toContain('and not v_policy_ambiguous');
  });

  it('provides a service-only resumable idempotent queue and atomic current publication', () => {
    expect(migration).toContain(
      'create table if not exists public.product_behavior_reclassification_queue',
    );
    expect(migration).toContain("status in ('pending','running','succeeded','failed')");
    expect(migration).toContain('attempt_count integer not null default 0');
    expect(migration).toContain('idempotency_key text not null unique');
    expect(migration).toContain('for update skip locked');
    expect(migration).toContain(
      "where q.status in ('pending','failed') and q.attempt_count<q.max_attempts",
    );
    expect(migration).toContain('set is_current=false');
    expect(migration).toContain('set is_current=true where id=v_binding');
    expect(migration).toContain(
      'revoke all on public.product_behavior_reclassification_queue from public,anon,authenticated',
    );
  });

  it('enqueues taxonomy, policy, mapping, product and immutable version changes', () => {
    for (const trigger of [
      'product_behavior_policy_reclassify_v1',
      'product_taxonomy_node_reclassify_v1',
      'product_taxonomy_alias_reclassify_v1',
      'product_version_reclassify_v2',
      'canonical_product_mapping_reclassify_v2',
      'product_reclassify_v2',
      'mapper_basement_behavior_reclassify_v2',
      'mapper_process_behavior_reclassify_v2',
    ])
      expect(migration).toContain(trigger);
    expect(migration).toContain('cron.schedule(');
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
    const resolver = migration.slice(
      migration.indexOf('create or replace function public.resolve_product_behavior_v1'),
    );
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
    expect(resolver).toContain('v_mapper_reference_price');
    expect(resolver).toContain('else v_mapper_reference_price');
    expect(resolver).toContain('and m.approved_for_base and m.approved_for_engines');
    expect(resolver).toContain("'technicalComposition',v_mapper_composition");
    expect(resolver).not.toContain("then v_public_facts->'technicalComposition'");
  });

  it('returns the complete downstream module matrix and derives state from the requested module', () => {
    const resolver = migration.slice(
      migration.indexOf('create or replace function public.resolve_product_behavior_v1'),
    );
    for (const module of [
      'ALLERGENS',
      'PROCESS',
      'SUMMARY',
      'BATCH_RESCUE',
      'MASTER_LABEL',
      'RECIPE_VERSION',
      'RESTORE',
      'EXPORT',
    ])
      expect(resolver).toContain(`'${module}'`);
    expect(resolver).toContain(
      "v_allowed := coalesce(v_module_eligibility->>v_module,'blocked') in ('eligible','label_only')",
    );
    expect(resolver).toContain("'moduleEligibility',v_module_eligibility");
  });

  it('binds the accepted Vegan Strawberry/Banana same-family Multi-Main group', () => {
    expect(migration.match(/"multiMainGroupKey":"main-vegan-fruit-combination-v2"/g)).toHaveLength(
      2,
    );
    expect(migration).toContain(
      "coalesce(nullif(v_policy.evidence->>'multiMainGroupKey',''),v_policy.policy_key)",
    );
  });

  it('publishes only the exact accepted Whisky boundary at its proven temperature', () => {
    expect(migration).toContain("'main-whisky-40-dairy-0038-minus11'");
    expect(migration).toContain("'PI-ING-000038','MAIN_PROFILE_SPECIFIC','ETHANOL_PERCENT'");
    expect(migration).toContain('"scope":"exact_mapper_identity_minus11_only"');
    expect(migration).toContain('-11,-11');
  });

  it('does not confuse natural flavour-protein content with a Protein route contributor', () => {
    expect(migration).toContain(
      "case when v_category='protein' or coalesce(v_mapper.aerating_protein_percent,0)>0",
    );
    expect(migration).toContain("then 'contributor' else 'neutral' end");
    expect(migration).not.toContain(
      "when coalesce(v_mapper.protein_percent,0)=0 then 'neutral' else 'unknown'",
    );
  });

  it('freezes the exact Mapper Engine values used by terminal recipe validation', () => {
    for (const key of ['energyKcal', 'podValue', 'pacValue', 'deValue']) {
      expect(migration).toContain(`'${key}'`);
    }
  });

  it('resolves only current canonical versions/bindings and active exact Mapper references', () => {
    const resolver = migration.slice(
      migration.indexOf('create or replace function public.resolve_product_behavior_v1'),
    );
    expect(resolver).toContain('where b.product_version_id=v_version_id and b.is_current');
    expect(resolver).toContain('and p.current_version_id=v_version_id');
    expect(resolver).toContain("where p.product_kind='mapper_reference'");
    expect(resolver).toContain("and p.normalized_identity='mapper:'||p_entity_id");
    expect(resolver).toContain(
      'join public.product_behavior_bindings b on b.id=p.current_behavior_binding_id',
    );
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
    expect(migration).toContain(
      "raise exception 'canonical Mapper reference behavior backfill is incomplete'",
    );
  });

  it('provides an authenticated server gate for stale or forged recipe snapshots', () => {
    const validator = migration.slice(
      migration.indexOf('create or replace function public.validate_recipe_behavior_v1'),
    );
    expect(validator).toContain('p_lines jsonb');
    expect(validator).toContain('p_context jsonb');
    expect(validator).toContain(
      "if auth.uid() is null then raise exception 'authentication required'",
    );
    expect(validator).toContain('v_resolved := public.resolve_product_behavior_v1');
    for (const reason of [
      'product_identity_stale',
      'product_version_stale',
      'behavior_binding_stale',
      'behavior_binding_version_stale',
      'facts_fingerprint_stale',
      'taxonomy_version_stale',
      'mapper_mapping_stale',
      'main_policy_stale',
      'requested_module_not_eligible',
      'classification_pending',
      'classification_failed',
      'private_price_stale',
    ])
      expect(validator).toContain(`'${reason}'`);
    expect(validator).toContain("'staleLineIds',v_stale_ids");
    expect(validator).toContain('to authenticated,service_role');
  });

  it('enforces exact frozen facts transactionally on recipe and Production writes', () => {
    const guard = migration.slice(
      migration.indexOf('create or replace function public.assert_recipe_behavior_authority_v1'),
      migration.indexOf(
        '-- ---------------------------------------------------------------------------',
        migration.indexOf('create or replace function public.assert_recipe_behavior_authority_v1'),
      ),
    );
    expect(guard).toContain("v_snapshot->>'resolutionState'<>'RESOLVED'");
    expect(guard).toContain("v_snapshot->>'processScope' is distinct from v_scope");
    expect(guard).toContain("('water_percent','water',false)");
    expect(guard).toContain("('de_value','deValue',true)");
    expect(guard).toContain("v_item#>'{ingredient,label_nutrition_per_100g}'");
    expect(guard).toContain("v_allergens->>'ingredientsText'");
    expect(guard).toContain("'costPerKg',case when v_snapshot->>'source'='mapper' then null");
    expect(guard).toContain('Every persisted recipe/Production line is product-managed');
    expect(guard).not.toContain('if not v_managed then continue');
    expect(guard).toContain('saved_recipe_behavior_write_guard_v1');
    expect(guard).toContain('recipe_version_behavior_write_guard_v1');
    expect(guard).toContain('production_run_behavior_write_guard_v1');
  });

  it('fails closed while a replacement classification is pending or has failed', () => {
    const resolver = migration.slice(
      migration.indexOf('create or replace function public.resolve_product_behavior_v1'),
    );
    expect(resolver).toContain("q.status in ('pending','running','failed')");
    expect(resolver).toContain(
      'q.source_fingerprint=public.product_behavior_entity_fingerprint_v1',
    );
    expect(resolver).toContain("then 'classification_failed' else 'classification_pending' end");
    expect(resolver).toContain("'state','blocked'");
  });

  it('serializes the fingerprint check and binding publish per entity', () => {
    const worker = migration.slice(
      migration.indexOf(
        'create or replace function public.process_product_behavior_reclassification_queue_v1',
      ),
      migration.indexOf('revoke all on function public.product_behavior_authority_fingerprint_v1'),
    );
    const lock = worker.indexOf("'product-behavior:'||v_job.entity_kind||':'||v_job.entity_id");
    const currentFingerprintCheck = worker.indexOf(
      'public.product_behavior_entity_fingerprint_v1(v_job.entity_kind,v_job.entity_id)',
    );
    const classifierCall = worker.indexOf('public.classify_mapper_product_behavior_v2');
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(currentFingerprintCheck);
    expect(currentFingerprintCheck).toBeLessThan(classifierCall);
  });

  it('keeps queue fingerprints independent of classifier output and resets exact retries', () => {
    const fingerprint = migration.slice(
      migration.indexOf('create or replace function public.product_behavior_entity_fingerprint_v1'),
    );
    const enqueue = migration.slice(
      migration.indexOf(
        'create or replace function public.enqueue_product_behavior_reclassification_v1',
      ),
    );
    expect(fingerprint).toContain("coalesce(b.mapper_ingredient_id,'')");
    expect(fingerprint).not.toContain("to_jsonb(b)-array['classified_at','is_current']");
    expect(enqueue).toContain('last_error_code=case');
    expect(enqueue).toContain('last_error_message=case');
    expect(enqueue).not.toContain('last_error=case');
    expect(migration).toContain("'stage','superseded'");
  });

  it('reclassifies dependent catalog versions after every Mapper publish', () => {
    const worker = migration.slice(
      migration.indexOf(
        'create or replace function public.process_product_behavior_reclassification_queue_v1',
      ),
      migration.indexOf('revoke all on function public.product_behavior_authority_fingerprint_v1'),
    );
    expect(worker).toContain("and p.product_kind<>'mapper_reference'");
    expect(worker).toContain('and b.mapper_ingredient_id=v_job.entity_id');
    expect(worker).toContain(
      "'catalog_product_version',v_catalog_version::text,'mapper_binding_published'",
    );
  });

  it('replaces the narrower legacy audit-view signatures explicitly', () => {
    expect(migration).toContain('drop view if exists public.mapper_product_behavior_audit_v1;');
    expect(migration).toContain('drop view if exists public.catalog_product_behavior_audit_v1;');
    expect(migration).toContain(
      'create or replace view public.mapper_product_behavior_audit_v1 as',
    );
    expect(migration).toContain(
      'create or replace view public.catalog_product_behavior_audit_v1 as',
    );
  });
});

describe('exhaustive Mapper behavior audit', () => {
  const rows = parseCsv(fs.readFileSync(auditPath, 'utf8'));

  it('contains exactly 2,089 uniquely classified Mapper rows', () => {
    expect(rows).toHaveLength(2089);
    expect(new Set(rows.map((row) => row.ingredient_id)).size).toBe(2089);
    for (const row of rows) {
      expect(row.behavior_role).not.toBe('');
      expect(row.main_policy_status).not.toBe('');
      expect(row.profile_applicability).not.toBe('');
      expect(row.process_reason_codes).not.toBe('');
      expect(row.process_rule_id).not.toBe('');
    }
  });

  it('exports exact immutable process evidence instead of a generic UNKNOWN bucket', () => {
    const unknowns = rows.filter((row) => row.process_mapping === 'UNKNOWN');
    expect(unknowns.length).toBeGreaterThan(0);
    expect(unknowns.every((row) => row.process_reason_codes !== '')).toBe(true);
    expect(unknowns.every((row) => row.process_rule_id !== '')).toBe(true);
    expect(new Set(unknowns.map((row) => row.process_reason_codes)).size).toBeGreaterThan(1);
  });

  it('gives every unknown automatic-Main candidate an exact evidence reason', () => {
    const unknowns = rows.filter((row) => row.behavior_role === 'UNKNOWN_REQUIRES_EVIDENCE');
    expect(unknowns.length).toBeGreaterThan(0);
    expect(unknowns.every((row) => row.exact_reason_codes !== 'NONE')).toBe(true);
    expect(
      unknowns.every(
        (row) =>
          row.main_policy_status === 'BLOCKED_DATA' || row.main_policy_status === 'BLOCKED_SCIENCE',
      ),
    ).toBe(true);
  });

  it('keeps exact owner fixtures covered and classifies technical products without flavour science', () => {
    const byId = new Map(rows.map((row) => [row.ingredient_id, row]));
    for (const id of [
      'PI-ING-001553',
      'PI-ING-000345',
      'PI-ING-000366',
      'PI-ING-000369',
      'PI-ING-000340',
      'PI-ING-001589',
      'PI-ING-000614',
      'PI-ING-001578',
      'PI-ING-000246',
      'PI-ING-000038',
    ]) {
      expect(byId.get(id)).toMatchObject({
        behavior_role: 'MAIN_PROFILE_SPECIFIC',
        main_policy_status: 'COVERED',
      });
    }
    expect(byId.get('PI-ING-001553')?.profile_applicability).toBe(
      'milk_gelato;sorbet;vegan_gelato;protein_gelato',
    );
    expect(byId.get('PI-ING-000369')?.profile_applicability).toBe('sorbet');
    expect(byId.get('PI-ING-000614')?.profile_applicability).toBe(
      'milk_gelato;vegan_gelato;protein_gelato',
    );
    expect(byId.get('PI-ING-000038')?.profile_applicability).toBe('milk_gelato@-11');
    expect(byId.get('PI-ING-000166')).toMatchObject({
      behavior_role: 'UNKNOWN_REQUIRES_EVIDENCE',
      main_policy_status: 'BLOCKED_DATA',
      main_permission: 'BLOCKED_DATA',
    });
    expect(byId.get('PI-ING-000166')?.exact_reason_codes).toContain(
      'form_or_concentration_evidence_missing',
    );
    expect(
      rows
        .filter((row) => row.ingredient_category === 'stabilizer')
        .every((row) => row.behavior_role === 'STRUCTURAL_ONLY'),
    ).toBe(true);
    expect(
      rows
        .filter((row) => row.ingredient_category === 'protein')
        .every((row) => row.behavior_role === 'PROTEIN_CONTRIBUTOR_ONLY'),
    ).toBe(true);
  });
});
