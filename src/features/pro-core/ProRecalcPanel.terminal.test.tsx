/** @vitest-environment jsdom */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import {
  beginPiRecalculation,
  cancelPiRecalculation,
  productBehaviorTerminal,
  runPiRecalculationWithTerminal,
  serverBehaviorPreviewIssue,
  unlockConstraintAndRecalculate,
  useConstraintStudioStore,
  type PreviewIssue,
} from '@/features/constraint-studio/constraintStudioStore';
import {
  buildBatchRescalePreview,
  type ConstraintPreview,
} from '@/features/constraint-studio/applyPipeline';
import { useRecipeStore } from '@/stores/recipeStore';
import { ProRecalcPanel } from './ProRecalcPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const renderPanel = async (onClose = vi.fn(), retryRunner?: () => Promise<void>) => {
  await act(async () => {
    root.render(<ProRecalcPanel open onClose={onClose} retryRunner={retryRunner} />);
  });
};

const previewWithScore = (score: 8 | 9): ConstraintPreview => {
  const built = buildBatchRescalePreview(
    starterMilkBase(),
    { byLineId: {} },
    1_200,
    `preview-score-${score}`,
  );
  if (!built.ok) throw new Error(`preview score fixture failed: ${built.code}`);
  return {
    ...built.preview,
    directionAssessment: {
      active: true,
      reached: false,
      supportedAxisCount: 1,
      reachedAxisCount: 0,
      score,
      residuals: [],
      blockedAxes: [],
    },
  };
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
  it('renders a committed-but-incomplete Apply only as applied, never as not applied', async () => {
    const onClose = vi.fn();
    useConstraintStudioStore.setState({
      blocked: null,
      postApplyNotice: {
        state: 'APPLIED_WITH_INCOMPLETE_CONSUMERS',
        messagePl:
          'Receptura została zmieniona, ale koszt nie został w pełni odświeżony. Uruchom Przelicz ponownie.',
      },
    });

    await renderPanel(onClose);

    expect(document.body.textContent).toContain('Zmiany zastosowano');
    expect(document.body.textContent).toContain('Receptura została zmieniona');
    expect(document.body.textContent).not.toContain('Zmian nie zastosowano');
    expect(useConstraintStudioStore.getState().blocked).toBeNull();

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>(
          '[data-testid="pro-recalc-applied-with-incomplete-consumers-primary"]',
        )
        ?.click();
    });
    expect(useConstraintStudioStore.getState().postApplyNotice).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('returns an acknowledged incomplete-consumer Apply to Cofnij, not the header fallback', async () => {
    const headerFallback = document.createElement('button');
    headerFallback.dataset.testid = 'app-nav-trigger';
    headerFallback.textContent = 'Otwórz menu';
    const undo = document.createElement('button');
    undo.dataset.testid = 'workbench-undo';
    undo.textContent = 'Cofnij';
    document.body.insertBefore(headerFallback, host);
    document.body.insertBefore(undo, host);
    useConstraintStudioStore.setState({
      blocked: null,
      postApplyNotice: {
        state: 'APPLIED_WITH_INCOMPLETE_CONSUMERS',
        messagePl:
          'Receptura została zmieniona, ale koszt nie został w pełni odświeżony. Uruchom Przelicz ponownie.',
      },
    });

    function Harness() {
      const [open, setOpen] = useState(true);
      return open ? <ProRecalcPanel open onClose={() => setOpen(false)} /> : null;
    }

    try {
      await act(async () => root.render(<Harness />));
      await act(async () => {
        document
          .querySelector<HTMLButtonElement>(
            '[data-testid="pro-recalc-applied-with-incomplete-consumers-primary"]',
          )
          ?.click();
      });

      await vi.waitFor(() => expect(document.activeElement).toBe(undo));
      expect(document.activeElement).not.toBe(headerFallback);
      expect(document.activeElement).not.toBe(document.body);
    } finally {
      headerFallback.remove();
      undo.remove();
    }
  });

  it('clears a cancelled or failed Preview score and renders the next recalculation score', async () => {
    const onClose = vi.fn();
    useConstraintStudioStore.setState({
      preview: previewWithScore(8),
      recalculationTerminal: { state: 'PREVIEW_READY' },
    });
    await renderPanel(onClose);

    const visibleScore = () =>
      document.querySelector('[data-testid="preview-score"]')?.textContent?.replace(/\s+/g, '');
    const summaryText = () =>
      document.querySelector('[data-testid="preview-summary"]')?.textContent;

    expect(visibleScore()).toBe('8');
    expect(document.querySelector('[data-testid="preview-score"]')).toMatchObject({
      dataset: expect.objectContaining({ score: '8', scoreProgress: '0.80' }),
    });
    expect(summaryText()).toMatch(/\d+ zmian(?:a|y)?/);
    expect(
      document
        .querySelector('[data-testid="pro-recalc-preview-motion"]')
        ?.getAttribute('data-friendly-lab-timing'),
    ).toBe('persistent');

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="preview-cancel"]')!.click();
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(visibleScore()).toBeUndefined();

    await act(async () => {
      useConstraintStudioStore.setState({
        preview: previewWithScore(8),
        previewIssue: null,
        recalculationTerminal: { state: 'PREVIEW_READY' },
      });
    });
    expect(visibleScore()).toBe('8');

    const failedGeneration = beginPiRecalculation();
    await act(async () => {
      await runPiRecalculationWithTerminal(async () => {
        throw new Error('preview failed');
      }, failedGeneration);
    });
    expect(useConstraintStudioStore.getState().recalculationTerminal).toMatchObject({
      state: 'ERROR',
    });
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(visibleScore()).toBeUndefined();

    await act(async () => {
      useConstraintStudioStore.setState({
        preview: previewWithScore(9),
        previewIssue: null,
        recalculationTerminal: { state: 'PREVIEW_READY' },
      });
    });
    expect(visibleScore()).toBe('9');
    expect(document.querySelector('[data-testid="preview-score"]')).toMatchObject({
      dataset: expect.objectContaining({ score: '9', scoreProgress: '0.90' }),
    });
    expect(document.body.textContent).not.toContain('8 / 10');
    expect(summaryText()).toMatch(/\d+ zmian(?:a|y)?/);
  });

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
    expect(document.body.textContent).toContain('Liczymy balans receptury…');
    expect(
      document
        .querySelector('[data-testid="pro-recalc-working"]')
        ?.getAttribute('data-friendly-lab-timing'),
    ).toBe('progress');
    expect(
      document.querySelector<HTMLButtonElement>('[data-testid="pro-recalc-close"]')?.disabled,
    ).toBe(false);
    expect(document.querySelector('[data-testid="pro-recalc-close"]')?.textContent).toBe('Anuluj');

    await act(async () => {
      await runPiRecalculationWithTerminal(async () => undefined, generation);
    });
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'ERROR',
      messagePl: 'Przeliczenie zakończyło się bez wyniku. Wróć do receptury i spróbuj ponownie',
    });
    expect(document.body.textContent).toContain('Przeliczenie zakończyło się bez wyniku.');
    expect(document.body.textContent).not.toContain('Stara odmowa produktu.');
    expect(document.body.textContent).not.toContain('Wybierz produkt');
  });

  it('turns an unexpected rejected run into an exact visible terminal', async () => {
    const generation = beginPiRecalculation();
    await runPiRecalculationWithTerminal(async () => {
      throw new Error('network interrupted');
    }, generation);

    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'ERROR',
      messagePl: 'Nie udało się dokończyć przeliczenia. Wróć do receptury i spróbuj ponownie.',
    });
    await renderPanel();
    expect(document.body.textContent).toContain('Nie udało się dokończyć przeliczenia.');
    expect(document.body.textContent).toContain('Wróć do receptury');
  });

  it('times out a never-settling ProductBehavior call and ignores its late response', async () => {
    vi.useFakeTimers();
    const recipeBefore = structuredClone(useRecipeStore.getState().items);
    const generation = beginPiRecalculation();
    let resolveLate!: () => void;
    const late = new Promise<void>((resolve) => {
      resolveLate = resolve;
    });
    const pending = runPiRecalculationWithTerminal(() => late, generation, 1_000);

    await vi.advanceTimersByTimeAsync(1_000);
    await pending;
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'TIMEOUT',
      messagePl: 'Nie udało się zakończyć przeliczenia. Twoja receptura nie została zmieniona.',
    });
    expect(useRecipeStore.getState().items).toEqual(recipeBefore);

    const onClose = vi.fn();
    await renderPanel(onClose);
    expect(document.body.textContent).toContain('Nie udało się zakończyć przeliczenia.');
    expect(document.body.textContent).toContain('Twoja receptura nie została zmieniona.');
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
      state: 'ERROR',
    });
  });

  it('preserves the same truthful Multi-Main refusal on first run and retry when cleanup crosses the deadline', async () => {
    vi.useFakeTimers();
    const messagePl =
      'Nie można zachować proporcji grupy Głównej przy aktywnych blokadach gramowych.';
    const outcomes: unknown[] = [];

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const generation = beginPiRecalculation();
      const pending = runPiRecalculationWithTerminal(
        async () => {
          useConstraintStudioStore.setState({
            previewIssue: {
              ok: false,
              code: 'main_ratio_conflict',
              lineIds: ['main-a', 'main-b'],
              ingredientNames: ['Main A', 'Main B'],
              messagePl,
            },
            recalculationTerminal: {
              state: 'BLOCKED_WITH_EXACT_ACTION',
              code: 'main_ratio_conflict',
              messagePl,
              action: 'return_to_recipe',
            },
          });
          await new Promise<void>(() => undefined);
        },
        generation,
        1_000,
      );

      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1_000);
      await pending;
      const terminal = useConstraintStudioStore.getState().recalculationTerminal;
      outcomes.push(terminal);
      expect(terminal).toMatchObject({
        state: 'BLOCKED_WITH_EXACT_ACTION',
        code: 'main_ratio_conflict',
        messagePl,
      });
      expect(JSON.stringify(terminal)).not.toContain('Nie udało się zakończyć przeliczenia');
    }

    expect(outcomes[1]).toEqual(outcomes[0]);
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
      state: 'ERROR',
    });
  });

  it('cancels safely, preserves newer edits, and isolates the late response', async () => {
    const originalLine = useRecipeStore.getState().items[0]!;
    const generation = beginPiRecalculation();
    let resolveLate!: () => void;
    const late = new Promise<void>((resolve) => {
      resolveLate = resolve;
    });
    const pending = runPiRecalculationWithTerminal(() => late, generation, 30_000);
    const onClose = vi.fn();
    await renderPanel(onClose);

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="pro-recalc-close"]')!.click();
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'CANCELLED',
    });

    useRecipeStore.getState().setPlannedGrams(originalLine.id, originalLine.planned_grams + 7);
    const editedGrams = useRecipeStore.getState().items[0]!.planned_grams;
    const newerGeneration = beginPiRecalculation();
    resolveLate();
    await pending;

    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({ state: 'WORKING' });
    expect(useRecipeStore.getState().items[0]!.planned_grams).toBe(editedGrams);
    await runPiRecalculationWithTerminal(async () => {
      throw new Error('new request failed independently');
    }, newerGeneration);
    expect(useConstraintStudioStore.getState().recalculationTerminal).toMatchObject({
      state: 'ERROR',
    });
  });

  it('wires the recovery action to a fresh retry runner', async () => {
    useConstraintStudioStore.setState({
      recalculationTerminal: {
        state: 'ERROR',
        messagePl: 'PI nie mogło dokończyć przeliczenia.',
      },
    });
    const retryRunner = vi.fn(async () => {
      cancelPiRecalculation();
      useConstraintStudioStore.setState({ recalculationTerminal: { state: 'NO_CHANGE_NEEDED' } });
    });
    await renderPanel(vi.fn(), retryRunner);

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="pro-recalc-retry"]')!.click();
      await Promise.resolve();
    });
    expect(retryRunner).toHaveBeenCalledOnce();
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'NO_CHANGE_NEEDED',
    });
  });

  it('renders the exact settings-confirmation terminal and action', async () => {
    useConstraintStudioStore.setState({
      recalculationTerminal: { state: 'SETTINGS_CONFIRMATION_REQUIRED' },
    });
    await renderPanel();

    expect(document.body.textContent).toContain(
      'Jeszcze jeden krok. Potwierdź ustawienia, a potem przeliczymy recepturę.',
    );
    expect(document.body.textContent).toContain('Otwórz ustawienia');
    expect(
      document
        .querySelector('[data-testid="pro-recalc-settings-required"]')
        ?.closest('[data-friendly-lab-message="true"]'),
    ).toBeNull();
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
    expect(document.body.textContent).toContain('Udział lodu');
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

  it('renders a simulation-proven Rescue action for an unsafe proposal', async () => {
    useConstraintStudioStore.setState({
      previewIssue: {
        ok: false,
        code: 'unsafe_proposal',
        violatedMetrics: ['npac', 'pod'],
        solverInvocations: 1,
      },
      rescueAdvice: {
        trigger: 'operational',
        candidate: {
          canonicalIngredientId: 'PI-ING-000494',
          namePl: 'Dekstroza',
          ingredient: starterMilkBase().items[0]!.ingredient,
          source: 'formulation_toolbox',
        },
        current: {
          score: null,
          reachedAxisCount: 0,
          supportedAxisCount: 0,
          severityPoints: 0,
          hardMetricCount: 4,
          engineSeverityPoints: 8,
        },
        rescue: {
          score: 9,
          reachedAxisCount: 1,
          supportedAxisCount: 1,
          severityPoints: 1,
          hardMetricCount: 0,
          engineSeverityPoints: 1,
        },
        simulatedGrams: 95,
        reasonPl: 'Symulacja wykazała poprawę po dodaniu Dekstrozy.',
        simulatedCandidateIds: ['PI-ING-000494'],
      },
      recalculationTerminal: {
        state: 'BLOCKED_WITH_EXACT_ACTION',
        code: 'unsafe_proposal',
      },
    });
    await renderPanel();

    expect(document.body.textContent).toContain('Możliwy kolejny krok: Dekstroza');
    expect(document.body.textContent).toContain('Gellatti nie doda tego składnika automatycznie');
    expect(
      document.querySelector('[data-testid="direction-rescue-add-ingredient"]'),
    ).not.toBeNull();
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

  it('offers an immutable-version refresh for stale ProductBehavior facts', async () => {
    const lines = useRecipeStore.getState().items.slice(0, 2);
    const authorityIssues = lines.map((line) => ({
      lineId: line.id,
      lineName: line.ingredient.name,
      reasons: ['facts_fingerprint_stale'],
    }));
    useConstraintStudioStore.setState({
      previewIssue: serverBehaviorPreviewIssue(authorityIssues),
      recalculationTerminal: productBehaviorTerminal(authorityIssues),
    });
    await renderPanel();

    expect(document.body.textContent).toContain('Dane produktów w tej wersji są nieaktualne');
    expect(document.body.textContent).toContain('Historyczna wersja pozostanie bez zmian.');
    expect(document.body.textContent).toContain(lines[0]!.ingredient.name);
    expect(document.body.textContent).toContain(lines[1]!.ingredient.name);
    expect(document.body.textContent).toContain('Utwórz nową wersję z aktualnymi danymi produktów');
    expect(document.body.textContent).not.toContain('Wybierz inny produkt');
    expect(document.body.textContent).not.toContain('Uzupełnij dane produktu');
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
