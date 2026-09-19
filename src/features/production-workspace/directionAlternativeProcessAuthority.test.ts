import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { parseCsv } from '@/lib/csv';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import {
  starterPackRescueIngredient,
  starterPackRescueLineId,
  type StarterPackRescueMapperId,
} from '@/features/constraint-studio/starterPackRescuePalette';
import { missingDirectionAlternativeProcessLines } from './useProductionWorkspace';

const AUDITED = [
  'PI-ING-001645',
  'PI-ING-000260',
  'PI-ING-000270',
  'PI-ING-000456',
] as const satisfies readonly StarterPackRescueMapperId[];

// FINAL 2541 authority: these two remain Verified and can therefore enter the
// executable rescue palette. PI-ING-000260 / PI-ING-000270 are now
// Estimated/85; their process rows remain audited above, but ProductBehavior
// correctly keeps them out of executable candidates.
const EXECUTABLE_AUDITED = [
  'PI-ING-001645',
  'PI-ING-000456',
] as const satisfies readonly StarterPackRescueMapperId[];
const ESTIMATED_FAIL_CLOSED = [
  'PI-ING-000260',
  'PI-ING-000270',
] as const satisfies readonly StarterPackRescueMapperId[];

const [PROCESS_HEADER = [], ...PROCESS_VALUES] = parseCsv(
  readFileSync(resolve('supabase/seed/mapper_process_metadata.csv'), 'utf8'),
);
const PROCESS_ROWS = PROCESS_VALUES.map((values) =>
  Object.fromEntries(PROCESS_HEADER.map((key, index) => [key, values[index] ?? ''])),
);

const processRow = (mapperId: (typeof AUDITED)[number]) => {
  const row = PROCESS_ROWS.find((candidate) => candidate.ingredient_id === mapperId);
  expect(row, `missing canonical process row for ${mapperId}`).toBeDefined();
  return row!;
};

const auditRecipe = (): RecipeInput => {
  const base = starterMilkBase();
  const items = EXECUTABLE_AUDITED.map((mapperId, index) => ({
    id: starterPackRescueLineId(mapperId),
    ingredient: starterPackRescueIngredient(mapperId)!,
    planned_grams: index === 0 ? 10 : 20,
    actual_grams: null,
    lock_type: 'unlocked' as const,
  }));
  return {
    ...base,
    target_batch_grams: items.reduce((sum, item) => sum + item.planned_grams, 0),
    items,
  };
};

const withoutProcessEvidence = (recipe: RecipeInput) =>
  Object.fromEntries(
    Object.entries(productBehaviorTestSnapshots(recipe)).map(([lineId, snapshot]) => [
      lineId,
      {
        ...snapshot,
        sharedFacts: { ...snapshot.sharedFacts!, processEvidence: [] },
      },
    ]),
  );

describe('Direction alternative process-authority audit', () => {
  it('pins the current canonical process authority for all four exact Mapper identities', () => {
    expect(AUDITED).toHaveLength(4);
    expect(processRow('PI-ING-001645')).toMatchObject({
      process_status: 'UNKNOWN',
      cold_process_eligibility: 'UNKNOWN',
      hydration_mode: 'UNKNOWN',
      process_reason_codes: 'PROCESS_DATA_INSUFFICIENT',
      process_confidence_percent: '0',
    });
    expect(processRow('PI-ING-000260')).toMatchObject({
      process_status: 'UNKNOWN',
      cold_process_eligibility: 'UNKNOWN',
      hydration_mode: 'UNKNOWN',
      process_reason_codes: 'PROCESS_DATA_INSUFFICIENT',
      process_confidence_percent: '0',
    });
    expect(processRow('PI-ING-000270')).toMatchObject({
      process_status: 'UNKNOWN',
      cold_process_eligibility: 'CONDITIONAL',
      hydration_mode: 'GRADE_DEPENDENT',
      process_reason_codes: 'SMP_PROCESS_GRADE_DEPENDENT',
      process_confidence_percent: '90',
    });
    expect(processRow('PI-ING-000456')).toMatchObject({
      process_status: 'UNKNOWN',
      cold_process_eligibility: 'CONDITIONAL',
      hydration_mode: 'GRADE_DEPENDENT',
      process_reason_codes: 'INULIN_SOLUBILITY_GRADE_DEPENDENT',
      process_confidence_percent: '85',
    });
  });

  it('finds missing process evidence for executable audited products and fails Estimated rows closed', () => {
    for (const mapperId of ESTIMATED_FAIL_CLOSED) {
      expect(starterPackRescueIngredient(mapperId)).toBeNull();
    }
    const recipe = auditRecipe();
    const snapshots = withoutProcessEvidence(recipe);
    expect(
      missingDirectionAlternativeProcessLines(recipe, snapshots).map(
        (item) => item.ingredient.canonical_ingredient_id,
      ),
    ).toEqual(EXECUTABLE_AUDITED);
  });

  it('allows Preview/Apply product math but holds Production until exact process evidence exists', () => {
    const recipe = auditRecipe();
    const snapshots = withoutProcessEvidence(recipe);
    const yolkLineId = starterPackRescueLineId('PI-ING-001645');
    const yolk = snapshots[yolkLineId]!;
    snapshots[yolkLineId] = {
      ...yolk,
      sharedFacts: {
        ...yolk.sharedFacts!,
        processEvidence: [
          {
            decision: 'heat_required_for_function',
            reasonType: 'process_requirement',
            affectedIngredientIds: ['PI-ING-001645'],
            explanation: 'verified manufacturer process',
            source: {
              id: 'owner-process-proof',
              label: 'owner process proof',
              reference: 'owner process proof',
              verificationStatus: 'verified',
            },
          } as never,
        ],
      },
    };
    expect(
      missingDirectionAlternativeProcessLines(recipe, snapshots).map((item) => item.id),
    ).not.toContain(yolkLineId);
  });

  it('does not change the accepted informational policy for ordinary recipe lines', () => {
    const recipe = starterMilkBase();
    const snapshots = productBehaviorTestSnapshots(recipe);
    expect(missingDirectionAlternativeProcessLines(recipe, snapshots)).toEqual([]);
  });
});
