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
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';

const input: RecipeInput = {
  items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
  mode: 'classic',
  category: DEFAULT_PRESET.category,
  target_temperature_c: DEFAULT_PRESET.target_temperature_c,
  target_batch_grams: DEFAULT_PRESET.target_batch_grams,
  machine_capacity_grams: null,
};
const result = calculateRecipe(input);
const completedBehaviorSnapshots = productBehaviorTestSnapshots(input);
const completedComposition: RecipeCompositionMetadata = {
  schemaVersion: 1,
  baseScope: 'BASE_FORMULATION',
  baseOrder: input.items.map((item) => item.id),
  toppings: [],
  behaviorSnapshots: completedBehaviorSnapshots,
  migrationAmbiguities: [],
};
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
  plannedComposition: completedComposition,
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
  it('uses the Recipe table family instead of nesting the Production row in floating cards', () => {
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

    expect(html).toContain('data-production-row-family="recipe-table"');
    expect(html).toContain('data-production-control-family="recipe-direct-number"');
    expect(html).toContain('data-production-cell="planned"');
    expect(html).toContain('data-production-cell="deviation"');
    expect(html).toContain('border-b border-ink/[0.075]');
    expect(html).toContain('data-control-density="responsive"');
    expect(html).toContain('data-control-capacity="10000g"');
    expect(html).toContain('lg:min-h-7');
    expect(html).toContain('lg:w-[154px]');
    expect(html).toContain('data-category-symbol=');
    expect(html).toContain('text-[10px] leading-tight');
    expect(html).toContain('basis-full lg:mt-0 lg:ml-auto lg:basis-auto');
    expect(html).not.toContain('text-[9px] leading-none');
    expect(html).not.toContain('mx-2 mb-2 rounded-[20px]');
    expect(html).not.toContain('grid-cols-[minmax(0,1fr)_48px]');
  });

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
          productionActions={{
            setDraftActual: vi.fn(),
            confirmLine: vi.fn(),
            reopenRecord: vi.fn(),
          }}
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
    expect(html).toContain('POPRAW WPIS');
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

  it('renders one readable prerequisite with one working next action and no raw line ids', () => {
    const view = {
      session: null,
      progress: null,
      prerequisite: {
        code: 'product_authority_required',
        eyebrow: 'Wymaga receptury wykonawczej',
        title: 'Odśwież weryfikację produktów',
        message: 'Co najmniej jeden produkt wymaga ponownej weryfikacji.',
        action: 'recalculate',
        actionLabel: 'Przelicz recepturę',
      },
    } as unknown as ProductionWorkspaceView;
    const html = renderToStaticMarkup(
      <ProductionCockpit
        production={view}
        onOpenPreview={vi.fn()}
        onRecalculate={vi.fn()}
        onReturnToRecipe={vi.fn()}
      />,
    );
    expect(html).toContain('data-testid="production-prerequisite-action"');
    expect(html).toContain('text-stone-700');
    expect(html).not.toContain('new-recipe-');
    expect(html.match(/production-prerequisite-action/g) ?? []).toHaveLength(1);
  });

  it('requires an explicit start click before actual-entry controls exist', () => {
    const view = {
      session: null,
      progress: null,
      prerequisite: null,
      practicalReady: true,
      processReadiness: { status: 'READY', blockers: [], advisories: [] },
      source: session.source,
      plannedInput: input,
      startNewSession: vi.fn(),
    } as unknown as ProductionWorkspaceView;
    const html = renderToStaticMarkup(
      <ProductionCockpit
        production={view}
        onOpenPreview={vi.fn()}
        onRecalculate={vi.fn()}
        onReturnToRecipe={vi.fn()}
      />,
    );
    expect(html).toContain('data-testid="production-start-ready"');
    expect(html).toContain('data-testid="start-production-session"');
    expect(html).not.toContain('data-testid="production-actual-control"');
    const surface = readFileSync(
      resolve(import.meta.dirname, '..', 'studio', 'StudioEngineSurface.tsx'),
      'utf8',
    );
    expect(surface).toContain('production.session !== null');
    expect(surface).toContain("mode={productionActive ? 'production' : 'recipe'}");
  });

  // §1 OWNER RULE — Gellatti never selects the process mode. The hot/cold
  // choice is gone from Production and must never be recreated.
  it('never offers a thermal-mode choice before starting a batch', () => {
    const html = renderToStaticMarkup(
      <ProductionCockpit
        production={
          {
            session: null,
            progress: null,
            prerequisite: null,
            practicalReady: false,
            processReadiness: { status: 'READY', blockers: [], advisories: [] },
            source: session.source,
            plannedInput: input,
            startNewSession: vi.fn(),
          } as unknown as ProductionWorkspaceView
        }
        onOpenPreview={vi.fn()}
        onRecalculate={vi.fn()}
        onReturnToRecipe={vi.fn()}
      />,
    );
    expect(html).not.toContain('data-testid="production-thermal-mode"');
    expect(html).not.toContain('value="COLD_ONLY"');
    expect(html).not.toContain('value="HEAT_CAPABLE"');
    expect(html).not.toContain('Sposób przygotowania bazy');
    expect(html).not.toContain('Tylko na zimno');
    expect(html).not.toContain('Możliwa obróbka cieplna');
    expect(html).not.toContain('data-testid="production-process-blocked"');
  });

  // §3 OWNER RULE — an ingredient whose process is simply UNKNOWN is not a
  // Production event. Nothing is rendered; the fact stays under the `?`.
  it('renders nothing for missing process information before start', () => {
    const start = vi.fn();
    const html = renderToStaticMarkup(
      <ProductionCockpit
        production={
          {
            session: null,
            progress: null,
            prerequisite: null,
            practicalReady: true,
            processReadiness: {
              status: 'READY_WITH_INFO',
              blockers: [],
              advisories: [
                {
                  code: 'PROCESS_DATA_INSUFFICIENT',
                  lineId: input.items[0]!.id,
                  productId: 'product-approved',
                  mapperIngredientId: 'PI-ING-000236',
                  decision: 'UNKNOWN',
                  verificationStatus: 'unknown',
                  productName: input.items[0]!.ingredient.name,
                },
              ],
            },
            source: session.source,
            plannedInput: input,
            startNewSession: start,
          } as unknown as ProductionWorkspaceView
        }
        onOpenPreview={vi.fn()}
        onRecalculate={vi.fn()}
        onReturnToRecipe={vi.fn()}
      />,
    );
    expect(start).not.toHaveBeenCalled();
    expect(html).not.toContain('data-testid="production-process-advisory"');
    expect(html).not.toContain('nie mamy informacji o obróbce');
    expect(html).toContain('data-testid="start-production-session"');
    expect(html).not.toMatch(/data-testid="start-production-session"[^>]*disabled/);
  });

  // §3 again, on an ACTIVE run: unknown process never clutters real work.
  it('keeps an active batch free of unknown-process notices', () => {
    const forecast = assessProductionRescue(session);
    const html = renderToStaticMarkup(
      <ProductionCockpit
        production={
          {
            session,
            progress: productionProgress(session),
            toppingProgress: null,
            rescue: forecast,
            score: monitorScoreView(forecast.forecastResult, forecast.forecastInput).match,
            plannedInput: input,
            source: session.source,
            processReadiness: {
              status: 'READY_WITH_INFO',
              blockers: [],
              advisories: [
                {
                  code: 'PROCESS_DATA_INSUFFICIENT',
                  lineId: input.items[0]!.id,
                  productId: 'product-approved',
                  mapperIngredientId: 'PI-ING-000236',
                  decision: 'UNKNOWN',
                  verificationStatus: 'unknown',
                  productName: input.items[0]!.ingredient.name,
                },
              ],
            },
            setDraftActual: vi.fn(),
            confirmLine: vi.fn(),
            reopenRecord: vi.fn(),
            rescueAuthorization: { status: 'idle' },
            requestRescueAuthorization: vi.fn(),
            refreshRescueAuthorization: vi.fn(),
            consumeAuthorizedRescue: vi.fn(),
            dismissRescueAuthorization: vi.fn(),
            complete: vi.fn(),
          } as unknown as ProductionWorkspaceView
        }
        onOpenPreview={vi.fn()}
        onRecalculate={vi.fn()}
        onReturnToRecipe={vi.fn()}
      />,
    );

    expect(html).not.toContain('data-testid="production-process-advisory"');
    expect(html).not.toContain('nie mamy informacji o obróbce');
    expect(html).not.toContain('data-testid="production-process-blocked"');
    // §60 — no speculative "W PRZYGOTOWANIU" placeholder in real production work.
    expect(html).not.toContain('Brakuje składnika · automatyczne etapy');
  });

  // §10/§12/§19/§20 — a confirmed row is not a frozen checkbox. When the plan
  // still asks for more of it, the row says so and offers the direct fix.
  it('asks a short-added row for the missing grams and never for fewer', () => {
    const line = session.lines[0]!;
    const shorted = confirmProductionLine(
      setDraftActualGrams(session, line.lineId, line.plannedGrams - 5),
      line.lineId,
      '2026-08-24T10:00:00.000Z',
    );
    const topUpLine = vi.fn();
    const html = renderToStaticMarkup(
      <IngredientRow
        item={result.items[0]!}
        totalBatchG={result.total_batch_g}
        actions={recipeActions}
        mode="production"
        productionLine={shorted.lines[0]!}
        productionActions={{
          setDraftActual: vi.fn(),
          confirmLine: vi.fn(),
          reopenRecord: vi.fn(),
          topUpLine,
        }}
      />,
    );
    expect(html).toContain('DODAJ JESZCZE 5 g');
    expect(html).toContain('Dodaj brakujące 5 g');
    expect(html).toContain(`data-testid="production-top-up-${line.lineId}"`);
    // The physical floor stays visible, so nobody can read this as "remove 5 g".
    expect(html).toContain('W naczyniu:');
    expect(html).toContain('data-production-difference="under"');
  });

  it('shows no top-up affordance on a row that is exactly on plan', () => {
    const line = session.lines[0]!;
    const exact = confirmProductionLine(session, line.lineId, '2026-08-24T10:00:00.000Z');
    const html = renderToStaticMarkup(
      <IngredientRow
        item={result.items[0]!}
        totalBatchG={result.total_batch_g}
        actions={recipeActions}
        mode="production"
        productionLine={exact.lines[0]!}
        productionActions={{
          setDraftActual: vi.fn(),
          confirmLine: vi.fn(),
          reopenRecord: vi.fn(),
          topUpLine: vi.fn(),
        }}
      />,
    );
    expect(html).toContain('DODANO');
    expect(html).not.toContain('Dodaj jeszcze');
    expect(html).not.toContain('Dodaj brakujące');
  });

  // §2 OWNER RULE — a POSITIVE heat fact is a one-time reminder with an OK.
  it('gates Start on one OK for verified positive heat information', () => {
    const heatInformation = [
      {
        code: 'HEAT_TREATMENT_INDICATED',
        productId: 'product-chocolate',
        mapperIngredientId: 'PI-ING-000087',
        decision: 'HEAT_REQUIRED_FOR_FUNCTION',
        verificationStatus: 'verified',
        productName: 'DARK CHOCOLATE 55%',
      },
    ];
    const render = (acknowledged: boolean) =>
      renderToStaticMarkup(
        <ProductionCockpit
          production={
            {
              session: null,
              progress: null,
              prerequisite: null,
              practicalReady: acknowledged,
              source: session.source,
              plannedInput: input,
              heatInformation,
              heatInformationAcknowledged: acknowledged,
              acknowledgeHeatInformation: vi.fn(),
              startNewSession: vi.fn(),
            } as unknown as ProductionWorkspaceView
          }
          onOpenPreview={vi.fn()}
          onRecalculate={vi.fn()}
          onReturnToRecipe={vi.fn()}
        />,
      );

    const pending = render(false);
    expect(pending).toContain('Pamiętaj o obróbce');
    expect(pending).toContain('Najpierw potwierdź informację');
    expect(pending).toMatch(
      /<button(?=[^>]*data-testid="start-production-session")(?=[^>]*\sdisabled="")/,
    );
    const confirmed = render(true);
    expect(confirmed).toContain('Informacja potwierdzona');
    expect(confirmed).toContain('Rozpocznij partię');
    expect(confirmed).not.toMatch(
      /<button(?=[^>]*data-testid="start-production-session")(?=[^>]*\sdisabled="")/,
    );
  });

  it('reminds the operator about verified heat treatment and takes one OK', () => {
    const forecast = assessProductionRescue(session);
    const acknowledge = vi.fn();
    const view = (acknowledged: boolean) =>
      ({
        session,
        progress: productionProgress(session),
        toppingProgress: null,
        rescue: forecast,
        score: monitorScoreView(forecast.forecastResult, forecast.forecastInput).match,
        plannedInput: input,
        source: session.source,
        heatInformation: [
          {
            code: 'HEAT_TREATMENT_INDICATED',
            productId: 'product-chocolate',
            mapperIngredientId: 'PI-ING-000087',
            decision: 'HEAT_REQUIRED_FOR_FUNCTION',
            verificationStatus: 'verified',
            productName: 'DARK CHOCOLATE 55%',
          },
        ],
        heatInformationAcknowledged: acknowledged,
        acknowledgeHeatInformation: acknowledge,
        setDraftActual: vi.fn(),
        confirmLine: vi.fn(),
        reopenRecord: vi.fn(),
        rescueAuthorization: { status: 'idle' },
        requestRescueAuthorization: vi.fn(),
        refreshRescueAuthorization: vi.fn(),
        consumeAuthorizedRescue: vi.fn(),
        dismissRescueAuthorization: vi.fn(),
        complete: vi.fn(),
      }) as unknown as ProductionWorkspaceView;

    const pending = renderToStaticMarkup(
      <ProductionCockpit
        production={view(false)}
        onOpenPreview={vi.fn()}
        onRecalculate={vi.fn()}
        onReturnToRecipe={vi.fn()}
      />,
    );
    expect(pending).toContain('Pamiętaj o obróbce');
    expect(pending).toContain('DARK CHOCOLATE 55%');
    expect(pending).toContain('data-testid="acknowledge-production-heat-information"');
    expect(pending).toContain('data-acknowledged="false"');
    // It is awareness only: once a run is active it never becomes a science gate.
    expect(pending).not.toContain('data-testid="production-process-blocked"');

    const confirmed = renderToStaticMarkup(
      <ProductionCockpit
        production={view(true)}
        onOpenPreview={vi.fn()}
        onRecalculate={vi.fn()}
        onReturnToRecipe={vi.fn()}
      />,
    );
    expect(confirmed).toContain('Informacja potwierdzona');
    expect(confirmed).toContain('data-acknowledged="true"');
    expect(confirmed).not.toContain('data-testid="acknowledge-production-heat-information"');
  });

  // §3 — an unknown process is still nothing, even next to a known heat fact.
  it('shows no heat card when nothing is positively indicated', () => {
    const forecast = assessProductionRescue(session);
    const html = renderToStaticMarkup(
      <ProductionCockpit
        production={
          {
            session,
            progress: productionProgress(session),
            toppingProgress: null,
            rescue: forecast,
            score: monitorScoreView(forecast.forecastResult, forecast.forecastInput).match,
            plannedInput: input,
            source: session.source,
            heatInformation: [],
            heatInformationAcknowledged: true,
            acknowledgeHeatInformation: vi.fn(),
            setDraftActual: vi.fn(),
            confirmLine: vi.fn(),
            reopenRecord: vi.fn(),
            rescueAuthorization: { status: 'idle' },
            requestRescueAuthorization: vi.fn(),
            refreshRescueAuthorization: vi.fn(),
            consumeAuthorizedRescue: vi.fn(),
            dismissRescueAuthorization: vi.fn(),
            complete: vi.fn(),
          } as unknown as ProductionWorkspaceView
        }
        onOpenPreview={vi.fn()}
        onRecalculate={vi.fn()}
        onReturnToRecipe={vi.fn()}
      />,
    );
    expect(html).not.toContain('data-testid="production-heat-information"');
    expect(html).not.toContain('Pamiętaj o obróbce');
  });

  it('opens an existing Preview without starting a new recalculation', () => {
    const hook = readFileSync(resolve(import.meta.dirname, 'useProductionWorkspace.ts'), 'utf8');
    const cockpit = readFileSync(resolve(import.meta.dirname, 'ProductionCockpit.tsx'), 'utf8');
    const surface = readFileSync(
      resolve(import.meta.dirname, '..', 'studio', 'StudioEngineSurface.tsx'),
      'utf8',
    );
    expect(hook).toContain("'preview_not_applied'");
    expect(hook).toContain("'open_preview'");
    expect(hook).toContain("'preview_required'");
    expect(hook).toContain("'recalculate'");
    expect(cockpit).toContain("prerequisite.action === 'open_preview'");
    expect(cockpit).toContain("prerequisite.action === 'recalculate'");
    expect(surface).toContain('onOpenPreview={onOpenExistingPreview');
    expect(surface).toContain('onRecalculate={onRecalculate');
  });

  it('uses durable reconciliation, server Rescue authority, and atomic start/completion', () => {
    const hook = readFileSync(resolve(import.meta.dirname, 'useProductionWorkspace.ts'), 'utf8');
    expect(hook).toContain('.getRun(localSession.sessionId');
    expect(hook).toContain('.listRuns(ownerUserId');
    expect(hook).toContain('hydrateProductionSessionFromRun');
    expect(hook).toContain('.startRun({');
    expect(hook).toContain('.authorizeRescue({');
    expect(hook).toContain('.consumeRescue({');
    expect(hook).not.toContain('.applyRescue(');
    expect(hook).not.toContain('applyVerifiedRescueInput');
    expect(hook).toContain('.completeRun(');
    expect(hook).not.toContain("transition(\n          session.sessionId,\n          'completed'");
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
      rescueAuthorization: { status: 'idle' },
      rescueAuthorizationInvalidation: null,
      requestRescueAuthorization: vi.fn(),
      refreshRescueAuthorization: vi.fn(),
      consumeAuthorizedRescue: vi.fn(),
      dismissRescueAuthorization: vi.fn(),
      complete: vi.fn(),
      startNewSession: vi.fn(),
    } as unknown as ProductionWorkspaceView;
    const html = renderToStaticMarkup(
      <ProductionCockpit
        production={view}
        onOpenPreview={vi.fn()}
        onRecalculate={vi.fn()}
        onReturnToRecipe={vi.fn()}
      />,
    );
    // §51 SCORE TRUTH — every pre-completion figure names the PLAN it describes.
    expect(html).toContain('Przewidywany wynik po zakończeniu planu');
    expect(html).toContain('Przewidywany wynik po zakończeniu aktualnego planu');
    expect(html).toContain('0 / 6 składników');
    // §22 LIVE MONITOR — vessel, current plan and what is still to be added.
    expect(html).toContain('data-testid="production-vessel-mass"');
    expect(html).toContain('data-testid="production-current-plan-mass"');
    expect(html).toContain('data-testid="production-remaining-mass"');
    expect(html).not.toContain('Nutrition');
    expect(html).not.toContain('POD');
    expect(html).not.toContain('NPAC');
    expect(html).toContain('disabled=""');
  });

  it('renders the current authorized Rescue target as the operator plan', () => {
    const reduced = {
      ...session.lines[0]!,
      plannedGrams: 400,
      targetGrams: 350,
      draftActualGrams: 350,
    };
    const item = {
      ...result.items[0]!,
      planned_grams: 400,
    };
    const html = renderToStaticMarkup(
      <IngredientRow
        item={item}
        totalBatchG={result.total_batch_g}
        actions={{} as IngredientRowActions}
        mode="production"
        productionLine={reduced}
        productionActions={{
          setDraftActual: vi.fn(),
          confirmLine: vi.fn(),
          reopenRecord: vi.fn(),
        }}
      />,
    );

    expect(html).toContain('350 g');
    expect(html).not.toContain('>400 g</strong>');
    expect(html).toContain('data-production-difference="exact"');
    expect(html).toContain('Różnica względem planu: 0 gramów, zgodnie z planem');
    expect(html).not.toContain('-50 g');
  });

  it('renders only the server-authorized Rescue Preview as applicable', () => {
    const first = session.lines[0]!;
    const deviated = confirmProductionLine(
      setDraftActualGrams(session, first.lineId, first.plannedGrams + 50),
      first.lineId,
      '2026-08-19T10:01:00.000Z',
    );
    const rescue = assessProductionRescue(deviated);
    expect(rescue.state).toBe('options');
    const view = {
      session: deviated,
      progress: productionProgress(deviated),
      toppingProgress: null,
      rescue,
      score: monitorScoreView(rescue.forecastResult, rescue.forecastInput).match,
      forecastInput: rescue.forecastInput,
      forecastResult: rescue.forecastResult,
      plannedInput: input,
      source: session.source,
      corrections: proposeCorrections({ input, context: 'planning', redact: false }),
      persistenceBusy: false,
      rescueAuthorizationInvalidation: null,
      rescueAuthorization: {
        status: 'preview',
        consumeIdempotencyKey: 'consume-once',
        refreshRequired: false,
        error: null,
        authorization: {
          authorizationId: 'authorization-1',
          candidateFingerprint: 'trusted-fingerprint-1',
          runId: deviated.sessionId,
          stableOptionId: 'enlarge_batch',
          expectedActualRevision: deviated.durableActualRevision,
          expectedRescueRevision: deviated.durableRescueRevision,
          authorizedAt: '2026-08-19T10:02:00.000Z',
          expiresAt: '2026-08-19T10:07:00.000Z',
          preview: {
            title: 'Powiększ partię',
            explanation: 'Autoryzowana korekta bez zmiany potwierdzonych gramów.',
            finalMassG: 1050,
            scoreDisplay: '94%',
            instructions: [
              {
                lineId: 'sugar',
                ingredientName: 'Sugar',
                kind: 'add',
                grams: 50,
                finalTargetGrams: 450,
              },
              {
                lineId: 'cream',
                ingredientName: 'Cream',
                kind: 'reduce_pending_plan',
                grams: 50,
                finalTargetGrams: 350,
              },
            ],
          },
        },
      },
      setDraftActual: vi.fn(),
      confirmLine: vi.fn(),
      reopenRecord: vi.fn(),
      requestRescueAuthorization: vi.fn(),
      refreshRescueAuthorization: vi.fn(),
      consumeAuthorizedRescue: vi.fn(),
      dismissRescueAuthorization: vi.fn(),
      complete: vi.fn(),
    } as unknown as ProductionWorkspaceView;
    const html = renderToStaticMarkup(
      <ProductionCockpit
        production={view}
        onOpenPreview={vi.fn()}
        onRecalculate={vi.fn()}
        onReturnToRecipe={vi.fn()}
      />,
    );
    expect(html).toContain('Preview autoryzowany przez serwer');
    expect(html).toContain('data-candidate-fingerprint="trusted-fingerprint-1"');
    expect(html).toContain('data-testid="apply-authorized-production-rescue"');
    expect(html).toContain('Powiększ do 1050 g');
    expect(html).toContain('data-mobile-presentation="bottom-sheet"');
    expect(html).toContain('fixed inset-x-0 bottom-0');
    expect(html).toContain('sm:static');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('Nowy plan · Cream');
    expect(html).toContain('→ 350 g');
    expect(html).not.toMatch(
      /<button(?=[^>]*data-testid="apply-authorized-production-rescue")[^>]* disabled=""/,
    );
    expect(html).not.toContain('data-testid="production-rescue-options"');

    if (view.rescueAuthorization.status !== 'preview') throw new Error('preview fixture required');
    const previewAuthorization = view.rescueAuthorization;
    const keepOriginalHtml = renderToStaticMarkup(
      <ProductionCockpit
        production={
          {
            ...view,
            rescueAuthorization: {
              ...previewAuthorization,
              authorization: {
                ...previewAuthorization.authorization,
                stableOptionId: 'keep_original_batch',
                preview: {
                  ...previewAuthorization.authorization.preview,
                  finalMassG: 1000,
                },
              },
            },
          } as unknown as ProductionWorkspaceView
        }
        onOpenPreview={vi.fn()}
        onRecalculate={vi.fn()}
        onReturnToRecipe={vi.fn()}
      />,
    );
    expect(keepOriginalHtml).toContain('Napraw do 1000 g');

    const staleHtml = renderToStaticMarkup(
      <ProductionCockpit
        production={
          {
            ...view,
            rescueAuthorizationInvalidation: 'expired',
          } as unknown as ProductionWorkspaceView
        }
        onOpenPreview={vi.fn()}
        onRecalculate={vi.fn()}
        onReturnToRecipe={vi.fn()}
      />,
    );
    expect(staleHtml).toMatch(
      /<button(?=[^>]*data-testid="apply-authorized-production-rescue")[^>]*disabled=""/,
    );
    expect(staleHtml).toContain('Odśwież propozycję Rescue');
    expect(staleHtml).toContain('data-testid="refresh-production-rescue-authorization"');
    expect(staleHtml).toContain('Autoryzacja Preview wygasła');
  });

  it('offers the completed run as an explicit transition to LabelWorkspace', () => {
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

    const html = renderToStaticMarkup(
      <ProductionCockpit
        production={view}
        onOpenPreview={vi.fn()}
        onRecalculate={vi.fn()}
        onReturnToRecipe={vi.fn()}
      />,
    );
    expect(html).toContain('data-testid="production-completed"');
    expect(html).toContain('Partia gotowa');
    expect(html).toContain('Przejdź do etykiety');
    expect(html).toContain('data-testid="production-go-to-label"');
    expect(html).not.toContain('/labels?run=ui-run');
    expect(html).not.toContain('class="p-3 text-xs text-stone-500"');
    const staleCompletedHtml = renderToStaticMarkup(
      <ProductionCockpit
        production={
          {
            ...view,
            prerequisite: {
              code: 'stale_source',
              eyebrow: 'Źródło nieaktualne',
              title: 'Źródło Produkcji jest nieaktualne',
              message: 'Zachowaj zakończony zapis i przygotuj nowe źródło.',
              action: 'archive_stale_session',
              actionLabel: 'Zarchiwizuj starą sesję',
            },
            archiveStaleSession: vi.fn(),
          } as unknown as ProductionWorkspaceView
        }
        onOpenPreview={vi.fn()}
        onRecalculate={vi.fn()}
        onReturnToRecipe={vi.fn()}
      />,
    );
    expect(staleCompletedHtml).toContain('data-testid="production-completed"');
    expect(staleCompletedHtml).toContain('Zarchiwizuj starą sesję');
    expect(staleCompletedHtml).toContain('Zachowaj zakończony zapis');
    const labelWorkspace = readFileSync(
      resolve(import.meta.dirname, '..', 'master-label', 'LabelWorkspace.tsx'),
      'utf8',
    );
    expect(labelWorkspace).toContain('Zapisz finalną etykietę');
    expect(labelWorkspace).toContain('Dane wewnętrzne · poza wydrukiem.');
    expect(labelWorkspace).toContain('data-testid="consumer-print-boundary"');
    const recipeProfilePanel = readFileSync(
      resolve(import.meta.dirname, '..', 'pro-workbench', 'RecipeProfilePanel.tsx'),
      'utf8',
    );
    expect(recipeProfilePanel).toContain("onOpenLabel={() => onTabChange('summary')}");
  });
});
