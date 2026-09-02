/**
 * MANUFACTURER DOSAGE IS INFORMATIONAL ONLY (owner decision, 2026-08-23).
 *
 * Gellatti does not decide how a professional ingredient must be dosed. The
 * customer/professional using the ingredient owns that decision. A recommended
 * dosage carried by the Mapper — a percentage window, or a raw manufacturer
 * string such as `100–250 g/L` — is therefore product INFORMATION and nothing
 * else. It is:
 *
 *  - never an eligibility, readiness or permission predicate;
 *  - never normalized, re-based or converted (no g/L → %, no % → g/1000 g);
 *  - never turned into an automatic dose;
 *  - never a reason to block Preview, Apply, Save, Production or import.
 *
 * Absent or ambiguous dosage is simply absent information. The runtime gate
 * that used to live here (`assessProductDosages` / `clampProductDosageGrams`)
 * has been removed rather than made permissive, so no caller can resurrect it
 * by relaxing a threshold.
 */
import type { ProductBehaviorSnapshot, SharedProductRecommendedDose } from './contracts';

/** Exactly what the source declared. No derived grams, no re-based percentages. */
export interface ProductRecommendedDosageInfo {
  minPercent: number | null;
  preferredPercent: number | null;
  maxPercent: number | null;
  /** Verbatim manufacturer string when the source carried one (`100–250 g/L`). */
  rawValue: string | null;
  sourceVersion: string | null;
}

const finite = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const rawDosageValue = (dose: SharedProductRecommendedDose): string | null => {
  const raw = (dose as { rawValue?: unknown }).rawValue;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
};

/**
 * Read the recommended dosage a product version carries, for display only.
 * Returns null when nothing is known — which is a normal, unremarkable state.
 */
export function productRecommendedDosageInfo(
  snapshot: ProductBehaviorSnapshot | null | undefined,
): ProductRecommendedDosageInfo | null {
  const dose = snapshot?.sharedFacts?.recommendedDose;
  if (!dose) return null;
  const info: ProductRecommendedDosageInfo = {
    minPercent: finite(dose.minPercent),
    preferredPercent: finite(dose.preferredPercent),
    maxPercent: finite(dose.maxPercent),
    rawValue: rawDosageValue(dose),
    sourceVersion: dose.sourceVersion?.trim() || null,
  };
  if (
    info.minPercent === null &&
    info.maxPercent === null &&
    info.preferredPercent === null &&
    info.rawValue === null
  ) {
    return null;
  }
  return info;
}

const percent = (value: number): string => `${Math.round(value * 100) / 100}%`;

/**
 * Compact Polish presentation for the product `?` detail. The manufacturer's
 * own wording wins when it exists; a percentage window is shown exactly as the
 * source declared it, never expanded into grams for the current batch.
 */
export function productRecommendedDosagePl(
  snapshot: ProductBehaviorSnapshot | null | undefined,
): string {
  const info = productRecommendedDosageInfo(snapshot);
  if (!info) return 'Brak informacji';
  if (info.rawValue) return info.rawValue;
  if (info.minPercent !== null && info.maxPercent !== null) {
    return info.minPercent === info.maxPercent
      ? percent(info.minPercent)
      : `${percent(info.minPercent)}–${percent(info.maxPercent)}`;
  }
  const single = info.preferredPercent ?? info.maxPercent ?? info.minPercent;
  return single === null ? 'Brak informacji' : percent(single);
}
