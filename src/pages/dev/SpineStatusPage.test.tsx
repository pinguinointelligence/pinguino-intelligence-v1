/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { SpineStatusPage } from './SpineStatusPage';

const render = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

describe('SpineStatusPage', () => {
  it('shows the locked execution spine and the AI guardrail', () => {
    const t = text(render(<SpineStatusPage />));
    expect(t).toMatch(/PINGUINO Spine — status/);
    expect(t).toMatch(/Recipe Intent → Designer → Product Profile → Base Engine → Temperature/);
    expect(t).toMatch(/AI\s+never calculates exact recipe values/);
  });

  it('lists the core modules with honest statuses', () => {
    const t = text(render(<SpineStatusPage />));
    for (const m of [
      'Mapper Basement',
      'Product Mapper',
      'Base Engine',
      'Product Profile Registry',
      'Recipe Intent',
      'Designer',
      'Temperature Regulator',
      'Integration Flow router',
      'Account Access',
    ]) {
      expect(t).toContain(m);
    }
    expect(t).toMatch(/done/);
    expect(t).toMatch(/partial/);
    expect(t).toMatch(/blocked on humans/);
    expect(t).toMatch(/not started/);
  });

  it('is honest about the frozen engine and the human calibration gate', () => {
    const t = text(render(<SpineStatusPage />));
    expect(t).toMatch(/ENGINE 0\.4\.0 \/ CONFIG 0\.5\.0/);
    expect(t).toMatch(/never as duplicate engines/);
    expect(t).toMatch(/43 awaiting team calibration/);
    expect(t).toMatch(/owner picks/);
  });

  it('links to the working DEV tools and names the governing docs', () => {
    const html = render(<SpineStatusPage />);
    for (const href of [
      '/dev/mapper-status',
      '/dev/mapper-review',
      '/dev/reference-proposals',
      '/dev/studio-picker-proof',
      '/dev/intake-hub',
      '/dev/enrichment-preview',
      '/dev/snapshot-audit',
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
    const t = text(html);
    expect(t).toMatch(/docs\/PINGUINO_SPINE\.md/);
    expect(t).toMatch(/docs\/PINGUINO_NEXT_IMPLEMENTATION_ROADMAP\.md/);
    expect(t).toMatch(/docs\/pinguino-spine\//);
    expect(t).toMatch(/OWNER_TEAM_CALIBRATION_HANDOFF\.md/);
  });

  it('states the never-rules (redaction, locked base, no invented values)', () => {
    const t = text(render(<SpineStatusPage />));
    expect(t).toMatch(/never: auto-write the locked reference base/);
    expect(t).toMatch(/exact grams or exact Auto Fix in demo/);
  });
});

describe('SpineStatusPage — boundaries (static)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const PAGE = strip(readFileSync(join(SRC, 'pages', 'dev', 'SpineStatusPage.tsx'), 'utf8'));

  it('is DEV-only and reads/writes no DB or service', () => {
    expect(PAGE.includes('import.meta.env.DEV')).toBe(true);
    expect(PAGE.includes('NotFoundPage')).toBe(true);
    expect(/supabase/i.test(PAGE)).toBe(false);
    expect(/@\/services\//.test(PAGE)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(PAGE.includes(verb), verb).toBe(false);
    }
    // fully static — no fetch, no effects, no state
    expect(/fetch\(|useEffect|useState/.test(PAGE)).toBe(false);
  });

  it('contains no engine-value writes, secrets, or external benchmark tool names', () => {
    expect(/pac_value\s*=|npac_value/i.test(PAGE)).toBe(false);
    expect(/api[_-]?key|secret|service_role/i.test(PAGE)).toBe(false);
    expect(/tesseract|createWorker|vision\.googleapis|openai/i.test(PAGE)).toBe(false);
  });
});
