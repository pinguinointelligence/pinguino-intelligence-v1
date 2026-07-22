/**
 * Constraint Studio UI — static-markup honesty checks (node environment,
 * renderToStaticMarkup — the machine-onboarding test pattern).
 *
 * Pins: Polish copy on every user-visible string; the §19.1 diff card
 * (old→new, „bez zmian · zablokowane”, explicit Apply/Anuluj); the blocked
 * notice; the §18.2 bound message with the VERIFIED number; the §18.5
 * fallback VERBATIM with no invented numbers; §20 history with U+2212
 * temperatures; the row padlock a11y; and the range UI feature flag
 * (default OFF, ANALIZA-framed when on).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EffectiveRecipeItem, RecipeInput } from '@/engine';
import {
  overSweetStarter,
  starterLine,
  starterMilkBase,
  withGrams,
} from '@/features/recipe-constraints/constraintFixtures';
import type { ConstraintFeasibilityAnalysis } from '@/features/recipe-constraints';
import { IngredientRow } from '@/features/ingredient-builder/IngredientRow';
import { useRecipeStore } from '@/stores/recipeStore';
import type { AppliedChangeRecord, ConstraintPreview } from './applyPipeline';
import { workingStateFingerprint } from './applyPipeline';
import {
  constraintStudioCopy as copy,
  formatGramsDeltaPl,
  formatGramsPl,
  formatTemperaturePl,
} from './constraintStudioCopy';
import { setRangeConstraintUiFlag } from './constraintStudioFlags';
import { useConstraintStudioStore } from './constraintStudioStore';
import { renderConstraintExplanationPl } from './explainPl';
import { BlockedApplyNotice } from './ui/BlockedApplyNotice';
import { ConstraintHistoryPanel } from './ui/ConstraintHistoryPanel';
import { ConstraintPreviewCard } from './ui/ConstraintPreviewCard';
import { ConstraintStudioSection, LockedSumConflictBanner } from './ui/ConstraintStudioSection';
import { FeasibilityNotice } from './ui/FeasibilityNotice';

const render = (element: ReactElement) => renderToStaticMarkup(element);
const noop = () => undefined;

const SUCROSE = starterLine('sucrose');

/* ── formatters ──────────────────────────────────────────────────────────── */

describe('Polish formatters', () => {
  it('temperature uses U+2212, never the ASCII hyphen', () => {
    expect(formatTemperaturePl(-12)).toBe('−12°C');
    expect(formatTemperaturePl(4)).toBe('4°C');
    expect(formatTemperaturePl(-12)).not.toContain('-');
  });

  it('grams use a comma decimal and ≤0.1 g precision', () => {
    expect(formatGramsPl(137.25)).toBe('137,3 g');
    expect(formatGramsPl(600)).toBe('600 g');
    expect(formatGramsDeltaPl(-8)).toBe('−8 g');
    expect(formatGramsDeltaPl(18)).toBe('+18 g');
  });
});

/* ── explain (§20.4, no band internals) ──────────────────────────────────── */

describe('renderConstraintExplanationPl', () => {
  it('renders the spec-shaped action sentence with the engine-emitted reason', () => {
    expect(
      renderConstraintExplanationPl({
        kind: 'action',
        verb: 'reduce',
        ingredientName: 'Sacharoza',
        grams: 8,
        reasonMetric: 'pod',
        reasonDirection: 'high',
      }),
    ).toBe('Zmniejszono Sacharoza o 8 g, ponieważ receptura była zbyt słodka.');
    expect(
      renderConstraintExplanationPl({
        kind: 'action',
        verb: 'add',
        ingredientName: 'Dekstroza',
        grams: 10,
        reasonMetric: 'npac',
        reasonDirection: 'high',
      }),
    ).toBe('Dodano Dekstroza: 10 g, ponieważ receptura pozostałaby zbyt miękka po zamrożeniu.');
  });

  it('renders the locked-unchanged truth (singular and plural)', () => {
    expect(
      renderConstraintExplanationPl({ kind: 'locked_unchanged', ingredientNames: ['Mleko'] }),
    ).toBe('Nie zmieniono składnika Mleko, ponieważ jego gramatura jest zablokowana.');
    expect(
      renderConstraintExplanationPl({
        kind: 'locked_unchanged',
        ingredientNames: ['Mleko', 'Truskawki'],
      }),
    ).toBe('Nie zmieniono składników Mleko i Truskawki, ponieważ ich gramatury są zablokowane.');
  });

  it('renders the §18.5 fallback verbatim, with no numbers', () => {
    const sentence = renderConstraintExplanationPl({ kind: 'no_reliable_bound' });
    expect(sentence).toBe(
      'Przy obecnych blokadach nie znaleziono rozwiązania w optymalnym zakresie. ' +
        'Odblokuj jeden z zaznaczonych składników lub zmień batch.',
    );
    expect(/\d/.test(sentence)).toBe(false);
  });
});

/* ── §12.3 row padlock ───────────────────────────────────────────────────── */

describe('IngredientRow padlock', () => {
  const item = ((): EffectiveRecipeItem => {
    const line = starterMilkBase().items.find((candidate) => candidate.id === SUCROSE);
    if (!line) throw new Error('sucrose line missing');
    return { ...line, effective_grams: line.planned_grams, difference: 0, is_actual: false };
  })();
  const actions = {
    setPlannedGrams: noop,
    setActualGrams: noop,
    setLockType: noop,
    setMainIngredient: noop,
    removeItem: noop,
  };

  it('locked state: Polish aria, badge with the protected grams, disabled input', () => {
    const html = render(
      <IngredientRow
        item={item}
        totalBatchG={1000}
        actions={actions}
        lock={{
          state: 'locked',
          lockedGramsLabel: '130 g',
          ariaLabel: copy.lock.unlockAria('Sucrose'),
          title: copy.lock.lockedTitle('130 g'),
          badge: copy.lock.lockedBadge,
          plannedDisabled: true,
          toggleDisabled: false,
          onToggle: noop,
        }}
      />,
    );
    expect(html).toContain('Odblokuj gramaturę: Sucrose');
    expect(html).toContain('Zablokowana');
    expect(html).toContain('disabled');
    expect(html).toContain('aria-pressed="true"');
  });

  it('ai state: open padlock with the lock aria label, editable grams', () => {
    const html = render(
      <IngredientRow
        item={item}
        totalBatchG={1000}
        actions={actions}
        lock={{
          state: 'ai',
          lockedGramsLabel: null,
          ariaLabel: copy.lock.lockAria('Sucrose'),
          title: copy.lock.aiTitle,
          badge: null,
          plannedDisabled: false,
          toggleDisabled: false,
          onToggle: noop,
        }}
      />,
    );
    expect(html).toContain('Zablokuj gramaturę: Sucrose');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('Zablokowana');
  });
});

/* ── §19.1 preview card ──────────────────────────────────────────────────── */

const syntheticPreview = (): ConstraintPreview => {
  const base = starterMilkBase();
  return {
    kind: 'optimize',
    titlePl: copy.preview.kindLabels.optimize,
    baseFingerprint: 'fp',
    proposedInput: base,
    nextConstraints: { byLineId: {} },
    lines: [
      {
        lineId: 'l-milk',
        name: 'Mleko 3,5%',
        beforeGrams: 600,
        afterGrams: 600,
        kind: 'unchanged',
        locked: true,
      },
      {
        lineId: 'l-sucrose',
        name: 'Sacharoza',
        beforeGrams: 82,
        afterGrams: 74,
        kind: 'changed',
        locked: false,
      },
      {
        lineId: 'l-dextrose',
        name: 'Dekstroza',
        beforeGrams: null,
        afterGrams: 10,
        kind: 'added',
        locked: false,
      },
    ],
    violationsBefore: 2,
    violationsAfter: 0,
    explanation: [],
    engineVersion: 'e',
    configVersion: 'c',
    createdAt: '2026-07-17T12:00:00.000Z',
  };
};

describe('ConstraintPreviewCard (§19.1)', () => {
  const html = render(
    <ConstraintPreviewCard preview={syntheticPreview()} onApply={noop} onCancel={noop} />,
  );

  it('renders the proposal header and the explicit Apply/Cancel pair', () => {
    expect(html).toContain('PINGÜINO proponuje:');
    expect(html).toContain('Zastosuj zmiany');
    expect(html).toContain('Anuluj');
    expect(html).toContain(copy.preview.applyNote);
  });

  it('shows old→new with the locked-unchanged note and the U+2212 delta', () => {
    expect(html).toContain('bez zmian · zablokowane');
    expect(html).toContain('82 g');
    expect(html).toContain('74 g');
    expect(html).toContain('−8 g');
    expect(html).toContain('nowy składnik');
  });

  it('reports the honest out-of-band delta without band values', () => {
    expect(html).toContain('Parametry poza optymalnym zakresem: 2 → 0');
  });
});

/* ── blocked notice (the owner-mandated block) ───────────────────────────── */

describe('BlockedApplyNotice', () => {
  it('renders the Polish block message as an alert', () => {
    const html = render(
      <BlockedApplyNotice
        blocked={{
          code: 'constraints_violated',
          messagePl: copy.blocked.constraintsViolated(['Mleko']),
          violations: [{ lineId: 'l', code: 'locked_grams_changed' }],
        }}
        onDismiss={noop}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Zmian nie zastosowano');
    expect(html).toContain('Kontrola blokad zatrzymała tę operację');
    expect(html).toContain('Mleko');
    expect(html).toContain('Receptura nie została zmieniona');
    expect(html).toContain('Rozumiem');
  });
});

/* ── §18 feasibility rendering ───────────────────────────────────────────── */

describe('FeasibilityNotice (§18)', () => {
  const handlers = {
    onSuggestedFix: noop,
    onUnlock: noop,
    onChangeBatch: noop,
    onKeepAsIs: noop,
  };

  it('renders the §18.2 bound with the verified number and the action row', () => {
    const input: RecipeInput = withGrams(overSweetStarter(700), SUCROSE, 700);
    const analysis: ConstraintFeasibilityAnalysis = {
      status: 'infeasible_with_bound',
      bound: {
        lineId: SUCROSE,
        ingredientId: 'sucrose',
        ingredientName: 'Sucrose',
        boundType: 'max',
        grams: 612.4,
        displayGrams: 612,
        displayGramsVerified: true,
        verifiedCleanAtGrams: 612.4,
        verifiedViolatingAtGrams: 612.8,
      },
      conflict: {
        lineIds: [SUCROSE],
        reasonCode: 'single_lock_boundary',
        suggestedActions: [
          { type: 'set_max', lineId: SUCROSE, grams: 612 },
          { type: 'unlock', lineId: SUCROSE },
        ],
      },
      violationsBefore: [{ metric: 'pod', direction: 'high' }],
      evaluationsUsed: 12,
    };
    const html = render(<FeasibilityNotice input={input} analysis={analysis} handlers={handlers} />);
    expect(html).toContain('Nie można osiągnąć optymalnego balansu przy obecnych blokadach.');
    expect(html).toContain('Sucrose — zablokowane na 700 g.');
    expect(html).toContain('Aby wejść w optymalny zakres, ustaw maksymalnie 612 g.');
    expect(html).toContain('Ustaw 612 g i przelicz');
    expect(html).toContain('Odblokuj Sucrose');
    expect(html).toContain('Pozostaw bez zmian');
    expect(html).toContain('ANALIZA');
  });

  it('renders the §18.5 fallback VERBATIM with the marked lines and NO computed suggestion', () => {
    const input = starterMilkBase();
    const analysis: ConstraintFeasibilityAnalysis = {
      status: 'no_reliable_bound',
      reasonCode: 'not_solvable_by_constraint_changes',
      lineIds: [SUCROSE],
      violationsBefore: [{ metric: 'alcohol', direction: 'high' }],
      evaluationsUsed: 20,
    };
    const html = render(<FeasibilityNotice input={input} analysis={analysis} handlers={handlers} />);
    expect(html).toContain(
      'Przy obecnych blokadach nie znaleziono rozwiązania w optymalnym zakresie. ' +
        'Odblokuj jeden z zaznaczonych składników lub zmień batch.',
    );
    expect(html).toContain('Zaznaczone składniki: Sucrose.');
    expect(html).not.toContain('i przelicz'); // no fabricated „ustaw X g”
  });

  it('renders the §18.4 group with every member and the spec path list', () => {
    const input = starterMilkBase();
    const dextrose = starterLine('dextrose');
    const analysis: ConstraintFeasibilityAnalysis = {
      status: 'conflict_group',
      conflict: {
        lineIds: [SUCROSE, dextrose],
        reasonCode: 'locks_jointly_block',
        suggestedActions: [
          { type: 'unlock', lineId: SUCROSE },
          { type: 'unlock', lineId: dextrose },
          {
            type: 'multiple_changes',
            changes: [{ type: 'reduce', ingredientName: 'Sucrose', grams: 42.5 }],
          },
        ],
      },
      violationsBefore: [{ metric: 'pod', direction: 'high' }],
      evaluationsUsed: 20,
    };
    const html = render(<FeasibilityNotice input={input} analysis={analysis} handlers={handlers} />);
    expect(html).toContain('wspólnie uniemożliwiają osiągnięcie optymalnego zakresu');
    expect(html).toContain('Sucrose i Dextrose');
    expect(html).toContain('odblokuj jeden z nich, zmień zakres, zwiększ batch');
    expect(html).toContain('zmniejsz Sucrose o 42,5 g');
  });
});

/* ── §20 history ─────────────────────────────────────────────────────────── */

describe('ConstraintHistoryPanel (§20)', () => {
  const record: AppliedChangeRecord = {
    id: 'apply-1',
    at: '2026-07-17T12:34:00.000Z',
    kind: 'optimize',
    titlePl: copy.preview.kindLabels.optimize,
    mode: 'classic',
    temperatureC: -11,
    engineVersion: 'e',
    configVersion: 'c',
    before: { input: starterMilkBase(), constraints: { byLineId: {} } },
    after: { input: starterMilkBase(), constraints: { byLineId: {} } },
    lines: [],
    explanation: [{ kind: 'locked_unchanged', ingredientNames: ['Mleko'] }],
    violationsBefore: 2,
    violationsAfter: 0,
  };

  it('renders the entry with a U+2212 temperature, Undo and Explain', () => {
    const html = render(
      <ConstraintHistoryPanel history={[record]} undoAvailable={true} onUndo={noop} />,
    );
    expect(html).toContain('Historia zmian');
    expect(html).toContain('Temperatura serwowania: −11°C');
    expect(html).toContain('Cofnij ostatnią zmianę');
    expect(html).toContain('Dlaczego?');
    expect(html).toContain('Parametry poza optymalnym zakresem: 2 → 0');
  });

  it('disables Undo with the honest title when the state moved on', () => {
    const html = render(
      <ConstraintHistoryPanel history={[record]} undoAvailable={false} onUndo={noop} />,
    );
    expect(html).toContain('disabled');
    expect(html).toContain(copy.history.undoUnavailable);
  });

  it('renders the empty state in Polish', () => {
    const html = render(<ConstraintHistoryPanel history={[]} undoAvailable={false} onUndo={noop} />);
    expect(html).toContain('Brak zastosowanych zmian w tej sesji.');
  });
});

/* ── section + the range feature flag ────────────────────────────────────── */

describe('ConstraintStudioSection (flag default OFF)', () => {
  beforeEach(() => {
    useRecipeStore.getState().resetToDemo();
    useConstraintStudioStore.getState().resetForTests();
  });
  afterEach(() => setRangeConstraintUiFlag(false));

  it('renders the Polish surface: SECONDARY tools (batch rescale, feasibility) — NO primary optimize trigger, NO range inputs', () => {
    const html = render(<ConstraintStudioSection />);
    // Owner P0: the primary „Dopasuj recepturę"/„Przelicz z PI" trigger lives ONLY in the top
    // workbar now — this lower section must NOT start a competing recalculation.
    expect(html).not.toContain('Dopasuj recepturę');
    expect(html).toContain('Przeskaluj partię');
    expect(html).toContain(copy.actions.rescaleHint);
    expect(html).toContain('Sprawdź wykonalność blokad');
    expect(html).toContain('Historia zmian');
    // range UI is launch-gated OFF
    expect(html).not.toContain(copy.range.title);
  });

  it('with the flag ON the range editor appears, framed as ANALIZA', () => {
    setRangeConstraintUiFlag(true);
    const html = render(<ConstraintStudioSection />);
    expect(html).toContain(copy.range.title);
    expect(html).toContain(copy.range.note);
    expect(html).toContain('ANALIZA');
  });

  it('shows the live §17.4 locked-sum conflict with the computed minimum (pure banner)', () => {
    const html = render(
      <LockedSumConflictBanner
        lockedMinimumGrams={1200}
        targetBatchGrams={1000}
        onSetBatchToMinimum={noop}
      />,
    );
    expect(html).toContain('Konflikt blokad');
    expect(html).toContain('Zablokowane składniki (1200 g) przekraczają partię (1000 g).');
    expect(html).toContain('Minimalna partia dla obecnych blokad: 1200 g');
    expect(html).toContain('Ustaw partię 1200 g');
  });
});

/* ── fingerprint sanity for the UI wiring ────────────────────────────────── */

describe('undo availability wiring', () => {
  it('the section computes availability from the same fingerprint as the pipeline', () => {
    const input = starterMilkBase();
    expect(workingStateFingerprint(input, { byLineId: {} })).toBe(
      workingStateFingerprint(starterMilkBase(), { byLineId: {} }),
    );
  });
});
