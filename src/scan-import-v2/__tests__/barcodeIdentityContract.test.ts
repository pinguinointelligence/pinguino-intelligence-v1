import { describe, expect, it } from 'vitest';
import {
  expandUpce,
  validateScannerValue,
  verifyScannerBarcodePayload,
} from '../barcodeIdentityContract';

describe('Scanner 1.3 barcode identity contract', () => {
  it.each([
    ['OWNER-1.3-A', '8402001007897', 'EAN_13', '8402001007897'],
    ['OWNER-1.3-B', '8402001042928', 'EAN_13', '8402001042928'],
    ['OWNER-1.3-C', '8480000208378', 'EAN_13', '8480000208378'],
    ['OWNER-1.3-D', '8480000107107', 'EAN_13', '8480000107107'],
    ['S13-01', '8402001047251', 'EAN_13', '8402001047251'],
    ['S13-02', '96385074', 'EAN_8', '0000096385074'],
    ['S13-03', '036000291452', 'UPC_A', '0036000291452'],
    ['S13-04', '01234565', 'UPC_E', `0${expandUpce('01234565')}`],
    ['S13-05', '0036000291452', 'EAN_13', '0036000291452'],
    ['S13-00', '0000000000000', 'EAN_13', '0000000000000'],
  ] as const)(
    '%s accepts a valid supported identity',
    (id, rawValue, capturedFormat, canonicalValue) => {
      expect(id).toBeTruthy();
      const outcome = verifyScannerBarcodePayload({ rawValue, capturedFormat, canonicalValue });
      expect(outcome).toMatchObject({ ok: true, identity: { canonicalGtin13: canonicalValue } });
    },
  );

  it.each([
    ['S13-06', '8402001047252', 'EAN_13', 'checksum'],
    ['S13-07', '96385075', 'EAN_8', 'checksum'],
    ['S13-08', '036000291453', 'UPC_A', 'checksum'],
    ['S13-09', '01234566', 'UPC_E', 'checksum'],
    ['S13-10', '00000000000000', 'EAN_13', 'symbology_mismatch'],
    ['S13-11', '11111111', 'EAN_8', 'checksum'],
    ['S13-11B', '1111111111111', 'EAN_13', 'checksum'],
  ] as const)(
    '%s rejects unsupported or checksum-invalid values',
    (id, rawValue, capturedFormat, reason) => {
      expect(id).toBeTruthy();
      expect(verifyScannerBarcodePayload({ rawValue, capturedFormat })).toEqual({
        ok: false,
        reason,
      });
    },
  );

  it.each([
    ['S13-12', '8402001047252', 'EAN_13', '8402001047251', 'checksum'],
    ['S13-13', '8402001047251', 'EAN_8', '8402001047251', 'symbology_mismatch'],
    ['S13-14', '8402001047251', 'EAN_13', '0036000291452', 'canonical_mismatch'],
    ['S13-15', '96385074', 'EAN_8', '0000096385075', 'canonical_mismatch'],
  ] as const)(
    '%s rejects raw/format/canonical disagreement',
    (id, rawValue, capturedFormat, canonicalValue, reason) => {
      expect(id).toBeTruthy();
      expect(verifyScannerBarcodePayload({ rawValue, capturedFormat, canonicalValue })).toEqual({
        ok: false,
        reason,
      });
    },
  );

  it.each([
    ['S13-16', '', 'EAN_13', 'charset'],
    ['S13-17', '8402 0010 47251', 'EAN_13', 'charset'],
    ['S13-18', '8402001047251-', 'EAN_13', 'charset'],
    ['S13-19', '8402001047251１', 'EAN_13', 'charset'],
    ['S13-20', '8402001047251', undefined, 'unsupported_symbology'],
    ['S13-20B', undefined, 'EAN_13', 'charset'],
    ['S13-21', '8402001047251', 'EAN_14', 'unsupported_symbology'],
    ['S13-22', '8402001047251', 'UPC_A', 'symbology_mismatch'],
  ] as const)(
    '%s rejects malformed text or missing format',
    (id, rawValue, capturedFormat, reason) => {
      expect(id).toBeTruthy();
      expect(verifyScannerBarcodePayload({ rawValue, capturedFormat })).toEqual({
        ok: false,
        reason,
      });
    },
  );

  it('S13-23 preserves outer trim but returns the canonical identity unchanged', () => {
    const outcome = verifyScannerBarcodePayload({
      rawValue: ' 8402001047251 ',
      capturedFormat: 'EAN_13',
    });
    expect(outcome).toMatchObject({
      ok: true,
      identity: {
        value: '8402001047251',
        canonicalGtin13: '8402001047251',
        rawValue: '8402001047251',
      },
    });
  });

  it('S13-24 keeps the existing UPC-E expansion contract independent of the server gate', () => {
    expect(expandUpce('01234565')).toBe('012345000065');
    expect(validateScannerValue('UPC-E', '01234565')).toMatchObject({
      ok: true,
      identity: { canonicalGtin13: '0012345000065' },
    });
  });
});
