/**
 * SCAN IMPORT 2.0 pipeline: ConfirmedScan → identity → resolution → behaviour authority → price
 * state → idempotent import → ScanImportV2Result. Pure orchestration over ports; no Supabase, no UI.
 */
import type { ConfirmedScan } from '@/scan-contract/confirmedScan';
import { identifyCode } from './codeIdentity';
import type {
  CodeIdentity,
  ExactCandidate,
  ExternalEvidence,
  RequestContext,
  ScanImportV2Ports,
  ScanImportV2Result,
} from './contracts';
import { resolveIdentity } from './resolver';

/** audit §6: an exact canonical match scores ≥ 97; slot-derived disambiguation is PROVISIONAL 90 */
export const CONFIDENCE = { exactCatalog: 97, localCache: 97, slotDerived: 90 } as const;

export function idempotencyKey(identity: CodeIdentity, ctx: RequestContext): string {
  return `${ctx.accountId ?? 'guest'}:${identity.canonicalGtin13}:${identity.symbology}`;
}

function isExternalEvidence(v: unknown): v is ExternalEvidence {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e['provider'] === 'string' &&
    typeof e['queriedAt'] === 'number' &&
    typeof e['query'] === 'string' &&
    Array.isArray(e['facts']) &&
    (e['facts'] as unknown[]).every(
      (f) =>
        !!f &&
        typeof f === 'object' &&
        typeof (f as Record<string, unknown>)['field'] === 'string' &&
        typeof (f as Record<string, unknown>)['value'] === 'string' &&
        typeof (f as Record<string, unknown>)['authority'] === 'string',
    ) &&
    typeof e['confidence'] === 'number'
  );
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('provider_timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function research(
  identity: CodeIdentity,
  ctx: RequestContext,
  ports: ScanImportV2Ports,
): Promise<
  Pick<Extract<ScanImportV2Result, { kind: 'unknown' }>, 'externalEvidence' | 'evidenceError'>
> {
  if (!ports.external || !ctx.online) return { externalEvidence: null, evidenceError: null };
  try {
    const raw = await withTimeout(ports.external.research(identity, ctx), ports.externalTimeoutMs);
    if (raw === null) return { externalEvidence: null, evidenceError: null };
    if (!isExternalEvidence(raw))
      return { externalEvidence: null, evidenceError: 'provider_malformed' };
    // evidence is retained verbatim (conflicts included); it never becomes a product here
    return { externalEvidence: raw, evidenceError: null };
  } catch (error) {
    const timeout = error instanceof Error && error.message === 'provider_timeout';
    return {
      externalEvidence: null,
      evidenceError: timeout ? 'provider_timeout' : 'provider_failed',
    };
  }
}

async function finish(
  identity: CodeIdentity,
  product: ExactCandidate,
  provenance: Extract<ScanImportV2Result, { kind: 'resolved_exact' }>['provenance'],
  ctx: RequestContext,
  ports: ScanImportV2Ports,
): Promise<ScanImportV2Result> {
  const behaviour = await ports.behaviour.classify(product.productId);
  if (behaviour.outcome !== 'classified')
    return {
      kind: 'needs_confirmation',
      identity,
      product,
      provenance,
      reason: behaviour.outcome === 'blocked' ? 'behaviour_blocked' : 'behaviour_review',
      behaviour: { outcome: behaviour.outcome, bindingId: behaviour.bindingId },
    };
  const price = await ports.price.priceState(product.productId, ctx);
  let imported: Extract<ScanImportV2Result, { kind: 'resolved_exact' }>['import'] = null;
  const importSkipped: 'guest' | 'offline' | null = ctx.accountId === null ? 'guest' : null;
  if (ctx.accountId !== null) {
    try {
      imported = await ports.importer.importOrLink({
        identity,
        idempotencyKey: idempotencyKey(identity, ctx),
        ctx,
      });
    } catch (error) {
      return {
        kind: 'failed',
        code: 'import_failed',
        identity,
        detail: error instanceof Error ? error.message : null,
      };
    }
  }
  await ports.offlineCache.put(ctx.accountId, {
    candidate: product,
    behaviour: { outcome: 'classified', bindingId: behaviour.bindingId },
    price,
  });
  return {
    kind: 'resolved_exact',
    identity,
    product,
    exactness: 'exact_gtin',
    provenance,
    confidence:
      provenance === 'catalog' || provenance === 'local_cache'
        ? CONFIDENCE.exactCatalog
        : CONFIDENCE.slotDerived,
    behaviour: { outcome: 'classified', bindingId: behaviour.bindingId },
    price,
    import: imported,
    importSkipped,
    needsConfirmation: false,
  };
}

export async function runScanImportV2(
  scan: ConfirmedScan,
  ctx: RequestContext,
  ports: ScanImportV2Ports,
): Promise<ScanImportV2Result> {
  const id = identifyCode(scan);
  if (!id.ok) return { kind: 'invalid_code', reason: id.reason, input: scan };
  const identity = id.identity;

  if (!ctx.online) {
    const cached = await ports.offlineCache.get(ctx.accountId, identity.canonicalGtin13);
    if (!cached) return { kind: 'offline', identity, knownLocally: false };
    return {
      kind: 'resolved_exact',
      identity,
      product: cached.candidate,
      exactness: 'exact_gtin',
      provenance: 'local_cache',
      confidence: CONFIDENCE.localCache,
      behaviour: cached.behaviour,
      price: cached.price,
      import: null,
      importSkipped: 'offline',
      needsConfirmation: false,
    };
  }

  let resolution;
  try {
    resolution = await resolveIdentity(identity, ctx, ports);
  } catch (error) {
    return {
      kind: 'failed',
      code: 'lookup_failed',
      identity,
      detail: error instanceof Error ? error.message : null,
    };
  }
  if (resolution.kind === 'network_error')
    return { kind: 'failed', code: 'connection', identity, detail: null };
  if (resolution.kind === 'ambiguous')
    return { kind: 'ambiguous', identity, candidates: resolution.candidates };
  if (resolution.kind === 'none') {
    const ev = await research(identity, ctx, ports);
    return { kind: 'unknown', identity, next: 'analyze_label', ...ev };
  }
  return finish(identity, resolution.product, resolution.provenance, ctx, ports);
}
