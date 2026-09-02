/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { acknowledgeHeatInformation } from '@/features/pro-core/productionMode';
import type { ProductionRun } from '@/features/pro-core/productionContracts';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(
  join(
    REPO,
    'supabase',
    'migrations',
    '20260824150000_production_heat_information_and_acknowledgement.sql',
  ),
  'utf8',
).replace(/--.*$/gm, '');

describe('positive Production heat information (§2/§3)', () => {
  it('states a verified heat requirement instead of staying silent about it', () => {
    const readiness = SQL.slice(SQL.indexOf('function public.product_process_readiness_v1'));
    expect(readiness).toContain(
      "'HEAT_REQUIRED_FOR_FUNCTION', 'HEAT_REQUIRED_FOR_SAFETY', 'HEAT_REQUIRED_FOR_BOTH'",
    );
    expect(readiness).toContain("'code', 'HEAT_TREATMENT_INDICATED'");
    expect(readiness).toContain("v_verification = 'verified'");
    // The Owner-curated Polish handling note travels with the reminder.
    expect(readiness).toContain('lateAdditionGuidancePl');
    expect(readiness).toContain("'handlingNotePl', v_guidance");
  });

  it('keeps a verified cold process and an unknown process exactly as they were', () => {
    const start = SQL.indexOf('function public.product_process_readiness_v1');
    const readiness = SQL.slice(start, SQL.indexOf('revoke all on function', start));
    // A verified non-heat decision has nothing to remind anyone about.
    expect(readiness).toContain("if v_verification = 'verified' and v_decision <> 'UNKNOWN' then");
    // An unknown process is still ordinary information, never a blocker.
    expect(readiness).toContain("'PROCESS_INFORMATION_NOT_AVAILABLE'");
    expect(readiness).not.toContain('BLOCKED');
  });

  it('never turns process information into runtime authority', () => {
    expect(SQL).not.toMatch(
      /(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.mapper_basement/i,
    );
    expect(SQL).not.toMatch(
      /(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.mapper_process_metadata/i,
    );
    expect(SQL).not.toContain('production_process_advisory_registry set');
  });

  it('stores exactly one acknowledgement, owner-scoped and only while the run is active', () => {
    expect(SQL).toContain('add column if not exists heat_information_acknowledged_at timestamptz');
    const rpc = SQL.slice(
      SQL.indexOf('function public.production_acknowledge_heat_information_v1'),
    );
    expect(rpc).toContain('assert_production_pro_entitlement_v1()');
    expect(rpc).toContain('owner_user_id = v_uid');
    expect(rpc).toContain("status = 'in_progress'");
    // Idempotent: the first OK is the one that stands.
    expect(rpc).toContain('coalesce(heat_information_acknowledged_at, pg_catalog.now())');
    expect(SQL).toContain(
      'grant execute on function public.production_acknowledge_heat_information_v1(uuid)\n  to authenticated',
    );
  });
});

const activeRun = (overrides: Partial<ProductionRun> = {}): ProductionRun =>
  ({
    runId: 'run-1',
    status: 'in_progress',
    heatInformationAcknowledgedAt: null,
    updatedAt: '2026-08-24T09:00:00.000Z',
    ...overrides,
  }) as ProductionRun;

describe('acknowledgeHeatInformation (pure domain)', () => {
  it('records the first OK and leaves the plan untouched', () => {
    const next = acknowledgeHeatInformation(activeRun(), '2026-08-24T10:00:00.000Z');
    expect(next.heatInformationAcknowledgedAt).toBe('2026-08-24T10:00:00.000Z');
    expect(next.status).toBe('in_progress');
  });

  it('is idempotent — a second OK does not move the receipt', () => {
    const once = acknowledgeHeatInformation(activeRun(), '2026-08-24T10:00:00.000Z');
    expect(acknowledgeHeatInformation(once, '2026-08-24T11:00:00.000Z')).toBe(once);
  });

  it('refuses to acknowledge on a run that is not being executed', () => {
    expect(() =>
      acknowledgeHeatInformation(activeRun({ status: 'completed' }), '2026-08-24T10:00:00.000Z'),
    ).toThrow(/active run/i);
  });
});
