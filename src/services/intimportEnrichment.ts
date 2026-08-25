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
import type {
  SemanticClassificationProvider,
  SemanticClassificationResponse,
} from '@/features/product-intelligence/intimportSemanticClassification';
import { classifyProductSemantics } from '@/features/product-intelligence/productRecognition';

export interface IntimportEnrichmentIdentity {
  sourceProductId: string | null;
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
  crossSkuRejections: { sourceUrl: string; reasonCodes: string[] }[];
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
      if (status === 429) return { facts: [], calls: 0, capReached: true };
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
        crossSkuRejections: [],
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
      evidenceReceipt?: string;
      researchOutcome?: EnrichmentResponse['researchOutcome'];
      crossSkuRejections?: { sourceUrl: string; reasonCodes: string[] }[];
    };

    const serverFacts = payload.facts ?? [];
    const facts: EnrichmentFact[] = serverFacts.map((fact) => ({
      field: fact.field as ProductEvidenceField,
      value: fact.value,
      // The tier the SERVER derived from the real URL — the browser never
      // decides how authoritative a source was.
      source: fact.evidenceSource,
      sourceUrl: fact.sourceUrl,
      sourceDomain: fact.sourceDomain,
      sourceTitle: fact.sourceTitle,
      sourceAuthorityClass: fact.sourceAuthorityClass,
      retrievedAt: fact.retrievedAt,
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
      crossSkuRejections: payload.crossSkuRejections ?? [],
    });

    return {
      facts,
      calls: payload.cacheHit ? 0 : (payload.calls ?? 0),
      evidenceReceipt: payload.evidenceReceipt,
      researchOutcome: payload.researchOutcome ?? 'STEP_COMPLETE',
      crossSkuRejections: payload.crossSkuRejections ?? [],
    };
  };
}

/** Existing Edge backend, key, project, model and quota controls — semantic mode. */
export function createIntimportSemanticProvider(options: {
  importId: string;
  onTelemetry?: (telemetry: {
    calls: number;
    cacheHit: boolean;
    model: string | null;
    error: string | null;
  }) => void;
}): SemanticClassificationProvider {
  return async (request): Promise<SemanticClassificationResponse> => {
    const deterministic = classifyProductSemantics(request.evidence);
    if (!deterministic.modelRequired || !supabase) {
      return {
        classification: deterministic,
        calls: 0,
        cacheHit: true,
        evidenceReceipt: null,
        model: null,
        error: supabase ? null : 'backend_unavailable',
      };
    }
    const { data, error } = await supabase.functions.invoke('intimport-enrich', {
      body: {
        action: 'semantic_classification',
        importId: options.importId,
        evidence: request.evidence,
      },
    });
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      return {
        classification: deterministic,
        calls: 0,
        cacheHit: false,
        evidenceReceipt: null,
        model: null,
        capReached: status === 429,
        error: error.message ?? 'semantic_provider_unavailable',
      };
    }
    const payload = (data ?? {}) as Partial<SemanticClassificationResponse>;
    const classification = payload.classification?.authority === 'PRODUCT_RECOGNITION_V2'
      ? payload.classification
      : deterministic;
    const response: SemanticClassificationResponse = {
      classification,
      calls: payload.calls ?? 0,
      cacheHit: payload.cacheHit === true,
      evidenceReceipt: payload.evidenceReceipt ?? null,
      model: payload.model ?? null,
      capReached: payload.capReached === true,
      error: payload.error ?? null,
      validationErrors: payload.validationErrors,
      repairAttempted: payload.repairAttempted === true,
      repairAccepted: payload.repairAccepted === true,
    };
    options.onTelemetry?.({
      calls: response.calls,
      cacheHit: response.cacheHit,
      model: response.model,
      error: response.error ?? null,
    });
    return response;
  };
}
