/**
 * RE-ENRICHMENT of an exact product this account already holds PRIVATELY but that is not yet
 * recipe-ready (owner contract 2026-09-05: a private not-ready product is never stranded).
 *
 * A rescan of such a product runs the SAME automatic path a new product runs — server research
 * (exact GTIN sources), registry identity, Product Recognition, Mapper/Rescue completion,
 * ProductBehavior, readiness — and finalizes WITHOUT asking the customer anything. The server's
 * one-EAN authority then supersedes the provisional version on the same product when the new profile
 * is ready. When it is still not ready, the caller keeps showing the known product exactly as before.
 *
 * Pure orchestration over existing ports: no second scanner, no second Rescue, no new authority.
 */
import {
  continueDiscovery,
  identityFromEvidence,
  startDiscovery,
  type CodeIdentity,
  type CustomerFamily,
  type DiscoverySession,
  type ExternalEvidence,
  type RequestContext,
  type ScanImportV2Ports,
  type ScanImportV2Result,
} from '@/scan-import-v2';

const isExternalEvidence = (value: unknown): value is ExternalEvidence =>
  !!value && typeof value === 'object' && 'facts' in (value as Record<string, unknown>);

export async function reenrichOwnProvisional(input: {
  identity: CodeIdentity;
  ctx: RequestContext;
  ports: ScanImportV2Ports;
  familyHint?: CustomerFamily | null;
}): Promise<ScanImportV2Result | null> {
  const { identity, ctx, ports } = input;
  if (!ports.discovery || ctx.accountId === null || !ctx.online) return null;
  const discovery = ports.discovery;
  const [started, external] = await Promise.all([
    startDiscovery(identity, ctx, discovery),
    ports.external
      ? ports.external.research(identity, ctx).catch(() => null)
      : Promise.resolve(null),
  ]);
  if (started.kind !== 'discovered_pending') return started;
  const web = identityFromEvidence(isExternalEvidence(external) ? external : null);
  const session: DiscoverySession = {
    sessionId: started.sessionId,
    identity: started.identity,
    result: null,
    overlayState: null,
    missingCritical: [...started.ledger.missingCritical],
    usage: { visionCalls: 0, webCalls: 0 },
    recordedAt: Date.now(),
  };
  const customerFamily = web?.family ?? input.familyHint ?? undefined;
  return continueDiscovery(
    session,
    {
      type: 'finalize',
      input: {
        ...(customerFamily ? { customerFamily } : {}),
        confirmations: { productFields: web?.productFields ?? {} },
      },
    },
    ctx,
    discovery,
  );
}
