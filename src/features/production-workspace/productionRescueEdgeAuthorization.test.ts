/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import type { RecipeInput } from '@/engine';
import {
  RescueAuthorizationError,
  authorizeTrustedProductionRescue,
  parseAuthorizeRescueRequest,
  rescuePersistenceErrorForMessage,
  sha256Hex,
  stableCanonicalJson,
  type AuthorizeRescueRequest,
  type PersistTrustedAuthorizationInput,
  type TrustedRescueContext,
} from '../../../supabase/functions/production-rescue-authorize/logic';
import {
  productionTestBehaviorSnapshots,
  productionTestComposition,
} from './productionTestComposition.fixture';
import { OWNER_RESCUE_RECIPE } from './productionOwnerRescue.fixture';

const OWNER = '11111111-1111-4111-8111-111111111111';
const RUN = '22222222-2222-4222-8222-222222222222';
const RECIPE = '33333333-3333-4333-8333-333333333333';
const VERSION = '44444444-4444-4444-8444-444444444444';
const AUTHORIZATION = '55555555-5555-4555-8555-555555555555';
const CURRENT_BUNDLE_SHA256 = (
  JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        'supabase/functions/_shared/generated/productionRescueEngine.manifest.json',
      ),
      'utf8',
    ),
  ) as { bundle: { sha256: string } }
).bundle.sha256;

type BundleBoundAuthorizeRescueRequest = AuthorizeRescueRequest & {
  expectedEngineBundleSha256: string;
};

const request = (
  patch: Partial<BundleBoundAuthorizeRescueRequest> = {},
): BundleBoundAuthorizeRescueRequest => ({
  runId: RUN,
  stableOptionId: 'enlarge_batch',
  expectedActualRevision: 1,
  expectedRescueRevision: 0,
  idempotencyKey: 'rescue-idempotency-0001',
  expectedEngineBundleSha256: CURRENT_BUNDLE_SHA256,
  ...patch,
});

function context(): TrustedRescueContext {
  const recipeInput: RecipeInput = {
    items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
    mode: 'classic',
    category: DEFAULT_PRESET.category,
    target_temperature_c: DEFAULT_PRESET.target_temperature_c,
    target_batch_grams: DEFAULT_PRESET.target_batch_grams,
    machine_capacity_grams: null,
  };
  // Was `{ schemaVersion: 1, lineId }` — a stub with no `moduleEligibility`, so
  // the canonical terminal authority could not read module eligibility at all.
  // Production always persists complete snapshots (see the owner specimen in
  // `reports/production-rescue/OWNER_REPRO_2fc85403.md`).
  const behaviorSnapshots = productionTestBehaviorSnapshots(recipeInput);
  const sucrose = recipeInput.items.find((item) =>
    item.ingredient.name.toLowerCase().includes('sucrose'),
  )!;
  return {
    recipeTitle: 'Milk base',
    run: {
      id: RUN,
      owner_user_id: OWNER,
      recipe_id: RECIPE,
      recipe_version_id: VERSION,
      recipe_version_number: 1,
      status: 'in_progress',
      planned_batch_g: recipeInput.target_batch_grams,
      product_profile: recipeInput.category,
      temperature_c: recipeInput.target_temperature_c,
      engine_version: '0.4.0',
      config_version: '0.7.0',
      mapper_dataset_version: null,
      planned_date: null,
      machine: null,
      location: null,
      batch_reference: null,
      notes: null,
      created_by: OWNER,
      created_at: '2026-08-19T00:00:00.000Z',
      updated_at: '2026-08-19T00:01:00.000Z',
      completed_at: null,
      cancelled_at: null,
      rescue_recipe_input: null,
      rescue_product_composition: null,
      rescue_accepted_by: null,
      rescue_accepted_at: null,
      rescue_revision: 0,
      actual_revision: 1,
    },
    version: {
      id: VERSION,
      recipe_id: RECIPE,
      owner_user_id: OWNER,
      version_number: 1,
      recipe_input: recipeInput as unknown as Record<string, unknown>,
      product_composition: {
        schemaVersion: 1,
        baseScope: 'BASE_FORMULATION',
        baseOrder: recipeInput.items.map((item) => item.id),
        toppings: [],
        behaviorSnapshots,
        migrationAmbiguities: [],
      },
      total_batch_g: recipeInput.target_batch_grams,
      product_profile: recipeInput.category,
      temperature_c: recipeInput.target_temperature_c,
      engine_version: '0.4.0',
      config_version: '0.7.0',
      mapper_dataset_version: null,
      source: 'manual',
      created_by: OWNER,
      created_at: '2026-08-19T00:00:00.000Z',
      restored_from_version: null,
      note: null,
    },
    planned: recipeInput.items.map((item, position) => ({
      line_id: item.id,
      name: item.ingredient.name,
      canonical_ingredient_id: item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
      planned_grams: item.planned_grams,
      display_grams: item.planned_grams,
      position,
      process_scope: 'BASE_FORMULATION',
      scope_position: position,
    })),
    actual: {
      actual_items: recipeInput.items.map((item) => ({
        id: item.id,
        name: item.ingredient.name,
        actualGrams: item.id === sucrose.id ? 180 : null,
        confirmedAt: item.id === sucrose.id ? '2026-08-19T00:01:00.000Z' : null,
        confirmationOrder: item.id === sucrose.id ? 1 : null,
      })),
      substitutions: [],
      actual_total_mix_g: 180,
      actual_yield_g: null,
      waste_g: null,
      operator_notes: null,
      deviation_reason: null,
      recorded_by: OWNER,
      recorded_at: '2026-08-19T00:01:00.000Z',
    },
    events: [
      {
        id: '66666666-6666-4666-8666-666666666666',
        event_type: 'started',
        detail: null,
        amendment: null,
        created_by: OWNER,
        created_at: '2026-08-19T00:00:00.000Z',
      },
    ],
  };
}

function stabilizerDeviationContext(actualStabilizerG = 3.1): TrustedRescueContext {
  const source = context();
  const recipeInput = structuredClone(source.version.recipe_input) as unknown as RecipeInput;
  const stabilizer = recipeInput.items.find((item) =>
    item.ingredient.name.toLowerCase().includes('tara'),
  )!;
  const milk = recipeInput.items.find((item) =>
    item.ingredient.name.toLowerCase().includes('milk 3.5'),
  )!;
  stabilizer.planned_grams = 3;
  milk.planned_grams += 2;
  source.version.recipe_input = recipeInput as unknown as Record<string, unknown>;
  source.planned = source.planned.map((line) => {
    const recipeLine = recipeInput.items.find((item) => item.id === line.line_id)!;
    return {
      ...line,
      planned_grams: recipeLine.planned_grams,
      display_grams: recipeLine.planned_grams,
    };
  });
  source.actual = {
    ...source.actual!,
    actual_items: recipeInput.items.map((item, index) => ({
      id: item.id,
      name: item.ingredient.name,
      actualGrams: item.id === stabilizer.id ? actualStabilizerG : item.planned_grams,
      confirmedAt: `2026-08-19T00:${String(index + 1).padStart(2, '0')}:00.000Z`,
      confirmationOrder: index + 1,
    })),
    actual_total_mix_g: 1_000 + actualStabilizerG - 3,
  };
  return source;
}

function ownerRescueContext(
  actualByLineId: Readonly<Record<string, number>>,
): TrustedRescueContext {
  const source = context();
  const recipeInput = structuredClone(OWNER_RESCUE_RECIPE);
  source.recipeTitle = 'Owner strawberry watermelon gelato';
  source.run.planned_batch_g = 670;
  source.run.product_profile = recipeInput.category;
  source.run.temperature_c = recipeInput.target_temperature_c;
  source.version.recipe_input = recipeInput as unknown as Record<string, unknown>;
  source.version.product_composition = productionTestComposition(recipeInput) as unknown as Record<
    string,
    unknown
  >;
  source.version.total_batch_g = 670;
  source.version.product_profile = recipeInput.category;
  source.version.temperature_c = recipeInput.target_temperature_c;
  source.planned = recipeInput.items.map((item, position) => ({
    line_id: item.id,
    name: item.ingredient.name,
    canonical_ingredient_id: item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
    planned_grams: item.planned_grams,
    display_grams: item.planned_grams,
    position,
    process_scope: 'BASE_FORMULATION',
    scope_position: position,
  }));
  const confirmed = recipeInput.items.filter((item) => actualByLineId[item.id] !== undefined);
  source.actual = {
    ...source.actual!,
    actual_items: recipeInput.items.map((item) => {
      const position = confirmed.findIndex((candidate) => candidate.id === item.id);
      const actualGrams = actualByLineId[item.id] ?? null;
      return {
        id: item.id,
        name: item.ingredient.name,
        actualGrams,
        confirmedAt:
          position >= 0 ? `2026-09-05T10:${String(position + 1).padStart(2, '0')}:00.000Z` : null,
        confirmationOrder: position >= 0 ? position + 1 : null,
      };
    }),
    actual_total_mix_g: confirmed.reduce((sum, item) => sum + (actualByLineId[item.id] ?? 0), 0),
  };
  return source;
}

const dependencies = (
  source = context(),
  onPersist: (input: PersistTrustedAuthorizationInput) => void = () => undefined,
) => ({
  loadContext: vi.fn(async () => source),
  persistAuthorization: vi.fn(async (input: PersistTrustedAuthorizationInput) => {
    onPersist(input);
    return {
      authorizationId: AUTHORIZATION,
      runId: input.runId,
      stableOptionId: input.stableOptionId,
      expectedActualRevision: input.expectedActualRevision,
      expectedRescueRevision: input.expectedRescueRevision,
      candidateFingerprint: input.candidateFingerprint,
      authorizedAt: '2026-08-19T00:02:00.000Z',
      expiresAt: '2026-08-19T00:07:00.000Z',
      safeMetadata: input.safeMetadata,
    };
  }),
});

describe('Production Rescue Edge request boundary', () => {
  it('accepts only the six authority fields including the browser bundle identity', () => {
    expect(parseAuthorizeRescueRequest(request())).toEqual(request());
  });

  it.each([
    'recipeInput',
    'candidateIngredients',
    'candidateGrams',
    'candidateFingerprint',
    'userId',
  ])('rejects browser field %s', (field) => {
    expect(() => parseAuthorizeRescueRequest({ ...request(), [field]: {} })).toThrowError(
      'unexpected_request_field',
    );
  });

  it('rejects an unknown stable option', () => {
    expect(() =>
      parseAuthorizeRescueRequest({ ...request(), stableOptionId: 'hidden-grams:123' }),
    ).toThrowError('unknown_stable_option');
  });

  it('rejects negative/non-integer revisions', () => {
    expect(() =>
      parseAuthorizeRescueRequest({ ...request(), expectedActualRevision: -1 }),
    ).toThrowError('invalid_actual_revision');
    expect(() =>
      parseAuthorizeRescueRequest({ ...request(), expectedRescueRevision: 0.5 }),
    ).toThrowError('invalid_rescue_revision');
  });

  it('rejects weak or unbounded idempotency keys', () => {
    expect(() => parseAuthorizeRescueRequest({ ...request(), idempotencyKey: 'short' })).toThrow();
    expect(() =>
      parseAuthorizeRescueRequest({ ...request(), idempotencyKey: 'x'.repeat(129) }),
    ).toThrow();
  });

  it('rejects an invalid Engine bundle identity', () => {
    expect(() =>
      parseAuthorizeRescueRequest({ ...request(), expectedEngineBundleSha256: 'stale' }),
    ).toThrowError('invalid_engine_bundle_sha256');
  });

  it('maps the database statement deadline to the exact safe timeout state', () => {
    expect(
      rescuePersistenceErrorForMessage('canceling statement due to statement timeout'),
    ).toMatchObject({ code: 'product_behavior_timeout', status: 504 });
  });
});

describe('trusted Production Rescue authorization', () => {
  it('fails closed before loading Production state when browser and Edge bundles differ', async () => {
    const deps = dependencies();
    await expect(
      authorizeTrustedProductionRescue(
        OWNER,
        request({ expectedEngineBundleSha256: '0'.repeat(64) }),
        deps,
      ),
    ).rejects.toMatchObject({ code: 'engine_bundle_mismatch', status: 409 });
    expect(deps.loadContext).not.toHaveBeenCalled();
    expect(deps.persistAuthorization).not.toHaveBeenCalled();
  });

  it('authorizes both truthful continuation and proportional restore for TARA 3.0 → 3.1 g', async () => {
    let continued: PersistTrustedAuthorizationInput | null = null;
    const continuation = await authorizeTrustedProductionRescue(
      OWNER,
      request({ stableOptionId: 'leave_as_is' }),
      dependencies(stabilizerDeviationContext(), (input) => {
        continued = input;
      }),
    );
    expect(continuation.preview.finalMassG).toBeCloseTo(1_000.1, 9);
    expect(continued!.recipeInput.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.stringContaining('tara_gum'), planned_grams: 3.1 }),
      ]),
    );

    let restored: PersistTrustedAuthorizationInput | null = null;
    const restore = await authorizeTrustedProductionRescue(
      OWNER,
      request({ stableOptionId: 'restore_original_recipe' }),
      dependencies(stabilizerDeviationContext(), (input) => {
        restored = input;
      }),
    );
    expect(restore.preview.finalMassG).toBeCloseTo(1_033.3, 9);
    expect(restored!.recipeInput.target_batch_grams).toBeCloseTo(1_033.3, 9);
    expect(restored!.recipeInput.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.stringContaining('tara_gum'), planned_grams: 3.1 }),
      ]),
    );
  });

  it('returns the exact irreducible lactose proof for Owner Case 1', async () => {
    const source = ownerRescueContext({ milk: 201, cream: 125, skimmed_milk: 55 });
    await expect(
      authorizeTrustedProductionRescue(
        OWNER,
        request({ stableOptionId: 'keep_original_batch' }),
        dependencies(source),
      ),
    ).rejects.toMatchObject({
      code: 'stable_rescue_option_stale',
      details: {
        reason: 'confirmed_physical_floor_above_hard_limit',
        diagnostics: {
          physicalConfirmedG: 381,
          forecastMassG: 675,
          originalTargetG: 670,
          machineCapacityG: 670,
          fixedTargetRebalance: expect.objectContaining({ candidateMassG: 670 }),
          irreducibleConfirmedViolations: [
            expect.objectContaining({
              metric: 'lactose',
              direction: 'high',
              value: expect.closeTo(6.1935820896, 9),
              max: 6,
              basis: 'confirmed_physical_floor_at_target',
            }),
          ],
        },
      },
    });
  });

  it('authorizes the exact 91.9 g + 91.9 g remaining plan for Owner Case 2', async () => {
    const source = ownerRescueContext({
      milk: 201,
      cream: 125,
      skimmed_milk: 50,
      sucrose: 31,
      dextrose: 77,
      tara: 2.2,
    });
    const result = await authorizeTrustedProductionRescue(
      OWNER,
      request({ stableOptionId: 'keep_original_batch' }),
      dependencies(source),
    );

    expect(result.preview.finalMassG).toBe(670);
    expect(result.preview.instructions).toEqual([
      expect.objectContaining({
        lineId: 'strawberries',
        kind: 'reduce_pending_plan',
        finalTargetGrams: 91.9,
      }),
      expect.objectContaining({
        lineId: 'watermelon',
        kind: 'reduce_pending_plan',
        finalTargetGrams: 91.9,
      }),
    ]);
  });

  it('returns the exact physical machine-capacity proof for Owner Case 3', async () => {
    const source = ownerRescueContext({
      milk: 201,
      cream: 125,
      skimmed_milk: 50,
      sucrose: 31,
      dextrose: 77,
      tara: 2,
      strawberries: 92,
      watermelon: 98,
    });
    await expect(
      authorizeTrustedProductionRescue(
        OWNER,
        request({ stableOptionId: 'leave_as_is' }),
        dependencies(source),
      ),
    ).rejects.toMatchObject({
      code: 'stable_rescue_option_stale',
      details: {
        reason: 'machine_capacity_exceeded',
        diagnostics: expect.objectContaining({
          physicalConfirmedG: 676,
          forecastMassG: 676,
          originalTargetG: 670,
          machineCapacityG: 670,
        }),
      },
    });
  });

  it('executes the canonical Engine option and persists only scale-supported 0.1 g values', async () => {
    let persisted: PersistTrustedAuthorizationInput | null = null;
    const result = await authorizeTrustedProductionRescue(
      OWNER,
      request(),
      dependencies(context(), (input) => {
        persisted = input;
      }),
    );
    expect(result.preview.scoreDisplay).toBe('10/10');
    expect(result.preview.finalMassG).toBe(1236.2);
    expect(result.candidateFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(persisted).not.toBeNull();
    expect(persisted!.recipeInput.items).toSatisfy((items: unknown[]) =>
      items.every((item) => {
        const tenths = (item as { planned_grams: number }).planned_grams * 10;
        return Number.isInteger(tenths);
      }),
    );
  });

  it('regenerates and selects only the requested stable option', async () => {
    const result = await authorizeTrustedProductionRescue(OWNER, request(), dependencies());
    expect(result.stableOptionId).toBe('enlarge_batch');
    // §16/§17 — the trusted preview names the exact verified batch, never a
    // generic direction and never a tidied-up round number.
    expect(result.preview.title).toBe(
      `Minimalna bezpieczna korekta · ${result.preview.finalMassG.toFixed(1)} g`,
    );
  });

  it('rejects a no-longer-available stable option without storing authorization', async () => {
    const deps = dependencies();
    await expect(
      authorizeTrustedProductionRescue(OWNER, request({ stableOptionId: 'leave_as_is' }), deps),
    ).rejects.toMatchObject({
      code: 'stable_rescue_option_stale',
      details: {
        stableOptionId: 'leave_as_is',
        reason: 'hard_safety_violations',
        violationMetrics: expect.arrayContaining([expect.any(String)]),
        diagnostics: expect.objectContaining({
          physicalConfirmedG: 180,
          originalTargetG: 1_000,
          machineCapacityG: null,
          forecastViolationDetails: expect.any(Array),
        }),
      },
    });
    expect(deps.persistAuthorization).not.toHaveBeenCalled();
  });

  it('rejects stale actual revision before Engine/persistence', async () => {
    const deps = dependencies();
    await expect(
      authorizeTrustedProductionRescue(OWNER, request({ expectedActualRevision: 0 }), deps),
    ).rejects.toMatchObject({ code: 'stale_actual_revision' });
    expect(deps.persistAuthorization).not.toHaveBeenCalled();
  });

  it('rejects stale Rescue revision before Engine/persistence', async () => {
    const deps = dependencies();
    await expect(
      authorizeTrustedProductionRescue(OWNER, request({ expectedRescueRevision: 1 }), deps),
    ).rejects.toMatchObject({ code: 'stale_rescue_revision' });
    expect(deps.persistAuthorization).not.toHaveBeenCalled();
  });

  it('rejects cross-account runs', async () => {
    const source = context();
    source.run.owner_user_id = '77777777-7777-4777-8777-777777777777';
    await expect(
      authorizeTrustedProductionRescue(OWNER, request(), dependencies(source)),
    ).rejects.toMatchObject({ code: 'production_run_not_owned' });
  });

  it('rejects missing runs', async () => {
    await expect(
      authorizeTrustedProductionRescue(OWNER, request(), {
        loadContext: async () => null,
        persistAuthorization: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: 'production_run_not_found' });
  });

  it('fails closed for run Engine/config drift', async () => {
    const source = context();
    source.run.config_version = '0.6.0';
    await expect(
      authorizeTrustedProductionRescue(OWNER, request(), dependencies(source)),
    ).rejects.toMatchObject({ code: 'production_engine_version_stale' });
  });

  it('fails closed before storage when ProductBehavior persistence rejects', async () => {
    const deps = dependencies();
    deps.persistAuthorization.mockRejectedValueOnce(
      new RescueAuthorizationError('trusted_rescue_validation_failed', 409),
    );
    await expect(authorizeTrustedProductionRescue(OWNER, request(), deps)).rejects.toMatchObject({
      code: 'trusted_rescue_validation_failed',
    });
    expect(deps.persistAuthorization).toHaveBeenCalledTimes(1);
  });

  it('fails closed before a result on ProductBehavior timeout', async () => {
    const deps = dependencies();
    deps.persistAuthorization.mockRejectedValueOnce(
      new RescueAuthorizationError('product_behavior_timeout', 504),
    );
    await expect(authorizeTrustedProductionRescue(OWNER, request(), deps)).rejects.toMatchObject({
      code: 'product_behavior_timeout',
    });
  });

  it('records every runtime/config/bundle identity in the trusted proof', async () => {
    let persisted: PersistTrustedAuthorizationInput | null = null;
    await authorizeTrustedProductionRescue(
      OWNER,
      request(),
      dependencies(context(), (input) => {
        persisted = input;
      }),
    );
    expect(persisted).toMatchObject({
      engineVersion: '0.4.0',
      configVersion: '0.7.0',
      practicalRecipeVersion: 'pro-whole-gram-v1',
      rescueModelVersion: 'production-rescue-v7',
      bundlerVersion: '1.0.3',
      ttlSeconds: 300,
    });
    expect(persisted!.engineBundleSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(persisted!.sourceClosureSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never auto-adds canonical Fructose', async () => {
    let persisted: PersistTrustedAuthorizationInput | null = null;
    await authorizeTrustedProductionRescue(
      OWNER,
      request(),
      dependencies(context(), (input) => {
        persisted = input;
      }),
    );
    const persistedItems = persisted!.recipeInput.items as Array<Record<string, unknown>>;
    expect(
      persistedItems.some((item) => {
        const ingredient = item.ingredient as Record<string, unknown>;
        return (ingredient.canonical_ingredient_id ?? ingredient.id) === 'PI-ING-000496';
      }),
    ).toBe(false);
  });

  it('returns no candidate vector, ProductBehavior facts or private proof fields', async () => {
    const result = await authorizeTrustedProductionRescue(OWNER, request(), dependencies());
    expect(result).not.toHaveProperty('recipeInput');
    expect(result).not.toHaveProperty('productComposition');
    expect(result).not.toHaveProperty('requestFingerprint');
    expect(result.preview).not.toHaveProperty('recipeInput');
  });

  it('returns the same authorization on an idempotent lost-response retry', async () => {
    const deps = dependencies();
    const first = await authorizeTrustedProductionRescue(OWNER, request(), deps);
    const retry = await authorizeTrustedProductionRescue(OWNER, request(), deps);
    expect(retry).toEqual(first);
  });

  it('keeps the same proof after its rescue-preview audit event is appended', async () => {
    let firstProof: PersistTrustedAuthorizationInput | null = null;
    await authorizeTrustedProductionRescue(
      OWNER,
      request(),
      dependencies(context(), (input) => {
        firstProof = input;
      }),
    );

    const auditedContext = context();
    auditedContext.events.push({
      id: '77777777-7777-4777-8777-777777777777',
      event_type: 'rescue_previewed',
      detail: firstProof!.safeMetadata.title,
      amendment: {
        authorizationId: AUTHORIZATION,
        stableOptionId: firstProof!.stableOptionId,
        candidateFingerprint: firstProof!.candidateFingerprint,
        preview: firstProof!.safeMetadata,
      },
      created_by: OWNER,
      created_at: '2026-08-19T00:02:00.000Z',
    });

    let retryProof: PersistTrustedAuthorizationInput | null = null;
    await authorizeTrustedProductionRescue(
      OWNER,
      request(),
      dependencies(auditedContext, (input) => {
        retryProof = input;
      }),
    );

    expect(retryProof).toMatchObject({
      sourceFingerprint: firstProof!.sourceFingerprint,
      candidateFingerprint: firstProof!.candidateFingerprint,
      productBehaviorFingerprint: firstProof!.productBehaviorFingerprint,
      requestFingerprint: firstProof!.requestFingerprint,
      recipeInput: firstProof!.recipeInput,
      productComposition: firstProof!.productComposition,
      safeMetadata: firstProof!.safeMetadata,
    });
  });
});

describe('canonical serialization and Edge shell security', () => {
  it('canonicalizes object keys before hashing', async () => {
    expect(stableCanonicalJson({ b: 2, a: { z: 1, y: 0 } })).toBe(
      stableCanonicalJson({ a: { y: 0, z: 1 }, b: 2 }),
    );
    expect(await sha256Hex(stableCanonicalJson({ b: 2, a: 1 }))).toHaveLength(64);
  });

  it('keeps JWT verification, a 15-second deadline and safe request fields in the shell', () => {
    const edge = readFileSync(
      join(process.cwd(), 'supabase/functions/production-rescue-authorize/index.ts'),
      'utf8',
    );
    expect(edge).toContain('auth.getUser()');
    expect(edge).toContain('has_active_production_entitlement_v1');
    expect(edge).toContain('PRODUCTION_RESCUE_AUTHORIZATION_DEADLINE_MS');
    expect(edge).toContain('PRODUCTION_RESCUE_TRANSPORT_DEADLINE_MS');
    expect(edge).toContain('.abortSignal(abort.signal)');
    expect(edge).toContain('fetch: boundedFetch');
    expect(edge).toContain('p_source_fingerprint: input.sourceFingerprint');
    expect(edge).toContain('p_deadline_at: deadlineAt');
    expect(edge).not.toContain('--no-verify-jwt');
    expect(edge).not.toMatch(/console\.(?:log|error|warn)/);
  });
});
