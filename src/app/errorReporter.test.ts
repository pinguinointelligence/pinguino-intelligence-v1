import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  consoleErrorReporter,
  reportError,
  resetErrorReporter,
  setErrorReporter,
  toError,
  type ReportedError,
} from './errorReporter';

afterEach(() => {
  resetErrorReporter();
  vi.restoreAllMocks();
});

describe('toError', () => {
  it('passes Errors through unchanged', () => {
    const e = new Error('boom');
    expect(toError(e)).toBe(e);
  });
  it('wraps strings', () => {
    expect(toError('nope').message).toBe('nope');
  });
  it('wraps non-Error objects as JSON', () => {
    expect(toError({ code: 42 }).message).toBe('{"code":42}');
  });
  it('never throws on unserializable input', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => toError(circular)).not.toThrow();
  });
});

describe('reportError seam', () => {
  it('forwards a normalized event to the active reporter', () => {
    const seen: ReportedError[] = [];
    setErrorReporter({ report: (e) => seen.push(e) });
    reportError('kaboom', 'window_error', { route: '/studio' });
    expect(seen).toHaveLength(1);
    const [event] = seen;
    expect(event?.error).toBeInstanceOf(Error);
    expect(event?.error.message).toBe('kaboom');
    expect(event?.source).toBe('window_error');
    expect(event?.context).toEqual({ route: '/studio' });
  });

  it('defaults the source to manual', () => {
    const seen: ReportedError[] = [];
    setErrorReporter({ report: (e) => seen.push(e) });
    reportError(new Error('x'));
    expect(seen[0]?.source).toBe('manual');
  });

  it('swallows a throwing sink so reporting never breaks the caller', () => {
    setErrorReporter({
      report: () => {
        throw new Error('monitoring is down');
      },
    });
    expect(() => reportError('still fine')).not.toThrow();
  });

  it('resetErrorReporter restores the console sink', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setErrorReporter({ report: () => undefined });
    resetErrorReporter();
    reportError('back to console');
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('consoleErrorReporter', () => {
  it('logs without throwing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      consoleErrorReporter.report({ error: new Error('e'), source: 'manual' }),
    ).not.toThrow();
    expect(spy).toHaveBeenCalledOnce();
  });
});
