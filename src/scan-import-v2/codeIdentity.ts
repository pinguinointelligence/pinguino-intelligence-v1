/**
 * Code identity for Scan Import 2.0 — consumes the ACTUAL Scan Core symbology and re-validates
 * everything (untrusted input): charset, length per symbology, GTIN check digit, UPC-E expansion,
 * leading-zero semantics. Never infers a symbology from digit count (audit §2).
 */
import type { ConfirmedScan, ConfirmedSymbology } from '@/scan-contract/confirmedScan';
import type { CodeIdentity, InvalidCodeReason } from './contracts';

const LENGTH: Record<ConfirmedSymbology, number> = {
  'EAN-13': 13,
  'EAN-8': 8,
  'UPC-A': 12,
  'UPC-E': 8,
};

export function gtinCheckDigit(payload: string): number {
  let sum = 0;
  for (let i = payload.length - 1, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3)
    sum += Number(payload[i]) * weight;
  return (10 - (sum % 10)) % 10;
}

export function gtinValid(digits: string): boolean {
  return gtinCheckDigit(digits.slice(0, -1)) === Number(digits.at(-1));
}

/** UPC-E (8 digits, number system 0 or 1) → UPC-A (12 digits), or null when it does not expand to a valid code. */
export function expandUpce(value: string): string | null {
  if (!/^[01][0-9]{7}$/.test(value)) return null;
  const ns = value[0]!;
  const body = value.slice(1, 7);
  const last = body[5]!;
  let manufacturer: string;
  let product: string;
  if (last === '0' || last === '1' || last === '2') {
    manufacturer = `${body.slice(0, 2)}${last}00`;
    product = `00${body.slice(2, 5)}`;
  } else if (last === '3') {
    manufacturer = `${body.slice(0, 3)}00`;
    product = `000${body.slice(3, 5)}`;
  } else if (last === '4') {
    manufacturer = `${body.slice(0, 4)}0`;
    product = `0000${body[4]}`;
  } else {
    manufacturer = body.slice(0, 5);
    product = `0000${last}`;
  }
  const upca = `${ns}${manufacturer}${product}${value[7]}`;
  return gtinValid(upca) ? upca : null;
}

export type IdentityOutcome =
  | { ok: true; identity: CodeIdentity }
  | { ok: false; reason: InvalidCodeReason };

export function identifyCode(scan: ConfirmedScan): IdentityOutcome {
  if (!scan.confirmation?.lane || scan.confirmation.agreeingFrames < 2)
    return { ok: false, reason: 'not_confirmed' };
  if (scan.symbology === 'unknown' || !(scan.symbology in LENGTH))
    return { ok: false, reason: 'unsupported_symbology' };
  const symbology = scan.symbology;
  const value = scan.value;
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) return { ok: false, reason: 'charset' };
  if (value.length < 8 || value.length > 14) return { ok: false, reason: 'length' };
  if (value.length !== LENGTH[symbology]) return { ok: false, reason: 'symbology_mismatch' };
  const rawValue =
    typeof scan.rawValue === 'string' && scan.rawValue.length <= 64 ? scan.rawValue : null;
  if (symbology === 'UPC-E') {
    const upca = expandUpce(value);
    if (!upca) return { ok: false, reason: 'checksum' };
    return {
      ok: true,
      identity: {
        symbology,
        value,
        canonicalGtin13: `0${upca}`,
        lookupKeys: [value, upca, `0${upca}`],
        rawValue,
      },
    };
  }
  if (!gtinValid(value)) return { ok: false, reason: 'checksum' };
  if (symbology === 'UPC-A')
    return {
      ok: true,
      identity: {
        symbology,
        value,
        canonicalGtin13: `0${value}`,
        lookupKeys: [value, `0${value}`],
        rawValue,
      },
    };
  if (symbology === 'EAN-8')
    return {
      ok: true,
      identity: {
        symbology,
        value,
        canonicalGtin13: `00000${value}`,
        lookupKeys: [value, `00000${value}`],
        rawValue,
      },
    };
  // EAN-13: a leading zero is the UPC-A form of the same code — both keys are tried, identity stays EAN-13
  const keys = value.startsWith('0') ? [value, value.slice(1)] : [value];
  return {
    ok: true,
    identity: { symbology, value, canonicalGtin13: value, lookupKeys: keys, rawValue },
  };
}
