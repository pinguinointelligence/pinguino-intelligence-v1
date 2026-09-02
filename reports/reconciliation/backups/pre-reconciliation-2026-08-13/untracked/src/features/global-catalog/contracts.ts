export type CatalogStatus = 'verified' | 'manual_unverified' | 'blocked';

export type CatalogProvenance =
  | 'ocr_automatic'
  | 'manual_completion'
  | 'catalog_import'
  | 'admin_corrected'
  | 'human_verified'
  | 'automatic_verified';

export type CatalogVerificationMethod = 'automatic' | 'human' | 'manual_unverified' | 'blocked';

export type CatalogEntityKind = 'pi_base' | 'commercial_product';

export interface CatalogNutrition {
  basis: 'per_100g' | 'per_100ml' | 'unknown';
  energyKcal: number | null;
  fat: number | null;
  saturatedFat: number | null;
  carbohydrate: number | null;
  sugars: number | null;
  protein: number | null;
  salt: number | null;
  fibre: number | null;
}

export interface CatalogEvidenceSummary {
  ocrConfidence: number | null;
  normalizationConfidence: number | null;
  imageRoles: string[];
  ingredientsText: string | null;
  allergensText: string | null;
  originalLabelText: string | null;
  imagePerceptualHashes: string[];
}

export interface CatalogCandidateInput {
  idempotencyKey: string;
  submittingAccountId: string;
  source: 'ocr_automatic' | 'manual_completion' | 'catalog_import';
  originalName: string | null;
  displayName: string | null;
  originalLanguage: string | null;
  brand: string | null;
  explicitlyUnbranded: boolean;
  ean: string | null;
  netQuantity: number | null;
  netUnit: 'g' | 'kg' | 'ml' | 'l' | null;
  market: string | null;
  countryOfOrigin: string | null;
  retailer: string | null;
  category: string | null;
  variant: string | null;
  canonicalFamily: string | null;
  mappedIngredientId: string | null;
  nutrition: CatalogNutrition;
  evidence: CatalogEvidenceSummary;
  manuallyCompletedFields: string[];
}

export interface VerificationOutcome {
  status: CatalogStatus;
  method: CatalogVerificationMethod;
  usable: boolean;
  missingFields: string[];
  invalidFields: string[];
  warnings: string[];
}

export type DuplicateStrength = 'exact' | 'likely' | 'none';

export interface DuplicateCandidate {
  productId: string;
  strength: DuplicateStrength;
  score: number;
  reasons: string[];
  displayName?: string | null;
  brand?: string | null;
  netQuantity?: string | null;
  market?: string | null;
  ean?: string | null;
}

export interface CatalogProductSearchHit {
  id: string;
  currentVersionId?: string | null;
  entityKind: CatalogEntityKind;
  status: CatalogStatus | 'pi_base';
  displayName: string;
  originalName: string | null;
  originalLanguage: string | null;
  brand: string | null;
  canonicalFamily: string | null;
  category: string | null;
  mappedIngredientId: string | null;
  markets: string[];
  retailers: string[];
  eans: string[];
  aliases: string[];
  favorite: boolean;
  recentlyUsedAt: string | null;
  usableInBase: boolean;
  usableAsTopping: boolean;
  missingFields: string[];
  invalidFields: string[];
  verificationMethod: CatalogVerificationMethod | 'pi_base';
  /** Public label facts only. Never contains private price/supplier/notes/stock. */
  publicData: Record<string, unknown>;
  /** Caller-private projection from owner-RLS data; never part of shared facts. */
  privatePricePerKg?: number | null;
  privatePriceCurrency?: string | null;
}

export interface CatalogMarketPreferences {
  primaryMarket: string | null;
  additionalMarkets: string[];
  preferredRetailers: string[];
  defaultScope: 'my_markets' | 'my_markets_and_global' | 'global';
}

export interface CatalogReviewCase {
  key: string;
  productId: string;
  kind: 'manual_unverified' | 'duplicate_dispute' | 'verification_failed' | 'correction' | 'conflict' | 'suspicious';
  submissionCount: number;
  markets: string[];
  missingFields: string[];
  duplicateCandidates: DuplicateCandidate[];
  status: 'open' | 'needs_evidence' | 'in_review' | 'resolved' | 'rejected';
  priority: 'normal' | 'high' | 'urgent';
}

export interface CatalogSubmissionResult {
  kind: 'existing' | 'created' | 'likely_duplicate' | 'blocked' | 'rate_limited';
  productId: string | null;
  status: CatalogStatus | null;
  autoFavorited: boolean;
  duplicateCandidates: DuplicateCandidate[];
  missingFields: string[];
  invalidFields?: string[];
  reviewCaseKey: string | null;
  retryAt: string | null;
  rateReason?: 'burst' | 'hourly' | 'daily' | 'rolling_30d' | 'cooldown' | 'duplicate_payload' | 'ip_risk' | 'device_risk' | null;
  challengeRequired?: boolean;
  /** Product resolution succeeded, but no new human-review work was queued. */
  reviewEscalationLimited?: boolean;
}
