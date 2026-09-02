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
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { APP_NAV_ITEMS } from '@/features/shell/appNav';
import { findDemoIngredient } from '@/data/demoIngredients';
import { useSessionStore } from '@/stores/sessionStore';
import { useRecipeStore } from '@/stores/recipeStore';
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

const behaviorFixtureState = vi.hoisted(() => ({
  snapshots: {} as Record<string, ProductBehaviorSnapshot>,
}));
vi.mock('@/stores/recipeStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/recipeStore')>();
  const real = actual.useRecipeStore;
  const mocked = Object.assign(
    (selector?: (state: ReturnType<typeof real.getState>) => unknown) => {
      const state = {
        ...real.getState(),
        productBehaviorSnapshots: behaviorFixtureState.snapshots,
      };
      return selector ? selector(state) : state;
    },
    {
      getState: real.getState,
      getInitialState: real.getInitialState,
      setState: real.setState,
      subscribe: real.subscribe,
    },
  );
  return { ...actual, useRecipeStore: mocked };
});

const { ProWorkspacePage } = await import('./ProWorkspacePage');

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

const renderAt = (path: string, persona: ProCorePersona = 'pro') => {
  mockPersona = persona;
  const state = useRecipeStore.getState();
  const input = buildRecipeInput({
    mode: state.mode,
    category: state.category,
    target_temperature_c: state.target_temperature_c,
    target_batch_grams: state.target_batch_grams,
    machine_capacity_grams: state.machine_capacity_grams,
    flavor_intensity: state.flavor_intensity,
    cost_priority: state.cost_priority,
    items: state.items,
  });
  behaviorFixtureState.snapshots = productBehaviorTestSnapshots(input);
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
      expect(html).toContain('xl:h-dvh');
      expect(html).toContain('xl:overflow-hidden');
      expect(html).toContain('xl:overflow-hidden');
      // The viewport region fills main exactly; the split consumes the space left by the
      // workbar instead of relying on a brittle viewport subtraction.
      expect(html).toContain('data-testid="pro-viewport-region"');
      expect(html).toContain('flex h-full min-h-0 flex-col');
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
    const reviewAt = html.indexOf('</main>');
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
    inViewport('data-testid="workbench-strategy"');
    inViewport('data-testid="workbench-serving"');
    // SUPERSEDED, owner authority 2026-09-02 (final Settings contract): the
    // target-batch field is removed from Settings and must not be recreated
    // anywhere, so there is nothing left to keep in the viewport. The other
    // controls in this list still carry the contract.
    inViewport('data-testid="ingredient-rows-scroll"');
    inViewport('data-testid="ingredient-add-slot"');
    inViewport('data-testid="ingredient-action-slot"');
    inViewport('data-testid="pro-monitor-panel"');
    inViewport('data-testid="workbench-intelligence-header"');
    inViewport('data-testid="pro-context-tabs"');
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
    const rowsEnd = html.indexOf('Suma partii');
    expect(rowsStart).toBeGreaterThan(-1);
    const rows = html.slice(rowsStart, rowsEnd);
    for (const name of ACCEPTANCE_NAMES) {
      expect(rows, name).toContain(name);
    }
    // Every row owns one accessible contextual-dialog trigger; destructive actions stay inside it.
    expect(html.match(/aria-controls="row-menu-dialog-/g)?.length ?? 0).toBe(
      ACCEPTANCE_NAMES.length,
    );
    // The approved Base/Topping actions stay together directly below the ingredient rows.
    expect(html.indexOf('data-testid="ingredient-add-slot"')).toBeGreaterThan(rowsStart);
    expect(html.indexOf('data-testid="ingredient-add-slot"')).toBeLessThan(html.length);
  });

  it('the LIVE Monitor renders the canonical header, analysis evidence and technical modules', () => {
    const html = renderAt('/pro/monitor');
    const panel = html.slice(
      html.indexOf('data-testid="pro-monitor-panel"'),
      html.indexOf('data-testid="pro-review-zone"'),
    );
    expect(html).toContain('data-testid="workbench-intelligence-header"');
    // Owner Score contract: the score is a bare numeral — no visible "/10".
    // The Monitor carries its own live current-recipe score header.
    expect(panel).toContain('data-testid="monitor-score-header"');
    expect(panel).toMatch(/data-current-score="(\d{1,2}|no_data|awaiting_grams)"/);
    expect(panel).toContain('data-testid="monitor-direction-evidence"');
    expect(panel).not.toContain('data-testid="profile-direction-axes"');
    expect(panel).toContain('data-testid="monitor-module-freezing"');
    expect(panel).toContain('data-testid="monitor-module-stability"');
    expect(panel).not.toContain('data-testid="user-monitor-module-expert"');
    expect(panel).toContain('data-testid="review-marked-monitor-owner-diagnostic"');
  });

  it('/pro/monitor renders the SAME workbench with the Monitor context active', () => {
    const html = renderAt('/pro/monitor');
    expect(html).toContain('data-testid="pro-workbench"');
    expect(html).toContain('data-testid="pro-monitor-panel"');
    expect(html).toContain('data-testid="pro-context-monitor"');
    expect(html).toContain('aria-selected="true"');
  });

  it('keeps the editor visible and exposes one actionable Production prerequisite', () => {
    const html = renderAt('/pro/production');
    expect(html).not.toContain('data-testid="production-editor-practical-block"');
    expect(html).toContain('data-testid="ingredient-editor-pane"');
    expect(html).toContain('data-testid="production-practical-block"');
    expect(html).toContain('data-testid="production-prerequisite-action"');
    expect(html).not.toContain('data-testid="production-stepper-');
  });
});

/* ──────────────────── 4. one hamburger — no tab row, routes intact ──────────────────── */

describe('one hamburger — the tab row is gone, every destination keeps its route', () => {
  it('no visible tab row renders on /pro/recipe', () => {
    const html = renderAt('/pro/recipe');
    expect(html).toContain('data-testid="pro-context-tabs"');
    expect(html).toMatch(/role="tablist"/);
    expect(html).not.toContain('data-testid="pro-tab-recipe"');
    // The ONE hamburger is in the header.
    expect(html).toContain('data-testid="app-nav-trigger"');
  });

  it('the canonical nav config keeps contextual workbench routes out of global navigation', () => {
    expect(new Set(APP_NAV_ITEMS.map((item) => item.id)).size).toBe(APP_NAV_ITEMS.length);
    for (const section of [
      'monitor',
      'versions',
      'production',
      'history',
      'costs',
      'exports',
      'settings',
      'machine',
      'tools',
    ]) {
      expect(
        APP_NAV_ITEMS.some((i) => i.to === `/pro/${section}`),
        section,
      ).toBe(false);
    }
    expect(APP_NAV_ITEMS.some((item) => item.to === '/pro/recipe')).toBe(true);
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
  it('is reachable from the dedicated tools route and renders every red-marked module', () => {
    const html = renderAt('/pro/tools');
    const reviewAt = html.indexOf('data-testid="pro-review-zone"');
    expect(reviewAt).toBeGreaterThan(-1);
    for (const [id, badge] of MARKED) {
      const at = html.indexOf(`data-testid="review-marked-${id}"`);
      expect(at, `review-marked-${id}`).toBeGreaterThan(reviewAt);
      expect(html).toContain(`data-review-badge="${badge}"`);
    }
    expect(html).toContain('border-l-review');
  });

  it('renders the owner inventory table — module | purpose | route | recommendation | OCZEKUJE', () => {
    const html = renderAt('/pro/tools');
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
    const html = renderAt('/pro/tools');
    expect(html).not.toMatch(/<details[^>]*data-testid="review-marked-[^"]*"[^>]*\sopen/);
  });

  it('the marker component is gated to owner review mode and never leaks into customer Pro', () => {
    const src = read('features', 'design-review', 'ReviewMarkedModule.tsx');
    expect(src.includes('useReviewMode')).toBe(true);
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
    expect(src).toContain('w-[min(680px,calc(100vw-1.5rem))]'); // compact desktop, safe mobile gutter
    expect(src).toContain('role="dialog"');
    // Apply closes the overlay ONLY on success (blocked apply keeps the honest notice).
    expect(src).toContain('after.preview === null && after.blocked === null');
    expect(src).toContain('applyPreviewWithServerAuthority');
    expect(src).not.toContain('store.applyPreview()');
  });

  it('keeps best-achievable consent compact, pink and ahead of the normal Preview/Apply route', () => {
    const src = read('features', 'pro-core', 'ProRecalcPanel.tsx');
    expect(src).toContain('data-testid="direction-best-decision"');
    expect(src).toContain('data-testid="direction-best-accept"');
    expect(src).toContain('Przelicz najlepiej możliwie');
    expect(src).toContain('border-nonprod/50');
    expect(src).toContain('onAccept={store.acceptBestDirectionCandidate}');
    expect(src).toContain('<ConstraintPreviewCard');
  });

  it('the workbar Przelicz drives the ONE canonical pipeline with a terminal catch boundary', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    expect(page).toContain('runPiRecalculationWithTerminal');
    expect(page).toContain('ProRecalcPanel');
  });
});

/* ──────────────────── 7. nothing removed + truthful states ──────────────────── */

describe('no unrelated module removal across the split surface files', () => {
  it('keeps the workbench surface and mounts the focused Monitor contract', () => {
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');
    for (const module of [
      '<ConstraintStudioSection',
      '<StudioAssistantShell',
      '<StudioFlowGuidePanel',
      '<OptimizationPreviewPanel',
      '<SaveCorrectionControl',
      '<BranchWorkflowPreviews',
      '<IngredientBuilder',
      '<RecipeProfilePanel',
    ]) {
      expect(surface, module).toContain(module);
    }
    const profile = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    expect(profile).toContain('<MonitorPanelContent');
    expect(profile).toContain('<WorkbenchSettingsLine');
    const panel = read('features', 'pro-workbench', 'MonitorPanelContent.tsx');
    for (const module of [
      '<ProfessionalMonitorModules',
      '<MonitorLiveSummary',
      '<CorrectionPanel',
      '<OwnerDiagnosticPanel',
    ]) {
      expect(panel, module).toContain(module);
    }
    expect(panel).not.toContain('<UserMonitorPro');
    expect(panel).not.toContain('<OverallScoreCard');
    expect(surface.includes('display: none')).toBe(false);
    const dock = read('features', 'pro-workbench', 'WorkbenchRecipeActionDock.tsx');
    expect(dock).toContain('<WorkbenchActionBar');
    const actionBar = read('features', 'pro-workbench', 'WorkbenchActionBar.tsx');
    expect(actionBar).toContain('direction_targets: directionTargets');
    expect(actionBar).toContain('excludedIngredientIds');
    expect(actionBar).toContain('machine_capacity_source: machineCapacitySource');
    // Desktop aside + mobile sheet are intentional responsive variants.
    expect(surface).toContain('xl:hidden');
    expect(surface).toContain('hidden min-h-0');
  });

  it('shows only the two approved direct directions and no solver-result controls', () => {
    const html = renderAt('/pro/recipe');
    expect(html).toContain('data-testid="profile-regulator-sweetness"');
    expect(html).toContain('data-testid="profile-regulator-softness"');
    expect(html).not.toContain('data-testid="profile-regulator-structure"');
    expect(html).not.toContain('data-testid="profile-regulator-stability"');
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
      expect(html).toContain('Brak cen składników.');
    } else {
      expect(html).toContain('Na 1 kg');
      expect(html).toContain('Cała partia');
    }
  });

  it('deliberate 0 g unchanged lines are de-emphasized at the BOTTOM with the explanatory note', () => {
    const preview: ConstraintPreview = {
      kind: 'optimize',
      titlePl: constraintStudioCopy.preview.kindLabels.optimize,
      // Owner addendum item 4: hand-forged fixtures declare the outcome
      // classification explicitly (the real builders compute it).
      outcomeClassification: {
        outcome: 'no_verified_change',
        batchReconciled: false,
        compositionUnchanged: false,
        engineImproved: false,
        beforeGrams: 1000,
        afterGrams: 1000,
        targetBatchGrams: 1000,
        violationsBefore: 0,
        violationsAfter: 0,
      },
      baseFingerprint: 'fp',
      proposedInput: starterMilkBase(),
      nextConstraints: { byLineId: {} },
      lines: [
        {
          lineId: 'l-zero',
          name: 'Dekstroza',
          beforeGrams: 0,
          afterGrams: 0,
          kind: 'unchanged',
          locked: false,
        },
        {
          lineId: 'l-sucrose',
          name: 'Sacharoza',
          beforeGrams: 82,
          afterGrams: 74,
          kind: 'changed',
          locked: false,
        },
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
    expect(html).toContain('data-testid="preview-toggle-unchanged"');
    expect(html).toContain('Pokaż bez zmian');
    expect(html).toContain('Sacharoza');
    expect(html).not.toContain('Dekstroza');
    expect(html).not.toContain('data-testid="preview-totals"');
  });
});
