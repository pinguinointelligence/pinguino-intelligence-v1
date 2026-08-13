import type { ProductBehaviorContext, ServerResolvedProductBehavior } from '@/features/product-intelligence';
import { supabase } from '@/lib/supabase/client';

export type ProductBehaviorEntity =
  | { entityKind: 'mapper'; entityId: string }
  | { entityKind: 'catalog_product_version'; entityId: string };

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

function readServerResolvedProductBehavior(value: unknown): ServerResolvedProductBehavior | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
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

export function productBehaviorBlockedMessage(result: ServerResolvedProductBehavior): string {
  const reason = result.blockReasons[0] ?? 'context_not_approved';
  const messages: Record<string, string> = {
    behavior_binding_missing: 'Produkt nie ma jeszcze zatwierdzonej klasyfikacji technologicznej.',
    main_policy_unknown: 'Brak zatwierdzonego zakresu Main dla tego produktu i profilu.',
    base_technical_authority_missing: 'Brak bezpiecznego mapowania technicznego do Bazy.',
    context_not_approved: 'Produkt nie jest zatwierdzony w tym miejscu receptury.',
  };
  return messages[reason] ?? 'Produkt nie jest zatwierdzony w tym miejscu receptury.';
}
