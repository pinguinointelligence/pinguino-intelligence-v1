import type { RecipeInput } from '@/engine';
import type { EngineIngredient } from '@/engine';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import {
  productBehaviorRequiredLineIds,
  snapshotServerResolvedProductBehavior,
  type ProductBehaviorContext,
  type ProductBehaviorModule,
  type ProductBehaviorSnapshot,
  type ServerResolvedProductBehavior,
} from '@/features/product-intelligence';
import { normalizeFormulationStrategy } from '@/features/formulation-strategy/strategy';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';

export type ProductBehaviorEntity =
  | { entityKind: 'mapper'; entityId: string }
  | { entityKind: 'catalog_product_version'; entityId: string };

export interface RecipeBehaviorServerValidationLine {
  lineId: string;
  entityKind: ProductBehaviorEntity['entityKind'];
  entityId: string;
  productId: string;
  productVersionId: string;
  behaviorBindingId: string;
  behaviorBindingVersion: string;
  factsFingerprint: string;
  taxonomyVersion: string;
  mapperIngredientId: string | null;
  mainPolicyId: string | null;
  mainPolicyVersion: string | null;
  sharedFacts: ProductBehaviorSnapshot['sharedFacts'];
  costPerKg: number | null;
  costCurrency: string | null;
}

export interface RecipeBehaviorServerValidationResult {
  ready: boolean;
  module: ProductBehaviorModule;
  lines: Array<{ lineId: string; state: 'ready' | 'stale'; reasons: string[] }>;
  staleLineIds: string[];
}

interface RecipeBehaviorServerValidationGroup {
  lines: RecipeBehaviorServerValidationLine[];
  context: ProductBehaviorContext;
}

const EXACT_SERVER_AUTHORITY_REASON_CODES = new Set([
  'behavior_binding_stale',
  'behavior_binding_version_stale',
  'facts_fingerprint_stale',
  'shared_facts_stale',
  'taxonomy_version_stale',
  'product_version_stale',
  'product_identity_stale',
  'mapper_mapping_stale',
  'main_policy_stale',
  'catalog_version_identity_mismatch',
  'mapper_entity_identity_mismatch',
]);

function exactServerAuthorityReason(
  reason: string,
  snapshot: ProductBehaviorSnapshot | undefined,
  module: ProductBehaviorModule,
): string {
  if (reason.includes(':') || !snapshot || !EXACT_SERVER_AUTHORITY_REASON_CODES.has(reason)) {
    return reason;
  }
  return `${reason}:${snapshot.productId}:${snapshot.mapperIngredientId ?? 'none'}:${snapshot.productVersionId}:${module}:refresh_product_data`;
}

const TECHNICAL_FACT_FIELDS: ReadonlyArray<[
  keyof EngineIngredient['composition'] | 'pod_value' | 'pac_value' | 'de_value',
  string,
]> = [
  ['water_percent', 'water'], ['solids_percent', 'totalSolids'],
  ['fat_percent', 'fat'], ['saturated_fat_percent', 'saturatedFat'],
  ['protein_percent', 'protein'], ['carbohydrate_percent', 'carbohydrate'],
  ['sugar_percent', 'sugars'], ['sucrose_percent', 'sucrose'],
  ['glucose_percent', 'glucose'], ['dextrose_percent', 'dextrose'],
  ['fructose_percent', 'fructose'], ['lactose_percent', 'lactose'],
  ['polyol_percent', 'polyols'], ['fiber_percent', 'fibre'],
  ['salt_percent', 'salt'], ['alcohol_percent', 'alcohol'],
  ['kcal_per_100g', 'energyKcal'], ['pod_value', 'podValue'],
  ['pac_value', 'pacValue'], ['de_value', 'deValue'],
];

// The Engine's documented Mapper seam treats absent optional component
// contributions as zero. Core composition plus POD/PAC are deliberately not
// listed here: an absent core fact must remain a hard technical mismatch.
const OPTIONAL_ZERO_DEFAULT_FACTS = new Set<string>([
  'sucrose', 'glucose', 'dextrose', 'fructose', 'lactose', 'polyols',
  'fibre', 'alcohol', 'energyKcal',
]);

function ingredientTechnicalValue(
  ingredient: EngineIngredient,
  field: keyof EngineIngredient['composition'] | 'pod_value' | 'pac_value' | 'de_value',
): number | null | undefined {
  return field in ingredient.composition
    ? ingredient.composition[field as keyof EngineIngredient['composition']]
    : ingredient[field as 'pod_value' | 'pac_value' | 'de_value'];
}

function technicalFactsMatch(
  ingredient: EngineIngredient,
  snapshot: ProductBehaviorSnapshot,
): boolean {
  if (snapshot.processScope !== 'BASE_FORMULATION') return true;
  const technical = snapshot.sharedFacts?.technicalComposition;
  if (!technical || Object.keys(technical).length === 0) return false;
  return TECHNICAL_FACT_FIELDS.every(([ingredientField, snapshotField]) => {
    const expected = technical[snapshotField];
    const actual = ingredientTechnicalValue(ingredient, ingredientField);
    // PostgreSQL strips JSON nulls from the immutable server projection. An
    // omitted optional fact therefore matches only an explicitly unknown
    // Engine value; it must never match a numeric value supplied by a caller.
    if (expected === undefined) {
      return actual === null || actual === undefined
        || (OPTIONAL_ZERO_DEFAULT_FACTS.has(snapshotField) && actual === 0);
    }
    if (expected === null || actual === null || actual === undefined) {
      return expected === null && (actual === null || actual === undefined);
    }
    return Number.isFinite(expected) && Number.isFinite(actual) && Math.abs(expected - actual) <= 1e-7;
  });
}

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

function readServerResolvedProductBehavior(value: unknown): ServerResolvedProductBehavior | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    row.schemaVersion === 1 && row.state === 'blocked' && typeof row.module === 'string'
    && (row.entityKind === 'mapper' || row.entityKind === 'catalog_product_version')
  ) {
    const entityId = typeof row.entityId === 'string' ? row.entityId : 'unresolved';
    const productId = typeof row.productId === 'string' ? row.productId : entityId;
    const productVersionId = typeof row.productVersionId === 'string'
      ? row.productVersionId
      : entityId;
    const exactReasons = [...new Set([
      ...asStringArray(row.reasons),
      ...asStringArray(row.blockReasons),
    ])];
    return {
      schemaVersion: 1,
      resolverVersion: typeof row.resolverVersion === 'string'
        ? row.resolverVersion
        : 'blocked-authority-envelope-v1',
      entityKind: row.entityKind,
      productId,
      productVersionId,
      factsFingerprint: typeof row.factsFingerprint === 'string' ? row.factsFingerprint : 'unresolved',
      catalogStatus: 'blocked',
      mapperVerificationStatus: null,
      provenance: typeof row.provenance === 'string' ? row.provenance : 'server_authority',
      behaviorBindingId: typeof row.behaviorBindingId === 'string' ? row.behaviorBindingId : 'unresolved',
      behaviorBindingVersion: typeof row.behaviorBindingVersion === 'string'
        ? row.behaviorBindingVersion
        : 'unresolved',
      taxonomyVersion: typeof row.taxonomyVersion === 'string' ? row.taxonomyVersion : 'unresolved',
      mapperIngredientId: typeof row.mapperIngredientId === 'string' ? row.mapperIngredientId : null,
      familyId: null,
      subfamilyId: null,
      formId: null,
      mainEligibility: 'UNKNOWN',
      veganEligibility: 'unknown',
      proteinBehavior: 'unknown',
      processBehavior: {},
      sharedFacts: null,
      privateOverlay: null,
      approvedLiquidDairyCarrier: false,
      context: row.context && typeof row.context === 'object'
        ? row.context as Record<string, unknown>
        : {},
      module: row.module as ProductBehaviorModule,
      state: 'blocked',
      moduleEligibility: { [row.module as ProductBehaviorModule]: 'blocked' },
      mainPolicy: null,
      warnings: asStringArray(row.warnings),
      blockReasons: exactReasons,
    };
  }
  if (
    row.schemaVersion !== 1 ||
    typeof row.resolverVersion !== 'string' ||
    (row.entityKind !== 'mapper' && row.entityKind !== 'catalog_product_version') ||
    typeof row.productId !== 'string' ||
    typeof row.productVersionId !== 'string' ||
    typeof row.factsFingerprint !== 'string' ||
    typeof row.behaviorBindingId !== 'string' ||
    typeof row.behaviorBindingVersion !== 'string' ||
    typeof row.taxonomyVersion !== 'string' ||
    typeof row.approvedLiquidDairyCarrier !== 'boolean' ||
    !row.moduleEligibility || typeof row.moduleEligibility !== 'object' ||
    typeof row.module !== 'string' ||
    (row.state !== 'eligible' && row.state !== 'blocked')
  ) return null;
  return {
    ...(row as unknown as ServerResolvedProductBehavior),
    mapperIngredientId: typeof row.mapperIngredientId === 'string' ? row.mapperIngredientId : null,
    familyId: typeof row.familyId === 'string' ? row.familyId : null,
    subfamilyId: typeof row.subfamilyId === 'string' ? row.subfamilyId : null,
    formId: typeof row.formId === 'string' ? row.formId : null,
    mainPolicy: row.mainPolicy && typeof row.mainPolicy === 'object'
      ? row.mainPolicy as ServerResolvedProductBehavior['mainPolicy']
      : null,
    warnings: asStringArray(row.warnings),
    blockReasons: asStringArray(row.blockReasons),
  };
}

function serverValidationLine(
  lineId: string,
  snapshot: ProductBehaviorSnapshot,
  ingredient: Pick<EngineIngredient, 'cost_per_kg' | 'cost_currency'>,
): RecipeBehaviorServerValidationLine | null {
  const mapper = snapshot.source === 'mapper';
  const entityId = mapper ? snapshot.mapperIngredientId : snapshot.productVersionId;
  if (!entityId) return null;
  return {
    lineId,
    entityKind: mapper ? 'mapper' : 'catalog_product_version',
    entityId,
    productId: snapshot.productId,
    productVersionId: snapshot.productVersionId,
    behaviorBindingId: snapshot.behaviorBindingId,
    behaviorBindingVersion: snapshot.behaviorBindingVersion,
    factsFingerprint: snapshot.factsFingerprint,
    taxonomyVersion: snapshot.taxonomyVersion,
    mapperIngredientId: snapshot.mapperIngredientId,
    mainPolicyId: snapshot.mainPolicyId,
    mainPolicyVersion: snapshot.mainPolicyVersion,
    sharedFacts: snapshot.sharedFacts ?? null,
    costPerKg: mapper ? null : (ingredient.cost_per_kg ?? null),
    costCurrency: mapper ? null : (ingredient.cost_currency ?? null),
  };
}

/** Builds only immutable references for the server terminal gate. Product
 * facts and permission booleans are always loaded again by PostgreSQL. */
export function buildRecipeBehaviorServerValidationGroups(input: {
  recipe: RecipeInput;
  toppings?: readonly RecipeToppingItem[];
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  module: ProductBehaviorModule;
  accountId: string | null;
  technicalOnlyMainLineIds?: readonly string[];
}): { groups: RecipeBehaviorServerValidationGroup[]; invalidLineIds: string[] } {
  const requiredLineIds = productBehaviorRequiredLineIds({
    items: input.recipe.items,
    toppings: input.toppings,
  });
  const mainLineIds = new Set(
    input.recipe.items.filter((item) => item.lock_type === 'main').map((item) => item.id),
  );
  const technicalOnlyMainLineIds = new Set(input.technicalOnlyMainLineIds ?? []);
  const invalidLineIds: string[] = [];
  const byContext = new Map<string, RecipeBehaviorServerValidationGroup>();

  for (const lineId of requiredLineIds) {
    const snapshot = input.snapshots[lineId];
    const recipeLine = input.recipe.items.find((item) => item.id === lineId);
    const toppingLine = input.toppings?.find((item) => item.id === lineId);
    const expectedScope = recipeLine ? 'BASE_FORMULATION' : toppingLine ? 'POST_PROCESS_ADDON' : null;
    if (
      !snapshot ||
      snapshot.resolutionState !== 'RESOLVED' ||
      expectedScope === null ||
      snapshot.processScope !== expectedScope ||
      (recipeLine !== undefined && !technicalFactsMatch(recipeLine.ingredient, snapshot))
    ) {
      invalidLineIds.push(lineId);
      continue;
    }
    const line = serverValidationLine(lineId, snapshot, (recipeLine ?? toppingLine)!.ingredient);
    if (!line) {
      invalidLineIds.push(lineId);
      continue;
    }
    const requestedRole = mainLineIds.has(lineId) && !technicalOnlyMainLineIds.has(lineId)
      ? 'MAIN'
      : 'STANDARD';
    const key = `${snapshot.processScope}:${requestedRole}`;
    const existing = byContext.get(key);
    if (existing) {
      existing.lines.push(line);
      continue;
    }
    byContext.set(key, {
      lines: [line],
      context: {
        accountId: input.accountId,
        productProfile: input.recipe.category,
        temperatureC: input.recipe.target_temperature_c,
        mode: normalizeFormulationStrategy(
          input.recipe.goals?.formulation_strategy ?? input.recipe.mode,
        ),
        processScope: snapshot.processScope,
        requestedRole,
        module: input.module,
      },
    });
  }

  return {
    groups: [...byContext.values()].map((group) => ({
      ...group,
      lines: [...group.lines].sort((left, right) => left.lineId.localeCompare(right.lineId)),
    })),
    invalidLineIds: [...invalidLineIds].sort(),
  };
}

function readRecipeBehaviorServerValidation(
  value: unknown,
  expectedModule: ProductBehaviorModule,
): RecipeBehaviorServerValidationResult | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    row.schemaVersion !== 1 ||
    typeof row.ready !== 'boolean' ||
    row.module !== expectedModule ||
    !Array.isArray(row.lines) ||
    !Array.isArray(row.staleLineIds)
  ) return null;
  const lines = row.lines.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const line = entry as Record<string, unknown>;
    if (
      typeof line.lineId !== 'string' ||
      (line.state !== 'ready' && line.state !== 'stale') ||
      !Array.isArray(line.reasons)
    ) return [];
    return [{
      lineId: line.lineId,
      state: line.state as 'ready' | 'stale',
      reasons: asStringArray(line.reasons),
    }];
  });
  if (lines.length !== row.lines.length) return null;
  return {
    ready: row.ready,
    module: expectedModule,
    lines,
    staleLineIds: asStringArray(row.staleLineIds),
  };
}

/** Re-resolves current version, classification, mapping, taxonomy and Main
 * policy immediately before a terminal recipe operation. */
export async function validateRecipeBehaviorOnServer(input: {
  recipe: RecipeInput;
  toppings?: readonly RecipeToppingItem[];
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  module: ProductBehaviorModule;
  accountId: string | null;
  technicalOnlyMainLineIds?: readonly string[];
  client?: Pick<SupabaseClient, 'rpc'>;
}): Promise<RecipeBehaviorServerValidationResult> {
  const built = buildRecipeBehaviorServerValidationGroups(input);
  if (built.invalidLineIds.length > 0) {
    return {
      ready: false,
      module: input.module,
      staleLineIds: built.invalidLineIds,
      lines: built.invalidLineIds.map((lineId) => ({
        lineId,
        state: 'stale',
        reasons: [(() => {
          const snapshot = input.snapshots[lineId];
          const line = input.recipe.items.find((item) => item.id === lineId);
          const fallbackIdentity = line ? canonicalIngredientId(line.ingredient) : lineId;
          return `behavior_snapshot_missing_or_unresolved:${snapshot?.productId ?? fallbackIdentity}:${snapshot?.mapperIngredientId ?? (fallbackIdentity.startsWith('PI-ING-') ? fallbackIdentity : 'none')}:${snapshot?.productVersionId ?? 'none'}:${input.module}:refresh_product_data`;
        })()],
      })),
    };
  }
  if (built.groups.length === 0) {
    return { ready: true, module: input.module, staleLineIds: [], lines: [] };
  }
  const client = input.client ?? supabase;
  if (!client) {
    const lineIds = built.groups.flatMap((group) => group.lines.map((line) => line.lineId)).sort();
    return {
      ready: false,
      module: input.module,
      staleLineIds: lineIds,
      lines: lineIds.map((lineId) => ({
        lineId,
        state: 'stale',
        reasons: ['behavior_server_validation_unavailable'],
      })),
    };
  }

  const results = await Promise.all(built.groups.map(async (group) => {
    const { data, error } = await client.rpc('validate_recipe_behavior_v1', {
      p_lines: group.lines,
      p_context: group.context,
    });
    if (error) throw new Error(error.message);
    const parsed = readRecipeBehaviorServerValidation(data, input.module);
    if (!parsed) throw new Error('Nieprawidłowa odpowiedź walidacji zachowania produktu.');
    return parsed;
  }));
  const lines = results.flatMap((result) => result.lines)
    .map((line) => ({
      ...line,
      reasons: line.reasons.map((reason) => exactServerAuthorityReason(
        reason,
        input.snapshots[line.lineId],
        input.module,
      )),
    }))
    .sort((left, right) => left.lineId.localeCompare(right.lineId));
  const staleLineIds = [...new Set(results.flatMap((result) => result.staleLineIds))].sort();
  return {
    ready: results.every((result) => result.ready) && staleLineIds.length === 0,
    module: input.module,
    lines,
    staleLineIds,
  };
}

/** Authenticated product-behavior authority. The caller supplies context only;
 * all product facts, mapping, taxonomy, profile permissions and Main limits are
 * loaded inside the SECURITY DEFINER resolver. */
export async function resolveProductBehaviorForSelection(input: {
  entity: ProductBehaviorEntity;
  context: ProductBehaviorContext;
}): Promise<ServerResolvedProductBehavior | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('resolve_product_behavior_v1', {
    p_entity_kind: input.entity.entityKind,
    p_entity_id: input.entity.entityId,
    p_context: {
      accountId: input.context.accountId,
      productProfile: input.context.productProfile,
      temperatureC: input.context.temperatureC,
      mode: input.context.mode,
      processScope: input.context.processScope,
      requestedRole: input.context.requestedRole,
      module: input.context.module,
    },
  });
  if (error) throw new Error(error.message);
  return readServerResolvedProductBehavior(data);
}

/** Recovery adapter for saved payloads created before one canonical recipe
 * reference shape existed. PostgreSQL resolves all accepted stable references
 * to the same current immutable version and then calls the canonical resolver. */
export async function resolveLegacyRecipeBehaviorForSelection(input: {
  reference: {
    mapperIngredientId?: string | null;
    canonicalIdentity?: string | null;
    productId?: string | null;
    productVersionId?: string | null;
    behaviorBindingId?: string | null;
    normalizedIdentity?: string | null;
  };
  context: ProductBehaviorContext;
}): Promise<ServerResolvedProductBehavior | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('resolve_legacy_recipe_behavior_v1', {
    p_reference: input.reference,
    p_context: input.context,
  });
  if (error) throw new Error(error.message);
  return readServerResolvedProductBehavior(data);
}

/** Resolves every newly introduced Base line in a proposed vector before the
 * Preview is exposed. This is the shared seam for solver-added toolbox and
 * correction lines; callers never synthesize built-in permissions locally. */
export async function resolveRecipeProposalBehaviorSnapshots(input: {
  recipe: RecipeInput;
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  accountId: string | null;
  module?: ProductBehaviorModule;
  technicalOnlyMainLineIds?: readonly string[];
}): Promise<{
  snapshots: Record<string, ProductBehaviorSnapshot>;
  unresolvedLineIds: string[];
}> {
  const snapshots = Object.fromEntries(
    Object.entries(input.snapshots)
      .filter((entry): entry is [string, ProductBehaviorSnapshot] => entry[1] !== undefined)
      .map(([lineId, snapshot]) => [lineId, structuredClone(snapshot)]),
  );
  const requiredLineIds = productBehaviorRequiredLineIds({ items: input.recipe.items });
  const requestedModule = input.module ?? 'BASE_RECIPE';
  const mode = normalizeFormulationStrategy(
    input.recipe.goals?.formulation_strategy ?? input.recipe.mode,
  );
  const needsResolution = requiredLineIds.filter((lineId) => {
    const line = input.recipe.items.find((candidate) => candidate.id === lineId);
    const snapshot = snapshots[lineId];
    if (!line || !snapshot || snapshot.resolutionState !== 'RESOLVED') return true;
    const expectedRole = line.lock_type === 'main' &&
      !(input.technicalOnlyMainLineIds ?? []).includes(lineId) ? 'MAIN' : 'STANDARD';
    const context = snapshot.resolutionContext;
    return !context ||
      context.accountId !== input.accountId ||
      context.productProfile !== input.recipe.category ||
      context.temperatureC !== input.recipe.target_temperature_c ||
      context.mode !== mode ||
      context.processScope !== 'BASE_FORMULATION' ||
      context.requestedRole !== expectedRole ||
      context.module !== requestedModule;
  });
  const unresolvedLineIds: string[] = [];

  await Promise.all(needsResolution.map(async (lineId) => {
    const line = input.recipe.items.find((item) => item.id === lineId);
    if (!line) {
      unresolvedLineIds.push(lineId);
      return;
    }
    const prior = snapshots[lineId];
    const mapperIngredientId = prior?.mapperIngredientId ?? canonicalIngredientId(line.ingredient);
    const entity = prior?.source !== 'mapper' && prior?.productVersionId
      ? { entityKind: 'catalog_product_version' as const, entityId: prior.productVersionId }
      : mapperIngredientId.startsWith('PI-ING-')
        ? { entityKind: 'mapper' as const, entityId: mapperIngredientId }
        : null;
    if (!entity) {
      unresolvedLineIds.push(lineId);
      return;
    }
    const resolved = await resolveProductBehaviorForSelection({
      entity,
      context: {
        accountId: input.accountId,
        productProfile: input.recipe.category,
        temperatureC: input.recipe.target_temperature_c,
        mode,
        processScope: 'BASE_FORMULATION',
        requestedRole: line.lock_type === 'main' &&
          !(input.technicalOnlyMainLineIds ?? []).includes(lineId) ? 'MAIN' : 'STANDARD',
        module: requestedModule,
      },
    }).catch(() => null);
    if (!resolved || resolved.state !== 'eligible') {
      unresolvedLineIds.push(lineId);
      return;
    }
    snapshots[lineId] = snapshotServerResolvedProductBehavior({
      lineId,
      processScope: 'BASE_FORMULATION',
      resolved,
    });
  }));

  return { snapshots, unresolvedLineIds: [...new Set(unresolvedLineIds)].sort() };
}

export function productBehaviorBlockedMessage(result: ServerResolvedProductBehavior): string {
  const exactPrefixes = [
    'product_rejected:', 'behavior_binding_missing:',
    'classification_pending:', 'classification_failed:',
    'approved_for_base_false:', 'approved_for_engines_false:',
    'missing_technical_fields:', 'process_evidence_unknown:',
    'mapper_mapping_missing:', 'profile_not_approved:',
    'main_policy_not_approved:', 'module_permission_missing:',
    'nutrition_facts_missing:', 'allergen_facts_missing:',
    'module_not_eligible:', 'legacy_product_reference_unresolved:',
    'behavior_snapshot_missing_or_unresolved:',
    'behavior_binding_stale:', 'behavior_binding_version_stale:',
    'facts_fingerprint_stale:', 'shared_facts_stale:',
    'taxonomy_version_stale:', 'product_version_stale:',
    'product_identity_stale:', 'mapper_mapping_stale:',
    'main_policy_stale:', 'catalog_version_identity_mismatch:',
    'mapper_entity_identity_mismatch:',
  ];
  const reason = result.blockReasons.find((entry) =>
    exactPrefixes.some((prefix) => entry.startsWith(prefix)),
  ) ?? `module_not_eligible:${result.productId}:${result.mapperIngredientId ?? 'none'}:${result.productVersionId}:${result.module}:return_to_recipe`;
  const [code, ...parts] = reason.split(':');
  const parsed = (() => {
    if (code === 'missing_technical_fields') {
      if (parts.length >= 6) {
        const [details, productId, mapperId, versionId, module, action] = parts;
        return { details, productId, mapperId, versionId, module, action };
      }
      const [details, mapperId, versionId, module] = parts;
      return { details, productId: result.productId, mapperId, versionId, module, action: 'complete_technical_fields' };
    }
    if (parts.length >= 5) {
      const [productId, mapperId, versionId, module, action] = parts;
      return { details: '', productId, mapperId, versionId, module, action };
    }
    const [mapperId, versionId, module] = parts;
    return { details: '', productId: result.productId, mapperId, versionId, module, action: 'return_to_recipe' };
  })();
  const productId = parsed.productId || result.productId;
  const mapperId = parsed.mapperId && parsed.mapperId !== 'none'
    ? parsed.mapperId
    : (result.mapperIngredientId ?? 'brak');
  const versionId = parsed.versionId && parsed.versionId !== 'none'
    ? parsed.versionId
    : result.productVersionId;
  const module = parsed.module || result.module;
  const exact = `produkt ${productId} · wersja ${versionId} · Mapper ${mapperId} · moduł ${module}`;
  if (code === 'product_rejected') {
    return `Dokładny ${exact} został jawnie odrzucony przez Ownera. Skontaktuj się z Ownerem przed ponownym użyciem.`;
  }
  if (code === 'behavior_binding_missing') {
    return `Dla ${exact} brakuje aktualnego ProductBehavior binding. Odśwież dane produktu i uruchom klasyfikację ponownie.`;
  }
  if (code === 'behavior_snapshot_missing_or_unresolved') {
    return `Dla ${exact} brakuje aktualnego snapshotu ProductBehavior. Odśwież dane produktu i uruchom PI ponownie.`;
  }
  if (code === 'legacy_product_reference_unresolved') {
    return `Nie udało się odtworzyć ${exact} z zapisanej referencji. Napraw referencję produktu albo wybierz jego aktualną wersję.`;
  }
  if (code === 'behavior_binding_stale' || code === 'behavior_binding_version_stale') {
    return `ProductBehavior binding dla ${exact} jest nieaktualny. Odśwież dane produktu i uruchom PI ponownie.`;
  }
  if (code === 'facts_fingerprint_stale' || code === 'shared_facts_stale') {
    return `Fakty dla ${exact} zmieniły się od ostatniego przeliczenia. Odśwież produkt i uruchom PI ponownie.`;
  }
  if (code === 'taxonomy_version_stale') {
    return `Taksonomia dla ${exact} zmieniła się od ostatniego przeliczenia. Odśwież produkt i uruchom PI ponownie.`;
  }
  if (code === 'product_version_stale' || code === 'product_identity_stale'
      || code === 'catalog_version_identity_mismatch') {
    return `Wersja lub tożsamość ${exact} jest nieaktualna. Wybierz aktualną wersję produktu.`;
  }
  if (code === 'mapper_mapping_stale' || code === 'mapper_entity_identity_mismatch') {
    return `Mapowanie Mapper dla ${exact} jest nieaktualne. Odśwież dokładne powiązanie Mapper.`;
  }
  if (code === 'main_policy_stale') {
    return `Polityka Main dla ${exact} jest nieaktualna. Odśwież produkt i uruchom PI ponownie.`;
  }
  if (code === 'classification_pending') {
    return `Klasyfikacja dla ${exact} nadal trwa. Poczekaj na zakończenie i kliknij PI ponownie.`;
  }
  if (code === 'classification_failed') {
    return `Klasyfikacja dla ${exact} zakończyła się błędem. Uruchom klasyfikację ponownie albo wróć do receptury.`;
  }
  if (code === 'approved_for_base_false') {
    return `Dokładny ${exact} ma approved_for_base=false. Wybierz produkt zatwierdzony dla Base.`;
  }
  if (code === 'approved_for_engines_false') {
    return `Dokładny ${exact} ma approved_for_engines=false. Może pozostać w Base, ale PI nie wykona obliczeń; wybierz produkt zatwierdzony dla Engine.`;
  }
  if (code === 'missing_technical_fields') {
    return `Dokładny ${exact} nie ma wymaganych pól technicznych: ${parsed.details || 'brak listy pól'}. Uzupełnij wskazane pola i przelicz ponownie.`;
  }
  if (code === 'process_evidence_unknown') {
    return `Dokładny ${exact} nie ma dowodu procesu. Obliczenia techniczne pozostają dostępne; dodaj dowód procesu przed Process/Production.`;
  }
  if (code === 'mapper_mapping_missing') {
    return `Dokładny ${exact} nie ma powiązania Mapper. Wybierz inną wersję produktu albo ustaw dokładne mapowanie.`;
  }
  if (code === 'profile_not_approved') {
    return `Dokładny ${exact} nie jest zgodny z bieżącym profilem. Zmień profil albo wybierz zgodny produkt.`;
  }
  if (code === 'main_policy_not_approved') {
    return `Dokładny ${exact} nie ma zatwierdzonej polityki Main. Użyj go jako Standard albo wybierz produkt z dokładną polityką Main.`;
  }
  if (code === 'module_permission_missing') {
    return `Dokładny ${exact} nie ma uprawnienia ProductBehavior do tego modułu. Wybierz wersję kwalifikowaną dla modułu albo uzupełnij jego wymagane dane.`;
  }
  if (code === 'nutrition_facts_missing' || code === 'allergen_facts_missing') {
    const facts = code === 'nutrition_facts_missing' ? 'wartości odżywczych' : 'składników i alergenów';
    return `Dokładny ${exact} nie ma kompletnych danych ${facts}. Uzupełnij etykietę produktu i przelicz ponownie.`;
  }
  if (code === 'module_not_eligible') {
    return `Dokładny ${exact} pozostaje niedostępny z powodu rzeczywistej bramki modułu. Wróć do receptury i wybierz produkt kwalifikowany dla ${module}.`;
  }
  return `Dokładny ${exact} jest zablokowany przez ${code}. Wróć do receptury, odśwież dane produktu i wybierz kwalifikowaną wersję.`;
}
