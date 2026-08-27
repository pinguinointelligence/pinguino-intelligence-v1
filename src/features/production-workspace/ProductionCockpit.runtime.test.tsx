// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import type { ProductionWorkspaceView } from './useProductionWorkspace';
import { ProductionCockpit } from './ProductionCockpit';
import {
  confirmProductionLine,
  createProductionSession,
  productionProgress,
} from './productionSession';

describe('Production correction decision accessibility', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('moves focus to the newly opened live decision panel', async () => {
    const plannedInput = {
      ...DEFAULT_PRESET,
      items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
      machine_capacity_grams: null,
    };
    const session = createProductionSession({
      sessionId: 'run-focus-1',
      ownerUserId: 'owner-focus',
      source: {
        recipeId: 'recipe-focus',
        recipeVersionId: 'version-focus',
        recipeVersionNumber: 1,
        recipeName: 'Focus QA',
      },
      plannedInput,
      startedAt: '2026-08-19T10:00:00.000Z',
    });
    const production = {
      session,
      progress: productionProgress(session),
      toppingProgress: null,
      rescue: { state: 'options', options: [] },
      score: { score: 10 },
      prerequisite: null,
      persistenceBusy: false,
      persistenceError: null,
      rescueAuthorizationInvalidation: null,
      rescueAuthorization: {
        status: 'preview',
        authorization: {
          authorizationId: 'authorization-focus-1',
          candidateFingerprint: 'b'.repeat(64),
          runId: session.sessionId,
          stableOptionId: 'keep_original_batch',
          expectedActualRevision: 0,
          expectedRescueRevision: 0,
          authorizedAt: '2026-08-19T10:01:00.000Z',
          expiresAt: '2099-08-19T10:06:00.000Z',
          preview: {
            title: 'Zachowaj pierwotną partię',
            explanation: 'Serwer zweryfikował plan.',
            finalMassG: plannedInput.target_batch_grams,
            scoreDisplay: '10/10',
            instructions: [],
          },
        },
        consumeIdempotencyKey: 'consume-focus-1',
        refreshRequired: false,
        error: null,
      },
      archiveStaleSession: vi.fn(),
      requestRescueAuthorization: vi.fn(),
      refreshRescueAuthorization: vi.fn(),
      consumeAuthorizedRescue: vi.fn(),
      dismissRescueAuthorization: vi.fn(),
      setDraftActual: vi.fn(),
      confirmLine: vi.fn(),
      reopenRecord: vi.fn(),
      complete: vi.fn(),
      startNewSession: vi.fn(),
    } as unknown as ProductionWorkspaceView;

    await act(async () =>
      root.render(
        <ProductionCockpit
          production={production}
          onOpenPreview={vi.fn()}
          onRecalculate={vi.fn()}
          onReturnToRecipe={vi.fn()}
        />,
      ),
    );

    const decisionPanel = host.querySelector<HTMLElement>(
      '[data-testid="production-rescue-options"]',
    );
    expect(decisionPanel).not.toBeNull();
    expect(decisionPanel).toHaveProperty('tabIndex', -1);
    expect(decisionPanel?.getAttribute('role')).toBe('status');
    expect(decisionPanel?.getAttribute('aria-live')).toBe('polite');
    expect(document.activeElement).toBe(decisionPanel);
  });

  it('renders correction choices as separate whole-card controls with one shared action', async () => {
    const plannedInput = {
      ...DEFAULT_PRESET,
      items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
      machine_capacity_grams: null,
    };
    const session = createProductionSession({
      sessionId: 'run-decision-cards-1',
      ownerUserId: 'owner-focus',
      source: {
        recipeId: 'recipe-focus',
        recipeVersionId: 'version-focus',
        recipeVersionNumber: 1,
        recipeName: 'Decision cards QA',
      },
      plannedInput,
      startedAt: '2026-08-27T10:00:00.000Z',
    });
    const selectRescueOption = vi.fn();
    const applySelectedRescueOption = vi.fn();
    const authorization = {
      authorizationId: 'authorization-cards-1',
      candidateFingerprint: 'd'.repeat(64),
      runId: session.sessionId,
      expectedActualRevision: 0,
      expectedRescueRevision: 0,
      authorizedAt: '2026-08-27T10:01:00.000Z',
      expiresAt: '2099-08-27T10:06:00.000Z',
      preview: {
        title: 'Autoryzowana korekta',
        explanation: 'Serwer zweryfikował plan.',
        finalMassG: 1_100,
        scoreDisplay: '10/10',
        instructions: [],
      },
    };
    const unavailable = { status: 'unavailable' as const, reason: 'Niedostępne.' };
    const production = {
      session,
      progress: productionProgress(session),
      toppingProgress: null,
      rescue: { state: 'options', options: [] },
      score: { score: 9, label: 'Świetnie dopasowana' },
      plannedScore: { score: 10, label: 'Wyjątkowo dobrze dopasowana' },
      prerequisite: null,
      persistenceBusy: false,
      persistenceError: null,
      rescueOptionsCalculating: false,
      selectedRescueOptionId: null,
      recommendedRescueOptionId: 'enlarge_batch',
      rescueOptionStates: {
        keep_original_batch: unavailable,
        enlarge_batch: {
          status: 'available' as const,
          authorization: {
            ...authorization,
            stableOptionId: 'enlarge_batch' as const,
          },
          consumeIdempotencyKey: 'consume-enlarge-1',
        },
        restore_original_recipe: {
          status: 'available' as const,
          authorization: {
            ...authorization,
            authorizationId: 'authorization-cards-2',
            stableOptionId: 'restore_original_recipe' as const,
          },
          consumeIdempotencyKey: 'consume-restore-1',
        },
        leave_as_is: unavailable,
      },
      selectRescueOption,
      applySelectedRescueOption,
    } as unknown as ProductionWorkspaceView;

    await act(async () =>
      root.render(
        <ProductionCockpit
          production={production}
          onOpenPreview={vi.fn()}
          onRecalculate={vi.fn()}
          onReturnToRecipe={vi.fn()}
        />,
      ),
    );

    const decisionList = host.querySelector<HTMLElement>(
      '[data-testid="production-decision-list"]',
    );
    const enlarge = host.querySelector<HTMLButtonElement>(
      '[data-testid="production-decision-enlarge_batch"]',
    );
    const restore = host.querySelector<HTMLButtonElement>(
      '[data-testid="production-decision-restore_original_recipe"]',
    );
    const apply = host.querySelector<HTMLButtonElement>(
      '[data-testid="apply-selected-production-decision"]',
    );
    expect(decisionList?.className).toContain('gap-3');
    expect(decisionList?.className).not.toContain('divide-y');
    expect(enlarge?.className).toContain('border');
    expect(restore?.className).toContain('border');
    expect(enlarge?.className).toContain('hover:border-ink/25');
    expect(enlarge?.className).toContain('active:translate-y-px');
    expect(enlarge?.className).toContain('pro-focus-ring');
    expect(enlarge?.tagName).toBe('BUTTON');
    expect(restore?.tagName).toBe('BUTTON');
    expect(apply?.disabled).toBe(true);
    expect(apply?.textContent).toContain('Wybierz sposób korekty');
    expect(host.querySelector('[data-testid="complete-production"]')).toBeNull();

    await act(async () => enlarge?.click());
    expect(selectRescueOption).toHaveBeenCalledWith('enlarge_batch');

    await act(async () =>
      root.render(
        <ProductionCockpit
          production={{ ...production, selectedRescueOptionId: 'enlarge_batch' }}
          onOpenPreview={vi.fn()}
          onRecalculate={vi.fn()}
          onReturnToRecipe={vi.fn()}
        />,
      ),
    );

    const selected = host.querySelector<HTMLElement>(
      '[data-testid="production-decision-enlarge_batch"]',
    );
    const neutral = host.querySelector<HTMLElement>(
      '[data-testid="production-decision-restore_original_recipe"]',
    );
    const selectedApply = host.querySelector<HTMLButtonElement>(
      '[data-testid="apply-selected-production-decision"]',
    );
    expect(selected?.getAttribute('data-decision-state')).toBe('selected');
    expect(selected?.textContent).toContain('✓ Wybrano');
    expect(neutral?.getAttribute('data-decision-state')).toBe('available');
    expect(neutral?.textContent).not.toContain('✓ Wybrano');
    expect(selectedApply?.disabled).toBe(false);
    expect(selectedApply?.textContent).toContain('Zastosuj minimalną korektę');

    await act(async () => selectedApply?.click());
    expect(applySelectedRescueOption).toHaveBeenCalledTimes(1);

    await act(async () =>
      root.render(
        <ProductionCockpit
          production={{ ...production, selectedRescueOptionId: 'restore_original_recipe' }}
          onOpenPreview={vi.fn()}
          onRecalculate={vi.fn()}
          onReturnToRecipe={vi.fn()}
        />,
      ),
    );
    expect(
      host.querySelector('[data-testid="apply-selected-production-decision"]')?.textContent,
    ).toContain('Przywróć proporcje');
  });

  it('offers an explicit safe recovery when every trusted decision is unavailable', async () => {
    const plannedInput = {
      ...DEFAULT_PRESET,
      items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
      machine_capacity_grams: null,
    };
    const session = createProductionSession({
      sessionId: 'run-no-dead-end-1',
      ownerUserId: 'owner-focus',
      source: {
        recipeId: 'recipe-focus',
        recipeVersionId: 'version-focus',
        recipeVersionNumber: 1,
        recipeName: 'No dead-end QA',
      },
      plannedInput,
      startedAt: '2026-08-25T10:00:00.000Z',
    });
    const cancelCurrentSession = vi.fn();
    const production = {
      session,
      progress: productionProgress(session),
      toppingProgress: null,
      rescue: { state: 'options', options: [] },
      score: { score: 9, label: 'Świetnie dopasowana' },
      plannedScore: { score: 10, label: 'Wyjątkowo dobrze dopasowana' },
      prerequisite: null,
      persistenceBusy: false,
      persistenceError: null,
      rescueOptionsCalculating: false,
      selectedRescueOptionId: null,
      rescueOptionStates: {
        keep_original_batch: {
          status: 'unavailable',
          reason: 'Niedostępne — potwierdzonych ilości nie można dopasować do 1000 g.',
        },
        enlarge_batch: {
          status: 'unavailable',
          reason: 'Niedostępne — Engine nie znalazł bezpiecznej większej partii.',
        },
        restore_original_recipe: {
          status: 'unavailable',
          reason: 'Niedostępne — nie można przywrócić proporcji.',
        },
        leave_as_is: {
          status: 'unavailable',
          reason: 'Niedostępne — przekroczono twardy zakres laktozy.',
        },
      },
      cancelCurrentSession,
    } as unknown as ProductionWorkspaceView;

    await act(async () =>
      root.render(
        <ProductionCockpit
          production={production}
          onOpenPreview={vi.fn()}
          onRecalculate={vi.fn()}
          onReturnToRecipe={vi.fn()}
        />,
      ),
    );

    const recovery = host.querySelector<HTMLElement>(
      '[data-testid="production-decision-recovery"]',
    );
    expect(recovery?.textContent).toContain('Żadna bezpieczna korekta nie jest dostępna');
    const abort = recovery?.querySelector<HTMLButtonElement>(
      '[data-testid="production-abort-recovery"]',
    );
    expect(abort?.disabled).toBe(false);

    await act(async () => abort?.click());
    const dialog = document.querySelector<HTMLElement>(
      '[data-testid="production-cancel-session-dialog"]',
    );
    expect(dialog?.textContent).toContain('Przerwać tę partię?');
    expect(dialog?.parentElement).toBe(document.body);
    const confirm = [...(dialog?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('Przerwij partię'),
    );
    await act(async () => (confirm as HTMLButtonElement | undefined)?.click());
    expect(cancelCurrentSession).toHaveBeenCalledTimes(1);
  });

  it('never renders the no-safe state while restore-original-proportions is feasible', async () => {
    const plannedInput = {
      ...DEFAULT_PRESET,
      items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
      machine_capacity_grams: null,
    };
    const session = createProductionSession({
      sessionId: 'run-restore-available-1',
      ownerUserId: 'owner-focus',
      source: {
        recipeId: 'recipe-focus',
        recipeVersionId: 'version-focus',
        recipeVersionNumber: 1,
        recipeName: 'Restore available QA',
      },
      plannedInput,
      startedAt: '2026-08-26T10:00:00.000Z',
    });
    const authorization = {
      authorizationId: 'authorization-restore-1',
      candidateFingerprint: 'c'.repeat(64),
      runId: session.sessionId,
      stableOptionId: 'restore_original_recipe' as const,
      expectedActualRevision: 1,
      expectedRescueRevision: 0,
      authorizedAt: '2026-08-26T10:01:00.000Z',
      expiresAt: '2099-08-26T10:06:00.000Z',
      preview: {
        title: 'Przywróć oryginalną recepturę · 1157 g',
        explanation: 'Serwer zweryfikował plan.',
        finalMassG: 1_157,
        scoreDisplay: '10/10',
        instructions: [],
      },
    };
    const unavailable = { status: 'unavailable' as const, reason: 'Niedostępne.' };
    const production = {
      session,
      progress: productionProgress(session),
      toppingProgress: null,
      rescue: { state: 'options', options: [] },
      score: { score: 10, label: 'Wyjątkowo dobrze dopasowana' },
      plannedScore: { score: 10, label: 'Wyjątkowo dobrze dopasowana' },
      prerequisite: null,
      persistenceBusy: false,
      persistenceError: null,
      rescueOptionsCalculating: false,
      selectedRescueOptionId: 'restore_original_recipe',
      recommendedRescueOptionId: 'restore_original_recipe',
      rescueOptionStates: {
        keep_original_batch: unavailable,
        enlarge_batch: unavailable,
        restore_original_recipe: {
          status: 'available',
          authorization,
          consumeIdempotencyKey: 'consume-restore-1',
        },
        leave_as_is: unavailable,
      },
    } as unknown as ProductionWorkspaceView;

    await act(async () =>
      root.render(
        <ProductionCockpit
          production={production}
          onOpenPreview={vi.fn()}
          onRecalculate={vi.fn()}
          onReturnToRecipe={vi.fn()}
        />,
      ),
    );

    expect(host.querySelector('[data-testid="production-decision-recovery"]')).toBeNull();
    expect(
      host.querySelector('[data-testid="production-decision-restore_original_recipe"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-testid="production-decision-keep_original_batch"]'),
    ).toBeNull();
    expect(host.querySelector('[data-testid="production-decision-enlarge_batch"]')).toBeNull();
    expect(host.querySelector('[data-testid="production-decision-leave_as_is"]')).toBeNull();
    expect(host.textContent).not.toContain('Żadna bezpieczna korekta nie jest dostępna');
  });

  it('requires one explicit in-app confirmation before completing an accepted lower score', async () => {
    const plannedInput = {
      ...DEFAULT_PRESET,
      items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
      machine_capacity_grams: null,
    };
    let session = createProductionSession({
      sessionId: 'run-lower-score-1',
      ownerUserId: 'owner-focus',
      source: {
        recipeId: 'recipe-focus',
        recipeVersionId: 'version-focus',
        recipeVersionNumber: 1,
        recipeName: 'Lower score QA',
      },
      plannedInput,
      startedAt: '2026-08-25T10:00:00.000Z',
    });
    for (const [index, line] of session.lines.entries()) {
      session = confirmProductionLine(
        session,
        line.lineId,
        `2026-08-25T10:${String(index + 1).padStart(2, '0')}:00.000Z`,
      );
    }
    session = {
      ...session,
      lastDeviationDecision: {
        strategy: 'leave_as_is',
        acceptedAt: '2026-08-25T10:10:00.000Z',
        sourceActualRevision: 6,
        rescueRevision: 1,
        finalMassG: plannedInput.target_batch_grams,
        scoreDisplay: '8/10',
      },
    };
    const complete = vi.fn();
    const production = {
      session,
      progress: productionProgress(session),
      toppingProgress: null,
      rescue: { state: 'not_needed', options: [] },
      score: { score: 8, label: 'Dobry wynik' },
      plannedScore: { score: 10, label: 'Wyjątkowo dobrze dopasowana' },
      prerequisite: null,
      persistenceBusy: false,
      persistenceError: null,
      complete,
    } as unknown as ProductionWorkspaceView;

    await act(async () =>
      root.render(
        <ProductionCockpit
          production={production}
          onOpenPreview={vi.fn()}
          onRecalculate={vi.fn()}
          onReturnToRecipe={vi.fn()}
        />,
      ),
    );
    const finish = host.querySelector<HTMLButtonElement>('[data-testid="complete-production"]');
    expect(finish?.textContent).toContain('Zakończ ważenie bazy');

    await act(async () => finish?.click());
    expect(complete).not.toHaveBeenCalled();
    const dialog = document.querySelector<HTMLElement>(
      '[data-testid="production-lower-score-completion-dialog"]',
    );
    expect(dialog?.textContent).toContain('Zaakceptowałeś kontynuację bez korekty');
    expect(dialog?.querySelector('[data-testid="production-final-planned-score"]')).not.toBeNull();
    expect(dialog?.querySelector('[data-testid="production-final-forecast-score"]')).not.toBeNull();
    const confirm = [...(dialog?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('Zakończ z wynikiem 8'),
    );
    await act(async () => (confirm as HTMLButtonElement | undefined)?.click());
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('keeps the custom archive confirmation available on a stale completed session', async () => {
    const plannedInput = {
      ...DEFAULT_PRESET,
      items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
      machine_capacity_grams: null,
    };
    let session = createProductionSession({
      sessionId: 'run-completed-stale-1',
      ownerUserId: 'owner-focus',
      source: {
        recipeId: 'recipe-focus',
        recipeVersionId: 'version-focus',
        recipeVersionNumber: 1,
        recipeName: 'Stale completed QA',
      },
      plannedInput,
      startedAt: '2026-08-25T10:00:00.000Z',
    });
    for (const [index, line] of session.lines.entries()) {
      session = confirmProductionLine(
        session,
        line.lineId,
        `2026-08-25T10:${String(index + 1).padStart(2, '0')}:00.000Z`,
      );
    }
    session = {
      ...session,
      status: 'completed',
      completedAt: '2026-08-25T11:00:00.000Z',
      completionSnapshot: {
        actualFinalMassG: plannedInput.target_batch_grams,
        productComposition: { toppings: [] },
      },
    } as unknown as typeof session;
    const archiveStaleSession = vi.fn();
    const production = {
      session,
      progress: productionProgress(session),
      prerequisite: {
        code: 'stale_source',
        eyebrow: 'Źródło nieaktualne',
        title: 'Źródło Produkcji jest nieaktualne',
        message: 'Zachowaj zakończony zapis i przygotuj nowe źródło.',
        action: 'archive_stale_session',
        actionLabel: 'Zarchiwizuj starą sesję',
      },
      archiveStaleSession,
    } as unknown as ProductionWorkspaceView;

    await act(async () =>
      root.render(
        <ProductionCockpit
          production={production}
          onOpenPreview={vi.fn()}
          onRecalculate={vi.fn()}
          onReturnToRecipe={vi.fn()}
        />,
      ),
    );
    const archive = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Zarchiwizuj starą sesję'),
    );
    await act(async () => (archive as HTMLButtonElement | undefined)?.click());
    expect(archiveStaleSession).not.toHaveBeenCalled();
    const dialog = document.querySelector<HTMLElement>(
      '[data-testid="production-archive-session-dialog"]',
    );
    expect(dialog?.textContent).toContain('Bieżąca receptura nie zostanie zmieniona');
    const confirm = [...(dialog?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('Zarchiwizuj sesję'),
    );
    await act(async () => (confirm as HTMLButtonElement | undefined)?.click());
    expect(archiveStaleSession).toHaveBeenCalledTimes(1);
  });
});
