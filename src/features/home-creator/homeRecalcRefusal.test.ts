/**
 * OWNER BUGFIX — HOME EMPTY REFUSAL (#287), 2026-09-11.
 *
 * Every refusal HOME can be handed gets a customer reason and the next step — and, only when
 * the result itself names one HOME can say, the rule it hit. Nothing internal, nothing invented,
 * and the verdict is never touched.
 */
import { describe, expect, it } from 'vitest';
import {
  constraintStudioCopy,
  formatGramsPl,
} from '@/features/constraint-studio/constraintStudioCopy';
import type {
  PreviewIssue,
  RecalculationTerminalState,
} from '@/features/constraint-studio/constraintStudioStore';
import {
  customerOptimizerNoSolutionPl,
  customerStopReasonPl,
} from '@/features/constraint-studio/customerConstraintStudioPresentation';
import { homeCreatorCopy } from './homeCreatorCopy';
import { exposesInternals } from './homeCustomerNotice';
import { homeRecalcRefusal } from './homeRecalcRefusal';

const NEXT = homeCreatorCopy.recalcRefusal.next;
const FALLBACK = homeCreatorCopy.recalcRefusal.fallback;
const TERMINAL: RecalculationTerminalState = {
  state: 'BLOCKED_WITH_EXACT_ACTION',
  code: 'no_proposal',
};

/** The refusal HomeRecalculate held on served staging `aaece589` (without `iteration`). */
const SERVED: PreviewIssue = {
  ok: false,
  code: 'no_proposal',
  violatedMetrics: ['npac', 'pod'],
  solverInvocations: 8,
  directionTargetUnreached: true,
};

const IMPOSSIBLE = {
  ok: false,
  code: 'impossible_under_constraints',
  conflict: {
    lineId: 'raspberry',
    ingredientName: 'RASPBERRY · Puree',
    kind: 'grams_lock',
    grams: 562,
  },
  hardViolatedMetrics: ['npac'],
  residualViolatedMetrics: [],
  capReached: false,
  nearestFeasibleGrams: 480,
  alternativeProductType: null,
  solverInvocations: 30,
  templateId: 'sorbet-template',
} as unknown as PreviewIssue;

/** One of every variant the pipeline can publish. */
const EVERY_ISSUE: readonly PreviewIssue[] = [
  { ok: false, code: 'invalid_constraints', issues: [] },
  { ok: false, code: 'already_clean' },
  {
    ok: false,
    code: 'standard_presence_removal_required',
    lineId: 'raspberry',
    productName: 'Malina',
    currentGrams: 40,
    bestAttemptedNonZeroGrams: 12,
    limitingMetric: 'fat',
    acceptedMin: 1,
    acceptedMax: 5,
    messagePl: 'Składnik Malina trzeba usunąć albo zmienić.',
  },
  {
    ok: false,
    code: 'practicalization_blocked',
    lineIds: [],
    messagePl: 'Nie da się zaokrąglić receptury do pełnych gramów.',
  },
  { ok: false, code: 'no_proposal' },
  { ok: false, code: 'no_proposal', violatedMetrics: ['npac'], failureKind: 'SEARCH_FAILED' },
  SERVED,
  { ok: false, code: 'unsafe_proposal', violatedMetrics: ['npac'], solverInvocations: 5 },
  { ok: false, code: 'apply_failed' },
  { ok: false, code: 'line_missing' },
  {
    ok: false,
    code: 'substitution_invalid',
    reasons: ['unavailable_ingredient_present'],
    messagePl: 'Malina jest oznaczony jako niedostępny. Wybierz zamiennik albo usuń linię.',
  },
  { ok: false, code: 'rescale_invalid' },
  { ok: false, code: 'rescale_actuals' },
  { ok: false, code: 'rescale_no_scalable' },
  { ok: false, code: 'rescale_locked_sum', minimumBatchGrams: 1200 },
  {
    ok: false,
    code: 'main_ratio_conflict',
    lineIds: [],
    ingredientNames: ['Malina'],
    messagePl: 'Grupa składników głównych ma 12%; wymagane minimum to 20%.',
  },
  {
    ok: false,
    code: 'product_behavior_invalid',
    violations: [],
    messagePl:
      'Malina · Mapper brak · moduł BASE_RECIPE brakuje aktualnego ProductBehavior binding.',
  },
  {
    ok: false,
    code: 'main_ingredient_unavailable',
    ingredientIds: [],
    messagePl: 'Składnik główny jest oznaczony jako niedostępny.',
  },
  {
    ok: false,
    code: 'vegan_ingredient_conflict',
    issues: [],
    substitutions: [],
    messagePl: 'Ten składnik nie jest wegański. Wybierz roślinny zamiennik.',
  },
  {
    ok: false,
    code: 'vegan_profile_constraint',
    issues: [],
    messagePl: 'Ta receptura wegańska potrzebuje roślinnej bazy.',
  } as unknown as PreviewIssue,
  { ok: false, code: 'unsupported_profile', reason: 'no_approved_template' },
  {
    ok: false,
    code: 'missing_required_role',
    role: 'product_dose',
    messagePl: 'Podaj gramaturę dla: Malina. Minimalna ilość to 1 g.',
  },
  {
    ok: false,
    code: 'best_safe_result',
    solverInvocations: 12,
    softViolatedMetrics: ['npac'],
    bandSource: 'category_fallback',
    templateId: 'sorbet-template',
    stopReason: 'template_fixed_point',
  } as unknown as PreviewIssue,
  IMPOSSIBLE,
];

/** Internal vocabulary that must never reach a HOME screen. */
const RAW = [
  'no_proposal',
  'unsafe_proposal',
  'already_clean',
  'best_safe_result',
  'impossible_under_constraints',
  'apply_failed',
  'directionTargetUnreached',
  'solverInvocations',
  'violatedMetrics',
  'BLOCKED_WITH_EXACT_ACTION',
  'NPAC',
  'POD',
  'PI-ING-',
  'Sprawdź wykonalność blokad',
  'prób',
];

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

describe('OWNER BUGFIX — every HOME refusal explains itself (#287)', () => {
  it('the exact served refusal: canonical reason, the goals it could not improve, the next step', () => {
    expect(homeRecalcRefusal({ previewIssue: SERVED, blocked: null, terminal: TERMINAL })).toEqual({
      reason: constraintStudioCopy.previewIssue.bestSafeResult,
      detail: 'Nie udało się bezpiecznie poprawić: słodycz, miękkość.',
      next: NEXT,
    });
  });

  it.each(EVERY_ISSUE.map((issue) => [issue.code, issue] as const))(
    '%s: a customer reason, the next step, nothing internal',
    (_code, issue) => {
      const refusal = homeRecalcRefusal({ previewIssue: issue, blocked: null, terminal: TERMINAL });
      expect(refusal.reason.trim().length).toBeGreaterThan(20);
      expect(refusal.next).toBe(NEXT);
      expect(exposesInternals(refusal.reason)).toBe(false);
      if (refusal.detail !== null) expect(exposesInternals(refusal.detail)).toBe(false);
      const shown = `${refusal.reason} ${refusal.detail ?? ''} ${refusal.next}`;
      for (const raw of RAW) expect(shown).not.toContain(raw);
    },
  );

  it('an ordinary no-proposal speaks the customer no-solution sentence, never a lock instruction', () => {
    const refusal = homeRecalcRefusal({
      previewIssue: { ok: false, code: 'no_proposal', violatedMetrics: ['npac', 'pod'] },
      blocked: null,
      terminal: TERMINAL,
    });
    expect(refusal.reason).toBe(customerOptimizerNoSolutionPl(['słodycz', 'miękkość']));
    expect(refusal.reason.toLowerCase()).not.toContain('blokad');
    expect(refusal.detail).toBeNull();
  });

  it('a search that only found nothing lists no parameters as out of range', () => {
    const refusal = homeRecalcRefusal({
      previewIssue: {
        ok: false,
        code: 'no_proposal',
        violatedMetrics: ['npac'],
        failureKind: 'SEARCH_FAILED',
      },
      blocked: null,
      terminal: TERMINAL,
    });
    expect(refusal.reason).toBe(customerOptimizerNoSolutionPl([]));
  });

  it('„best achievable" carries its stop reason and no search count', () => {
    const refusal = homeRecalcRefusal({
      previewIssue: EVERY_ISSUE.find((issue) => issue.code === 'best_safe_result')!,
      blocked: null,
      terminal: { state: 'BEST_ACHIEVABLE' },
    });
    expect(refusal.reason).toBe(
      `${constraintStudioCopy.previewIssue.bestSafeResult} ${customerStopReasonPl('template_fixed_point')}`,
    );
  });

  it('a lock that makes the recipe impossible names the lock and its safe maximum', () => {
    const refusal = homeRecalcRefusal({
      previewIssue: IMPOSSIBLE,
      blocked: null,
      terminal: { state: 'LOCK_CHANGE_REQUIRED', code: 'impossible_under_constraints' },
    });
    const feasibility = constraintStudioCopy.feasibility;
    expect(refusal.reason).toBe(constraintStudioCopy.lockConflict.genericGap);
    expect(refusal.detail).toBe(
      `${feasibility.boundLockedAt('RASPBERRY · Puree', formatGramsPl(562))} ` +
        feasibility.boundMax(formatGramsPl(480)),
    );
  });

  it('a metric HOME has no word for is never shown — not even half of a list', () => {
    expect(
      homeRecalcRefusal({
        previewIssue: { ...SERVED, violatedMetrics: ['npac', 'lactose'] } as PreviewIssue,
        blocked: null,
        terminal: TERMINAL,
      }).detail,
    ).toBeNull();
    expect(
      homeRecalcRefusal({
        previewIssue: { ok: false, code: 'no_proposal', violatedMetrics: ['lactose'] },
        blocked: null,
        terminal: TERMINAL,
      }).reason,
    ).toBe(customerOptimizerNoSolutionPl([]));
  });

  it('precedence: the Apply refusal, then the result, then the terminal sentence, then the fallback', () => {
    const stale =
      'Nie można zastosować zmian: klasyfikacja produktu się zmieniła. Utwórz nowy podgląd.';
    expect(
      homeRecalcRefusal({
        previewIssue: SERVED,
        blocked: { messagePl: stale },
        terminal: TERMINAL,
      }),
    ).toEqual({ reason: stale, detail: null, next: NEXT });
    expect(
      homeRecalcRefusal({
        previewIssue: null,
        blocked: null,
        terminal: {
          state: 'BLOCKED_WITH_EXACT_ACTION',
          code: 'product_behavior_invalid',
          messagePl: 'Dawka stabilizatora musi mieścić się w zakresie 2–5 g.',
          action: 'return_to_recipe',
        },
      }).reason,
    ).toBe('Dawka stabilizatora musi mieścić się w zakresie 2–5 g.');
    expect(homeRecalcRefusal({ previewIssue: null, blocked: null, terminal: TERMINAL })).toEqual({
      reason: FALLBACK,
      detail: null,
      next: NEXT,
    });
    expect(homeRecalcRefusal({ previewIssue: null, blocked: null, terminal: null }).reason).toBe(
      FALLBACK,
    );
  });

  it('internal vocabulary is still replaced by the calm HOME sentence', () => {
    const refusal = homeRecalcRefusal({
      previewIssue: EVERY_ISSUE.find((issue) => issue.code === 'product_behavior_invalid')!,
      blocked: null,
      terminal: TERMINAL,
    });
    expect(refusal.reason).toBe(homeCreatorCopy.recipe.unresolvedProduct);
  });

  it('presentation only — the verdict objects are never touched', () => {
    for (const issue of [...EVERY_ISSUE, SERVED]) {
      const frozen = deepFreeze(structuredClone(issue));
      const before = JSON.stringify(frozen);
      expect(() =>
        homeRecalcRefusal({
          previewIssue: frozen,
          blocked: null,
          terminal: deepFreeze({ ...TERMINAL }),
        }),
      ).not.toThrow();
      expect(JSON.stringify(frozen)).toBe(before);
    }
  });
});
