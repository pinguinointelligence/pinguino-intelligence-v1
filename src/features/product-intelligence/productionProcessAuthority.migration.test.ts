/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(
  join(REPO, 'supabase', 'migrations', '20260820123000_production_process_authority_hotfix.sql'),
  'utf8',
);
const CODE = SQL.replace(/--.*$/gm, '');

describe('bounded Production process authority migration', () => {
  it('allows advisories for exactly the three Owner-approved Mapper identities', () => {
    expect(CODE).toContain("'PI-ING-000236', 'PROCESS_DATA_INSUFFICIENT'");
    expect(CODE).toContain("'PI-ING-000180', 'PROCESS_DATA_INSUFFICIENT'");
    expect(CODE).toContain("'PI-ING-000270', 'SMP_PROCESS_GRADE_DEPENDENT'");
    expect(CODE).toContain('c185d08ef89229001ffc56eceda0dbe55442e9abe0327d2b27742e40d8dbc9f4');
    expect(CODE).toContain('PROCESS_ADVISORY_AUTHORITY_MISSING');
    expect(CODE).not.toMatch(
      /coalesce\s*\(\s*v_advisory_code[\s\S]{0,220}PROCESS_DATA_INSUFFICIENT/,
    );
    expect(CODE).toContain("'MAIN_ALLOWED', 'MAIN_PROFILE_SPECIFIC'");
    expect(CODE).toContain("jsonb_typeof(v_resolved->'mainPolicy') = 'object'");
    expect(CODE).not.toContain("v_resolved#>>'{moduleEligibility,MAIN}'");
  });

  it('keeps recipe identity freshness separate from a process-only Production block', () => {
    const validation = CODE.slice(
      CODE.indexOf('function public.validate_recipe_behavior_v1'),
      CODE.indexOf('function public.recipe_process_readiness_v1'),
    );
    expect(validation).toContain("reason.value#>>'{}' = 'requested_module_not_eligible'");
    expect(validation).toContain("<@ jsonb_build_array('process_readiness_blocked')");
    expect(validation).toContain("? 'process_readiness_blocked'");
    expect(validation).not.toContain('v_base_resolved');
  });

  it('requires a valid explicit thermal route and keeps verified heat conflicts fail-closed', () => {
    const readiness = CODE.slice(CODE.indexOf('function public.product_process_readiness_v1'));
    expect(readiness).toContain("v_thermal_mode not in ('COLD_ONLY', 'HEAT_CAPABLE')");
    expect(readiness).toContain('PROCESS_THERMAL_MODE_REQUIRED');
    expect(readiness).toContain("v_thermal_mode = 'COLD_ONLY'");
    expect(readiness).toContain("v_verification = 'verified'");
    expect(readiness).toContain("'HEAT_REQUIRED_FOR_FUNCTION'");
    expect(readiness).toContain("'HEAT_REQUIRED_FOR_SAFETY'");
    expect(readiness).toContain("'HEAT_REQUIRED_FOR_BOTH'");
    expect(readiness).toContain('PROCESS_HEAT_REQUIRED_CONFLICT');
  });

  it('validates raw start payloads and freezes process authority on the durable run', () => {
    const start = CODE.slice(CODE.indexOf('function public.production_start_run_v2'));
    expect(start).toContain("p_thermal_mode not in ('COLD_ONLY', 'HEAT_CAPABLE')");
    expect(start).toContain('invalid Production thermal mode');
    expect(start).toContain('recipe_process_readiness_v1');
    expect(start).toContain("coalesce(v_readiness->>'status', 'BLOCKED') = 'BLOCKED'");
    expect(start).toContain('thermal_mode = p_thermal_mode');
    expect(start).toContain("process_readiness = v_readiness->>'status'");
    expect(start).toContain("process_advisories = v_readiness->'advisories'");
    expect(start).toContain('production_transition_run_v1');
  });

  it('prevents legacy or direct transition paths from starting without current authority', () => {
    const guard = CODE.slice(
      CODE.indexOf('function public.production_enforce_process_authority_v1'),
    );
    expect(guard).toContain("old.status = 'planned' and new.status = 'in_progress'");
    expect(guard).toContain("old.thermal_mode not in ('COLD_ONLY', 'HEAT_CAPABLE')");
    expect(guard).toContain('production run requires explicit thermal authority');
    expect(guard).toContain('recipe_process_readiness_v1');
    expect(guard).toContain('production process authority changed before start');
  });

  it('re-evaluates and freezes Rescue process authority before accepting composition changes', () => {
    const rescue = CODE.slice(CODE.indexOf('function public.production_apply_rescue_v1'));
    expect(rescue).toContain(
      "assert_recipe_behavior_authority_v1(\n    p_recipe_input, p_product_composition, 'BATCH_RESCUE'",
    );
    expect(rescue).toContain('recipe_process_readiness_v1');
    expect(rescue).toContain('rescue process readiness is blocked');
    expect(rescue).toContain("process_readiness = v_readiness->>'status'");
    expect(rescue).toContain("'previousProcessReadiness', v_run.process_readiness");
    expect(rescue).toContain("'processReadiness', v_readiness->>'status'");
    expect(rescue).toContain("'thermalMode', v_run.thermal_mode");
  });

  it('keeps the advisory registry non-writable and does not alter Mapper source data', () => {
    expect(CODE).toContain(
      'alter table public.production_process_advisory_registry enable row level security',
    );
    expect(CODE).toContain(
      'revoke all on public.production_process_advisory_registry\n  from public, anon, authenticated, service_role',
    );
    expect(CODE).not.toMatch(
      /(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.mapper_basement/i,
    );
    expect(CODE).not.toMatch(
      /(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.mapper_process_metadata/i,
    );
  });
});
