/** In-memory DiscoveryPort simulating the legacy scan-session / finalize / product-request semantics. */
import type { CodeIdentity, ExactCandidate, RequestContext } from '../contracts';
import type {
  AnalyzeOutcome,
  CustomerFamily,
  DiscoveryPort,
  DiscoverySession,
  FactLedger,
  FinalizeInput,
  FinalizeOutcome,
  LabelImage,
  OwnRequest,
  RequestOutcome,
  ResearchOutcome,
  ScanResultLike,
} from '../discovery/contracts';

const CRITICAL = ['identity.displayName', 'nutrition.energyKcal', 'ingredientsText'] as const;

export interface ProviderFacts {
  displayName?: string;
  brand?: string;
  countryOfOrigin?: string;
  sourceType?: 'manufacturer' | 'barcode_registry' | 'retailer' | 'web_search';
  url?: string;
}
/** a second provider answering the same field: the legacy server merge keeps the higher-ranked value and lists both sources */
export interface SecondProviderFacts {
  brand?: string;
  sourceType: 'manufacturer' | 'barcode_registry' | 'retailer' | 'web_search';
  url?: string;
}
export interface LabelFacts {
  displayName?: string;
  brand?: string;
  ingredientsText?: string;
  energyKcal?: number;
  countryOfOrigin?: string;
}

function missingOf(result: ScanResultLike | null): string[] {
  const present = new Set<string>();
  if (result?.identity?.displayName) present.add('identity.displayName');
  if (typeof result?.nutrition?.['energyKcal'] === 'number') present.add('nutrition.energyKcal');
  if (result?.ingredientsText) present.add('ingredientsText');
  return CRITICAL.filter((c) => !present.has(c));
}

export class FakeDiscovery implements DiscoveryPort {
  serverCatalogue = new Map<string, ExactCandidate>();
  provider = new Map<string, ProviderFacts>();
  secondProvider = new Map<string, SecondProviderFacts>();
  clock = 1_000;
  providerError: 'provider_timeout' | 'provider_failed' | 'provider_unavailable' | null = null;
  label = new Map<string, LabelFacts>();
  /** the canonical ProductBehaviour authority's verdict per created product (never invented here) */
  authorityEngineUsable = new Map<string, boolean>();
  sessions = new Map<string, DiscoverySession>();
  created = new Map<
    string,
    { productId: string; productCode: string | null; engineUsable: boolean }
  >();
  requests = new Map<string, OwnRequest>();
  calls: string[] = [];

  private session(identity: CodeIdentity): DiscoverySession {
    let s = this.sessions.get(identity.canonicalGtin13);
    if (!s) {
      s = {
        sessionId: `sess-${identity.canonicalGtin13}`,
        identity,
        result: null,
        overlayState: 'SCAN_DRAFT',
        missingCritical: [...CRITICAL],
        usage: { visionCalls: 0, webCalls: 0 },
      };
      this.sessions.set(identity.canonicalGtin13, s);
    }
    return s;
  }
  async research(identity: CodeIdentity, ctx?: RequestContext): Promise<ResearchOutcome> {
    this.calls.push(`research:${identity.canonicalGtin13}`);
    if (ctx) this.clock = ctx.now;
    const exact = this.serverCatalogue.get(identity.canonicalGtin13);
    if (exact) return { kind: 'existing_product', product: exact };
    const s = this.session(identity);
    if (this.providerError)
      return { kind: 'researched', session: s, evidenceError: this.providerError };
    const p = this.provider.get(identity.canonicalGtin13);
    if (p) {
      const src = p.sourceType ?? 'manufacturer';
      const fields = ['identity.displayName', 'identity.brand', 'identity.countryOfOrigin'].filter(
        (f) =>
          (f === 'identity.displayName' && p.displayName) ||
          (f === 'identity.brand' && p.brand) ||
          (f === 'identity.countryOfOrigin' && p.countryOfOrigin),
      );
      const externalSources = [
        { sourceType: src, url: p.url ?? null, title: null, fieldsUsed: fields },
      ];
      let brand = p.brand ?? null;
      const second = this.secondProvider.get(identity.canonicalGtin13);
      if (second?.brand) {
        // legacy rank: manufacturer 3 > barcode_registry 2 > retailer 1 > web_search 0 — the winner's value is kept,
        // both sources are listed as contributors; the losing VALUE is not carried by the legacy payload
        const rank = { manufacturer: 3, barcode_registry: 2, retailer: 1, web_search: 0 } as const;
        if (rank[second.sourceType] > rank[src]) brand = second.brand;
        externalSources.push({
          sourceType: second.sourceType,
          url: second.url ?? null,
          title: null,
          fieldsUsed: ['identity.brand'],
        });
      }
      s.result = {
        ...(s.result ?? {}),
        identity: {
          displayName: p.displayName ?? null,
          brand,
          countryOfOrigin: p.countryOfOrigin ?? null,
        },
        evidence: [],
        externalSources,
        conflicts: [],
      };
      s.usage = { ...s.usage, webCalls: externalSources.length };
    }
    s.missingCritical = missingOf(s.result);
    s.recordedAt = this.clock;
    return { kind: 'researched', session: s, evidenceError: null };
  }
  async analyzeLabel(
    session: DiscoverySession,
    images: readonly LabelImage[],
  ): Promise<AnalyzeOutcome> {
    this.calls.push(`analyze:${session.identity.canonicalGtin13}:${images.length}`);
    const s = this.session(session.identity);
    const l = this.label.get(session.identity.canonicalGtin13) ?? {};
    const prior = s.result ?? {};
    const conflicts = [...(prior.conflicts ?? [])];
    const evidence = [...(prior.evidence ?? [])];
    const identity = { ...(prior.identity ?? {}) };
    const take = (
      field: 'displayName' | 'brand' | 'countryOfOrigin',
      value: string | undefined,
    ) => {
      if (!value) return;
      const external = prior.identity?.[field];
      if (external && external !== value)
        conflicts.push({
          field: `identity.${field}`,
          labelValue: value,
          externalValue: external,
          retainedSource: 'label',
        });
      identity[field] = value; // the label outranks the web (legacy source rank), the disagreement stays visible
      evidence.push({
        field: `identity.${field}`,
        source: 'label',
        confidence: 'high',
        assetId: images[0]?.assetId,
      });
    };
    take('displayName', l.displayName);
    take('brand', l.brand);
    take('countryOfOrigin', l.countryOfOrigin);
    const nutrition = { ...(prior.nutrition ?? {}) };
    if (typeof l.energyKcal === 'number') {
      nutrition['energyKcal'] = l.energyKcal;
      evidence.push({ field: 'nutrition.energyKcal', source: 'label', confidence: 'high' });
    }
    if (l.ingredientsText)
      evidence.push({ field: 'ingredientsText', source: 'label', confidence: 'high' });
    s.result = {
      ...prior,
      identity,
      nutrition,
      ingredientsText: l.ingredientsText ?? prior.ingredientsText ?? null,
      evidence,
      conflicts,
    };
    s.missingCritical = missingOf(s.result);
    s.usage = { ...s.usage, visionCalls: s.usage.visionCalls + 1 };
    s.recordedAt = this.clock + 1;
    return { kind: 'analyzed', session: s };
  }
  async finalize(session: DiscoverySession, input: FinalizeInput): Promise<FinalizeOutcome> {
    this.calls.push(`finalize:${session.identity.canonicalGtin13}`);
    const s = this.session(session.identity);
    if (!s.result?.identity?.displayName) return { kind: 'identity_required' };
    if (!input.customerFamily)
      return {
        kind: 'family_confirmation_required',
        options: [
          'dairy',
          'fruit',
          'cocoa_chocolate',
          'nut_paste',
          'sweetener',
          'technical',
          'other',
        ] satisfies CustomerFamily[],
      };
    const missing = missingOf(s.result);
    if (missing.length > 0)
      return { kind: 'not_ready', missingCritical: missing, reasons: ['critical_fields_missing'] };
    const gtin = session.identity.canonicalGtin13;
    const existing = this.created.get(gtin);
    if (existing) return { kind: 'created', ...existing, existing: true };
    const created = {
      productId: `CA-${gtin}`,
      productCode: `CA-ING-${gtin.slice(-6)}`,
      engineUsable: this.authorityEngineUsable.get(`CA-${gtin}`) ?? false,
    };
    this.created.set(gtin, created);
    return { kind: 'created', ...created, existing: false };
  }
  async submitRequest(
    identity: CodeIdentity,
    ledger: FactLedger,
    _session: DiscoverySession | null,
    ctx: RequestContext,
  ): Promise<RequestOutcome> {
    this.calls.push(
      `request:${identity.canonicalGtin13}:${ctx.productCountry ?? 'none'}:${ledger.facts.length}`,
    );
    const exact = this.serverCatalogue.get(identity.canonicalGtin13);
    if (exact) return { kind: 'existing_product', product: exact };
    const existing = this.requests.get(identity.canonicalGtin13);
    if (existing)
      return { kind: 'product_request', requestId: existing.requestId, status: existing.status };
    const req = {
      requestId: `REQ-${identity.canonicalGtin13}`,
      status: 'SUBMITTED',
      approvedProductId: null,
    };
    this.requests.set(identity.canonicalGtin13, req);
    return { kind: 'product_request', requestId: req.requestId, status: req.status };
  }
  async findOwnRequest(identity: CodeIdentity): Promise<OwnRequest | null> {
    return this.requests.get(identity.canonicalGtin13) ?? null;
  }
}
