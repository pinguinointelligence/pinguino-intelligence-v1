/**
 * Optimization preview DISPLAY policy (Spine Slice 10) — pure redaction rules.
 *
 * Maps the viewer's capabilities (from `useAccess`) to what the
 * `OptimizationPreviewPanel` may show. Redaction is capability-driven, mirroring
 * the correction panel's demo/pro split (Optimizer.md §9): Free / Demo see a
 * high-level recommendation only — never exact grams, correction lever detail, or
 * numeric before/after values. Pro sees the full detail. A DEV-only debug trace
 * is ADDITIVE (it never relaxes customer redaction — a demo viewer in a dev build
 * still gets the redacted customer view, with the trace shown alongside).
 *
 * No engine, no IO, no persistence — a pure function of capabilities.
 */

/** The capability inputs this policy reads (a structural subset of `useAccess`). */
export interface OptimizationDisplayCapabilities {
  /** Pro: exact correction grams + lever detail (redaction off). */
  exactCorrectionGrams: boolean;
  /** Pro: numeric technical view (before/after metric values). */
  technicalView: boolean;
}

export interface OptimizationDisplayPolicy {
  /** Customer-facing level — the DEV trace is separate/additive. */
  level: 'redacted' | 'full';
  /** Show the solver's exact added grams. */
  showExactGrams: boolean;
  /** Show numeric before/after metric values. */
  showBeforeAfterMetrics: boolean;
  /** Show the proposed correction plan (target metric + lever ingredient classes). */
  showCorrectionDetail: boolean;
  /** Show the DEV-only debug trace (rerun state, hard blockers, regulator scores). */
  showTrace: boolean;
}

/**
 * Derive the display policy. `opts.dev` adds the debug trace only — it NEVER
 * upgrades the customer redaction level (that follows `exactCorrectionGrams`).
 */
export function optimizationDisplayPolicy(
  caps: OptimizationDisplayCapabilities,
  opts: { dev?: boolean } = {},
): OptimizationDisplayPolicy {
  const full = caps.exactCorrectionGrams;
  return {
    level: full ? 'full' : 'redacted',
    showExactGrams: full,
    showBeforeAfterMetrics: caps.technicalView,
    showCorrectionDetail: full,
    showTrace: opts.dev === true,
  };
}

/** A short, number-free, name-free recommendation per final decision (safe for redacted views). */
export const OPTIMIZATION_RECOMMENDATION: Readonly<Record<string, string>> = {
  optimized: 'Gellatti może bezpiecznie przywrócić tę recepturę do zakresu.',
  tradeoff: 'Korekta poprawia recepturę, ale część celów pozostaje poza zakresem.',
  impossible: 'Przy obecnych ustawieniach nie ma bezpiecznej korekty.',
  blocked: 'Tego produktu lub temperatury nie można teraz rzetelnie ocenić.',
  no_action_needed: 'Receptura jest już w zakresie — korekta nie jest potrzebna',
};

export const recommendationFor = (decision: string): string =>
  OPTIMIZATION_RECOMMENDATION[decision] ?? 'Podgląd jest gotowy.';
