/**
 * Shared redirect-URL allowlist (supabase/functions/_shared/urlAllowlist.ts)
 * — the open-redirect guard every billing Edge Function source uses for
 * checkout success/cancel, portal return and Connect return/refresh URLs.
 */
import { describe, expect, it } from 'vitest';
import {
  isAllowedRedirectUrl,
  parseUrlAllowlist,
} from '../../supabase/functions/_shared/urlAllowlist.ts';

describe('parseUrlAllowlist — env value → normalized origins', () => {
  it('parses comma-separated origins, trimming and deduplicating', () => {
    expect(
      parseUrlAllowlist('https://app.example.com, http://localhost:5173 ,https://app.example.com'),
    ).toEqual(['https://app.example.com', 'http://localhost:5173']);
  });

  it('normalizes entries with paths down to their origin', () => {
    expect(parseUrlAllowlist('https://app.example.com/some/path')).toEqual([
      'https://app.example.com',
    ]);
  });

  it('drops malformed and non-http(s) entries instead of trusting them', () => {
    expect(parseUrlAllowlist('not a url, javascript:alert(1), ftp://x.example')).toEqual([]);
    expect(parseUrlAllowlist('')).toEqual([]);
    expect(parseUrlAllowlist(null)).toEqual([]);
    expect(parseUrlAllowlist(undefined)).toEqual([]);
  });
});

describe('isAllowedRedirectUrl — exact-origin allowlist, closed by default', () => {
  const allowlist = parseUrlAllowlist('https://app.example.com,http://localhost:5173');

  it('allows exact-origin matches with any path/query', () => {
    expect(isAllowedRedirectUrl('https://app.example.com/billing/success?x=1', allowlist)).toBe(true);
    expect(isAllowedRedirectUrl('http://localhost:5173/billing/cancel', allowlist)).toBe(true);
  });

  it('refuses different origins, subdomains, schemes and ports', () => {
    expect(isAllowedRedirectUrl('https://evil.example.com/', allowlist)).toBe(false);
    expect(isAllowedRedirectUrl('https://app.example.com.evil.com/', allowlist)).toBe(false);
    expect(isAllowedRedirectUrl('https://sub.app.example.com/', allowlist)).toBe(false);
    expect(isAllowedRedirectUrl('http://app.example.com/', allowlist)).toBe(false); // scheme downgrade
    expect(isAllowedRedirectUrl('https://app.example.com:8443/', allowlist)).toBe(false);
    expect(isAllowedRedirectUrl('http://localhost:5174/', allowlist)).toBe(false);
  });

  it('refuses relative URLs, credentials, and non-http(s) schemes', () => {
    expect(isAllowedRedirectUrl('/relative/path', allowlist)).toBe(false);
    expect(isAllowedRedirectUrl('https://user:pass@app.example.com/', allowlist)).toBe(false);
    expect(isAllowedRedirectUrl('javascript:alert(1)', allowlist)).toBe(false);
    expect(isAllowedRedirectUrl('', allowlist)).toBe(false);
    expect(isAllowedRedirectUrl(null, allowlist)).toBe(false);
    expect(isAllowedRedirectUrl(undefined, allowlist)).toBe(false);
  });

  it('an EMPTY allowlist allows NOTHING (unconfigured → closed)', () => {
    expect(isAllowedRedirectUrl('https://app.example.com/', [])).toBe(false);
  });
});
