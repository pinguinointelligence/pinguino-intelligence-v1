/**
 * SCAN IMPORT 2.0 — contracts. Repo-native vocabulary is reused where it exists (audit
 * reports/scan-import/SCAN_IMPORT_FORENSIC_AUDIT.md §6, §11, §12, §15); the outcomes the audit found
 * missing (`ambiguous`, `invalid_code`, `offline`) are first-class here.
 */
import type { ConfirmedScan, ConfirmedSymbology } from '@/scan-contract/confirmedScan';

export type InvalidCodeReason =
  | 'not_confirmed'
  | 'unsupported_symbology'
  | 'charset'
  | 'length'
  | 'symbology_mismatch'
  | 'checksum';

export interface CodeIdentity {
  symbology: ConfirmedSymbology;
  /** digits exactly as confirmed */
  value: string;
  /** GTIN-13 form: EAN-13 as is, UPC-A / expanded UPC-E zero-padded, EAN-8 padded with five zeros */
  canonicalGtin13: string;
  /** every key an exact catalogue lookup must try (leading-zero semantics preserved) */
  lookupKeys: readonly string[];
  rawValue: string | null;
}

/** Identity strength of an exact catalogue row (audit §4: never "first ranked row"). */
export type IdentityStrength = 'canonical_shared' | 'provisional_linked' | 'private_own';

export interface ExactCandidate {
  productId: string;
  productCode: string | null;
  displayName: string;
  brand: string | null;
  /** the catalogue EAN that matched */
  ean: string;
  strength: IdentityStrength;
  entityKind: 'commercial_product' | 'pi_base' | 'customer_provisional';
  engineReady: boolean;
  /** Mapper slot (generic ingredient id) the product is mapped to, when known */
  mapperSlotId: string | null;
  /** market country of the row when the authority carries one; null = global */
  country: string | null;
  /** current immutable version pointer when the authority exposes it (stale-identity guard for caches) */
  currentVersionId?: string | null;
  /** raw authority facts kept for parity evidence (never used for identity decisions) */
  evidence?: Readonly<Record<string, unknown>>;
}

export interface RequestContext {
  /** null = guest (read-only resolution, no import) */
  accountId: string | null;
  /** Product Country from the canonical account/market authority — never from UI language */
  productCountry: string | null;
  online: boolean;
  surface: 'HOME' | 'PRO' | 'TEST';
  now: number;
  /** Mapper slot hint from label recognition, used only when the code itself is unknown */
  slotHint?: string | null;
}

export class NetworkError extends Error {
  readonly kind = 'network' as const;
}

export interface CatalogPort {
  /** exact-by-EAN candidates for any of the keys; provisional rows not linked to the account must not be returned */
  exactByKeys(keys: readonly string[], ctx: RequestContext): Promise<readonly ExactCandidate[]>;
}
export interface PreferencePort {
  preferredExactForSlot(slotId: string, ctx: RequestContext): Promise<ExactCandidate | null>;
  /** admin-approved assignments for exactly this country; nothing foreign ever comes back */
  countryDefaultsForSlot(
    slotId: string,
    productCountry: string | null,
  ): Promise<{ primary: ExactCandidate | null; fallbacks: readonly ExactCandidate[] }>;
}
export type BehaviourOutcome = 'classified' | 'unknown_requires_review' | 'blocked';
export interface BehaviourPort {
  classify(productId: string): Promise<{ outcome: BehaviourOutcome; bindingId: string | null }>;
}
export interface ExternalEvidence {
  provider: string;
  queriedAt: number;
  query: string;
  facts: readonly { field: string; value: string; sourceUrl: string | null; authority: string }[];
  confidence: number;
}
export interface ExternalEvidencePort {
  research(identity: CodeIdentity, ctx: RequestContext): Promise<unknown>;
}
export interface ImportOutcome {
  kind: 'existing_product' | 'customer_added_product';
  productId: string;
  productCode: string | null;
  created: boolean;
}
export interface ImportPort {
  importOrLink(input: {
    identity: CodeIdentity;
    product: ExactCandidate;
    idempotencyKey: string;
    ctx: RequestContext;
  }): Promise<ImportOutcome>;
}
export interface OfflineCacheEntry {
  candidate: ExactCandidate;
  behaviour: { outcome: 'classified'; bindingId: string | null };
  price: PriceState;
}
export interface OfflineCachePort {
  get(accountId: string | null, canonicalGtin13: string): Promise<OfflineCacheEntry | null>;
  put(accountId: string | null, entry: OfflineCacheEntry): Promise<void>;
}
export interface PricePort {
  /** the per-user overlay price; missing is a costing state, never a failure (audit §12) */
  priceState(productId: string, ctx: RequestContext): Promise<PriceState>;
}
export type PriceState =
  | { state: 'known'; pricePerKg: number; currency: string; source: 'private' | 'reference' }
  | { state: 'missing'; pricePerKg: null; currency: null; source: 'missing' };

export interface ScanImportV2Ports {
  catalog: CatalogPort;
  preferences: PreferencePort;
  behaviour: BehaviourPort;
  external: ExternalEvidencePort | null;
  importer: ImportPort;
  offlineCache: OfflineCachePort;
  price: PricePort;
  /** provider research budget; the pipeline enforces it regardless of the port */
  externalTimeoutMs: number;
  /** unknown-product discovery over the existing scan-session / finalize / product-request authorities (authenticated only) */
  discovery?: import('./discovery/contracts').DiscoveryPort | null;
}

export type ResolutionProvenance =
  | 'catalog'
  | 'local_cache'
  | 'user_preferred'
  | 'country_default'
  | 'country_fallback';

export type ScanImportV2Result =
  | {
      kind: 'resolved_exact';
      identity: CodeIdentity;
      product: ExactCandidate;
      exactness: 'exact_gtin';
      provenance: ResolutionProvenance;
      /** 97 for an exact catalogue match (audit §6 assessProductConfidence), lower for slot-derived resolutions */
      confidence: number;
      behaviour: { outcome: 'classified'; bindingId: string | null };
      price: PriceState;
      import: ImportOutcome | null;
      importSkipped: 'guest' | 'offline' | null;
      needsConfirmation: false;
    }
  | {
      kind: 'needs_confirmation';
      identity: CodeIdentity;
      /** null while the product does not exist yet (discovery family confirmation) */
      product: ExactCandidate | null;
      provenance: ResolutionProvenance;
      reason: 'behaviour_review' | 'behaviour_blocked' | 'family_confirmation';
      behaviour: { outcome: 'unknown_requires_review' | 'blocked'; bindingId: string | null };
      sessionId?: string;
      options?: readonly string[];
      /** exact-GTIN registry evidence gathered alongside discovery (null = none / provider unavailable) */
      externalEvidence?: ExternalEvidence | null;
    }
  | {
      /** unknown code with an OPEN discovery: identity preserved, evidence collected so far, what happens next */
      kind: 'discovered_pending';
      identity: CodeIdentity;
      sessionId: string;
      stage: import('./discovery/contracts').DiscoveryStage;
      ledger: import('./discovery/contracts').FactLedger;
      next: 'label_photo' | 'finalize';
      evidenceError: 'provider_timeout' | 'provider_failed' | 'provider_unavailable' | null;
      note: string | null;
      engineReady: false;
      canonical: false;
      /** exact-GTIN registry evidence gathered alongside discovery (null = none / provider unavailable) */
      externalEvidence?: ExternalEvidence | null;
      /** the last label photograph failed (the session and earlier photographs are untouched) */
      labelError?: {
        reason: import('./discovery/contracts').LabelFailureReason;
        retryAfterMs: number | null;
        /** the authority's raw code — diagnostics for proofs and logs, never customer copy */
        detail?: string | null;
      } | null;
    }
  | {
      /** a NEW exact SKU created through the finalize/profile/ProductBehaviour authorities (customer-provisional) */
      kind: 'discovered_exact';
      identity: CodeIdentity;
      sessionId: string;
      product: ExactCandidate;
      /** saved privately although not recipe-ready (owner contract 2026-09-05) */
      privateNotReady?: boolean;
      stage: import('./discovery/contracts').DiscoveryStage;
      ledger: import('./discovery/contracts').FactLedger;
      engineReady: boolean;
      behaviour: { outcome: BehaviourOutcome; bindingId: string | null };
      canonical: false;
      readiness: { engineReady: boolean; missingCritical: readonly string[]; note: string | null };
    }
  | {
      /** durable discovery candidate (product request) awaiting verification; canonical = false, engine usable = false */
      kind: 'discovery_requested';
      identity: CodeIdentity;
      requestId: string;
      status: string;
      stage: import('./discovery/contracts').DiscoveryStage;
      ledger: import('./discovery/contracts').FactLedger;
      canonical: false;
      engineReady: false;
    }
  | { kind: 'ambiguous'; identity: CodeIdentity; candidates: readonly ExactCandidate[] }
  | {
      kind: 'unknown';
      identity: CodeIdentity;
      next: 'analyze_label';
      externalEvidence: ExternalEvidence | null;
      evidenceError: 'provider_timeout' | 'provider_malformed' | 'provider_failed' | null;
    }
  | { kind: 'invalid_code'; reason: InvalidCodeReason; input: ConfirmedScan }
  | { kind: 'offline'; identity: CodeIdentity; knownLocally: false }
  | {
      kind: 'failed';
      code: 'connection' | 'lookup_failed' | 'import_failed';
      identity: CodeIdentity | null;
      detail: string | null;
    };
