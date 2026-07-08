/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  runAllOptimizationPreviews,
  runOptimizationPreview,
  type OptimizationPreviewView,
} from './optimizationPreviewRunner';
import {
  OPTIMIZATION_PREVIEW_FIXTURES,
  findOptimizationPreviewFixture,
} from './optimizationPreviewFixtures';

const views = runAllOptimizationPreviews(OPTIMIZATION_PREVIEW_FIXTURES);
const byId = (id: string): OptimizationPreviewView => views.find((v) => v.id === id)!;

describe('runOptimizationPreview — decision paths through the REAL engine + solver', () => {
  it('the tradeoff fixture produces a correction plan and runs the real solver + Base Engine rerun', () => {
    const v = byId('gelato-tradeoff');
    expect(v.optimizerDecision).toBe('tradeoff');
    expect(v.proposedCorrections.length).toBeGreaterThan(0);
    expect(v.proposedCorrections.map((p) => p.goal)).toContain('increase_npac');
    // the real solver added grams and the real Base Engine re-ran → verified after-state exists
    expect(v.rerunState).toBe('rerun_complete');
    expect(v.rerun).not.toBeNull();
    expect(v.afterMetrics).not.toBeNull();
    expect(v.proposedAdjustments.length).toBeGreaterThan(0);
  });

  it('the tradeoff fixture proves a before→after improvement or an honest tradeoff (never faked optimized)', () => {
    const v = byId('gelato-tradeoff');
    expect(['optimized', 'tradeoff']).toContain(v.finalDecision);
    expect(v.rerun?.decision).toBe(v.finalDecision);
    if (v.finalDecision === 'optimized') {
      expect(v.rerun?.after.acceptable).toBe(true);
    } else {
      // an honest tradeoff still shows a real improvement, not a fabricated success
      expect(v.rerun?.improvementDetected).toBe(true);
      expect(v.rerun?.after.acceptable).toBe(false);
    }
  });

  it('the impossible fixture stays impossible (a no-lever hard gate, no correction plan)', () => {
    const v = byId('gelato-impossible');
    expect(v.finalDecision).toBe('impossible');
    expect(v.optimizerDecision).toBe('impossible');
    expect(v.rerunState).toBe('no_feasible_plan');
    expect(v.proposedCorrections).toEqual([]);
    expect(v.beforeMetrics.fat!).toBeGreaterThan(12); // the unfixable gate (no fat correction goal)
  });

  it('the sorbet fixture is ready/warning → no action needed', () => {
    const v = byId('sorbet-ready');
    expect(v.finalDecision).toBe('no_action_needed');
    expect(v.rerunState).toBe('not_needed');
    expect(v.proposedCorrections).toEqual([]);
  });

  it('the granita fixture stays blocked (unsupported profile, never remapped)', () => {
    const v = byId('granita-blocked');
    expect(v.finalDecision).toBe('blocked');
    expect(v.rerunState).toBe('blocked');
    expect(v.hardBlockers).toContain('optimizer_blocked');
  });

  it('the chocolate advisory case never becomes a hard blocker (protein share stays advisory)', () => {
    const v = byId('chocolate-advisory');
    // protein-share is advisory for chocolate — it must never be a hard gate failure…
    expect(v.rerun?.before.hardGateFailures ?? []).not.toContain('protein_share_in_solids');
    // …and it must never be turned into a hard correction plan.
    expect(v.proposedCorrections.map((p) => p.goal)).not.toContain('increase_aerating_protein');
    expect(v.beforeMetrics.proteinShareInSolids!).toBeLessThan(9); // below the visible benchmark → advisory
  });

  it('renders before/after metrics for a corrected case', () => {
    const v = byId('gelato-tradeoff');
    expect(Number.isFinite(v.beforeMetrics.npac)).toBe(true);
    expect(Number.isFinite(v.beforeMetrics.pod)).toBe(true);
    expect(v.afterMetrics && Number.isFinite(v.afterMetrics.npac)).toBe(true);
  });

  it('never mutates the fixture recipe input', () => {
    const fixture = findOptimizationPreviewFixture('gelato-tradeoff')!;
    const snapshot = JSON.stringify(fixture.recipe);
    runOptimizationPreview(fixture);
    expect(JSON.stringify(fixture.recipe)).toBe(snapshot);
  });

  it('is deterministic', () => {
    const a = runAllOptimizationPreviews(OPTIMIZATION_PREVIEW_FIXTURES);
    const b = runAllOptimizationPreviews(OPTIMIZATION_PREVIEW_FIXTURES);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('optimization preview orchestration — boundary (DEV preview, no persistence)', () => {
  const HERE = import.meta.dirname;
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const sources = ['optimizationPreviewRunner.ts', 'optimizationPreviewFixtures.ts'].map((f) =>
    strip(readFileSync(join(HERE, f), 'utf8')),
  );

  it('imports the engine only through the public @/engine barrel (no deep engine import)', () => {
    for (const src of sources) {
      expect(/from\s+['"]@\/engine\/[^'"]+['"]/.test(src)).toBe(false);
    }
  });

  it('touches no Supabase / DB service / Mapper data, and writes no pac/pod or product status', () => {
    for (const src of sources) {
      expect(/supabase|service_role/i.test(src)).toBe(false);
      expect(/mapper_basement/i.test(src)).toBe(false);
      // No DB write path at all (the fixtures' engine-ingredient `pac_value: null` is pure engine
      // INPUT, never a product-table write) — the absence of any service/DB access is the guarantee.
      expect(/@\/services\/|@\/data\/products/.test(src)).toBe(false);
      expect(/setProductLifecycleStatus|pi_calculated|pi_verified/.test(src)).toBe(false);
      for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
        expect(src.includes(verb), verb).toBe(false);
      }
    }
  });

  it('has no recipe save / persist path', () => {
    for (const src of sources) {
      expect(/saveRecipe|persistRecipe|insertRecipe|\.save\(/i.test(src)).toBe(false);
    }
  });
});

describe('optimization preview runner — SRC boundary', () => {
  it('lives under src/features (a non-spine module allowed to import the engine)', () => {
    const path = resolve(import.meta.dirname);
    expect(/[\\/]features[\\/]optimization$/.test(path)).toBe(true);
  });
});
