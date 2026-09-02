import { describe, expect, it } from 'vitest';
import { buildLabelPreflight } from './masterLabel';
import { buildMasterLabelPrintHtml } from './masterLabelPrint';
import { createCompleteLabel } from './masterLabelTestFixture';
import { MARKET_PROFILE_ORDER, marketProfile } from './marketProfiles';

describe('WORLD / UNIVERSAL label profile', () => {
  it('is one of exactly six profiles and remains informational', () => {
    expect(MARKET_PROFILE_ORDER).toEqual(['EU', 'UK', 'US', 'CA', 'AU_NZ', 'WORLD']);
    expect(marketProfile('WORLD')).toMatchObject({
      label: 'Świat / Uniwersalna',
      status: 'INFORMATIONAL',
      nutritionFormat: 'WORLD_100G',
      consumerLayout: 'world_neutral',
    });
  });

  it('becomes PRINT_READY_UNIVERSAL without regulatory verification or country assets', () => {
    const base = createCompleteLabel('WORLD');
    const label = createCompleteLabel('WORLD', {
      copies: 2,
      printer: { ...base.printer, copies: 2 },
    });
    const preflight = buildLabelPreflight(label);
    expect(preflight).toMatchObject({
      readyForSystemPrint: true,
      regulatoryProfileVerified: false,
      printReadiness: 'PRINT_READY_UNIVERSAL',
    });
    const html = buildMasterLabelPrintHtml(label);
    expect(html).toContain('data-readiness="PRINT_READY_UNIVERSAL"');
    expect(html).toContain('world-neutral-v1');
    expect(html).toContain('Nutrition per 100 g');
    expect(html).not.toContain('Nutrition Facts');
    expect(html).not.toContain('Valeur nutritive');
    expect(html).not.toContain('canada-fop');
    expect(html).not.toContain('% Daily Value');
    expect(html.match(/ETYKIETA WEWNĘTRZNA \/ INFORMACYJNA/g)).toHaveLength(2);
    expect(html.match(/NIEZWERYFIKOWANE DO SPRZEDAŻY DETALICZNEJ/g)).toHaveLength(2);
  });

  it('prints only real optional machine codes and never invents a GTIN', () => {
    const withoutCodes = buildMasterLabelPrintHtml(createCompleteLabel('WORLD'));
    expect(withoutCodes).not.toContain('data-code-kind=');

    const withCodes = createCompleteLabel('WORLD', {
      enabledOptionalFields: ['qr_code', 'lot_barcode', 'gtin', 'internal_article_id'],
      qrCodeValue: 'https://gellatti.example/lot/LOT-20260825-001',
      gtin: '5901234123457',
      internalArticleId: 'GEL-MILK-001',
    });
    const html = buildMasterLabelPrintHtml(withCodes);
    expect(html).toContain('data-code-kind="qr"');
    expect(html).toContain('data-code-kind="lot"');
    expect(html).toContain('data-code-kind="gtin"');
    expect(html).toContain('GEL-MILK-001');
  });

  it('fails closed when the selected package fill is absent even though batch mass exists', () => {
    const label = createCompleteLabel('WORLD', { packageQuantity: null, netQuantityG: null });
    const preflight = buildLabelPreflight(label);
    expect(preflight.printReadiness).toBe('NOT_READY');
    expect(preflight.items).toContainEqual(
      expect.objectContaining({ field: 'net_quantity', status: 'missing' }),
    );
  });
});
