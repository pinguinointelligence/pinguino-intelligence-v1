import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../supabase/migrations/20260825200000_canonical_carbonation_and_production_degassing.sql',
  ),
  'utf8',
);

describe('Production degassing persistence', () => {
  it('freezes required/status/product IDs on the existing Production run', () => {
    for (const field of [
      'degassing_required',
      'degassing_acknowledged',
      'degassing_acknowledged_at',
      'carbonated_product_ids',
    ]) expect(migration).toContain(field);
    expect(migration).toContain('v_version.recipe_input,v_version.product_composition');
  });

  it('reuses one idempotent server-backed acknowledgement RPC', () => {
    expect(migration).toContain('production_acknowledge_degassing_v1');
    expect(migration).toContain("status='in_progress'");
    expect(migration).toContain("event_type='degassing_acknowledged'");
    expect(migration).toContain('patch_production_event_state_carbonation');
    expect(migration).toContain(
      "'heat_information_acknowledged','degassing_acknowledged'",
    );
    expect(migration).not.toContain('create table public.production_degassing');
  });
});
