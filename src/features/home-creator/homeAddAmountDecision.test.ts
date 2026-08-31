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

describe('the mainCapability state space is covered EXHAUSTIVELY, not by observation', () => {
  // `MainCapabilityState` is a closed union of exactly four members. Enumerating it here
  // (and asserting the count against the source) proves MAIN_TECHNICAL_BLOCKED is the
  // ONLY category-B state rather than merely the one that happened to be observed.
  const ALL_STATES = [
    'MAIN_CAPABLE',
    'MAIN_CAPABLE_UNCALIBRATED',
    'MAIN_TECHNICAL_BLOCKED',
    'MAIN_UNKNOWN',
  ] as const;

  const EXPECTED: Record<(typeof ALL_STATES)[number], string> = {
    MAIN_CAPABLE: 'crown_decides',
    MAIN_CAPABLE_UNCALIBRATED: 'crown_decides',
    MAIN_TECHNICAL_BLOCKED: 'ask_amount',
    MAIN_UNKNOWN: 'unresolved_authority',
  };

  it('the union really has exactly these four members', () => {
    const source = readFileSync('src/features/product-intelligence/mainCapability.ts', 'utf8');
    const union = source.slice(
      source.indexOf('export type MainCapabilityState ='),
      source.indexOf('export type MainCalibrationLevel'),
    );
    for (const state of ALL_STATES) expect(union, state).toContain(`'${state}'`);
    // No fifth member has been added without this matrix being revisited.
    expect((union.match(/\|\s*'MAIN_/g) ?? []).length).toBe(ALL_STATES.length);
  });

  it.each(ALL_STATES)('%s maps to its owner-defined category', (state) => {
    expect(decideAddAmount(snapshotWith(state), dose).kind).toBe(EXPECTED[state]);
  });

  it('exactly ONE state may ask the customer for a manual amount', () => {
    const asking = ALL_STATES.filter(
      (state) => decideAddAmount(snapshotWith(state), dose).kind === 'ask_amount',
    );
    expect(asking).toEqual(['MAIN_TECHNICAL_BLOCKED']);
  });

  it('every route into MAIN_UNKNOWN refuses — missing, stale and unknown alike', () => {
    // snapshot_missing
    expect(decideAddAmount(null, dose).kind).toBe('unresolved_authority');
    // revalidation_required — resolutionState gates before the capability layer
    const stale = { ...snapshotWith('MAIN_CAPABLE'), resolutionState: 'REVALIDATION_REQUIRED' };
    expect(decideAddAmount(stale as never, dose).kind).toBe('unresolved_authority');
    const legacy = { ...snapshotWith('MAIN_CAPABLE'), resolutionState: 'LEGACY_RECONSTRUCTED' };
    expect(decideAddAmount(legacy as never, dose).kind).toBe('unresolved_authority');
    // unknown_product
    expect(decideAddAmount(snapshotWith('MAIN_UNKNOWN'), dose).kind).toBe('unresolved_authority');
  });
});
