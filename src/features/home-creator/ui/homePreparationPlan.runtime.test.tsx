/** @vitest-environment jsdom */
/**
 * HOME preparation, driven the way a customer drives it — real buttons in a real
 * document — for every supported machine: weigh the base in plan order, see the
 * heat step at its moment (no reminder with OK), do the machine step, add the
 * topping, finish. A missing numeric time never holds the flow.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import type { RecipeInput } from '@/engine';
import type { RecipeProcessEvidence } from '@/features/education';
import { MACHINE_CATALOG, type MachineTechnology } from '@/features/machine-catalog';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { productionTestComposition } from '@/features/production-workspace/productionTestComposition.fixture';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { useHomeDraftStore } from '../homeDraftStore';
import { HomePreparation } from './HomePreparation';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

/* Technical fixture: the frozen snapshot SHAPES Production reads. Not food knowledge. */
const evidence = (
  id: string,
  decision: RecipeProcessEvidence['decision'],
): RecipeProcessEvidence => ({
  decision,
  reasonType: 'ingredient_function',
  affectedIngredientIds: [id],
  explanation: 'internal',
  lateAdditionGuidance: null,
  source: {
    id: `fixture:${id}:${decision}`,
    label: 'fixture',
    reference: 'ref',
    verificationStatus: 'verified',
  },
});

function fixture(): { plannedInput: RecipeInput; plannedComposition: RecipeCompositionMetadata } {
  const template = DEFAULT_PRESET.items[0]!;
  const strawberries = {
    ...template,
    id: 'fresh-strawberries',
    actual_grams: null,
    planned_grams: 200,
  };
  // Real milk-base shape: milk, cream, SMP, sucrose, dextrose, tara (last) + fresh fruit FIRST.
  const items = [
    strawberries,
    ...DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
  ];
  const plannedInput: RecipeInput = {
    ...DEFAULT_PRESET,
    items,
    target_batch_grams: items.reduce((sum, item) => sum + item.planned_grams, 0),
  };
  const composition = productionTestComposition(plannedInput);
  const tara = items.at(-1)!;
  const overlay = (
    lineId: string,
    facts: Partial<ProductBehaviorSnapshot>,
    processEvidence: RecipeProcessEvidence[],
  ): ProductBehaviorSnapshot => ({
    ...composition.behaviorSnapshots[lineId === 'strawberry-topping' ? tara.id : lineId]!,
    ...facts,
    lineId,
    sharedFacts: {
      ...composition.behaviorSnapshots[tara.id]!.sharedFacts!,
      processEvidence,
    },
  });
  const behaviorSnapshots: Record<string, ProductBehaviorSnapshot> = {};
  for (const item of items) {
    behaviorSnapshots[item.id] =
      item.id === tara.id
        ? overlay(item.id, { mapperIngredientId: 'PI-ING-000492' }, [
            evidence('PI-ING-000492', 'heat_required_for_function'),
          ])
        : item.id === strawberries.id
          ? overlay(
              item.id,
              { mapperIngredientId: 'PI-ING-001553', familyId: 'fruit', formId: 'fresh' },
              [evidence('PI-ING-001553', 'cold_process_approved')],
            )
          : overlay(item.id, {}, []);
  }
  behaviorSnapshots['strawberry-topping'] = overlay(
    'strawberry-topping',
    {
      processScope: 'POST_PROCESS_ADDON',
      mapperIngredientId: 'PI-ING-001553',
      familyId: 'fruit',
      formId: 'fresh',
    },
    [evidence('PI-ING-001553', 'cold_process_approved')],
  );
  return {
    plannedInput,
    plannedComposition: {
      ...composition,
      baseOrder: items.map((item) => item.id),
      toppings: [
        {
          id: 'strawberry-topping',
          ingredient: template.ingredient,
          planned_grams: 40,
          actual_grams: null,
          process_scope: 'POST_PROCESS_ADDON',
          addon_sort_order: 0,
        },
      ],
      behaviorSnapshots,
    },
  };
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useProductionSessionStore.getState().clear();
});

const byTestId = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = (id: string) => {
  const element = byTestId(id);
  expect(element, id).not.toBeNull();
  act(() => element!.click());
};

function startPreparation(
  machineId: string | null,
  technology: MachineTechnology | null,
  machineKind: 'home' | 'professional' = 'home',
) {
  const { plannedInput, plannedComposition } = fixture();
  useAuthStore.setState({ user: { id: 'owner' } as never, status: 'authed' } as never);
  useRecipeStore.setState({
    machineKind,
    machineId,
    machineTechnology: technology,
  } as never);
  const draftId = useHomeDraftStore.getState().draftId;
  useProductionSessionStore.getState().startNewSession({
    ownerUserId: 'owner',
    source: {
      recipeId: draftId,
      recipeVersionId: null,
      recipeVersionNumber: null,
      recipeName: 'QA',
    },
    plannedInput,
    plannedComposition,
    now: '2026-09-17T10:00:00.000Z',
    sessionId: `home-plan-${machineId ?? machineKind}`,
    processReadiness: 'READY_WITH_INFO',
    processAdvisories: [
      {
        code: 'HEAT_TREATMENT_INDICATED',
        lineId: plannedInput.items.at(-1)!.id,
        productId: null,
        mapperIngredientId: 'PI-ING-000492',
        decision: 'HEAT_REQUIRED_FOR_FUNCTION',
        verificationStatus: 'verified',
      },
    ],
  });
  act(() =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <HomePreparation name="QA" onSave={() => {}} onShare={() => {}} onCommunity={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  return plannedInput;
}

const SUPPORTED: [string, MachineTechnology | null][] = [
  ...MACHINE_CATALOG.filter((profile) => profile.active).map(
    (profile) => [profile.id, null] as [string, null],
  ),
  ['custom-respin', 'respin'],
  ['custom-compressor', 'compressor'],
  ['custom-frozen-bowl', 'frozen_bowl'],
];

describe('HOME preparation follows one plan to the end for every supported machine', () => {
  it.each(SUPPORTED)(
    '%s reaches the topping and Gotowe with no heat OK',
    (machineId, technology) => {
      const plannedInput = startPreparation(machineId, technology);
      const text = () => host.textContent ?? '';
      expect(text()).not.toContain('Pamiętaj o obróbce');
      expect(byTestId('home-production-heat-information')).toBeNull();

      // Base in plan order: fresh fruit (first in the recipe) waits until after the heated part.
      const weighed: string[] = [];
      for (let index = 0; index < plannedInput.items.length; index += 1) {
        const card = byTestId('home-base-step');
        expect(card, `base card ${index}`).not.toBeNull();
        weighed.push(card!.querySelector('h3')!.textContent!);
        if (index === plannedInput.items.length - 1) {
          // The heat step shows at its moment, as information, right before the fruit.
          expect(byTestId('home-preparation-heat-step')).not.toBeNull();
          expect(card!.textContent).toContain('Umyj, dodaj na zimno i zmiksuj');
        } else {
          expect(byTestId('home-preparation-heat-step')).toBeNull();
        }
        click('home-production-tare');
        click('home-production-confirm-line');
      }
      expect(weighed).toHaveLength(plannedInput.items.length);

      // Machine step: always passable; the click only moves on and claims no elapsed time.
      const machineCard = byTestId('home-machine-step');
      expect(machineCard).not.toBeNull();
      expect(byTestId('home-machine-missing-authority')).toBeNull();
      const isNinja = machineId.startsWith('ninja-creami');
      expect(machineCard!.querySelector('[data-testid="preparation-illustration"]') !== null).toBe(
        isNinja,
      );
      if (isNinja)
        expect(machineCard!.textContent).toContain('Zamrażanie mieszanki w pojemniku: 24 h');
      expect(machineCard!.textContent).not.toMatch(/Zamroź misę/);
      click('home-machine-complete');

      const topping = byTestId('home-topping-step');
      expect(topping).not.toBeNull();
      expect(topping!.textContent).toContain(
        'Pokrój truskawki i dodaj przy podaniu. Nie miksuj z bazą.',
      );
      click('home-production-tare');
      click('home-production-confirm-line');

      // Confirming a topping never sends the customer back to the machine step.
      expect(byTestId('home-machine-step')).toBeNull();
      click('home-production-finish');
      expect(byTestId('home-production-complete')).not.toBeNull();
      expect(
        useProductionSessionStore.getState().session?.heatInformationAcknowledgedAt ?? null,
      ).toBeNull();
    },
  );
});

describe('an official recipe keeps its Professional machine in HOME (served 2026-09-18)', () => {
  it('Mango Sorbet → „Zróbmy to”: the batch runs to the end with no machine hand-off, never „Brakuje instrukcji urządzenia”', () => {
    const plannedInput = startPreparation(null, null, 'professional');
    expect(byTestId('home-preparation-blocked')).toBeNull();
    for (let index = 0; index < plannedInput.items.length; index += 1) {
      expect(byTestId('home-base-step'), `base card ${index}`).not.toBeNull();
      click('home-production-tare');
      click('home-production-confirm-line');
    }
    // PRO Production runs a Professional batch with no machine guide; so does HOME.
    expect(byTestId('home-machine-step')).toBeNull();
    const topping = byTestId('home-topping-step');
    expect(topping).not.toBeNull();
    click('home-production-tare');
    click('home-production-confirm-line');
    click('home-production-finish');
    expect(byTestId('home-production-complete')).not.toBeNull();
  });

  it('a HOME machine with no confirmed guide still refuses to invent a process', () => {
    startPreparation('unknown-home-machine', null, 'home');
    expect(byTestId('home-preparation-blocked')).not.toBeNull();
  });
});
