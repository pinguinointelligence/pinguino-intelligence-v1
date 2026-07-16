import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deriveSentryEnvironment,
  initSentryReporting,
  resetGlobalErrorListenersForTest,
  sanitizeErrorContext,
  sanitizeSentryEvent,
  type SentryLike,
} from './sentryReporting';
import { reportError, resetErrorReporter } from './errorReporter';

afterEach(() => {
  resetErrorReporter();
  resetGlobalErrorListenersForTest();
  vi.restoreAllMocks();
});

/** A fake SDK capturing init options + exceptions (no network, no real Sentry). */
function fakeSentry() {
  const calls: { init: unknown[]; captured: { error: unknown; context?: unknown }[] } = {
    init: [],
    captured: [],
  };
  const sdk: SentryLike = {
    init: (options) => {
      calls.init.push(options);
    },
    captureException: (error, context) => {
      calls.captured.push({ error, context });
      return 'event-id';
    },
  };
  return { sdk, calls };
}

describe('deriveSentryEnvironment', () => {
  it('names the staging domain "staging"', () => {
    expect(deriveSentryEnvironment('staging.pinguinoai.com')).toBe('staging');
    expect(deriveSentryEnvironment('STAGING.PINGUINOAI.COM')).toBe('staging');
  });

  it('names the production domain "production"', () => {
    expect(deriveSentryEnvironment('pinguinoai.com')).toBe('production');
    expect(deriveSentryEnvironment('www.pinguinoai.com')).toBe('production');
  });

  it('everything else (localhost, previews) is "development"', () => {
    expect(deriveSentryEnvironment('localhost')).toBe('development');
    expect(deriveSentryEnvironment('pinguino-staging-abc.vercel.app')).toBe('development');
  });
});

describe('sanitizeErrorContext', () => {
  it('redacts sensitive-looking keys', () => {
    const out = sanitizeErrorContext({
      authToken: 'abc',
      apiKey: 'k',
      password: 'p',
      userEmail: 'a@b.c',
      safe: 'value',
    });
    expect(out).toMatchObject({
      authToken: '[redacted]',
      apiKey: '[redacted]',
      password: '[redacted]',
      userEmail: '[redacted]',
      safe: 'value',
    });
  });

  it('truncates long strings (no full payloads leave the app)', () => {
    const out = sanitizeErrorContext({ componentStack: 'x'.repeat(2000) });
    expect(String(out?.componentStack).length).toBeLessThan(600);
    expect(String(out?.componentStack)).toContain('[truncated]');
  });

  it('summarizes objects instead of shipping them verbatim', () => {
    const out = sanitizeErrorContext({ recipePayload: { items: [1, 2, 3] } });
    expect(out?.recipePayload).toBe('[object]');
  });

  it('passes undefined through', () => {
    expect(sanitizeErrorContext(undefined)).toBeUndefined();
  });
});

describe('sanitizeSentryEvent', () => {
  it('strips request headers and cookies', () => {
    const event = sanitizeSentryEvent({ request: { headers: { a: 1 }, cookies: 'c', url: 'https://x' } });
    expect(event.request?.headers).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.url).toBe('https://x');
  });
});

describe('initSentryReporting', () => {
  it('is DISABLED without a DSN — the SDK is never even loaded', async () => {
    const loadSentry = vi.fn(async () => fakeSentry().sdk);
    const result = await initSentryReporting({ dsn: '', loadSentry });
    expect(result).toBe('disabled');
    expect(loadSentry).not.toHaveBeenCalled();
  });

  it('initializes with a DSN: correct environment, no PII, no tracing, sanitizers wired', async () => {
    const { sdk, calls } = fakeSentry();
    const result = await initSentryReporting({
      dsn: 'https://public@example.ingest.sentry.io/1',
      hostname: 'staging.pinguinoai.com',
      loadSentry: async () => sdk,
    });
    expect(result).toBe('initialized');
    expect(calls.init).toHaveLength(1);
    const options = calls.init[0] as {
      environment: string;
      sendDefaultPii: boolean;
      tracesSampleRate: number;
      beforeBreadcrumb: (b: { category?: string }) => unknown;
    };
    expect(options.environment).toBe('staging');
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    // console breadcrumbs (which may embed payloads) are dropped; others kept
    expect(options.beforeBreadcrumb({ category: 'console' })).toBeNull();
    expect(options.beforeBreadcrumb({ category: 'ui.click' })).toEqual({ category: 'ui.click' });
  });

  it('installs the reporter: reportError forwards to Sentry with the source tag + sanitized context', async () => {
    const { sdk, calls } = fakeSentry();
    vi.spyOn(console, 'error').mockImplementation(() => {}); // console sink still fires
    await initSentryReporting({
      dsn: 'https://public@example.ingest.sentry.io/1',
      hostname: 'pinguinoai.com',
      loadSentry: async () => sdk,
    });

    reportError(new Error('boom'), 'react_render', { componentStack: 'at X', authToken: 'nope' });

    expect(calls.captured).toHaveLength(1);
    const captured = calls.captured[0] as {
      error: Error;
      context: { tags: Record<string, string>; extra: Record<string, unknown> };
    };
    expect(captured.error.message).toBe('boom');
    expect(captured.context.tags).toEqual({ source: 'react_render' });
    expect(captured.context.extra).toMatchObject({ componentStack: 'at X', authToken: '[redacted]' });
    expect(console.error).toHaveBeenCalled(); // local DX preserved
  });

  it('a failing SDK load degrades to the console sink (never breaks the app)', async () => {
    const result = await initSentryReporting({
      dsn: 'https://public@example.ingest.sentry.io/1',
      hostname: 'pinguinoai.com',
      loadSentry: async () => {
        throw new Error('network down');
      },
    });
    expect(result).toBe('failed');
    // reportError still works via the default console sink
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError(new Error('still reported'));
    expect(spy).toHaveBeenCalled();
  });

  it('is safe in a non-browser environment (no window → listeners no-op)', async () => {
    // node test env has no window; this must not throw
    const result = await initSentryReporting({ dsn: '' });
    expect(result).toBe('disabled');
  });
});
