/**
 * Top-level React error boundary. Catches render/lifecycle errors anywhere in the
 * tree, routes them through the pluggable {@link reportError} seam (so a monitoring
 * provider can be swapped in later), and shows a calm recoverable fallback instead of
 * a blank white screen. The app had NO error boundary before (audit finding).
 *
 * The class stays deliberately thin: all reusable logic (error normalization, the
 * fallback view) lives in pure/functional units so it is unit-testable without a DOM.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from './errorReporter';

export interface ErrorFallbackProps {
  /** Human-safe message (never a raw stack). */
  message: string;
  /** Reset the boundary and re-attempt rendering the subtree. */
  onReset: () => void;
}

/** Pure, DOM-free fallback surface — renderable via renderToStaticMarkup in tests. */
export function ErrorFallback({ message, onReset }: ErrorFallbackProps) {
  return (
    <div role="alert" className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm opacity-80">{message}</p>
      <button
        type="button"
        onClick={onReset}
        className="mt-6 rounded-md border px-4 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}

/** Copy shown to users; the real error is sent to the reporter, never rendered. */
export const GENERIC_ERROR_MESSAGE =
  'An unexpected error interrupted this view. You can try again — your recipe data is kept locally.';

interface AppErrorBoundaryState {
  hasError: boolean;
}

interface AppErrorBoundaryProps {
  children: ReactNode;
  /** Test seam: override the fallback (defaults to {@link ErrorFallback}). */
  fallback?: (props: ErrorFallbackProps) => ReactNode;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    reportError(error, 'react_render', { componentStack: info.componentStack });
  }

  reset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const render = this.props.fallback ?? ErrorFallback;
      return render({ message: GENERIC_ERROR_MESSAGE, onReset: this.reset });
    }
    return this.props.children;
  }
}
