/**
 * SCAN IMPORT 2.0 — unknown-product discovery lifecycle (owner correction 2026-09-05).
 *
 * After Scan Core confirms a code that the exact authority does not know, the product is NOT a dead
 * end. Discovery orchestrates the EXISTING authorities — the scan-session analysis (label evidence,
 * exact-source research), the finalize/profile/ProductBehaviour authorities (customer-provisional
 * product creation) and the product-request lifecycle (durable discovery candidate pending admin
 * verification) — and keeps every fact with its provenance and every conflict visible. It never
 * invents technical values, never assigns ProductBehaviour, never creates a Mapper row.
 */
import type { CodeIdentity, ExactCandidate, RequestContext } from '../contracts';

/** The seven distinct truths the owner listed — never collapsed into one "known" flag. */
export type DiscoveryStage =
  | 'code_known'
  | 'commercial_identity_hypothesis'
  | 'evidence_collected'
  | 'exact_sku_created'
  | 'technical_data_known'
  | 'behaviour_bound'
  | 'engine_ready';

export type FactSource =
  | 'barcode'
  | 'label'
  | 'manufacturer'
  | 'barcode_registry'
  | 'retailer'
  | 'web_search'
  | 'user_confirmed'
  | 'catalog';

export interface Fact {
  field: string;
  value: string | number | null;
  source: FactSource;
  confidence: 'high' | 'medium' | 'low' | null;
  sourceUrl: string | null;
  /** the authority that produced the fact (e.g. scan-core, product-scan-analyze, intimport-enrich, resolve_exact_products_by_gtin_v1) */
  authority: string | null;
  /** when the fact was recorded in this ledger (ctx.now / session time), null when unknown */
  recordedAt: number | null;
  /** every source that contributed to this field; more than one = the server merged by authority rank */
  contributingSources: readonly FactSource[];
}

export interface FactConflict {
  field: string;
  values: readonly { value: string | number | null; source: FactSource }[];
  /** the source whose value is currently retained by the legacy merge (label outranks the web); null = unresolved */
  retained: FactSource | null;
}

export interface FactLedger {
  /** identity + time context of this ledger */
  gtin: string;
  symbology: string;
  sessionId: string | null;
  recordedAt: number | null;
  facts: readonly Fact[];
  conflicts: readonly FactConflict[];
  identity: { name: string | null; brand: string | null };
  /** critical fields the profile authority still needs (server vocabulary, e.g. 'nutrition.energyKcal') */
  missingCritical: readonly string[];
  sourcesUsed: readonly FactSource[];
}

/** Legacy scan result JSON (gellatti_product_scan_v1) — consumed structurally, never trusted blindly. */
export interface ScanResultLike {
  identity?: {
    displayName?: string | null;
    originalName?: string | null;
    brand?: string | null;
    countryOfOrigin?: string | null;
    labelLanguages?: string[];
  } | null;
  barcodes?: { kind?: string; value?: string }[] | null;
  nutrition?: Record<string, unknown> | null;
  ingredientsText?: string | null;
  allergensText?: string | null;
  package?: Record<string, unknown> | null;
  evidence?:
    | { field: string; source: string; confidence?: string | null; assetId?: string }[]
    | null;
  externalSources?:
    | { sourceType: string; url: string | null; title: string | null; fieldsUsed: string[] }[]
    | null;
  conflicts?:
    | {
        field: string;
        labelValue: string | number | null;
        externalValue: string | number | null;
        retainedSource: string | null;
      }[]
    | null;
}

export interface DiscoverySession {
  sessionId: string;
  identity: CodeIdentity;
  /** when the session's evidence was last recorded (ctx.now of the last call), for ledger timestamps */
  recordedAt?: number | null;
  result: ScanResultLike | null;
  overlayState: string | null;
  missingCritical: readonly string[];
  usage: { visionCalls: number; webCalls: number };
}

export interface LabelImage {
  assetId: string;
  mime: string;
  base64: string;
  source: 'camera_auto' | 'camera_manual' | 'gallery' | 'drop' | 'paste';
  originalMime: string;
  transformations: string[];
  qualityScore: number | null;
}

export type CustomerFamily =
  | 'dairy'
  | 'fruit'
  | 'cocoa_chocolate'
  | 'nut_paste'
  | 'alcohol'
  | 'sweetener'
  | 'beverage'
  | 'technical'
  | 'other';

export interface FinalizeInput {
  customerFamily?: CustomerFamily | null;
  /** owner contract (2026-09-05): persist the exact product PRIVATELY even when it is not recipe-ready */
  savePrivateNotReady?: boolean;
  confirmations?: {
    packageEvidenceExhausted?: boolean;
    notOnLabelFields?: string[];
    productFields?: Record<string, unknown>;
  };
  privateOverlay?: {
    price?: number | null;
    currency?: string | null;
    supplier?: string | null;
    notes?: string | null;
  };
}

export type ResearchOutcome =
  | { kind: 'existing_product'; product: ExactCandidate }
  | {
      kind: 'researched';
      session: DiscoverySession;
      evidenceError: 'provider_timeout' | 'provider_failed' | 'provider_unavailable' | null;
    }
  | { kind: 'skipped'; session: DiscoverySession; reason: string };

export type LabelFailureReason =
  | 'burst'
  | 'vision_limit'
  | 'asset_conflict'
  | 'asset_metadata'
  | 'network'
  | 'provider'
  | 'other';

export type AnalyzeOutcome =
  | { kind: 'existing_product'; product: ExactCandidate }
  | { kind: 'analyzed'; session: DiscoverySession }
  /** this image could not be analysed; the session and every earlier photograph's evidence stay intact */
  | {
      kind: 'failed';
      reason: LabelFailureReason;
      retryAfterMs: number | null;
      detail: string | null;
    };

export type FinalizeOutcome =
  | {
      kind: 'created';
      productId: string;
      productCode: string | null;
      /** saved privately although not recipe-ready */
      privateNotReady?: boolean;
      engineUsable: boolean;
      existing: boolean;
    }
  | { kind: 'family_confirmation_required'; options: readonly CustomerFamily[] }
  | { kind: 'not_ready'; missingCritical: readonly string[]; reasons: readonly string[] }
  | { kind: 'profile_rejected'; reason: string }
  | { kind: 'identity_required' };

export type RequestOutcome =
  | { kind: 'product_request'; requestId: string; status: string }
  | { kind: 'existing_product'; product: ExactCandidate };

export interface OwnRequest {
  requestId: string;
  status: string;
  approvedProductId: string | null;
}

/** Every method delegates to an EXISTING authority; the port only shapes requests and responses. */
export interface DiscoveryPort {
  /** scan-session `ean_lookup`: server exact lookup, else one bounded exact-source research */
  research(identity: CodeIdentity, ctx: RequestContext): Promise<ResearchOutcome>;
  /** scan-session `analyze`: label photographs as evidence, merged server-side by source rank */
  analyzeLabel(
    session: DiscoverySession,
    images: readonly LabelImage[],
    ctx: RequestContext,
  ): Promise<AnalyzeOutcome>;
  /** finalize: profile + ProductBehaviour authorities → customer-provisional exact SKU (never engine-ready by fiat) */
  finalize(
    session: DiscoverySession,
    input: FinalizeInput,
    ctx: RequestContext,
  ): Promise<FinalizeOutcome>;
  /** durable discovery candidate: product request pending admin verification (canonical = false) */
  submitRequest(
    identity: CodeIdentity,
    ledger: FactLedger,
    session: DiscoverySession | null,
    ctx: RequestContext,
  ): Promise<RequestOutcome>;
  /** continuity: an open request of this account for the same code */
  findOwnRequest(identity: CodeIdentity, ctx: RequestContext): Promise<OwnRequest | null>;
}
