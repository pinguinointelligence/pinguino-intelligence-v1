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
});
