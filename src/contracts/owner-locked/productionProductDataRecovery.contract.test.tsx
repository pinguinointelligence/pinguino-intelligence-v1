// @vitest-environment jsdom
/**
 * OWNER-LOCKED — PC-07.
 *
 * A saved version whose ProductBehavior evidence has gone stale is correctly
 * refused by Production. The defect was that the refusal was a dead end: its
 * only action was „Wróć do receptury", and the cure — the working-copy refresh —
 * lives behind Przelicz, which a saved recipe with a current score never shows.
 *
 * The contract is therefore narrow and behavioural: when every reason the
 * server gives is a lifecycle/freshness one, Production must offer the refresh
 * itself; when any reason is missing product science, it must NOT — those keep
 * their existing truthful product-data actions. Nothing here touches
 * formulation science, the solver, Direction, or the batch authority.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { attachPracticalRecipeAudit } from '@/features/practical-recipe/practicalRecipe';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';

const mocks = vi.hoisted(() => ({
  resolveProductionRepository: vi.fn(),
  validateRecipeBehaviorOnServer: vi.fn(),
}));

vi.mock('@/features/pro-core/proCoreProductionRepo', () => ({
  resolveProductionRepository: mocks.resolveProductionRepository,
}));

vi.mock('@/services/productIntelligence', () => ({
  validateRecipeBehaviorOnServer: mocks.validateRecipeBehaviorOnServer,
}));

import {
  behaviorValidationSupportsRefresh,
  useProductionWorkspace,
  type ProductionWorkspaceView,
} from '@/features/production-workspace/useProductionWorkspace';

/** The exact reason string staging returns for the PC-07 fixture. */
const PC07_REASON =
  'behavior_snapshot_missing_or_unresolved:56fd518a-e78a-a283-f1a5-7716e4e52f9c:PI-ING-000163:53d9c515-e891-4c9c-88f9-faf7dde9c523:PRODUCTION:refresh_product_data';

const refusal = (reasons: string[]) => ({
  ready: false,
  module: 'PRODUCTION' as const,
  staleLineIds: ['line-stale'],
  lines: [{ lineId: 'line-stale', state: 'stale' as const, reasons }],
  processReadiness: {
    schemaVersion: 1 as const,
    status: 'READY' as const,
    blockers: [],
    advisories: [],
  },
});

describe('OWNER-LOCKED — a stale-product refusal in Production carries its own cure', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let view: ProductionWorkspaceView | null;

  function EnabledHarness() {
    view = useProductionWorkspace(true);
    return null;
  }

  const renderAndSettle = async () => {
    await act(async () => root.render(<EnabledHarness />));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    view = null;
    useAuthStore.setState({
      status: 'authed',
      user: { id: 'owner-pc07', email: null, displayName: null },
      available: true,
    });

    // A saved, unedited, whole-gram version — production-ready by PC-06, so the
    // only thing that can hold it here is the server's product verdict.
    const plannedInput = {
      ...DEFAULT_PRESET,
      items: DEFAULT_PRESET.items.map((item) => ({
        ...item,
        planned_grams: Math.round(item.planned_grams),
        actual_grams: null,
      })),
      machine_capacity_grams: null,
    };
    const withAudit = attachPracticalRecipeAudit(
      plannedInput,
      plannedInput,
      '2026-08-29T22:02:10.000Z',
    );
    const composition = recipeCompositionFromState({
      items: withAudit.items,
      baseOrder: withAudit.items.map((item) => item.id),
      productBehaviorSnapshots: productBehaviorTestSnapshots(withAudit),
    });
    useRecipeStore.getState().loadRecipeInput(withAudit, {
      savedId: 'recipe-pc07',
      savedName: 'PC-07 saved version',
      versionNumber: 2,
      versionId: 'version-pc07',
      versionDate: '2026-08-29T22:02:10.000Z',
      composition,
    });
    useProductionSessionStore.setState({ session: null, archivedSessions: [] });
    mocks.resolveProductionRepository.mockReturnValue({
      repository: null,
      mode: 'local',
      isLocalDev: true,
      unavailable: false,
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    useProductionSessionStore.getState().clear();
    mocks.resolveProductionRepository.mockReset();
    mocks.validateRecipeBehaviorOnServer.mockReset();
  });

  it('1. offers the refresh when every reason is a lifecycle/freshness one', async () => {
    mocks.validateRecipeBehaviorOnServer.mockResolvedValue(refusal([PC07_REASON]));
    await renderAndSettle();

    const prerequisite = view?.prerequisite ?? null;
    expect(prerequisite).not.toBeNull();
    expect(prerequisite?.code).toBe('product_authority_required');
    expect(prerequisite?.action).toBe('refresh_product_behavior');
    expect(prerequisite?.actionLabel).toBe('Utwórz nową wersję z aktualnymi danymi produktów');
  });

  it('2. still refuses — the cure is offered, the batch is not started', async () => {
    mocks.validateRecipeBehaviorOnServer.mockResolvedValue(refusal([PC07_REASON]));
    await renderAndSettle();

    // The blocker is still a blocker; only the way out changed.
    expect(view?.prerequisite).not.toBeNull();
    expect(useProductionSessionStore.getState().session).toBeNull();
    expect(view?.prerequisite?.title).toBe('Nie udało się potwierdzić produktów');
  });

  it('3. keeps the product-data action when a reason is not refreshable', async () => {
    mocks.validateRecipeBehaviorOnServer.mockResolvedValue(
      refusal([PC07_REASON, 'module_not_eligible:p:none:v:PRODUCTION:return_to_recipe']),
    );
    await renderAndSettle();

    expect(view?.prerequisite?.action).toBe('return_to_recipe');
    expect(view?.prerequisite?.actionLabel).toBe('Wróć do receptury');
  });

  it('4. a transport failure never offers a refresh that cannot help', async () => {
    mocks.validateRecipeBehaviorOnServer.mockRejectedValue(new Error('network down'));
    await renderAndSettle();

    expect(view?.prerequisite?.action).toBe('return_to_recipe');
  });

  it('5. a ready verdict leaves Production open with no prerequisite', async () => {
    mocks.validateRecipeBehaviorOnServer.mockResolvedValue({
      ready: true,
      module: 'PRODUCTION',
      staleLineIds: [],
      lines: [],
      processReadiness: { schemaVersion: 1, status: 'READY', blockers: [], advisories: [] },
    });
    await renderAndSettle();

    expect(view?.prerequisite ?? null).toBeNull();
  });

  it('6. the refreshability verdict reuses the refresh authority, not a local copy', () => {
    expect(behaviorValidationSupportsRefresh(refusal([PC07_REASON]))).toBe(true);
    expect(behaviorValidationSupportsRefresh(refusal(['missing_product_science']))).toBe(false);
    // An empty verdict is not evidence of freshness staleness.
    expect(behaviorValidationSupportsRefresh({ lines: [] })).toBe(false);

    const source = readFileSync(
      'src/features/production-workspace/useProductionWorkspace.ts',
      'utf8',
    );
    expect(source).toContain('productBehaviorIssuesSupportWorkingCopyRefresh');
  });

  it('7. every prerequisite action the hook can emit is handled by the cockpit', () => {
    const hook = readFileSync(
      'src/features/production-workspace/useProductionWorkspace.ts',
      'utf8',
    );
    const union = hook.slice(hook.indexOf('export type ProductionPrerequisiteAction'));
    const declared = [
      ...union.slice(0, union.indexOf(';')).matchAll(/'([a-z_]+)'/g),
    ].map((match) => match[1]!);
    expect(declared).toContain('refresh_product_behavior');

    const cockpit = readFileSync(
      'src/features/production-workspace/ProductionCockpit.tsx',
      'utf8',
    );
    // The last branch of the action chain is the fallback, so every other action
    // must be named explicitly for the dead end not to come back.
    for (const action of declared.filter((name) => name !== 'return_to_recipe')) {
      expect(cockpit).toContain(`prerequisite.action === '${action}'`);
    }
    expect(cockpit).toContain('refreshCurrentRecipeBehaviorWorkingCopy');
  });

  it('8. readiness still reads no Direction axis and no formulation science', () => {
    const source = readFileSync(
      'src/features/production-workspace/useProductionWorkspace.ts',
      'utf8',
    );
    const helper = source.slice(
      source.indexOf('export function behaviorValidationSupportsRefresh'),
    );
    const body = helper.slice(0, helper.indexOf('\n}\n'));
    for (const forbidden of ['direction_targets', 'sweetness', 'softness', 'POD', 'PAC']) {
      expect(body).not.toContain(forbidden);
    }
  });
});
