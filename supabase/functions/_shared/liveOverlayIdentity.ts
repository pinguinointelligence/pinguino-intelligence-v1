/**
 * The last hop, shared by every way a product enters the catalogue.
 *
 * A scanned or imported product used to be saved correctly and then have nowhere to go:
 * a recipe line needs BASE_RECIPE eligibility, and that is granted only to a product
 * carrying an authorized Mapper identity — until now an administrator's decision.
 *
 * `authorize_live_overlay_mapper_identity_v1` is the automatic route for the case that
 * does not need a human: an ordinary, safe, fully-declared food product whose OWN declared
 * composition agrees with exactly one verified Mapper row. It computes the candidate, the
 * agreement and the safety predicate itself — the caller passes a product id and nothing
 * else — and it refuses ambiguity, high-risk additives, technical/dosage products and
 * incomplete labels, leaving them for review exactly as before.
 *
 * Both `product-scan-finalize` and `catalog-submit` call this, so the Scanner and INTIMPORT
 * reach identical capability through identical authority.
 */
export interface LiveOverlayAuthorizationOutcome {
  authorized: boolean;
  reason?: string;
  mapperIngredientId?: string | null;
  agreement?: Record<string, unknown> | null;
  proposal?: Record<string, unknown> | null;
}

export async function authorizeLiveOverlayIdentity(input: {
  service: { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };
  actorUserId: string;
  productId: string;
}): Promise<LiveOverlayAuthorizationOutcome> {
  try {
    const { data, error } = await input.service.rpc('authorize_live_overlay_mapper_identity_v1', {
      p_actor_user_id: input.actorUserId,
      p_product_id: input.productId,
    });
    // The product is saved either way. A refused or failed identity means it waits for a
    // human — never that the ingest that just succeeded gets rolled back.
    if (error) return { authorized: false, reason: 'live_overlay_authorization_unavailable' };
    const outcome = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    return {
      authorized: outcome.authorized === true,
      reason: typeof outcome.reason === 'string' ? outcome.reason : undefined,
      mapperIngredientId:
        typeof outcome.mapperIngredientId === 'string' ? outcome.mapperIngredientId : null,
      agreement:
        outcome.agreement && typeof outcome.agreement === 'object'
          ? (outcome.agreement as Record<string, unknown>)
          : null,
      proposal:
        outcome.proposal && typeof outcome.proposal === 'object'
          ? (outcome.proposal as Record<string, unknown>)
          : null,
    };
  } catch {
    return { authorized: false, reason: 'live_overlay_authorization_unavailable' };
  }
}
