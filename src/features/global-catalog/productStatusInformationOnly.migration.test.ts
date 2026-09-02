import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const file = join(
  process.cwd(),
  'supabase/migrations/20260815152000_product_status_information_only.sql',
);
const sql = readFileSync(file, 'utf8');

describe('product status information-only forward repair', () => {
  it('is forward-only and never mutates or promotes the immutable Mapper source', () => {
    expect(sql).toContain('20260815152000_product_status_information_only.sql'.replace(/^.*$/, 'product-status-information-only-v1'));
    expect(sql).toContain('mapper_status_information_guard');
    expect(sql).toContain('catalog_mapping_information_guard');
    expect(sql).toContain('status_fingerprint');
    expect(sql).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.mapper_basement/i);
    expect(sql).not.toMatch(/set\s+verification_status/i);
    expect(sql).toContain('v_guard.row_count<>2088');
    expect(sql).toContain('approved_for_base baseline drifted');
    expect(sql).toContain('approved_for_engines baseline drifted');
    expect(sql).toContain('pre-repair provenance-gated baseline drifted');
    expect(sql).toContain('existing exact catalog Mapper binding was lost or transferred');
    expect(sql).toContain('evidence-backed catalog Mapper binding was not restored exactly');
    expect(sql).toContain('commercial Mapper binding crossed family or form authority');
    expect(sql).toContain("b.form_id is distinct from mb.form_id");
    expect(sql).toContain("strpos(v_patched,'and m.is_active and m.approved_for_base and m.approved_for_engines')>0");
  });

  it('separates search, Base selection, Engine calculation and provenance', () => {
    expect(sql).toContain("then ''mapper_estimated''");
    expect(sql).toContain("then ''mapper_needs_label_review''");
    expect(sql).toContain("''approvedForEngines'',m.approved_for_engines");
    expect(sql).toContain('m.is_active and m.approved_for_base');
    expect(sql).toContain('v_engine_allowed boolean := false');
    expect(sql).toContain('v_engine_allowed := v_base_allowed');
    expect(sql).toContain('or b.mapper_ingredient_id is not null');
    expect(sql).toContain('v_base := not v_explicit_rejection and v_mapping is not null and exists');
    expect(sql).toContain("''OPTIMAL'',case when v_engine_allowed");
    expect(sql).toContain("''ECO'',case when v_engine_allowed");
    expect(sql).not.toContain('when false then null');
    expect(sql).toContain("strpos(v_patched,'Wymaga weryfikacji Mapper')>0");
    expect(sql).toContain("coalesce(p.status,'''')<>''rejected'' and m.ingredient_id is not null");
    expect(sql).toContain("strpos(v_patched,'p.canonical_verification_status<>''blocked'' and m.ingredient_id is not null')>0");
    expect(sql).toContain("strpos(v_patched,'m.approved_for_base and m.approved_for_engines')>0");
    expect(sql).toContain("v_topping_allowed := not v_explicit_rejection and v_scope=''POST_PROCESS_ADDON''");
    expect(sql).toContain("''SEARCH'',case when v_mapping is not null or v_status<>''blocked''");
    expect(sql).toContain("''SAVE'',case when (v_engine_allowed or v_topping_allowed)");
    expect(sql).toContain("''module_not_eligible:''");
    expect(sql).toContain("''profile_not_approved:''");
    expect(sql).toContain("''main_policy_not_approved:''");
    expect(sql).toContain("''module_permission_missing:''");
    expect(sql).toContain("strpos(v_patched,'case when v_allowed then ''{}''::text[] else array[''context_not_approved''] end')>0");
    for (const module of ['COST', 'LABEL', 'NUTRITION', 'ALLERGENS', 'MASTER_LABEL', 'EXPORT']) {
      expect(sql).toContain(`''${module}'',case when (v_mapping is not null or v_status<>''blocked'')`);
    }
  });

  it('keeps explicit lifecycle rejection as a real block while status provenance stays informational', () => {
    expect(sql).toContain("coalesce(v_product.status,'''')=''rejected'' or exists");
    expect(sql).toContain("coalesce(v_product_lifecycle_status,'''')=''rejected''");
    expect(sql).toContain("''product_rejected''=any(coalesce(rejection_binding.block_reasons");
    expect(sql).toContain("v_base := not v_explicit_rejection");
    expect(sql).toContain("v_topping := not v_explicit_rejection");
    expect(sql).toContain("case when v_explicit_rejection then ''blocked'' else ''ready'' end");
    expect(sql).toContain("and coalesce(p.status,'')<>'rejected'");
    expect(sql).toContain('explicit product rejection was reactivated');
    expect(sql).toContain("''product_rejected:''");
  });

  it('propagates exact resolver blockers and removes legacy generic fallbacks', () => {
    expect(sql).toContain('do $patch_recipe_validator$');
    expect(sql).toContain("jsonb_array_elements_text(coalesce(v_resolved->''blockReasons''");
    expect(sql).toContain("''behavior_binding_missing:''");
    expect(sql).toContain("''classification_pending:''");
    expect(sql).toContain("''classification_failed:''");
    expect(sql).toContain("''approved_for_base_false:''||coalesce(v_product_id::text,p_entity_id)");
    expect(sql).toContain("''missing_technical_fields:''||array_to_string(v_missing_technical_fields");
    expect(sql).toContain("strpos(v_patched,'v_reasons := array_append(v_reasons,''requested_module_not_eligible'')')>0");
    expect(sql).toContain("array_remove(array_remove(coalesce(v_blocks");
  });

  it('aligns database Save/Restore/Production authority with Owner Review and optional-zero facts', () => {
    expect(sql).toContain('do $patch_recipe_terminal_authority$');
    expect(sql).toContain('create table if not exists public.owner_review_recipe_authorities');
    expect(sql).toContain("revoke all on table public.owner_review_recipe_authorities from public,anon,authenticated");
    expect(sql).toContain("or not exists(select 1 from public.admin_users a");
    expect(sql).toContain('Owner Review technical Main lines do not match server authority');
    expect(sql).toContain('v_technical_main_ids ? v_line_id');
    expect(sql).toContain("v_pair.fact_key in (''sucrose'',''glucose'',''dextrose'',''fructose'',''lactose'',''polyols'',''fibre'',''alcohol'',''energyKcal'')");
    expect(sql).toContain('owner review recipe is explicitly blocked for Production');
    expect(sql).toContain('do $patch_legacy_recipe_resolver$');
    expect(sql).toContain("coalesce(p.status,'''')<>''rejected''");
    expect(sql).toContain("legacy_product_reference_unresolved:''");
  });

  it('does not expose private product identity while recovering a missing binding', () => {
    expect(sql).toContain("p.visibility=''shared'' or p.owning_account_id=auth.uid()");
    expect(sql).toContain('or p.owner_user_id=auth.uid() or p.created_by=auth.uid()');
    expect(sql).toContain("p.product_kind=''mapper_reference'' and p.visibility=''shared''");
  });

  it('keeps process evidence separate from technical Main and preserves exact provenance', () => {
    expect(sql).toContain('mapperVerificationStatus');
    expect(sql).toContain("not v_policy_ambiguous then ''eligible''");
    expect(sql).toContain("strpos(v_patched,'and v_policy.id is not null and not v_policy_ambiguous and v_has_process')>0");
    expect(sql).toContain("when v_module in (''PROCESS'',''PRODUCTION'') and v_scope=''BASE_FORMULATION'' and not v_has_process");
    expect(sql).toContain("''PRODUCTION'',case when (v_topping_allowed or (v_engine_allowed and v_has_process))");
    expect(sql).toContain("''PROCESS'',case when (v_engine_allowed or v_topping_allowed) and v_has_process");
    expect(sql).toContain("strpos(v_patched,'v_topping_allowed := v_status<>''blocked''')>0");
    expect(sql).toContain("strpos(v_patched,'''SAVE'',case when v_status<>''blocked''')>0");
    expect(sql).toContain("strpos(v_patched,'''PRODUCTION'',case when v_status<>''blocked''')>0");
    expect(sql).toContain('recommendedDose');
  });

  it('reclassifies all exact Mapper and catalog identities without cross-form inference', () => {
    expect(sql).toContain("classify_mapper_product_behavior_v2(v_id,'product-status-information-only-v1')");
    expect(sql).toContain("e.evidence_kind='admin_mapper_decision'");
    expect(sql).toContain("e.evidence#>>'{mapperDecision,mapperIngredientId}'=p.matched_basement_id");
    expect(sql).toContain("'product-behavior:catalog_product_version:'||v_row.current_version_id::text");
    expect(sql).toContain('b.mapper_ingredient_id<>m.ingredient_id');
    const restorable = (priorForm: string | null, mapperForm: string): boolean =>
      priorForm === null || priorForm === mapperForm;
    expect(restorable('fresh', 'fresh')).toBe(true);
    for (const crossForm of ['juice', 'powder', 'alcohol_liqueur', 'energy_drink']) {
      expect(restorable('fresh', crossForm)).toBe(false);
    }
  });

  it('asserts the exact post-repair 2088/2075/2074 runtime contract in-transaction', () => {
    expect(sql).toContain('post-repair searchable Mapper count drifted');
    expect(sql).toContain('post-repair Base-selectable Mapper count drifted');
    expect(sql).toContain('post-repair PI-calculable Mapper count drifted');
    expect(sql).toContain('if v_searchable<>2088');
    expect(sql).toContain('if v_selectable<>2075');
    expect(sql).toContain('if v_pi_calculable<>2074');
  });

  it('publishes an authenticated public-safe 2088 audit surface', () => {
    expect(sql).toContain('create or replace function public.audit_mapper_runtime_usability_v1()');
    expect(sql).toContain("if auth.uid() is null then raise exception 'authentication required'");
    expect(sql).toContain('grant execute on function public.audit_mapper_runtime_usability_v1() to authenticated,service_role');
    for (const field of [
      'product_version_id', 'binding_id', 'verification_status', 'source_confidence',
      'missing_technical_fields', 'process_status', 'behavior_state', 'main_policy_status',
      'binding_status', 'selectable_base', 'pi_calculable',
    ]) expect(sql).toContain(field);
    expect(sql).toContain('m.approved_for_base and m.approved_for_engines');
    expect(sql).toContain('m.water_percent>=0');
    expect(sql).toContain('m.pac_value>=0');
  });
});
