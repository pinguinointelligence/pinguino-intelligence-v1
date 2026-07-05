/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { IntakeHubPage } from './IntakeHubPage';

const render = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

describe('IntakeHubPage', () => {
  it('lists every intake path with an honest state', () => {
    const html = render(<IntakeHubPage />);
    const t = text(html);
    expect(t).toMatch(/Product intake hub/);
    expect(t).toMatch(/CSV \/ table upload/);
    expect(t).toMatch(/Barcode \/ EAN lookup/);
    expect(t).toMatch(/Image \/ label OCR/);
    expect(t).toMatch(/working/);
    expect(t).toMatch(/planned/);
    // links to the working pipelines
    expect(html).toMatch(/href="\/products\/import"/);
    expect(html).toMatch(/href="\/dev\/enrichment-preview"/);
  });

  it('does not fake OCR or imply a paid vision API', () => {
    const t = text(render(<IntakeHubPage />));
    expect(t).toMatch(/NOT AVAILABLE/);
    expect(t).toMatch(/keyless\/local/);
    expect(t).toMatch(/no paid vision API/);
  });

  it('renders the intake-input classifier panel', () => {
    const html = render(<IntakeHubPage />);
    expect(text(html)).toMatch(/Classify an intake input/);
    expect(html).toMatch(/placeholder="catalog\.csv/);
  });
});

describe('IntakeHubPage — boundaries (static)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const PAGE = strip(readFileSync(join(SRC, 'pages', 'dev', 'IntakeHubPage.tsx'), 'utf8'));

  it('is DEV-only and reads/writes no DB or service', () => {
    expect(PAGE.includes('import.meta.env.DEV')).toBe(true);
    expect(PAGE.includes('NotFoundPage')).toBe(true);
    expect(/supabase/i.test(PAGE)).toBe(false);
    expect(/@\/services\//.test(PAGE)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(PAGE.includes(verb), verb).toBe(false);
    }
  });

  it('contains no OCR engine / paid-API / secret reference', () => {
    expect(/tesseract\.recognize|createWorker|vision\.googleapis|openai|api[_-]?key|secret/i.test(PAGE)).toBe(false);
    expect(/pac_value\s*=|npac_value/i.test(PAGE)).toBe(false);
  });
});
