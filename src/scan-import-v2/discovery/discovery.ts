/**
 * Discovery orchestration: unknown confirmed code → durable, truthful lifecycle.
 *
 *   start:      own open request? → discovery_requested (continuity)
 *               research (server exact + bounded source) → existing_product | discovered_pending
 *   label:      analyze photographs → same session, same identity, ledger updated
 *   finalize:   profile + ProductBehaviour authorities → discovered_exact (engineReady from the authority only)
 *               family_confirmation_required → needs_confirmation · not_ready → discovered_pending (product NOT created)
 *   request:    product request (durable candidate, canonical = false, engine usable = false) → discovery_requested
 */
import type {
  CodeIdentity,
  ExactCandidate,
  RequestContext,
  ScanImportV2Result,
} from '../contracts';
import type {
  DiscoveryPort,
  DiscoverySession,
  DiscoveryStage,
  FactLedger,
  FinalizeInput,
  LabelImage,
} from './contracts';
import { buildLedger, stageFromLedger } from './ledger';

export type DiscoveryResult = Extract<
  ScanImportV2Result,
  {
    kind:
      | 'discovered_pending'
      | 'discovered_exact'
      | 'discovery_requested'
      | 'needs_confirmation'
      | 'failed'
      | 'resolved_exact';
  }
>;

export type DiscoveryAction =
  | { type: 'label'; images: readonly LabelImage[] }
  | { type: 'finalize'; input: FinalizeInput }
  | { type: 'request' };

function pending(
  session: DiscoverySession,
  evidenceError: Extract<
    ScanImportV2Result,
    { kind: 'discovered_pending' }
  >['evidenceError'] = null,
  note: string | null = null,
): Extract<ScanImportV2Result, { kind: 'discovered_pending' }> {
  const ledger = buildLedger(session.identity, session.result, session.missingCritical, {
    sessionId: session.sessionId,
    recordedAt: session.recordedAt ?? null,
  });
  const stage = stageFromLedger(ledger);
  const next: Extract<ScanImportV2Result, { kind: 'discovered_pending' }>['next'] =
    !ledger.facts.some((f) => f.source === 'label')
      ? 'label_photo'
      : ledger.missingCritical.length > 0
        ? 'label_photo'
        : 'finalize';
  return {
    kind: 'discovered_pending',
    identity: session.identity,
    sessionId: session.sessionId,
    stage,
    ledger,
    next,
    evidenceError,
    note,
    engineReady: false,
    canonical: false,
  };
}

export function discoveredExact(
  identity: CodeIdentity,
  ledger: FactLedger,
  created: {
    productId: string;
    productCode: string | null;
    engineUsable: boolean;
    existing: boolean;
  },
  sessionId: string,
): Extract<ScanImportV2Result, { kind: 'discovered_exact' }> {
  const product: ExactCandidate = {
    productId: created.productId,
    productCode: created.productCode,
    displayName: ledger.identity.name ?? identity.value,
    brand: ledger.identity.brand,
    ean: identity.canonicalGtin13,
    strength: 'provisional_linked',
    entityKind: 'customer_provisional',
    engineReady: created.engineUsable,
    mapperSlotId: null,
    country: null,
    currentVersionId: null,
    evidence: { createdThroughFinalize: true, existing: created.existing },
  };
  const stage: DiscoveryStage = created.engineUsable
    ? 'engine_ready'
    : ledger.missingCritical.length === 0
      ? 'behaviour_bound'
      : 'exact_sku_created';
  return {
    kind: 'discovered_exact',
    identity,
    sessionId,
    product,
    stage,
    ledger,
    engineReady: created.engineUsable,
    behaviour: created.engineUsable
      ? { outcome: 'classified', bindingId: null }
      : { outcome: 'unknown_requires_review', bindingId: null },
    canonical: false,
    readiness: {
      engineReady: created.engineUsable,
      missingCritical: ledger.missingCritical,
      note: created.engineUsable
        ? null
        : 'technical profile incomplete or ProductBehaviour unresolved — exact identity preserved, not usable by the Engine yet',
    },
  };
}

export async function startDiscovery(
  identity: CodeIdentity,
  ctx: RequestContext,
  port: DiscoveryPort,
): Promise<DiscoveryResult> {
  const own = await port.findOwnRequest(identity, ctx);
  if (own && !own.approvedProductId) {
    return {
      kind: 'discovery_requested',
      identity,
      requestId: own.requestId,
      status: own.status,
      stage: 'evidence_collected',
      ledger: buildLedger(identity, null, [], { recordedAt: ctx.now }),
      canonical: false,
      engineReady: false,
    };
  }
  const r = await port.research(identity, ctx);
  if (r.kind === 'existing_product')
    return {
      kind: 'resolved_exact',
      identity,
      product: r.product,
      exactness: 'exact_gtin',
      provenance: 'catalog',
      confidence: 97,
      behaviour: {
        outcome: r.product.engineReady ? 'classified' : 'unknown_requires_review',
        bindingId: null,
      } as never,
      price: { state: 'missing', pricePerKg: null, currency: null, source: 'missing' },
      import: null,
      importSkipped: null,
      needsConfirmation: false,
    } as DiscoveryResult;
  if (r.kind === 'skipped') return pending(r.session, null, `research skipped: ${r.reason}`);
  return pending(r.session, r.evidenceError);
}

export async function continueDiscovery(
  session: DiscoverySession,
  action: DiscoveryAction,
  ctx: RequestContext,
  port: DiscoveryPort,
): Promise<DiscoveryResult> {
  if (action.type === 'label') {
    const a = await port.analyzeLabel(session, action.images, ctx);
    if (a.kind === 'existing_product')
      return {
        kind: 'resolved_exact',
        identity: session.identity,
        product: a.product,
        exactness: 'exact_gtin',
        provenance: 'catalog',
        confidence: 97,
        behaviour: {
          outcome: a.product.engineReady ? 'classified' : 'unknown_requires_review',
          bindingId: null,
        } as never,
        price: { state: 'missing', pricePerKg: null, currency: null, source: 'missing' },
        import: null,
        importSkipped: null,
        needsConfirmation: false,
      } as DiscoveryResult;
    return pending(a.session);
  }
  const ledger = buildLedger(session.identity, session.result, session.missingCritical, {
    sessionId: session.sessionId,
    recordedAt: session.recordedAt ?? null,
  });
  if (action.type === 'request') {
    const q = await port.submitRequest(session.identity, ledger, session, ctx);
    if (q.kind === 'existing_product')
      return {
        kind: 'resolved_exact',
        identity: session.identity,
        product: q.product,
        exactness: 'exact_gtin',
        provenance: 'catalog',
        confidence: 97,
        behaviour: { outcome: 'classified', bindingId: null },
        price: { state: 'missing', pricePerKg: null, currency: null, source: 'missing' },
        import: null,
        importSkipped: null,
        needsConfirmation: false,
      };
    return {
      kind: 'discovery_requested',
      identity: session.identity,
      requestId: q.requestId,
      status: q.status,
      stage: stageFromLedger(ledger),
      ledger,
      canonical: false,
      engineReady: false,
    };
  }
  const f = await port.finalize(session, action.input, ctx);
  switch (f.kind) {
    case 'created':
      return discoveredExact(session.identity, ledger, f, session.sessionId);
    case 'family_confirmation_required':
      return {
        kind: 'needs_confirmation',
        identity: session.identity,
        product: null,
        provenance: 'catalog',
        reason: 'family_confirmation',
        behaviour: { outcome: 'unknown_requires_review', bindingId: null },
        sessionId: session.sessionId,
        options: f.options,
      };
    case 'not_ready':
      return {
        ...pending({ ...session, missingCritical: f.missingCritical }),
        note: `not ready: ${f.reasons.join(', ')}`,
      };
    case 'profile_rejected':
      return { ...pending(session), note: `profile rejected by the authority: ${f.reason}` };
    case 'identity_required':
      return {
        ...pending(session),
        next: 'label_photo',
        note: 'identity required: no trustworthy name/brand yet',
      };
  }
}
