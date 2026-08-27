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

  it('locked state: Polish aria, integrated lock segment and disabled input', () => {
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
    expect(html).toContain('Sucrose — Gramatura zablokowana. Odblokuj');
    expect(html).toContain('Gramatura zablokowana: 130 g');
    expect(html).toContain('data-control-locked="true"');
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
    expect(html).toContain('Sucrose — Zablokuj gramy');
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
    // Owner addendum item 4: hand-forged fixtures declare the outcome
    // classification explicitly (the real builders compute it).
    outcomeClassification: {
      outcome: 'no_verified_change',
      batchReconciled: false,
      compositionUnchanged: false,
      engineImproved: false,
      beforeGrams: 1000,
      afterGrams: 1000,
      targetBatchGrams: 1000,
      violationsBefore: 0,
      violationsAfter: 0,
    },
    baseFingerprint: 'fp',
    // The payload itself misses the target; the card must never infer
    // applicability from the display diff alone.
    proposedInput: {
      ...base,
      items: base.items.map((item, index) => ({
        ...item,
        planned_grams: index === 0 ? 684 : 0,
      })),
    },
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
  const customerHtml = render(
    <ConstraintPreviewCard preview={syntheticPreview()} onApply={noop} onCancel={noop} />,
  );
  const adminHtml = render(
    <ConstraintPreviewCard
      preview={syntheticPreview()}
      onApply={noop}
      onCancel={noop}
      showTechnicalDetails
    />,
  );

  it('renders the compact customer header and disables Apply when the proposal misses its batch target', () => {
    expect(customerHtml).toContain('Gotowe. Sprawdź proponowaną korektę');
    expect(customerHtml).toContain('data-testid="preview-summary"');
    expect(customerHtml).toContain('data-testid="preview-apply-disabled"');
    expect(customerHtml).toContain(copy.preview.applyDisabledDiagnostic);
    expect(customerHtml).toContain('Wróć');
    expect(customerHtml).not.toContain('Suma przed:');
    expect(customerHtml).not.toContain('Parametry poza optymalnym zakresem');
  });

  it.each([10, 9, 8] as const)(
    'restores the dynamic %i/10 Preview score in the historical summary slot',
    (score) => {
      const preview = syntheticPreview();
      preview.directionAssessment = {
        active: true,
        reached: score === 10,
        supportedAxisCount: 1,
        reachedAxisCount: score === 10 ? 1 : 0,
        score,
        residuals: [],
        blockedAxes: [],
      };

      const rendered = render(
        <ConstraintPreviewCard preview={preview} onApply={noop} onCancel={noop} />,
      );

      expect(rendered).toContain('data-testid="preview-score"');
      expect(rendered).toMatch(new RegExp(`${score}(?:<!-- -->)? / 10`));
      expect(rendered).toContain('min-w-16');
      expect(rendered).not.toContain('data-score-progress');
      expect(rendered).toContain('2 zmiany');
    },
  );

  it('shows changed old→new grams by default and keeps unchanged rows behind the toggle', () => {
    expect(customerHtml).toContain('82 g');
    expect(customerHtml).toContain('74 g');
    expect(customerHtml).toContain('−8 g');
    expect(customerHtml).toContain('nowy składnik');
    expect(customerHtml).toContain('Pokaż bez zmian');
    expect(customerHtml).not.toContain('bez zmian · zablokowane');
    expect(customerHtml).not.toContain('Mleko');
    expect(customerHtml).toContain('data-testid="preview-from-grams"');
    expect(customerHtml).not.toContain('line-through');
  });

  it('keeps the honest out-of-band delta in the admin-only technical accordion', () => {
    expect(adminHtml).toContain('data-testid="preview-technical-details"');
    expect(adminHtml).toContain('Szczegóły techniczne');
    expect(adminHtml).toContain('Parametry poza optymalnym zakresem: 2 → 0');
    expect(customerHtml).not.toContain('data-testid="preview-technical-details"');
  });

  it('names a verified identity swap and the selected human direction without exposing bands', () => {
    const preview = syntheticPreview();
    preview.substitution = {
      lineId: 'l-milk',
      fromCanonicalId: 'milk-original',
      toCanonicalId: 'milk-substitute',
      fromName: 'Mleko A',
      toName: 'Mleko B',
      changesMainIdentity: false,
      candidateFingerprint: 'candidate-fingerprint',
      mapperRowFingerprint: 'mapper-row-fingerprint',
      allergensFingerprint: '',
      veganEligibility: 'VEGAN_UNKNOWN',
    };
    preview.proposedInput = {
      ...preview.proposedInput,
      goals: {
        ...preview.proposedInput.goals,
        direction_targets_active: true,
        direction_targets: { sweetness: -1, softness: 1, creaminess: 0, flavor: 0 },
      },
    };
    const directedHtml = render(
      <ConstraintPreviewCard
        preview={preview}
        onApply={noop}
        onCancel={noop}
        showTechnicalDetails
      />,
    );

    expect(directedHtml).toContain('data-testid="preview-substitution"');
    expect(directedHtml).toContain('Mleko A');
    expect(directedHtml).toContain('Mleko B');
    expect(directedHtml).toContain('data-testid="preview-direction-reason"');
    expect(directedHtml).toContain('mniej słodkie');
    expect(directedHtml).toContain('twardsze');
    expect(directedHtml).not.toContain('targetBand');
  });

  it('discloses a stabilizer-system lock transition and says Apply is required', () => {
    const preview = syntheticPreview();
    preview.safetyLockConflict = {
      lineId: 'tara',
      ingredientName: 'Tara Gum',
      beforeGrams: 55,
      requiredGrams: 10,
      boundary: 'maximum',
      reason: 'product_dosage',
    };
    const rendered = render(
      <ConstraintPreviewCard
        preview={preview}
        onApply={noop}
        onCancel={noop}
        showTechnicalDetails
      />,
    );
    expect(rendered).toContain('data-testid="preview-safety-lock-conflict"');
    expect(rendered).toContain('Blokada przekracza zatwierdzony zakres systemu stabilizatora');
    expect(rendered).toContain('55 g');
    expect(rendered).toContain('10 g');
    expect(rendered).toContain('Nic nie zmieni się bez użycia „Zastosuj zmiany”');
  });

  it('discloses an Engine-verified hard-constraint lock transition without calling it dosage', () => {
    const preview = syntheticPreview();
    preview.safetyLockConflict = {
      lineId: 'watermelon',
      ingredientName: 'Watermelon',
      beforeGrams: 600,
      requiredGrams: 368,
      boundary: 'maximum',
      reason: 'constraint_feasibility',
    };
    const rendered = render(
      <ConstraintPreviewCard
        preview={preview}
        onApply={noop}
        onCancel={noop}
        showTechnicalDetails
      />,
    );
    expect(rendered).toContain('data-testid="preview-safety-lock-conflict"');
    expect(rendered).toContain('Blokada wymusza twardo nieprawidłową recepturę');
    expect(rendered).toContain('zatwierdzone reguły obliczeń');
    expect(rendered).not.toContain('zakres systemu stabilizatora');
    expect(rendered).toContain('Nic nie zmieni się bez użycia „Zastosuj zmiany”');
  });

  it.each([
    [2, 0, 2],
    [2, 1, 2],
    [2, 2, 2],
    [3, 1, 3],
  ])(
    'counts every Main row independently from locks (%i Main / %i locked)',
    (mainRows, lockedRows, expected) => {
      const preview = syntheticPreview();
      const template = preview.proposedInput.items[0]!;
      preview.proposedInput = {
        ...preview.proposedInput,
        items: Array.from({ length: mainRows }, (_, index) => ({
          ...template,
          id: `main-${index}`,
          lock_type: 'main' as const,
          planned_grams: 100,
          ...(index < lockedRows ? { grams_constraint: { grams: 100 } } : {}),
        })),
      };
      const rendered = render(
        <ConstraintPreviewCard
          preview={preview}
          onApply={noop}
          onCancel={noop}
          showTechnicalDetails
        />,
      );
      expect(rendered).toContain(
        `Główne: <strong class="font-mono tabular-nums text-ivory">${expected}</strong>`,
      );
      expect(rendered).toContain(
        `Blokady: <strong class="font-mono tabular-nums text-ivory">${lockedRows}</strong>`,
      );
    },
  );

  it('renders exact residual values, range, distance movement and Apply blocker', () => {
    const preview = syntheticPreview();
    preview.diagnosticOnly = true;
    preview.diagnosticReason = 'hard_residual';
    preview.hardResidualMetrics = ['ice_fraction'];
    preview.violationsBefore = 1;
    preview.violationsAfter = 1;
    preview.outcomeClassification = {
      ...preview.outcomeClassification,
      outcome: 'engine_optimization',
      engineImproved: true,
      violationsBefore: 1,
      violationsAfter: 1,
    };
    preview.residualMetricDiagnostics = [
      {
        metric: 'ice_fraction',
        labelPl: 'Udział lodu',
        valueUnit: '%',
        distanceUnit: 'pp',
        beforeValue: 43.2,
        proposedValue: 44.4,
        acceptedMin: 45,
        acceptedMax: 58,
        distanceBefore: 1.8,
        distanceAfter: 0.6,
        movement: 'improved',
        status: 'hard_block',
        bandStatus: 'seeded',
        categoryFallback: false,
        temperatureFallback: false,
        applyDisabledReasonPl:
          'Wynik nadal pozostaje poza zatwierdzonym zakresem. Zastosowanie jest wyłączone.',
      },
    ];
    const rendered = render(
      <ConstraintPreviewCard
        preview={preview}
        onApply={noop}
        onCancel={noop}
        showTechnicalDetails
      />,
    );
    expect(rendered).toContain('Udział lodu');
    expect(rendered).toContain('Przed: 43.2%');
    expect(rendered).toContain('Po: 44.4%');
    expect(rendered).toContain('Zakres: 45.0–58.0%');
    expect(rendered).toContain('Dystans: 1.8 pp → 0.6 pp');
    expect(rendered).toContain('Wynik jest bliżej zakresu');
    expect(rendered).not.toContain('Engine potwierdził poprawę techniczną: 1 → 1');
  });

  it('never labels a diagnostic Protein candidate as an achieved applicable profile', () => {
    const preview = syntheticPreview();
    preview.proposedInput = {
      ...preview.proposedInput,
      category: 'protein_gelato',
      goals: {
        ...preview.proposedInput.goals,
        direction_targets_active: true,
        direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
      },
    };
    preview.directionAssessment = {
      active: true,
      reached: true,
      supportedAxisCount: 1,
      reachedAxisCount: 1,
      score: 10,
      residuals: [],
      blockedAxes: [],
    };
    preview.diagnosticOnly = true;
    preview.diagnosticReason = 'protein_claim_residual';

    const rendered = render(
      <ConstraintPreviewCard
        preview={preview}
        onApply={noop}
        onCancel={noop}
        showTechnicalDetails
      />,
    );
    expect(rendered).toContain('data-testid="preview-score"');
    expect(rendered).toMatch(/10(?:<!-- -->)? \/ 10/);
    expect(rendered).not.toContain('data-score-progress');
    expect(rendered).toContain(
      'Kierunek osiągnięty tylko w podglądzie diagnostycznym. Receptura nadal nie jest gotowa do zastosowania.',
    );
    expect(rendered).not.toContain('Gellatti osiągnęło wybrany profil.');
    expect(rendered).toContain('data-testid="preview-apply-disabled"');
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
    const html = render(
      <FeasibilityNotice input={input} analysis={analysis} handlers={handlers} />,
    );
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
    const html = render(
      <FeasibilityNotice input={input} analysis={analysis} handlers={handlers} />,
    );
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
    const html = render(
      <FeasibilityNotice input={input} analysis={analysis} handlers={handlers} />,
    );
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
    before: { input: starterMilkBase(), constraints: { byLineId: {} }, excludedIngredientIds: [] },
    after: { input: starterMilkBase(), constraints: { byLineId: {} }, excludedIngredientIds: [] },
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
    const html = render(
      <ConstraintHistoryPanel history={[]} undoAvailable={false} onUndo={noop} />,
    );
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
