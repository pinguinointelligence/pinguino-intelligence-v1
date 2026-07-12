/**
 * Red-flag severity classification (PURE) — a taxonomy layered OVER the reused detector
 * `@/data/products/productRedFlags`. It never re-detects flags; it only classifies the codes
 * the existing detector produced.
 *
 * Locked (R1): the six existing detector codes ALWAYS block PI Verified — sweeteners/polyols,
 * protein-fortified, proprietary blend, incomplete OCR text and claim/composition conflicts
 * can never auto-verify and can only be cleared by resolution or an authorized, reasoned
 * waiver (senior_reviewer / review_admin). The warning/informational tiers exist for future
 * flags; none of today's codes fall into them.
 */
import type { RedFlag, RedFlagCode } from '@/data/products/productRedFlags';
import type { ClassifiedFlag, FlagSeverity, WarningWaiver } from './contracts';

/** Severity for every code the existing detector can emit — all blocking (R1). */
export const SEVERITY_BY_CODE: Readonly<Record<RedFlagCode, FlagSeverity>> = {
  sugar_free_claim: 'blocking',
  sweetener_or_polyol: 'blocking',
  protein_fortified: 'blocking',
  proprietary_blend: 'blocking',
  incomplete_text: 'blocking',
  claim_composition_conflict: 'blocking',
};

/** Classify detector output. Unknown/future codes default to the safest tier: blocking. */
export function classifyFlags(flags: readonly RedFlag[]): ClassifiedFlag[] {
  return flags.map((flag) => ({
    code: flag.code,
    severity: SEVERITY_BY_CODE[flag.code as RedFlagCode] ?? 'blocking',
    reason: flag.reason,
    evidence: flag.evidence ?? null,
  }));
}

/** The blocking flags NOT covered by an authorized waiver — these prevent sign-off. */
export function unwaivedBlockingFlags(
  classified: readonly ClassifiedFlag[],
  waivers: readonly WarningWaiver[],
): ClassifiedFlag[] {
  const waived = new Set(waivers.map((w) => w.flagCode));
  return classified.filter((f) => f.severity === 'blocking' && !waived.has(String(f.code)));
}

/** True when no blocking flag remains unwaived (the red-flags-clear attestation input). */
export function redFlagsClear(
  classified: readonly ClassifiedFlag[],
  waivers: readonly WarningWaiver[],
): boolean {
  return unwaivedBlockingFlags(classified, waivers).length === 0;
}
