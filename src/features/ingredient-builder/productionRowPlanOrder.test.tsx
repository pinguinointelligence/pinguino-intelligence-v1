import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import type { RecipeProcessEvidence } from '@/features/education';
import { SurfaceToneContext } from '@/components/ui/surface';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import {
  confirmProductionLine,
  createProductionSession,
} from '@/features/production-workspace/productionSession';
import { productionTestComposition } from '@/features/production-workspace/productionTestComposition.fixture';
import type { ProductionWorkspaceView } from '@/features/production-workspace/useProductionWorkspace';
import { useRecipeStore } from '@/stores/recipeStore';
import { IngredientBuilder } from './IngredientBuilder';

/*
 * PRO: during a running batch the rows, the active row and the preparation plan
 * describe ONE sequence. Only the display order changes; the stored recipe order,
 * the session order and the Engine input stay exactly as they were.
 */
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

function batch() {
  const [first, second, third] = DEFAULT_PRESET.items;
  const items = [
    { ...first!, id: 'fresh-fruit', actual_grams: null },
    { ...second!, id: 'water', actual_grams: null },
    { ...third!, id: 'tara', actual_grams: null },
  ];
  const plannedInput: RecipeInput = {
    ...DEFAULT_PRESET,
    items,
    target_batch_grams: items.reduce((sum, item) => sum + item.planned_grams, 0),
  };
  const composition = productionTestComposition(plannedInput);
  const withEvidence = (
    lineId: string,
    facts: Partial<ProductBehaviorSnapshot>,
    entries: RecipeProcessEvidence[],
  ): ProductBehaviorSnapshot => ({
    ...composition.behaviorSnapshots[lineId]!,
    ...facts,
    sharedFacts: {
      ...composition.behaviorSnapshots[lineId]!.sharedFacts!,
      processEvidence: entries,
    },
  });
  const session = createProductionSession({
    sessionId: 'row-order',
    ownerUserId: 'owner',
    source: { recipeId: 'r', recipeVersionId: 'v', recipeVersionNumber: 1, recipeName: 'QA' },
    plannedInput,
    plannedComposition: {
      ...composition,
      baseOrder: ['fresh-fruit', 'water', 'tara'],
      behaviorSnapshots: {
        'fresh-fruit': withEvidence('fresh-fruit', { familyId: 'fruit', formId: 'fresh' }, [
          evidence('PI-ING-001553', 'cold_process_approved'),
        ]),
        water: withEvidence('water', {}, [evidence('PI-ING-001409', 'cold_process_approved')]),
        tara: withEvidence('tara', {}, [evidence('PI-ING-000492', 'heat_required_for_function')]),
      },
    },
    startedAt: '2026-09-17T10:00:00.000Z',
  });
  return { plannedInput, session };
}

const render = (
  mode: 'recipe' | 'production',
  plannedInput: RecipeInput,
  session: ReturnType<typeof batch>['session'],
) => {
  const result = calculateRecipe(plannedInput);
  const production = {
    session,
    deviationDecisionUnresolved: false,
    persistenceBusy: false,
    setDraftActual: vi.fn(),
    confirmLine: vi.fn(),
    reopenRecord: vi.fn(),
    topUpLine: vi.fn(),
    heatInformation: [],
  } as unknown as ProductionWorkspaceView;
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <SurfaceToneContext.Provider value="paper">
        <IngredientBuilder
          items={result.items}
          totalBatchG={result.total_batch_g}
          targetBatchG={plannedInput.target_batch_grams}
          demo={false}
          layout="workbench"
          mode={mode}
          production={production}
        />
      </SurfaceToneContext.Provider>
    </QueryClientProvider>,
  );
};

const rowOrder = (html: string) =>
  [...html.matchAll(/data-line-id="([^"]+)"/g)]
    .map((match) => match[1]!)
    .filter((id, index, all) => all.indexOf(id) === index);

afterEach(() => useRecipeStore.setState({ baseOrder: [] }));

describe('PREP-14 PRO production rows follow the preparation plan', () => {
  it('lists the rows in plan order with the active row first, recipe mode untouched', () => {
    const { plannedInput, session } = batch();
    useRecipeStore.setState({ baseOrder: ['fresh-fruit', 'water', 'tara'] });

    const production = render('production', plannedInput, session);
    expect(rowOrder(production)).toEqual(['water', 'tara', 'fresh-fruit']);
    expect(production).toMatch(
      /data-production-active="true"[^>]*data-line-id="water"|data-line-id="water"[^>]*data-production-active="true"/,
    );

    const confirmed = confirmProductionLine(
      confirmProductionLine(session, 'water', '2026-09-17T10:01:00.000Z'),
      'tara',
      '2026-09-17T10:02:00.000Z',
    );
    const afterHeat = render('production', plannedInput, confirmed);
    expect(afterHeat).toMatch(
      /data-production-active="true"[^>]*data-line-id="fresh-fruit"|data-line-id="fresh-fruit"[^>]*data-production-active="true"/,
    );

    // Recipe mode keeps the stored order; nothing persisted changed.
    expect(rowOrder(render('recipe', plannedInput, session))).toEqual([
      'fresh-fruit',
      'water',
      'tara',
    ]);
    expect(useRecipeStore.getState().baseOrder).toEqual(['fresh-fruit', 'water', 'tara']);
    expect(session.lines.map((line) => line.lineId)).toEqual(['fresh-fruit', 'water', 'tara']);
    expect(session.plannedComposition.baseOrder).toEqual(['fresh-fruit', 'water', 'tara']);
  });
});
