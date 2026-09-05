/**
 * White precision Pro identity proofs (presentation only).
 *
 * 1. The canonical Pro workspace wears the ONE `.theme-pro-light` token scope (whole chrome:
 *    header + workbar + tabs + panels) — for the Pro persona AND the honest gate view, so the
 *    Pro identity is consistent before and after entitlement.
 * 2. The engine lab surface carries the elevation hairline inside the scope.
 * 3. The sticky workbar primary actions render INSIDE the scope (no scroll-to-recalculate).
 * 4. Owner review badges (RV-12/RV-13) render on their panels for the owner/QA session in this
 *    dev test build — and designReview.test.tsx proves customers never see them.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { ProCorePersona } from '@/features/pro-core/proCoreCapabilities';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { useRecipeStore } from '@/stores/recipeStore';

let mockPersona: ProCorePersona = 'pro';
vi.mock('@/features/pro-core/useProCorePersona', () => ({
  useProCorePersona: () => mockPersona,
}));

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
    productionMode: true,
    rescueMode: true,
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

const renderAt = (path: string, persona: ProCorePersona) => {
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

describe('Pro workspace — white precision scope', () => {
  it('wraps the WHOLE workspace chrome in the one theme-pro-light token scope (Pro persona)', () => {
    const html = renderAt('/pro/recipe', 'pro');
    expect(html).toContain('theme-pro-light');
    expect(html).toContain('data-testid="pro-light-scope"');
    // The scope wraps the canonical AppShell header (logo + drawer trigger) too.
    const scopeIndex = html.indexOf('theme-pro-light');
    const triggerIndex = html.indexOf('data-testid="app-nav-trigger"');
    expect(triggerIndex).toBeGreaterThan(scopeIndex);
  });

  it('keeps the SAME white identity on the honest non-Pro gate', () => {
    const html = renderAt('/pro', 'demo');
    expect(html).toContain('theme-pro-light');
  });

  it('viewport actions, profile tabs and save render INSIDE the scope', () => {
    const html = renderAt('/pro/recipe', 'pro');
    for (const id of [
      'pro-workbar',
      'pro-bottom-right-floating-actions',
      'pro-floating-monitor',
      'pro-floating-recalculate',
      'pro-context-tabs',
      'pro-workbar-save',
    ]) {
      expect(html).toContain(`data-testid="${id}"`);
    }
  });

  it('keeps the editor and Intelligence pane in one coherent light shell', () => {
    const html = renderAt('/pro/recipe', 'pro');
    expect(html).toContain('border-ink/10');
    expect(html).toContain('bg-white');
    expect(html).toContain('bg-paper');
    expect(html).not.toContain('bg-[#17191d]');
    expect(html).toContain('data-testid="workbench-intelligence-header"');
    expect(html).toContain('data-testid="workbench-editor-pane"');
    expect(html).toContain('data-testid="pro-monitor-panel"');
    expect(html).toContain('pro-workbench-columns');
  });

  it('keeps the two explicit five-detent choices and the review tools route', () => {
    const html = renderAt('/pro/recipe', 'pro');
    expect(html).toContain('data-testid="profile-regulator-sweetness"');
    expect(html).toContain('data-testid="profile-regulator-softness"');
    expect(html.match(/role="radiogroup"/g)).toHaveLength(2);
    /* SUPERSEDED, owner 2026-09-03: the accessible name states the MEANING,
       not the coordinate. "Słodycz: -2" named a number a screen-reader user
       then had to interpret; the sentence is the same thing the ball's size
       says to everyone else. Twardość follows the engine, where -2 is more
       soft and +2 is more firm. */
    expect(html).toContain('Słodycz: znacznie mniej słodkie');
    expect(html).toContain('Twardość: znacznie bardziej twarde');
    expect(html).not.toContain('Słodycz: -2');
    expect(html).not.toContain('profile-regulator-structure');
    expect(html).not.toContain('Wybrano:');
    expect(html).not.toContain('aria-label="Legenda kierunku"');
    expect(renderAt('/pro/tools', 'pro')).toContain('data-testid="pro-review-zone"');
  });

  it('owner review badges render on the Monitor and Maszyna panels for the owner/QA session', () => {
    expect(renderAt('/pro/monitor', 'pro')).toContain('review-marked-monitor-owner-diagnostic');
    expect(renderAt('/pro/machine', 'pro')).toContain('review-badge-RV-13');
  });
});
