/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { ocrCopy } from '@/features/ocr-intake/ocrCopy';
import { OcrBatchPage } from './OcrBatchPage';

const render = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

describe('OcrBatchPage', () => {
  it('renders the batch queue surface with the honest SAMPLE note', () => {
    const html = render(<OcrBatchPage />);
    const t = text(html);
    expect(t).toContain(ocrCopy.batch.title);
    expect(t).toMatch(/SAMPLE session data/);
    expect(t).toMatch(/nothing is uploaded, nothing is saved/i);
  });

  it('shows the sample queue with every outcome chip and the derived summary', () => {
    const t = text(render(<OcrBatchPage />));
    for (const label of Object.values(ocrCopy.batch.outcomes)) expect(t).toContain(label);
    expect(t).toContain(`${ocrCopy.batch.summaryLabels.processed} 4`);
    expect(t).toContain(`${ocrCopy.batch.summaryLabels.pending} 1`);
  });

  it('keeps the CSV-export slot honestly disabled while unwired', () => {
    const html = render(<OcrBatchPage />);
    expect(html).toMatch(new RegExp(`aria-label="${ocrCopy.batch.exportCsv}"[^>]*disabled=""`));
    expect(text(html)).toContain(ocrCopy.batch.exportCsvPending);
  });

  it('links back to the OCR intake page', () => {
    expect(render(<OcrBatchPage />)).toMatch(/href="\/dev\/ocr-intake"/);
  });
});

describe('OcrBatchPage — boundaries (static)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const PAGE = strip(readFileSync(join(SRC, 'pages', 'dev', 'OcrBatchPage.tsx'), 'utf8'));

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

  it('never runs the OCR engine and references no paid API or credential', () => {
    expect(/tesseract|createWorker|ocrEngine/i.test(PAGE)).toBe(false);
    expect(/vision\.googleapis|openai|api[_-]?key|secret|service_role/i.test(PAGE)).toBe(false);
    expect(/importProductCatalog|createProductWithIdentity|matchAndSaveProduct/.test(PAGE)).toBe(false);
  });
});
