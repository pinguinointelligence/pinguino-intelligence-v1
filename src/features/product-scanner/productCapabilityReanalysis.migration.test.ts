import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260827103000_product_capability_reanalysis_requests.sql',
  ),
  'utf8',
);

const functionBody = (name: string): string => {
  const start = sql.indexOf(`create or replace function public.${name}`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const end = sql.indexOf('\nrevoke all on function', start);
  if (end < 0) throw new Error(`Missing function boundary ${name}`);
  return sql.slice(start, end).replace(/--.*$/gm, '');
};

describe('product capability reanalysis migration', () => {
  it('uses one bidirectional model with the required active-state uniqueness', () => {
    expect(sql).toContain("requested_capability in ('INGREDIENT','TOPPING')");
    expect(sql).toContain("status in ('OPEN','IN_REVIEW','ACCEPTED','REJECTED')");
    expect(sql).toMatch(
      /requesting_user_id,canonical_product_id,requested_capability,current_classification\s*\) where status in \('OPEN','IN_REVIEW'\)/,
    );
    expect(sql).toContain(
      "requested_capability='INGREDIENT' and attempted_context='INGREDIENT_PICKER'",
    );
    expect(sql).toContain("requested_capability='TOPPING' and attempted_context='TOPPING_PICKER'");
    expect(sql).toContain('USER_EXPECTS_INGREDIENT_CAPABILITY');
    expect(sql).toContain('USER_EXPECTS_TOPPING_CAPABILITY');
  });

  it('derives capability from the exact current canonical version and binding authority', () => {
    const authority = functionBody('gellatti_product_capability_authority_v1');
    expect(authority).toContain('pv.id=p.current_version_id and pv.product_id=p.id');
    expect(authority).toContain('pb.id=p.current_behavior_binding_id and pb.product_id=p.id');
    expect(authority).toContain('pb.product_version_id=pv.id and pb.is_current');
    expect(authority).toContain("pb.profile_permissions->>'BASE_RECIPE'");
    expect(authority).toContain("jsonb_typeof(pv.facts->'technicalComposition')='object'");
    expect(authority).toContain("pv.facts->'technicalComposition'<>'{}'::jsonb");
    expect(authority).toContain('pb.mapper_ingredient_id is null');
    expect(authority).toContain("pb.profile_permissions->>'TOPPING'");
    expect(authority).toContain("coalesce(p.status,'')<>'rejected'");
    expect(authority).toContain("p.canonical_verification_status<>'blocked'");
    expect(authority).not.toMatch(
      /where p\.id=p_product_id[^;]*p\.canonical_verification_status<>'blocked'/s,
    );
    expect(authority).toContain("'mapperIngredientId',pb.mapper_ingredient_id");
    expect(authority).toContain("'canonicalProvenance',p.canonical_provenance");
    expect(authority).toContain("'productSourceType',p.source_type");
    expect(authority).toContain("coalesce(p.status,'')<>'rejected'");
  });

  it('requires exact customer-added attribution and snapshots only the caller evidence references', () => {
    const submit = functionBody('gellatti_request_product_capability_reanalysis_v1');
    expect(submit).toContain('public.customer_added_product_accounts linked');
    expect(submit).toContain('contribution.product_id=p_product_id');
    expect(submit).toContain('linked.user_id=v_user and linked.product_id=p_product_id');
    expect(submit).toContain('contribution.canonical_product_id=p_product_id');
    expect(submit).toContain('e.user_id=v_user');
    expect(submit).toContain('customerAddedEvidenceId');
    expect(submit).toContain("'mapperIngredientId',v_authority->>'mapperIngredientId'");
    expect(submit).not.toContain('scan_result');
    expect(submit).not.toContain('product_profile_authority');
    expect(submit).not.toContain('product_behavior_authority');
    expect(submit.indexOf('select linked.*')).toBeLessThan(
      submit.indexOf('perform 1 from public.products p'),
    );
    expect(submit.indexOf("raise exception 'exact_product_contributor_required'")).toBeLessThan(
      submit.indexOf('gellatti_product_capability_authority_v1(p_product_id)'),
    );
  });

  it('keeps customer eligibility private and exposes no evidence or attribution reference', () => {
    const eligibility = functionBody('gellatti_product_capability_reanalysis_eligibility_v1');
    expect(eligibility).toContain("'eligible'");
    expect(eligibility).toContain("'existingRequestStatus'");
    expect(eligibility).toContain("'currentClassification'");
    expect(eligibility).not.toContain('customer_added_product_evidence');
    expect(eligibility).not.toContain('evidence_references');
    expect(eligibility).not.toContain('first_scan_session_id');
    expect(sql).toContain(
      'revoke all on table public.product_capability_reanalysis_requests\n  from public,anon,authenticated',
    );
    expect(sql).not.toMatch(
      /grant\s+(?:select|insert|update|delete|all).*product_capability_reanalysis_requests/i,
    );
  });

  it('revalidates the live mismatch and deduplicates submission atomically', () => {
    const submit = functionBody('gellatti_request_product_capability_reanalysis_v1');
    expect(submit).toContain('for share');
    expect(submit).toContain('pg_advisory_xact_lock');
    expect(submit).toContain('for update');
    expect(submit).toContain("raise exception 'requested_capability_not_missing'");
    expect(submit).toContain('on conflict (');
    expect(submit).toContain("where status in ('OPEN','IN_REVIEW') do nothing");
    expect(submit).toContain("'alreadyExists',true");
    expect(submit).toContain("'alreadyExists',false");
  });

  it('uses the CATALOG permission for listing and decisions', () => {
    const list = functionBody('gellatti_admin_product_capability_reanalysis_v1');
    const action = functionBody('gellatti_admin_product_capability_reanalysis_action_v1');
    expect(list).toContain("gellatti_admin_has_permission_v1('CATALOG')");
    expect(action).toContain("gellatti_admin_has_permission_v1('CATALOG',v_admin)");
    expect(list).toContain("'evidenceReferences',r.evidence_references");
    expect(list).toContain("'currentAuthority',public.gellatti_product_capability_authority_v1");
    expect(list).toContain('least(greatest(coalesce(p_limit,500),1),1000)');
  });

  it('accepts only after canonical authority already grants the capability', () => {
    const action = functionBody('gellatti_admin_product_capability_reanalysis_action_v1');
    expect(action).toContain("p_action='ACCEPT'");
    expect(action).toContain('for share');
    expect(action).toContain("v_authority->>'ingredientAllowed'");
    expect(action).toContain("v_authority->>'toppingAllowed'");
    expect(action).toContain("raise exception 'requested_capability_not_canonically_enabled'");
    expect(action).toContain('resolution_authority=v_authority');
    expect(action).not.toMatch(/update\s+public\.products/i);
    expect(action).not.toMatch(/(?:insert\s+into|update)\s+public\.product_versions/i);
    expect(action).not.toMatch(/(?:insert\s+into|update)\s+public\.product_behavior_bindings/i);
  });

  it('never changes Mapper, product identity, readiness or formulas', () => {
    expect(sql).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.mapper_basement/i);
    const submit = functionBody('gellatti_request_product_capability_reanalysis_v1');
    expect(submit).not.toMatch(/update\s+public\.products/i);
    expect(submit).not.toMatch(/insert\s+into\s+public\.product_versions/i);
    expect(submit).not.toMatch(/insert\s+into\s+public\.product_behavior_bindings/i);
  });
});
