import { describe, expect, it } from 'vitest';
import {
  CONTINUATION_PARAM,
  checkoutReturnUrls,
  decodeContinuation,
  encodeContinuation,
  pathForTarget,
  postCheckoutDestination,
  resumePath,
  withContinuation,
} from './shareContinuation';

const TOKEN = 'kJ8s-Zq2_1aBcDeFgHiJkLmNoPqRsTuV';

describe('§14/§19 — the share survives login, signup and checkout', () => {
  it('round-trips every target kind', () => {
    for (const target of [
      { kind: 'share', token: TOKEN },
      { kind: 'publication', handle: 'marysia', slug: 'pistachio-salted-caramel' },
      { kind: 'recipes' },
    ] as const) {
      expect(decodeContinuation(encodeContinuation(target))).toEqual(target);
    }
  });

  it('sends the user back to THE recipe after payment, not to a dashboard', () => {
    const { successUrl } = checkoutReturnUrls('https://staging.pinguinoai.com', {
      kind: 'share',
      token: TOKEN,
    });
    expect(successUrl).toContain('checkout=success');
    expect(postCheckoutDestination(new URL(successUrl).search, 'success')).toBe(`/share/${TOKEN}`);
  });

  it('a cancelled checkout also returns to the recipe', () => {
    const { cancelUrl } = checkoutReturnUrls('https://staging.pinguinoai.com', {
      kind: 'publication',
      handle: 'marysia',
      slug: 'pistachio-salted-caramel',
    });
    expect(postCheckoutDestination(new URL(cancelUrl).search, 'cancelled')).toBe(
      '/@marysia/pistachio-salted-caramel',
    );
  });

  it('appends the continuation to a login or subscription path', () => {
    expect(withContinuation('/subscription', { kind: 'share', token: TOKEN })).toBe(
      `/subscription?${CONTINUATION_PARAM}=s%3A${TOKEN}`,
    );
    expect(withContinuation('/login?next=1', { kind: 'recipes' })).toContain(
      `&${CONTINUATION_PARAM}=r`,
    );
  });

  it('builds the canonical in-app paths', () => {
    expect(pathForTarget({ kind: 'share', token: TOKEN })).toBe(`/share/${TOKEN}`);
    expect(pathForTarget({ kind: 'publication', handle: 'marysia', slug: 'lody' })).toBe(
      '/@marysia/lody',
    );
    expect(pathForTarget({ kind: 'recipes' })).toBe('/recipes');
  });
});

describe('a continuation is a return ADDRESS, never a permission or an open redirect', () => {
  it('refuses absolute URLs, protocol-relative URLs and traversal', () => {
    for (const hostile of [
      'https://evil.example/steal',
      '//evil.example',
      's:../../admin',
      'p:marysia:../../../etc/passwd',
      'p:admin:x:y',
      'javascript:alert(1)',
      's:short',
      '',
      null,
      undefined,
    ]) {
      expect(decodeContinuation(hostile as string | null), String(hostile)).toBeNull();
    }
  });

  it('falls back to /recipes rather than to anything a caller injected', () => {
    expect(resumePath('https://evil.example')).toBe('/recipes');
    expect(resumePath(null)).toBe('/recipes');
    expect(resumePath(`s:${TOKEN}`)).toBe(`/share/${TOKEN}`);
  });

  it('carries no entitlement claim — the payload is a path and a token, nothing else', () => {
    const encoded = encodeContinuation({ kind: 'share', token: TOKEN });
    expect(encoded).toBe(`s:${TOKEN}`);
    expect(encoded).not.toMatch(/pro|paid|entitle|unlock/i);
  });

  it('returns null when there is no journey to resume', () => {
    expect(postCheckoutDestination('?checkout=success', 'success')).toBeNull();
    expect(postCheckoutDestination(`?${CONTINUATION_PARAM}=s%3A${TOKEN}`, null)).toBeNull();
  });
});
