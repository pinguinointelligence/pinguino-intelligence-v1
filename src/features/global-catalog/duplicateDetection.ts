import type { CatalogCandidateInput, DuplicateCandidate } from './contracts';
import {
  normalizeCatalogText,
  normalizeEan,
  normalizedCompositionFingerprint,
  normalizedIdentityKey,
} from './normalization';

export interface DuplicateReference {
  productId: string;
  eans: string[];
  imagePerceptualHashes: string[];
  brand: string | null;
  name: string | null;
  variant: string | null;
  markets: string[];
  ingredientsText: string | null;
  allergensText: string | null;
  nutrition: object;
  netQuantity: number | null;
  netUnit: string | null;
}

function hammingDistance(a: string, b: string): number | null {
  if (!/^[0-9a-f]{16}$/i.test(a) || !/^[0-9a-f]{16}$/i.test(b)) return null;
  let distance = 0;
  for (let index = 0; index < a.length; index += 1) {
    let xor = Number.parseInt(a[index]!, 16) ^ Number.parseInt(b[index]!, 16);
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

function tokenSimilarity(a: string, b: string): number {
  const left = new Set(normalizeCatalogText(a).split(' ').filter(Boolean));
  const right = new Set(normalizeCatalogText(b).split(' ').filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  const overlap = [...left].filter((token) => right.has(token)).length;
  return overlap / new Set([...left, ...right]).size;
}

export function findCatalogDuplicates(
  candidate: CatalogCandidateInput,
  references: readonly DuplicateReference[],
): DuplicateCandidate[] {
  const ean = normalizeEan(candidate.ean);
  const identity = normalizedIdentityKey({
    brand: candidate.brand,
    name: candidate.displayName ?? candidate.originalName,
    variant: candidate.variant,
    market: candidate.market,
  });
  const composition = normalizedCompositionFingerprint({
    ingredientsText: candidate.evidence.ingredientsText,
    allergensText: candidate.evidence.allergensText,
    nutrition: candidate.nutrition,
  });

  return references
    .map<DuplicateCandidate | null>((reference) => {
      const reasons: string[] = [];
      let score = 0;
      if (ean && reference.eans.some((value) => normalizeEan(value) === ean)) {
        return { productId: reference.productId, strength: 'exact', score: 1, reasons: ['ean_gtin_exact'] };
      }
      const closestImage = candidate.evidence.imagePerceptualHashes
        .flatMap((hash) => reference.imagePerceptualHashes.map((other) => hammingDistance(hash, other)))
        .filter((distance): distance is number => distance !== null)
        .sort((a, b) => a - b)[0];
      if (closestImage !== undefined && closestImage <= 4) {
        score += 0.55;
        reasons.push('package_image_near_exact');
      }
      const referenceIdentity = normalizedIdentityKey({
        brand: reference.brand,
        name: reference.name,
        variant: reference.variant,
        market: reference.markets[0] ?? null,
      });
      if (referenceIdentity === identity && identity.replace(/\|/g, '') !== '') {
        score += 0.55;
        reasons.push('normalized_identity_exact');
      } else {
        const semantic = tokenSimilarity(
          `${candidate.brand ?? ''} ${candidate.displayName ?? candidate.originalName ?? ''} ${candidate.variant ?? ''}`,
          `${reference.brand ?? ''} ${reference.name ?? ''} ${reference.variant ?? ''}`,
        );
        if (semantic >= 0.6) {
          score += semantic * 0.45;
          reasons.push('semantic_identity_similar');
        }
      }
      const referenceComposition = normalizedCompositionFingerprint({
        ingredientsText: reference.ingredientsText,
        allergensText: reference.allergensText,
        nutrition: reference.nutrition,
      });
      if (composition.length > 4 && composition === referenceComposition) {
        score += 0.35;
        reasons.push('composition_fingerprint_exact');
      }
      if (candidate.netQuantity !== null && reference.netQuantity !== null && candidate.netUnit === reference.netUnit) {
        if (Math.abs(candidate.netQuantity - reference.netQuantity) < 0.001) score += 0.1;
        else reasons.push('different_package_size');
      }
      if (score < 0.55) return null;
      return { productId: reference.productId, strength: score >= 0.95 ? 'exact' : 'likely', score: Math.min(1, score), reasons };
    })
    .filter((match): match is DuplicateCandidate => match !== null)
    .sort((a, b) => b.score - a.score || a.productId.localeCompare(b.productId));
}

export function disputeHasDistinguishingEvidence(fields: Record<string, unknown>): boolean {
  return ['ean', 'net_quantity', 'ingredients_text', 'nutrition', 'market', 'variant', 'image_hash']
    .some((key) => {
      const value = fields[key];
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'object') return value !== null && Object.keys(value).length > 0;
      return typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined;
    });
}
