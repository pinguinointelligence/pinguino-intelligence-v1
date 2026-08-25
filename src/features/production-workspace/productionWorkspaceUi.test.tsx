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
import { ProductionWorkspaceHeader } from './ProductionWorkspaceHeader';
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
    expect(html).toContain('data-production-cell="action"');
    expect(html).toContain('data-category-symbol=');
    expect(html).toContain('text-[10px] leading-tight');
    expect(html).toContain('md:grid-cols-[minmax(300px,1fr)_142px_150px_96px_28px]');
    expect(html).not.toContain('text-[9px] leading-none');
    expect(html).not.toContain('mx-2 mb-2 rounded-[20px]');
    expect(html).not.toContain('grid-cols-[minmax(0,1fr)_48px]');
  });

  it('turns completed rows into settled records without a reopen affordance', () => {
    const line = {
      ...session.lines[0]!,
      confirmed: true,
      physicalAddedGrams: session.lines[0]!.targetGrams,
      confirmedAt: '2026-08-09T10:01:00.000Z',
      confirmationOrder: 1,
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
          settled: true,
        }}
      />,
    );
    expect(html).toContain('data-production-confirmation="settled"');
    expect(html).not.toContain('popraw zapis');
    expect(html).not.toContain('Dodaj kolejną ilość');
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
    expect(html).toContain('+2 g ponad plan');
    expect(html).toContain('DODANO');
    expect(html).not.toContain('>RÓŻNICA<');
    expect(html).toContain('popraw zapis');
    expect(html).toContain('>↺</button>');
  });

  it('uses a Gellatti mistaken-entry dialog and contains no native confirmation', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '..', 'ingredient-builder', 'IngredientRow.tsx'),
      'utf8',
    );
    expect(source).not.toContain('window.confirm');
    expect(source).toContain('production-record-correction-dialog');
    expect(source).toContain('Poprawiasz wcześniejszy wpis');
    expect(source).toContain('Popraw błędny wpis');
  });

  it('keeps the Production table and physical workflow explicitly separated', () => {
    const builderSource = readFileSync(
      resolve(import.meta.dirname, '..', 'ingredient-builder', 'IngredientBuilder.tsx'),
      'utf8',
    );
    const headerSource = readFileSync(
      resolve(import.meta.dirname, 'ProductionWorkspaceHeader.tsx'),
      'utf8',
    );
    for (const heading of ['Składnik / status', 'Plan', 'Faktycznie', 'Odchylenie']) {
      expect(builderSource).toContain(`'${heading}'`);
    }
    expect(headerSource).toContain('Odważ');
    expect(headerSource).toContain('Wpisz faktyczną ilość');
    expect(headerSource).toContain('Potwierdź');
    expect(builderSource).toContain('Potwierdzonej ilości nie można odjąć od naczynia.');
    expect(builderSource).not.toContain('production.progress.confirmedCount');
    expect(builderSource).not.toContain('Faktycznie · status / potwierdź');
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
    expect(html).toContain('>+95 g ponad plan</strong>');
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
      expect(html).toContain(
        `>${visibleDifference}${state === 'under' ? ' poniżej planu' : ''}</strong>`,
      );
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
    expect(html).toContain('DO POTWIERDZENIA');
    expect(html).toContain('Poprawiasz zapis faktycznej ilości');
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

  it('keeps a completed short-added row compact without a permanent top-up action', () => {
    const line = session.lines[0]!;
    const shorted = confirmProductionLine(
      setDraftActualGrams(session, line.lineId, line.plannedGrams - 5),
      line.lineId,
      '2026-08-24T10:00:00.000Z',
    );
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
        }}
      />,
    );
    expect(html).toContain('DODANO');
    expect(html).not.toContain('Dodaj brakujące');
    expect(html).not.toContain('Dodaj kolejną ilość');
    // The physical floor stays visible, so nobody can read this as "remove 5 g".
    expect(html).toContain('W naczyniu:');
    expect(html).toContain('data-production-difference="under"');
  });

  it('shows only the grams to weigh now in an authorized confirmed-line top-up', () => {
    const line = session.lines[0]!;
    const confirmed = confirmProductionLine(session, line.lineId, '2026-08-24T10:00:00.000Z');
    const rescuedLine = {
      ...confirmed.lines[0]!,
      targetGrams: line.plannedGrams + 267,
      draftActualGrams: line.plannedGrams + 267,
      confirmed: false,
      confirmedAt: null,
      confirmationOrder: null,
    };
    const html = renderToStaticMarkup(
      <IngredientRow
        item={result.items[0]!}
        totalBatchG={result.total_batch_g}
        actions={recipeActions}
        mode="production"
        productionLine={rescuedLine}
        productionActions={{
          setDraftActual: vi.fn(),
          confirmLine: vi.fn(),
          reopenRecord: vi.fn(),
        }}
      />,
    );

    expect(html).toContain('data-production-mode="top-up"');
    expect(html).toContain('Docelowo');
    expect(html).toContain('Dodaj teraz');
    expect(html).toContain('data-production-control-state="top-up"');
    expect(html).toContain('value="267"');
    expect(html).toContain(`W naczyniu: ${line.plannedGrams} g`);
    expect(html).not.toContain(`value="${line.plannedGrams + 267}"`);
    expect(html).not.toContain('Dodaj kolejną ilość');
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

  it('renders one persisted degassing card and blocks Start until confirmation', () => {
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
              heatInformation: [],
              heatInformationAcknowledged: true,
              carbonatedProducts: [
                { productId: 'PR-ING-000001', name: 'Cola Zero', grams: 350 },
                { productId: 'PM-ING-000002', name: 'Woda gazowana', grams: 50 },
              ],
              degassingRequired: true,
              degassingAcknowledged: acknowledged,
              acknowledgeDegassing: vi.fn(),
              startNewSession: vi.fn(),
            } as unknown as ProductionWorkspaceView
          }
          onOpenPreview={vi.fn()}
          onRecalculate={vi.fn()}
          onReturnToRecipe={vi.fn()}
        />,
      );
    const pending = render(false);
    expect(pending.match(/data-testid="production-degassing"/g)).toHaveLength(1);
    expect(pending).toContain('Przed użyciem należy całkowicie odgazować');
    expect(pending).toContain('Cola Zero');
    expect(pending).toContain('350 g');
    expect(pending).toContain('Woda gazowana');
    expect(pending).toContain('✓ Odgazowane');
    expect(pending).toMatch(/<button[^>]*disabled[^>]*data-testid="start-production-session"/);

    const confirmed = render(true);
    expect(confirmed).toContain('data-acknowledged="true"');
    const startTag = confirmed.match(
      /<button[^>]*data-testid="start-production-session"[^>]*>/,
    )?.[0];
    expect(startTag).toBeDefined();
    expect(startTag).not.toContain(' disabled=');
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
      <>
        <ProductionWorkspaceHeader production={view} />
        <ProductionCockpit
          production={view}
          onOpenPreview={vi.fn()}
          onRecalculate={vi.fn()}
          onReturnToRecipe={vi.fn()}
        />
      </>,
    );
    // §51 SCORE TRUTH — every pre-completion figure names the PLAN it describes.
    expect(html).toContain('Przewidywany wynik');
    expect(html).toContain('data-testid="production-score-ring"');
    expect(html.match(/data-testid="production-score-ring"/g) ?? []).toHaveLength(1);
    expect(html).toContain('0 / 6 składników');
    expect(html.match(/0 \/ 6 składników/g) ?? []).toHaveLength(1);
    expect(html).toContain('data-testid="production-workspace-header"');
    expect(html).toContain('data-testid="production-workspace-progress"');
    expect(html).toContain('data-testid="production-batch-state"');
    // §22 LIVE MONITOR — vessel, current plan and what is still to be added.
    expect(html).toContain('data-testid="production-vessel-mass"');
    expect(html).toContain('data-testid="production-current-plan-mass"');
    expect(html).toContain('data-testid="production-remaining-mass"');
    expect(html).not.toContain('Nutrition');
    expect(html).not.toContain('POD');
    expect(html).not.toContain('NPAC');
    expect(html).toContain('disabled=""');
  });

  it('replaces active instructions and numeric progress with one quiet completed state', () => {
    const completedSession = {
      ...session,
      status: 'completed',
      completedAt: '2026-08-09T11:00:00.000Z',
      completionSnapshot: {
        actualFinalMassG: input.target_batch_grams,
        productComposition: { toppings: [] },
      },
    } as unknown as typeof session;
    const view = {
      session: completedSession,
      progress: productionProgress(completedSession),
      score: { score: 10, label: 'Wyjątkowo dobrze dopasowana' },
    } as unknown as ProductionWorkspaceView;

    const html = renderToStaticMarkup(<ProductionWorkspaceHeader production={view} />);
    expect(html).toContain('data-production-state="completed"');
    expect(html).toContain('✓ Partia gotowa');
    expect(html).not.toContain('production-workspace-instructions');
    expect(html).not.toContain('production-workspace-progress');
    expect(html).not.toContain('składników');
    expect(html).not.toContain('Przewidywany wynik');
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

  it('renders the server-calculated outcomes as selectable decision cards', () => {
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
      plannedScore: { score: 10 },
      recommendedRescueOptionId: 'enlarge_batch',
      selectedRescueOptionId: 'enlarge_batch',
      rescueOptionStates: {
        keep_original_batch: {
          status: 'unavailable',
          reason: 'Niedostępne — potwierdzone ilości przekraczają zakres tej opcji.',
        },
        enlarge_batch: {
          status: 'available',
          consumeIdempotencyKey: 'consume-once',
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
        leave_as_is: {
          status: 'unavailable',
          reason: 'Ta opcja nie jest bezpieczna dla obecnej partii.',
        },
      },
      setDraftActual: vi.fn(),
      confirmLine: vi.fn(),
      reopenRecord: vi.fn(),
      requestRescueAuthorization: vi.fn(),
      refreshRescueAuthorization: vi.fn(),
      consumeAuthorizedRescue: vi.fn(),
      applySelectedRescueOption: vi.fn(),
      selectRescueOption: vi.fn(),
      retryRescueOptions: vi.fn(),
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
    expect(html).toContain('Jak chcesz postąpić z odchyleniem?');
    expect(html).toContain('data-testid="production-rescue-options"');
    expect(html).toContain('data-testid="production-decision-enlarge_batch"');
    expect(html).toContain('data-decision-state="selected"');
    expect(html).toMatch(
      /<button(?=[^>]*data-testid="production-decision-leave_as_is")(?=[^>]*disabled="")/,
    );
    expect(html).toContain('Ta opcja nie jest bezpieczna dla obecnej partii.');
    expect(html).toContain('Minimalna bezpieczna korekta · 1050 g');
    expect(html).toContain('Rekomendowane');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('Nowy plan · Cream');
    expect(html).toContain('→ 350 g');
    expect(html).toContain('data-testid="apply-selected-production-decision"');
    expect(html).toContain('Zastosuj nową partię');
    expect(html).not.toContain('Pokaż preview');
    expect(html).not.toContain('Odśwież propozycję Rescue');
    expect(html).not.toContain('Engine');
    expect(html).not.toContain('server authorizes');

    const enlargement = view.rescueOptionStates.enlarge_batch;
    if (enlargement?.status !== 'available') throw new Error('available fixture required');
    const lowerScoreHtml = renderToStaticMarkup(
      <ProductionCockpit
        production={
          {
            ...view,
            recommendedRescueOptionId: 'keep_original_batch',
            selectedRescueOptionId: 'leave_as_is',
            rescueOptionStates: {
              ...view.rescueOptionStates,
              leave_as_is: {
                status: 'available',
                consumeIdempotencyKey: 'consume-lower-score',
                authorization: {
                  ...enlargement.authorization,
                  authorizationId: 'authorization-lower-score',
                  stableOptionId: 'leave_as_is',
                  preview: {
                    title: 'Kontynuuj bez korekty',
                    explanation: 'Obecna partia pozostaje bezpieczna.',
                    finalMassG: 1050,
                    scoreDisplay: '8/10',
                    instructions: [],
                  },
                },
              },
            },
          } as ProductionWorkspaceView
        }
        onOpenPreview={vi.fn()}
        onRecalculate={vi.fn()}
        onReturnToRecipe={vi.fn()}
      />,
    );
    expect(lowerScoreHtml).toContain('data-testid="production-decision-leave_as_is"');
    expect(lowerScoreHtml).toContain('bg-pro-amber/40');
    expect(lowerScoreHtml).toContain('✓ Wybrano');
    expect(lowerScoreHtml).toContain('Akceptuję wynik i kontynuuję');
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
    expect(html).not.toContain('Partia gotowa');
    expect(html).toContain('Wynik końcowy');
    expect(html).toContain('LOT-20260809-UIRUN');
    expect(html).toContain('Koszt partii');
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
