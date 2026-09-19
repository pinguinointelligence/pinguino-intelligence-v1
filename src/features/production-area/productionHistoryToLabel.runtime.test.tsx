// @vitest-environment jsdom
/**
 * Production v3 — PAKIET-WDROZENIA §8 test 2 (clicked transition):
 * Produkcja → Partie → Historia produkcji → „Otwórz etykietę” → Etykiety (this run)
 * → an older label version → „← Wróć do historii produkcji” → the same pages, place
 * and focused row. Real pages and routes, in-memory repositories.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import {
  completeProductionSession,
  confirmProductionLine,
  createProductionSession,
  type ProductionCompletionSnapshot,
} from '@/features/production-workspace/productionSession';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { queryProductionRuns } from '@/features/pro-core/productionMode';
import type { ProductionRun } from '@/features/pro-core/productionContracts';
import {
  COMPLETE_LABEL_NUTRITION,
  createCompleteLabel,
} from '@/features/master-label/masterLabelTestFixture';
import {
  defaultAccountLabelProfile,
  type AccountLabelProfile,
  type LabelRepository,
  type RunLabelSnapshot,
} from '@/services/labels/labelRepository';
import type { ProductionRepository } from '@/services/proCore/productionRepository';
import { useAuthStore } from '@/stores/authStore';

const OWNER = 'owner-history-label';

const mocks = vi.hoisted(() => ({
  productionRepository: null as unknown as ProductionRepository,
  labelRepository: null as unknown as LabelRepository,
  print: vi.fn(async () => undefined),
}));

vi.mock('@/features/pro-core/useProCorePersona', () => ({ useProCorePersona: () => 'pro' }));
vi.mock('@/features/pro-core/proCoreProductionRepo', () => ({
  resolveProductionRepository: () => ({
    repository: mocks.productionRepository,
    mode: 'backend',
    isLocalDev: false,
    unavailable: false,
  }),
}));
vi.mock('@/services/labels/labelRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/labels/labelRepository')>()),
  resolveLabelRepository: () => mocks.labelRepository,
}));
vi.mock('@/features/master-label/masterLabelPrint', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/master-label/masterLabelPrint')>()),
  printMasterLabel: mocks.print,
}));

const { ProductionHubPage, LabelsHubPage } =
  await import('@/pages/destinations/GlobalDestinationPages');

/* ---------- one real completed snapshot, re-addressed per run ---------- */
function baseCompletedSnapshot(): ProductionCompletionSnapshot {
  const input: RecipeInput = {
    items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
    mode: DEFAULT_PRESET.mode,
    category: DEFAULT_PRESET.category,
    target_temperature_c: DEFAULT_PRESET.target_temperature_c,
    target_batch_grams: DEFAULT_PRESET.target_batch_grams,
    machine_capacity_grams: null,
  };
  const behaviorSnapshots = productBehaviorTestSnapshots(input);
  for (const frozen of Object.values(behaviorSnapshots)) {
    frozen.source = 'supplier_specification';
    if (
      (frozen.sharedFacts?.nutritionPer100g?.fat ?? 0) > 0 &&
      frozen.sharedFacts?.nutritionPer100g
    ) {
      frozen.sharedFacts.nutritionPer100g.saturatedFat ??= 0;
    }
  }
  let session = createProductionSession({
    sessionId: 'run-base',
    ownerUserId: OWNER,
    source: {
      recipeId: 'recipe-base',
      recipeVersionId: 'version-base',
      recipeVersionNumber: 1,
      recipeName: 'Base',
    },
    plannedInput: input,
    plannedComposition: {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: input.items.map((item) => item.id),
      toppings: [],
      behaviorSnapshots,
      migrationAmbiguities: [],
    },
    startedAt: '2026-09-01T10:00:00.000Z',
  });
  for (const [index, line] of session.lines.entries()) {
    session = confirmProductionLine(
      session,
      line.lineId,
      `2026-09-01T10:${String(index + 1).padStart(2, '0')}:00.000Z`,
    );
  }
  const completed = completeProductionSession(
    session,
    calculateRecipe(input),
    '2026-09-01T11:00:00.000Z',
    OWNER,
  ).completionSnapshot!;
  return {
    ...completed,
    finalProduct: { ...completed.finalProduct, labelNutritionPer100g: COMPLETE_LABEL_NUTRITION },
  };
}

interface RunSpec {
  runId: string;
  recipeId: string;
  recipeVersionId: string;
  recipeVersionNumber: number;
  recipeName: string;
  completedAt: string;
}

function world() {
  const base = baseCompletedSnapshot();
  const specs: RunSpec[] = [];
  const at = (day: number, minute: number) =>
    new Date(Date.UTC(2026, 8, day, 10, minute)).toISOString();
  // Newest first: one strawberry run, 49 fillers, the second strawberry run of the SAME
  // version (page 2), a run without a saved label, and 11 more fillers — 63 runs.
  specs.push({
    runId: 'run-straw-a',
    recipeId: 'recipe-straw',
    recipeVersionId: 'version-straw-2',
    recipeVersionNumber: 2,
    recipeName: 'Truskawkowe gelato',
    completedAt: at(16, 20),
  });
  for (let index = 0; index < 49; index += 1) {
    specs.push({
      runId: `run-fill-${String(index).padStart(2, '0')}`,
      recipeId: 'recipe-fill',
      recipeVersionId: 'version-fill-1',
      recipeVersionNumber: 1,
      recipeName: `Partia ${index}`,
      completedAt: at(15, 59 - index),
    });
  }
  specs.push({
    runId: 'run-straw-b',
    recipeId: 'recipe-straw',
    recipeVersionId: 'version-straw-2',
    recipeVersionNumber: 2,
    recipeName: 'Truskawkowe gelato',
    completedAt: at(14, 5),
  });
  specs.push({
    runId: 'run-mango',
    recipeId: 'recipe-mango',
    recipeVersionId: 'version-mango-1',
    recipeVersionNumber: 1,
    recipeName: 'Sorbet mango',
    completedAt: at(9, 40),
  });
  for (let index = 49; index < 60; index += 1) {
    specs.push({
      runId: `run-fill-${String(index).padStart(2, '0')}`,
      recipeId: 'recipe-fill',
      recipeVersionId: 'version-fill-1',
      recipeVersionNumber: 1,
      recipeName: `Partia ${index}`,
      completedAt: at(8, 59 - (index - 49)),
    });
  }

  const runs: ProductionRun[] = specs.map(
    (spec) =>
      ({
        runId: spec.runId,
        ownerUserId: OWNER,
        recipeId: spec.recipeId,
        recipeVersionId: spec.recipeVersionId,
        recipeVersionNumber: spec.recipeVersionNumber,
        status: 'completed',
        plannedBatchG: 1000,
        plannedItems: [],
        createdAt: spec.completedAt,
        updatedAt: spec.completedAt,
        completedAt: spec.completedAt,
        cancelledAt: null,
        events: [],
      }) as unknown as ProductionRun,
  );
  // One batch is in progress while the history is browsed.
  runs.push({
    runId: 'run-now',
    ownerUserId: OWNER,
    recipeId: 'recipe-straw',
    recipeVersionId: 'version-straw-2',
    recipeVersionNumber: 2,
    status: 'in_progress',
    plannedBatchG: 1000,
    plannedItems: [],
    createdAt: at(17, 1),
    updatedAt: at(17, 1),
    completedAt: null,
    cancelledAt: null,
    events: [{ type: 'started', at: at(17, 1) }],
  } as unknown as ProductionRun);

  const completed = new Map(
    specs.map((spec) => [
      spec.runId,
      {
        ...base,
        sessionId: spec.runId,
        ownerUserId: OWNER,
        productionCompletedAt: spec.completedAt,
        lotCode: `LOT-${spec.runId.toUpperCase()}`,
        source: {
          recipeId: spec.recipeId,
          recipeVersionId: spec.recipeVersionId,
          recipeVersionNumber: spec.recipeVersionNumber,
          recipeName: spec.recipeName,
        },
      } satisfies ProductionCompletionSnapshot,
    ]),
  );

  const labelVersion = (
    snapshotId: string,
    runId: string,
    version: number,
    businessName: string,
    createdAt: string,
  ): RunLabelSnapshot => ({
    snapshotId,
    version,
    contentHash: `hash-${snapshotId}`,
    runId,
    ownerUserId: OWNER,
    label: createCompleteLabel('EU', {
      masterLabelId: `master-label:${runId}`,
      sourceCompletionSessionId: runId,
      sourceCompletedAt: completed.get(runId)!.productionCompletedAt,
      sourceRecipeVersionNumber: 2,
      businessName,
      lotCode: `LOT-${runId.toUpperCase()}`,
    }),
    accountProfileSnapshot: {},
    logoPath: null,
    createdAt,
  });
  const labels: RunLabelSnapshot[] = [
    labelVersion('a-v1', 'run-straw-a', 1, 'Etykieta A wersja 1', at(16, 30)),
    labelVersion('b-v1', 'run-straw-b', 1, 'Etykieta B wersja 1', at(14, 10)),
    labelVersion('b-v2', 'run-straw-b', 2, 'Etykieta B wersja 2', at(14, 50)),
  ];

  const profile: { current: AccountLabelProfile | null } = {
    current: { ...defaultAccountLabelProfile(OWNER), businessName: 'Profil konta' },
  };
  const labelRepository = {
    getAccountProfile: vi.fn(async () =>
      profile.current ? structuredClone(profile.current) : null,
    ),
    saveAccountProfile: vi.fn(async (next: AccountLabelProfile) => {
      profile.current = { ...structuredClone(next), updatedAt: new Date().toISOString() };
      return structuredClone(profile.current);
    }),
    getCompletedSnapshot: vi.fn(async (runId: string) =>
      completed.has(runId) ? structuredClone(completed.get(runId)!) : null,
    ),
    freezeCompletedSnapshot: vi.fn(async () => undefined),
    getRunLabelSnapshot: vi.fn(async (runId: string) => {
      const newest = labels
        .filter((item) => item.runId === runId)
        .sort((a, b) => b.version - a.version)[0];
      return newest ? structuredClone(newest) : null;
    }),
    getRunLabelSnapshotById: vi.fn(async (snapshotId: string) => {
      const item = labels.find((candidate) => candidate.snapshotId === snapshotId);
      return item ? structuredClone(item) : null;
    }),
    listRunLabelSnapshots: vi.fn(async () =>
      [...labels]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((item) => structuredClone(item)),
    ),
    saveRunLabelSnapshot: vi.fn(async (label: RunLabelSnapshot['label']) => {
      const runId = label.sourceCompletionSessionId;
      const saved: RunLabelSnapshot = {
        snapshotId: `${runId}-saved-${labels.length}`,
        version: labels.filter((item) => item.runId === runId).length + 1,
        contentHash: `hash-${labels.length}`,
        runId,
        ownerUserId: OWNER,
        label: structuredClone(label),
        accountProfileSnapshot: {},
        logoPath: null,
        createdAt: new Date().toISOString(),
      };
      labels.push(saved);
      return structuredClone(saved);
    }),
    uploadLogo: vi.fn(async () => `${OWNER}/logo.png`),
    createLogoSignedUrl: vi.fn(async (path: string) => path),
  };

  const productionRepository = {
    listRuns: vi.fn(
      async (owner: string, query?: Parameters<ProductionRepository['listRuns']>[1]) =>
        queryProductionRuns(runs, owner, query),
    ),
    getRun: vi.fn(async (runId: string) => runs.find((run) => run.runId === runId) ?? null),
  };

  return { labelRepository, productionRepository, labels, profile };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location" data-path={location.pathname} data-search={location.search} />
  );
}

describe('Produkcja → Historia produkcji → Etykieta → powrót (§8 test 2)', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let setup: ReturnType<typeof world>;
  let scrollTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    setup = world();
    mocks.productionRepository = setup.productionRepository as unknown as ProductionRepository;
    mocks.labelRepository = setup.labelRepository as unknown as LabelRepository;
    mocks.print.mockClear();
    useAuthStore.setState({
      status: 'authed',
      user: { id: OWNER, email: null, displayName: null },
      available: true,
    });
    useProductionSessionStore.setState({
      session: null,
      sessionsById: {},
      selectedSessionIdByAddress: {},
      activeAddressKey: null,
      archivedSessions: [],
    });
    scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const render = async (entry: string) => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[entry]}>
          <LocationProbe />
          <Routes>
            <Route path="/production" element={<ProductionHubPage />} />
            <Route path="/labels" element={<LabelsHubPage />} />
          </Routes>
        </MemoryRouter>,
      );
    });
  };
  const location = () => {
    const probe = host.querySelector<HTMLElement>('[data-testid="location"]')!;
    return `${probe.dataset.path}${probe.dataset.search}`;
  };
  const byRole = (role: string, name: string) =>
    [...host.querySelectorAll<HTMLElement>(role === 'button' ? 'button' : 'a')].find(
      (element) => element.textContent?.trim() === name,
    );
  const row = (runId: string) =>
    host.querySelector<HTMLElement>(`[data-production-run-id="${runId}"]`);
  const storeProjection = () => {
    const state = useProductionSessionStore.getState();
    return JSON.stringify({
      session: state.session,
      sessionsById: state.sessionsById,
      selectedSessionIdByAddress: state.selectedSessionIdByAddress,
      activeAddressKey: state.activeAddressKey,
      archivedSessions: state.archivedSessions,
    });
  };
  const transcript = () =>
    host.querySelector('[data-testid="label-consumer-preview"]')?.textContent ?? '';

  it('walks history → older page → this run’s label → older version → back to the same place', async () => {
    const storeBefore = storeProjection();
    await render('/production');

    // The quiet shortcut to the history is there while a batch is in progress.
    await vi.waitFor(() => {
      expect(host.querySelector('[data-in-progress-run-id="run-now"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="production-history-jump"]')?.textContent).toContain(
        '63 zakończone partie',
      );
    });
    // Etap 2 split the row's two actions: the batch, and the batch's recipe.
    expect(byRole('button', 'Kontynuuj partię')).toBeDefined();
    expect(byRole('button', 'Otwórz recepturę partii')).toBeDefined();

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="production-history-jump"]')!.click();
    });
    expect(location()).toBe('/production?tab=history');
    expect(document.activeElement?.id).toBe('production-history');

    // One row per RUN: the two runs of the same recipe version stay two rows.
    expect(row('run-straw-a')).not.toBeNull();
    expect(row('run-straw-b')).toBeNull();
    expect(host.querySelectorAll('[data-production-run-id]')).toHaveLength(50);
    expect(host.querySelector('[data-testid="production-history-shown"]')?.textContent).toBe(
      'Pokazano 50 z 63',
    );

    await act(async () => byRole('button', 'Pokaż starsze partie')!.click());
    await vi.waitFor(() => expect(row('run-straw-b')).not.toBeNull());
    expect(host.querySelectorAll('[data-production-run-id]')).toHaveLength(63);
    expect(row('run-straw-a')!.textContent).toContain('Truskawkowe gelato');
    expect(row('run-straw-b')!.textContent).toContain('Truskawkowe gelato');
    expect(row('run-straw-b')!.textContent).toContain('etykieta: 2 wersje');
    // A completed run without a saved label stays in the production history.
    expect(row('run-mango')!.textContent).toContain('bez zapisanej etykiety');
    expect(setup.productionRepository.listRuns).toHaveBeenCalledWith(OWNER, {
      status: 'completed',
      sort: 'newest',
      limit: 50,
      offset: 50,
    });

    // Open the label of the older strawberry run (page 2), from a scrolled place.
    Object.defineProperty(window, 'scrollY', { value: 1544, configurable: true, writable: true });
    const openLabel = row('run-straw-b')!.querySelector<HTMLAnchorElement>(
      '[data-testid="production-history-open-label"]',
    )!;
    await act(async () => openLabel.click());
    expect(location()).toBe('/labels?run=run-straw-b');
    await vi.waitFor(() =>
      expect(
        host.querySelector('[data-testid="label-workspace"]')?.getAttribute('data-run-id'),
      ).toBe('run-straw-b'),
    );
    const context = host.querySelector<HTMLElement>('[data-testid="label-run-context"]')!;
    expect(context.dataset.runId).toBe('run-straw-b');
    expect(context.textContent).toContain('Etykieta partii');
    expect(context.textContent).toContain('wersja etykiety 2');
    // The newest version of THIS run — never another run's, never the profile.
    expect(transcript()).toContain('Etykieta B wersja 2');
    expect(transcript()).not.toContain('Etykieta A wersja 1');

    // Choose the older version of this run.
    const older = [
      ...host.querySelectorAll<HTMLAnchorElement>('[data-testid="label-run-version"]'),
    ].find((link) => link.textContent?.includes('v1'))!;
    await act(async () => older.click());
    expect(location()).toBe('/labels?run=run-straw-b&snapshot=b-v1');
    await vi.waitFor(() => expect(transcript()).toContain('Etykieta B wersja 1'));

    // Back to the production history: same pages, same place, same row in focus.
    const back = byRole('button', '← Wróć do historii produkcji')!;
    expect(back).toBeDefined();
    setup.productionRepository.listRuns.mockClear();
    await act(async () => back.click());
    expect(location()).toBe('/production?tab=history');
    await vi.waitFor(() =>
      expect(host.querySelectorAll('[data-production-run-id]')).toHaveLength(63),
    );
    // Both loaded pages come back in one read — nothing older than what was open is skipped.
    expect(setup.productionRepository.listRuns).toHaveBeenCalledWith(OWNER, {
      status: 'completed',
      sort: 'newest',
      limit: 100,
      offset: 0,
    });
    await vi.waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 1544 }));
    expect(document.activeElement).toBe(row('run-straw-b'));
    expect(row('run-straw-b')!.dataset.focused).toBe('true');

    // Browsing wrote nothing: no label version, no profile, no production state.
    expect(setup.labelRepository.saveRunLabelSnapshot).not.toHaveBeenCalled();
    expect(setup.labelRepository.saveAccountProfile).not.toHaveBeenCalled();
    expect(storeProjection()).toBe(storeBefore);
  });

  it('shows „Nie znaleźliśmy tej wersji etykiety” for a version of another run — no preview, no print', async () => {
    await render('/labels?run=run-straw-b&snapshot=a-v1');
    await vi.waitFor(() =>
      expect(host.querySelector('[data-testid="label-snapshot-not-found"]')).not.toBeNull(),
    );
    expect(host.textContent).toContain('Nie znaleźliśmy tej wersji etykiety.');
    expect(host.querySelector('[data-testid="label-print"]')).toBeNull();
    expect(host.querySelector('[data-testid="label-consumer-preview"]')).toBeNull();
    expect(host.querySelector('[data-testid="label-change"]')).toBeNull();
    // This run's saved versions stay available for a deliberate choice.
    expect(host.querySelectorAll('[data-testid="label-run-version"]')).toHaveLength(2);
    expect(host.textContent).not.toContain('Etykieta A wersja 1');
    expect(setup.labelRepository.saveRunLabelSnapshot).not.toHaveBeenCalled();
  });

  it('shows „Nie znaleźliśmy tej wersji etykiety” for a version that does not exist', async () => {
    await render('/labels?run=run-straw-b&snapshot=does-not-exist');
    await vi.waitFor(() =>
      expect(host.querySelector('[data-testid="label-snapshot-not-found"]')).not.toBeNull(),
    );
    expect(host.querySelector('[data-testid="label-print"]')).toBeNull();
    expect(host.querySelector('[data-testid="label-consumer-preview"]')).toBeNull();
    expect(setup.labelRepository.saveAccountProfile).not.toHaveBeenCalled();
  });

  it('keeps a saved version’s own data after the default profile changes', async () => {
    await setup.labelRepository.saveAccountProfile({
      ...defaultAccountLabelProfile(OWNER),
      businessName: 'QA ZMIENIONY PROFIL',
    });
    setup.labelRepository.saveAccountProfile.mockClear();
    await render('/labels?run=run-straw-b&snapshot=b-v1');
    await vi.waitFor(() => expect(transcript()).toContain('Etykieta B wersja 1'));
    expect(transcript()).not.toContain('QA ZMIENIONY PROFIL');
    expect(setup.labelRepository.saveRunLabelSnapshot).not.toHaveBeenCalled();
    expect(setup.labelRepository.saveAccountProfile).not.toHaveBeenCalled();
  });

  it('shows a run without a saved label as it is; opening saves nothing, printing saves version 1', async () => {
    await render('/labels?run=run-mango');
    await vi.waitFor(() =>
      expect(
        host.querySelector('[data-testid="label-run-context"]')?.getAttribute('data-selection'),
      ).toBe('unsaved'),
    );
    expect(host.textContent).toContain('bez zapisanej etykiety');
    expect(setup.labelRepository.saveRunLabelSnapshot).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(host.querySelector('[data-testid="label-print"]')).not.toBeNull(),
    );

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="label-print"]')!.click();
    });
    // Missing optional data opens the shared pre-print dialog (a portal); print anyway.
    const skip = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Drukuj bez uzupełniania',
    );
    if (skip) await act(async () => skip.click());
    await vi.waitFor(() =>
      expect(setup.labelRepository.saveRunLabelSnapshot).toHaveBeenCalledTimes(1),
    );
    const saved = setup.labels.find((item) => item.runId === 'run-mango');
    expect(saved?.version).toBe(1);
    await vi.waitFor(() =>
      expect(location()).toBe(`/labels?run=run-mango&snapshot=${saved!.snapshotId}`),
    );
  });

  it('reports a run that is not on this account without showing another label', async () => {
    await render('/labels?run=run-elsewhere');
    await vi.waitFor(() =>
      expect(host.querySelector('[data-testid="label-run-not-found"]')).not.toBeNull(),
    );
    expect(host.textContent).toContain('Nie znaleźliśmy tej etykiety.');
    expect(host.querySelector('[data-testid="label-workspace"]')).toBeNull();
  });

  it('Historia etykiet → a version → „← Wróć do historii etykiet” keeps the search and the place', async () => {
    await render('/labels');
    await vi.waitFor(() =>
      expect(host.querySelector('[data-testid="label-history-search"]')).not.toBeNull(),
    );
    const search = host.querySelector<HTMLInputElement>('[data-testid="label-history-search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        search,
        'straw-b',
      );
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // One row per run with a saved label; the search narrows it to that run's versions.
    const runs = () =>
      [...host.querySelectorAll<HTMLElement>('[data-label-history-run-id]')].map(
        (row) => row.dataset.labelHistoryRunId,
      );
    expect(runs()).toEqual(['run-straw-b']);

    Object.defineProperty(window, 'scrollY', { value: 260, configurable: true, writable: true });
    const v1 = [
      ...host.querySelectorAll<HTMLAnchorElement>('[data-testid="label-history-version"]'),
    ].find((link) => link.textContent?.includes('v1'))!;
    await act(async () => v1.click());
    expect(location()).toBe('/labels?run=run-straw-b&snapshot=b-v1');
    await vi.waitFor(() => expect(transcript()).toContain('Etykieta B wersja 1'));

    scrollTo.mockClear();
    await act(async () => byRole('button', '← Wróć do historii etykiet')!.click());
    expect(location()).toBe('/labels');
    await vi.waitFor(() =>
      expect(
        host.querySelector<HTMLInputElement>('[data-testid="label-history-search"]')?.value,
      ).toBe('straw-b'),
    );
    await vi.waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 260 }));
    expect(runs()).toEqual(['run-straw-b']);
    expect(setup.labelRepository.saveRunLabelSnapshot).not.toHaveBeenCalled();
    expect(setup.labelRepository.saveAccountProfile).not.toHaveBeenCalled();
  });
});
