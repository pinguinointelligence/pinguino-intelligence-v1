/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import {
  beginPiRecalculation,
  productBehaviorTerminal,
  runPiRecalculationWithTerminal,
  serverBehaviorPreviewIssue,
  unlockConstraintAndRecalculate,
  useConstraintStudioStore,
  type PreviewIssue,
} from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { ProRecalcPanel } from './ProRecalcPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const renderPanel = async (onClose = vi.fn()) => {
  await act(async () => {
    root.render(<ProRecalcPanel open onClose={onClose} />);
  });
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  useRecipeStore.getState().loadRecipeInput(starterMilkBase());
  useConstraintStudioStore.getState().resetForTests();
});

afterEach(async () => {
  vi.useRealTimers();
  await act(async () => root.unmount());
  host.remove();
});

describe('PI visible terminal contract', () => {
  it('starts cleanly after a prior refusal, then never leaves a resolved run stranded in WORKING', async () => {
    useConstraintStudioStore.setState({
      preview: {} as never,
      previewIssue: {
        ok: false,
        code: 'substitution_invalid',
        reasons: ['unavailable_ingredient_present'],
        messagePl: 'Stara odmowa produktu.',
      },
      history: [{} as never],
      recalculationTerminal: {
        state: 'BLOCKED_WITH_EXACT_ACTION',
        code: 'substitution_invalid',
        messagePl: 'Stara odmowa produktu.',
        action: 'choose_product',
      },
    });

    const generation = beginPiRecalculation();

    expect(useConstraintStudioStore.getState()).toMatchObject({
      preview: null,
      previewIssue: null,
      history: [],
      recalculationTerminal: { state: 'WORKING' },
    });
    await renderPanel();
    expect(document.querySelector('[data-terminal-state="WORKING"]')).not.toBeNull();
    expect(document.body.textContent).toContain('PI przelicza recepturę…');
    expect(
      document.querySelector<HTMLButtonElement>('[data-testid="pro-recalc-close"]')?.disabled,
    ).toBe(true);

    await act(async () => {
      await runPiRecalculationWithTerminal(async () => undefined, generation);
    });
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'BLOCKED_WITH_EXACT_ACTION',
      code: 'apply_failed',
      messagePl: 'PI zakończyło przeliczenie bez wyniku. Wróć do receptury i spróbuj ponownie.',
      action: 'return_to_recipe',
    });
    expect(document.body.textContent).toContain('PI zakończyło przeliczenie bez wyniku.');
    expect(document.body.textContent).not.toContain('Stara odmowa produktu.');
    expect(document.body.textContent).not.toContain('Wybierz produkt');
  });

  it('turns an unexpected rejected run into an exact visible terminal', async () => {
    const generation = beginPiRecalculation();
    await runPiRecalculationWithTerminal(async () => {
      throw new Error('network interrupted');
    }, generation);

    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'BLOCKED_WITH_EXACT_ACTION',
      code: 'apply_failed',
      messagePl: 'PI nie mogło dokończyć przeliczenia. Wróć do receptury i spróbuj ponownie.',
      action: 'return_to_recipe',
    });
    await renderPanel();
    expect(document.body.textContent).toContain('PI nie mogło dokończyć przeliczenia.');
    expect(document.body.textContent).toContain('Wróć do receptury');
  });

  it('times out a never-settling ProductBehavior call and ignores its late response', async () => {
    vi.useFakeTimers();
    const generation = beginPiRecalculation();
    let resolveLate!: () => void;
    const late = new Promise<void>((resolve) => {
      resolveLate = resolve;
    });
    const pending = runPiRecalculationWithTerminal(() => late, generation, 1_000);

    await vi.advanceTimersByTimeAsync(1_000);
    await pending;
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'BLOCKED_WITH_EXACT_ACTION',
      code: 'apply_failed',
      messagePl:
        'Serwer nie odpowiedział w bezpiecznym czasie. Receptura nie została zmieniona. Wróć do receptury i spróbuj ponownie.',
      action: 'return_to_recipe',
    });

    const onClose = vi.fn();
    await renderPanel(onClose);
    expect(document.body.textContent).toContain('Serwer nie odpowiedział w bezpiecznym czasie.');
    const close = document.querySelector<HTMLButtonElement>('[data-testid="pro-recalc-close"]')!;
    expect(close.disabled).toBe(false);
    await act(async () => close.click());
    expect(onClose).toHaveBeenCalledOnce();

    const newerGeneration = beginPiRecalculation();
    resolveLate();
    await Promise.resolve();
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({ state: 'WORKING' });

    await runPiRecalculationWithTerminal(async () => {
      throw new Error('newer run failed');
    }, newerGeneration);
    expect(useConstraintStudioStore.getState().recalculationTerminal).toMatchObject({
      state: 'BLOCKED_WITH_EXACT_ACTION',
      code: 'apply_failed',
    });
  });

  it('never lets an older async run overwrite the newest visible WORKING state', async () => {
    const olderGeneration = beginPiRecalculation();
    const newerGeneration = beginPiRecalculation();

    await runPiRecalculationWithTerminal(async () => undefined, olderGeneration);
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({ state: 'WORKING' });

    await runPiRecalculationWithTerminal(async () => {
      throw new Error('newest run failed');
    }, newerGeneration);
    expect(useConstraintStudioStore.getState().recalculationTerminal).toMatchObject({
      state: 'BLOCKED_WITH_EXACT_ACTION',
      code: 'apply_failed',
    });
  });

  it('renders the exact settings-confirmation terminal and action', async () => {
    useConstraintStudioStore.setState({
      recalculationTerminal: { state: 'SETTINGS_CONFIRMATION_REQUIRED' },
    });
    await renderPanel();

    expect(document.body.textContent).toContain('Najpierw potwierdź ustawienia receptury.');
    expect(document.body.textContent).toContain('Przejdź do ustawień');
  });

  it('renders an impossible result with exact lock facts and both recovery actions', async () => {
    const line = useRecipeStore.getState().items[0]!;
    useConstraintStudioStore.setState({
      previewIssue: {
        ok: false,
        code: 'impossible_under_constraints',
        conflict: {
          lineId: line.id,
          ingredientName: line.ingredient.name,
          kind: 'locked',
          grams: 900,
        },
        hardViolatedMetrics: ['ice_fraction'],
        residualViolatedMetrics: ['ice_fraction'],
        capReached: false,
        nearestFeasibleGrams: 639,
        alternativeProductType: null,
        solverInvocations: 1,
        iteration: {} as never,
        templateId: 'test-template',
        templateStatus: 'approved',
      } as PreviewIssue,
      recalculationTerminal: {
        state: 'LOCK_CHANGE_REQUIRED',
        code: 'impossible_under_constraints',
      },
    });
    await renderPanel();

    expect(document.body.textContent).toContain(line.ingredient.name);
    expect(document.body.textContent).toContain('900 g');
    expect(document.body.textContent).toContain('639 g');
    expect(document.body.textContent).toContain('udział lodu');
    expect(document.body.textContent).toContain('Odblokuj i pokaż podgląd');
    expect(document.body.textContent).toContain('Wróć do receptury');
  });

  it('releases only the chosen quantity lock before rerunning PI', async () => {
    const line = useRecipeStore.getState().items[0]!;
    useConstraintStudioStore.getState().toggleLock(line.id);
    expect(useConstraintStudioStore.getState().constraints.byLineId[line.id]?.mode).toBe('locked');

    await unlockConstraintAndRecalculate(line.id, async () => {
      useConstraintStudioStore.setState({ recalculationTerminal: { state: 'NO_CHANGE_NEEDED' } });
    });

    expect(useConstraintStudioStore.getState().constraints.byLineId[line.id]).toBeUndefined();
    expect(
      useRecipeStore.getState().items.find((item) => item.id === line.id)?.grams_constraint,
    ).toBeUndefined();
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'NO_CHANGE_NEEDED',
    });
  });

  it('renders a return action for generic optimizer failures', async () => {
    useConstraintStudioStore.setState({
      previewIssue: {
        ok: false,
        code: 'no_proposal',
        solverInvocations: 1,
        reason: 'no_eligible_changes',
      } as PreviewIssue,
      recalculationTerminal: {
        state: 'BLOCKED_WITH_EXACT_ACTION',
        code: 'no_proposal',
      },
    });
    await renderPanel();

    expect(document.body.textContent).toContain('Wróć do receptury');
    expect(document.querySelector('[data-testid="pro-recalc-return-to-recipe"]')).not.toBeNull();
  });

  it('renders zero-gram Base feedback with the exact product and return action', async () => {
    const line = useRecipeStore.getState().items[0]!;
    const issue: PreviewIssue = {
      ok: false,
      code: 'missing_required_role',
      role: 'product_dose',
      lineIds: [line.id],
      messagePl: `Podaj gramaturę dla:\n${line.ingredient.name}.\n\nMinimalna ilość to 1 g.`,
    };
    useConstraintStudioStore.setState({
      previewIssue: issue,
      recalculationTerminal: {
        state: 'PRODUCT_GRAMS_REQUIRED',
        code: 'missing_required_role',
        lineIds: [line.id],
      },
    });
    await renderPanel();

    expect(document.body.textContent).toContain('Podaj gramaturę dla:');
    expect(document.body.textContent).toContain(line.ingredient.name);
    expect(document.body.textContent).toContain('Minimalna ilość to 1 g.');
    expect(document.body.textContent).toContain('Wróć do receptury');
  });

  it('requires an explicit removal action when no valid result preserves a positive Standard line', async () => {
    const line = useRecipeStore.getState().items[0]!;
    useConstraintStudioStore.setState({
      previewIssue: {
        ok: false,
        code: 'standard_presence_removal_required',
        lineId: line.id,
        productName: line.ingredient.name,
        currentGrams: 180,
        bestAttemptedNonZeroGrams: 1,
        limitingMetric: 'ice_fraction',
        acceptedMin: 45,
        acceptedMax: 58,
        messagePl:
          `Ten składnik trzeba usunąć albo zmienić. PINGÜINO nie znalazło ` +
          `poprawnej receptury z zachowaniem składnika ${line.ingredient.name} ` +
          'w ilości co najmniej 1 g.',
      },
      recalculationTerminal: {
        state: 'BLOCKED_WITH_EXACT_ACTION',
        code: 'standard_presence_removal_required',
      },
    });
    await renderPanel();

    expect(document.body.textContent).toContain('Ten składnik trzeba usunąć albo zmienić.');
    expect(document.body.textContent).toContain(line.ingredient.name);
    expect(document.body.textContent).toContain('180 g');
    expect(document.body.textContent).toContain('1 g');
    expect(document.body.textContent).toContain('45–58');
    expect(document.body.textContent).toContain('Usuń składnik i pokaż podgląd');
    expect(document.body.textContent).toContain('Wróć do receptury');
    expect(
      document.querySelector('[data-testid="pro-recalc-remove-standard-preview"]'),
    ).not.toBeNull();
  });

  it('names the missing technical layer and exposes all product recovery actions', async () => {
    const line = useRecipeStore.getState().items[0]!;
    const exactReasons = [
      'behavior_binding_missing:product-405:PI-ING-000405:version-405:OPTIMAL:refresh_product_data',
      'process_evidence_unknown:product-405:PI-ING-000405:version-405:OPTIMAL:add_process_evidence',
      'profile_not_approved:product-405:PI-ING-000405:version-405:OPTIMAL:change_profile_or_product',
    ];
    const issue = serverBehaviorPreviewIssue([
      {
        lineId: line.id,
        lineName: line.ingredient.name,
        reasons: exactReasons,
      },
    ]);
    useConstraintStudioStore.setState({
      previewIssue: issue,
      recalculationTerminal: productBehaviorTerminal([
        {
          lineId: line.id,
          lineName: line.ingredient.name,
          reasons: exactReasons,
        },
      ]),
    });
    await renderPanel();

    expect(document.body.textContent).toContain(
      'Produkt nie spełnia jeszcze bieżącej bramki technicznej:',
    );
    expect(document.body.textContent).toContain(line.ingredient.name);
    expect(document.body.textContent).toContain('ProductBehavior binding');
    expect(document.body.textContent).toContain('process');
    expect(document.body.textContent).toContain('profile eligibility');
    expect(document.body.textContent).toContain('product-405');
    expect(document.body.textContent).toContain('version-405');
    expect(document.body.textContent).toContain('PI-ING-000405');
    expect(document.body.textContent).toContain('OPTIMAL');
    for (const action of ['Wybierz inny produkt', 'Uzupełnij dane produktu', 'Wróć do receptury']) {
      expect(document.body.textContent).toContain(action);
    }
  });
});

describe('technical authority terminal classification', () => {
  it('separates Mapper binding from other product-data failures', () => {
    expect(
      productBehaviorTerminal([
        {
          lineId: 'watermelon',
          lineName: 'WATERMELON · Fresh Fruit',
          reasons: ['mapper_entity_identity_mismatch'],
        },
      ]),
    ).toEqual({
      state: 'MAPPER_BINDING_REQUIRED',
      code: 'product_behavior_invalid',
      lineIds: ['watermelon'],
    });
    expect(
      productBehaviorTerminal([
        {
          lineId: 'watermelon',
          lineName: 'WATERMELON · Fresh Fruit',
          reasons: ['base_technical_authority_missing'],
        },
      ]).state,
    ).toBe('PRODUCT_DATA_REQUIRED');
  });

  it('does not blame a product binding when only server validation is unavailable', () => {
    const authorityIssues = [
      {
        lineId: 'watermelon',
        lineName: 'WATERMELON · Fresh Fruit',
        reasons: ['behavior_server_validation_unavailable'],
      },
    ];
    const issue = serverBehaviorPreviewIssue(authorityIssues);
    expect(issue.messagePl).toContain('walidacja serwerowa');
    expect(issue.messagePl).not.toContain('Produkt nie ma jeszcze zweryfikowanego');
    expect(productBehaviorTerminal(authorityIssues)).toEqual({
      state: 'BLOCKED_WITH_EXACT_ACTION',
      code: 'product_behavior_invalid',
    });
  });

  it('offers a return action instead of product replacement during a server outage', async () => {
    const line = useRecipeStore.getState().items[0]!;
    const authorityIssues = [
      {
        lineId: line.id,
        lineName: line.ingredient.name,
        reasons: ['behavior_server_validation_unavailable'],
      },
    ];
    useConstraintStudioStore.setState({
      previewIssue: serverBehaviorPreviewIssue(authorityIssues),
      recalculationTerminal: productBehaviorTerminal(authorityIssues),
    });
    await renderPanel();

    expect(document.body.textContent).toContain('walidacja serwerowa');
    expect(document.body.textContent).toContain('Wróć do receptury');
    expect(document.body.textContent).not.toContain('Wybierz inny produkt');
    expect(document.body.textContent).not.toContain('Uzupełnij dane produktu');
  });
});
