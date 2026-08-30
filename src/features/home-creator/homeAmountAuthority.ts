/**
 * §44–§46 — HOME's container-first amount, derived ENTIRELY from the existing machine
 * authority. PURE.
 *
 * §44 is the constraint that shapes this file: "no new batch values". So there is no
 * gram number defined here. Every quantity comes from `recommendedBatchGrams` (the
 * versioned Home batch rule) or from what the user typed, and `planContainerSplit` —
 * the owner's split rule — does the container arithmetic.
 *
 * The one HOME-specific behaviour is the §46 pair:
 *   • a typed amount is KEPT EXACTLY (1850 g stays 1850 g) and merely annotated with
 *     capacity guidance;
 *   • picking a container COUNT returns to the canonical amount for that count.
 * Which is why the amount carries its own provenance: the two cases must stay
 * distinguishable, or "2 containers" would silently re-round a deliberate 1850 g.
 */
import { planContainerSplit, type ContainerSplitPlan } from '@/features/machine-catalog';

/** Where the current total came from — the §46 distinction, made explicit. */
export type HomeAmountSource = 'containers' | 'manual';

export interface HomeAmount {
  readonly totalGrams: number;
  readonly source: HomeAmountSource;
}

/** §45: HOME starts at exactly one container. */
export const HOME_DEFAULT_CONTAINERS = 1;

/**
 * The canonical total for a container count. `null` when the machine authority has no
 * trustworthy per-container figure — HOME then shows a plain amount, never a guess.
 */
export function canonicalTotalForContainers(
  containers: number,
  recommendedBatchGrams: number | null,
): number | null {
  if (recommendedBatchGrams === null || !Number.isFinite(recommendedBatchGrams)) return null;
  if (!Number.isInteger(containers) || containers < 1) return null;
  return recommendedBatchGrams * containers;
}

/** §45 default: one container's canonical amount. */
export const defaultHomeAmount = (recommendedBatchGrams: number | null): HomeAmount | null => {
  const total = canonicalTotalForContainers(HOME_DEFAULT_CONTAINERS, recommendedBatchGrams);
  return total === null ? null : { totalGrams: total, source: 'containers' };
};

/** §45: the `− n containers +` stepper. Never goes below one container. */
export function stepContainers(
  currentContainers: number,
  delta: -1 | 1,
  recommendedBatchGrams: number | null,
): HomeAmount | null {
  const next = Math.max(1, currentContainers + delta);
  const total = canonicalTotalForContainers(next, recommendedBatchGrams);
  return total === null ? null : { totalGrams: total, source: 'containers' };
}

/** §46: a typed total is kept EXACTLY. No rounding to a container multiple. */
export function manualAmount(grams: number): HomeAmount | null {
  if (!Number.isFinite(grams) || grams <= 0) return null;
  return { totalGrams: Math.round(grams), source: 'manual' };
}

/**
 * §46: the capacity guidance line for whatever the current total is —
 * "1850 g · 3 containers". `null` when there is no per-container authority, in which
 * case HOME shows the amount alone rather than an invented container count.
 */
export function capacityGuidance(
  amount: HomeAmount,
  recommendedBatchGrams: number | null,
): ContainerSplitPlan | null {
  if (recommendedBatchGrams === null) return null;
  return planContainerSplit(amount.totalGrams, recommendedBatchGrams);
}

/**
 * How many containers the stepper should currently READ.
 *
 * For a container-sourced amount this is the exact count. For a manual amount it is
 * the count the guidance shows — so pressing `+` from a manual 1850 g with a 600 g
 * limit moves to 4 canonical containers rather than 2, which is what "selecting a
 * container count returns to the canonical amount" means in practice.
 */
export function displayedContainers(
  amount: HomeAmount,
  recommendedBatchGrams: number | null,
): number {
  const plan = capacityGuidance(amount, recommendedBatchGrams);
  return plan?.containers ?? 1;
}
