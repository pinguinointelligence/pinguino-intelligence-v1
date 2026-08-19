// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import type { ProductionWorkspaceView } from './useProductionWorkspace';
import { ProductionCockpit } from './ProductionCockpit';
import { createProductionSession, productionProgress } from './productionSession';

describe('Production trusted Preview accessibility', () => {
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

  it('moves focus to the newly authorized live Preview', async () => {
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

    const preview = host.querySelector<HTMLElement>(
      '[data-testid="production-rescue-authorized-preview"]',
    );
    expect(preview).not.toBeNull();
    expect(preview).toHaveProperty('tabIndex', -1);
    expect(preview?.getAttribute('role')).toBe('status');
    expect(preview?.getAttribute('aria-live')).toBe('polite');
    expect(document.activeElement).toBe(preview);
  });
});
