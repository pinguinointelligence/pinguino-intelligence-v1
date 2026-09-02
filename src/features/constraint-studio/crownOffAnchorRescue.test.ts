/**
 * CROWN-OFF SOFT ANCHOR RESCUE — owner decision 2026-09-02.
 *
 * Crown OFF means the customer's grams are an ANCHOR, not a demand and not a
 * maximisation target. An unlocked anchor that cannot work must be rescued
 * DOWNWARD to the highest feasible amount automatically; the customer must
 * never have to guess grams by hand.
 *
 * The defect was a validation-scope mismatch, not a missing search:
 * `projectManualIngredientTarget` already searched, but judged candidates by
 * practicalization + Engine violations + module entitlement only, while
 * `bindProductBehaviorToPreview` later judged the finished Preview by the full
 * `evaluateRecipeConstraintAuthority`. So ~400 g was accepted by the search and
 * then terminal-refused by the gate, with no way back into the descent.
 *
 * Both now consume ONE shared definition of "what blocks a finished Preview"
 * (`finalPreviewAuthorityBlocking`), so they cannot drift apart again.
 */
import { describe, expect, it } from 'vitest';
import { constraintStudioCopy } from './constraintStudioCopy';
import { customerPreviewIssueMessagePl } from './customerConstraintStudioPresentation';
import { previewIssueMessagePl } from './previewIssueMessage';
import type { PreviewIssue } from './constraintStudioStore';

const lockedIssue = (over: Partial<PreviewIssue> = {}): PreviewIssue =>
  ({
    code: 'impossible_under_constraints',
    conflict: { lineId: 'straw', ingredientName: 'STRAWBERRIES · Fresh Fruit', grams: 400 },
    nearestFeasibleGrams: 266,
    hardViolatedMetrics: ['npac', 'total_solids'],
    residualViolatedMetrics: ['water'],
    capReached: false,
    solverInvocations: 18,
    alternativeProductType: null,
    ...over,
  }) as unknown as PreviewIssue;

/** Every internal authority term the customer must never be shown. */
const INTERNAL_TERMS = [
  'twardy limit',
  'nośnik mleczny',
  'NPAC',
  'npac',
  'POD',
  'Sucha masa',
  'total_solids',
  'water',
  'Woda',
  'main_above_hard_limit',
  'liquid_dairy_carrier_below_floor',
  '45',
  '30.0',
  'prób',
];

describe('Crown-OFF locked anchor — customer copy', () => {
  // ---- E / F: excessive locked value gets an advisory maximum ---------------
  it('states the requested amount and the maximum we can use', () => {
    const message = customerPreviewIssueMessagePl(lockedIssue());
    expect(message).toContain('400 g nie jest możliwe w tej recepturze.');
    expect(message).toContain('Maksymalnie możemy użyć 266 g.');
  });

  it('never leaks an internal formulation rule to the customer', () => {
    const message = customerPreviewIssueMessagePl(lockedIssue());
    for (const term of INTERNAL_TERMS) {
      expect(message, `customer copy leaked "${term}"`).not.toContain(term);
    }
  });

  // ---- J: no feasible value anywhere ---------------------------------------
  it('falls back to the short refusal when no maximum exists', () => {
    const message = customerPreviewIssueMessagePl(lockedIssue({ nearestFeasibleGrams: null }));
    expect(message).toBe(constraintStudioCopy.blocked.recipeCannotBeFitted);
    expect(message).toContain('Nie udało się dopasować tej receptury przy tych ustawieniach.');
    for (const term of INTERNAL_TERMS) {
      expect(message, `refusal leaked "${term}"`).not.toContain(term);
    }
  });

  // ---- the diagnostic surface keeps its evidence ---------------------------
  it('keeps the full technical evidence on the Pro/diagnostic renderer', () => {
    const diagnostic = previewIssueMessagePl(lockedIssue());
    expect(diagnostic).toContain('266');
    expect(diagnostic).toContain('prób');
  });
});

describe('Crown-OFF terminal refusal copy', () => {
  it('offers the customer an action instead of naming the rule that fired', () => {
    const copy = constraintStudioCopy.blocked.recipeCannotBeFitted;
    expect(copy).toContain('Zmień ilość składnika lub odblokuj jeden z elementów receptury.');
    for (const term of INTERNAL_TERMS) {
      expect(copy, `blocked copy leaked "${term}"`).not.toContain(term);
    }
  });
});

/**
 * The structural guarantee behind the unlocked rescue: the search and the final
 * gate judge a candidate by the SAME rule set. Before the fix the search used
 * practicalization + Engine violations + module entitlement, while the gate used
 * `evaluateRecipeConstraintAuthority` — so a Main-unsafe candidate passed the
 * search and was then terminal-refused with no way back into the descent.
 */
describe('Crown-OFF unlocked anchor — search and gate share one authority', () => {
  it('asserts the Main envelope per candidate, cheaply, and shares the gate filter', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/features/constraint-studio/applyPipeline.ts', 'utf8'),
    );
    // Declared once…
    expect(source.match(/function finalPreviewAuthorityBlocking\(/g)).toHaveLength(1);
    // …and consumed by the final Preview gate (declaration + call site).
    expect(source.match(/finalPreviewAuthorityBlocking\(/g)?.length ?? 0).toBe(2);
    // The gate must no longer inline its own copy of the filter.
    expect(source).not.toMatch(
      /issue\.source === 'owner_policy' \|\|\s*\n\s*issue\.source === 'main' \|\|\s*\n\s*issue\.source === 'product_behavior' \|\|\s*\n\s*\(issue\.source === 'profile'[\s\S]{0,200}\);\n\s*if \(authorityBlocking/,
    );
    // The rescue search asserts the Main envelope — the blocking class for this
    // scenario — on the candidate it is assessing. It calls `verifyMainEnvelope`
    // DIRECTLY rather than through `evaluateRecipeConstraintAuthority`, which
    // recomputes `calculateRecipe` per call: served QA measured 86 s and 91 s
    // failures on a 400 g unlocked anchor with the wrapper in the descent.
    const assessBlock = source.slice(
      source.indexOf('const assess = (candidate: RecipeInput'),
      source.indexOf('const probe = (grams: number)'),
    );
    expect(assessBlock).toContain('verifyMainEnvelope');
    // The stabilizer authorities are deliberately NOT asserted per candidate:
    // `component_not_whole_grams` fires on an ordinary gelato starter, so doing
    // so rejected every candidate and the descent exhausted (served: a feasible
    // 200 g anchor failed in 20.6 s). The final gate keeps that authority.
    expect(assessBlock).not.toMatch(/assessGelatoStabilizerSystem\(/);
    // the wrapper may be NAMED in the rationale comment, but never CALLED here
    expect(assessBlock).not.toMatch(/evaluateRecipeConstraintAuthority\(\{/);
    // …and rejects the CANDIDATE (returns null) rather than the whole request.
    expect(assessBlock).toMatch(/!verifyMainEnvelope\([\s\S]{0,400}?\)\.ok\s*\)\s*\{\s*return null;/);
  });
});

/**
 * Why the stabilizer authorities must stay OUT of the gram-descent candidate
 * path. Served QA, 2026-09-02: with them in, a FEASIBLE 200 g Crown-OFF anchor
 * failed in 20.6 s exactly like an infeasible 400 g one — every candidate was
 * rejected and the descent exhausted.
 */
describe('Crown-OFF descent — stabilizer authority stays downstream', () => {
  it('component_not_whole_grams fires on an ordinary gelato starter', async () => {
    const [{ useRecipeStore }, { buildRecipeInput }, machine, constraints] = await Promise.all([
      import('@/stores/recipeStore'),
      import('@/features/studio/buildRecipeInput'),
      import('@/features/machine-catalog'),
      import('@/features/recipe-constraints'),
    ]);
    const setup = machine.deriveMachineSetup(machine.NINJA_CREAMI_DELUXE_NC502EU, 'gelato');
    const st = useRecipeStore.getState();
    st.startNewRecipe('gelato');
    st.setMachineSelection({
      kind: 'home',
      servingModeId: setup.resolvedVisibleMode!,
      machineId: machine.NINJA_CREAMI_DELUXE_NC502EU.id,
      label: 'Ninja CREAMi Deluxe',
      temperatureC: -11,
      batchGrams: 670,
      capacityGrams: 670,
      batchSource: 'MACHINE_DEFAULT',
    } as never);
    const input = buildRecipeInput(useRecipeStore.getState());

    // A plain starter carries fractional support grams before practicalization.
    expect(
      input.items.some((item) => !Number.isInteger(item.planned_grams)),
      'starter should have fractional support lines',
    ).toBe(true);

    // …and the gelato stabilizer authority flags exactly that.
    const issues = constraints.assessGelatoStabilizerSystem(input).issues.map((i) => i.code);
    expect(issues).toContain('component_not_whole_grams');
  });

  it('the candidate path does not consult either stabilizer authority', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/features/constraint-studio/applyPipeline.ts', 'utf8'),
    );
    const assessBlock = source.slice(
      source.indexOf('const assess = (candidate: RecipeInput'),
      source.indexOf('const probe = (grams: number)'),
    );
    // Named in the rationale comment, never called.
    expect(assessBlock).not.toMatch(/assessGelatoStabilizerSystem\(/);
    expect(assessBlock).not.toMatch(/assessSorbetStabilizerSystem\(/);
    // The final gate keeps the authority: it still runs the full evaluation.
    expect(source).toContain('evaluateRecipeConstraintAuthority({');
  });
});
