import { describe, expect, it } from 'vitest';
import { gtinCheckDigit, isChecksumValidGtin, normalizeGtin } from '../worker/gtin';

describe('gtin', () => {
  it('computes check digits', () => {
    expect(gtinCheckDigit('590123412345')).toBe(7); // 5901234123457
    expect(gtinCheckDigit('9638507')).toBe(4); // EAN-8 96385074
    expect(gtinCheckDigit('03600029145')).toBe(2); // UPC-A 036000291452
  });
  it('validates and rejects', () => {
    expect(isChecksumValidGtin('5901234123457')).toBe(true);
    expect(isChecksumValidGtin('5901234123458')).toBe(false);
    expect(isChecksumValidGtin('96385074')).toBe(true);
    expect(isChecksumValidGtin('036000291452')).toBe(true);
    expect(isChecksumValidGtin('123')).toBe(false);
    expect(isChecksumValidGtin('abcdefghijklm')).toBe(false);
  });
  it('normalizes digits of plausible lengths only', () => {
    expect(normalizeGtin(' 5901234 123457 ')).toBe('5901234123457');
    expect(normalizeGtin('12345')).toBeNull();
  });
});
