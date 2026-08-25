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
