/**
 * PROCESS INFORMATION FOR THE PRODUCT `?` (owner decision, 2026-08-23).
 *
 * What we know about how a product is handled, phrased as information. It is
 * never a warning, never a readiness gate and never something the user has to
 * acknowledge. When we know nothing, we say so plainly — that is a normal
 * state, because the manufacturer's instructions, not Gellatti, govern how a
 * professional product is used.
 */
import type { ProductBehaviorSnapshot } from './contracts';

export type ProductProcessInformation = 'cold' | 'heat' | 'either' | 'unknown';

export function productProcessInformation(
  snapshot: ProductBehaviorSnapshot | null | undefined,
): ProductProcessInformation {
  const evidence = snapshot?.sharedFacts?.processEvidence ?? [];
  if (evidence.length === 0) return 'unknown';
  const cold = evidence.some((entry) => entry.decision === 'cold_process_approved');
  const heat = evidence.some(
    (entry) =>
      entry.decision === 'heat_required_for_function' ||
      entry.decision === 'heat_required_for_safety',
  );
  if (cold && heat) return 'either';
  if (heat) return 'heat';
  if (cold) return 'cold';
  return 'unknown';
}

const LABELS_PL: Readonly<Record<ProductProcessInformation, string>> = Object.freeze({
  cold: 'Na zimno',
  heat: 'Na ciepło',
  either: 'Na ciepło lub zimno',
  unknown: 'Brak informacji',
});

export function productProcessPl(snapshot: ProductBehaviorSnapshot | null | undefined): string {
  return LABELS_PL[productProcessInformation(snapshot)];
}
