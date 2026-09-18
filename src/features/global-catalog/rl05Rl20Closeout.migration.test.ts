import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const gate = read('supabase/migrations/20260912183500_route_slot_eligibility_explicit_approval.sql');
const gateRollback = read('supabase/rollbacks/20260912183500_route_slot_eligibility_explicit_approval.rollback.sql');
const projection = read('supabase/migrations/20260912184500_country_slot_projection_explicit_approval.sql');
const projectionRollback = read('supabase/rollbacks/20260912184500_country_slot_projection_explicit_approval.rollback.sql');
const classifier = read('supabase/migrations/20260912193000_classifier_semantic_jsonb_operator_typing.sql');
const classifierRollback = read('supabase/rollbacks/20260912193000_classifier_semantic_jsonb_operator_typing.rollback.sql');

describe('RL-05 / RL-20 guarded closeout migrations', () => {
  it('uses explicit Mapper approvals for slot eligibility and preserves every product-side guard', () => {
    expect(gate).toContain('private.product_canonical_slot_candidate_is_valid_v1');
    expect(gate).toContain('mapper.approved_for_base');
    expect(gate).toContain('mapper.approved_for_engines');
    expect(gate).toContain("product.canonical_verification_status <> 'blocked'");
    expect(gate).toContain("binding.binding_status = 'ready'");
    expect(gate).toContain("binding.profile_permissions->>'BASE_RECIPE'");
    expect(gate).toContain("'{productIntelligence,engineUsable}'");
    expect(gate.match(/technicalComposition,/g)).toHaveLength(7);
    expect(gate).not.toContain("lower(coalesce(mapper.verification_status, '')) like 'verified%'");
  });

  it('removes only the two obsolete resolver projection predicates and guards against drift', () => {
    expect(projection).toContain("regexp_count(v_definition, 'lower\\(coalesce\\(mapper\\.verification_status') <> 2");
    expect(projection).toContain("regexp_count(v_definition, 'mapper\\.approved_for_base') <> 2");
    expect(projection).toContain("regexp_count(v_definition, 'mapper\\.approved_for_engines') <> 2");
    expect(projection).toContain("replace(v_definition, v_obsolete_usable, '')");
    expect(projection).toContain('execute v_replacement');
  });

  it('fixes PostgreSQL 42725 by typing only the JSONB path and deletion operands', () => {
    expect(classifier).toContain("md5(v_definition) <> '3e91b08949b0431401cbc83ff5e6386f'");
    expect(classifier).toContain('expected exactly one ambiguous semantic jsonb expression');
    expect(classifier).toContain("v_public_data #> ARRAY[");
    expect(classifier).toContain("]::text[])");
    expect(classifier).toContain("- ARRAY['exactIdentity','readiness']::text[]");
    expect(classifier).not.toMatch(/(insert\s+into|update|delete\s+from)\s+public\.mapper_basement/i);
  });

  it('ships exact rollback coverage for all three function changes', () => {
    expect(gateRollback).toContain("lower(coalesce(mapper.verification_status, '')) like 'verified%'");
    expect(projectionRollback).toContain('public.resolve_country_product_slots_v1(text[],text,text)');
    expect(classifierRollback).toContain("md5(pg_get_functiondef(");
    expect(classifierRollback).toContain("- 'exactIdentity' - 'readiness'");
    for (const sql of [gateRollback, projectionRollback, classifierRollback]) {
      expect(sql).not.toMatch(/(insert\s+into|update|delete\s+from)\s+public\.mapper_basement/i);
    }
  });
});
