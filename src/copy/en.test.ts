import { describe, expect, it } from 'vitest';
import { copy } from './en';

/**
 * Internal-only copy subtrees that may still say "Demo" (pro/test surfaces in
 * Advanced Studio, not shown to Free Preview customers). Everything else is
 * customer-facing and must never say "Demo" (Phase 6C rebrand).
 */
const INTERNAL_PATHS = new Set(['studio.internalToggle', 'studio.presets']);

function collectStrings(
  value: unknown,
  path: string,
  out: Array<{ path: string; value: string }>,
): void {
  if (typeof value === 'string') {
    out.push({ path, value });
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (INTERNAL_PATHS.has(childPath)) continue;
      collectStrings(child, childPath, out);
    }
  }
}

describe('copy module', () => {
  it('lists all four product modes', () => {
    expect(copy.landing.modes.map((m) => m.name)).toEqual(['ECO', 'CLASSIC', 'PREMIUM', 'SIGNATURE']);
  });

  it('uses the Free Preview rebrand for the public CTA (no "Demo")', () => {
    expect(copy.landing.ctaPrimary).toBe('Start Free Preview');
  });

  it('has no customer-facing "Demo" wording anywhere (Phase 6C)', () => {
    const out: Array<{ path: string; value: string }> = [];
    collectStrings(copy, '', out);
    const offenders = out.filter((s) => /demo/i.test(s.value));
    expect(offenders.map((o) => `${o.path}: "${o.value}"`)).toEqual([]);
  });

  it('exposes the Free Preview / PI Preview / Unlock PI Pro vocabulary', () => {
    const all = JSON.stringify(copy);
    expect(all).toContain('Free Preview');
    expect(all).toContain('PI Preview');
    expect(all).toContain('Unlock PI Pro');
  });

  it('keeps the active engine label as the −11°C engine (Polish, owner P0)', () => {
    expect(copy.studio.engineTag).toBe(copy.nav.engineLabel);
    expect(copy.studio.engineTag).toBe('Silnik −11°C');
  });
});
