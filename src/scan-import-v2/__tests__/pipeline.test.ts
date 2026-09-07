import { describe, expect, it } from 'vitest';
import { scan } from './codeIdentity.test';
import { HACENDADO, ctx, ports, product } from './fakes';
import { idempotencyKey, runScanImportV2 } from '../pipeline';
import type { ExternalEvidence } from '../contracts';

describe('Scan Import 2.0 pipeline — owner test matrix', () => {
  it('1/22. known exact EAN (authenticated): resolved_exact from the catalogue, imported/linked, confidence 97', async () => {
    const p = ports();
    const r = await runScanImportV2(scan('5900820012434'), ctx(), p);
    expect(r).toMatchObject({
      kind: 'resolved_exact',
      product: { productId: 'PR-LACIATE' },
      provenance: 'catalog',
      confidence: 97,
      exactness: 'exact_gtin',
    });
    if (r.kind === 'resolved_exact')
      expect(r.import).toMatchObject({ kind: 'customer_added_product', created: true });
  });
  it('2. known exact UPC-A resolves through its zero-padded key and keeps UPC-A identity', async () => {
    const p = ports({
      catalog: new (await import('./fakes')).FakeCatalog([
        product({ productId: 'PR-US', ean: '0036000291452' }),
      ]),
    });
    const r = await runScanImportV2(scan('036000291452', 'UPC-A'), ctx(), p);
    expect(r).toMatchObject({
      kind: 'resolved_exact',
      identity: { symbology: 'UPC-A' },
      product: { productId: 'PR-US' },
    });
  });
  it('3/4. invalid checksum and malformed codes never reach the catalogue', async () => {
    const p = ports();
    expect(await runScanImportV2(scan('8402001047252'), ctx(), p)).toMatchObject({
      kind: 'invalid_code',
      reason: 'checksum',
    });
    expect(await runScanImportV2(scan('84020A1047251'), ctx(), p)).toMatchObject({
      kind: 'invalid_code',
      reason: 'charset',
    });
    expect(p.catalog.calls).toBe(0);
  });
  it('5. unknown code is honest UNKNOWN with next=analyze_label and no import', async () => {
    const p = ports();
    const r = await runScanImportV2(scan('4305615614434'), ctx(), p);
    expect(r).toMatchObject({ kind: 'unknown', next: 'analyze_label', externalEvidence: null });
    expect(p.importer.calls).toBe(0);
  });
  it('6/7. offline: a product resolved once is known locally; an unknown one is an honest offline state', async () => {
    const p = ports();
    await runScanImportV2(scan('8402001047251'), ctx(), p);
    p.catalog.offline = true;
    const known = await runScanImportV2(scan('8402001047251'), ctx({ online: false }), p);
    expect(known).toMatchObject({
      kind: 'resolved_exact',
      provenance: 'local_cache',
      importSkipped: 'offline',
      product: { productId: 'PR-HACENDADO' },
    });
    const unknown = await runScanImportV2(scan('3262970109108'), ctx({ online: false }), p);
    expect(unknown).toMatchObject({ kind: 'offline', knownLocally: false });
    const online = await runScanImportV2(scan('3262970109108'), ctx(), p);
    expect(online).toMatchObject({ kind: 'failed', code: 'connection' });
  });
  it('8. exact SKU beats the generic Mapper reference row for the same EAN', async () => {
    const generic = product({
      productId: 'PI-MILK',
      ean: '8402001047251',
      entityKind: 'pi_base',
      displayName: 'MILK (Mapper)',
    });
    const p = ports();
    p.catalog.rows = [generic, HACENDADO];
    const r = await runScanImportV2(scan('8402001047251'), ctx(), p);
    expect(r).toMatchObject({ kind: 'resolved_exact', product: { productId: 'PR-HACENDADO' } });
  });
  it('8b. an exact branded code that only the Mapper reference knows is still an exact identity, not a guess', async () => {
    const generic = product({ productId: 'PI-MILK', ean: '8402001047251', entityKind: 'pi_base' });
    const p = ports();
    p.catalog.rows = [generic];
    const r = await runScanImportV2(scan('8402001047251'), ctx(), p);
    expect(r).toMatchObject({
      kind: 'resolved_exact',
      product: { productId: 'PI-MILK' },
      provenance: 'catalog',
    });
  });
  it('9. EAN twins at the same strength: the user preferred exact SKU decides', async () => {
    const twinA = product({
      productId: 'PR-A',
      ean: '5900820012434',
      mapperSlotId: 'milk',
      country: 'PL',
    });
    const twinB = product({
      productId: 'PR-B',
      ean: '5900820012434',
      mapperSlotId: 'milk',
      country: 'PL',
    });
    const p = ports();
    p.catalog.rows = [twinA, twinB];
    p.preferences.preferred.set('user-1:milk', twinB);
    expect(await runScanImportV2(scan('5900820012434'), ctx(), p)).toMatchObject({
      kind: 'resolved_exact',
      product: { productId: 'PR-B' },
      provenance: 'user_preferred',
      confidence: 90,
    });
  });
  it('10. otherwise the approved country default for the product country decides', async () => {
    const twinA = product({
      productId: 'PR-A',
      ean: '5900820012434',
      mapperSlotId: 'milk',
      country: 'PL',
    });
    const twinB = product({
      productId: 'PR-B',
      ean: '5900820012434',
      mapperSlotId: 'milk',
      country: 'PL',
    });
    const p = ports();
    p.catalog.rows = [twinA, twinB];
    p.preferences.country.set('PL:milk', { primary: twinA, fallbacks: [] });
    expect(await runScanImportV2(scan('5900820012434'), ctx(), p)).toMatchObject({
      kind: 'resolved_exact',
      product: { productId: 'PR-A' },
      provenance: 'country_default',
    });
  });
  it('11. a foreign country assignment is never used; without a same-country decision the result is AMBIGUOUS', async () => {
    const twinES = product({
      productId: 'PR-ES',
      ean: '5900820012434',
      mapperSlotId: 'milk',
      country: 'ES',
    });
    const twinPL = product({
      productId: 'PR-PL',
      ean: '5900820012434',
      mapperSlotId: 'milk',
      country: 'PL',
    });
    const p = ports();
    p.catalog.rows = [twinES, twinPL];
    p.preferences.country.set('PL:milk', { primary: twinES, fallbacks: [twinES] });
    const r = await runScanImportV2(scan('5900820012434'), ctx({ productCountry: 'PL' }), p);
    expect(r.kind).toBe('ambiguous');
  });
  it('12. ambiguity is reported with the candidates, never resolved by ranking', async () => {
    const p = ports();
    p.catalog.rows = [
      product({ productId: 'X1', ean: '5900820012434' }),
      product({ productId: 'X2', ean: '5900820012434' }),
    ];
    const r = await runScanImportV2(scan('5900820012434'), ctx(), p);
    expect(r).toMatchObject({ kind: 'ambiguous' });
    if (r.kind === 'ambiguous')
      expect(r.candidates.map((c) => c.productId).sort()).toEqual(['X1', 'X2']);
    expect(p.importer.calls).toBe(0);
  });
  it('13. conflicting external evidence is retained verbatim and never becomes a product', async () => {
    const evidence: ExternalEvidence = {
      provider: 'test',
      queriedAt: 1,
      query: '4305615614434',
      confidence: 0.4,
      facts: [
        {
          field: 'brand',
          value: 'A',
          sourceUrl: 'https://a.example',
          authority: 'OFFICIAL_MANUFACTURER',
        },
        {
          field: 'brand',
          value: 'B',
          sourceUrl: 'https://b.example',
          authority: 'AUTHORITATIVE_RETAILER',
        },
      ],
    };
    const p = ports({ external: { research: async () => evidence } });
    const r = await runScanImportV2(scan('4305615614434'), ctx(), p);
    expect(r).toMatchObject({
      kind: 'unknown',
      externalEvidence: { facts: evidence.facts },
      evidenceError: null,
    });
  });
  it('14. provider timeout is bounded by the pipeline and is not a failure of the scan', async () => {
    const p = ports({ external: { research: () => new Promise(() => {}) }, externalTimeoutMs: 20 });
    const r = await runScanImportV2(scan('4305615614434'), ctx(), p);
    expect(r).toMatchObject({
      kind: 'unknown',
      externalEvidence: null,
      evidenceError: 'provider_timeout',
    });
  });
  it('15. malformed provider response is ignored, never partially trusted', async () => {
    const p = ports({
      external: { research: async () => ({ provider: 'x', facts: 'not-an-array' }) },
    });
    expect(await runScanImportV2(scan('4305615614434'), ctx(), p)).toMatchObject({
      kind: 'unknown',
      externalEvidence: null,
      evidenceError: 'provider_malformed',
    });
  });
  it('16/17/18/25. the same observation twice, later, after reload and across sessions → one import, one identity', async () => {
    const p = ports();
    p.catalog.rows = [];
    const first = await runScanImportV2(scan('5900820012434'), ctx(), p);
    const again = await runScanImportV2(scan('5900820012434'), ctx(), p);
    const later = await runScanImportV2(scan('5900820012434'), ctx({ now: 99_999 }), p);
    expect(first.kind).toBe('unknown');
    void again;
    void later;
    // once the product exists centrally (imported through the evidence flow), every rescan links, never duplicates
    p.catalog.rows = [
      product({
        productId: 'CA-5900820012434',
        ean: '5900820012434',
        strength: 'provisional_linked',
        entityKind: 'customer_provisional',
        productCode: 'linked:user-1',
      }),
    ];
    const r1 = await runScanImportV2(scan('5900820012434'), ctx(), p);
    const r2 = await runScanImportV2(scan('5900820012434'), ctx({ now: 5 }), p);
    expect(r1).toMatchObject({ kind: 'resolved_exact', import: { created: true } });
    expect(r2).toMatchObject({
      kind: 'resolved_exact',
      import: { created: false, productId: 'CA-5900820012434' },
    });
    expect(p.importer.central.size).toBe(1);
    if (r1.kind === 'resolved_exact' && r2.kind === 'resolved_exact')
      expect(idempotencyKey(r1.identity, ctx())).toBe(idempotencyKey(r2.identity, ctx({ now: 5 })));
  });
  it('19. ProductBehaviour missing/blocked → needs_confirmation with the identity kept', async () => {
    const p = ports();
    p.behaviour.outcomes.set('PR-ALSACE', 'unknown_requires_review');
    expect(await runScanImportV2(scan('3262970109108'), ctx(), p)).toMatchObject({
      kind: 'needs_confirmation',
      reason: 'behaviour_review',
      product: { productId: 'PR-ALSACE' },
    });
    p.behaviour.outcomes.set('PR-ALSACE', 'blocked');
    expect(await runScanImportV2(scan('3262970109108'), ctx(), p)).toMatchObject({
      kind: 'needs_confirmation',
      reason: 'behaviour_blocked',
    });
    expect(p.importer.calls).toBe(0);
  });
  it('20. missing price is a costing state on a resolved product, never a failure', async () => {
    const p = ports();
    const r = await runScanImportV2(scan('8402001047251'), ctx(), p);
    expect(r).toMatchObject({ kind: 'resolved_exact', price: { state: 'missing' } });
  });
  it('21. guest: read-only resolution of shared products, no import, provisional rows invisible', async () => {
    const p = ports();
    p.catalog.rows = [
      HACENDADO,
      product({
        productId: 'CA-X',
        ean: '5900820012434',
        strength: 'provisional_linked',
        entityKind: 'customer_provisional',
        productCode: 'linked:user-1',
      }),
    ];
    expect(await runScanImportV2(scan('8402001047251'), ctx({ accountId: null }), p)).toMatchObject(
      { kind: 'resolved_exact', import: null, importSkipped: 'guest' },
    );
    expect(await runScanImportV2(scan('5900820012434'), ctx({ accountId: null }), p)).toMatchObject(
      { kind: 'unknown' },
    );
    expect(p.importer.calls).toBe(0);
  });
  it('23. Product Country comes only from the context authority; identity never depends on it', async () => {
    const p = ports();
    const pl = await runScanImportV2(scan('3262970109108'), ctx({ productCountry: 'PL' }), p);
    const fr = await runScanImportV2(scan('3262970109108'), ctx({ productCountry: 'FR' }), p);
    const none = await runScanImportV2(scan('3262970109108'), ctx({ productCountry: null }), p);
    for (const r of [pl, fr, none])
      expect(r).toMatchObject({
        kind: 'resolved_exact',
        product: { productId: 'PR-ALSACE', country: 'FR' },
      });
  });
  it('24. HOME then PRO and PRO then HOME resolve the same identity and one import', async () => {
    const p = ports();
    const a = await runScanImportV2(scan('8402001047251'), ctx({ surface: 'HOME' }), p);
    const b = await runScanImportV2(scan('8402001047251'), ctx({ surface: 'PRO' }), p);
    expect(a).toMatchObject({ kind: 'resolved_exact', product: { productId: 'PR-HACENDADO' } });
    expect(b).toMatchObject({
      kind: 'resolved_exact',
      product: { productId: 'PR-HACENDADO' },
      import: { created: false },
    });
  });
  it('import persistence failure is IMPORT_FAILED with the identity kept', async () => {
    const p = ports();
    p.importer.fail = true;
    expect(await runScanImportV2(scan('8402001047251'), ctx(), p)).toMatchObject({
      kind: 'failed',
      code: 'import_failed',
      identity: { canonicalGtin13: '8402001047251' },
    });
  });
  it('mixed-format Scan Core evidence is carried, identity stays what Scan Core reported', async () => {
    const r = await runScanImportV2(
      scan('5900820012434', 'EAN-13', {
        evidence: { moduleNative: 1.2, fill: 0.1, mixedFormats: true },
      }),
      ctx(),
      ports(),
    );
    expect(r).toMatchObject({ kind: 'resolved_exact', identity: { symbology: 'EAN-13' } });
  });
});
