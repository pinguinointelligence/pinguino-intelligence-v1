/**
 * /pro/recipe UX REPAIR proofs (owner P0, 2026-07-24 — the owner rejected the staging design).
 *
 * 1. PRIMARY PATH dominates top-to-bottom: workbar → compact core setup → ingredients table
 *    (hero) → in-flow „Przelicz z PI" → Preview slot — ONE column, no side-rail labyrinth.
 * 2. RED REVIEW MARKS: every non-core module kept on the page is wrapped in the ALWAYS-VISIBLE
 *    `ReviewMarkedModule` (red left border + red badge), collapsed by default — and the marker
 *    is NOT gated behind VITE_DESIGN_REVIEW / review mode (the owner sees it immediately).
 * 3. NOTHING REMOVED: all 9 workspace tabs render; the canonical nav config keeps every entry;
 *    every legacy module (Studio tools, assistant, flow guide, optimization, IF9/IF10, owner
 *    diagnostics) is still mounted — only calmer.
 * 4. TRUTHFUL STATES: honest cost empty state (never a blank box); deliberate 0 g preview
 *    lines are de-emphasized at the bottom with an explanatory note.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SurfaceToneContext } from '@/components/ui/surface';
import { copy } from '@/copy/en';
import { calculateRecipe } from '@/engine';
import {
  buildCustomerResult,
  createCustomerFlow,
  selectServingMode,
  setBatchGrams,
  setProductType,
} from '@/features/customer-flow';
import { constraintStudioCopy } from '@/features/constraint-studio/constraintStudioCopy';
import type { ConstraintPreview } from '@/features/constraint-studio/applyPipeline';
import { ConstraintPreviewCard } from '@/features/constraint-studio/ui/ConstraintPreviewCard';
import { NutritionCostScorePanel } from '@/features/pi-panel/NutritionCostScorePanel';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { APP_NAV_ITEMS } from '@/features/shell/appNav';
import { useSessionStore } from '@/stores/sessionStore';
import type { ProCorePersona } from '@/features/pro-core/proCoreCapabilities';

let mockPersona: ProCorePersona = 'pro';
vi.mock('@/features/pro-core/useProCorePersona', () => ({
  useProCorePersona: () => mockPersona,
}));

// Full Pro capabilities so the REAL exact-gram surface mounts (the owner's staging view).
vi.mock('@/access/useAccess', () => ({
  useAccess: () => ({
    plan: 'pro',
    tier: 'pro',
    isSignedIn: true,
    isPro: true,
    exactCorrectionGrams: true,
    fullFormula: true,
    technicalView: true,
    canViewExactGrams: true,
    canApplyStarterToStudio: true,
    saveRecipes: true,
    myRecipes: true,
    productionMode: false,
    rescueMode: false,
  }),
}));

const { ProWorkspacePage } = await import('./ProWorkspacePage');

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

const renderAt = (path: string, persona: ProCorePersona = 'pro') => {
  mockPersona = persona;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/pro" element={<ProWorkspacePage />} />
          <Route path="/pro/:section" element={<ProWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  // Full Pro capabilities so the real (exact-gram) surface mounts.
  useSessionStore.getState().setPlan('pro');
});

/* ─────────────────────────── 1. primary path order ─────────────────────────── */

describe('primary path — ONE top-to-bottom column', () => {
  it('orders workbar → core setup → ingredients → in-flow Przelicz → secondary section', () => {
    const html = renderAt('/pro/recipe');
    const order = [
      'data-testid="pro-workbar"',
      'data-testid="pro-primary-flow"',
      'data-testid="product-type-gelato"', // compact core setup (GoalSetup)
      'data-testid="quality-premium"',
      'data-testid="serving-temp_minus_12"',
      'data-testid="pro-flow-recalc"', // in-flow „Przelicz z PI"
      'data-testid="pro-secondary-section"',
    ];
    let last = -1;
    for (const marker of order) {
      const idx = html.indexOf(marker);
      expect(idx, `${marker} missing or out of order`).toBeGreaterThan(last);
      last = idx;
    }
    // The in-flow trigger carries the SAME canonical label as the workbar action.
    expect(html).toContain(copy.proWorkbar.recalc);
  });

  it('the secondary section is ONE calm labelled group with the analysis modules collapsed', () => {
    const html = renderAt('/pro/recipe');
    expect(html).toContain(copy.studio.secondary.title);
    for (const id of ['score', 'monitor', 'nutrition', 'corrections']) {
      expect(html).toContain(`data-testid="secondary-module-${id}"`);
    }
    // Collapsed by default: no <details ... open> anywhere in the secondary modules.
    expect(html).not.toMatch(/<details[^>]*data-testid="secondary-module-[^"]*"[^>]*\sopen/);
  });
});

/* ─────────────────────────── 2. red review marks ─────────────────────────── */

const MARKED: Array<[string, string]> = [
  ['studio-tools', 'DO PRZEGLĄDU'],
  ['assistant', 'OPCJONALNE'],
  ['flow-guide', 'OPCJONALNE'],
  ['optimization', 'OPCJONALNE'],
  ['branch-previews', 'ADVANCED / REVIEW'],
  ['owner-diagnostic', 'ADVANCED'],
];

describe('red review marks — always visible, collapsed, nothing hidden', () => {
  it('renders every marked module with its red badge on /pro/recipe', () => {
    const html = renderAt('/pro/recipe');
    for (const [id, badge] of MARKED) {
      expect(html, `review-marked-${id}`).toContain(`data-testid="review-marked-${id}"`);
      expect(html, `badge of ${id}`).toContain(`data-review-badge="${badge}"`);
    }
    // The badge text itself is rendered (color is never the only carrier).
    for (const badge of ['DO PRZEGLĄDU', 'OPCJONALNE', 'ADVANCED / REVIEW']) {
      expect(html).toContain(badge);
    }
    // Red visual mark: the review-red left border on the module frame.
    expect(html).toContain('border-l-review');
  });

  it('marked modules are collapsed by default (details without open)', () => {
    const html = renderAt('/pro/recipe');
    expect(html).not.toMatch(/<details[^>]*data-testid="review-marked-[^"]*"[^>]*\sopen/);
  });

  it('the marker component is NOT gated behind review mode or env flags (owner sees it immediately)', () => {
    const src = read('features', 'design-review', 'ReviewMarkedModule.tsx');
    expect(src.includes('useReviewMode')).toBe(false);
    expect(src.includes('VITE_DESIGN_REVIEW')).toBe(false);
    expect(src.includes('import.meta.env')).toBe(false);
  });

  it('owner QA diagnostics stays, renamed „Diagnostyka właściciela" with the red ADVANCED badge', () => {
    const html = renderAt('/pro/recipe');
    expect(html).toContain(copy.studio.secondary.reviewMarked.ownerDiagnostic);
    const idx = html.indexOf('data-testid="review-marked-owner-diagnostic"');
    expect(idx).toBeGreaterThan(-1);
    expect(html.slice(idx, idx + 400)).toContain('ADVANCED');
  });
});

/* ────────────────── 3. nothing removed (routes, menu, modules) ────────────────── */

describe('no route / menu / function removal', () => {
  it('all 9 workspace tabs still render on /pro/recipe', () => {
    const html = renderAt('/pro/recipe');
    for (const tab of [
      'recipe',
      'monitor',
      'versions',
      'production',
      'history',
      'costs',
      'exports',
      'settings',
      'machine',
    ]) {
      expect(html, `tab ${tab}`).toContain(`data-testid="pro-tab-${tab}"`);
    }
  });

  it('the canonical nav config keeps EVERY entry (no menu removal)', () => {
    expect(APP_NAV_ITEMS.map((item) => item.id)).toEqual([
      'home',
      'start',
      'proHome',
      'recipes',
      'myRecipes',
      'machine',
      'labels',
      'subscription',
      'proRecipe',
      'proMonitor',
      'proVersions',
      'proProduction',
      'proHistory',
      'proCosts',
      'proExports',
      'proSettings',
    ]);
  });

  it('every legacy module is still MOUNTED in the surface source (never deleted/CSS-hidden)', () => {
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');
    for (const module of [
      '<ConstraintStudioSection',
      '<StudioAssistantShell',
      '<StudioFlowGuidePanel',
      '<OptimizationPreviewPanel',
      '<SaveCorrectionControl',
      '<BranchWorkflowPreviews',
      '<OwnerDiagnosticPanel',
      '<UserMonitorPro',
      '<NutritionCostScorePanel',
      '<CorrectionPanel',
      '<OverallScoreCard',
    ]) {
      expect(surface, module).toContain(module);
    }
    expect(surface.includes('display: none')).toBe(false);
    expect(/className="[^"]*\bhidden\b/.test(surface)).toBe(false); // no CSS-hiding utility
  });
});

/* ─────────────────────────── 4. truthful states ─────────────────────────── */

function realResult() {
  let s = createCustomerFlow({ text: 'lody pistacjowe' });
  s = setProductType(s, 'gelato');
  s = selectServingMode(s, 'temp_minus_12');
  s = setBatchGrams(s, 1000);
  const input = buildCustomerResult(s).recipeInput;
  if (input === null) throw new Error('fixture: expected a calculated recipe');
  return calculateRecipe(input);
}

describe('truthful states', () => {
  it('cost without prices renders the HONEST empty-state copy, never a blank box', () => {
    const result = realResult();
    const html = renderToStaticMarkup(
      <SurfaceToneContext.Provider value="shell">
        <NutritionCostScorePanel result={result} />
      </SurfaceToneContext.Provider>,
    );
    if (result.costs === null) {
      expect(html).toContain('data-testid="cost-empty-state"');
      expect(html).toContain(copy.studio.metrics.costEmpty);
    } else {
      expect(html).toContain(copy.studio.metrics.costPerKg);
    }
  });

  it('deliberate 0 g unchanged lines are de-emphasized at the BOTTOM with the explanatory note', () => {
    const preview: ConstraintPreview = {
      kind: 'optimize',
      titlePl: constraintStudioCopy.preview.kindLabels.optimize,
      baseFingerprint: 'fp',
      proposedInput: starterMilkBase(),
      nextConstraints: { byLineId: {} },
      lines: [
        { lineId: 'l-zero', name: 'Dekstroza', beforeGrams: 0, afterGrams: 0, kind: 'unchanged', locked: false },
        { lineId: 'l-sucrose', name: 'Sacharoza', beforeGrams: 82, afterGrams: 74, kind: 'changed', locked: false },
      ],
      violationsBefore: 1,
      violationsAfter: 0,
      explanation: [],
      engineVersion: 'e',
      configVersion: 'c',
      createdAt: '2026-07-17T12:00:00.000Z',
    };
    const html = renderToStaticMarkup(
      <ConstraintPreviewCard preview={preview} onApply={() => {}} onCancel={() => {}} />,
    );
    expect(html).toContain('data-testid="preview-zero-unchanged"');
    expect(html).toContain(constraintStudioCopy.preview.zeroUnchangedNote);
    // The 0 g line moved BELOW the changed line — not top-of-list noise.
    expect(html.indexOf('Sacharoza')).toBeLessThan(html.indexOf('Dekstroza'));
    // Totals still count every line (batch invariant untouched).
    expect(html).toContain('data-testid="preview-totals"');
  });
});
