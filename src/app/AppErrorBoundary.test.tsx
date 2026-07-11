import { renderToStaticMarkup } from 'react-dom/server';
import type { ErrorInfo, ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AppErrorBoundary,
  ErrorFallback,
  GENERIC_ERROR_MESSAGE,
} from './AppErrorBoundary';
import { reportError, resetErrorReporter, setErrorReporter, type ReportedError } from './errorReporter';

afterEach(() => resetErrorReporter());

describe('ErrorFallback', () => {
  it('renders an accessible alert with the message and a retry control', () => {
    const html = renderToStaticMarkup(
      <ErrorFallback message="Boom happened" onReset={() => undefined} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Boom happened');
    expect(html).toContain('Something went wrong');
    expect(html).toContain('Try again');
  });
});

describe('AppErrorBoundary', () => {
  it('renders children when there is no error', () => {
    const html = renderToStaticMarkup(
      <AppErrorBoundary>
        <p>healthy child</p>
      </AppErrorBoundary>,
    );
    expect(html).toContain('healthy child');
    expect(html).not.toContain('Something went wrong');
  });

  it('getDerivedStateFromError flips into the error state', () => {
    expect(AppErrorBoundary.getDerivedStateFromError()).toEqual({ hasError: true });
  });

  // Drive the class directly: componentDidCatch is a commit-phase lifecycle that does
  // NOT run during renderToStaticMarkup, so we exercise the error path by instance.
  it('renders the generic fallback (never the raw error) when in the error state', () => {
    const boundary = new AppErrorBoundary({ children: <p>hidden child</p> });
    boundary.state = { hasError: true };
    const html = renderToStaticMarkup(<>{boundary.render() as ReactNode}</>);
    expect(html).toContain(GENERIC_ERROR_MESSAGE);
    expect(html).not.toContain('hidden child');
  });

  it('routes a caught error through the reporter seam with the react_render source', () => {
    const seen: ReportedError[] = [];
    setErrorReporter({ report: (e) => seen.push(e) });
    const boundary = new AppErrorBoundary({ children: null });
    const info: ErrorInfo = { componentStack: '\n at Bomb' };
    boundary.componentDidCatch(new Error('render failure'), info);
    expect(seen).toHaveLength(1);
    const [event] = seen;
    expect(event?.source).toBe('react_render');
    expect(event?.error.message).toBe('render failure');
    expect(event?.context).toMatchObject({ componentStack: '\n at Bomb' });
  });

  it('supports a custom fallback for composition', () => {
    const boundary = new AppErrorBoundary({
      children: null,
      fallback: ({ message }) => <span>custom: {message}</span>,
    });
    boundary.state = { hasError: true };
    const html = renderToStaticMarkup(<>{boundary.render() as ReactNode}</>);
    expect(html).toContain('custom:');
    expect(html).toContain(GENERIC_ERROR_MESSAGE);
  });
});

describe('reportError is a stable shared seam', () => {
  it('is callable directly for non-React surfaces', () => {
    const seen: ReportedError[] = [];
    setErrorReporter({ report: (e) => seen.push(e) });
    reportError(new Error('rejection'), 'unhandled_rejection');
    expect(seen[0]?.source).toBe('unhandled_rejection');
  });
});
