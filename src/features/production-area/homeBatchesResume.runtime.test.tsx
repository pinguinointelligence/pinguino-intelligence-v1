/** @vitest-environment jsdom */
/**
 * OD-24 — „Produkcja → Partie" w HOME musi znaleźć trwającą partię po recepturze, do której ta
 * partia naprawdę należy.
 *
 * Zanim OD-24 przeniosło HOME na wspólną, trwałą partię, sesja HOME była lokalna i adresowana
 * identyfikatorem szkicu (`home-draft:<uuid>`), więc karta „Przygotowanie trwa" szukała
 * `session.source.recipeId === draftId`. Po OD-24 ta sama partia jest adresowana WERSJĄ
 * receptury (zapisaną albo techniczną migawką), więc tamto porównanie nie mogło już nigdy wyjść
 * prawdą — karta po cichu przestała się pokazywać i nikt tego nie zauważył, bo ten ekran nie
 * miał żadnego testu.
 *
 * Te przypadki celowo ustawiają migawkę, której id NIE jest identyfikatorem szkicu: przywrócenie
 * starego porównania wywala pierwszy z nich.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { productionTestComposition } from '@/features/production-workspace/productionTestComposition.fixture';
import { createProductionSession } from '@/features/production-workspace/productionSession';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import { productionVersionFingerprint } from '@/features/production-workspace/productionReadinessState';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useHomeDraftStore } from '@/features/home-creator/homeDraftStore';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { HomeBatches } from './ProductionBatches';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const SNAPSHOT_RECIPE = 'snapshot-recipe-1';
const SNAPSHOT_VERSION = 'snapshot-version-1';

let host: HTMLDivElement;
let root: Root;

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

/** The recipe on the bench, with the technical snapshot its batch was started from. */
function seedRecipeWithSnapshot() {
  const input = {
    ...DEFAULT_PRESET,
    items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
    machine_capacity_grams: null,
  };
  const composition = productionTestComposition(input as never);
  useRecipeStore.getState().loadRecipeInput(input as never, { composition });
  const live = useRecipeStore.getState();
  useRecipeStore.getState().markProductionSnapshot({
    recipeId: SNAPSHOT_RECIPE,
    versionId: SNAPSHOT_VERSION,
    versionNumber: 1,
    fingerprint: productionVersionFingerprint(
      buildRecipeInput(live, 'planning'),
      recipeCompositionFromState(live),
    ),
  });
  return { input, composition };
}

function seedRunningBatch(ownerUserId: string) {
  const { input, composition } = seedRecipeWithSnapshot();
  const session = createProductionSession({
    sessionId: 'run-1',
    ownerUserId,
    source: {
      recipeId: SNAPSHOT_RECIPE,
      recipeVersionId: SNAPSHOT_VERSION,
      recipeVersionNumber: 1,
      recipeName: 'Truskawkowe QA',
    },
    plannedInput: input as never,
    plannedComposition: composition,
    startedAt: '2026-09-19T10:00:00.000Z',
  });
  useProductionSessionStore.setState({
    sessionsById: { 'run-1': session },
  } as never);
  useHomeDraftStore.setState({ preparationStarted: true } as never);
  return session;
}

const render = async () => {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <HomeBatches />
      </MemoryRouter>,
    ),
  );
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  useAuthStore.setState({ user: { id: 'owner' } as never, status: 'authed' } as never);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useProductionSessionStore.getState().clear();
  useHomeDraftStore.getState().startNew();
  useRecipeStore.getState().resetToDemo();
});

describe('OD-24 — HOME finds its running batch by the recipe it belongs to', () => {
  it('OD24-HOMEBATCH-A a durable batch of the current recipe is offered back', async () => {
    const session = seedRunningBatch('owner');
    // The point of the case: the batch is NOT addressed by the HOME draft id.
    expect(session.source.recipeId).not.toBe(useHomeDraftStore.getState().draftId);

    await render();

    const card = byTestId('production-current');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain('Truskawkowe QA');
    expect(card!.textContent).toContain('Przygotowanie trwa');
    expect(card!.querySelector('a[href="/home"]')).not.toBeNull();
    expect(byTestId('production-empty')).toBeNull();
  });

  it('OD24-HOMEBATCH-B another account’s batch is never offered', async () => {
    seedRunningBatch('someone-else');

    await render();

    expect(byTestId('production-empty')).not.toBeNull();
  });

  it('OD24-HOMEBATCH-C a batch of a DIFFERENT recipe is not this recipe’s batch', async () => {
    seedRunningBatch('owner');
    // The customer moved on to another recipe: its snapshot is a different row.
    useRecipeStore.getState().markProductionSnapshot({
      recipeId: 'snapshot-recipe-2',
      versionId: 'snapshot-version-2',
      versionNumber: 1,
      fingerprint: productionVersionFingerprint(
        buildRecipeInput(useRecipeStore.getState(), 'planning'),
        recipeCompositionFromState(useRecipeStore.getState()),
      ),
    });

    await render();

    expect(byTestId('production-empty')).not.toBeNull();
  });

  it('OD24-HOMEBATCH-D nothing is offered before a preparation was started', async () => {
    seedRunningBatch('owner');
    useHomeDraftStore.setState({ preparationStarted: false } as never);

    await render();

    expect(byTestId('production-empty')).not.toBeNull();
  });
});
