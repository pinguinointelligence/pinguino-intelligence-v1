import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { buildRecipeVersion } from '@/features/pro-core/recipeVersioning';
import type { RecipeVersion } from '@/features/pro-core/recipeContracts';
import { productionCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { InMemoryProduction } from './inMemoryProduction';

const TRACE = { engineVersion: 'e1', configVersion: 'c1' };
const NOW = '2026-07-12T10:00:00.000Z';
const PRO = productionCapabilitiesFor('pro');
const HOME = productionCapabilitiesFor('home');
const DEMO = productionCapabilitiesFor('demo');

const item = (id: string, name: string, grams: number) => ({ id, ingredient: { name }, planned_grams: grams });
const input = (batch: number, items: ReturnType<typeof item>[]): RecipeInput =>
  ({ items, mode: 'classic', category: 'milk_gelato', target_temperature_c: -11, target_batch_grams: batch, machine_capacity_grams: null }) as unknown as RecipeInput;
const makeVersion = (versionId: string, versionNumber = 1, batch = 1000): RecipeVersion =>
  buildRecipeVersion(
    { recipeId: 'r', ownerUserId: 'u1', versionNumber, recipeInput: input(batch, [item('milk', 'Milk', 600), item('sugar', 'Sugar', 400)]), trace: TRACE, source: 'manual', createdBy: 'u1', createdAt: NOW },
    versionId,
  );

describe('InMemoryProduction — capability gate (Pro-only)', () => {
  let svc: InMemoryProduction;
  beforeEach(() => { let k = 0; svc = new InMemoryProduction(() => NOW, () => `id-${(k += 1)}`); });

  it('Demo and Home cannot use Production Mode; Pro can', () => {
    const v = makeVersion('ver-1');
    const create = (caps: typeof PRO) => svc.createRun({ ownerUserId: 'u1', version: v, target: { kind: 'weight_g', grams: 5000 }, capabilities: caps, by: 'u1' });
    expect(() => create(DEMO)).toThrow(/does not include Production Mode/i);
    expect(() => create(HOME)).toThrow(/does not include Production Mode/i);
    expect(create(PRO).status).toBe('draft');
  });
});

describe('InMemoryProduction — plan from an EXACT immutable version', () => {
  let svc: InMemoryProduction;
  beforeEach(() => { let k = 0; svc = new InMemoryProduction(() => NOW, () => `id-${(k += 1)}`); });

  it('binds the run to the exact version id, never the recipe latest', () => {
    const v1 = makeVersion('ver-1', 1);
    makeVersion('ver-2', 2); // a newer version exists, but we planned from v1
    const run = svc.createRun({ ownerUserId: 'u1', version: v1, target: { kind: 'weight_g', grams: 5000 }, capabilities: PRO, by: 'u1' });
    expect(run.recipeVersionId).toBe('ver-1');
    expect(run.recipeVersionNumber).toBe(1);
    expect(run.plannedBatchG).toBe(5000);
    // exact scaled plan (600/400 of 1000 → 3000/2000 of 5000)
    expect(run.plannedItems.map((p) => p.plannedGrams)).toEqual([3000, 2000]);
    expect(run.plannedItems.reduce((s, p) => s + p.displayGrams, 0)).toBe(5000);
    expect(run.events.map((e) => e.type)).toEqual(['created']);
  });

  it('refuses to plan a volume run without a density (honest needs_more_information)', () => {
    const v = makeVersion('ver-1');
    expect(() => svc.createRun({ ownerUserId: 'u1', version: v, target: { kind: 'volume_ml', ml: 5000 }, capabilities: PRO, by: 'u1' })).toThrow(/density/i);
    // the pure preview surfaces the same refusal without throwing
    expect(svc.scale(v, { kind: 'volume_ml', ml: 5000 })).toMatchObject({ ok: false, reason: 'needs_more_information' });
  });
});

describe('InMemoryProduction — lifecycle policy', () => {
  let svc: InMemoryProduction;
  beforeEach(() => { let k = 0; svc = new InMemoryProduction(() => NOW, () => `id-${(k += 1)}`); });
  const start = () => svc.createRun({ ownerUserId: 'u1', version: makeVersion('ver-1'), target: { kind: 'weight_g', grams: 1000 }, capabilities: PRO, by: 'u1' });

  it('allows the legal path draft → planned → in_progress → completed', () => {
    const run = start();
    expect(svc.transition(run.runId, 'planned', 'u1').status).toBe('planned');
    expect(svc.transition(run.runId, 'in_progress', 'u1').status).toBe('in_progress');
    const done = svc.transition(run.runId, 'completed', 'u1');
    expect(done.status).toBe('completed');
    expect(done.completedAt).toBe(NOW);
    expect(done.events.map((e) => e.type)).toEqual(['created', 'planned', 'started', 'completed']);
  });

  it('rejects illegal transitions deterministically', () => {
    const run = start();
    expect(() => svc.transition(run.runId, 'completed', 'u1')).toThrow(/Illegal production transition/i);
    svc.transition(run.runId, 'planned', 'u1');
    svc.transition(run.runId, 'in_progress', 'u1');
    expect(() => svc.transition(run.runId, 'draft', 'u1')).toThrow(/Illegal/i);
    svc.transition(run.runId, 'completed', 'u1');
    expect(() => svc.transition(run.runId, 'in_progress', 'u1')).toThrow(/Illegal/i);
  });

  it('cancelling is terminal', () => {
    const run = start();
    const cancelled = svc.transition(run.runId, 'cancelled', 'u1');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledAt).toBe(NOW);
    expect(() => svc.transition(run.runId, 'in_progress', 'u1')).toThrow(/Illegal/i);
  });
});

describe('InMemoryProduction — actuals, deviation & immutable plan', () => {
  let svc: InMemoryProduction;
  beforeEach(() => { let k = 0; svc = new InMemoryProduction(() => NOW, () => `id-${(k += 1)}`); });

  const startInProgress = () => {
    const run = svc.createRun({ ownerUserId: 'u1', version: makeVersion('ver-1'), target: { kind: 'weight_g', grams: 5000 }, capabilities: PRO, by: 'u1' });
    svc.transition(run.runId, 'planned', 'u1');
    return svc.transition(run.runId, 'in_progress', 'u1');
  };

  it('records actuals only while in progress and computes planned-vs-actual deviation', () => {
    const run = svc.createRun({ ownerUserId: 'u1', version: makeVersion('ver-1'), target: { kind: 'weight_g', grams: 5000 }, capabilities: PRO, by: 'u1' });
    expect(() => svc.recordActual(run.runId, { by: 'u1', items: [] })).toThrow(/only be recorded while the run is in progress/i);

    svc.transition(run.runId, 'planned', 'u1');
    svc.transition(run.runId, 'in_progress', 'u1');
    svc.recordActual(run.runId, {
      by: 'u1',
      items: [{ id: 'milk', name: 'Milk', actualGrams: 3010 }, { id: 'sugar', name: 'Sugar', actualGrams: 1990 }],
      actualTotalMixG: 5000,
      actualYieldG: 4800,
      wasteG: 200,
      deviationReason: 'scale drift',
    });
    const dev = svc.getDeviation(run.runId)!;
    expect(dev.lines.map((l) => l.deltaGrams)).toEqual([10, -10]);
    expect(dev.plannedTotalG).toBe(5000);
    expect(dev.totalDeltaG).toBe(0);
    expect(dev.actualYieldG).toBe(4800);
    expect(dev.wasteG).toBe(200);
  });

  it('recording actuals never replaces the frozen planned snapshot', () => {
    const run = startInProgress();
    const plannedBefore = JSON.stringify(run.plannedItems);
    svc.recordActual(run.runId, { by: 'u1', items: [{ id: 'milk', name: 'Milk', actualGrams: 9999 }] });
    expect(JSON.stringify(svc.getRun(run.runId)!.plannedItems)).toBe(plannedBefore);
  });
});

describe('InMemoryProduction — post-completion amendments are append-only', () => {
  let svc: InMemoryProduction;
  beforeEach(() => { let k = 0; svc = new InMemoryProduction(() => NOW, () => `id-${(k += 1)}`); });

  const complete = () => {
    const run = svc.createRun({ ownerUserId: 'u1', version: makeVersion('ver-1'), target: { kind: 'weight_g', grams: 5000 }, capabilities: PRO, by: 'u1' });
    svc.transition(run.runId, 'planned', 'u1');
    svc.transition(run.runId, 'in_progress', 'u1');
    svc.recordActual(run.runId, { by: 'u1', items: [{ id: 'milk', name: 'Milk', actualGrams: 3000 }] });
    return svc.transition(run.runId, 'completed', 'u1');
  };

  it('amends a completed run without rewriting the plan or the recorded actual', () => {
    const done = complete();
    const plannedBefore = JSON.stringify(done.plannedItems);
    const actualBefore = JSON.stringify(done.actual);
    const amended = svc.amend(done.runId, { by: 'u1', detail: 'Corrected batch label', amendment: { batch_reference: 'B-77' } });
    expect(JSON.stringify(amended.plannedItems)).toBe(plannedBefore);
    expect(JSON.stringify(amended.actual)).toBe(actualBefore);
    expect(amended.events.at(-1)).toMatchObject({ type: 'amended', detail: 'Corrected batch label' });
    // amendment is append-only — history only grows
    expect(amended.events.length).toBe(done.events.length + 1);
  });

  it('refuses amendments before completion and actuals after completion', () => {
    const run = svc.createRun({ ownerUserId: 'u1', version: makeVersion('ver-1'), target: { kind: 'weight_g', grams: 5000 }, capabilities: PRO, by: 'u1' });
    expect(() => svc.amend(run.runId, { by: 'u1', detail: 'too early' })).toThrow(/only for completed runs/i);
    const done = complete();
    expect(() => svc.recordActual(done.runId, { by: 'u1', items: [] })).toThrow(/in progress/i);
  });
});

describe('InMemoryProduction — owner-scoped history', () => {
  let svc: InMemoryProduction;
  let t: number;
  beforeEach(() => {
    let k = 0; t = 0;
    svc = new InMemoryProduction(() => new Date(Date.UTC(2026, 6, 12, 12, 0, t++)).toISOString(), () => `id-${(k += 1)}`);
  });

  const plan = (owner: string, versionId: string, versionNumber: number) =>
    svc.createRun({ ownerUserId: owner, version: makeVersion(versionId, versionNumber), target: { kind: 'weight_g', grams: 1000 }, capabilities: PRO, by: owner });

  it('filters by version, status, date range, sorts and paginates — owner-scoped', () => {
    const r1 = plan('u1', 'ver-1', 1); // t=0
    const r2 = plan('u1', 'ver-2', 2); // t=1
    const r3 = plan('u1', 'ver-1', 1); // t=2
    plan('u2', 'ver-9', 1); // other owner
    svc.transition(r2.runId, 'planned', 'u1');

    // owner isolation
    expect(svc.listRuns('u2').total).toBe(1);
    expect(svc.getRun(r1.runId, 'u2')).toBeNull();
    expect(svc.getRun(r1.runId, 'u1')).not.toBeNull();

    // newest-first (default)
    expect(svc.listRuns('u1').items.map((r) => r.runId)).toEqual([r3.runId, r2.runId, r1.runId]);
    // oldest-first
    expect(svc.listRuns('u1', { sort: 'oldest' }).items.map((r) => r.runId)).toEqual([r1.runId, r2.runId, r3.runId]);
    // by version
    expect(svc.listRuns('u1', { recipeVersionId: 'ver-1' }).total).toBe(2);
    // by status
    expect(svc.listRuns('u1', { status: 'planned' }).items.map((r) => r.runId)).toEqual([r2.runId]);
    // pagination
    const page = svc.listRuns('u1', { sort: 'oldest', offset: 1, limit: 1 });
    expect(page.total).toBe(3);
    expect(page.items.map((r) => r.runId)).toEqual([r2.runId]);
    // date range (only the first two creation seconds)
    const range = svc.listRuns('u1', { sort: 'oldest', to: new Date(Date.UTC(2026, 6, 12, 12, 0, 1)).toISOString() });
    expect(range.items.map((r) => r.runId)).toEqual([r1.runId, r2.runId]);
  });
});
