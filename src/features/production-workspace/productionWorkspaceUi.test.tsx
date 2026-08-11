import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateRecipe, proposeCorrections, type RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { productionControlDecimals } from '@/features/ingredient-builder/directNumberControlModel';
import {
  IngredientRow,
  type IngredientRowActions,
} from '@/features/ingredient-builder/IngredientRow';
import { monitorScoreView } from '@/features/pro-workbench/monitorSummaryView';
import { ProductionCockpit } from './ProductionCockpit';
import {
  confirmProductionLine,
  completeProductionSession,
  createProductionSession,
  productionProgress,
  reopenProductionRecord,
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
        item={
          calculateRecipe({
            ...input,
            items: input.items.map((item, index) => ({
              ...item,
              actual_grams: index === 0 ? line.plannedGrams + 2 : null,
            })),
          }).items[0]!
        }
        totalBatchG={1002}
        actions={recipeActions}
        mode="production"
        productionLine={confirmed.lines[0]!}
        productionActions={{ setDraftActual: vi.fn(), confirmLine: vi.fn(), reopenRecord: vi.fn() }}
      />,
    );
    expect(html).toContain('+2 g');
    expect(html).toContain('popraw zapis');
    expect(html).toContain('>↺</button>');
  });

  it('makes the Owner 705 → 800 → +95 g deviation obvious in the shared rounded control', () => {
    const line = {
      ...session.lines[0]!,
      plannedGrams: 705,
      targetGrams: 705,
      draftActualGrams: 800,
    };
    const html = renderToStaticMarkup(
      <IngredientRow
        item={result.items[0]!}
        totalBatchG={result.total_batch_g}
        actions={recipeActions}
        mode="production"
        productionLine={line}
        productionActions={{ setDraftActual: vi.fn(), confirmLine: vi.fn(), reopenRecord: vi.fn() }}
      />,
    );

    expect(html).toContain('>705 g</strong>');
    expect(html).toContain('value="800"');
    expect(html).toContain('>+95 g</strong>');
    expect(html).toContain('powyżej planu');
    expect(html).toContain('aria-label="Różnica względem planu: plus 95 gramów, powyżej planu"');
    expect(html).toContain('data-production-control-state="addition"');
    expect(html).toContain('rounded-2xl');
    expect(html).toContain('shadow-pro-sm');
  });

  it.each([
    [705, 'exact', '0 g', 'zgodnie z planem'],
    [690, 'under', '-15 g', 'poniżej planu'],
  ] as const)(
    'keeps %s g visually and semantically distinct as the %s deviation state',
    (actual, state, visibleDifference, label) => {
      const line = {
        ...session.lines[0]!,
        plannedGrams: 705,
        targetGrams: 705,
        draftActualGrams: actual,
      };
      const html = renderToStaticMarkup(
        <IngredientRow
          item={result.items[0]!}
          totalBatchG={result.total_batch_g}
          actions={recipeActions}
          mode="production"
          productionLine={line}
          productionActions={{ setDraftActual: vi.fn(), confirmLine: vi.fn(), reopenRecord: vi.fn() }}
        />,
      );
      expect(html).toContain(`data-production-difference="${state}"`);
      expect(html).toContain(`>${visibleDifference}</strong>`);
      expect(html).toContain(label);
    },
  );

  it('announces correction mode and associates it with actual and confirm controls', () => {
    const line = session.lines[0]!;
    const confirmed = confirmProductionLine(
      setDraftActualGrams(session, line.lineId, line.plannedGrams + 2),
      line.lineId,
      '2026-08-09T10:01:00.000Z',
    );
    const reopened = reopenProductionRecord(confirmed, line.lineId);
    const correction = reopened.lines[0]!;
    const html = renderToStaticMarkup(
      <IngredientRow
        item={result.items[0]!}
        totalBatchG={result.total_batch_g}
        actions={recipeActions}
        mode="production"
        productionLine={correction}
        productionActions={{ setDraftActual: vi.fn(), confirmLine: vi.fn(), reopenRecord: vi.fn() }}
      />,
    );

    expect(html).toContain('data-production-mode="correction"');
    expect(html).toContain('data-production-control-state="correction"');
    expect(html).toContain('Korekta zapisu');
    expect(html).toContain(`aria-describedby="production-correction-${line.lineId}"`);
    expect(html).toContain('role="status"');
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
    expect(html).toContain('data-preserve-precision="true"');
  });

  it('keeps fractional physical steps available when the current actual is an integer', () => {
    expect(productionControlDecimals(2, 0.1)).toBe(1);
    expect(productionControlDecimals(42, 0.5)).toBe(1);
    expect(productionControlDecimals(800, 1)).toBe(0);
    expect(productionControlDecimals(357.75342952471976, 1)).toBe(3);

    const lowDose = {
      ...session.lines[0]!,
      plannedGrams: 2,
      targetGrams: 2,
      draftActualGrams: 2,
    };
    const html = renderToStaticMarkup(
      <IngredientRow
        item={result.items[0]!}
        totalBatchG={result.total_batch_g}
        actions={recipeActions}
        mode="production"
        productionLine={lowDose}
        productionActions={{ setDraftActual: vi.fn(), confirmLine: vi.fn(), reopenRecord: vi.fn() }}
      />,
    );
    expect(html).toContain('value="2.0"');
    expect(html).toContain('aria-valuenow="2"');
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

  it('hosts completed Master Label on a readable light sheet inside the dark Intelligence shell', () => {
    let confirmed = session;
    for (const [index, line] of confirmed.lines.entries()) {
      confirmed = confirmProductionLine(
        confirmed,
        line.lineId,
        `2026-08-09T10:${String(index + 1).padStart(2, '0')}:00.000Z`,
      );
    }
    const finalInput = {
      ...input,
      items: input.items.map((item) => ({ ...item, actual_grams: item.planned_grams })),
    };
    const completed = completeProductionSession(
      confirmed,
      calculateRecipe(finalInput),
      '2026-08-09T11:00:00.000Z',
      'owner',
    );
    const view = {
      session: completed,
      progress: productionProgress(completed),
      startNewSession: vi.fn(),
    } as unknown as ProductionWorkspaceView;

    const html = renderToStaticMarkup(<ProductionCockpit production={view} />);
    expect(html).toContain('data-testid="production-completed"');
    expect(html).toContain('Przygotowywanie Master Label');
    expect(html).toContain('bg-[#f7f5f0]');
    expect(html).toContain('text-stone-600');
    expect(html).not.toContain('class="p-3 text-xs text-stone-500"');
    expect(
      readFileSync(
        resolve(import.meta.dirname, '..', 'master-label', 'MasterLabelEditor.tsx'),
        'utf8',
      ),
    ).toContain('disabled:bg-stone-300 disabled:text-stone-700');
  });
});
