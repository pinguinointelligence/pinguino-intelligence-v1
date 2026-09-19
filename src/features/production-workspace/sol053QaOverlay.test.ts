import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const overlay = readFileSync(
  new URL('../../../scripts/sol-053-staging-identity-overlay.js', import.meta.url),
  'utf8',
);

describe('SOL-053 served-staging identity overlay', () => {
  it('is staging-only, read-only, and never renders or logs full auth tokens', () => {
    expect(overlay).toContain("location.hostname === 'staging.pinguinoai.com'");
    expect(overlay).toContain("method: 'GET'");
    expect(overlay).toContain('scope=eq.pro&status=eq.active');
    expect(overlay).not.toMatch(/localStorage\.(?:setItem|removeItem|clear)\s*\(/);
    expect(overlay).not.toMatch(/sessionStorage\.(?:setItem|removeItem|clear)\s*\(/);
    expect(overlay).not.toMatch(/console\.(?:log|info|warn|error)\s*\(/);
    expect(overlay).not.toMatch(/<dd>\$\{accessToken\}|<dd>\$\{session\?\.refresh_token\}/);
  });

  it('shows only shortened identity claims plus the required QA context', () => {
    for (const label of ['sub', 'session_id', 'e-mail', 'rola', 'Supabase ref', 'aktywny prefix']) {
      expect(overlay).toContain(label);
    }
    expect(overlay).toContain('const short = (value) =>');
    expect(overlay).toContain('/\\bC0[1-6]\\b/');
    expect(overlay).toContain('PRO</dd>');
  });
});
