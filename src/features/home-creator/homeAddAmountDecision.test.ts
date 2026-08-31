/**
 * §B zero-gram add flow — owner-locked decision, 2026-08-31.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { confirmedGrams, decideAddAmount, isConfirmableAmount } from './homeAddAmountDecision';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';

const dose = () => 'Zalecane dawkowanie producenta';

/**
 * Only the fields `resolveMainCapability` actually reads. The shared fixture builds
 * snapshots from a whole RecipeInput, which would make these cases harder to read
 * without testing anything more.
 */
const snapshotWith = (mainCapability: ProductBehaviorSnapshot['mainCapability']) =>
  ({
    schemaVersion: 1,
    resolutionState: 'RESOLVED',
    processScope: 'BASE_FORMULATION',
    moduleEligibility: { BASE_RECIPE: 'eligible', MAIN: 'eligible' },
    mainCapability,
    mainClassification: 'MAIN_ALLOWED',
    sharedFacts: {},
  }) as unknown as ProductBehaviorSnapshot;

describe('who decides the amount', () => {
  it('lets the existing Crown authority decide for a Crown-capable product', () => {
    const snapshot = snapshotWith('MAIN_CAPABLE');
    expect(decideAddAmount(snapshot, dose).kind).toBe('crown_decides');
  });

  it('asks before creating the line for a product Crown cannot carry', () => {
    const snapshot = snapshotWith('MAIN_TECHNICAL_BLOCKED');
    expect(decideAddAmount(snapshot, dose).kind).toBe('ask_amount');
  });

  it('refuses — never guesses — when there is no trustworthy authority', () => {
    // Owner ruling §6: "snapshot unknown" must not become a backdoor for creating a line
    // with guessed semantics. Not Crown, not non-Crown: no line.
    expect(decideAddAmount(null, dose).kind).toBe('unresolved_authority');
  });

  it('refuses a snapshot that is not currently resolved', () => {
    const stale = { ...snapshotWith('MAIN_CAPABLE'), resolutionState: 'REVALIDATION_REQUIRED' };
    expect(decideAddAmount(stale as never, dose).kind).toBe('unresolved_authority');
  });

  it('asks ONLY when a current authority says Crown cannot carry the product', () => {
    expect(decideAddAmount(snapshotWith('MAIN_TECHNICAL_BLOCKED'), dose).kind).toBe('ask_amount');
    expect(decideAddAmount(snapshotWith('MAIN_UNKNOWN'), dose).kind).toBe('unresolved_authority');
  });
});

describe('the range is canonical or absent — never invented', () => {
  it('offers no range when the dosage authority carries none', () => {
    const snapshot = snapshotWith('MAIN_TECHNICAL_BLOCKED');
    const decision = decideAddAmount(snapshot, dose);
    expect(decision.kind).toBe('ask_amount');
    if (decision.kind === 'ask_amount') expect(decision.recommendedDose).toBeNull();
  });
});

describe('only a positive amount may become a line', () => {
  it.each(['0', '0.0', '-5', '', 'abc', ' '])('refuses %o', (raw) => {
    expect(isConfirmableAmount(raw)).toBe(false);
  });

  it.each([
    ['30', 30],
    ['1', 1],
    ['2,5', 2.5],
    ['0.5', 0.5],
  ])('accepts %o', (raw, expected) => {
    expect(isConfirmableAmount(raw as string)).toBe(true);
    expect(confirmedGrams(raw as string)).toBe(expected);
  });
});

describe('the page never creates an invalid line', () => {
  const page = readFileSync('src/pages/home/HomeCreatorPage.tsx', 'utf8');

  it('asks before adding when Crown cannot decide', () => {
    expect(page).toContain('decideAddAmount(');
    expect(page).toContain("decision.kind === 'ask_amount'");
    expect(page).toContain('setPendingAdd(');
  });

  it('has exactly one place that creates a Base line', () => {
    expect(page.match(/getState\(\)\.addIngredient\(/g) ?? []).toHaveLength(1);
  });

  it('never persists a fake minimum', () => {
    expect(page).not.toMatch(/addIngredient\([^)]*,\s*1\s*\)/);
  });

  it('creates nothing when the authority is unresolved', () => {
    expect(page).toContain("decision.kind === 'unresolved_authority'");
  });

  it('passes the canonical behaviour context so the picker can resolve and refuse', () => {
    const section = readFileSync('src/features/home-creator/ui/HomeRecipeSection.tsx', 'utf8');
    expect(section).toContain('behaviorContext={{');
    expect(section).toContain('accountId: behaviorAccountId');
  });

  it('creates the line only from Crown (0) or a confirmed amount', () => {
    expect(page).toContain('addIngredientLine(ingredient, behavior ?? null, 0)');
    expect(page).toContain('addIngredientLine(pendingAdd.ingredient, pendingAdd.behavior, grams)');
  });

  it('invents no amount and no second solver', () => {
    for (const forbidden of ['AUTO_GRAMS', 'autoGrams', 'suggestGrams', 'solveAmount']) {
      expect(page, forbidden).not.toContain(forbidden);
    }
  });
});
