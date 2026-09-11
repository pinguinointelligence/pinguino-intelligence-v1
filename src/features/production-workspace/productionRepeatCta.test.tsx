/**
 * §21 — after a finished run, ask the question the customer is actually asking.
 *
 * First it has to be TRUE that the control repeats the same recipe, because the
 * owner's instruction was conditional on that. It is: the completed branch calls
 * `production.startNewSession()`, and `startNewSession` starts a run from
 * `production.source` — the same recipe version the finished run used. Nothing
 * re-selects a recipe, so „again" is the honest word for it.
 *
 * The pre-production start control answers a different question (a first run,
 * not a repeat) and deliberately keeps its own wording.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import { ProductionCockpit } from './ProductionCockpit';
import type { ProductionWorkspaceView } from './useProductionWorkspace';
import {
  completeProductionSession,
  confirmProductionLine,
  createProductionSession,
  productionProgress,
} from './productionSession';

const input: RecipeInput = {
  items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
  mode: 'classic',
  category: DEFAULT_PRESET.category,
  target_temperature_c: DEFAULT_PRESET.target_temperature_c,
  target_batch_grams: DEFAULT_PRESET.target_batch_grams,
  machine_capacity_grams: null,
};
const composition: RecipeCompositionMetadata = {
  schemaVersion: 1,
  baseScope: 'BASE_FORMULATION',
  baseOrder: input.items.map((item) => item.id),
  toppings: [],
  behaviorSnapshots: productBehaviorTestSnapshots(input),
  migrationAmbiguities: [],
};

function completedView(over: Partial<ProductionWorkspaceView> = {}): ProductionWorkspaceView {
  let run = createProductionSession({
    sessionId: 'repeat-run',
    ownerUserId: 'owner',
    source: {
      recipeId: 'recipe',
      recipeVersionId: 'version',
      recipeVersionNumber: 1,
      recipeName: 'Milk base',
    },
    plannedInput: input,
    plannedComposition: composition,
    startedAt: '2026-09-10T10:00:00.000Z',
  });
  for (const [index, line] of run.lines.entries()) {
    run = confirmProductionLine(
      run,
      line.lineId,
      `2026-09-10T10:${String(index + 1).padStart(2, '0')}:00.000Z`,
    );
  }
  const finalInput = {
    ...input,
    items: input.items.map((item) => ({ ...item, actual_grams: item.planned_grams })),
  };
  const completed = completeProductionSession(
    run,
    calculateRecipe(finalInput),
    '2026-09-10T11:00:00.000Z',
    'owner',
  );
  return {
    session: completed,
    progress: productionProgress(completed),
    startNewSession: vi.fn(),
    ...over,
  } as unknown as ProductionWorkspaceView;
}

const render = (view: ProductionWorkspaceView) =>
  renderToStaticMarkup(
    <ProductionCockpit
      production={view}
      onOpenPreview={vi.fn()}
      onRecalculate={vi.fn()}
      onReturnToRecipe={vi.fn()}
      onOpenLabel={vi.fn()}
    />,
  );

const cockpitSource = readFileSync(
  'src/features/production-workspace/ProductionCockpit.tsx',
  'utf8',
);
const workspaceSource = readFileSync(
  'src/features/production-workspace/useProductionWorkspace.ts',
  'utf8',
);

describe('§21 — „Chcesz powtórzyć?" / POWTÓRZ', () => {
  it('the control really does repeat the same recipe, from the same source', () => {
    // The premise the owner asked to verify before changing the word.
    expect(cockpitSource).toContain('() => void production.startNewSession()');
    expect(workspaceSource).toContain('startNewSession');
    const startBlock = workspaceSource.slice(workspaceSource.indexOf('startNewSession'));
    expect(startBlock).toContain('source');
  });

  it('asks the question and names the action, without the word „partia"', () => {
    const html = render(completedView());
    expect(html).toContain('data-testid="production-completed"');
    expect(html).toContain('Chcesz powtórzyć?');
    expect(html).toContain('POWTÓRZ');
    expect(html).not.toContain('Rozpocznij partię');

    const repeat = html.slice(html.indexOf('data-testid="production-repeat-recipe"'));
    const cta = repeat.slice(0, repeat.indexOf('</button>'));
    expect(cta.toLowerCase()).not.toContain('parti');
  });

  it('a blocker on a finished run still speaks for itself', () => {
    const html = render(
      completedView({
        prerequisite: {
          code: 'stale_source',
          eyebrow: 'Źródło nieaktualne',
          title: 'Źródło Produkcji jest nieaktualne',
          message: 'Zachowaj zakończony zapis i przygotuj nowe źródło.',
          action: 'archive_stale_session',
          actionLabel: 'Zarchiwizuj wcześniejszą partię',
        },
        archiveStaleSession: vi.fn(),
      } as unknown as Partial<ProductionWorkspaceView>),
    );
    expect(html).toContain('Zarchiwizuj wcześniejszą partię');
    expect(html).not.toContain('Chcesz powtórzyć?');
    expect(html).not.toContain('>POWTÓRZ<');
  });

  /* OWNER §21 (2026-09-11) — the FIRST start is a start, not a repeat: it says
     ROBIMY, and „Zaczynamy…" while it starts. Only the copy moved. */
  const firstRun = (over: Record<string, unknown> = {}) =>
    render({
      session: null,
      progress: null,
      prerequisite: null,
      practicalReady: true,
      plannedInput: input,
      source: { recipeVersionId: 'version' },
      startNewSession: vi.fn(),
      ...over,
    } as unknown as ProductionWorkspaceView);
  const startButton = (html: string) => {
    const at = html.indexOf('data-testid="start-production-session"');
    const rest = html.slice(at);
    return rest.slice(rest.indexOf('>') + 1, rest.indexOf('</button>'));
  };

  it('the FIRST run says ROBIMY — a start, never POWTÓRZ', () => {
    const html = firstRun();
    expect(startButton(html)).toBe('ROBIMY');
    expect(html).not.toContain('Rozpocznij partię');
    expect(html).not.toContain('POWTÓRZ');
    expect(html).not.toContain('Chcesz powtórzyć?');
  });

  it('while it starts it says „Zaczynamy…", without the word „partia"', () => {
    const html = firstRun({ sessionStarting: true });
    expect(startButton(html)).toBe('Zaczynamy…');
    expect(html).not.toContain('Rozpoczynamy partię…');
  });

  it('the two gates are unchanged and still outrank ROBIMY', () => {
    expect(
      startButton(
        firstRun({
          degassingRequired: true,
          degassingAcknowledged: false,
          carbonatedProducts: [{ productId: 'PR-ING-000001', name: 'Cola Zero', grams: 350 }],
          acknowledgeDegassing: vi.fn(),
        }),
      ),
    ).toBe('Najpierw potwierdź odgazowanie');
    expect(
      startButton(
        firstRun({
          heatInformation: [{ code: 'HEAT_TREATMENT_INDICATED', productName: 'TARA GUM' }],
          heatInformationAcknowledged: false,
          acknowledgeHeatInformation: vi.fn(),
        }),
      ),
    ).toBe('Najpierw potwierdź informację');
  });
});
