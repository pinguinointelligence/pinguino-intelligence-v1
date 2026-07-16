/**
 * Sentry error monitoring — wired through the existing errorReporter seam.
 *
 * Design (test-pinned):
 *  - The ONLY configuration input is the PUBLIC env var `VITE_SENTRY_DSN` (a Sentry
 *    DSN is client-safe by design — it can only ingest events, never read them).
 *    Without it, nothing initializes and nothing is downloaded: local development
 *    keeps working exactly as before (console sink only).
 *  - The Sentry SDK is loaded via dynamic import so the main bundle stays clean
 *    when monitoring is disabled; the loader is injectable for deterministic tests.
 *  - Environment naming is derived from the hostname: staging.pinguinoai.com →
 *    "staging", pinguinoai.com → "production", anything else → "development".
 *  - Reporting goes through `setErrorReporter`: every reported event ALSO keeps the
 *    console sink (unchanged DX), then forwards to Sentry with the source as a tag.
 *  - Sanitization: context keys that look sensitive are redacted, long values are
 *    truncated, request headers/cookies are stripped, and console breadcrumbs are
 *    dropped (they may carry recipe payloads). `sendDefaultPii` stays false.
 *  - No Session Replay. No tracing (`tracesSampleRate: 0`).
 *  - Also wires the previously-unwired global `window_error` / `unhandled_rejection`
 *    listeners through `reportError` (console-only when Sentry is disabled).
 */
import { consoleErrorReporter, reportError, setErrorReporter, type ReportedError } from './errorReporter';

/* ------------------------------------------------------------------ *
 * Pure helpers (unit-tested)                                          *
 * ------------------------------------------------------------------ */

export type SentryEnvironmentName = 'staging' | 'production' | 'development';

/** Deterministic environment name from the page hostname. */
export function deriveSentryEnvironment(hostname: string): SentryEnvironmentName {
  const h = hostname.trim().toLowerCase();
  if (h === 'staging.pinguinoai.com') return 'staging';
  if (h === 'pinguinoai.com' || h === 'www.pinguinoai.com') return 'production';
  return 'development';
}

const SENSITIVE_KEY = /token|secret|password|passwd|authorization|api[-_]?key|cookie|session|email/i;
const MAX_CONTEXT_STRING = 500;

/**
 * Sanitize a reported-error context before it leaves the app: sensitive-looking
 * keys are redacted and long strings truncated. Never throws.
 */
export function sanitizeErrorContext(
  context: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = '[redacted]';
    } else if (typeof value === 'string' && value.length > MAX_CONTEXT_STRING) {
      out[key] = `${value.slice(0, MAX_CONTEXT_STRING)}… [truncated]`;
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      out[key] = value;
    } else {
      // Objects/arrays are summarized, never shipped verbatim (no payload leaks).
      out[key] = `[${typeof value}]`;
    }
  }
  return out;
}

/** Minimal shape of a Sentry event the sanitizer touches (structural, no SDK types). */
export interface SentryEventLike {
  request?: { headers?: unknown; cookies?: unknown; [k: string]: unknown };
  [k: string]: unknown;
}

/** beforeSend: strip request headers/cookies defensively. Pure. */
export function sanitizeSentryEvent<E extends SentryEventLike>(event: E): E {
  if (event.request) {
    delete event.request.headers;
    delete event.request.cookies;
  }
  return event;
}

/* ------------------------------------------------------------------ *
 * Global listeners (console-only until Sentry initializes)            *
 * ------------------------------------------------------------------ */

let listenersWired = false;

/** Wire window error/unhandledrejection through reportError. Safe without a DOM. */
export function initGlobalErrorListeners(): boolean {
  if (listenersWired || typeof window === 'undefined') return false;
  listenersWired = true;
  window.addEventListener('error', (event) => {
    reportError(event.error ?? event.message, 'window_error');
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, 'unhandled_rejection');
  });
  return true;
}

/** Test-only: allow re-wiring in isolated tests. */
export function resetGlobalErrorListenersForTest(): void {
  listenersWired = false;
}

/* ------------------------------------------------------------------ *
 * Sentry init (DSN-gated, dynamically imported, injectable)           *
 * ------------------------------------------------------------------ */

/** The tiny slice of the Sentry SDK this module uses (keeps tests dependency-free). */
export interface SentryLike {
  init(options: {
    dsn: string;
    environment: string;
    sendDefaultPii: boolean;
    tracesSampleRate: number;
    beforeSend: (event: SentryEventLike) => SentryEventLike;
    beforeBreadcrumb: (breadcrumb: { category?: string }) => { category?: string } | null;
  }): void;
  captureException(error: unknown, context?: { tags?: Record<string, string>; extra?: Record<string, unknown> }): unknown;
}

export interface InitSentryOptions {
  /** Override the DSN (defaults to import.meta.env.VITE_SENTRY_DSN). */
  dsn?: string | undefined;
  /** Override the hostname used for environment naming (defaults to location.hostname). */
  hostname?: string;
  /** Injectable SDK loader (defaults to dynamic import of @sentry/react). */
  loadSentry?: () => Promise<SentryLike>;
}

export type SentryInitResult = 'disabled' | 'initialized' | 'failed';

/**
 * Initialize Sentry when (and only when) a DSN is configured. Fire-and-forget from
 * main.tsx; never throws. Returns the outcome for tests.
 */
export async function initSentryReporting(options: InitSentryOptions = {}): Promise<SentryInitResult> {
  initGlobalErrorListeners();

  const dsn = (options.dsn ?? (import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? '').trim();
  if (dsn === '') return 'disabled';

  const hostname =
    options.hostname ?? (typeof window !== 'undefined' ? window.location.hostname : 'localhost');

  try {
    const loader = options.loadSentry ?? (async () => (await import('@sentry/react')) as unknown as SentryLike);
    const sentry = await loader();
    sentry.init({
      dsn,
      environment: deriveSentryEnvironment(hostname),
      sendDefaultPii: false,
      tracesSampleRate: 0,
      beforeSend: sanitizeSentryEvent,
      // Console breadcrumbs may embed reported context objects — drop them.
      beforeBreadcrumb: (breadcrumb) => (breadcrumb.category === 'console' ? null : breadcrumb),
    });

    setErrorReporter({
      report(event: ReportedError): void {
        // Keep the console sink (unchanged local DX), then forward to Sentry.
        consoleErrorReporter.report(event);
        sentry.captureException(event.error, {
          tags: { source: event.source },
          ...(event.context ? { extra: sanitizeErrorContext(event.context) } : {}),
        });
      },
    });
    return 'initialized';
  } catch {
    // Monitoring must never break the app — stay on the console sink.
    return 'failed';
  }
}
