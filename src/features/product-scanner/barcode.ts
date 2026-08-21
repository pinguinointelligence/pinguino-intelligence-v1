export type SupportedBarcodeFormat = 'EAN_8' | 'EAN_13' | 'UPC_A' | 'UPC_E';

export interface ValidBarcode {
  value: string;
  format: SupportedBarcodeFormat;
  lookupValue: string;
}

const digitsOnly = (value: string): string => value.replace(/[^0-9]/g, '');

export function gtinCheckDigit(payload: string): number {
  const sum = [...payload]
    .reverse()
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}

function checkGtin(value: string): boolean {
  return gtinCheckDigit(value.slice(0, -1)) === Number(value.at(-1));
}

export function expandUpce(value: string): string | null {
  const raw = digitsOnly(value);
  if (raw.length !== 8 || (raw[0] !== '0' && raw[0] !== '1')) return null;
  const numberSystem = raw[0]!;
  const body = raw.slice(1, 7);
  const last = body[5]!;
  let manufacturer: string;
  let product: string;
  if (['0', '1', '2'].includes(last)) {
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
  const upca = `${numberSystem}${manufacturer}${product}${raw[7]}`;
  return checkGtin(upca) ? upca : null;
}

export function validateBarcode(value: string, hintedFormat?: string | null): ValidBarcode | null {
  const raw = digitsOnly(value);
  const hint = hintedFormat?.toLowerCase().replaceAll('-', '_') ?? '';
  if (raw.length === 8) {
    if (hint.includes('upc_e') || hint.includes('upce')) {
      const upca = expandUpce(raw);
      return upca ? { value: raw, format: 'UPC_E', lookupValue: upca } : null;
    }
    return checkGtin(raw) ? { value: raw, format: 'EAN_8', lookupValue: raw } : null;
  }
  if (raw.length === 12 && checkGtin(raw)) {
    return { value: raw, format: 'UPC_A', lookupValue: raw };
  }
  if (raw.length === 13 && checkGtin(raw)) {
    return { value: raw, format: 'EAN_13', lookupValue: raw };
  }
  return null;
}

export function barcodeLookupCandidates(barcode: ValidBarcode): string[] {
  const values = new Set([barcode.value, barcode.lookupValue]);
  if (barcode.format === 'UPC_A') values.add(`0${barcode.value}`);
  if (barcode.format === 'EAN_13' && barcode.value.startsWith('0')) {
    values.add(barcode.value.slice(1));
  }
  return [...values];
}
