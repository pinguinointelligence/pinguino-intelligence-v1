/**
 * INTIMPORT enrichment client — the browser's ONLY route to external research.
 *
 * The browser never talks to OpenAI or any web-search provider directly and
 * holds no provider credential. It calls the Gellatti Edge Function, which owns
 * the key, the flags, the caps and the source-authority classification:
 *
 *   browser → intimport-enrich (Edge) → provider
 */
import { supabase } from '@/lib/supabase/client';
import type {
  EnrichmentFact,
  EnrichmentProvider,
  EnrichmentRequest,
  EnrichmentResponse,
} from '@/features/product-intelligence/intimportEnrichment';
import type { EvidenceSource, ProductEvidenceField } from '@/features/product-intelligence/productEvidenceConfidence';
import type { SourceAuthorityClass } from '@/features/product-intelligence/sourceAuthority';

export interface IntimportEnrichmentIdentity {
  brand: string | null;
  manufacturer: string | null;
  name: string | null;
  variant: string | null;
  barcode: string | null;
  netQuantity: string | null;
  /** The owner-declared source, passed so the provider can start from it. */
  knownSourceUrl: string | null;
  /** The owner's technical/specification document. */
  technicalPdfUrl: string | null;
}

/** One step of the deterministic source order the server must obey. */
export interface IntimportResearchStep {
  kind: string;
  url: string | null;
  allowedDomains: string[];
}

interface ServerFact {
  field: string;
  value: string;
  sourceUrl: string;
  sourceDomain: string | null;
  sourceTitle: string | null;
  sourceAuthorityClass: SourceAuthorityClass;
  evidenceSource: EvidenceSource;
  retrievedAt: string;
}

export interface IntimportEnrichmentTelemetry {
  calls: number;
  webCalls: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheHit: boolean;
  model: string | null;
  sources: { url: string; title: string }[];
  notFound: string[];
  authorityByField: Record<string, SourceAuthorityClass>;
  error: string | null;
}

export class IntimportEnrichmentCapReached extends Error {
  constructor(
    readonly callsUsed: number,
    readonly cap: number,
  ) {
    super('intimport_import_call_cap_reached');
    this.name = 'IntimportEnrichmentCapReached';
  }
}

/**
 * Build the provider the pure pipeline consumes. `identityFor` supplies the
 * public product identity for a row — recipes and account data never leave.
 */
export function createIntimportWebProvider(options: {
  importId: string;
  identityFor: (request: EnrichmentRequest) => IntimportEnrichmentIdentity;
  /** The first source to consult for this product — official evidence leads. */
  stepFor: (request: EnrichmentRequest) => IntimportResearchStep | null;
  onTelemetry?: (telemetry: IntimportEnrichmentTelemetry) => void;
}): EnrichmentProvider {
  return async (request: EnrichmentRequest): Promise<EnrichmentResponse> => {
    if (!supabase) {
      // No backend configured — research is impossible, and the browser must
      // never fall back to calling a provider itself.
      return { facts: [], calls: 0 };
    }
    const { data, error } = await supabase.functions.invoke('intimport-enrich', {
      body: {
        importId: options.importId,
        product: options.identityFor(request),
        researchStep: options.stepFor(request),
        fields: request.fields,
      },
    });

    if (error) {
      // The import-wide cap is a deliberate stop, not a failure to swallow.
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 429) throw new IntimportEnrichmentCapReached(0, 0);
      // Any other transport failure degrades this ONE product, not the batch.
      options.onTelemetry?.({
        calls: 0,
        webCalls: 0,
        latencyMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheHit: false,
        model: null,
        sources: [],
        notFound: [...request.fields],
        authorityByField: {},
        error: error.message ?? 'provider_unavailable',
      });
      return { facts: [], calls: 0 };
    }

    const payload = (data ?? {}) as {
      facts?: ServerFact[];
      sources?: { url: string; title: string }[];
      notFound?: string[];
      calls?: number;
      webCalls?: number;
      latencyMs?: number;
      inputTokens?: number;
      outputTokens?: number;
      cacheHit?: boolean;
      model?: string;
      error?: string;
    };

    const serverFacts = payload.facts ?? [];
    const facts: EnrichmentFact[] = serverFacts.map((fact) => ({
      field: fact.field as ProductEvidenceField,
      value: fact.value,
      // The tier the SERVER derived from the real URL — the browser never
      // decides how authoritative a source was.
      source: fact.evidenceSource,
    }));

    options.onTelemetry?.({
      calls: payload.calls ?? 0,
      webCalls: payload.webCalls ?? 0,
      latencyMs: payload.latencyMs ?? 0,
      inputTokens: payload.inputTokens ?? 0,
      outputTokens: payload.outputTokens ?? 0,
      cacheHit: payload.cacheHit === true,
      model: payload.model ?? null,
      sources: payload.sources ?? [],
      notFound: payload.notFound ?? [],
      authorityByField: Object.fromEntries(
        serverFacts.map((fact) => [fact.field, fact.sourceAuthorityClass]),
      ),
      error: payload.error ?? null,
    });

    return {
      facts,
      calls: payload.cacheHit ? 0 : (payload.calls ?? 0),
    };
  };
}
