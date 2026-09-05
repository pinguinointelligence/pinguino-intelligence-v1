import { describe, expect, it } from 'vitest';
import {
  createSupabaseDiscoveryPort,
  legacyBarcode,
  ledgerToLegacyResult,
  type FunctionsClientLike,
} from '../adapters/supabaseDiscoveryAdapter';
import { identifyCode } from '../codeIdentity';
import { buildLedger } from '../discovery/ledger';
import { scan } from './codeIdentity.test';
import { ctx } from './fakes';

const id = (v: string, s: Parameters<typeof scan>[1] = 'EAN-13') => {
  const r = identifyCode(scan(v, s));
  if (!r.ok) throw new Error(r.reason);
  return r.identity;
};

function client(responses: Record<string, unknown>, rpcs: Record<string, unknown> = {}) {
  const calls: { name: string; body: unknown }[] = [];
  const c: FunctionsClientLike & { calls: typeof calls } = {
    calls,
    functions: {
      async invoke(name, { body }) {
        calls.push({ name, body });
        return { data: responses[name] ?? null, error: null };
      },
    },
    async rpc(fn, args) {
      calls.push({ name: fn, body: args });
      return { data: rpcs[fn] ?? null, error: null };
    },
  };
  return c;
}

describe('Supabase discovery adapter (stub) — mirrors the legacy scan-session contracts', () => {
  it('research sends ean_lookup with the legacy ValidBarcode and maps a research answer into a session', async () => {
    const c = client({
      'product-scan-analyze': {
        sessionId: 's',
        kind: 'ean_lookup',
        result: {
          identity: { displayName: 'X', brand: 'Y' },
          externalSources: [
            {
              sourceType: 'manufacturer',
              url: 'https://m',
              title: null,
              fieldsUsed: ['identity.displayName', 'identity.brand'],
            },
          ],
        },
        overlayState: 'SCAN_DRAFT',
        missingCriticalFields: ['nutrition.energyKcal'],
        usage: { visionCalls: 0, webCalls: 1, estimatedCostUsd: 0.001 },
      },
    });
    const port = createSupabaseDiscoveryPort(c, { newSessionId: () => 'fixed-session' });
    const r = await port.research(id('4305615614434'), ctx());
    expect(c.calls[0]).toEqual({
      name: 'product-scan-analyze',
      body: {
        sessionId: 'fixed-session',
        mode: 'ean_lookup',
        images: [],
        barcode: { value: '4305615614434', format: 'EAN_13', lookupValue: '4305615614434' },
      },
    });
    expect(r.kind).toBe('researched');
    if (r.kind === 'researched') {
      expect(r.session.missingCritical).toEqual(['nutrition.energyKcal']);
      const ledger = buildLedger(r.session.identity, r.session.result, r.session.missingCritical);
      expect(ledger.facts.find((f) => f.field === 'identity.brand')).toMatchObject({
        value: 'Y',
        source: 'manufacturer',
        sourceUrl: 'https://m',
      });
    }
  });
  it('a server exact answer becomes the existing product (never a new one)', async () => {
    const c = client({
      'product-scan-analyze': {
        sessionId: 's',
        kind: 'existing_product',
        product: {
          id: 'P1',
          productCode: 'PR-1',
          displayName: 'Known',
          brand: 'B',
          entityKind: 'commercial_product',
          status: 'verified',
          engineReady: true,
        },
        usage: { visionCalls: 0, webCalls: 0, estimatedCostUsd: 0 },
      },
    });
    const r = await createSupabaseDiscoveryPort(c).research(id('8402001047251'), ctx());
    expect(r).toMatchObject({
      kind: 'existing_product',
      product: {
        productId: 'P1',
        productCode: 'PR-1',
        engineReady: true,
        strength: 'canonical_shared',
      },
    });
  });
  it('label analysis sends images + barcode + missingFields on the same session; finalize maps every server kind', async () => {
    const c = client({
      'product-scan-analyze': {
        sessionId: 's',
        result: { identity: { displayName: 'L' } },
        overlayState: 'USABLE_FOR_OWNER',
        missingCriticalFields: [],
        usage: { visionCalls: 1, webCalls: 0, estimatedCostUsd: 0.01 },
      },
      'product-scan-finalize': {
        kind: 'customer_added_product',
        productId: 'CA-1',
        productCode: 'CA-ING-1',
        engineUsable: false,
      },
    });
    const port = createSupabaseDiscoveryPort(c, { newSessionId: () => 'S1' });
    const identity = id('4305615614434');
    const session = {
      sessionId: 'S1',
      identity,
      result: null,
      overlayState: null,
      missingCritical: ['ingredientsText'],
      usage: { visionCalls: 0, webCalls: 0 },
    };
    const a = await port.analyzeLabel(
      session,
      [
        {
          assetId: 'a',
          mime: 'image/jpeg',
          base64: 'x',
          source: 'camera_manual',
          originalMime: 'image/jpeg',
          transformations: [],
          qualityScore: 1,
        },
      ],
      ctx(),
    );
    expect(c.calls[0]?.body).toMatchObject({
      sessionId: 'S1',
      accurateRetry: false,
      missingFields: ['ingredientsText'],
      barcode: { format: 'EAN_13' },
    });
    expect(a.kind).toBe('analyzed');
    const f = await port.finalize(session, { customerFamily: 'other', privateOverlay: {} }, ctx());
    expect(c.calls[1]?.body).toMatchObject({
      action: 'finalize',
      sessionId: 'S1',
      idempotencyKey: 'scan-import-v2:user-1:4305615614434:finalize',
      customerFamily: 'other',
    });
    expect(f).toEqual({
      kind: 'created',
      privateNotReady: false,
      productId: 'CA-1',
      productCode: 'CA-ING-1',
      displayName: null,
      brand: null,
      engineUsable: false,
      existing: false,
    });
  });
  it('finalize: family_confirmation_required / not_ready / idempotent are mapped; no engine readiness is invented', async () => {
    const mk = (resp: unknown) =>
      createSupabaseDiscoveryPort(client({ 'product-scan-finalize': resp }), {
        newSessionId: () => 'S',
      });
    const identity = id('4305615614434');
    const session = {
      sessionId: 'S',
      identity,
      result: null,
      overlayState: null,
      missingCritical: [],
      usage: { visionCalls: 0, webCalls: 0 },
    };
    expect(
      await mk({ kind: 'family_confirmation_required' }).finalize(session, {}, ctx()),
    ).toMatchObject({ kind: 'family_confirmation_required' });
    expect(
      await mk({
        kind: 'customer_product_not_ready',
        missingCriticalFields: ['nutrition.energyKcal'],
      }).finalize(session, { customerFamily: 'other' }, ctx()),
    ).toMatchObject({ kind: 'not_ready', missingCritical: ['nutrition.energyKcal'] });
    expect(
      await mk({
        kind: 'idempotent',
        productId: 'CA-1',
        productCode: null,
        engineUsable: true,
      }).finalize(session, { customerFamily: 'other' }, ctx()),
    ).toMatchObject({ kind: 'created', productId: 'CA-1', engineUsable: true, existing: true });
  });
  it('product request carries the ledger as the legacy result shape with V2 provenance; own open requests are found by code', async () => {
    const c = client(
      {},
      {
        gellatti_submit_product_request_v1: {
          kind: 'product_request',
          requestId: 'R1',
          requestNumber: 7,
          status: 'SUBMITTED',
        },
        gellatti_my_product_requests_v1: {
          requests: [{ id: 'R1', detectedEan: '4305615614434', status: 'SUBMITTED' }],
        },
      },
    );
    const port = createSupabaseDiscoveryPort(c);
    const identity = id('4305615614434');
    const ledger = buildLedger(
      identity,
      {
        identity: { displayName: 'Orbit', brand: 'Wrigley' },
        evidence: [
          { field: 'identity.displayName', source: 'label' },
          { field: 'identity.brand', source: 'label' },
        ],
      },
      ['nutrition.energyKcal'],
    );
    const q = await port.submitRequest(identity, ledger, null, ctx({ productCountry: 'DE' }));
    expect(q).toEqual({ kind: 'product_request', requestId: 'R1', status: 'SUBMITTED' });
    expect(c.calls[0]?.body).toMatchObject({
      p_scan_session_id: null,
      p_market_country_code: 'DE',
      p_idempotency_key: 'scan-import-v2:user-1:4305615614434:request',
      p_payload: {
        result: {
          identity: { displayName: 'Orbit', brand: 'Wrigley' },
          barcodes: [{ kind: 'EAN_13', value: '4305615614434' }],
        },
        provenance: { authority: 'SCAN_IMPORT_V2_DISCOVERY_V1', scanCore: { symbology: 'EAN-13' } },
      },
    });
    expect(await port.findOwnRequest(identity, ctx())).toEqual({
      requestId: 'R1',
      status: 'SUBMITTED',
      approvedProductId: null,
    });
  });
  it('legacy barcode mapping keeps the actual symbology; UPC-E lookups use the expanded UPC-A', () => {
    expect(legacyBarcode(id('8402001047251'))).toEqual({
      value: '8402001047251',
      format: 'EAN_13',
      lookupValue: '8402001047251',
    });
    expect(legacyBarcode(id('01234565', 'UPC-E'))).toMatchObject({
      value: '01234565',
      format: 'UPC_E',
    });
    expect(
      ledgerToLegacyResult(id('96385074', 'EAN-8'), buildLedger(id('96385074', 'EAN-8'), null, []))
        .barcodes,
    ).toEqual([{ kind: 'EAN_8', value: '96385074' }]);
  });
});
