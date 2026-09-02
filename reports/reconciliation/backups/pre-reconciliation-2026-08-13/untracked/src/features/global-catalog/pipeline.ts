import type {
  CatalogCandidateInput,
  CatalogReviewCase,
  CatalogStatus,
  CatalogSubmissionResult,
  DuplicateCandidate,
} from './contracts';
import { findCatalogDuplicates, disputeHasDistinguishingEvidence, type DuplicateReference } from './duplicateDetection';
import { aliasesForFamily, canonicalFamilyFor, normalizeEan, normalizedCompositionFingerprint } from './normalization';
import { evaluateCatalogRateLimit, type CatalogRateEvent } from './rateLimit';
import { verifyCatalogCandidate } from './verification';

export interface PipelineCatalogProduct extends DuplicateReference {
  status: CatalogStatus;
  verificationMethod: 'automatic' | 'human' | 'manual_unverified' | 'blocked';
  displayName: string;
  originalName: string | null;
  originalLanguage: string | null;
  canonicalFamily: string | null;
  mappedIngredientId: string | null;
  aliases: string[];
  missingFields: string[];
  version: number;
  versions: Array<{ version: number; at: string; snapshot: CatalogCandidateInput }>;
}

export interface PipelineCatalogState {
  products: PipelineCatalogProduct[];
  favoritesByAccount: Map<string, Set<string>>;
  submissionsByIdempotency: Map<string, CatalogSubmissionResult>;
  reviewCases: Map<string, CatalogReviewCase>;
  rateEvents: CatalogRateEvent[];
  privatePricesByAccount: Map<string, Map<string, number>>;
}

export function createPipelineCatalogState(): PipelineCatalogState {
  return {
    products: [],
    favoritesByAccount: new Map(),
    submissionsByIdempotency: new Map(),
    reviewCases: new Map(),
    rateEvents: [],
    privatePricesByAccount: new Map(),
  };
}

function favorite(state: PipelineCatalogState, accountId: string, productId: string): void {
  const favorites = state.favoritesByAccount.get(accountId) ?? new Set<string>();
  favorites.add(productId);
  state.favoritesByAccount.set(accountId, favorites);
}

function result(input: Partial<CatalogSubmissionResult>): CatalogSubmissionResult {
  return {
    kind: input.kind ?? 'blocked',
    productId: input.productId ?? null,
    status: input.status ?? null,
    autoFavorited: input.autoFavorited ?? false,
    duplicateCandidates: input.duplicateCandidates ?? [],
    missingFields: input.missingFields ?? [],
    reviewCaseKey: input.reviewCaseKey ?? null,
    retryAt: input.retryAt ?? null,
  };
}

function reviewCase(
  state: PipelineCatalogState,
  input: { productId: string; kind: CatalogReviewCase['kind']; candidate: CatalogCandidateInput; missingFields: string[]; duplicates: DuplicateCandidate[] },
): string {
  const key = `${input.kind}:${input.productId}`;
  const existing = state.reviewCases.get(key);
  const markets = [...new Set([...(existing?.markets ?? []), input.candidate.market].filter((value): value is string => Boolean(value)))];
  state.reviewCases.set(key, {
    key,
    productId: input.productId,
    kind: input.kind,
    submissionCount: (existing?.submissionCount ?? 0) + 1,
    markets,
    missingFields: input.missingFields,
    duplicateCandidates: input.duplicates,
    status: 'open',
    priority: (existing?.submissionCount ?? 0) >= 4 ? 'high' : 'normal',
  });
  return key;
}

export function submitCatalogCandidate(input: {
  state: PipelineCatalogState;
  candidate: CatalogCandidateInput;
  now: string;
  duplicateDecision?: 'same' | 'different';
  distinguishingEvidence?: Record<string, unknown>;
  trustedAccount?: boolean;
}): CatalogSubmissionResult {
  const idempotency = `${input.candidate.submittingAccountId}:${input.candidate.idempotencyKey}`;
  const prior = input.state.submissionsByIdempotency.get(idempotency);
  if (prior) return prior;
  const action = input.duplicateDecision === 'different'
    ? 'duplicate_dispute'
    : input.candidate.source === 'manual_completion'
      ? 'manual_candidate'
      : 'ocr_scan';
  const payloadHash = normalizedCompositionFingerprint({
    ingredientsText: input.candidate.evidence.ingredientsText,
    allergensText: input.candidate.evidence.allergensText,
    nutrition: input.candidate.nutrition,
  });
  const rate = evaluateCatalogRateLimit({
    accountId: input.candidate.submittingAccountId,
    action,
    now: input.now,
    events: input.state.rateEvents,
    trust: { trusted: input.trustedAccount ?? false },
    payloadHash: null, // idempotency collapses retries; repeated independent evidence is allowed and aggregated.
  });
  if (!rate.allowed) {
    const limited = result({ kind: 'rate_limited', retryAt: rate.retryAt });
    input.state.submissionsByIdempotency.set(idempotency, limited);
    return limited;
  }
  input.state.rateEvents.push({
    accountId: input.candidate.submittingAccountId,
    action,
    at: input.now,
    payloadHash,
  });
  const duplicates = findCatalogDuplicates(input.candidate, input.state.products);
  const strongest = duplicates[0];
  if (strongest?.strength === 'exact' || (strongest && input.duplicateDecision === 'same')) {
    const existing = input.state.products.find((product) => product.productId === strongest.productId)!;
    if (existing.status === 'blocked' && input.candidate.source === 'manual_completion') {
      const verification = verifyCatalogCandidate(input.candidate);
      existing.version += 1;
      existing.versions.push({ version: existing.version, at: input.now, snapshot: structuredClone(input.candidate) });
      existing.status = verification.status;
      existing.verificationMethod = verification.method;
      existing.missingFields = verification.missingFields;
      const usable = existing.status !== 'blocked';
      if (usable) favorite(input.state, input.candidate.submittingAccountId, strongest.productId);
      const caseKey = reviewCase(input.state, {
        productId: strongest.productId,
        kind: existing.status === 'blocked' ? 'verification_failed' : 'manual_unverified',
        candidate: input.candidate,
        missingFields: verification.missingFields,
        duplicates,
      });
      const completed = result({ kind: usable ? 'existing' : 'blocked', productId: strongest.productId, status: existing.status, autoFavorited: usable, duplicateCandidates: duplicates, missingFields: verification.missingFields, reviewCaseKey: caseKey });
      input.state.submissionsByIdempotency.set(idempotency, completed);
      return completed;
    }
    favorite(input.state, input.candidate.submittingAccountId, strongest.productId);
    const resolved = result({ kind: 'existing', productId: strongest.productId, status: existing.status, autoFavorited: true, duplicateCandidates: duplicates });
    input.state.submissionsByIdempotency.set(idempotency, resolved);
    return resolved;
  }
  if (strongest?.strength === 'likely' && !input.duplicateDecision) {
    const pending = result({ kind: 'likely_duplicate', duplicateCandidates: duplicates });
    input.state.submissionsByIdempotency.set(idempotency, pending);
    return pending;
  }
  if (strongest?.strength === 'likely' && input.duplicateDecision === 'different' && !disputeHasDistinguishingEvidence(input.distinguishingEvidence ?? {})) {
    const blocked = result({ kind: 'blocked', duplicateCandidates: duplicates, missingFields: ['distinguishing_duplicate_evidence'] });
    input.state.submissionsByIdempotency.set(idempotency, blocked);
    return blocked;
  }
  const verification = verifyCatalogCandidate(input.candidate);
  const productId = `catalog-${input.state.products.length + 1}`;
  const family = input.candidate.canonicalFamily ?? canonicalFamilyFor(input.candidate.displayName ?? input.candidate.originalName);
  const product: PipelineCatalogProduct = {
    productId,
    eans: [normalizeEan(input.candidate.ean)].filter((value): value is string => Boolean(value)),
    imagePerceptualHashes: input.candidate.evidence.imagePerceptualHashes,
    brand: input.candidate.brand,
    name: input.candidate.displayName ?? input.candidate.originalName,
    variant: input.candidate.variant,
    markets: [input.candidate.market].filter((value): value is string => Boolean(value)),
    ingredientsText: input.candidate.evidence.ingredientsText,
    allergensText: input.candidate.evidence.allergensText,
    nutrition: input.candidate.nutrition,
    netQuantity: input.candidate.netQuantity,
    netUnit: input.candidate.netUnit,
    status: strongest && input.duplicateDecision === 'different' && verification.status === 'verified'
      ? 'manual_unverified'
      : verification.status,
    verificationMethod: strongest && input.duplicateDecision === 'different' && verification.status === 'verified'
      ? 'manual_unverified'
      : verification.method,
    displayName: input.candidate.displayName ?? input.candidate.originalName ?? 'Nieznany produkt',
    originalName: input.candidate.originalName,
    originalLanguage: input.candidate.originalLanguage,
    canonicalFamily: family,
    mappedIngredientId: input.candidate.mappedIngredientId,
    aliases: [...new Set([input.candidate.originalName, input.candidate.displayName, ...aliasesForFamily(family)].filter((value): value is string => Boolean(value)))],
    missingFields: verification.missingFields,
    version: 1,
    versions: [{ version: 1, at: input.now, snapshot: structuredClone(input.candidate) }],
  };
  input.state.products.push(product);
  let caseKey: string | null = null;
  if (product.status !== 'verified' || input.duplicateDecision === 'different') {
    caseKey = reviewCase(input.state, {
      productId,
      kind: input.duplicateDecision === 'different'
        ? 'duplicate_dispute'
        : product.status === 'blocked'
          ? 'verification_failed'
          : 'manual_unverified',
      candidate: input.candidate,
      missingFields: verification.missingFields,
      duplicates,
    });
  }
  const usable = product.status !== 'blocked';
  if (usable) favorite(input.state, input.candidate.submittingAccountId, productId);
  const created = result({
    kind: product.status === 'blocked' ? 'blocked' : 'created',
    productId,
    status: product.status,
    autoFavorited: usable,
    duplicateCandidates: duplicates,
    missingFields: verification.missingFields,
    reviewCaseKey: caseKey,
  });
  input.state.submissionsByIdempotency.set(idempotency, created);
  return created;
}

export function unstarCatalogProduct(state: PipelineCatalogState, accountId: string, productId: string): void {
  state.favoritesByAccount.get(accountId)?.delete(productId);
}

export function updateCatalogProductVersion(input: {
  state: PipelineCatalogState;
  productId: string;
  candidate: CatalogCandidateInput;
  now: string;
}): PipelineCatalogProduct {
  const product = input.state.products.find((item) => item.productId === input.productId);
  if (!product) throw new Error('catalog product not found');
  const verification = verifyCatalogCandidate(input.candidate);
  product.version += 1;
  product.versions.push({ version: product.version, at: input.now, snapshot: structuredClone(input.candidate) });
  product.status = verification.status;
  product.verificationMethod = verification.method;
  product.missingFields = verification.missingFields;
  return product;
}
