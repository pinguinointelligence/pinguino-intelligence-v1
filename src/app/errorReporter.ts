/**
 * Pluggable error-reporting port (monitoring-readiness, provider-agnostic).
 *
 * The app has NO third-party error tracker wired yet (audit: "monitoring — none
 * beyond console"). Rather than scatter `console.error` or hard-code a vendor, all
 * unexpected runtime errors flow through this single seam. The default sink logs to
 * the console; a real provider (e.g. Sentry) can be installed at startup with
 * `setErrorReporter(...)` WITHOUT touching any call site — exactly the OcrProvider /
 * email-adapter pattern used elsewhere.
 *
 * Pure and framework-free: no React, no network, no secrets. Safe to unit-test.
 */

/** Where an error was caught, for triage (extend as new surfaces adopt the port). */
export type ErrorSource = 'react_render' | 'unhandled_rejection' | 'window_error' | 'manual';

export interface ReportedError {
  /** The thrown value, normalized to an Error. */
  error: Error;
  /** Which surface caught it. */
  source: ErrorSource;
  /** Optional structured context (component stack, route, ids — never secrets). */
  context?: Readonly<Record<string, unknown>>;
}

/** A monitoring sink. Implementations must never throw and never block. */
export interface ErrorReporter {
  report(event: ReportedError): void;
}

/** Normalize any thrown value into a real Error (thrown non-Errors are common in JS). */
export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

/** Default sink: structured console output. Never throws. */
export const consoleErrorReporter: ErrorReporter = {
  report({ error, source, context }) {
    console.error(`[pinguino:${source}]`, error.message, { stack: error.stack, ...context });
  },
};

let activeReporter: ErrorReporter = consoleErrorReporter;

/** Install a monitoring provider (e.g. Sentry adapter). Call once at startup. */
export function setErrorReporter(reporter: ErrorReporter): void {
  activeReporter = reporter;
}

/** Restore the default console sink (used by tests + provider teardown). */
export function resetErrorReporter(): void {
  activeReporter = consoleErrorReporter;
}

/**
 * Report an error through the active sink. Accepts a raw thrown value or a partial
 * event; a sink that itself throws is swallowed so reporting never breaks the caller.
 */
export function reportError(
  value: unknown,
  source: ErrorSource = 'manual',
  context?: Readonly<Record<string, unknown>>,
): void {
  const event: ReportedError = { error: toError(value), source, context };
  try {
    activeReporter.report(event);
  } catch {
    // A broken monitoring sink must never surface to the user or mask the original error.
  }
}
