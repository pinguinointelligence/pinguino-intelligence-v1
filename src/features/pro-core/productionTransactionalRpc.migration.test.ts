/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(
  join(REPO, 'supabase', 'migrations', '20260819023000_production_transactional_rpc.sql'),
  'utf8',
);
const CODE = SQL.replace(/--.*$/gm, '');

describe('forward-only transactional Production RPC migration', () => {
  it('preserves production history when a saved recipe is deleted', () => {
    expect(CODE).toContain('drop constraint if exists production_runs_recipe_id_fkey');
    expect(CODE).toMatch(/foreign key \(recipe_id\)[\s\S]*on delete restrict/);
    expect(CODE).not.toMatch(/foreign key \(recipe_id\)[\s\S]{0,100}on delete cascade/);
  });

  it('uses the billing-owned active Pro entitlement with bounded time semantics', () => {
    expect(CODE).toContain('has_active_production_entitlement_v1');
    expect(CODE).toContain("entitlement.scope = 'pro'");
    expect(CODE).toContain("entitlement.status = 'active'");
    expect(CODE).toContain('entitlement.starts_at <= statement_timestamp()');
    expect(CODE).toContain('entitlement.ends_at > statement_timestamp()');
    expect(CODE).not.toMatch(/email/i);
  });

  it('creates all repository mutations as fixed-search-path SECURITY DEFINER RPCs', () => {
    for (const fn of [
      'production_create_run_v1',
      'production_start_run_v1',
      'production_transition_run_v1',
      'production_update_meta_v1',
      'production_record_actual_v1',
      'production_apply_rescue_v1',
      'production_complete_run_v1',
      'production_append_amendment_v1',
    ]) {
      const start = CODE.indexOf(`function public.${fn}`);
      expect(start, fn).toBeGreaterThan(-1);
      const body = CODE.slice(start, start + 1800);
      expect(body, fn).toContain('security definer');
      expect(body, fn).toContain('set search_path = pg_catalog, public');
      expect(body, fn).toContain('assert_production_pro_entitlement_v1');
    }
  });

  it('derives immutable authority from the exact owned recipe version and revalidates ProductBehavior', () => {
    expect(CODE).toContain('version.id = p_recipe_version_id');
    expect(CODE).toContain('version.owner_user_id = v_uid');
    expect(CODE).toContain('recipe.user_id = v_uid');
    expect(CODE).toContain('assert_recipe_behavior_authority_v1');
    expect(CODE).toContain("v_version.product_composition, 'PRODUCTION'");
    for (const field of [
      'v_version.recipe_id',
      'v_version.version_number',
      'v_version.product_profile',
      'v_version.temperature_c',
      'v_version.engine_version',
      'v_version.config_version',
      'v_version.mapper_dataset_version',
    ])
      expect(CODE).toContain(field);
  });

  it('rejects incomplete, duplicate, unknown, wrong-scope, or non-exact planned vectors', () => {
    expect(CODE).toContain('planned vector is incomplete');
    expect(CODE).toContain('planned vector contains duplicate line ids');
    expect(CODE).toContain('planned vector has invalid grams or scope');
    expect(CODE).toContain('planned line is not part of the immutable recipe version');
    expect(CODE).toContain('planned line does not match immutable-version scaling');
    expect(CODE).toContain('base planned grams must total the exact batch');
    expect(CODE).toContain('base display grams must total the exact batch');
  });

  it('locks lifecycle and actual writes and records each matching event in the same function', () => {
    expect((CODE.match(/for update/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(CODE).toContain("v_run.status = 'draft' and p_to_status in ('planned', 'cancelled')");
    expect(CODE).toContain(
      "v_run.status = 'planned' and p_to_status in ('in_progress', 'cancelled')",
    );
    expect(CODE).toContain(
      "v_run.status = 'in_progress' and p_to_status in ('completed', 'cancelled')",
    );
    expect(CODE).toContain("status = 'in_progress' for update");
    expect(CODE).toContain("'actual_recorded'");
    expect(CODE).toContain('complete actual vector and coherent Base total required');
    expect(CODE).toContain('actual vector must contain every frozen and rescue line exactly once');
    expect(CODE).toContain('production_runs_one_active_exact_batch');
    expect(CODE).toContain('pg_advisory_xact_lock');
    expect(CODE).toContain('hashtextextended');
  });

  it('provides atomic served start/completion and a server-validated durable Rescue snapshot', () => {
    const start = CODE.slice(CODE.indexOf('function public.production_start_run_v1'));
    expect(start).toContain('production_create_run_v1');
    expect(start).toContain('production_transition_run_v1');
    const rescue = CODE.slice(CODE.indexOf('function public.production_apply_rescue_v1'));
    expect(rescue).toContain(
      "assert_recipe_behavior_authority_v1(\n    p_recipe_input, p_product_composition, 'BATCH_RESCUE'",
    );
    expect(rescue).toContain("'rescue_applied'");
    expect(rescue).toContain('rescue_accepted_by = v_uid');
    expect(rescue).toContain('rescue cannot change the frozen Engine context');
    expect(rescue).toContain('rescue cannot replace a frozen ingredient identity or Engine facts');
    expect(rescue).toContain(
      'rescue must preserve every previously accepted Rescue line and identity',
    );
    expect(rescue).toContain("'recipeInput', p_recipe_input");
    expect(rescue).toContain("'productComposition', p_product_composition");
    const complete = CODE.slice(CODE.indexOf('function public.production_complete_run_v1'));
    expect(complete).toContain('production_record_actual_v1');
    expect(complete).toContain("production_transition_run_v1(\n    p_run_id, 'completed'");
  });

  it('treats explicit JSON null as incomplete and persists confirmation chronology', () => {
    expect(CODE).not.toContain("item->'actualGrams' is null");
    expect(CODE).toContain("item->>'actualGrams' is null");
    expect(CODE).toContain("item->>'confirmedAt' is null");
    expect(CODE).toContain("item->>'confirmationOrder' is null");
    expect(CODE).toContain("'confirmedAt', item.value->'confirmedAt'");
    expect(CODE).toContain("'confirmationOrder', item.value->'confirmationOrder'");
    expect(CODE).toContain(
      'confirmed actual lines require exact timestamp and positive integer order',
    );
    expect(CODE).toContain('confirmed actual lines require unique operator chronology');
    expect(CODE).toContain("group by (item->>'confirmationOrder')::integer having count(*) > 1");
    expect(CODE).toContain('yield and waste must be non-negative');
    expect(CODE).toContain("'actualItems', v_clean_items");
    expect(CODE).toContain('actual_revision = actual_revision + 1');
    expect(CODE).toContain('rescue_revision = rescue_revision + 1');
    expect(CODE).toContain('v_run.actual_revision is distinct from p_expected_actual_revision');
    expect(CODE).toContain('v_run.rescue_revision is distinct from p_expected_rescue_revision');
    expect(CODE).toMatch(
      /production_record_actual_v1\([\s\S]{0,180}p_expected_rescue_revision integer/,
    );
    expect(CODE).toContain('production actual revision conflict; reload required');
    expect(CODE).toContain('production rescue revision conflict; reload required');
    expect(CODE).toContain("errcode = '40001'");
    expect(CODE).toContain(
      "coalesce(jsonb_typeof(p_recipe_input->'target_batch_grams'), '') <> 'number'",
    );
    expect(CODE).toContain("coalesce(jsonb_typeof(item->'planned_grams'), '') <> 'number'");
    expect(CODE).toContain("coalesce(jsonb_typeof(item->'actual_grams'), '') <> 'null'");
    expect(CODE).toContain(
      "coalesce(jsonb_typeof(item->'actualGrams'), '') not in ('number', 'null')",
    );
    expect(CODE).toContain(
      "(item->>'planned_grams')::numeric <> trunc((item->>'planned_grams')::numeric)",
    );
  });

  it('keeps terminal amendment append-only and revokes every direct authenticated write path', () => {
    const amendment = CODE.slice(CODE.indexOf('function public.production_append_amendment_v1'));
    expect(amendment).toContain("status = 'completed' for share");
    expect(amendment).not.toMatch(
      /update public\.production_runs[\s\S]{0,500}production_append_amendment/,
    );
    for (const table of [
      'production_runs',
      'production_run_planned_items',
      'production_run_actuals',
      'production_run_events',
    ]) {
      expect(CODE).toContain(`revoke insert, update, delete on public.${table} from authenticated`);
    }
  });
});
