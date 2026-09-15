import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Scanner 1.3 fail-closed authority boundary', () => {
  const analyze = read('supabase/functions/product-scan-analyze/index.ts');
  const finalize = read('supabase/functions/product-scan-finalize/index.ts');
  const migration = read('supabase/migrations/20260915150000_scanner_1_3_gtin_policy.sql');

  it('S13-25 validates raw value plus capture format before session read, exact lookup, or writes', () => {
    const body = analyze.indexOf('const suppliedBarcode = objectValue(body.barcode)');
    const validation = analyze.indexOf('verifyScannerBarcodePayload', body);
    const sessionRead = analyze.indexOf(".from('product_scan_sessions')", body);
    const exactLookup = analyze.indexOf('const exact = await exactProductForBarcode', body);
    const sessionInsert = analyze.indexOf(".from('product_scan_sessions').insert", body);
    expect(validation).toBeGreaterThan(body);
    expect(validation).toBeLessThan(sessionRead);
    expect(validation).toBeLessThan(exactLookup);
    expect(validation).toBeLessThan(sessionInsert);
    expect(analyze).toContain("error: 'invalid_barcode_identity'");
  });

  it('S13-26 rejects an empty ean_lookup before exact lookup and authoritative session creation', () => {
    const lookupGuard = analyze.indexOf("if (mode === 'ean_lookup' && !barcode)");
    const exactLookup = analyze.indexOf('const exact = await exactProductForBarcode');
    const sessionInsert = analyze.indexOf(".from('product_scan_sessions').insert");
    expect(lookupGuard).toBeGreaterThan(-1);
    expect(lookupGuard).toBeLessThan(exactLookup);
    expect(lookupGuard).toBeLessThan(sessionInsert);
  });

  it('S13-27 keeps the 1.4 exact boundary reachable only from the validated canonical identity', () => {
    expect(analyze).toContain(
      'const incomingBarcode = barcodeIdentity?.ok ? barcodeIdentity.identity.canonicalGtin13 : null;',
    );
    expect(analyze).toContain(
      'const exact = await exactProductForBarcode(service, barcode, auth.user.id);',
    );
    expect(finalize).toContain('verifyScannerBarcodePayload');
    expect(finalize).toContain('invalid_scan_barcode_identity');
    expect(finalize).toContain(
      'capturedFormat: scannerCaptureFormatForSymbology(sessionIdentity.symbology)',
    );
  });

  it('S13-28 enforces the Scanner-exclusive SQL policy without altering Mapper data', () => {
    expect(migration).toContain("p_gtin !~ '^[0-9]{8,13}$'");
    expect(migration).toContain('if p_symbology is null then');
    expect(migration).toContain('if v_len <> 13 then return; end if;');
    expect(migration).not.toMatch(/8,14|in \(13, 14\)|v_len = 14/);
    expect(migration).not.toMatch(
      /insert\s+into\s+public\.mapper_basement|update\s+public\.mapper_basement|delete\s+from\s+public\.mapper_basement/i,
    );
  });
});
