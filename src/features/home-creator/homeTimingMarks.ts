/**
 * Owner 2026-09-17 (B) — measurable HOME timings without a backend: input → queries →
 * recognised → first card → CTA ready → result. Standard `performance.mark` entries named
 * `gellatti:home:<step>`; QA reads them with `performance.getEntriesByType('mark')`.
 *
 * The detail carries only an idea-version fingerprint and counts — never a product
 * name, a gram, a recipe composition or anything identifying the customer.
 */
export type HomeTimingStep =
  | 'idea-committed'
  | 'resolve-start'
  | 'resolve-end'
  | 'recognised'
  | 'official-ready'
  | 'community-start'
  | 'community-end'
  | 'first-card'
  | 'cta-ready'
  | 'cta-tap'
  | 'result-ready';

export function markHomeTiming(
  step: HomeTimingStep,
  detail: Readonly<Record<string, string | number | boolean>> = {},
): void {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
  try {
    performance.mark(`gellatti:home:${step}`, { detail });
  } catch {
    // Timing is observational; it must never break the flow.
  }
}

/** A short, non-reversible fingerprint of an idea version for correlating marks. */
export function ideaFingerprint(signature: string): string {
  let hash = 2166136261;
  for (let index = 0; index < signature.length; index += 1) {
    hash ^= signature.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
