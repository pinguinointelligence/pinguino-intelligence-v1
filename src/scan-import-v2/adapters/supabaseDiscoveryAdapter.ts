/**
 * Real DiscoveryPort over the EXISTING authorities: `product-scan-analyze` (ean_lookup + label analysis),
 * `product-scan-finalize` (profile + ProductBehaviour authorities → customer-provisional product) and the
 * product-request lifecycle (`gellatti_submit_product_request_v1`, `gellatti_my_product_requests_v1`).
 * Request/response shapes mirror `src/services/productScanner.ts` exactly; nothing legacy is modified.
 */
import type { CodeIdentity, ExactCandidate, RequestContext } from '../contracts';
import { NetworkError } from '../contracts';
import { withProductScanFinalizeV2Contract } from '../../features/product-scanner/productScanFinalizeContract';
import { assertScanRunCurrent } from '../runAuthority';
import type {
  AnalyzeOutcome,
  ClientReadinessState,
  DiscoveryPort,
  DiscoverySession,
  FactLedger,
  FinalizeOutcome,
  OwnRequest,
  RequestOutcome,
  ResearchOutcome,
  ScanResultLike,
  FinalRoute,
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

/** Scan-session barcode payload: canonical identity is authoritative; raw/format are evidence only. */
export function legacyBarcode(identity: CodeIdentity): {
  value: string;
  format: string;
  lookupValue: string;
  canonicalValue: string;
  rawValue: string;
} {
  const canonicalValue = identity.canonicalGtin13;
  return {
    value: canonicalValue,
    format: LEGACY_FORMAT[identity.symbology],
    lookupValue: canonicalValue,
    canonicalValue,
    rawValue: identity.rawValue ?? identity.value,
  };
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function boolOrNull(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function stringList(v: unknown): string[] | null {
  return Array.isArray(v)
    ? (v.filter((entry): entry is string => typeof entry === 'string') as string[])
    : null;
}

/**
 * Normalize the current finalize assessment once. The server remains the only readiness authority;
 * the fallbacks cover the preview/saved response shapes and do not rebuild gaps from local fields.
 */
function readinessFromServer(
  d: Record<string, unknown>,
  fallbackMissing: readonly string[] = [],
): ClientReadinessState {
  const assessment = obj(d['assessment']);
  const productAccuracyAssessment = obj(
    obj(d['profile'])['productAccuracyAssessment'] ?? d['productAccuracyAssessment'],
  );
  const directCriticalGaps = stringList(d['criticalGaps']);
  const assessmentCriticalGaps = stringList(assessment['criticalGaps']);
  const productAccuracyCriticalBlockers = stringList(productAccuracyAssessment['criticalBlockers']);
  const criticalGaps = directCriticalGaps ??
    assessmentCriticalGaps ??
    productAccuracyCriticalBlockers ?? [...fallbackMissing];
  const productionReady =
    boolOrNull(d['productionReady']) ?? boolOrNull(assessment['productionReady']);
  return {
    ready: boolOrNull(d['ready']) ?? productionReady,
    productionReady,
    missingCritical: criticalGaps,
    criticalGapsKnown:
      directCriticalGaps !== null ||
      assessmentCriticalGaps !== null ||
      productAccuracyCriticalBlockers !== null ||
      fallbackMissing.length > 0,
    roleReadiness:
      stringOrNull(productAccuracyAssessment['roleReadiness']) ??
      stringOrNull(assessment['roleReadiness']),
    assessmentVersion:
      stringOrNull(d['assessmentVersion']) ?? stringOrNull(assessment['assessmentVersion']),
    assessmentHash: stringOrNull(d['assessmentHash']) ?? stringOrNull(assessment['assessmentHash']),
    assessmentSessionId: stringOrNull(d['sessionId']) ?? stringOrNull(assessment['sessionId']),
  };
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
    currentVersionId:
      typeof p['currentVersionId'] === 'string' ? (p['currentVersionId'] as string) : null,
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
    barcodes: [
      {
        kind: LEGACY_FORMAT[identity.symbology],
        value: identity.canonicalGtin13,
        format: 'EAN_13',
        capturedFormat: LEGACY_FORMAT[identity.symbology],
        rawValue: identity.rawValue ?? identity.value,
      },
    ],
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
  const sessionsByRun = new Map<string, DiscoverySession>();
  const sessionsById = new Map<string, DiscoverySession>();
  /*
    Recognition prefetch and startDiscovery intentionally race the same logical lookup. The
    explicit scan-run id identifies one scanner run, so both readers share one promise while a
    later rescan (including a retry after provider failure) gets a fresh request and receipt.
  */
  const researchByRun = new Map<string, Promise<ResearchOutcome>>();
  const remember = (session: DiscoverySession): DiscoverySession => {
    sessionsById.set(session.sessionId, session);
    return session;
  };
  const adopt = (session: DiscoverySession): DiscoverySession =>
    sessionsById.get(session.sessionId) ?? remember(session);
  const sessionFor = (identity: CodeIdentity, ctx: RequestContext): DiscoverySession => {
    const runKey = `${ctx.accountId ?? 'guest'}:${ctx.scanRun?.id ?? ctx.now}:${identity.canonicalGtin13}`;
    let s = sessionsByRun.get(runKey);
    if (!s) {
      s = {
        sessionId: newId(),
        identity,
        result: null,
        overlayState: null,
        missingCritical: [],
        usage: { visionCalls: 0, webCalls: 0 },
      };
      sessionsByRun.set(runKey, s);
      remember(s);
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

  return {
    research(identity, ctx): Promise<ResearchOutcome> {
      assertScanRunCurrent(ctx);
      const runKey = `${ctx.accountId ?? 'guest'}:${ctx.scanRun?.id ?? ctx.now}:${identity.canonicalGtin13}`;
      const current = researchByRun.get(runKey);
      if (current) return current;
      const request = (async (): Promise<ResearchOutcome> => {
        assertScanRunCurrent(ctx);
        const s = sessionFor(identity, ctx);
        const d = await invoke('product-scan-analyze', {
          sessionId: s.sessionId,
          mode: 'ean_lookup',
          images: [],
          barcode: legacyBarcode(identity),
        });
        assertScanRunCurrent(ctx);
        if (d['kind'] === 'existing_product')
          return {
            kind: 'existing_product',
            product: exactFromServer(obj(d['product']), identity),
          };
        applySession(s, d);
        // The server composes the sentence, because only the server knows whether the sources were
        // asked and answered nothing or were never reached at all.
        const notice =
          typeof d['notice'] === 'string' && d['notice'] ? (d['notice'] as string) : null;
        if (typeof d['skipped'] === 'string')
          return { kind: 'skipped', session: s, reason: d['skipped'] as string, notice };
        return {
          kind: 'researched',
          session: s,
          evidenceError: d['providerUnavailable'] === true ? 'provider_unavailable' : null,
          notice,
        };
      })();
      researchByRun.set(runKey, request);
      // Bound the mount-lifetime cache without invalidating the active run's shared promise.
      if (researchByRun.size > 32) researchByRun.delete(researchByRun.keys().next().value!);
      return request;
    },
    async analyzeLabel(session, images, ctx): Promise<AnalyzeOutcome> {
      // The session itself is adopted by id, never by canonical barcode.
      assertScanRunCurrent(ctx);
      const s = adopt(session);
      const d = await invoke('product-scan-analyze', {
        sessionId: s.sessionId,
        images: [...images],
        barcode: legacyBarcode(s.identity),
        accurateRetry: false,
        missingFields: [...s.missingCritical],
      });
      assertScanRunCurrent(ctx);
      return d['kind'] === 'existing_product'
        ? {
            kind: 'existing_product',
            product: exactFromServer(obj(d['product']), s.identity),
          }
        : { kind: 'analyzed', session: applySession(s, d) };
    },
    async finalize(session, input, ctx, saveUnverified): Promise<FinalizeOutcome> {
      assertScanRunCurrent(ctx);
      const s = adopt(session);
      let d: Record<string, unknown>;
      try {
        const finalizeBody = withProductScanFinalizeV2Contract({
          action: saveUnverified === true ? 'save_unverified' : 'finalize',
          sessionId: s.sessionId,
          idempotencyKey: `scan-import-v2:${ctx.accountId}:${s.sessionId}:finalize`,
          customerFamily: input.customerFamily ?? null,
          automaticEvidence: input.automaticEvidence ?? null,
          confirmations: input.confirmations ?? {},
          privateOverlay: input.privateOverlay ?? {},
          // binding when present: the save may persist only the verdict the customer was shown
          expectedAssessmentHash: input.expectedAssessmentHash ?? null,
        });
        d = await invoke('product-scan-finalize', finalizeBody);
      } catch (error) {
        const m = error instanceof Error ? error.message : '';
        if (/customer_product_profile_rejected|customer_product_profile_unavailable/.test(m))
          return { kind: 'profile_rejected', reason: m };
        if (/customer_product_identity_required/.test(m)) return { kind: 'identity_required' };
        throw error;
      }
      assertScanRunCurrent(ctx);
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
        case 'scan_assessment_stale':
          // the verdict moved between the screen and the save; the customer repeats, nothing is written
          return { kind: 'assessment_stale', readiness: readinessFromServer(d) };
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
          const readiness = readinessFromServer(d);
          return {
            kind: 'not_ready',
            missingCritical: readiness.missingCritical,
            // DIAGNOSTIC ONLY — never rendered to a customer (see FinalizeOutcome)
            reasons: reasons.length > 0 ? reasons : ['customer_product_not_ready'],
            assessmentHash: readiness.assessmentHash,
            readiness,
          };
        }
        case 'profile_preview': {
          const readiness = readinessFromServer(d);
          return {
            kind: 'not_ready',
            missingCritical: readiness.missingCritical,
            reasons: ['profile_preview'],
            assessmentHash: readiness.assessmentHash,
            readiness,
          };
        }
        default: {
          // the RPC decided the route from the canonical profile; never re-derive it here
          const code = typeof d['productCode'] === 'string' ? (d['productCode'] as string) : null;
          const route: FinalRoute =
            d['route'] === 'PR' || d['route'] === 'PM_READY' || d['route'] === 'PM_UNVERIFIED'
              ? (d['route'] as FinalRoute)
              : // an existing shared product reused by EAN reports no route of its own
                code?.startsWith('PR-ING-')
                ? 'PR'
                : d['engineUsable'] === true
                  ? 'PM_READY'
                  : 'PM_UNVERIFIED';
          const rawReadiness = readinessFromServer(d);
          const productionReady =
            typeof d['productionReady'] === 'boolean'
              ? (d['productionReady'] as boolean)
              : (rawReadiness.productionReady ?? false);
          const readiness: ClientReadinessState = {
            ...rawReadiness,
            ready: rawReadiness.ready ?? productionReady,
            productionReady,
          };
          return {
            kind: 'created',
            productId: String(d['productId'] ?? ''),
            productCode: code,
            engineUsable: d['engineUsable'] === true,
            existing: d['kind'] !== 'customer_added_product',
            route,
            finalConfidence:
              typeof d['finalConfidence'] === 'number' ? (d['finalConfidence'] as number) : null,
            productionReady,
            readiness,
          };
        }
      }
    },
    async submitRequest(identity, ledger, session, ctx): Promise<RequestOutcome> {
      assertScanRunCurrent(ctx);
      const { data, error } = await client.rpc('gellatti_submit_product_request_v1', {
        p_scan_session_id: session?.sessionId ?? null,
        p_market_country_code: ctx.productCountry,
        p_idempotency_key: `scan-import-v2:${ctx.accountId}:${session?.sessionId ?? ctx.scanRun?.id ?? identity.canonicalGtin13}:request`,
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
      assertScanRunCurrent(ctx);
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
