import {
  CONFIG_VERSION,
  ENGINE_VERSION,
  PRACTICAL_RECIPE_MODEL_VERSION,
  PRODUCTION_RESCUE_MODEL_VERSION,
  assessProductionRescue,
  hydrateProductionSessionFromRun,
  productionRescueCandidateFingerprint,
  scaleRecipeVersion,
  scaledRecipeInput,
} from '../_shared/generated/productionRescueEngine.bundle.mjs';
import {
  PRODUCTION_RESCUE_BUNDLE_SHA256,
  PRODUCTION_RESCUE_BUNDLER_VERSION,
  PRODUCTION_RESCUE_SOURCE_CLOSURE_SHA256,
} from '../_shared/generated/productionRescueEngine.metadata.mjs';

export const PRODUCTION_RESCUE_AUTHORIZATION_DEADLINE_MS = 15_000;
export const PRODUCTION_RESCUE_TRANSPORT_DEADLINE_MS = 17_000;
export const PRODUCTION_RESCUE_AUTHORIZATION_TTL_SECONDS = 300;
const FRUCTOSE_CANONICAL_ID = 'PI-ING-000496';

export type StableRescueOptionId = 'keep_original_batch' | 'enlarge_batch' | 'leave_as_is';

export interface AuthorizeRescueRequest {
  runId: string;
  stableOptionId: StableRescueOptionId;
  expectedActualRevision: number;
  expectedRescueRevision: number;
  idempotencyKey: string;
}

export interface SafeRescueInstruction {
  lineId: string | null;
  ingredientName: string;
  kind: 'add' | 'reduce_pending_plan';
  grams: number;
  finalTargetGrams: number;
}

export interface SafeRescuePreview {
  title: string;
  explanation: string;
  finalMassG: number;
  scoreDisplay: string;
  instructions: SafeRescueInstruction[];
}

export interface AuthorizeRescueResponse {
  authorizationId: string;
  runId: string;
  stableOptionId: StableRescueOptionId;
  expectedActualRevision: number;
  expectedRescueRevision: number;
  candidateFingerprint: string;
  authorizedAt: string;
  expiresAt: string;
  preview: SafeRescuePreview;
}

export class RescueAuthorizationError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = 'RescueAuthorizationError';
  }
}

export function rescuePersistenceErrorForMessage(message: string): RescueAuthorizationError {
  if (/statement timeout|timed out|timeout|deadline exceeded/i.test(message)) {
    return new RescueAuthorizationError('product_behavior_timeout', 504);
  }
  if (/entitlement/i.test(message)) {
    return new RescueAuthorizationError('pro_entitlement_required', 403);
  }
  if (/revision|stale|recompute/i.test(message)) {
    return new RescueAuthorizationError('production_source_stale', 409);
  }
  if (/behavior|Engine\/config|candidate|source fingerprint/i.test(message)) {
    return new RescueAuthorizationError('trusted_rescue_validation_failed', 409);
  }
  if (/idempotency/i.test(message)) {
    return new RescueAuthorizationError('idempotency_key_conflict', 409);
  }
  return new RescueAuthorizationError('authorization_persistence_failed', 500);
}

interface RawRunRow {
  id: string;
  owner_user_id: string;
  recipe_id: string;
  recipe_version_id: string;
  recipe_version_number: number;
  status: string;
  planned_batch_g: number | string;
  product_profile: string | null;
  temperature_c: number | string | null;
  engine_version: string;
  config_version: string;
  mapper_dataset_version: string | null;
  planned_date: string | null;
  machine: string | null;
  location: string | null;
  batch_reference: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  rescue_recipe_input: Record<string, unknown> | null;
  rescue_product_composition: Record<string, unknown> | null;
  rescue_accepted_by: string | null;
  rescue_accepted_at: string | null;
  rescue_revision: number | string;
  actual_revision: number | string;
}

interface RawVersionRow {
  id: string;
  recipe_id: string;
  owner_user_id: string;
  version_number: number;
  recipe_input: Record<string, unknown>;
  product_composition: Record<string, unknown> | null;
  total_batch_g: number | string;
  product_profile: string | null;
  temperature_c: number | string | null;
  engine_version: string;
  config_version: string;
  mapper_dataset_version: string | null;
  source: string;
  created_by: string;
  created_at: string;
  restored_from_version: number | null;
  note: string | null;
}

interface RawPlannedRow {
  line_id: string;
  name: string;
  canonical_ingredient_id: string | null;
  planned_grams: number | string;
  display_grams: number | string;
  position: number;
  process_scope: 'BASE_FORMULATION' | 'POST_PROCESS_ADDON';
  scope_position: number;
}

interface RawActualRow {
  actual_items: Array<{
    id: string;
    name: string;
    actualGrams: number | null;
    confirmedAt?: string | null;
    confirmationOrder?: number | null;
  }>;
  substitutions: Array<Record<string, unknown>>;
  actual_total_mix_g: number | string | null;
  actual_yield_g: number | string | null;
  waste_g: number | string | null;
  operator_notes: string | null;
  deviation_reason: string | null;
  recorded_by: string;
  recorded_at: string;
}

interface RawEventRow {
  id: string;
  event_type: string;
  detail: string | null;
  amendment: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
}

export interface TrustedRescueContext {
  recipeTitle: string;
  run: RawRunRow;
  version: RawVersionRow;
  planned: RawPlannedRow[];
  actual: RawActualRow | null;
  events: RawEventRow[];
}

export interface PersistTrustedAuthorizationInput {
  ownerUserId: string;
  accountId: string;
  runId: string;
  recipeVersionId: string;
  sourceFingerprint: string;
  expectedActualRevision: number;
  expectedRescueRevision: number;
  stableOptionId: StableRescueOptionId;
  recipeInput: Record<string, unknown>;
  productComposition: Record<string, unknown>;
  candidateFingerprint: string;
  productBehaviorFingerprint: string;
  engineVersion: string;
  configVersion: string;
  practicalRecipeVersion: string;
  rescueModelVersion: string;
  engineBundleSha256: string;
  sourceClosureSha256: string;
  bundlerVersion: string;
  requestFingerprint: string;
  idempotencyKey: string;
  safeMetadata: SafeRescuePreview;
  ttlSeconds: number;
}

export interface StoredTrustedAuthorization {
  authorizationId: string;
  runId: string;
  stableOptionId: StableRescueOptionId;
  expectedActualRevision: number;
  expectedRescueRevision: number;
  candidateFingerprint: string;
  authorizedAt: string;
  expiresAt: string;
  safeMetadata: SafeRescuePreview;
}

export interface TrustedRescueDependencies {
  loadContext(ownerUserId: string, runId: string): Promise<TrustedRescueContext | null>;
  persistAuthorization(
    input: PersistTrustedAuthorizationInput,
  ): Promise<StoredTrustedAuthorization>;
}

const numberOf = (value: number | string | null): number | null =>
  value === null ? null : typeof value === 'string' ? Number(value) : value;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_KEYS = new Set([
  'runId',
  'stableOptionId',
  'expectedActualRevision',
  'expectedRescueRevision',
  'idempotencyKey',
]);

export function parseAuthorizeRescueRequest(value: unknown): AuthorizeRescueRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RescueAuthorizationError('invalid_request', 400);
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !REQUEST_KEYS.has(key))) {
    throw new RescueAuthorizationError('unexpected_request_field', 400);
  }
  const runId = typeof record.runId === 'string' ? record.runId.trim() : '';
  const stableOptionId = record.stableOptionId;
  const actualRevision = record.expectedActualRevision;
  const rescueRevision = record.expectedRescueRevision;
  const idempotencyKey =
    typeof record.idempotencyKey === 'string' ? record.idempotencyKey.trim() : '';
  if (!UUID.test(runId)) throw new RescueAuthorizationError('invalid_run_id', 400);
  if (
    stableOptionId !== 'keep_original_batch' &&
    stableOptionId !== 'enlarge_batch' &&
    stableOptionId !== 'leave_as_is'
  ) {
    throw new RescueAuthorizationError('unknown_stable_option', 400);
  }
  if (!Number.isInteger(actualRevision) || Number(actualRevision) < 0) {
    throw new RescueAuthorizationError('invalid_actual_revision', 400);
  }
  if (!Number.isInteger(rescueRevision) || Number(rescueRevision) < 0) {
    throw new RescueAuthorizationError('invalid_rescue_revision', 400);
  }
  if (
    idempotencyKey.length < 16 ||
    idempotencyKey.length > 128 ||
    !/^[A-Za-z0-9:_-]+$/.test(idempotencyKey)
  ) {
    throw new RescueAuthorizationError('invalid_idempotency_key', 400);
  }
  return {
    runId,
    stableOptionId,
    expectedActualRevision: Number(actualRevision),
    expectedRescueRevision: Number(rescueRevision),
    idempotencyKey,
  };
}

function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new RescueAuthorizationError('non_finite_authority_value', 500);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter((entry) => entry[1] !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  throw new RescueAuthorizationError('unsupported_authority_value', 500);
}

export const stableCanonicalJson = (value: unknown): string =>
  JSON.stringify(canonicalValue(value));

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function buildCanonicalSession(context: TrustedRescueContext, ownerUserId: string) {
  const { run, version } = context;
  if (run.owner_user_id !== ownerUserId || version.owner_user_id !== ownerUserId) {
    throw new RescueAuthorizationError('production_run_not_owned', 403);
  }
  if (run.status !== 'in_progress') {
    throw new RescueAuthorizationError('production_run_not_active', 409);
  }
  if (
    run.recipe_version_id !== version.id ||
    run.recipe_id !== version.recipe_id ||
    run.recipe_version_number !== version.version_number
  ) {
    throw new RescueAuthorizationError('immutable_recipe_version_mismatch', 409);
  }
  if (run.engine_version !== ENGINE_VERSION || run.config_version !== CONFIG_VERSION) {
    throw new RescueAuthorizationError('production_engine_version_stale', 409);
  }
  if (!version.product_composition || typeof version.product_composition !== 'object') {
    throw new RescueAuthorizationError('product_behavior_authority_missing', 409);
  }
  const immutableVersion = {
    versionId: version.id,
    recipeId: version.recipe_id,
    ownerUserId: version.owner_user_id,
    versionNumber: version.version_number,
    recipeInput: structuredClone(version.recipe_input),
    productComposition: structuredClone(version.product_composition),
    totalBatchG: Number(version.total_batch_g),
    productProfile: version.product_profile,
    temperatureC: numberOf(version.temperature_c),
    engineVersion: version.engine_version,
    configVersion: version.config_version,
    mapperDatasetVersion: version.mapper_dataset_version,
    source: version.source,
    createdBy: version.created_by,
    createdAt: version.created_at,
    restoredFromVersion: version.restored_from_version,
    note: version.note,
  };
  const scaled = scaleRecipeVersion(immutableVersion as never, {
    kind: 'weight_g',
    grams: Number(run.planned_batch_g),
  });
  if (!scaled.ok) throw new RescueAuthorizationError('immutable_recipe_scale_failed', 409);
  const plannedInput = scaledRecipeInput(immutableVersion as never, scaled);
  const plannedById = new Map(context.planned.map((line) => [line.line_id, line]));
  const composition = structuredClone(version.product_composition) as {
    toppings?: Array<{ id: string; planned_grams: number; actual_grams: number | null }>;
    [key: string]: unknown;
  };
  composition.toppings = (composition.toppings ?? []).map((item) => {
    const frozen = plannedById.get(item.id);
    if (!frozen || frozen.process_scope !== 'POST_PROCESS_ADDON') {
      throw new RescueAuthorizationError('frozen_topping_plan_mismatch', 409);
    }
    return { ...item, planned_grams: Number(frozen.planned_grams), actual_grams: null };
  });

  const domainRun = {
    runId: run.id,
    ownerUserId: run.owner_user_id,
    recipeId: run.recipe_id,
    recipeVersionId: run.recipe_version_id,
    recipeVersionNumber: run.recipe_version_number,
    status: run.status,
    plannedBatchG: Number(run.planned_batch_g),
    plannedItems: context.planned
      .slice()
      .sort((left, right) => {
        if (left.process_scope !== right.process_scope) {
          return left.process_scope === 'BASE_FORMULATION' ? -1 : 1;
        }
        return left.scope_position - right.scope_position || left.position - right.position;
      })
      .map((line) => ({
        id: line.line_id,
        name: line.name,
        canonicalIngredientId: line.canonical_ingredient_id,
        processScope: line.process_scope,
        scopePosition: line.scope_position,
        plannedGrams: Number(line.planned_grams),
        displayGrams: Number(line.display_grams),
      })),
    productProfile: run.product_profile,
    temperatureC: numberOf(run.temperature_c),
    engineVersion: run.engine_version,
    configVersion: run.config_version,
    mapperDatasetVersion: run.mapper_dataset_version,
    plannedDate: run.planned_date,
    machine: run.machine,
    location: run.location,
    batchReference: run.batch_reference,
    notes: run.notes,
    createdBy: run.created_by,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    actual: context.actual
      ? {
          items: context.actual.actual_items,
          actualTotalMixG: numberOf(context.actual.actual_total_mix_g),
          actualYieldG: numberOf(context.actual.actual_yield_g),
          wasteG: numberOf(context.actual.waste_g),
          substitutions: context.actual.substitutions,
          operatorNotes: context.actual.operator_notes,
          deviationReason: context.actual.deviation_reason,
          recordedBy: context.actual.recorded_by,
          recordedAt: context.actual.recorded_at,
          revision: Number(run.actual_revision),
        }
      : null,
    rescue:
      run.rescue_recipe_input &&
      run.rescue_product_composition &&
      run.rescue_accepted_by &&
      run.rescue_accepted_at
        ? {
            recipeInput: structuredClone(run.rescue_recipe_input),
            productComposition: structuredClone(run.rescue_product_composition),
            acceptedBy: run.rescue_accepted_by,
            acceptedAt: run.rescue_accepted_at,
            revision: Number(run.rescue_revision),
          }
        : null,
    completedAt: run.completed_at,
    cancelledAt: run.cancelled_at,
    events: context.events.map((event) => ({
      eventId: event.id,
      type: event.event_type,
      at: event.created_at,
      by: event.created_by,
      detail: event.detail,
      amendment: event.amendment,
    })),
  };
  return hydrateProductionSessionFromRun(
    domainRun as never,
    {
      recipeId: run.recipe_id,
      recipeVersionId: run.recipe_version_id,
      recipeVersionNumber: run.recipe_version_number,
      recipeName: context.recipeTitle,
    },
    plannedInput,
    composition as never,
  );
}

const canonicalIngredientId = (item: Record<string, unknown>): string | null => {
  const ingredient = item.ingredient as Record<string, unknown> | undefined;
  const value = ingredient?.canonical_ingredient_id ?? ingredient?.id;
  return typeof value === 'string' ? value : null;
};

export async function authorizeTrustedProductionRescue(
  ownerUserId: string,
  request: AuthorizeRescueRequest,
  dependencies: TrustedRescueDependencies,
): Promise<AuthorizeRescueResponse> {
  const context = await dependencies.loadContext(ownerUserId, request.runId);
  if (!context) throw new RescueAuthorizationError('production_run_not_found', 404);
  if (Number(context.run.actual_revision) !== request.expectedActualRevision) {
    throw new RescueAuthorizationError('stale_actual_revision', 409);
  }
  if (Number(context.run.rescue_revision) !== request.expectedRescueRevision) {
    throw new RescueAuthorizationError('stale_rescue_revision', 409);
  }

  const session = buildCanonicalSession(context, ownerUserId);
  const assessment = assessProductionRescue(session);
  const option = assessment.options.find((candidate) => candidate.id === request.stableOptionId);
  if (!option || option.verifiedByEngine !== true) {
    const physicalConfirmedG = session.lines.reduce(
      (sum: number, line: { physicalAddedGrams: number }) => sum + line.physicalAddedGrams,
      0,
    );
    const reason =
      request.stableOptionId === 'keep_original_batch'
        ? physicalConfirmedG > session.plannedInput.target_batch_grams + 0.000001
          ? 'physical_mass_above_original_target'
          : 'no_safe_original_target_candidate'
        : request.stableOptionId === 'enlarge_batch'
          ? 'no_safe_larger_candidate'
          : assessment.hardSafety.capacityExceeded
            ? 'machine_capacity_exceeded'
            : assessment.hardSafety.provisional
              ? 'provisional_profile_not_hard_safe'
              : assessment.hardSafety.violationMetrics.length > 0
                ? 'hard_safety_violations'
                : 'native_profile_not_hard_safe';
    throw new RescueAuthorizationError('stable_rescue_option_stale', 409, {
      stableOptionId: request.stableOptionId,
      reason,
      violationMetrics: assessment.hardSafety.violationMetrics,
    });
  }
  const candidate = option.candidateInput as unknown as Record<string, unknown> & {
    items: Array<Record<string, unknown>>;
    target_batch_grams: number;
  };
  if (
    !candidate.items.every(
      (item) =>
        Number.isInteger(item.planned_grams) &&
        Number(item.planned_grams) >= 0 &&
        item.actual_grams === null,
    ) ||
    candidate.items.reduce((sum, item) => sum + Number(item.planned_grams), 0) !==
      candidate.target_batch_grams
  ) {
    throw new RescueAuthorizationError('engine_candidate_not_practical', 409);
  }
  const currentCanonicalIds = new Set(
    [...session.plannedInput.items, ...session.rescueAddedItems].map(
      (item) => item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
    ),
  );
  if (
    candidate.items.some(
      (item) =>
        canonicalIngredientId(item) === FRUCTOSE_CANONICAL_ID &&
        !currentCanonicalIds.has(FRUCTOSE_CANONICAL_ID),
    )
  ) {
    throw new RescueAuthorizationError('automatic_fructose_rescue_forbidden', 409);
  }

  const baseOrder = candidate.items.map((item) => String(item.id));
  const behaviorSnapshots = (session.plannedComposition.behaviorSnapshots ?? {}) as Record<
    string,
    unknown
  >;
  if (baseOrder.some((lineId) => !behaviorSnapshots[lineId])) {
    throw new RescueAuthorizationError('candidate_product_behavior_authority_missing', 409);
  }
  const productComposition = {
    ...structuredClone(session.plannedComposition),
    baseOrder,
    behaviorSnapshots: Object.fromEntries(
      baseOrder.map((lineId) => [lineId, structuredClone(behaviorSnapshots[lineId])]),
    ),
  } as unknown as Record<string, unknown>;
  const safePreview: SafeRescuePreview = {
    title: option.title,
    explanation: option.explanation,
    finalMassG: option.finalMassG,
    scoreDisplay: option.scoreDisplay,
    instructions: option.instructions.map((instruction): SafeRescueInstruction => ({
      lineId: instruction.lineId ?? null,
      ingredientName: instruction.ingredientName,
      kind: instruction.kind as SafeRescueInstruction['kind'],
      grams: instruction.grams,
      finalTargetGrams: instruction.finalTargetGrams,
    })),
  };
  const productBehaviorFingerprint = await sha256Hex(stableCanonicalJson(productComposition));
  const sourceFingerprint = await sha256Hex(
    stableCanonicalJson({
      run: context.run,
      version: context.version,
      planned: context.planned.slice().sort((left, right) => left.position - right.position),
      actual: context.actual,
      events: context.events
        .slice()
        .sort(
          (left, right) =>
            left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id),
        ),
    }),
  );
  const canonicalCandidatePreimage = productionRescueCandidateFingerprint(option.candidateInput);
  const candidateFingerprint = await sha256Hex(
    stableCanonicalJson({
      runId: request.runId,
      recipeVersionId: context.run.recipe_version_id,
      sourceFingerprint,
      actualVector: session.lines.map(
        (line: {
          lineId: string;
          physicalAddedGrams: number;
          confirmed: boolean;
          confirmationOrder: number | null;
        }) => ({
          lineId: line.lineId,
          grams: line.physicalAddedGrams,
          confirmed: line.confirmed,
          confirmationOrder: line.confirmationOrder,
        }),
      ),
      actualRevision: request.expectedActualRevision,
      cumulativeRescue: context.run.rescue_recipe_input,
      rescueRevision: request.expectedRescueRevision,
      stableOptionId: request.stableOptionId,
      canonicalCandidatePreimage,
      candidate,
      productComposition,
      productBehaviorFingerprint,
      targetBatchGrams: candidate.target_batch_grams,
      engineVersion: ENGINE_VERSION,
      configVersion: CONFIG_VERSION,
      practicalRecipeVersion: PRACTICAL_RECIPE_MODEL_VERSION,
      rescueModelVersion: PRODUCTION_RESCUE_MODEL_VERSION,
      engineBundleSha256: PRODUCTION_RESCUE_BUNDLE_SHA256,
    }),
  );
  const requestFingerprint = await sha256Hex(
    stableCanonicalJson({
      ownerUserId,
      accountId: ownerUserId,
      runId: request.runId,
      actualRevision: request.expectedActualRevision,
      rescueRevision: request.expectedRescueRevision,
      stableOptionId: request.stableOptionId,
      idempotencyKey: request.idempotencyKey,
      candidateFingerprint,
    }),
  );

  const stored = await dependencies.persistAuthorization({
    ownerUserId,
    accountId: ownerUserId,
    runId: request.runId,
    recipeVersionId: context.run.recipe_version_id,
    sourceFingerprint,
    expectedActualRevision: request.expectedActualRevision,
    expectedRescueRevision: request.expectedRescueRevision,
    stableOptionId: request.stableOptionId,
    recipeInput: candidate,
    productComposition,
    candidateFingerprint,
    productBehaviorFingerprint,
    engineVersion: ENGINE_VERSION,
    configVersion: CONFIG_VERSION,
    practicalRecipeVersion: PRACTICAL_RECIPE_MODEL_VERSION,
    rescueModelVersion: PRODUCTION_RESCUE_MODEL_VERSION,
    engineBundleSha256: PRODUCTION_RESCUE_BUNDLE_SHA256,
    sourceClosureSha256: PRODUCTION_RESCUE_SOURCE_CLOSURE_SHA256,
    bundlerVersion: PRODUCTION_RESCUE_BUNDLER_VERSION,
    requestFingerprint,
    idempotencyKey: request.idempotencyKey,
    safeMetadata: safePreview,
    ttlSeconds: PRODUCTION_RESCUE_AUTHORIZATION_TTL_SECONDS,
  });
  if (
    stored.runId !== request.runId ||
    stored.stableOptionId !== request.stableOptionId ||
    stored.expectedActualRevision !== request.expectedActualRevision ||
    stored.expectedRescueRevision !== request.expectedRescueRevision ||
    stored.candidateFingerprint !== candidateFingerprint
  ) {
    throw new RescueAuthorizationError('stored_authorization_mismatch', 500);
  }
  return {
    authorizationId: stored.authorizationId,
    runId: stored.runId,
    stableOptionId: stored.stableOptionId,
    expectedActualRevision: stored.expectedActualRevision,
    expectedRescueRevision: stored.expectedRescueRevision,
    candidateFingerprint: stored.candidateFingerprint,
    authorizedAt: stored.authorizedAt,
    expiresAt: stored.expiresAt,
    preview: structuredClone(stored.safeMetadata),
  };
}
