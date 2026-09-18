import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { educationCopy } from '@/copy/education.pl';
import type { RecipeInput } from '@/engine';
import { machineEducationById, type RecipeProcessEvidence } from '@/features/education';
import { MACHINE_CATALOG } from '@/features/machine-catalog';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import { ProductionCockpit } from './ProductionCockpit';
import { preparationPlanForSession } from './preparationPlan';
import {
  confirmProductionLine,
  createProductionSession,
  productionProgress,
  toppingProductionProgress,
} from './productionSession';
import type { ProductionWorkspaceView } from './useProductionWorkspace';

/* Technical fixture: the shapes Production reads from frozen snapshots. */
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
const snap = (
  lineId: string,
  scope: ProductBehaviorSnapshot['processScope'],
  mapperIngredientId: string,
  formId: string | null,
  entries: RecipeProcessEvidence[],
) =>
  ({
    lineId,
    processScope: scope,
    mapperIngredientId,
    familyId: formId === 'fresh' ? 'fruit' : null,
    formId,
    sharedFacts: { processEvidence: entries },
  }) as unknown as ProductBehaviorSnapshot;

const template = DEFAULT_PRESET.items[0]!;
const item = (id: string, name: string, grams: number) => ({
  ...template,
  id,
  ingredient: { ...template.ingredient, id, name },
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'unlocked' as const,
});
const plannedInput: RecipeInput = {
  ...DEFAULT_PRESET,
  items: [item('fruit', 'Truskawki', 300), item('milk', 'Mleko', 500), item('tara', 'Tara', 4)],
};
const plannedComposition: RecipeCompositionMetadata = {
  schemaVersion: 1,
  baseScope: 'BASE_FORMULATION',
  baseOrder: ['fruit', 'milk', 'tara'],
  toppings: [
    {
      id: 'topping',
      ingredient: item('topping', 'Truskawki', 60).ingredient,
      planned_grams: 60,
      actual_grams: null,
      process_scope: 'POST_PROCESS_ADDON',
      addon_sort_order: 0,
    },
  ],
  behaviorSnapshots: {
    fruit: snap('fruit', 'BASE_FORMULATION', 'PI-ING-001553', 'fresh', [
      evidence('PI-ING-001553', 'cold_process_approved'),
    ]),
    milk: snap('milk', 'BASE_FORMULATION', 'PI-ING-milk', null, []),
    tara: snap('tara', 'BASE_FORMULATION', 'PI-ING-000492', null, [
      evidence('PI-ING-000492', 'heat_required_for_function'),
    ]),
    topping: snap('topping', 'POST_PROCESS_ADDON', 'PI-ING-001553', 'fresh', [
      evidence('PI-ING-001553', 'cold_process_approved'),
    ]),
  },
  migrationAmbiguities: [],
};
const bowl = MACHINE_CATALOG.find((profile) => profile.technology === 'frozen_bowl')!;
const source = { recipeId: 'r', recipeVersionId: 'v', recipeVersionNumber: 1, recipeName: 'QA' };

const render = (production: Partial<ProductionWorkspaceView>) =>
  renderToStaticMarkup(
    <ProductionCockpit
      production={
        {
          source,
          plannedInput,
          plannedComposition,
          machineGuide: machineEducationById(bowl.id),
          prerequisite: null,
          practicalReady: true,
          sessionStarting: false,
          sessionStartError: null,
          persistenceBusy: false,
          persistenceError: null,
          heatInformation: [],
          score: { score: null },
          plannedScore: { score: null },
          rescue: { state: 'none' },
          rescueOptionStates: {},
          deviationDecisionUnresolved: false,
          startNewSession: vi.fn(),
          ...production,
        } as unknown as ProductionWorkspaceView
      }
      onOpenPreview={vi.fn()}
      onRecalculate={vi.fn()}
      onReturnToRecipe={vi.fn()}
    />,
  );

describe('PREP-10 one preparation plan in the existing views', () => {
  it('PRO shows the plan in the machine-instruction slot before the batch starts', () => {
    const html = render({ session: null, progress: null });
    expect(html).toContain('data-testid="production-preparation-plan"');
    expect(html).toContain('data-testid="production-plan-before-start"');
    expect(html).toContain('data-testid="production-plan-heat"');
    expect(html).toContain('data-testid="production-machine-instructions"');
    expect(html).toContain(`data-machine-id="${bowl.id}"`);
    expect(html).toMatch(/data-testid="production-plan-line-fruit"[^>]*data-moved="true"/);
    // Bowl freezing is a before-start step, not a step after weighing.
    const machine = html.slice(html.indexOf('data-testid="production-machine-instructions"'));
    expect(machine.slice(0, machine.indexOf('</section>'))).not.toContain('Zamroź misę');
    expect(html.indexOf('production-plan-before-start')).toBeLessThan(
      html.indexOf('production-plan-heat'),
    );
    expect(html.indexOf('production-plan-heat')).toBeLessThan(
      html.indexOf('production-plan-line-fruit'),
    );
    expect(html).toContain('Wskazana dla: Tara');
    expect(html).toContain('Umyj, dodaj na zimno i zmiksuj');
    // The card is not a second weighing list: an unmoved line without information has no entry.
    expect(html).not.toContain('production-plan-line-milk');
    expect(html).not.toContain('Brak szczegółowej instrukcji');
  });

  it('PRO topping stage and HOME read the same instruction from the same plan', () => {
    let session = createProductionSession({
      sessionId: 'views',
      ownerUserId: 'owner',
      source,
      plannedInput,
      plannedComposition,
      startedAt: '2026-09-17T10:00:00.000Z',
    });
    for (const lineId of ['milk', 'tara', 'fruit']) {
      session = confirmProductionLine(session, lineId, '2026-09-17T10:01:00.000Z');
    }
    expect(session.stage).toBe('addons');
    const plan = preparationPlanForSession(session, machineEducationById(bowl.id));
    const topping = plan.steps.find((step) => step.kind === 'line' && step.lineId === 'topping');
    expect(topping?.kind === 'line' && topping.instruction).toBe(
      educationCopy.preparation.actions.cutFreshStrawberriesAtServing,
    );
    const html = render({
      session,
      progress: productionProgress(session),
      toppingProgress: toppingProductionProgress(session),
    });
    expect(html).toContain('data-testid="production-topping-instruction-topping"');
    // Machine preparation before start is history once weighing has begun.
    expect(html).not.toContain('data-testid="production-plan-before-start"');
    // Owner addendum 2026-09-17: the heat step is the only place that names what needs
    // heat, so it names it during the run too (no separate acknowledged reminder exists).
    expect(html).toContain('data-testid="production-plan-heat"');
    expect(html).toContain('Wskazana dla: Tara');
    expect(html).toContain('Pokrój truskawki i dodaj przy podaniu. Nie miksuj z bazą.');

    const home = readFileSync(resolve('src/features/home-creator/ui/HomePreparation.tsx'), 'utf8');
    const read = (path: string) => readFileSync(resolve(path), 'utf8');
    const controller = read(
      'src/features/production-workspace/process/useLocalProductionProcess.ts',
    );
    const steps = read('src/features/production-workspace/process/productionProcessSteps.ts');
    const view = read('src/features/production-workspace/process/ProductionProcess.tsx');
    // DESIGN V3.0 IV D–I: HOME hosts the ONE batch process, whose numbered steps ARE this
    // plan — its order and its words.
    expect(home).toContain('useLocalProductionProcess(');
    expect(controller).toContain('preparationPlanForSession(session, guide)');
    expect(controller).toContain('productionProcessSteps(plan');
    expect(view).toContain('planLine.instruction');
    expect(steps).toContain('for (const step of plan.steps)');
    // Neither HOME nor the process adds process wording of its own.
    for (const source of [home, controller, steps, view]) {
      expect(source).not.toMatch(/na ciepło'|na zimno'|schłódź|Pokrój/);
    }
  });
});
