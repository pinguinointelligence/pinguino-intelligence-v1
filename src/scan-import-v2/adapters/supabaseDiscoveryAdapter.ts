/**
 * Real DiscoveryPort over the EXISTING authorities: `product-scan-analyze` (ean_lookup + label analysis),
 * `product-scan-finalize` (profile + ProductBehaviour authorities → customer-provisional product) and the
 * product-request lifecycle (`gellatti_submit_product_request_v1`, `gellatti_my_product_requests_v1`).
 * Request/response shapes mirror `src/services/productScanner.ts` exactly; nothing legacy is modified.
 */
import type { CodeIdentity, ExactCandidate } from '../contracts';
import { NetworkError } from '../contracts';
import type {
  AnalyzeOutcome,
  DiscoveryPort,
  DiscoverySession,
  FactLedger,
  FinalizeOutcome,
  OwnRequest,
  RequestOutcome,
  ResearchOutcome,
  ScanResultLike,
  LabelFailureReason,
} from '../discovery/contracts';

export interface FunctionsClientLike {
  functions: {
    invoke(
      name: string,
      options: { body: unknown },
    ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

const NETWORK =
  /fetch failed|failed to fetch|network|econn|enotfound|FunctionsFetchError|FunctionsRelayError/i;
const LEGACY_FORMAT: Record<CodeIdentity['symbology'], 'EAN_13' | 'EAN_8' | 'UPC_A' | 'UPC_E'> = {
  'EAN-13': 'EAN_13',
  'EAN-8': 'EAN_8',
  'UPC-A': 'UPC_A',
  'UPC-E': 'UPC_E',
};

/** legacy ValidBarcode for the scan-session functions (value + format + lookupValue) */
export function legacyBarcode(identity: CodeIdentity): {
  value: string;
  format: string;
  lookupValue: string;
} {
  const lookupValue =
    identity.symbology === 'UPC-E' ? (identity.lookupKeys[1] ?? identity.value) : identity.value;
  return { value: identity.value, format: LEGACY_FORMAT[identity.symbology], lookupValue };
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function exactFromServer(p: Record<string, unknown>, identity: CodeIdentity): ExactCandidate {
  return {
    productId: String(p['id'] ?? ''),
    productCode: typeof p['productCode'] === 'string' ? (p['productCode'] as string) : null,
    displayName: String(p['displayName'] ?? ''),
    brand: (p['brand'] as string | null) ?? null,
    ean: identity.canonicalGtin13,
    strength: 'canonical_shared',
    entityKind: p['entityKind'] === 'pi_base' ? 'pi_base' : 'commercial_product',
    engineReady: p['engineReady'] === true,
    mapperSlotId: null,
    country: null,
    currentVersionId: null,
    evidence: { status: p['status'] ?? null, source: 'scan_session_exact' },
  };
}

export function ledgerToLegacyResult(
  identity: CodeIdentity,
  ledger: FactLedger,
): Record<string, unknown> {
  const value = (field: string) => ledger.facts.find((f) => f.field === field)?.value ?? null;
  const nutrition: Record<string, unknown> = {};
  for (const f of ledger.facts)
    if (f.field.startsWith('nutrition.')) nutrition[f.field.slice('nutrition.'.length)] = f.value;
  return {
    identity: {
      displayName: ledger.identity.name,
      originalName: ledger.identity.name,
      brand: ledger.identity.brand,
      countryOfOrigin: value('identity.countryOfOrigin'),
    },
    barcodes: [{ kind: LEGACY_FORMAT[identity.symbology], value: identity.value }],
    ingredientsText: value('ingredientsText'),
    allergensText: value('allergensText'),
    nutrition,
  };
}

export function createSupabaseDiscoveryPort(
  client: FunctionsClientLike,
  options: { newSessionId?: () => string } = {},
): DiscoveryPort {
  const newId = options.newSessionId ?? (() => globalThis.crypto.randomUUID());
  const sessions = new Map<string, DiscoverySession>();
  const adopt = (session: DiscoverySession): DiscoverySession => {
    const s = sessions.get(session.identity.canonicalGtin13);
    if (s) return s;
    sessions.set(session.identity.canonicalGtin13, session);
    return session;
  };
  const sessionFor = (identity: CodeIdentity): DiscoverySession => {
    let s = sessions.get(identity.canonicalGtin13);
    if (!s) {
      s = {
        sessionId: newId(),
        identity,
        result: null,
        overlayState: null,
        missingCritical: [],
        usage: { visionCalls: 0, webCalls: 0 },
      };
      sessions.set(identity.canonicalGtin13, s);
    }
    return s;
  };
  /** FunctionsHttpError carries the response in `context`; the server's own error code lives in its JSON body. */
  const serverCode = async (error: unknown): Promise<string | null> => {
    const ctx = (
      error as {
        context?: { json?: () => Promise<unknown>; clone?: () => { json(): Promise<unknown> } };
      }
    ).context;
    try {
      const body = ctx?.clone ? await ctx.clone().json() : ctx?.json ? await ctx.json() : null;
      const code = (body as { error?: unknown } | null)?.error;
      return typeof code === 'string' ? code : null;
    } catch {
      return null;
    }
  };
  /** The finalize authority answers "not ready" / "confirm family" as structured 409 bodies with a `kind`. */
  const structuredVerdict = async (error: unknown): Promise<Record<string, unknown> | null> => {
    const ctx = (error as { context?: { clone?: () => { json(): Promise<unknown> } } }).context;
    try {
      const body = ctx?.clone ? await ctx.clone().json() : null;
      return body &&
        typeof body === 'object' &&
        typeof (body as Record<string, unknown>)['kind'] === 'string'
        ? (body as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };
  const invoke = async (name: string, body: unknown): Promise<Record<string, unknown>> => {
    const { data, error } = await client.functions.invoke(name, { body });
    if (error) {
      if (NETWORK.test(error.message)) throw new NetworkError(error.message);
      const verdict = await structuredVerdict(error);
      if (verdict) return verdict;
      const code = await serverCode(error);
      throw new Error(`${name}: ${code ?? error.message}`);
    }
    const d = obj(data);
    if (typeof d['error'] === 'string') throw new Error(`${name}: ${d['error']}`);
    return d;
  };
  const applySession = (s: DiscoverySession, d: Record<string, unknown>): DiscoverySession => {
    s.result = (d['result'] as ScanResultLike | null) ?? s.result;
    s.overlayState = (d['overlayState'] as string | null) ?? s.overlayState;
    s.missingCritical = Array.isArray(d['missingCriticalFields'])
      ? (d['missingCriticalFields'] as string[])
      : s.missingCritical;
    const u = obj(d['usage']);
    s.usage = {
      visionCalls: Number(u['visionCalls'] ?? s.usage.visionCalls),
      webCalls: Number(u['webCalls'] ?? s.usage.webCalls),
    };
    return s;
  };

  const research = async (identity: CodeIdentity): Promise<ResearchOutcome> => {
    const s = sessionFor(identity);
    const d = await invoke('product-scan-analyze', {
      sessionId: s.sessionId,
      mode: 'ean_lookup',
      images: [],
      barcode: legacyBarcode(identity),
    });
    if (d['kind'] === 'existing_product')
      return { kind: 'existing_product', product: exactFromServer(obj(d['product']), identity) };
    applySession(s, d);
    if (typeof d['skipped'] === 'string')
      return { kind: 'skipped', session: s, reason: d['skipped'] as string };
    return {
      kind: 'researched',
      session: s,
      evidenceError: d['providerUnavailable'] === true ? 'provider_unavailable' : null,
    };
  };

  return {
    research,
    async analyzeLabel(session, images): Promise<AnalyzeOutcome> {
      let s = adopt(session);
      // The analysis authority allows two vision calls per scan session: one 'fast' call, then one
      // 'accurate' retry (same idempotency key per kind; a different payload under a used key raises).
      // The call kind therefore follows the session's recorded usage, never a client guess.
      const attempt = (accurate: boolean) =>
        invoke('product-scan-analyze', {
          sessionId: s.sessionId,
          images: [...images],
          barcode: legacyBarcode(session.identity),
          accurateRetry: accurate,
          missingFields: [...s.missingCritical],
        });
      let d: Record<string, unknown>;
      try {
        try {
          d = await attempt(s.usage.visionCalls >= 1);
        } catch (first) {
          const m = first instanceof Error ? first.message : String(first);
          if (
            s.usage.visionCalls < 1 &&
            /fast_call_already_used|scanner_budget_preflight_failed/.test(m)
          ) {
            // the local usage record was lost (reload): the session already had its fast call
            d = await attempt(true);
          } else if (
            /analysis_call_already_failed|accurate_retry_requires_fast_evidence|invalid_scan_session|scan_session_ownership_mismatch/.test(
              m,
            )
          ) {
            // a session the authority will not analyse again (an earlier call failed inside it): the
            // identity and every fact survive in a fresh session — the customer never restarts
            sessions.delete(session.identity.canonicalGtin13);
            const r = await research(session.identity);
            if (r.kind === 'existing_product') throw first;
            s = r.session;
            d = await attempt(false);
          } else throw first;
        }
      } catch (error) {
        // one failed image is a failed image — never a lost session (owner QA 2026-09-05)
        const m = error instanceof Error ? error.message : String(error);
        const reason: LabelFailureReason = /analysis_burst/.test(m)
          ? 'burst'
          : /session_vision_limit|scanner_call_cost_limit|daily_cost|monthly_cost/.test(m)
            ? 'vision_limit'
            : /scan_asset_identity_conflict/.test(m)
              ? 'asset_conflict'
              : /scan_asset_metadata_failed|invalid_scan_image|scan_(image|payload)_too_large/.test(
                    m,
                  )
                ? 'asset_metadata'
                : error instanceof NetworkError
                  ? 'network'
                  : /scanner_(disabled|analysis_not_configured|openai|unavailable|model_pricing|budget)|provider/.test(
                        m,
                      )
                    ? 'provider'
                    : 'other';
        return {
          kind: 'failed',
          reason,
          retryAfterMs: reason === 'burst' ? 60_000 : null,
          detail: m,
        };
      }
      if (d['kind'] === 'existing_product')
        return {
          kind: 'existing_product',
          product: exactFromServer(obj(d['product']), session.identity),
        };
      return { kind: 'analyzed', session: applySession(s, d) };
    },
    async finalize(session, input, ctx): Promise<FinalizeOutcome> {
      const s = adopt(session);
      let d: Record<string, unknown>;
      try {
        d = await invoke('product-scan-finalize', {
          action: 'finalize',
          sessionId: s.sessionId,
          idempotencyKey: `scan-import-v2:${ctx.accountId}:${session.identity.canonicalGtin13}:finalize`,
          customerFamily: input.customerFamily ?? null,
          confirmations: input.confirmations ?? {},
          privateOverlay: input.privateOverlay ?? {},
          savePrivateNotReady: input.savePrivateNotReady === true,
        });
      } catch (error) {
        const m = error instanceof Error ? error.message : '';
        if (/customer_product_profile_rejected|customer_product_profile_unavailable/.test(m))
          return { kind: 'profile_rejected', reason: m };
        if (/customer_product_identity_required/.test(m)) return { kind: 'identity_required' };
        throw error;
      }
      switch (d['kind']) {
        case 'family_confirmation_required':
          return {
            kind: 'family_confirmation_required',
            options: [
              'dairy',
              'fruit',
              'cocoa_chocolate',
              'nut_paste',
              'alcohol',
              'sweetener',
              'beverage',
              'technical',
              'other',
            ],
          };
        case 'customer_product_not_ready': {
          // the profile/ProductBehaviour authorities refused an Engine product; carry WHY (never invent readiness)
          const assessment = obj(
            obj(d['profile'])['productAccuracyAssessment'] ?? d['productAccuracyAssessment'],
          );
          const recognition = obj(d['recognition']);
          const reasons = [
            ...(Array.isArray(d['reasons']) ? (d['reasons'] as string[]) : []),
            ...(Array.isArray(assessment['criticalBlockers'])
              ? (assessment['criticalBlockers'] as string[])
              : []),
            ...(typeof assessment['roleReadiness'] === 'string'
              ? [`roleReadiness:${assessment['roleReadiness']}`]
              : []),
            ...(typeof recognition['productArchetype'] === 'string'
              ? [
                  `recognition:${recognition['productArchetype']}/${recognition['intendedUsageRole'] ?? '?'}`,
                ]
              : []),
          ];
          return {
            kind: 'not_ready',
            missingCritical: Array.isArray(d['missingCriticalFields'])
              ? (d['missingCriticalFields'] as string[])
              : Array.isArray(assessment['missingCritical'])
                ? (assessment['missingCritical'] as string[])
                : [],
            reasons: reasons.length > 0 ? reasons : ['customer_product_not_ready'],
          };
        }
        case 'profile_preview':
          return {
            kind: 'not_ready',
            missingCritical: Array.isArray(d['criticalGaps'])
              ? (d['criticalGaps'] as string[])
              : [],
            reasons: ['profile_preview'],
          };
        default:
          return {
            kind: 'created',
            productId: String(d['productId'] ?? ''),
            productCode: typeof d['productCode'] === 'string' ? (d['productCode'] as string) : null,
            displayName: typeof d['displayName'] === 'string' ? (d['displayName'] as string) : null,
            brand: typeof d['brand'] === 'string' ? (d['brand'] as string) : null,
            engineUsable: d['engineUsable'] === true,
            privateNotReady: d['privateNotReady'] === true,
            existing: d['kind'] !== 'customer_added_product',
          };
      }
    },
    async submitRequest(identity, ledger, session, ctx): Promise<RequestOutcome> {
      const { data, error } = await client.rpc('gellatti_submit_product_request_v1', {
        p_scan_session_id: session?.sessionId ?? null,
        p_market_country_code: ctx.productCountry,
        p_idempotency_key: `scan-import-v2:${ctx.accountId}:${identity.canonicalGtin13}:request`,
        p_payload: {
          result: ledgerToLegacyResult(identity, ledger),
          provenance: {
            authority: 'SCAN_IMPORT_V2_DISCOVERY_V1',
            scanCore: { symbology: identity.symbology, gtin: identity.canonicalGtin13 },
            sourceUrls: ledger.facts.map((f) => f.sourceUrl).filter((u): u is string => Boolean(u)),
            conflicts: ledger.conflicts,
          },
        },
      });
      if (error) {
        if (NETWORK.test(error.message)) throw new NetworkError(error.message);
        throw new Error(`submit_product_request: ${error.message}`);
      }
      const d = obj(data);
      if (d['kind'] === 'existing_product')
        return {
          kind: 'existing_product',
          product: exactFromServer(
            {
              id: d['productId'],
              productCode: d['productCode'],
              displayName: d['displayName'],
              brand: null,
              entityKind: 'commercial_product',
              engineReady: true,
            },
            identity,
          ),
        };
      return {
        kind: 'product_request',
        requestId: String(d['requestId'] ?? ''),
        status: String(d['status'] ?? 'SUBMITTED'),
      };
    },
    async findOwnRequest(identity): Promise<OwnRequest | null> {
      // gellatti_my_product_requests_v1 → array of { id, ean, name, brand, status, approvedProductId, ... } (verified on staging)
      const { data, error } = await client.rpc('gellatti_my_product_requests_v1', {
        p_archived: false,
      });
      if (error) return null;
      const list = Array.isArray(data)
        ? data
        : Array.isArray(obj(data)['requests'])
          ? (obj(data)['requests'] as unknown[])
          : [];
      const CLOSED = new Set(['REJECTED', 'DUPLICATE', 'USER_CANCELED']);
      let approved: OwnRequest | null = null;
      for (const raw of list) {
        const r = obj(raw);
        const ean = String(r['ean'] ?? r['detectedEan'] ?? r['detected_ean'] ?? '');
        if (!identity.lookupKeys.includes(ean)) continue;
        const status = String(r['status'] ?? '');
        const requestId = String(r['id'] ?? r['requestId'] ?? '');
        if (status === 'APPROVED') {
          approved = {
            requestId,
            status,
            approvedProductId:
              String(r['approvedProductId'] ?? r['approved_product_id'] ?? '') || null,
          };
          continue;
        }
        if (!CLOSED.has(status)) return { requestId, status, approvedProductId: null };
      }
      return approved;
    },
  };
}
