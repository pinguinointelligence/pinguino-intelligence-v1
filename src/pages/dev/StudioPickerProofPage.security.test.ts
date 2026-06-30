/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const PAGE = strip(readFileSync(join(SRC, 'pages', 'dev', 'StudioPickerProofPage.tsx'), 'utf8'));
const FIX = strip(readFileSync(join(SRC, 'pages', 'dev', 'studioPickerProofFixture.ts'), 'utf8'));
const ALL = `${PAGE}\n${FIX}`;

describe('studio picker proof — boundaries', () => {
  it('is DEV-only (NotFoundPage in production)', () => {
    expect(PAGE.includes('import.meta.env.DEV')).toBe(true);
    expect(PAGE.includes('NotFoundPage')).toBe(true);
  });

  it('reads no DB / service and performs no write', () => {
    expect(/supabase/i.test(ALL)).toBe(false);
    expect(/@\/services\//.test(ALL)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(ALL.includes(verb), verb).toBe(false);
    }
  });

  it('never references pac/pod writes, the reference base, or npac', () => {
    expect(/pac_value\s*=/.test(ALL)).toBe(false);
    expect(/mapper_basement/i.test(ALL)).toBe(false);
    expect(/npac_value/i.test(ALL)).toBe(false);
  });
});
