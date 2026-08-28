import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(import.meta.dirname, 'AdminWorkspacePage.tsx'), 'utf8');

describe('Admin operations responsive identity rows', () => {
  it('lets commit ids and delivery authority values wrap inside a 390 px viewport', () => {
    expect(source).toContain('sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-start sm:gap-4');
    expect(source).toContain('min-w-0 break-all font-mono text-left text-ink sm:text-right');
    expect(source).not.toContain('font-mono text-right text-ink">{String(b)}</dd>');
  });
});
