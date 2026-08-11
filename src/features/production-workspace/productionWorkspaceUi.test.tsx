import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateRecipe, proposeCorrections, type RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { IngredientRow, type IngredientRowActions } from '@/features/ingredient-builder/IngredientRow';
import { monitorScoreView } from '@/features/pro-workbench/monitorSummaryView';
import { ProductionCockpit } from './ProductionCockpit';
import {
  confirmProductionLine,
  createProductionSession,
  productionProgress,
  setDraftActualGrams,
} from './productionSession';
import { assessProductionRescue } from './productionRescue';
import type { ProductionWorkspaceView } from './useProductionWorkspace';

const input: RecipeInput = {
  items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
  mode: 'classic',
  category: DEFAULT_PRESET.category,
  target_temperature_c: DEFAULT_PRESET.target_temperature_c,
  target_batch_grams: DEFAULT_PRESET.target_batch_grams,
  machine_capacity_grams: null,
};
const result = calculateRecipe(input);
const session = createProductionSession({
  sessionId: 'ui-run',
  ownerUserId: 'owner',
  source: {
    recipeId: 'recipe',
    recipeVersionId: 'version',
    recipeVersionNumber: 1,
    recipeName: 'Milk base',
  },
  plannedInput: input,
  startedAt: '2026-08-09T10:00:00.000Z',
});

const recipeActions: IngredientRowActions = {
  setPlannedGrams: vi.fn(),
  setActualGrams: vi.fn(),
  setLockType: vi.fn(),
  setMainIngredient: vi.fn(),
  removeItem: vi.fn(),
};

describe('Production workspace touch-first UI', () => {
  it('renders the binding always-visible [−] actual [+] [✓] controls with 44px touch targets', () => {
    const html = renderToStaticMarkup(
      <IngredientRow
        item={result.items[0]!}
        totalBatchG={result.total_batch_g}
        actions={recipeActions}
        mode="production"
        productionLine={session.lines[0]!}
        productionActions={{ setDraftActual: vi.fn(), confirmLine: vi.fn(), reopenRecord: vi.fn() }}
      />,
    );
    expect(html).toContain('>−</button>');
    expect(html).toContain('>+</button>');
    expect(html).toContain('>✓</button>');
    expect(html).toContain(`value="${session.lines[0]!.plannedGrams}"`);
    expect(html).toContain('min-h-11');
    expect(html).toContain('inputMode="decimal"');
    expect(html).not.toContain('overflow-x');
    expect(html).not.toContain('Dodano inną ilość');
  });

  it('keeps a confirmed delta visible and exposes the explicit record-correction affordance', () => {
    const line = session.lines[0]!;
    const confirmed = confirmProductionLine(
      setDraftActualGrams(session, line.lineId, line.plannedGrams + 2),
      line.lineId,
      '2026-08-09T10:01:00.000Z',
    );
    const html = renderToStaticMarkup(
      <IngredientRow
        item={calculateRecipe({ ...input, items: input.items.map((item, index) => ({ ...item, actual_grams: index === 0 ? line.plannedGrams + 2 : null })) }).items[0]!}
        totalBatchG={1002}
        actions={recipeActions}
        mode="production"
        productionLine={confirmed.lines[0]!}
        productionActions={{ setDraftActual: vi.fn(), confirmLine: vi.fn(), reopenRecord: vi.fn() }}
      />,
    );
    expect(html).toContain('+2.0 g');
    expect(html).toContain('popraw zapis');
    expect(html).toContain('>↺</button>');
  });

  it('keeps exact rescue precision in state but hides floating-point noise in the scale field', () => {
    const preciseLine = {
      ...session.lines[1]!,
      draftActualGrams: 357.75342952471976,
      targetGrams: 357.75342952471976,
    };
    const html = renderToStaticMarkup(
      <IngredientRow
        item={result.items[1]!}
        totalBatchG={result.total_batch_g}
        actions={recipeActions}
        mode="production"
        productionLine={preciseLine}
        productionActions={{ setDraftActual: vi.fn(), confirmLine: vi.fn(), reopenRecord: vi.fn() }}
      />,
    );
    expect(preciseLine.targetGrams).toBe(357.75342952471976);
    expect(html).toContain('value="357.753"');
    expect(html).not.toContain('357.75342952471976');
  });

  it('shows forecast progress, not Nutrition or a duplicated full Monitor', () => {
    const forecast = assessProductionRescue(session);
    const view = {
      session,
      progress: productionProgress(session),
      rescue: forecast,
      score: monitorScoreView(forecast.forecastResult, forecast.forecastInput).match,
      forecastInput: forecast.forecastInput,
      forecastResult: forecast.forecastResult,
      plannedInput: input,
      source: session.source,
      corrections: proposeCorrections({ input, context: 'planning', redact: false }),
      setDraftActual: vi.fn(),
      confirmLine: vi.fn(),
      reopenRecord: vi.fn(),
      applyVerifiedRescue: vi.fn(),
      complete: vi.fn(),
      startNewSession: vi.fn(),
    } as unknown as ProductionWorkspaceView;
    const html = renderToStaticMarkup(<ProductionCockpit production={view} />);
    expect(html).toContain('Przewidywane dopasowanie partii');
    expect(html).toContain('Ocena dotyczy przewidywanego składu');
    expect(html).toContain('0 / 6 składników');
    expect(html).not.toContain('Nutrition');
    expect(html).not.toContain('POD');
    expect(html).not.toContain('NPAC');
    expect(html).toContain('disabled=""');
  });
});
