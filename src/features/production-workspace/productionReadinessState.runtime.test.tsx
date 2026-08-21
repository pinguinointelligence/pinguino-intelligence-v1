// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import {
  attachPracticalRecipeAudit,
  readPracticalRecipeAudit,
} from '@/features/practical-recipe/practicalRecipe';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import type { ProductionRepository } from '@/services/proCore/productionRepository';
import { useAuthStore } from '@/stores/authStore';
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { useProductionSessionStore } from './productionSessionStore';
import { productionVersionFingerprint } from './productionReadinessState';

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

import { useProductionWorkspace, type ProductionWorkspaceView } from './useProductionWorkspace';

const currentAudit = () => {
  const input = buildRecipeInput(useRecipeStore.getState(), 'planning');
  return readPracticalRecipeAudit(
    attachPracticalRecipeAudit(input, input, '2026-08-21T12:00:00.000Z'),
  )!;
};

describe('Production readiness runtime state machine', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let view: ProductionWorkspaceView | null;

  function Harness() {
    view = useProductionWorkspace(true);
    return null;
  }

  const render = async () => {
    await act(async () => root.render(<Harness />));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const loadSavedRecipe = () => {
    const input = {
      ...DEFAULT_PRESET,
      items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
      machine_capacity_grams: null,
    };
    const composition = recipeCompositionFromState({
      items: input.items,
      baseOrder: input.items.map((item) => item.id),
      productBehaviorSnapshots: productBehaviorTestSnapshots(input),
    });
    useRecipeStore.getState().loadRecipeInput(input, {
      savedId: 'readiness-recipe',
      savedName: 'Readiness QA',
      versionNumber: 1,
      versionId: 'readiness-version-1',
      versionDate: '2026-08-21T11:00:00.000Z',
      composition,
    });
    useRecipeStore.getState().acknowledgePracticalRecipeAudit(currentAudit());
    useRecipeProfileStore.getState().acknowledgeRecalculation();
  };

  const editBaseByOneGram = () => {
    useRecipeStore.setState((state) => ({
      items: state.items.map((item, index) => ({
        ...item,
        planned_grams: item.planned_grams + (index === 0 ? 1 : index === 1 ? -1 : 0),
      })),
      dirty: true,
      draftRevision: state.draftRevision + 1,
    }));
  };

  const acknowledgeApply = () => {
    useRecipeStore.getState().acknowledgePracticalRecipeAudit(currentAudit());
    useRecipeProfileStore.getState().acknowledgeRecalculation();
  };

  const markCurrentSaved = (version: number) => {
    const state = useRecipeStore.getState();
    const input = buildRecipeInput(state, 'planning');
    const composition = recipeCompositionFromState(state);
    useRecipeStore.getState().markSaved(
      'readiness-recipe',
      state.savedRecipeName ?? 'Readiness QA',
      version,
      `2026-08-21T12:${String(version).padStart(2, '0')}:00.000Z`,
      state.practicalRecipeAudit,
      `readiness-version-${version}`,
      productionVersionFingerprint(input, composition),
    );
  };

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    view = null;
    useRecipeStore.getState().resetToDemo();
    useRecipeProfileStore.getState().resetForTests();
    useConstraintStudioStore.getState().resetForTests();
    useProductionSessionStore.getState().clear();
    useCustomerPriceStore.getState().clear();
    useAuthStore.setState({
      status: 'authed',
      user: { id: 'readiness-owner', email: null, displayName: null },
      available: true,
    });
    const repository = {
      listRuns: vi.fn(async () => ({ items: [], nextCursor: null })),
    } as unknown as ProductionRepository;
    mocks.resolveProductionRepository.mockReturnValue({
      repository,
      mode: 'backend',
      isLocalDev: false,
      unavailable: false,
    });
    mocks.validateRecipeBehaviorOnServer.mockResolvedValue({
      ready: true,
      module: 'PRODUCTION',
      staleLineIds: [],
      lines: [],
      processReadiness: { schemaVersion: 1, status: 'READY', blockers: [], advisories: [] },
    });
    loadSavedRecipe();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    mocks.resolveProductionRepository.mockReset();
    mocks.validateRecipeBehaviorOnServer.mockReset();
  });

  it('moves deterministically through ready → recalc → save → ready and topping save-only', async () => {
    await render();
    await vi.waitFor(() => expect(view?.prerequisite).toBeNull());

    act(() => editBaseByOneGram());
    expect(useRecipeStore.getState().dirty).toBe(true);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
    await render();
    expect(view?.prerequisite).toMatchObject({
      code: 'preview_required',
      title: 'Najpierw przelicz recepturę',
    });

    act(() => acknowledgeApply());
    await render();
    expect(view?.prerequisite).toMatchObject({
      code: 'saved_version_required',
      title: 'Zapisz wersję wykonawczą',
    });

    act(() => markCurrentSaved(2));
    await render();
    await vi.waitFor(() => expect(view?.prerequisite).toBeNull());

    act(() => useRecipeStore.getState().addTopping(useRecipeStore.getState().items[0]!.ingredient, 20));
    await render();
    expect(view?.prerequisite).toMatchObject({ code: 'saved_version_required' });
    expect(view?.prerequisite?.code).not.toBe('preview_required');

    const toppingId = useRecipeStore.getState().toppings[0]!.id;
    act(() => useRecipeStore.getState().removeTopping(toppingId));
    await render();
    await vi.waitFor(() => expect(view?.prerequisite).toBeNull());
  });

  it('keeps name and customer price outside BASE recalculation', async () => {
    await render();
    await vi.waitFor(() => expect(view?.prerequisite).toBeNull());
    const first = useRecipeStore.getState().items[0]!;
    const canonicalId = canonicalIngredientId(first.ingredient);

    act(() => {
      useRecipeStore.setState({ savedRecipeName: 'Readiness QA — renamed' });
      useCustomerPriceStore.setState({
        activeOwnerUserId: 'readiness-owner',
        status: 'ready',
        overridesByCanonicalId: {
          [canonicalId]: {
            overrideId: 'price-readiness',
            ownerUserId: 'readiness-owner',
            canonicalIngredientId: canonicalId,
            pricePerKg: 99,
            currency: 'EUR',
            createdBy: 'readiness-owner',
            createdAt: '2026-08-21T12:00:00.000Z',
            updatedAt: '2026-08-21T12:00:00.000Z',
          },
        },
      });
    });
    await render();
    await vi.waitFor(() => expect(view?.prerequisite).toBeNull());
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
  });

  it('classifies rapid Apply → Production identically in 10 consecutive transitions', async () => {
    await render();
    await vi.waitFor(() => expect(view?.prerequisite).toBeNull());

    for (let cycle = 1; cycle <= 10; cycle += 1) {
      act(() => {
        editBaseByOneGram();
        acknowledgeApply();
      });
      await render();
      expect(view?.prerequisite, `cycle ${cycle}`).toMatchObject({
        code: 'saved_version_required',
        title: 'Zapisz wersję wykonawczą',
      });
    }
  });
});
