/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { ReferenceProposalsPage } from './ReferenceProposalsPage';

const render = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

describe('ReferenceProposalsPage', () => {
  it('lists the proposals with target, unlocks, missing fields, and a needs_pacpod badge', () => {
    const t = text(render(<ReferenceProposalsPage />));
    expect(t).toMatch(/Basement reference proposals/);
    expect(t).toMatch(/Almond/);
    expect(t).toMatch(/Erythritol/);
    expect(t).toMatch(/PR-ING-000040/); // almond unlock
    expect(t).toMatch(/needs_pacpod/);
    expect(t).toMatch(/do not insert/i);
  });
});

describe('ReferenceProposalsPage — boundaries (static)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const PAGE = strip(readFileSync(join(SRC, 'pages', 'dev', 'ReferenceProposalsPage.tsx'), 'utf8'));

  it('is DEV-only and never writes / reads mapper_basement / a DB', () => {
    expect(PAGE.includes('import.meta.env.DEV')).toBe(true);
    expect(PAGE.includes('NotFoundPage')).toBe(true);
    expect(/supabase/i.test(PAGE)).toBe(false);
    expect(/@\/services\//.test(PAGE)).toBe(false);
    expect(/mapper_basement/i.test(PAGE)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(PAGE.includes(verb), verb).toBe(false);
    }
  });

  it('never carries a numeric pac/pod or npac', () => {
    expect(/pac_value\s*:\s*[\d.]/.test(PAGE)).toBe(false);
    expect(/pod_value\s*:\s*[\d.]/.test(PAGE)).toBe(false);
    expect(/npac_value/i.test(PAGE)).toBe(false);
  });
});
