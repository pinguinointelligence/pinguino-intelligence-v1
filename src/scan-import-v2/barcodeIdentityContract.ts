import type { CodeIdentity, InvalidCodeReason } from './contracts';

export type ScannerSymbology = 'EAN-13' | 'EAN-8' | 'UPC-A' | 'UPC-E';
export type ScannerCaptureFormat = 'EAN_8' | 'EAN_13' | 'UPC_A' | 'UPC_E';

const LENGTH: Record<ScannerSymbology, number> = {
  'EAN-13': 13,
  'EAN-8': 8,
  'UPC-A': 12,
  'UPC-E': 8,
};

const FORMAT_TO_SYMBOLOGY: Record<ScannerCaptureFormat, ScannerSymbology> = {
  EAN_8: 'EAN-8',
  EAN_13: 'EAN-13',
  UPC_A: 'UPC-A',
  UPC_E: 'UPC-E',
};

export function isScannerSymbology(value: unknown): value is ScannerSymbology {
  return value === 'EAN-8' || value === 'EAN-13' || value === 'UPC-A' || value === 'UPC-E';
}

export function isScannerCaptureFormat(value: unknown): value is ScannerCaptureFormat {
  return value === 'EAN_8' || value === 'EAN_13' || value === 'UPC_A' || value === 'UPC_E';
}

export function scannerSymbologyForCaptureFormat(value: unknown): ScannerSymbology | null {
  return isScannerCaptureFormat(value) ? FORMAT_TO_SYMBOLOGY[value] : null;
}

export function scannerCaptureFormatForSymbology(value: ScannerSymbology): ScannerCaptureFormat {
  if (value === 'EAN-8') return 'EAN_8';
  if (value === 'EAN-13') return 'EAN_13';
  if (value === 'UPC-A') return 'UPC_A';
  return 'UPC_E';
}

export function gtinCheckDigit(payload: string): number {
  let sum = 0;
  for (let i = payload.length - 1, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3)
    sum += Number(payload[i]) * weight;
  return (10 - (sum % 10)) % 10;
}

export function gtinValid(digits: string): boolean {
  return gtinCheckDigit(digits.slice(0, -1)) === Number(digits.at(-1));
}

/** UPC-E (8 digits, number system 0 or 1) → UPC-A (12 digits). */
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

export type BarcodeIdentityOutcome =
  | { ok: true; identity: CodeIdentity }
  | { ok: false; reason: InvalidCodeReason };

/**
 * The single format-aware value contract used by the client and server.
 * `value` is already associated with an actual decoder symbology; digit count
 * never chooses the symbology.
 */
export function validateScannerValue(
  symbology: ScannerSymbology,
  value: unknown,
  rawValue: string | null = null,
): BarcodeIdentityOutcome {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) return { ok: false, reason: 'charset' };
  if (value.length < 8 || value.length > 14) return { ok: false, reason: 'length' };
  if (value.length !== LENGTH[symbology]) return { ok: false, reason: 'symbology_mismatch' };

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
  const keys = value.startsWith('0') ? [value, value.slice(1)] : [value];
  return {
    ok: true,
    identity: { symbology, value, canonicalGtin13: value, lookupKeys: keys, rawValue },
  };
}

export interface ScannerBarcodePayload {
  rawValue: unknown;
  capturedFormat: unknown;
  canonicalValue?: unknown;
}

/**
 * Verifies the complete untrusted boundary: raw text + declared capture format
 * must independently derive the canonical value supplied to authority.
 */
export function verifyScannerBarcodePayload(input: ScannerBarcodePayload): BarcodeIdentityOutcome {
  const symbology = scannerSymbologyForCaptureFormat(input.capturedFormat);
  if (!symbology) return { ok: false, reason: 'unsupported_symbology' };
  if (typeof input.rawValue !== 'string') return { ok: false, reason: 'charset' };
  const rawValue = input.rawValue.trim();
  if (!/^[0-9]+$/.test(rawValue)) return { ok: false, reason: 'charset' };
  const result = validateScannerValue(symbology, rawValue, rawValue);
  if (!result.ok) return result;
  if (
    input.canonicalValue !== undefined &&
    (typeof input.canonicalValue !== 'string' ||
      input.canonicalValue !== result.identity.canonicalGtin13)
  )
    return { ok: false, reason: 'canonical_mismatch' };
  return result;
}
