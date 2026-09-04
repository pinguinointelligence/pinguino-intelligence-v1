/**
 * OWNER REPRO 2026-09-04 — the rescued batch that can never be recovered.
 *
 * Served staging `e2e1a61a`, run `2fc85403-2394-4582-a211-4736bfc4ef8e`: BANANA
 * planned 300 g, weighed 345 g. Rescue activated, was authorized, was accepted
 * and stored (`rescue_accepted_at` set, `rescue_revision` 1). From that moment
 * every reload of Production ends in „Nie udało się odzyskać partii".
 *
 * The stored candidate, read back from the durable run:
 *
 *   MILK 492.2  CREAM 129.9  SMP 46  SUCROSE 69  DEXTROSE 63.2  TARA 4.6
 *   BANANA 345                                            total 1149.9 g
 *
 * The support lines were scaled by k = 1.15 (700 g -> 805 g) so BANANA would sit
 * at exactly 30 % — its published hard limit. But two of them land on a half
 * tenth and JS rounds them DOWN (`(113*1.15).toFixed(1)` is "129.9", not
 * "130.0"; `(55*1.15).toFixed(1)` is "63.2"), so the support sum is 804.9, the
 * denominator is 1149.9 instead of 1150.0, and BANANA becomes
 *
 *   345 / 1149.9 = 30.0026 %   >   30 % hard limit
 *
 * The candidate was solved to sit EXACTLY on the limit, leaving no headroom for
 * the 0.1 g the rounding gives away.
 *
 * Nothing rejects it at build time: `assessProductionHardSafety` — the gate the
 * rescue candidate loop actually uses — checks engine violations, machine
 * capacity and the native profile, and never consults the Main envelope. But
 * `hydrateProductionSessionFromRun` -> `applyVerifiedRescueInput` re-validates
 * the stored candidate through `evaluateRecipeConstraintAuthority`, which DOES
 * run the envelope. So the run is written in a state its own recovery path
 * refuses, and the refusal is swallowed by the durable-recovery catch and shown
 * as the generic „nie udało się połączyć" sentence.
 *
 * These cases pin the exact boundary rather than the story.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { parseCsv } from '@/lib/csv';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { verifyMainEnvelope } from '@/features/product-intelligence';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import type { ProductionRun } from '@/features/pro-core/productionContracts';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import { evaluateRecipeConstraintAuthority } from '@/features/recipe-constraints/recipeConstraintAuthority';
import { assessProductionHardSafety, assessProductionRescue } from './productionRescue';
import {
  applyVerifiedRescueInput,
  createProductionSession,
  hydrateProductionSessionFromRun,
} from './productionSession';
import {
  authorizeTrustedProductionRescue,
  type PersistTrustedAuthorizationInput,
  type TrustedRescueContext,
} from '../../../supabase/functions/production-rescue-authorize/logic';
import {
  OWNER_BANANA_MAIN_POLICY,
  OWNER_BANANA_PHYSICAL_G,
  OWNER_LINE_IDS,
  OWNER_MAPPER_IDS,
  OWNER_PLANNED_GRAMS,
  OWNER_RESCUE_GRAMS,
  OWNER_RUN_ID,
} from './ownerRescueRun2fc85403.fixture';

vi.setConfig({ testTimeout: 60_000 });

const MAPPER_SOURCE = readFileSync(
  resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'),
  'utf8',
);
const [HEADER = [], ...RECORDS] = parseCsv(MAPPER_SOURCE);
const INDEX = new Map(HEADER.map((name, position) => [name, position]));
const NUMERIC = new Set(
  HEADER.filter((field) =>
    /_percent$|_value$|_factor$|_days$|^brix$|^kcal_per_100g$|^cost_per_kg$|_activity$/.test(field),
  ),
);
const mapperRow = (ingredientId: string): IngredientRow => {
  const record = RECORDS.find((row) => row[INDEX.get('ingredient_id')!] === ingredientId);
  if (!record) throw new Error(`Missing Mapper fixture ${ingredientId}`);
  return Object.fromEntries(
    HEADER.map((field, position) => {
      const raw = record[position]?.trim() ?? '';
      if (NUMERIC.has(field)) return [field, raw === '' ? null : Number(raw)];
      if (
        field === 'approved_for_base' ||
        field === 'approved_for_engines' ||
        field === 'is_active'
      )
        return [field, raw.toLocaleLowerCase('en') === 'true'];
      if (field === 'verification_date' || field === 'last_reviewed_at')
        return [field, raw || null];
      return [field, raw];
    }),
  ) as unknown as IngredientRow;
};
const ingredient = (id: string) => ({
  ...ingredientRowToEngineIngredient(mapperRow(id)),
  cost_per_kg: 1,
  cost_currency: 'EUR',
});
const IDS = OWNER_MAPPER_IDS;

const line = (
  id: string,
  ingredientId: string,
  grams: number,
  lockType: RecipeInput['items'][number]['lock_type'] = 'unlocked',
) =>
  ({
    id,
    ingredient: ingredient(ingredientId),
    planned_grams: grams,
    actual_grams: null,
    lock_type: lockType,
  }) as RecipeInput['items'][number];

/** The rescue candidate exactly as the durable run stores it. */
const candidate = (support: readonly number[], banana: number): RecipeInput => {
  const items = [
    line(OWNER_LINE_IDS.milk, IDS.milk, support[0]!),
    line(OWNER_LINE_IDS.cream, IDS.cream, support[1]!),
    line(OWNER_LINE_IDS.smp, IDS.smp, support[2]!),
    line(OWNER_LINE_IDS.sucrose, IDS.sucrose, support[3]!),
    line(OWNER_LINE_IDS.dextrose, IDS.dextrose, support[4]!),
    line(OWNER_LINE_IDS.tara, IDS.tara, support[5]!),
    line(OWNER_LINE_IDS.banana, IDS.banana, banana, 'main'),
  ];
  const total = items.reduce((sum, item) => sum + item.planned_grams, 0);
  return {
    mode: 'classic',
    category: 'milk_gelato',
    target_batch_grams: total,
    target_temperature_c: -11,
    machine_capacity_grams: null,
    items,
  } as unknown as RecipeInput;
};

/** What Rescue stored. */
const STORED = candidate(OWNER_RESCUE_GRAMS.slice(0, 6), OWNER_BANANA_PHYSICAL_G);
/** The same intent without the 0.1 g the rounding gives away. */
const EXACT = candidate([492.2, 129.95, 46, 69, 63.25, 4.6], 345);
/** Immutable 1,000 g source plan for the owner run. */
const ORIGINAL = candidate(OWNER_PLANNED_GRAMS.slice(0, 6), OWNER_PLANNED_GRAMS[6]);

/**
 * The published `main-banana-fresh-dairy` v2 policy, copied from the durable
 * run's own `rescue_product_composition.behaviorSnapshots['line-mtn5pdnv-1']`.
 * The generic test fixture resolves BANANA with `hardLimitPercent: null`, which
 * cannot express the limit this defect turns on.
 */
const BANANA_POLICY = OWNER_BANANA_MAIN_POLICY;

const snapshotsFor = (input: RecipeInput): Record<string, ProductBehaviorSnapshot> => {
  const base = productBehaviorTestSnapshots(input) as Record<string, ProductBehaviorSnapshot>;
  return {
    ...base,
    'new-recipe-0-milk_3_5': {
      ...base['new-recipe-0-milk_3_5'],
      approvedLiquidDairyCarrier: true,
    } as ProductBehaviorSnapshot,
    'line-mtn5pdnv-1': {
      ...base['line-mtn5pdnv-1'],
      ...BANANA_POLICY,
    } as ProductBehaviorSnapshot,
  } as Record<string, ProductBehaviorSnapshot>;
};

const violationCodes = (input: RecipeInput): string[] => {
  const verdict = verifyMainEnvelope({
    recipe: input,
    snapshots: snapshotsFor(input),
    mode: 'optimal',
  });
  return verdict.ok ? [] : verdict.violations.map((violation) => violation.code);
};

const sessionFor = (input: RecipeInput) =>
  createProductionSession({
    sessionId: 'owner-repro-2fc85403',
    ownerUserId: 'owner-1',
    source: {
      recipeId: 'recipe-1',
      recipeVersionId: 'version-1',
      recipeVersionNumber: 1,
      recipeName: 'QA RESCUE COMPLETE BANANA',
    },
    plannedInput: input,
    plannedComposition: {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: input.items.map((item) => item.id),
      toppings: [],
      behaviorSnapshots: snapshotsFor(input),
      migrationAmbiguities: [],
    },
    startedAt: '2026-09-04T16:18:36.000Z',
  } as unknown as Parameters<typeof createProductionSession>[0]);

describe('rescued Production run is written in a state its own recovery refuses', () => {
  it('the stored candidate puts BANANA over its own hard limit by rounding alone', () => {
    const banana = STORED.items.find((item) => item.id === 'line-mtn5pdnv-1')!;
    const total = STORED.items.reduce((sum, item) => sum + item.planned_grams, 0);
    expect(total).toBeCloseTo(1149.9, 6);
    // 30.0026 % — over 30 % by 0.0026 pp, which is 0.03 g of BANANA.
    expect((banana.planned_grams / total) * 100).toBeGreaterThan(30);
    expect((banana.planned_grams / total) * 100).toBeLessThan(30.01);
  });

  it('the Main envelope — the authority hydration uses — REFUSES the stored candidate', () => {
    expect(violationCodes(STORED)).toContain('main_above_hard_limit');
  });

  it('the 0.1 g the rounding gave away is the whole difference', () => {
    expect(violationCodes(EXACT)).not.toContain('main_above_hard_limit');
  });

  it('names the EXACT exception the durable-recovery catch swallows', () => {
    // This is the call `applyVerifiedRescueInput` makes, and the message it
    // throws is what the UI replaces with „Nie udało się połączyć bieżącej
    // partii z jej zapisem."
    const authority = evaluateRecipeConstraintAuthority({
      recipe: STORED,
      snapshots: snapshotsFor(STORED),
      module: 'BATCH_RESCUE',
    });
    expect(authority.valid).toBe(false);
    const thrown =
      authority.issues[0]?.messagePl ??
      'Production Rescue requires a fully verified recipe candidate.';
    expect(thrown).toBe('Grupa Main przekracza twardy limit 30.0%.');
  });

  it('the gate the rescue candidate loop actually uses does NOT see the violation', () => {
    // This is the inconsistency: build time says safe, recovery says refused.
    const assessment = assessProductionHardSafety(STORED, calculateRecipe(STORED));
    expect(assessment.violationMetrics).toEqual([]);
    expect(assessment.capacityExceeded).toBe(false);
  });

  describe('terminal authority and invalid durable recovery', () => {
    it('a NEW rescue carrying the over-limit candidate is still refused', () => {
      expect(() => applyVerifiedRescueInput(sessionFor(STORED), STORED, 1)).toThrow(
        'Grupa Main przekracza twardy limit 30.0%.',
      );
    });

    it('does not expose a bypass that can apply the invalid durable vector', () => {
      expect(applyVerifiedRescueInput).toHaveLength(2);
      const legacyBypassCall = applyVerifiedRescueInput as unknown as (
        session: ReturnType<typeof sessionFor>,
        candidate: RecipeInput,
        revision: number,
        options: { alreadyAuthorized: boolean },
      ) => unknown;
      expect(() =>
        legacyBypassCall(sessionFor(STORED), STORED, 1, {
          alreadyAuthorized: true,
        }),
      ).toThrow('Grupa Main przekracza twardy limit 30.0%.');
    });

    it('recovers the stuck run from immutable plan + physical facts and searches past 1149.9 g', async () => {
      const composition: RecipeCompositionMetadata = {
        schemaVersion: 1,
        baseScope: 'BASE_FORMULATION',
        baseOrder: ORIGINAL.items.map((item) => item.id),
        toppings: [],
        behaviorSnapshots: snapshotsFor(ORIGINAL),
        migrationAmbiguities: [],
      };
      const run = {
        runId: OWNER_RUN_ID,
        ownerUserId: 'owner-1',
        recipeId: 'recipe-1',
        recipeVersionId: 'version-1',
        recipeVersionNumber: 1,
        status: 'in_progress',
        plannedBatchG: 1_000,
        plannedItems: ORIGINAL.items.map((item, index) => ({
          id: item.id,
          name: item.ingredient.name,
          canonicalIngredientId: item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
          processScope: 'BASE_FORMULATION',
          scopePosition: index,
          plannedGrams: item.planned_grams,
          displayGrams: item.planned_grams,
        })),
        productProfile: ORIGINAL.category,
        temperatureC: ORIGINAL.target_temperature_c,
        engineVersion: '0.4.0',
        configVersion: '0.7.0',
        mapperDatasetVersion: null,
        plannedDate: null,
        machine: null,
        location: null,
        batchReference: null,
        notes: null,
        createdBy: 'owner-1',
        createdAt: '2026-09-04T16:18:36.000Z',
        updatedAt: '2026-09-04T16:19:04.947Z',
        actual: {
          items: ORIGINAL.items.map((item, index) => ({
            id: item.id,
            name: item.ingredient.name,
            actualGrams: item.id === 'line-mtn5pdnv-1' ? 345 : item.planned_grams,
            confirmedAt: `2026-09-04T16:18:${String(40 + index).padStart(2, '0')}.000Z`,
            confirmationOrder: index + 1,
          })),
          actualTotalMixG: 1_045,
          actualYieldG: null,
          wasteG: null,
          substitutions: [],
          operatorNotes: null,
          deviationReason: null,
          recordedBy: 'owner-1',
          recordedAt: '2026-09-04T16:19:00.000Z',
          revision: 8,
        },
        rescue: {
          recipeInput: STORED,
          productComposition: { ...composition, behaviorSnapshots: snapshotsFor(STORED) },
          acceptedBy: 'owner-1',
          acceptedAt: '2026-09-04T16:19:04.947Z',
          revision: 1,
        },
        completedAt: null,
        cancelledAt: null,
        events: [
          {
            eventId: 'event-started',
            type: 'started',
            at: '2026-09-04T16:18:36.000Z',
            by: 'owner-1',
            detail: null,
            amendment: null,
          },
          {
            eventId: 'event-invalid-rescue-decision',
            type: 'deviation_decision_accepted',
            at: '2026-09-04T16:19:04.947Z',
            by: 'owner-1',
            detail: null,
            amendment: {
              stableOptionId: 'restore_original_recipe',
              sourceActualRevision: 8,
              rescueRevision: 1,
              finalMassG: 1149.9,
              scoreDisplay: '10/10',
            },
          },
        ],
      } as unknown as ProductionRun;

      const recovered = hydrateProductionSessionFromRun(
        run,
        {
          recipeId: 'recipe-1',
          recipeVersionId: 'version-1',
          recipeVersionNumber: 1,
          recipeName: 'QA RESCUE COMPLETE BANANA',
        },
        ORIGINAL,
        composition,
      );
      const banana = recovered.lines.find((line) => line.lineId === 'line-mtn5pdnv-1')!;
      expect(recovered.invalidDurableRescue).toMatchObject({
        revision: 1,
        issueCodes: expect.arrayContaining(['main_above_hard_limit']),
      });
      expect(recovered.supersededRescue).toMatchObject({
        revision: 1,
        reasonPl: 'Grupa Main przekracza twardy limit 30.0%.',
      });
      expect(recovered.durableRescueRevision).toBe(1);
      expect(recovered.lastDeviationDecision).toBeNull();
      expect(banana.targetGrams).toBe(300);
      expect(banana.physicalAddedGrams).toBe(345);
      expect(recovered.topUpTasks).toEqual([]);

      const assessment = assessProductionRescue(recovered);
      const restore = assessment.options.find((option) => option.id === 'restore_original_recipe');
      expect(restore?.finalMassG).toBe(1150.1);
      expect(restore?.instructions.every((instruction) => instruction.kind === 'add')).toBe(true);
      expect(
        evaluateRecipeConstraintAuthority({
          recipe: restore!.candidateInput,
          snapshots: recovered.plannedComposition.behaviorSnapshots ?? {},
          module: 'BATCH_RESCUE',
        }).valid,
      ).toBe(true);

      let edgePersisted: PersistTrustedAuthorizationInput | null = null;
      const edgeContext: TrustedRescueContext = {
        recipeTitle: recovered.source.recipeName,
        run: {
          id: run.runId,
          owner_user_id: run.ownerUserId,
          recipe_id: run.recipeId,
          recipe_version_id: run.recipeVersionId,
          recipe_version_number: run.recipeVersionNumber,
          status: run.status,
          planned_batch_g: run.plannedBatchG,
          product_profile: run.productProfile,
          temperature_c: run.temperatureC,
          engine_version: run.engineVersion,
          config_version: run.configVersion,
          mapper_dataset_version: run.mapperDatasetVersion,
          planned_date: run.plannedDate,
          machine: run.machine,
          location: run.location,
          batch_reference: run.batchReference,
          notes: run.notes,
          created_by: run.createdBy,
          created_at: run.createdAt,
          updated_at: run.updatedAt,
          completed_at: run.completedAt,
          cancelled_at: run.cancelledAt,
          rescue_recipe_input: STORED as unknown as Record<string, unknown>,
          rescue_product_composition: {
            ...composition,
            behaviorSnapshots: snapshotsFor(STORED),
          } as unknown as Record<string, unknown>,
          rescue_accepted_by: run.ownerUserId,
          rescue_accepted_at: run.rescue!.acceptedAt,
          rescue_revision: 1,
          actual_revision: 8,
        },
        version: {
          id: run.recipeVersionId,
          recipe_id: run.recipeId,
          owner_user_id: run.ownerUserId,
          version_number: run.recipeVersionNumber,
          recipe_input: ORIGINAL as unknown as Record<string, unknown>,
          product_composition: composition as unknown as Record<string, unknown>,
          total_batch_g: 1_000,
          product_profile: ORIGINAL.category,
          temperature_c: ORIGINAL.target_temperature_c,
          engine_version: run.engineVersion,
          config_version: run.configVersion,
          mapper_dataset_version: null,
          source: 'manual',
          created_by: run.ownerUserId,
          created_at: run.createdAt,
          restored_from_version: null,
          note: null,
        },
        planned: run.plannedItems.map((item, position) => ({
          line_id: item.id,
          name: item.name,
          canonical_ingredient_id: item.canonicalIngredientId,
          planned_grams: item.plannedGrams,
          display_grams: item.displayGrams,
          position,
          process_scope: item.processScope,
          scope_position: item.scopePosition,
        })),
        actual: {
          actual_items: run.actual!.items,
          substitutions: [],
          actual_total_mix_g: 1_045,
          actual_yield_g: null,
          waste_g: null,
          operator_notes: null,
          deviation_reason: null,
          recorded_by: run.ownerUserId,
          recorded_at: run.actual!.recordedAt,
        },
        events: run.events.map((event) => ({
          id: event.eventId,
          event_type: event.type,
          detail: event.detail,
          amendment: event.amendment,
          created_by: event.by,
          created_at: event.at,
        })),
      };
      const bundleSha = (
        JSON.parse(
          readFileSync(
            resolve(
              process.cwd(),
              'supabase/functions/_shared/generated/productionRescueEngine.manifest.json',
            ),
            'utf8',
          ),
        ) as { bundle: { sha256: string } }
      ).bundle.sha256;
      const edgeResult = await authorizeTrustedProductionRescue(
        run.ownerUserId,
        {
          runId: run.runId,
          stableOptionId: 'restore_original_recipe',
          expectedActualRevision: 8,
          expectedRescueRevision: 1,
          idempotencyKey: 'owner-banana-rescue-revision-2',
          expectedEngineBundleSha256: bundleSha,
        },
        {
          loadContext: async () => edgeContext,
          persistAuthorization: async (input) => {
            edgePersisted = input;
            return {
              authorizationId: 'authorization-owner-banana-revision-2',
              runId: input.runId,
              stableOptionId: input.stableOptionId,
              expectedActualRevision: input.expectedActualRevision,
              expectedRescueRevision: input.expectedRescueRevision,
              candidateFingerprint: input.candidateFingerprint,
              authorizedAt: '2026-09-04T16:24:00.000Z',
              expiresAt: '2026-09-04T16:29:00.000Z',
              safeMetadata: input.safeMetadata,
            };
          },
        },
      );
      expect(edgeResult.preview.finalMassG).toBe(1150.1);
      expect(edgePersisted).not.toBeNull();
      expect(
        evaluateRecipeConstraintAuthority({
          recipe: edgePersisted!.recipeInput as unknown as RecipeInput,
          snapshots: snapshotsFor(ORIGINAL),
          module: 'BATCH_RESCUE',
        }).valid,
      ).toBe(true);

      const repairedRun = {
        ...run,
        updatedAt: '2026-09-04T16:25:00.000Z',
        rescue: {
          recipeInput: restore!.candidateInput,
          productComposition: {
            ...composition,
            baseOrder: restore!.candidateInput.items.map((item) => item.id),
            behaviorSnapshots: snapshotsFor(restore!.candidateInput),
          },
          acceptedBy: 'owner-1',
          acceptedAt: '2026-09-04T16:25:00.000Z',
          revision: 2,
        },
        events: [
          ...run.events,
          {
            eventId: 'event-valid-rescue-decision',
            type: 'deviation_decision_accepted' as const,
            at: '2026-09-04T16:25:00.000Z',
            by: 'owner-1',
            detail: null,
            amendment: {
              stableOptionId: 'restore_original_recipe',
              sourceActualRevision: 8,
              rescueRevision: 2,
              finalMassG: restore!.finalMassG,
              scoreDisplay: restore!.scoreDisplay,
            },
          },
        ],
      } as ProductionRun;
      const superseded = hydrateProductionSessionFromRun(
        repairedRun,
        recovered.source,
        ORIGINAL,
        composition,
      );
      expect(superseded.invalidDurableRescue).toBeNull();
      expect(superseded.supersededRescue).toBeNull();
      expect(superseded.durableRescueRevision).toBe(2);
      expect(superseded.lastDeviationDecision).toMatchObject({
        strategy: 'restore_original_recipe',
        rescueRevision: 2,
      });
      expect(superseded.topUpTasks.length).toBeGreaterThan(0);
      expect(
        superseded.topUpTasks.every(
          (task) => task.cumulativeTargetG === task.physicalBaselineG + task.authorizedDeltaG,
        ),
      ).toBe(true);
    });
  });
});
