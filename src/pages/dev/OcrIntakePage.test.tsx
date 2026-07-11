/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { OcrIntakePage } from './OcrIntakePage';

const render = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

describe('OcrIntakePage', () => {
  it('renders the honest local-OCR intake surface', () => {
    const html = render(<OcrIntakePage />);
    const t = text(html);
    expect(t).toMatch(/Label OCR intake/);
    expect(t).toMatch(/never leaves this machine/);
    expect(t).toMatch(/Nothing is saved automatically/);
    expect(t).toMatch(/PNG, JPEG, WebP/);
  });

  it('is explicit that only pinned engine assets are fetched — never the image', () => {
    const t = text(render(<OcrIntakePage />));
    expect(t).toMatch(/worker script, WASM core, language models/);
    expect(t).toMatch(/never uploaded anywhere/);
  });

  it('accepts only the honest image formats in the file input', () => {
    const html = render(<OcrIntakePage />);
    expect(html).toMatch(/accept="image\/png,image\/jpeg,image\/webp"/);
    expect(html).toMatch(/type="file"/);
  });
});

describe('OcrIntakePage — full session surface (contract panels)', () => {
  it('renders the session section with the honest SAMPLE note (nothing extracted/saved)', () => {
    const t = text(render(<OcrIntakePage />));
    expect(t).toMatch(/Full intake session \(multi-image\)/);
    expect(t).toMatch(/SAMPLE session data/);
    expect(t).toMatch(/nothing is uploaded, nothing is saved/i);
    expect(t).toMatch(/extraction engine: not wired \(sample mode\)/);
  });

  it('renders the multi-image panel: drop zone, multi picker (heic accepted) and camera capture', () => {
    const html = render(<OcrIntakePage />);
    expect(html).toContain('aria-label="Drag and drop package photos here (or use the picker)"');
    expect(html).toMatch(/accept="image\/png,image\/jpeg,image\/webp,image\/heic,image\/heif,\.heic,\.heif"/);
    expect(html).toContain('capture="environment"');
  });

  it('renders the manual EAN entry with the sample barcode normalized', () => {
    const html = render(<OcrIntakePage />);
    expect(html).toContain('aria-label="Manual EAN / barcode"');
    expect(text(html)).toContain('Normalized: 8480000610928');
  });

  it('renders the evidence review with provenance badges and a real conflict', () => {
    const t = text(render(<OcrIntakePage />));
    expect(t).toContain('explicit');
    expect(t).toContain('calculated');
    expect(t).toContain('inferred');
    expect(t).toMatch(/Conflicting candidates — choose one:/);
  });

  it('never renders a fabricated value for the absent sample fields', () => {
    const t = text(render(<OcrIntakePage />));
    expect(t).toContain('not found — needs manual entry (never assumed 0)');
  });

  it('renders the duplicate panel with only its allowed actions', () => {
    const html = render(<OcrIntakePage />);
    expect(text(html)).toMatch(/Likely duplicate/);
    expect(html).toContain('aria-label="Open existing product"');
    expect(html).toContain('aria-label="Update existing (reviewed merge)"');
    expect(html).toContain('aria-label="Create as new product"');
  });

  it('keeps the duplicate re-check honestly disabled while unwired, and links the batch queue', () => {
    const html = render(<OcrIntakePage />);
    expect(html).toMatch(/aria-label="Re-run duplicate check"[^>]*disabled=""/);
    expect(html).toMatch(/href="\/dev\/ocr-batch"/);
  });

  it('keeps the original quick path intact alongside the session surface', () => {
    const t = text(render(<OcrIntakePage />));
    expect(t).toMatch(/Label OCR intake/);
    expect(t).toMatch(/Choose a label image/);
    expect(t).toMatch(/Full intake session/);
  });
});

describe('OcrIntakePage — boundaries (static)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const PAGE = strip(readFileSync(join(SRC, 'pages', 'dev', 'OcrIntakePage.tsx'), 'utf8'));

  it('is DEV-only and performs NO save: no service import, no DB verb, no fetch', () => {
    expect(PAGE.includes('import.meta.env.DEV')).toBe(true);
    expect(PAGE.includes('NotFoundPage')).toBe(true);
    expect(/@\/services\//.test(PAGE)).toBe(false);
    expect(/supabase/i.test(PAGE)).toBe(false);
    expect(/fetch\(/.test(PAGE)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(PAGE.includes(verb), verb).toBe(false);
    }
  });

  it('the draft stays local: no import service, no auto-save call', () => {
    expect(/importProductCatalog|createProductWithIdentity|matchAndSaveProduct/.test(PAGE)).toBe(false);
  });

  it('no paid vision API, no secret, no engine-value writes', () => {
    expect(/vision\.googleapis|openai|api[_-]?key|secret|service_role/i.test(PAGE)).toBe(false);
    expect(/pac_value\s*=|npac_value/i.test(PAGE)).toBe(false);
  });

  it('imports NOTHING beyond the locked contract, its own UI panels and the pre-existing modules', () => {
    // tracks G/H build extractor/session modules in sibling worktrees — the page
    // must consume CONTRACT TYPES ONLY and receive their logic via IntakeWiring.
    const RAW = readFileSync(join(SRC, 'pages', 'dev', 'OcrIntakePage.tsx'), 'utf8');
    const featureImports = [...RAW.matchAll(/from '@\/features\/ocr-intake\/([^']+)'/g)].map((m) => m[1]);
    const allowed = ['ocrCopy', 'ocrEngine', 'labelTextParser', 'reviewState', 'intakeContracts'];
    for (const imported of featureImports) {
      const ok = allowed.includes(imported ?? '') || (imported ?? '').startsWith('ui/');
      expect(ok, `unexpected feature import: ${imported}`).toBe(true);
    }
    // the contract import is types-only (no runtime coupling)
    expect(/import type \{[^}]*\} from '@\/features\/ocr-intake\/intakeContracts'/.test(RAW)).toBe(true);
  });
});
