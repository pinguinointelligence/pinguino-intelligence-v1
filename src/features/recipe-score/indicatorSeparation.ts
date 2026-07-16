/**
 * PINGÜINO UI/UX master — the three-indicator separation contract (SPEC §20.5).
 *
 * „Nie mieszaj tych pojęć": Dopasowanie receptury, Pewność danych and Gotowość
 * produkcyjna are THREE SEPARATE indicators with distinct meanings and audiences.
 * This module is the contract + pure mappings ONLY — no UI, no IO, no persistence.
 *
 *   - matchScore („Dopasowanie receptury", 1–10, Home + Pro) — how well the result
 *     fits the product, mode and assumptions. Produced by `recipeMatchScore` in
 *     this feature; listed here so the separation is one auditable table.
 *   - dataConfidence („Pewność danych", 1–10 / status, mainly Pro) — how complete
 *     and verified the ingredient/profile data is. Grounded in the EXISTING
 *     customer statuses (data/products/productStatusDecision): Verified (a locked
 *     mapper_basement REFERENCE item) / PI Calculated / PI Generated / Manual
 *     Adjusted / PI Verified. It may reflect those statuses but must never
 *     pretend to be a laboratory result (§20.5).
 *   - productionReadiness („Gotowość produkcyjna", Pro) — ready / test recommended
 *     / experimental.
 *
 * Confidence LEVELS and readiness THRESHOLDS below are presentation policy,
 * CALIBRATION-PENDING; the honest ORDER between statuses is the contract.
 * Pure, deterministic, non-mutating.
 */
import type { ProductStatus } from '@/data/products/productRow';
import {
  formatProductStatusLabel,
  type CustomerStatusLabel,
} from '@/data/products/productStatusDecision';
import type { TenPointScore } from './recipeMatchScore';

/* ────────────────────────────────────────────────────────────────────────── *
 * The separation contract (§20.5 table)                                      *
 * ────────────────────────────────────────────────────────────────────────── */

export type RecipeIndicatorKind = 'match_score' | 'data_confidence' | 'production_readiness';

export const RECIPE_INDICATOR_KINDS: readonly RecipeIndicatorKind[] = Object.freeze([
  'match_score',
  'data_confidence',
  'production_readiness',
]);

/** Who sees the indicator (§20.5 „Kto widzi"). */
export type IndicatorAudience = 'home_and_pro' | 'mainly_pro' | 'pro_only';

export interface RecipeIndicatorContract {
  kind: RecipeIndicatorKind;
  /** Public Polish name (§20.5 „Wskaźnik"). */
  name: string;
  /** What it means (§20.5 „Co oznacza"). */
  meaning: string;
  audience: IndicatorAudience;
}

/** The §20.5 table, verbatim — three indicators, never conflated. */
export const RECIPE_INDICATOR_CONTRACTS: Readonly<
  Record<RecipeIndicatorKind, RecipeIndicatorContract>
> = Object.freeze({
  match_score: Object.freeze({
    kind: 'match_score' as const,
    name: 'Dopasowanie receptury',
    meaning: 'Jak dobrze wynik odpowiada produktowi, trybowi i założeniom.',
    audience: 'home_and_pro' as const,
  }),
  data_confidence: Object.freeze({
    kind: 'data_confidence' as const,
    name: 'Pewność danych',
    meaning: 'Jak kompletne i zweryfikowane są dane składników i profilu.',
    audience: 'mainly_pro' as const,
  }),
  production_readiness: Object.freeze({
    kind: 'production_readiness' as const,
    name: 'Gotowość produkcyjna',
    meaning: 'Czy receptura jest gotowa, wymaga testu, czy jest eksperymentalna.',
    audience: 'pro_only' as const,
  }),
});

/* ────────────────────────────────────────────────────────────────────────── *
 * Pewność danych — statuses → 1–10-or-status (mainly Pro)                    *
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * What confidence is judged for: the EXISTING vocabulary only. 'verified_reference'
 * is the „Verified" customer label of a locked mapper_basement reference item (it
 * is NOT a `products.status` value — see productStatusDecision); everything else
 * is the product lifecycle status as-is.
 */
export type DataConfidenceSubject = 'verified_reference' | ProductStatus;

/**
 * CALIBRATION-PENDING presentation levels on the shared 1–10 scale. The CONTRACT
 * is the honest order, grounded in productStatusDecision provenance rules:
 *   verified reference ≥ PI Verified > PI Calculated (own measured pac/pod)
 *   > Manual Adjusted (human-corrected, mixed provenance)
 *   > PI Generated (reference-linked, borrowed values)
 *   > draft / rejected (no usable confidence → null, status text instead).
 */
export const DATA_CONFIDENCE_LEVELS: Readonly<
  Record<DataConfidenceSubject, TenPointScore | null>
> = Object.freeze({
  verified_reference: 10,
  pi_verified: 9,
  pi_calculated: 7,
  manual_adjusted: 6,
  pi_generated: 5,
  draft: null,
  rejected: null,
});

/** §20.5: confidence may reflect statuses, but must never pose as a lab result. */
export const DATA_CONFIDENCE_DISCLAIMER =
  'Pewność danych opisuje kompletność i weryfikację danych składników — nie jest wynikiem laboratoryjnym.';

const DATA_CONFIDENCE_TEXT: Readonly<Record<DataConfidenceSubject, string>> = Object.freeze({
  verified_reference: 'Zweryfikowana pozycja referencyjna — dane potwierdzone i zablokowane.',
  pi_verified: 'Dane zweryfikowane manualnie na podstawie niezależnego źródła.',
  pi_calculated: 'Produkt ma własne zmierzone wartości — policzone bezpośrednio.',
  manual_adjusted: 'Dane poprawione ręcznie — pochodzenie wartości jest mieszane.',
  pi_generated: 'Wartości powiązane z referencją — nie zmierzone niezależnie dla tego produktu.',
  draft: 'W przygotowaniu — dane nie są jeszcze gotowe do oceny.',
  rejected: 'Odrzucone — profil nie nadaje się do użycia.',
});

export type DataConfidenceTextKey = `recipe-score.data-confidence.${DataConfidenceSubject}`;

export interface DataConfidencePresentation {
  /** 1–10 presentation level, or null when the state carries no usable confidence. */
  level: TenPointScore | null;
  /** The existing customer status label ('Verified' / PI …), or null (internal states). */
  statusLabel: 'Verified' | CustomerStatusLabel | null;
  textKey: DataConfidenceTextKey;
  /** Honest Polish description — never a laboratory claim. */
  text: string;
  /** Always attached (§20.5): confidence is not a laboratory result. */
  disclaimer: typeof DATA_CONFIDENCE_DISCLAIMER;
}

/**
 * Map one confidence subject onto the 1–10-or-status presentation. Labels for
 * product statuses REUSE `formatProductStatusLabel` (the single source of truth);
 * 'Verified' is reserved for locked reference items. Pure and non-mutating.
 */
export function dataConfidence(subject: DataConfidenceSubject): DataConfidencePresentation {
  return {
    level: DATA_CONFIDENCE_LEVELS[subject],
    statusLabel:
      subject === 'verified_reference' ? 'Verified' : formatProductStatusLabel(subject),
    textKey: `recipe-score.data-confidence.${subject}`,
    text: DATA_CONFIDENCE_TEXT[subject],
    disclaimer: DATA_CONFIDENCE_DISCLAIMER,
  };
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Gotowość produkcyjna — ready / test_recommended / experimental (Pro)       *
 * ────────────────────────────────────────────────────────────────────────── */

export type ProductionReadiness = 'ready' | 'test_recommended' | 'experimental';

export const PRODUCTION_READINESS_ORDER: readonly ProductionReadiness[] = Object.freeze([
  'experimental',
  'test_recommended',
  'ready',
]);

export type ProductionReadinessTextKey = `recipe-score.readiness.${ProductionReadiness}`;

export interface ProductionReadinessText {
  readiness: ProductionReadiness;
  label: string;
  textKey: ProductionReadinessTextKey;
  text: string;
}

export const PRODUCTION_READINESS_TEXT: Readonly<
  Record<ProductionReadiness, ProductionReadinessText>
> = Object.freeze({
  ready: Object.freeze({
    readiness: 'ready' as const,
    label: 'Gotowa do produkcji',
    textKey: 'recipe-score.readiness.ready' as const,
    text: 'Receptura jest dobrze dopasowana i oparta na wiarygodnych danych.',
  }),
  test_recommended: Object.freeze({
    readiness: 'test_recommended' as const,
    label: 'Zalecany test',
    textKey: 'recipe-score.readiness.test_recommended' as const,
    text: 'Przed produkcją zalecany jest test próbnej partii.',
  }),
  experimental: Object.freeze({
    readiness: 'experimental' as const,
    label: 'Eksperymentalna',
    textKey: 'recipe-score.readiness.experimental' as const,
    text: 'Receptura eksperymentalna — dopasowanie lub dane są niewystarczające.',
  }),
});

/**
 * CALIBRATION-PENDING readiness thresholds (presentation policy, not engine
 * truth). Readiness is derived transparently from the OTHER two indicators —
 * which stay separate in presentation (§20.5); this derivation is the honest
 * v1 mapping until a dedicated readiness signal exists.
 */
export const READINESS_THRESHOLDS = Object.freeze({
  ready: Object.freeze({ minMatchScore: 8, minDataConfidence: 7 }),
  test_recommended: Object.freeze({ minMatchScore: 6, minDataConfidence: 5 }),
});

export interface ProductionReadinessInput {
  /** The 1–10 match score (or null when the recipe could not be scored). */
  matchScore: TenPointScore | null;
  /** The 1–10 data-confidence level (or null when no usable confidence exists). */
  dataConfidenceLevel: TenPointScore | null;
}

/**
 * Derive production readiness. Monotone in BOTH inputs (a higher match score or
 * a higher confidence can never lower readiness); missing data is honestly
 * 'experimental', never a fake 'ready'. Pure and non-mutating.
 */
export function productionReadiness(input: ProductionReadinessInput): ProductionReadinessText {
  const { matchScore, dataConfidenceLevel } = input;
  if (matchScore === null || dataConfidenceLevel === null) {
    return PRODUCTION_READINESS_TEXT.experimental;
  }
  const { ready, test_recommended } = READINESS_THRESHOLDS;
  if (matchScore >= ready.minMatchScore && dataConfidenceLevel >= ready.minDataConfidence) {
    return PRODUCTION_READINESS_TEXT.ready;
  }
  if (
    matchScore >= test_recommended.minMatchScore &&
    dataConfidenceLevel >= test_recommended.minDataConfidence
  ) {
    return PRODUCTION_READINESS_TEXT.test_recommended;
  }
  return PRODUCTION_READINESS_TEXT.experimental;
}
