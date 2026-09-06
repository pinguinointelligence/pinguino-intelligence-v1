/**
 * Exact identity resolution + ONE deterministic precedence (audit §3/§4, architecture doc).
 *
 * DECISION D1 (documented, not owner-asked): the user-preferred exact SKU and the approved country
 * assignments are picker authorities that answer "which product for this Mapper slot". They may only
 * DISAMBIGUATE between exact candidates that already match the confirmed code; they never turn an
 * unknown code into a different product. An unknown code stays UNKNOWN (no silent collapse).
 */
import type {
  CodeIdentity,
  ExactCandidate,
  NetworkError,
  PreferencePort,
  RequestContext,
  ResolutionProvenance,
  CatalogPort,
} from './contracts';

export type Resolution =
  | { kind: 'exact'; product: ExactCandidate; provenance: ResolutionProvenance }
  | { kind: 'ambiguous'; candidates: readonly ExactCandidate[] }
  | { kind: 'none' }
  | { kind: 'network_error'; error: NetworkError | Error };

/** Higher is stronger. Exact SKU beats the Mapper reference row for the same EAN (identity ≠ engine mapping). */
export function strengthScore(c: ExactCandidate): number {
  const base =
    c.strength === 'canonical_shared' ? 300 : c.strength === 'provisional_linked' ? 200 : 100;
  const kind = c.entityKind === 'commercial_product' ? 2 : c.entityKind === 'pi_base' ? 1 : 0;
  return base + kind;
}

export function topCandidates(cands: readonly ExactCandidate[]): ExactCandidate[] {
  const byId = new Map<string, ExactCandidate>();
  for (const c of cands) if (!byId.has(c.productId)) byId.set(c.productId, c);
  const list = [...byId.values()];
  if (list.length === 0) return [];
  const best = Math.max(...list.map(strengthScore));
  return list.filter((c) => strengthScore(c) === best);
}

/** Guests see canonical shared rows only; provisional rows are account-scoped; private rows belong to an account. */
function visibleTo(c: ExactCandidate, ctx: RequestContext): boolean {
  if (ctx.accountId === null) return c.strength === 'canonical_shared';
  return true;
}

function sameCountryOrGlobal(c: ExactCandidate, ctx: RequestContext): boolean {
  return c.country === null || ctx.productCountry === null || c.country === ctx.productCountry;
}

export async function resolveIdentity(
  identity: CodeIdentity,
  ctx: RequestContext,
  ports: { catalog: CatalogPort; preferences: PreferencePort },
): Promise<Resolution> {
  let cands: readonly ExactCandidate[];
  try {
    cands = await ports.catalog.exactByKeys(identity.lookupKeys, ctx);
  } catch (error) {
    if (error instanceof Error && (error as { kind?: string }).kind === 'network')
      return { kind: 'network_error', error };
    throw error;
  }
  const visible = cands.filter((c) => visibleTo(c, ctx));
  const top = topCandidates(visible);
  if (top.length === 0) return { kind: 'none' };
  if (top.length === 1) return { kind: 'exact', product: top[0]!, provenance: 'catalog' };
  // Same strength, several rows: disambiguate ONLY among these candidates, in the audited order.
  const slot = top.find((c) => c.mapperSlotId)?.mapperSlotId ?? ctx.slotHint ?? null;
  if (slot) {
    const preferred = await ports.preferences.preferredExactForSlot(slot, ctx);
    const hit = preferred ? top.find((c) => c.productId === preferred.productId) : undefined;
    if (hit) return { kind: 'exact', product: hit, provenance: 'user_preferred' };
    const defaults = await ports.preferences.countryDefaultsForSlot(slot, ctx.productCountry);
    const primary = defaults.primary
      ? top.find((c) => c.productId === defaults.primary!.productId && sameCountryOrGlobal(c, ctx))
      : undefined;
    if (primary) return { kind: 'exact', product: primary, provenance: 'country_default' };
    for (const fb of defaults.fallbacks) {
      const f = top.find((c) => c.productId === fb.productId && sameCountryOrGlobal(c, ctx));
      if (f) return { kind: 'exact', product: f, provenance: 'country_fallback' };
    }
  }
  return { kind: 'ambiguous', candidates: top };
}
