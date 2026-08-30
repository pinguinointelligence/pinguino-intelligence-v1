/**
 * OWNER-LOCKED — PC-01. A clean recipe at a Direction local optimum speaks
 * Gellatti, not solver.
 *
 * Purely additive; it weakens nothing in the existing contracts.
 *
 * The Sorbet −12 °C OPTIMAL fixture sits inside every approved band. The
 * requested Direction cannot be improved without leaving one, so the pipeline
 * correctly refuses and correctly keeps the candidate non-publishable. That
 * refusal is right. What the customer read was not: `no_proposal` renders
 * „Nie znaleziono korekty możliwej przy obecnych BLOKADACH… Użyj «Sprawdź
 * wykonalność blokad»" — on a recipe that has no locks at all, pointing at a
 * control that cannot help.
 *
 * `directionTargetUnreached` is the pipeline's own signal for exactly this
 * family. Every site that raises it on a `no_proposal` first proves the draft
 * is native-safe (`applyPipeline.ts` — two sites assert
 * `detectViolations(...).length === 0`; the third only fires on an `ok`,
 * on-batch candidate identical to the draft). So the flag already means
 * „the recipe is safe and the requested Direction cannot be improved", and the
 * presentation layer simply was not reading it.
 *
 * Nothing in the Engine, Solver, Direction maths, bands, Mapper,
 * ProductBehavior, Production or Rescue is involved: this contract is about
 * which canonical Gellatti sentence the customer is handed.
 */
import { describe, expect, it } from 'vitest';
import { constraintStudioCopy as copy } from '@/features/constraint-studio/constraintStudioCopy';
import { previewIssueMessagePl } from '@/features/constraint-studio/previewIssueMessage';
import type { PreviewIssue } from '@/features/constraint-studio/constraintStudioStore';

/** The PC-01 terminal result, exactly as the pipeline produces it. */
const PC01_ISSUE: PreviewIssue = {
  code: 'no_proposal',
  violatedMetrics: ['pod', 'npac'],
  directionTargetUnreached: true,
} as PreviewIssue;

/** An ordinary no-proposal: no Direction request behind it. */
const ORDINARY_NO_PROPOSAL: PreviewIssue = {
  code: 'no_proposal',
  violatedMetrics: ['npac'],
} as PreviewIssue;

/** Raw internal vocabulary that must never reach a customer. */
const RAW_CODES = [
  'no_proposal',
  'unsafe_proposal',
  'already_clean',
  'best_safe_result',
  'apply_failed',
  'directionTargetUnreached',
  'solverInvocations',
  'violatedMetrics',
  'publishable',
  'materiallyDifferent',
];

describe('OWNER-LOCKED — a Direction local optimum speaks Gellatti', () => {
  it('1. PC-01 renders the canonical bestSafeResult sentence', () => {
    expect(previewIssueMessagePl(PC01_ISSUE)).toBe(copy.previewIssue.bestSafeResult);
  });

  it('2. it never hands the customer a lock-feasibility instruction', () => {
    const message = previewIssueMessagePl(PC01_ISSUE);
    // The recipe has no locks; naming them, or the lock-feasibility control,
    // sends the customer to something that cannot help.
    expect(message.toLowerCase()).not.toContain('blokad');
    expect(message).not.toContain(copy.previewIssue.noProposal);
  });

  it('3. no raw internal terminal code is used as customer copy', () => {
    const message = previewIssueMessagePl(PC01_ISSUE);
    for (const raw of RAW_CODES) expect(message).not.toContain(raw);
    // A customer sentence, not a diagnostic dump.
    expect(message.length).toBeGreaterThan(20);
  });

  it('4. an ordinary no_proposal keeps its existing Gellatti message', () => {
    // The distinction is the whole point: only the clean-draft Direction local
    // optimum is reclassified. Everything else is untouched.
    expect(previewIssueMessagePl(ORDINARY_NO_PROPOSAL)).toBe(copy.previewIssue.noProposal);
  });

  it('5. an explicitly unreached=false no_proposal also keeps it', () => {
    expect(
      previewIssueMessagePl({
        code: 'no_proposal',
        directionTargetUnreached: false,
      } as PreviewIssue),
    ).toBe(copy.previewIssue.noProposal);
  });

  it('6. PC-03 cannot reach this message — unsafe_proposal is a different state', () => {
    /* PC-03 surfaces `unsafe_proposal`, whose variant carries no
       `directionTargetUnreached` field at all, so the predicate cannot collide
       with it by construction. It keeps its own honest Gellatti sentence: an
       unsafe result must never be dressed up as a normal optimum. */
    const pc03 = { code: 'unsafe_proposal', violatedMetrics: ['npac'] } as PreviewIssue;
    const message = previewIssueMessagePl(pc03);
    expect(message).toBe(copy.previewIssue.unsafeProposal);
    expect(message).not.toBe(copy.previewIssue.bestSafeResult);
  });

  it('7. the reclassification reads the pipeline signal, it does not invent one', () => {
    // Guard against a future "fix" that hard-codes a category, temperature or
    // recipe shape here instead of reading the pipeline's own verdict.
    const source = previewIssueMessageSource();
    expect(source).toContain('directionTargetUnreached');
    expect(source).toContain('bestSafeResult');
    // Scoped to THIS branch: other cases legitimately mention a product type.
    // Comments may name the fixture that motivated the rule; the branch LOGIC
    // may not branch on a category, a temperature or an ingredient.
    const branch = source.slice(
      source.indexOf("case 'no_proposal':"),
      source.indexOf("case 'unsafe_proposal':"),
    );
    expect(branch).toContain('directionTargetUnreached');
    const code = branch.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const forbidden of ['sorbet', 'raspberry', 'PI-ING-', 'target_temperature_c']) {
      expect(code.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

function previewIssueMessageSource(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:fs').readFileSync(
    'src/features/constraint-studio/previewIssueMessage.ts',
    'utf8',
  ) as string;
}
