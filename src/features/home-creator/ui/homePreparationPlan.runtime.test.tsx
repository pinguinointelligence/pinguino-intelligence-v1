/** @vitest-environment jsdom */
/**
 * HOME production (DESIGN V3.0 IV D–I), driven the way a customer drives it — real buttons
 * in a real document — for every supported machine: the numbered steps of the ONE
 * preparation plan, the base weighed in plan order with the ✓ at the right edge (no TARA,
 * no „Dodałem dokładnie / za dużo”), the heat step at its moment (no reminder with OK), the
 * machine's own sequence, the topping with „NIE MIKSUJ”, and „Partia gotowa”. A confirmed
 * deviation opens „Korekta partii” (the Rescue authority PRO uses) → „Plan skorygowany”;
 * „Co się stało?” has no „Chcę zmienić smak tej partii”; „Wróć” / „Zapisz” keep the batch
 * in its step. A missing numeric time never holds the flow.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  useHomeDraftStore.getState().startNew();
  vi.clearAllMocks();
});

/* Sheets are portalled to <body>, so every query reads the whole document. */
const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = (id: string) => {
  const element = byTestId(id);
  expect(element, id).not.toBeNull();
  act(() => element!.click());
};
const text = () => document.body.textContent ?? '';
const stepKind = () => byTestId('process-step')?.dataset.stepKind ?? null;
const currentRowName = () =>
  byTestId('process-current-row')?.querySelector('b')?.textContent ?? null;
const dockAction = () => byTestId('process-next')?.textContent ?? null;
const nextButton = () => byTestId('process-next') as HTMLButtonElement | null;
const lineState = (lineId: string) =>
  useProductionSessionStore
    .getState()
    .session!.lines.find((candidate) => candidate.lineId === lineId)!;

/** Types a number into the row's canonical amount control and leaves the field. */
function typeAmount(rowId: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(
    `[data-testid="process-field-${rowId}"] input`,
  );
  expect(input, rowId).not.toBeNull();
  act(() => input!.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input!.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => input!.blur());
}

const callbacks = {
  onBack: vi.fn(),
  onSaveBatch: vi.fn(),
  onSave: vi.fn(),
  onShare: vi.fn(),
  onCommunity: vi.fn(),
};

function render() {
  act(() =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <HomePreparation name="QA" {...callbacks} />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
}

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
  render();
  return plannedInput;
}

/**
 * Drives the batch with the ONE black action only, recording what each step showed:
 * `weigh:<row>` for a weighed row, the step kind for a step without weighing, `finish`
 * for „Zakończ produkcję”.
 */
function driveToTheEnd(): string[] {
  const seen: string[] = [];
  for (let guard = 0; guard < 40 && !byTestId('home-production-complete'); guard += 1) {
    const kind = stepKind();
    if (dockAction() === 'Zakończ produkcję') seen.push('finish');
    else if (kind === 'weigh') seen.push(`weigh:${currentRowName()}`);
    else seen.push(kind ?? 'none');
    click('process-next');
  }
  return seen;
}

const SUPPORTED: [string, MachineTechnology | null][] = [
  ...MACHINE_CATALOG.filter((profile) => profile.active).map(
    (profile) => [profile.id, null] as [string, null],
  ),
  ['custom-respin', 'respin'],
  ['custom-compressor', 'compressor'],
  ['custom-frozen-bowl', 'frozen_bowl'],
];

const frozenBowl = (machineId: string, technology: MachineTechnology | null): boolean =>
  technology === 'frozen_bowl' ||
  MACHINE_CATALOG.some(
    (profile) => profile.id === machineId && profile.technology === 'frozen_bowl',
  );

describe('HOME production follows one plan to the end for every supported machine', () => {
  it.each(SUPPORTED)(
    '%s: numbered steps, weighing with ✓, the machine’s own sequence, topping, Partia gotowa',
    (machineId, technology) => {
      const plannedInput = startPreparation(machineId, technology);
      const fruit = plannedInput.items[0]!;
      const heatedBase = plannedInput.items.slice(1);
      // No TARA, no „Dodałem dokładnie / za dużo”, no heat reminder with OK.
      expect(text()).not.toMatch(/TARA|Dodałem dokładnie|Dodałem za dużo|Pamiętaj o obróbce/);
      expect(byTestId('home-production-tare')).toBeNull();
      expect(byTestId('home-production-overage')).toBeNull();
      expect(byTestId('home-production-heat-information')).toBeNull();

      const bowl = frozenBowl(machineId, technology);
      const total = bowl ? 6 : 5;
      expect(byTestId('process-eyebrow')?.textContent).toBe(`Produkcja · krok 1 z ${total}`);
      expect(byTestId('process-bar')?.children).toHaveLength(total);
      // A frozen bowl is frozen BEFORE the mix is prepared — its own first step, once.
      if (bowl) {
        expect(stepKind()).toBe('before');
        expect(byTestId('process-before-start')?.textContent).toContain('Zamroź misę');
      }

      expect(driveToTheEnd()).toEqual([
        ...(bowl ? ['before'] : []),
        // The heated part in plan order; fresh fruit (first in the recipe) waits.
        ...heatedBase.map((item) => `weigh:${item.ingredient.name}`),
        'heat',
        `weigh:${fruit.ingredient.name}`,
        'machine',
        'weigh:Milk 3.5 %',
        'finish',
      ]);
      expect(byTestId('home-production-complete')).not.toBeNull();
      expect(text()).toContain('Partia gotowa');
      expect(byTestId('process-done-steps')?.children).toHaveLength(total);
      expect(
        useProductionSessionStore.getState().session?.heatInformationAcknowledgedAt ?? null,
      ).toBeNull();
    },
  );

  it('shows each step at its moment: heat with its products, fruit after cooling, the Ninja sequence and picture, the topping with NIE MIKSUJ', () => {
    const plannedInput = startPreparation('ninja-creami-deluxe-nc502eu-eu-es', null);
    // Step 1: the heated part of the base, weighed row by row.
    expect(stepKind()).toBe('weigh');
    expect(byTestId('process-base-step')).not.toBeNull();
    expect(byTestId('process-heat-step')).toBeNull();
    for (let index = 1; index < plannedInput.items.length; index += 1) {
      click('process-next');
    }

    // Step 2: the heat step — information from the plan and one „Gotowe”, no OK reminder.
    expect(stepKind()).toBe('heat');
    expect(byTestId('process-eyebrow')?.textContent).toBe('Produkcja · krok 2 z 5');
    const heat = byTestId('process-heat-step')!;
    expect(heat.textContent).toContain('Wskazana dla:');
    expect(heat.textContent).toContain(plannedInput.items.at(-1)!.ingredient.name);
    expect(heat.textContent).toContain('Po schłodzeniu');
    expect(byTestId('process-done-summary')?.textContent).toContain('Zrobione: 1 krok');
    click('process-next');

    // Step 3: fresh fruit after cooling, with its own plan instruction.
    expect(byTestId('process-step')?.dataset.stepKind).toBe('weigh');
    expect(byTestId('process-base-step')?.textContent).toContain('Umyj, dodaj na zimno i zmiksuj');
    click('process-next');

    // Step 4: the machine's own sequence and registered picture; the topping is set aside.
    const machine = byTestId('process-machine-step')!;
    expect(machine.querySelector('[data-testid="preparation-illustration"]')).not.toBeNull();
    expect(machine.textContent).toContain('Zamroź cały pojemnik');
    expect(machine.textContent).toContain('Zamrażanie mieszanki w pojemniku: 24 h');
    expect(machine.textContent).not.toMatch(/Zamroź misę/);
    expect(byTestId('process-set-aside')?.textContent).toContain('NIE MIKSUJ');
    click('process-next');

    // Step 5: the topping — the plan's own instruction and NIE MIKSUJ.
    const topping = byTestId('process-topping-step')!;
    expect(topping.textContent).toContain(
      'Pokrój truskawki i dodaj przy podaniu. Nie miksuj z bazą.',
    );
    expect(topping.querySelector('[data-testid="process-no-mix"]')?.textContent).toBe('NIE MIKSUJ');
    click('process-next');
    // Confirming a topping never sends the customer back to the machine step.
    expect(byTestId('process-machine-step')).toBeNull();
    expect(dockAction()).toBe('Zakończ produkcję');
    click('process-next');
    expect(byTestId('home-production-complete')).not.toBeNull();
  });
});

describe('weighing with ✓ at the right edge (corrections II/III)', () => {
  it('the active row shows „Ile jest w naczyniu?” at the plan; its ✓ confirms and the next row takes over', () => {
    const plannedInput = startPreparation('ninja-creami-deluxe-nc502eu-eu-es', null);
    const milk = plannedInput.items[1]!;
    const cream = plannedInput.items[2]!;
    const current = byTestId('process-current-row')!;
    expect(current.textContent).toContain('Ile jest w naczyniu?');
    expect(current.textContent).toContain('Teraz · zważ i dodaj');
    const input = document.querySelector<HTMLInputElement>(
      `[data-testid="process-field-${milk.id}"] input`,
    );
    expect(Number(input?.value)).toBe(milk.planned_grams);
    expect(byTestId(`process-tick-${milk.id}`)?.dataset.tickState).toBe('current');
    expect(byTestId(`process-tick-${cream.id}`)?.dataset.tickState).toBe('later');

    click(`process-tick-${milk.id}`);
    expect(lineState(milk.id)).toMatchObject({
      confirmed: true,
      physicalAddedGrams: milk.planned_grams,
    });
    expect(byTestId(`process-tick-${milk.id}`)?.dataset.tickState).toBe('done');
    expect(byTestId(`process-row-${milk.id}`)?.textContent).toContain('Dodano');
    expect(byTestId(`process-tick-${cream.id}`)?.dataset.tickState).toBe('current');
    expect(byTestId('process-dock-lead')?.textContent).toBe(`Teraz: ${cream.ingredient.name}`);
  });

  it('a later row stays available: its ✓ confirms it at its plan', () => {
    const plannedInput = startPreparation('ninja-creami-deluxe-nc502eu-eu-es', null);
    const smp = plannedInput.items[3]!;
    expect(byTestId(`process-tick-${smp.id}`)?.dataset.tickState).toBe('later');
    click(`process-tick-${smp.id}`);
    expect(lineState(smp.id)).toMatchObject({
      confirmed: true,
      physicalAddedGrams: smp.planned_grams,
    });
  });
});

describe('a confirmed deviation → „Korekta partii” → „Plan skorygowany”', () => {
  it('shows the difference in red, asks for the decision after ✓, and applies the verified correction', () => {
    const plannedInput = startPreparation('ninja-creami-deluxe-nc502eu-eu-es', null);
    const milk = plannedInput.items[1]!;
    typeAmount(milk.id, String(milk.planned_grams + 30));
    expect(byTestId('process-current-row')?.dataset.deviation).toBe('true');
    expect(byTestId('process-difference')?.textContent).toBe(
      `+30 g względem planu (${milk.planned_grams} g)`,
    );
    expect(text()).toContain('Po potwierdzeniu wybierzesz, jak dostosować partię.');
    // A different number confirms nothing by itself.
    expect(lineState(milk.id).confirmed).toBe(false);
    expect(byTestId('process-correction')).toBeNull();

    click(`process-tick-${milk.id}`);
    const sheet = byTestId('process-correction');
    expect(sheet).not.toBeNull();
    expect(sheet!.textContent).toContain('Korekta partii');
    expect(sheet!.textContent).toContain('Możemy dostosować tę partię');
    expect(byTestId('process-correction-what')?.textContent).toBe(
      `${milk.ingredient.name}: w naczyniu ${milk.planned_grams + 30} g · plan ${milk.planned_grams} g`,
    );
    const options = [
      ...byTestId('process-correction-options')!.querySelectorAll<HTMLElement>(
        'button[data-testid^="process-decision-"]',
      ),
    ];
    expect(options.length).toBeGreaterThan(0);
    // One option is recommended and selected before the customer chooses.
    expect(sheet!.textContent).toContain('Rekomendowane');
    expect(options.filter((option) => option.getAttribute('aria-pressed') === 'true')).toHaveLength(
      1,
    );
    // The batch waits for the decision.
    expect(nextButton()?.disabled).toBe(true);

    const chosen =
      options.find((option) => option.dataset.testid === 'process-decision-keep_original_batch') ??
      options[0]!;
    act(() => chosen.click());
    expect(chosen.getAttribute('aria-pressed')).toBe('true');
    expect(chosen.textContent).toContain('✓ Wybrano');
    click('process-correction-apply');

    expect(byTestId('process-correction')).toBeNull();
    const strategy = useProductionSessionStore.getState().session!.lastDeviationDecision?.strategy;
    expect(strategy).toBe(chosen.dataset.testid!.replace('process-decision-', ''));
    expect(byTestId(`process-row-${milk.id}`)?.textContent).toContain(
      `Dodano · ${milk.planned_grams + 30} g · ${
        strategy === 'leave_as_is' ? 'Wynik zaakceptowany' : 'Plan skorygowany'
      }`,
    );
    // The batch goes on from the next row (or an authorised top-up).
    expect(nextButton()?.disabled).toBe(false);
  });

  it('„Wróć” from the correction reopens the row to correct the entry', () => {
    const plannedInput = startPreparation('ninja-creami-deluxe-nc502eu-eu-es', null);
    const milk = plannedInput.items[1]!;
    typeAmount(milk.id, String(milk.planned_grams + 30));
    click(`process-tick-${milk.id}`);
    expect(byTestId('process-correction')).not.toBeNull();
    click('process-correction-back');
    expect(byTestId('process-correction')).toBeNull();
    expect(byTestId(`process-tick-${milk.id}`)?.dataset.tickState).toBe('current');
    expect(byTestId('process-current-row')?.textContent).toContain('Poprawiasz zapis');
    typeAmount(milk.id, String(milk.planned_grams));
    click(`process-tick-${milk.id}`);
    expect(byTestId('process-correction')).toBeNull();
    expect(lineState(milk.id)).toMatchObject({
      confirmed: true,
      physicalAddedGrams: milk.planned_grams,
    });
  });
});

describe('„Co się stało?” in HOME', () => {
  it('has no „Chcę zmienić smak tej partii”; „Zważyłem inną ilość” opens the amount being weighed', async () => {
    const plannedInput = startPreparation('ninja-creami-deluxe-nc502eu-eu-es', null);
    const milk = plannedInput.items[1]!;
    click('process-trouble-open');
    const sheet = byTestId('process-trouble')!;
    expect(sheet.textContent).toContain('Co się stało?');
    expect(sheet.textContent).toContain(
      'Partia czeka. Nic się nie zmieni, dopóki czegoś nie wybierzesz.',
    );
    expect(sheet.textContent).toContain('Zważyłem inną ilość');
    expect(sheet.textContent).not.toContain('Chcę zmienić smak tej partii');
    click('process-trouble-weighed');
    expect(byTestId('process-trouble')).toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(
      document.querySelector(`[data-testid="process-field-${milk.id}"] input`),
    );
  });
});

describe('interruption in HOME: „Wróć” and „Zapisz” keep the batch in its step', () => {
  it('the frame calls back to the recipe, and the next visit opens the same step with the same rows', () => {
    const plannedInput = startPreparation('ninja-creami-deluxe-nc502eu-eu-es', null);
    for (let index = 1; index < plannedInput.items.length; index += 1) {
      click('process-next');
    }
    expect(stepKind()).toBe('heat');
    click('process-next');
    expect(byTestId('process-eyebrow')?.textContent).toBe('Produkcja · krok 3 z 5');

    click('home-production-back');
    expect(callbacks.onBack).toHaveBeenCalledTimes(1);
    click('home-production-save');
    expect(callbacks.onSaveBatch).toHaveBeenCalledTimes(1);

    // The page unmounts the frame; „Wróć do produkcji” mounts it again.
    act(() => root.unmount());
    root = createRoot(host);
    render();
    expect(stepKind()).toBe('weigh');
    expect(byTestId('process-eyebrow')?.textContent).toBe('Produkcja · krok 3 z 5');
    expect(byTestId('process-done-summary')?.textContent).toContain('Zrobione: 2 kroki');
    expect(byTestId('process-base-step')?.textContent).toContain('Umyj, dodaj na zimno i zmiksuj');
  });
});

describe('an official recipe keeps its Professional machine in HOME (served 2026-09-18)', () => {
  it('Mango Sorbet → „Zróbmy to”: the batch runs to the end with no machine hand-off, never „Brakuje instrukcji urządzenia”', () => {
    const plannedInput = startPreparation(null, null, 'professional');
    expect(byTestId('home-preparation-blocked')).toBeNull();
    expect(byTestId('process-eyebrow')?.textContent).toBe('Produkcja · krok 1 z 4');
    // PRO Production runs a Professional batch with no machine guide; so does HOME.
    expect(driveToTheEnd()).toEqual([
      ...plannedInput.items.slice(1).map((item) => `weigh:${item.ingredient.name}`),
      'heat',
      `weigh:${plannedInput.items[0]!.ingredient.name}`,
      'weigh:Milk 3.5 %',
      'finish',
    ]);
    expect(byTestId('process-machine-step')).toBeNull();
    expect(byTestId('home-production-complete')).not.toBeNull();
  });

  it('a HOME machine with no confirmed guide still refuses to invent a process', () => {
    startPreparation('unknown-home-machine', null, 'home');
    expect(byTestId('home-preparation-blocked')).not.toBeNull();
  });
});
