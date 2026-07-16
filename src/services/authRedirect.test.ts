/**
 * OAuth redirect helpers — the open-redirect guard for `redirectTo` and the
 * post-redirect error-param parser/stripper (`src/services/authRedirect.ts`).
 */
import { describe, expect, it } from 'vitest';
import {
  allowedOAuthRedirectOrigin,
  parseOAuthRedirectError,
  stripOAuthErrorParams,
} from './authRedirect';

describe('allowedOAuthRedirectOrigin — exact-origin allowlist, closed by default', () => {
  it('passes each of the app’s own origins through unchanged', () => {
    for (const origin of [
      'https://staging.pinguinoai.com',
      'https://pinguinoai.com',
      'https://www.pinguinoai.com',
      'http://localhost:5173',
    ]) {
      expect(allowedOAuthRedirectOrigin(origin)).toBe(origin);
    }
  });

  it('refuses every other origin (scheme, host, port and lookalikes all count)', () => {
    for (const origin of [
      'https://evil.example.com',
      'http://pinguinoai.com', // scheme downgrade
      'http://staging.pinguinoai.com', // scheme downgrade
      'https://staging.pinguinoai.com.evil.com', // suffix lookalike
      'https://sub.pinguinoai.com', // unknown subdomain
      'https://pinguinoai.com:8443', // wrong port
      'http://localhost:5174', // wrong port
      'https://localhost:5173', // wrong scheme for localhost
    ]) {
      expect(allowedOAuthRedirectOrigin(origin)).toBeUndefined();
    }
  });

  it('never accepts a full URL — only a bare origin can match', () => {
    expect(allowedOAuthRedirectOrigin('https://staging.pinguinoai.com/')).toBeUndefined();
    expect(allowedOAuthRedirectOrigin('https://pinguinoai.com/anything?x=1')).toBeUndefined();
  });

  it('refuses empty / null / undefined', () => {
    expect(allowedOAuthRedirectOrigin('')).toBeUndefined();
    expect(allowedOAuthRedirectOrigin(null)).toBeUndefined();
    expect(allowedOAuthRedirectOrigin(undefined)).toBeUndefined();
  });
});

describe('parseOAuthRedirectError — error params in query or hash', () => {
  it('detects a provider failure in the query string, decoding the description', () => {
    expect(
      parseOAuthRedirectError('?error=server_error&error_description=Something+went+wrong', ''),
    ).toEqual({ kind: 'failed', description: 'Something went wrong' });
  });

  it('detects an error carried in the hash fragment (implicit flow)', () => {
    expect(
      parseOAuthRedirectError(
        '',
        '#error=server_error&error_code=500&error_description=Provider%20unavailable',
      ),
    ).toEqual({ kind: 'failed', description: 'Provider unavailable' });
  });

  it('classifies access_denied (user backed out at Google) as cancelled', () => {
    expect(parseOAuthRedirectError('?error=access_denied', '')).toEqual({
      kind: 'cancelled',
      description: null,
    });
    expect(
      parseOAuthRedirectError('', '#error=access_denied&error_description=User+denied+access'),
    ).toEqual({ kind: 'cancelled', description: 'User denied access' });
  });

  it('returns null when there are no error params at all', () => {
    expect(parseOAuthRedirectError('', '')).toBeNull();
    expect(parseOAuthRedirectError('?foo=1&bar=2', '#section')).toBeNull();
  });

  it('returns null on a SUCCESSFUL token redirect (tokens are not errors)', () => {
    expect(parseOAuthRedirectError('', '#access_token=abc&token_type=bearer')).toBeNull();
  });

  it('prefers the query string when both carry an error', () => {
    expect(
      parseOAuthRedirectError('?error=server_error', '#error=access_denied'),
    ).toEqual({ kind: 'failed', description: null });
  });
});

describe('stripOAuthErrorParams — removes ONLY the error params', () => {
  it('strips error params from the query while preserving everything else', () => {
    expect(
      stripOAuthErrorParams(
        'https://staging.pinguinoai.com/some/path?keep=1&error=server_error&error_code=500&error_description=x',
      ),
    ).toBe('https://staging.pinguinoai.com/some/path?keep=1');
  });

  it('strips error params from the hash only when the hash carries an error', () => {
    expect(
      stripOAuthErrorParams(
        'https://pinguinoai.com/?a=1#error=access_denied&error_description=denied',
      ),
    ).toBe('https://pinguinoai.com/?a=1');
    // A non-error hash is left completely alone (routing / anchors / tokens).
    expect(stripOAuthErrorParams('https://pinguinoai.com/#access_token=abc')).toBe(
      'https://pinguinoai.com/#access_token=abc',
    );
  });

  it('leaves an ordinary URL unchanged', () => {
    expect(stripOAuthErrorParams('http://localhost:5173/studio?tab=recipes#anchor')).toBe(
      'http://localhost:5173/studio?tab=recipes#anchor',
    );
  });

  it('returns non-absolute input unchanged instead of throwing', () => {
    expect(stripOAuthErrorParams('/relative?error=x')).toBe('/relative?error=x');
    expect(stripOAuthErrorParams('')).toBe('');
  });
});
