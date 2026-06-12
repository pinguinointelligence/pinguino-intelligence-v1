/**
 * Redact-at-source (spec §14) — STRICT.
 *
 * Demo must never receive: exact grams, exact ingredient names, ingredient
 * categories, predicted before/after values, numeric deltas, or any hidden
 * numeric field. The redacted shape is built FRESH from scratch (never by
 * spreading the full proposal) and its type contains no numeric fields, so
 * nothing numeric can survive anywhere in the returned object.
 *
 * Demo sees only: broad affected area (metric keys → copy like "freezing
 * stability"), one broad direction, the broad confidence label, and the
 * teaser code (copy: "PINGÜINO Pro can calculate the exact amount to add." /
 * "Freezing stability can be improved. Unlock Pro for exact grams.").
 */
import type { CorrectionProposal, RedactedCorrectionProposal, RedactedDirection } from './types';

export function redactProposal(
  proposal: CorrectionProposal,
  index = 0,
): RedactedCorrectionProposal {
  const actionTypes = new Set(proposal.actions.map((action) => action.type));
  const direction: RedactedDirection =
    actionTypes.size === 1 ? (actionTypes.has('add') ? 'add' : 'reduce') : 'rebalance';

  return {
    // OPAQUE id — the Pro proposal id encodes ingredient names and must not
    // leak (caught by the strict redaction test). Reason codes are metric-level
    // ("affected area") and therefore demo-safe.
    id: `${proposal.kind}:${proposal.reasons[0] ?? 'correction'}:${index}`,
    kind: proposal.kind,
    confidence: proposal.confidence,
    affected_metrics: [...proposal.affected_metrics],
    direction,
    teaser_code: 'pro_can_calculate',
  };
}
