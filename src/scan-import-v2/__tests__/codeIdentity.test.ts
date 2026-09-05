import { describe, expect, it } from 'vitest';
import { validateBarcode } from '@/features/product-scanner/barcode';
import type { ConfirmedScan } from '@/scan-contract/confirmedScan';
import { fromScanCoreObservation } from '@/scan-contract/confirmedScan';
import { expandUpce, gtinValid, identifyCode } from '../codeIdentity';
import fixtures from '../__fixtures__/scanCoreObservations.json';

export const scan = (
  value: string,
  symbology: ConfirmedScan['symbology'] = 'EAN-13',
  over: Partial<ConfirmedScan> = {},
): ConfirmedScan => ({
  symbology,
  value,
  rawValue: value,
  confirmation: { lane: 'fast', agreeingFrames: 2, sources: ['native'] },
  evidence: { moduleNative: 2.3, fill: 0.2, mixedFormats: false },
  timing: { firstSeenAt: 0, completedAt: 200 },
  provenance: { trackId: 't1', harnessBuild: 'test' },
  ...over,
});

describe('code identity (matrix 1-4, 26)', () => {
  it('1. known exact EAN-13 keeps its symbology and yields one lookup key', () => {
    const r = identifyCode(scan('8402001047251'));
    expect(r).toMatchObject({
      ok: true,
      identity: {
        symbology: 'EAN-13',
        canonicalGtin13: '8402001047251',
        lookupKeys: ['8402001047251'],
      },
    });
  });
  it('2. known exact UPC-A keeps UPC-A identity and adds the zero-padded key; UPC-E expands', () => {
    const upca = identifyCode(scan('036000291452', 'UPC-A'));
    expect(upca).toMatchObject({
      ok: true,
      identity: {
        symbology: 'UPC-A',
        canonicalGtin13: '0036000291452',
        lookupKeys: ['036000291452', '0036000291452'],
      },
    });
    const upce = identifyCode(scan('01234565', 'UPC-E'));
    expect(upce.ok).toBe(true);
    if (upce.ok)
      expect(upce.identity.lookupKeys).toEqual([
        '01234565',
        expandUpce('01234565'),
        `0${expandUpce('01234565')}`,
      ]);
  });
  it('3. invalid checksum is INVALID_CODE with reason checksum (never no-code)', () => {
    expect(identifyCode(scan('8402001047252'))).toEqual({ ok: false, reason: 'checksum' });
    expect(gtinValid('8402001047251')).toBe(true);
  });
  it('4. malformed codes are rejected with the specific reason', () => {
    expect(identifyCode(scan('84020010472A1'))).toEqual({ ok: false, reason: 'charset' });
    expect(identifyCode(scan('8402001047251', 'UPC-A'))).toEqual({
      ok: false,
      reason: 'symbology_mismatch',
    });
    expect(identifyCode(scan('12345'))).toEqual({ ok: false, reason: 'length' });
    expect(identifyCode(scan('8402001047251', 'unknown'))).toEqual({
      ok: false,
      reason: 'unsupported_symbology',
    });
    expect(
      identifyCode(
        scan('8402001047251', 'EAN-13', {
          confirmation: { lane: 'fast', agreeingFrames: 1, sources: [] },
        }),
      ),
    ).toEqual({ ok: false, reason: 'not_confirmed' });
  });
  it('26. symbology comes from Scan Core, never from digit count: an 8-digit value labelled EAN-8 vs UPC-E resolves differently', () => {
    const ean8 = identifyCode(scan('96385074', 'EAN-8'));
    expect(ean8).toMatchObject({
      ok: true,
      identity: { symbology: 'EAN-8', canonicalGtin13: '0000096385074' },
    });
    const upce = identifyCode(scan('96385074', 'UPC-E'));
    expect(upce).toEqual({ ok: false, reason: 'checksum' }); // number system 9 is not a UPC-E
  });
  it('leading-zero semantics: an EAN-13 starting with 0 also tries its UPC-A form, identity stays EAN-13', () => {
    const r = identifyCode(scan('0036000291452'));
    expect(r).toMatchObject({
      ok: true,
      identity: { symbology: 'EAN-13', lookupKeys: ['0036000291452', '036000291452'] },
    });
  });
  it('legacy parity: the same digits validate identically in legacy validateBarcode (read-only comparison)', () => {
    for (const [value, hint] of [
      ['8402001047251', 'ean_13'],
      ['5900820012434', 'ean_13'],
      ['3262970109108', 'ean_13'],
      ['036000291452', 'upc_a'],
      ['96385074', 'ean_8'],
      ['8402001047252', 'ean_13'],
    ] as const) {
      const legacy = validateBarcode(value, hint);
      const v2 = identifyCode(
        scan(value, hint === 'ean_13' ? 'EAN-13' : hint === 'upc_a' ? 'UPC-A' : 'EAN-8'),
      );
      expect(Boolean(legacy)).toBe(v2.ok);
      if (legacy && v2.ok) expect(v2.identity.lookupKeys).toContain(legacy.lookupValue);
    }
  });
});

describe('shared contract adapter (real Scan Core observations)', () => {
  it('turns a COMPLETE verified observation into a ConfirmedScan with the decoder symbology', () => {
    const obs = (fixtures as Record<string, Parameters<typeof fromScanCoreObservation>[0]>)[
      'hacendado'
    ]!;
    const c = fromScanCoreObservation(obs, 'fixture');
    expect(c).toMatchObject({
      symbology: 'EAN-13',
      value: '8402001047251',
      confirmation: { lane: 'fast', agreeingFrames: 2 },
      provenance: { trackId: 't1' },
    });
    expect(identifyCode(c!).ok).toBe(true);
  });
  it('the UPC-A fixture keeps UPC-A', () => {
    const obs = (fixtures as Record<string, Parameters<typeof fromScanCoreObservation>[0]>)[
      'upca'
    ]!;
    expect(fromScanCoreObservation(obs)?.symbology).toBe('UPC-A');
  });
  it('an unverified or incomplete observation never crosses the boundary', () => {
    const obs = (fixtures as Record<string, Parameters<typeof fromScanCoreObservation>[0]>)[
      'laciate'
    ]!;
    expect(fromScanCoreObservation({ ...obs, state: 'READING' })).toBeNull();
    expect(
      fromScanCoreObservation({ ...obs, barcode: { ...obs.barcode, verified: false } }),
    ).toBeNull();
  });
});
