/**
 * ONE-SCREEN PRO WORKBENCH — the owner's regression proofs (P0 redirect, 2026-07-24).
 *
 * The owner REJECTED the long-page /pro/recipe: the professional editor is ONE SCREEN.
 * These are the structural proofs (node env — no layout engine, so the zero-page-scroll
 * rule is proven by its CSS containment contract, which is viewport-width-independent
 * and therefore holds at 1366×768, 1440×900 and 1920×1080 alike):
 *
 *  1. VIEWPORT LOCK — the shell root locks to `h-dvh` + `overflow-hidden` on lg and
 *     `main` is the ONE intentional scroll surface; the workbench region is `h-full`,
 *     so the BODY never scrolls during normal editing.
 *  2. THE 10-STEP NO-SCROLL FLOW — every edit-loop control (name/save/przelicz, settings
 *     line, gram inputs, locks, remove, add, LIVE Monitor, action bar, hamburger) lives
 *     INSIDE the viewport region, BEFORE the below-fold review zone.
 *  3. ACCEPTANCE FIXTURE — Strawberry/Milk/Cream/SMP/Sucrose/Dextrose/Inulin/Tara
 *     (8 ingredients) renders entirely inside the editor's internal row scroll.
 *  4. ONE HAMBURGER — the tab row is gone; every destination keeps a stable route in
 *     the canonical nav config (entries only ever ADDED — /pro/machine joined).
 *  5. RED REVIEW ZONE — below the fold, with the owner inventory table (OCZEKUJE).
 *  6. PRZELICZ OVERLAY — compact dialog (520–720 px), closed by default, never a page
 *     section; Zastosuj/Anuluj live inside it (no duplicated Save/Recalc).
 *  7. NOTHING REMOVED + truthful states (honest cost empty state, de-emphasized 0 g).
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
import { findDemoIngredient } from '@/data/demoIngredients';
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

/** The owner's zero-scroll ACCEPTANCE FIXTURE: the milk-base starter (Milk 3.5 % /
 * Cream 30 % / SMP / Sucrose / Dextrose / Tara gum) + Strawberry + Inulin = 8 rows. */
const ACCEPTANCE_NAMES = [
  'Strawberry',
  'Milk 3.5 %',
  'Cream 30 %',
  'Skimmed milk powder',
  'Sucrose',
  'Dextrose',
  'Inulin',
  'Tara gum',
];

/** The 8-ingredient acceptance `RecipeInput` — real demo compositions only. */
function acceptanceInput() {
  const base = starterMilkBase();
  const raspberry = findDemoIngredient('raspberry');
  const inulin = findDemoIngredient('inulin');
  if (!raspberry || !inulin) throw new Error('fixture: demo ingredients missing');
  const extra = [
    {
      id: 'accept:strawberry',
      ingredient: { ...raspberry, id: 'strawberry', name: 'Strawberry' },
      planned_grams: 120,
      actual_grams: null,
      lock_type: 'unlocked' as const,
    },
    {
      id: 'accept:inulin',
      ingredient: inulin,
      planned_grams: 15,
      actual_grams: null,
      lock_type: 'unlocked' as const,
    },
  ];
  const items = [...base.items, ...extra];
  return {
    ...base,
    items,
    target_batch_grams: items.reduce((sum, item) => sum + item.planned_grams, 0),
  };
}

beforeEach(() => {
  useSessionStore.getState().setPlan('pro');
});

/* ──────────────── 1. viewport lock — the zero-page-scroll contract ──────────────── */

describe.each([['1366×768'], ['1440×900'], ['1920×1080']])(
  'one-screen contract at %s (CSS containment is viewport-independent on lg)',
  (label) => {
    it(`body never scrolls during normal editing — ${label}`, () => {
      const html = renderAt('/pro/recipe');
      // The shell root locks to the viewport on desktop; main is the one scroll surface.
      expect(html).toContain('lg:h-dvh');
      expect(html).toContain('lg:overflow-hidden');
      expect(html).toContain('lg:overflow-y-auto');
      // The viewport region fills main exactly; the workbench section is height-locked.
      expect(html).toContain('data-testid="pro-viewport-region"');
      expect(html).toMatch(/lg:flex lg:h-full lg:min-h-0 lg:flex-col/);
      expect(html).toContain('data-testid="pro-workbench"');
    });

    it(`exactly TWO internal scroll surfaces inside the workbench (rows + Monitor) — ${label}`, () => {
      const html = renderAt('/pro/recipe');
      const region = html.slice(
        html.indexOf('data-testid="pro-viewport-region"'),
        html.indexOf('data-testid="pro-review-zone"'),
      );
      const internal = region.match(/overflow-y-auto/g) ?? [];
      expect(internal).toHaveLength(2); // ingredient rows + Monitor panel — nothing else
      expect(region).toContain('data-testid="ingredient-rows-scroll"');
      expect(region).toContain('data-testid="pro-monitor-panel"');
    });
  },
);

/* ─────────── 2+3. the 10-step no-scroll flow + the acceptance fixture ─────────── */

describe('the 10-step no-scroll flow — every edit-loop control inside the viewport region', () => {
  it('workbar, settings, rows, locks, remove, add, Monitor, action bar all precede the review zone', () => {
    const html = renderAt('/pro/recipe');
    const reviewAt = html.indexOf('data-testid="pro-review-zone"');
    expect(reviewAt).toBeGreaterThan(-1);
    const inViewport = (marker: string) => {
      const at = html.indexOf(marker);
      expect(at, `${marker} missing`).toBeGreaterThan(-1);
      expect(at, `${marker} must sit ABOVE the review zone`).toBeLessThan(reviewAt);
    };
    // 1 name+save · 2 settings · 3 grams · 4 lock · 5 remove · 6 add · 7 przelicz ·
    // 8 LIVE Monitor · 9 action bar · 10 hamburger
    inViewport('data-testid="pro-workbar-save"');
    inViewport('data-testid="workbench-settings-line"');
    inViewport('data-testid="workbench-product-type"');
    inViewport('data-testid="workbench-quality"');
    inViewport('data-testid="workbench-serving"');
    inViewport('data-testid="workbench-batch"');
    inViewport('data-testid="ingredient-rows-scroll"');
    inViewport('data-testid="ingredient-add-slot"');
    inViewport('data-testid="pro-workbar-recalc"');
    inViewport('data-testid="pro-monitor-panel"');
    inViewport('data-testid="monitor-live-summary"');
    inViewport('data-testid="workbench-action-bar"');
    inViewport('data-testid="app-nav-trigger"');
  });

  it('the 8-ingredient acceptance fixture renders entirely inside the internal row scroll', async () => {
    // Component-level render of the SAME editor the workbench mounts (layout="workbench"),
    // with the acceptance recipe as the ENGINE result — deterministic, store-independent.
    const { IngredientBuilder } = await import('@/features/ingredient-builder/IngredientBuilder');
    const input = acceptanceInput();
    const result = calculateRecipe(input);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <SurfaceToneContext.Provider value="shell">
          <IngredientBuilder
            items={result.items}
            totalBatchG={result.total_batch_g}
            targetBatchG={input.target_batch_grams}
            demo={false}
            layout="workbench"
          />
        </SurfaceToneContext.Provider>
      </QueryClientProvider>,
    );
    const rowsStart = html.indexOf('data-testid="ingredient-rows-scroll"');
    const rowsEnd = html.indexOf('data-testid="ingredient-add-slot"');
    expect(rowsStart).toBeGreaterThan(-1);
    const rows = html.slice(rowsStart, rowsEnd);
    for (const name of ACCEPTANCE_NAMES) {
      expect(rows, name).toContain(name);
    }
    // Per-row controls: a remove action exists for every line (aria carries the name).
    for (const name of ACCEPTANCE_NAMES) {
      expect(html).toContain(`${copy.studio.builder.remove} ${name}`);
    }
    // The add slot + batch total stay OUTSIDE the scroll region (always visible).
    expect(html.indexOf('data-testid="ingredient-add-slot"')).toBeGreaterThan(rowsEnd - 1);
  });

  it('the LIVE Monitor panel renders the real current result (score, axes, modules)', () => {
    const html = renderAt('/pro/recipe');
    const panel = html.slice(
      html.indexOf('data-testid="pro-monitor-panel"'),
      html.indexOf('data-testid="workbench-action-bar"'),
    );
    expect(panel).toContain('data-testid="monitor-summary-score"');
    expect(panel).toMatch(/\d{1,2}\/10/);
    expect(panel).toContain('data-testid="monitor-axis-stabilnosc"');
    expect(panel).toContain('data-testid="user-monitor-module-expert"');
    expect(panel).toContain('data-testid="review-marked-monitor-owner-diagnostic"');
  });

  it('/pro/monitor renders the SAME workbench with the Monitor panel focused', () => {
    const html = renderAt('/pro/monitor');
    expect(html).toContain('data-testid="pro-workbench"');
    expect(html).toContain('data-testid="pro-monitor-panel"');
    expect(html).toContain('ring-2 ring-inset'); // the focus ring
  });
});

/* ──────────────────── 4. one hamburger — no tab row, routes intact ──────────────────── */

describe('one hamburger — the tab row is gone, every destination keeps its route', () => {
  it('no visible tab row renders on /pro/recipe', () => {
    const html = renderAt('/pro/recipe');
    expect(html).not.toMatch(/role="tablist"/);
    expect(html).not.toContain('data-testid="pro-tab-recipe"');
    // The ONE hamburger is in the header.
    expect(html).toContain('data-testid="app-nav-trigger"');
  });

  it('the canonical nav config keeps EVERY entry — /pro/machine ADDED, nothing removed', () => {
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
      'proMachine',
    ]);
    for (const section of [
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
      expect(APP_NAV_ITEMS.some((i) => i.to === `/pro/${section}`), section).toBe(true);
    }
  });
});

/* ───────────── 5. red review zone — below the fold, OCZEKUJE inventory ───────────── */

const MARKED: Array<[string, string]> = [
  ['studio-tools', 'DO PRZEGLĄDU'],
  ['assistant', 'OPCJONALNE'],
  ['flow-guide', 'OPCJONALNE'],
  ['optimization', 'OPCJONALNE'],
  ['branch-previews', 'ADVANCED / REVIEW'],
];

describe('red review zone — always visible, below the fold, nothing hidden', () => {
  it('sits BELOW the workbench and renders every red-marked module', () => {
    const html = renderAt('/pro/recipe');
    const workbenchAt = html.indexOf('data-testid="pro-workbench"');
    const reviewAt = html.indexOf('data-testid="pro-review-zone"');
    expect(reviewAt).toBeGreaterThan(workbenchAt);
    for (const [id, badge] of MARKED) {
      const at = html.indexOf(`data-testid="review-marked-${id}"`);
      expect(at, `review-marked-${id}`).toBeGreaterThan(reviewAt);
      expect(html).toContain(`data-review-badge="${badge}"`);
    }
    expect(html).toContain('border-l-review');
  });

  it('renders the owner inventory table — module | purpose | route | recommendation | OCZEKUJE', () => {
    const html = renderAt('/pro/recipe');
    expect(html).toContain('data-testid="review-inventory-table"');
    for (const id of [
      'studio-tools',
      'assistant',
      'flow-guide',
      'optimization',
      'branch-previews',
      'owner-diagnostic',
      'presets',
    ]) {
      expect(html).toContain(`data-testid="review-inventory-${id}"`);
    }
    const zone = html.slice(html.indexOf('data-testid="pro-review-zone"'));
    expect(zone.match(/OCZEKUJE/g)?.length ?? 0).toBeGreaterThanOrEqual(7);
    expect(zone).toContain(copy.proWorkbench.reviewZone.columns.recommendation);
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
});

/* ───────────── 6. Przelicz z PI — compact overlay, never a page section ───────────── */

describe('recalculation overlay', () => {
  it('is CLOSED by default on /pro/recipe (no overlay in the initial DOM)', () => {
    const html = renderAt('/pro/recipe');
    expect(html).not.toContain('data-testid="pro-recalc-overlay"');
  });

  it('renders as a fixed compact dialog (520–720 px), with Zastosuj/Anuluj inside', () => {
    const src = read('features', 'pro-core', 'ProRecalcPanel.tsx');
    expect(src).toContain('data-testid="pro-recalc-overlay"');
    expect(src).toContain('fixed inset-0');
    expect(src).toContain('w-[min(660px,92vw)]'); // 520 ≤ 660 ≤ 720
    expect(src).toContain('role="dialog"');
    // Apply closes the overlay ONLY on success (blocked apply keeps the honest notice).
    expect(src).toContain('after.preview === null && after.blocked === null');
  });

  it('the workbar Przelicz drives the ONE canonical pipeline (createOptimizePreview)', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    expect(page).toContain('createOptimizePreview');
    expect(page).toContain('ProRecalcPanel');
  });
});

/* ──────────────────── 7. nothing removed + truthful states ──────────────────── */

describe('no module removal across the split surface files', () => {
  it('every legacy module is still MOUNTED (surface + monitor panel + review zone)', () => {
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');
    for (const module of [
      '<ConstraintStudioSection',
      '<StudioAssistantShell',
      '<StudioFlowGuidePanel',
      '<OptimizationPreviewPanel',
      '<SaveCorrectionControl',
      '<BranchWorkflowPreviews',
      '<IngredientBuilder',
      '<MonitorPanelContent',
      '<WorkbenchSettingsLine',
      '<WorkbenchActionBar',
    ]) {
      expect(surface, module).toContain(module);
    }
    const panel = read('features', 'pro-workbench', 'MonitorPanelContent.tsx');
    for (const module of [
      '<UserMonitorPro',
      '<NutritionCostScorePanel',
      '<CorrectionPanel',
      '<OverallScoreCard',
      '<OwnerDiagnosticPanel',
    ]) {
      expect(panel, module).toContain(module);
    }
    expect(surface.includes('display: none')).toBe(false);
    // The ONLY responsive `hidden` utility is the desktop Monitor aside — its content is
    // served to mobile by the MonitorDrawer bottom sheet (same MonitorPanelContent).
    const hiddenUtility = surface.match(/(?<![\w-])hidden(?![\w-])/g) ?? [];
    expect(hiddenUtility).toHaveLength(1);
    expect(surface).toMatch(/hidden[^`"]*lg:block/);
  });

  it('the pink demo-library marker stays visible in the viewport region', () => {
    const html = renderAt('/pro/recipe');
    const at = html.indexOf('data-testid="nonprod-marked-pro-demo-library"');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(html.indexOf('data-testid="pro-review-zone"'));
  });
});

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
      expect(html).toContain(copy.studio.metrics.costBatch);
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
    expect(html.indexOf('Sacharoza')).toBeLessThan(html.indexOf('Dekstroza'));
    expect(html).toContain('data-testid="preview-totals"');
  });
});
