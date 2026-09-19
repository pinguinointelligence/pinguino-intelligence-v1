/**
 * Code identity for Scan Import 2.0 — consumes the ACTUAL Scan Core symbology and re-validates
 * everything (untrusted input): charset, length per symbology, GTIN check digit, UPC-E expansion,
 * leading-zero semantics. Never infers a symbology from digit count (audit §2).
 */
import type { ConfirmedScan } from '@/scan-contract/confirmedScan';
import type { CodeIdentity, InvalidCodeReason } from './contracts';
import { isScannerSymbology, validateScannerValue } from './barcodeIdentityContract';

export { expandUpce, gtinCheckDigit, gtinValid } from './barcodeIdentityContract';

export type IdentityOutcome =
  | { ok: true; identity: CodeIdentity }
  | { ok: false; reason: InvalidCodeReason };

export function identifyCode(scan: ConfirmedScan): IdentityOutcome {
  if (!scan.confirmation?.lane || scan.confirmation.agreeingFrames < 2)
    return { ok: false, reason: 'not_confirmed' };
  if (scan.symbology === 'unknown' || !isScannerSymbology(scan.symbology))
    return { ok: false, reason: 'unsupported_symbology' };
  const rawValue =
    typeof scan.rawValue === 'string' && scan.rawValue.length <= 64 ? scan.rawValue : null;
  return validateScannerValue(scan.symbology, scan.value, rawValue);
}
