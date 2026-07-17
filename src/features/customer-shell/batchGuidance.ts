/**
 * Soft recommended-batch guidance (OWNER FINAL DECISION, 2026-07-17 —
 * „KOŃCOWA WIĄŻĄCA DECYZJA — POJEMNOŚCI, EDYCJA WSADU I WDROŻENIE").
 *
 * The machine's „Zalecany wsad PINGÜINO" is ONLY an automatic, safe starting
 * proposal:
 *  - the gram field is never locked, the recommendation is never a hard
 *    limit, and nothing here ever blocks progression;
 *  - diverging from the recommendation shows a subtle „Używasz własnej
 *    ilości" + a restore action;
 *  - exceeding it shows ONLY a warning with three non-blocking actions:
 *    split into containers (optional, EVEN split), keep my amount (kept
 *    exactly, warning dismissed), restore the recommendation.
 *
 * Pure presentation state — no engine math, no flow mutation.
 */
import { planContainerSplit, type ContainerSplitPlan } from '@/features/machine-catalog';

/** What the user chose for an above-recommendation amount (sticky per amount). */
export type AboveRecommendationChoice = 'undecided' | 'split' | 'keep_mine';

export type BatchGuidance =
  | { readonly kind: 'none' } // no machine recommendation exists — nothing to guide
  | { readonly kind: 'recommended_active' } // current amount IS the recommendation
  | {
      /** User diverged BELOW/EQUALish — subtle marker + restore only. */
      readonly kind: 'custom';
      readonly recommendedGrams: number;
    }
  | {
      /** User diverged ABOVE — warning + the three non-blocking actions. */
      readonly kind: 'custom_above';
      readonly recommendedGrams: number;
      /** Even split plan for the CURRENT amount (shown once 'split' chosen). */
      readonly split: ContainerSplitPlan | null;
      readonly choice: AboveRecommendationChoice;
    };

export interface BatchGuidanceInput {
  /** The machine's recommended grams, or null when no rule fired. */
  readonly recommendedGrams: number | null;
  /** The CURRENT resolved batch grams shown to the user, or null. */
  readonly currentGrams: number | null;
  /** The user's sticky choice for the above-recommendation warning. */
  readonly choice: AboveRecommendationChoice;
}

/** Derive the guidance state for the batch step. Never blocks anything. */
export function deriveBatchGuidance(input: BatchGuidanceInput): BatchGuidance {
  const { recommendedGrams, currentGrams, choice } = input;
  if (recommendedGrams === null || currentGrams === null) return { kind: 'none' };
  if (currentGrams === recommendedGrams) return { kind: 'recommended_active' };
  if (currentGrams > recommendedGrams) {
    return {
      kind: 'custom_above',
      recommendedGrams,
      split: choice === 'split' ? planContainerSplit(currentGrams, recommendedGrams) : null,
      choice,
    };
  }
  return { kind: 'custom', recommendedGrams };
}
