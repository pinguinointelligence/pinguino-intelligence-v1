/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SurfaceToneContext } from '@/components/ui/surface';
import { OptimizationPreviewPanel } from './OptimizationPreviewPanel';
import { optimizationDisplayPolicy, type OptimizationDisplayPolicy } from './optimizationPreviewPolicy';
import type { OptimizationPreviewView } from './optimizationPreviewRunner';
import type { OptimizationDecision } from '@/spine';

const render = (view: OptimizationPreviewView, policy: OptimizationDisplayPolicy) =>
  renderToStaticMarkup(
    <SurfaceToneContext.Provider value="shell">
      <OptimizationPreviewPanel view={view} policy={policy} />
    </SurfaceToneContext.Provider>,
  );
const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

const view = (over: Partial<OptimizationPreviewView> = {}): OptimizationPreviewView => ({
  id: 'x',
  label: 'Live Studio recipe',
  intendedDecision: 'live',
  productProfile: 'standard_gelato',
  servingTemperatureC: -12,
  beforeMetrics: { npac: 40, pod: 15, iceFraction: 50, water: 63, solids: 37, fat: 6, lactose: 5, lactoseSanding: 8, aeratingProtein: 3.7, proteinShareInSolids: 10, stabilizerGrams: 5 },
  afterMetrics: { npac: 46, pod: 15.5, iceFraction: 51, water: 62, solids: 38, fat: 6, lactose: 5, lactoseSanding: 8, aeratingProtein: 3.7, proteinShareInSolids: 10, stabilizerGrams: 5 },
  flowDecision: 'tradeoff',
  correctionGoals: ['increase_npac', 'increase_solids'],
  optimizerDecision: 'tradeoff',
  proposedCorrections: [
    { goal: 'increase_npac', targetMetric: 'npac', direction: 'increase', affectedIngredientClasses: ['dextrose', 'sucrose'], goldenMiddleRank: 2, feasibility: 'feasible', constraintReason: 'levers within allowed families', warnings: [] },
  ],
  rejectedCorrections: [],
  proposedAdjustments: [{ type: 'add', ingredient: 'Dextrose', grams: 88.7 }],
  finalDecision: 'tradeoff',
  rerunState: 'rerun_complete',
  rerun: {
    before: { acceptable: false, status: 'too_hard', hardGateFailures: ['npac'], score: 30 },
    after: { acceptable: false, status: 'firm_side_acceptable', hardGateFailures: [], score: 70 },
    improvementDetected: true,
    newFailures: [],
    worsenedFailures: [],
    decision: 'tradeoff',
  },
  targetGuidance: {
    target: {
      productProfile: 'standard_gelato',
      servingTemperatureC: -12,
      regulatorProfile: 'standard_gelato_temperature_regulator',
      regulatorStatus: 'locked_v0_1',
      npacBand: [42, 50],
      npacCleanCenter: [45, 46.2],
      metricBands: {},
      hardGates: [],
      advisoryGates: [],
      safeAdjustmentFamilies: [],
      forbiddenAdjustmentFamilies: [],
    },
    solverTargetAligned: false,
    solverTargetSource: 'not_connected',
    npacTargetDivergence: 8,
    warnings: ['temperature_target_not_connected'],
    blocked: false,
    blockedReason: null,
  },
  bandComparison: {
    productProfile: 'standard_gelato',
    servingTemperatureC: -12,
    status: 'divergent',
    shadowSource: 'temperature_regulator_shadow',
    engineCategory: 'milk_gelato',
    engineTemperatureFallback: true,
    engineCategoryFallback: false,
    comparisons: [
      { metric: 'npac', engineMetric: 'npac', engineBand: [33, 42], shadowBand: [42, 50], centerDelta: 8, aligned: false },
    ],
    solverTargetsCorrectBand: false,
    wouldTargetNpacCenter: 45.6,
    warnings: ['engine_uses_temperature_fallback_band', 'target_bands_divergent', 'solver_not_targeting_regulator_band'],
  },
  solverTargetMode: 'engine_seeded',
  solverTargetInjection: {
    source: 'temperature_regulator_shadow',
    productProfile: 'standard_gelato',
    servingTemperatureC: -12,
    mode: 'engine_seeded',
    active: true,
    blockedReason: null,
    regulatorProfile: 'standard_gelato_temperature_regulator',
    injectedMetrics: ['npac'],
    engineSeededViolations: [],
    regulatorShadowViolations: [
      { metric: 'npac', direction: 'low', value: 40, band: [42, 50], targetCenter: 46 },
    ],
    comparisons: [
      { metric: 'npac', value: 40, engineBand: [33, 42], regulatorBand: [42, 50], engineViolation: false, shadowViolation: true, engineTargetCenter: 37.5, shadowTargetCenter: 46, targetCenterDelta: 8.5, changed: true },
    ],
    newViolationsUnderRegulator: ['npac'],
    resolvedViolationsUnderRegulator: [],
    correctionChanged: true,
    warnings: ['regulator_shadow_target_changes_correction', 'regulator_reveals_new_violations'],
    trace: { engineSeededCount: 0, regulatorShadowCount: 1, regulatorProfile: 'standard_gelato_temperature_regulator' },
  },
  engineSeededSolve: {
    active: true,
    blockedReason: null,
    targetSource: 'engine_seeded',
    injectedMetrics: [],
    decision: 'tradeoff',
    rerunState: 'rerun_complete',
    proposedAdjustments: [{ type: 'add', ingredient: 'Dextrose', grams: 88.7 }],
    afterMetrics: { npac: 46, pod: 15.5, iceFraction: 51, water: 62, solids: 38, fat: 6, lactose: 5, lactoseSanding: 8, aeratingProtein: 3.7, proteinShareInSolids: 10, stabilizerGrams: 5 },
    rerun: null,
    warnings: [],
  },
  regulatorShadowSolve: {
    active: true,
    blockedReason: null,
    targetSource: 'regulator_shadow',
    injectedMetrics: ['npac'],
    decision: 'tradeoff',
    rerunState: 'rerun_complete',
    proposedAdjustments: [{ type: 'add', ingredient: 'Dextrose', grams: 142.3 }],
    afterMetrics: { npac: 49, pod: 15.6, iceFraction: 52, water: 61, solids: 39, fat: 6, lactose: 5, lactoseSanding: 8, aeratingProtein: 3.7, proteinShareInSolids: 10, stabilizerGrams: 5 },
    rerun: null,
    warnings: [],
  },
  solveComparison: {
    engineSeededDecision: 'tradeoff',
    regulatorShadowDecision: 'tradeoff',
    correctionDiffers: true,
    regulatorShadowImproved: true,
  },
  warnings: [],
  hardBlockers: [],
  ...over,
});

const demoPolicy = optimizationDisplayPolicy({ exactCorrectionGrams: false, technicalView: false });
const proPolicy = optimizationDisplayPolicy({ exactCorrectionGrams: true, technicalView: true });
const devPolicy = optimizationDisplayPolicy({ exactCorrectionGrams: false, technicalView: false }, { dev: true });

describe('OptimizationPreviewPanel — redaction', () => {
  it('Free/Demo hides exact grams, lever ingredient classes and before/after numbers', () => {
    const html = render(view(), demoPolicy);
    const text = visibleText(html);
    expect(html).not.toContain('88.7'); // no exact solver grams
    expect(/dextrose/i.test(html)).toBe(false); // no lever ingredient names
    expect(html).not.toContain('46.00'); // no numeric before/after
    // shows the safe, high-level view instead
    expect(text).toMatch(/tradeoff/);
    expect(text).toMatch(/increase npac/); // directional goal (no numbers, no ingredient)
    expect(text).toMatch(/available on Pro/);
  });

  it('Pro shows the exact correction grams, the correction plan and before/after metrics', () => {
    const html = render(view(), proPolicy);
    expect(html).toContain('88.7'); // exact solver grams
    expect(/dextrose/i.test(html)).toBe(true); // lever ingredient classes
    expect(html).toContain('40.00'); // before metric
    expect(html).toContain('46.00'); // after metric
    expect(html).not.toContain('available on Pro');
  });

  it('DEV shows the debug trace but still respects a demo viewer’s redaction', () => {
    const html = render(view(), devPolicy);
    expect(html).toContain('DEV trace');
    expect(html).toContain('rerun_complete');
    // still redacted (the dev flag is additive, not an upgrade)
    expect(html).not.toContain('88.7');
    expect(/dextrose/i.test(html)).toBe(false);
  });

  it('shows the temperature-aware target source in every tier (instrumentation, not a correction secret)', () => {
    for (const policy of [demoPolicy, proPolicy, devPolicy]) {
      const t = visibleText(render(view(), policy));
      expect(t).toMatch(/solver target:/);
      expect(t).toMatch(/not connected/); // the base view is a −12 not-connected fallback
    }
  });

  it('shows the shadow engine-vs-regulator band comparison, labelled not-live', () => {
    const t = visibleText(render(view(), demoPolicy));
    expect(t).toMatch(/shadow bands \(not live/);
    expect(t).toMatch(/temperature_regulator_shadow/);
    expect(t).toMatch(/engine npac 33–42 vs regulator 42–50/);
    expect(t).toMatch(/divergent/);
  });

  it('shows the injected regulator-shadow solver target in every tier with the preview-only warning', () => {
    for (const policy of [demoPolicy, proPolicy, devPolicy]) {
      const t = visibleText(render(view(), policy));
      expect(t).toMatch(/regulator-shadow solver target/);
      expect(t).toMatch(/would change the correction/);
      expect(t).toMatch(/Preview only — global engine target bands unchanged/);
    }
  });

  it('Pro shows the numeric engine→regulator solver-target comparison; Demo hides it', () => {
    const proText = visibleText(render(view(), proPolicy));
    expect(proText).toMatch(/engine-seeded → regulator-shadow/);
    expect(proText).toMatch(/33–42/); // engine band
    expect(proText).toMatch(/42–50/); // regulator band
    // Demo: no numeric band comparison block (technical view gated)
    const demoText = visibleText(render(view(), demoPolicy));
    expect(demoText).not.toMatch(/engine-seeded → regulator-shadow/);
  });

  it('shows the regulator-shadow gram-solve summary in every tier (no grams in the summary)', () => {
    for (const policy of [demoPolicy, proPolicy, devPolicy]) {
      const t = visibleText(render(view(), policy));
      expect(t).toMatch(/regulator-shadow gram solve: tradeoff/);
      expect(t).toMatch(/differs from engine-seeded/);
    }
  });

  it('Demo hides both solves\' exact grams; Pro shows the engine-seeded + regulator-shadow gram comparison', () => {
    const demo = render(view(), demoPolicy);
    expect(demo).not.toContain('88.7'); // engine-seeded grams hidden
    expect(demo).not.toContain('142.3'); // regulator-shadow grams hidden
    expect(/dextrose/i.test(demo)).toBe(false);
    const pro = render(view(), proPolicy);
    expect(pro).toContain('engine-seeded solver added');
    expect(pro).toContain('88.7');
    expect(pro).toContain('regulator-shadow solver added');
    expect(pro).toContain('142.3');
  });
});

describe('OptimizationPreviewPanel — decision states', () => {
  it.each(['optimized', 'tradeoff', 'impossible', 'blocked', 'no_action_needed'] as OptimizationDecision[])(
    'renders the %s decision with its recommendation',
    (decision) => {
      const html = render(view({ finalDecision: decision }), demoPolicy);
      const text = visibleText(html);
      expect(text).toMatch(new RegExp(decision.replace(/_/g, ' ')));
      expect(text.length).toBeGreaterThan(20);
    },
  );
});

describe('OptimizationPreviewPanel — boundary + Studio gating', () => {
  const HERE = import.meta.dirname;
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const sources = ['OptimizationPreviewPanel.tsx', 'optimizationPreviewPolicy.ts'].map((f) =>
    strip(readFileSync(join(HERE, f), 'utf8')),
  );

  it('the panel + policy are pure display: no engine/DB/Mapper import, no save/pac-pod/status write', () => {
    for (const src of sources) {
      expect(/supabase|service_role/i.test(src)).toBe(false);
      expect(/@\/engine|mapper_basement|@\/services\/|@\/data\/products/.test(src)).toBe(false);
      expect(/calculateRecipe\s*\(|proposeAutoFix|applyAutoFix/.test(src)).toBe(false); // no engine call
      expect(/saveRecipe|persistRecipe|\.save\(/i.test(src)).toBe(false);
      expect(/pac_value\s*[:=]|pod_value\s*[:=]|setProductLifecycleStatus|pi_calculated/.test(src)).toBe(false);
      for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
        expect(src.includes(verb), verb).toBe(false);
      }
    }
  });

  const studioSrc = readFileSync(resolve(HERE, '..', '..', 'pages', 'studio', 'StudioPage.tsx'), 'utf8');
  const studio = strip(studioSrc);

  it('renders the preview in PRODUCTION Studio, not behind a DEV-only gate (Slice 15)', () => {
    expect(studio.includes('OptimizationPreviewPanel')).toBe(true);
    expect(studio.includes('Preview optimization')).toBe(true);
    expect(studio.includes('Optimize preview (DEV)')).toBe(false); // the old DEV-only label is gone
    // the panel is gated on the CLICKED state, not on import.meta.env.DEV
    const beforePanel = studio.slice(0, studio.indexOf('<OptimizationPreviewPanel')).slice(-180);
    expect(beforePanel).toMatch(/optimizationView\s*\?/);
    expect(beforePanel).not.toMatch(/import\.meta\.env\.DEV/);
  });

  it('is capability-gated by the display policy (demo/free redacted, Pro full)', () => {
    expect(/optimizationDisplayPolicy\(\s*\{\s*exactCorrectionGrams,\s*technicalView\s*\}/.test(studio)).toBe(true);
  });

  it('keeps the DEV debug trace gated to dev builds only (never forced on in production)', () => {
    expect(/\{\s*dev:\s*import\.meta\.env\.DEV\s*\}/.test(studio)).toBe(true);
    expect(/\{\s*dev:\s*true\s*\}/.test(studio)).toBe(false);
  });

  it('requires an explicit click and never auto-optimizes', () => {
    expect(/onClick=\{[\s\S]*?setOptimizationView\(previewOptimization/.test(studio)).toBe(true);
  });

  it('shows the production safety disclaimers', () => {
    expect(studio.includes('Preview only')).toBe(true);
    expect(/not applied automatically/.test(studio)).toBe(true);
    expect(/regulator-shadow target preview/.test(studio)).toBe(true);
    expect(/global engine target bands unchanged/.test(studio)).toBe(true);
    expect(/Exact grams available on Pro/.test(studio)).toBe(true);
  });

  it('never saves / persists / applies a correction from the Studio preview', () => {
    expect(/saveRecipe\(|persistRecipe\(/.test(studio)).toBe(false);
    expect(studio.includes('applyAutoFix')).toBe(false);
    expect(studio.includes('applyCorrectionActions')).toBe(false);
  });

  it('the Studio source touches no DB / Supabase / Mapper / pac-pod / product status', () => {
    expect(/supabase|service_role|mapper_basement/i.test(studio)).toBe(false);
    expect(/pac_value\s*[:=]|pod_value\s*[:=]|setProductLifecycleStatus|pi_calculated/.test(studio)).toBe(false);
    for (const v of ['.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(studio.includes(v), v).toBe(false);
    }
  });
});
