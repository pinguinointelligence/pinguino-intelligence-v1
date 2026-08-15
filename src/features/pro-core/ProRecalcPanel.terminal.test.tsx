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
  useConstraintStudioStore,
  type PreviewIssue,
} from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { ProRecalcPanel } from './ProRecalcPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

const renderPanel = async () => {
  await act(async () => {
    root.render(<ProRecalcPanel open onClose={vi.fn()} />);
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
    expect(document.querySelector<HTMLButtonElement>('[data-testid="pro-recalc-close"]')?.disabled).toBe(true);

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

  it('renders an impossible result as a lock-change terminal with a recovery action', async () => {
    useConstraintStudioStore.setState({
      previewIssue: {
        ok: false,
        code: 'impossible_under_constraints',
        conflict: null,
        hardViolatedMetrics: [],
        residualViolatedMetrics: [],
        capReached: false,
        nearestFeasibleGrams: null,
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

    expect(document.body.textContent).toContain('Przy obecnych ograniczeniach');
    expect(document.body.textContent).toContain('Wróć do blokad receptury');
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

  it('names the missing technical layer and exposes all product recovery actions', async () => {
    const line = useRecipeStore.getState().items[0]!;
    const issue = serverBehaviorPreviewIssue([{
      lineId: line.id,
      lineName: line.ingredient.name,
      reasons: ['behavior_binding_missing', 'process_evidence_missing', 'profile_not_approved'],
    }]);
    useConstraintStudioStore.setState({
      previewIssue: issue,
      recalculationTerminal: productBehaviorTerminal([{
        lineId: line.id,
        lineName: line.ingredient.name,
        reasons: ['behavior_binding_missing', 'process_evidence_missing', 'profile_not_approved'],
      }]),
    });
    await renderPanel();

    expect(document.body.textContent).toContain(
      'Produkt nie ma jeszcze zweryfikowanego powiązania technicznego:',
    );
    expect(document.body.textContent).toContain(line.ingredient.name);
    expect(document.body.textContent).toContain('ProductBehavior binding');
    expect(document.body.textContent).toContain('process');
    expect(document.body.textContent).toContain('profile eligibility');
    for (const action of ['Wybierz inny produkt', 'Uzupełnij dane produktu', 'Wróć do receptury']) {
      expect(document.body.textContent).toContain(action);
    }
  });
});

describe('technical authority terminal classification', () => {
  it('separates Mapper binding from other product-data failures', () => {
    expect(productBehaviorTerminal([{
      lineId: 'watermelon',
      lineName: 'WATERMELON · Fresh Fruit',
      reasons: ['mapper_entity_identity_mismatch'],
    }])).toEqual({
      state: 'MAPPER_BINDING_REQUIRED',
      code: 'product_behavior_invalid',
      lineIds: ['watermelon'],
    });
    expect(productBehaviorTerminal([{
      lineId: 'watermelon',
      lineName: 'WATERMELON · Fresh Fruit',
      reasons: ['base_technical_authority_missing'],
    }]).state).toBe('PRODUCT_DATA_REQUIRED');
  });

  it('does not blame a product binding when only server validation is unavailable', () => {
    const authorityIssues = [{
      lineId: 'watermelon',
      lineName: 'WATERMELON · Fresh Fruit',
      reasons: ['behavior_server_validation_unavailable'],
    }];
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
    const authorityIssues = [{
      lineId: line.id,
      lineName: line.ingredient.name,
      reasons: ['behavior_server_validation_unavailable'],
    }];
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
