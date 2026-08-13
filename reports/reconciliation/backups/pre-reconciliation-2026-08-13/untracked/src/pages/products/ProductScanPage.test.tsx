import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ProductScanPage } from './ProductScanPage';

vi.mock('@/services/products', () => ({ listMyProducts: vi.fn(async () => []) }));
vi.mock('@/services/ocrIntakePersistence', () => ({ persistSessionAndSave: vi.fn() }));

const render = () => renderToStaticMarkup(<MemoryRouter><ProductScanPage /></MemoryRouter>);
const SOURCE = readFileSync(join(process.cwd(), 'src/pages/products/ProductScanPage.tsx'), 'utf8');
const EDGE = readFileSync(join(process.cwd(), 'supabase/functions/catalog-submit/index.ts'), 'utf8');
const HARDENING = readFileSync(join(process.cwd(), 'supabase/migrations/0044_global_product_catalog_trust_hardening.sql'), 'utf8');

describe('customer OCR global-catalog entry', () => {
  it('is a real customer surface with multi-image roles, honest privacy and no opt-in', () => {
    const html = render();
    expect(html).toContain('Dodaj produkt ze zdjęć etykiety');
    expect(html).toContain('multiple=""');
    expect(html).toContain('Cena, dostawca, notatki i stan magazynowy nigdy nie są publikowane');
    expect(SOURCE).toContain('Ten produkt jest jawnie bez marki');
    expect(SOURCE).toContain('explicitlyUnbranded,');
    expect(SOURCE).not.toMatch(/opt.?in|zgadzam się na publikację/i);
  });

  it('connects local OCR review to the one persistence orchestrator', () => {
    expect(SOURCE).toContain('new TesseractOcrProvider()');
    expect(SOURCE).toContain('extractSessionFields');
    expect(SOURCE).toContain('<EvidenceReviewPanel');
    expect(SOURCE).toContain('persistSessionAndSave(ready');
    expect(SOURCE).toContain('assessDuplicate');
  });

  it('preflights ownership and rate before evidence download/archive', () => {
    const preflight = EDGE.indexOf("service.rpc('begin_global_catalog_submission'");
    const capture = EDGE.indexOf('captureOwnedEvidence({');
    expect(preflight).toBeGreaterThan(0);
    expect(capture).toBeGreaterThan(preflight);
    expect(EDGE).toContain('ocr_evidence_checksum_mismatch');
    expect(EDGE).toContain('CATALOG_RISK_HMAC_SECRET');
    expect(EDGE).not.toContain('hmacRiskValue(forwarded, serviceKey)');
  });

  it('requires service OCR for GREEN and exact signoff for Engine mapping', () => {
    expect(HARDENING).toContain('global_catalog_server_ocr_attestations');
    expect(HARDENING).toContain("if not v_attested and ((v_result->>'kind')='created' or v_resuming_blocked) then");
    expect(HARDENING).toContain('global_catalog_engine_mappings');
    expect(HARDENING).toContain('signoff does not attest this Mapper identity');
    expect(HARDENING).toContain('m.approved_for_engines');
  });
});
