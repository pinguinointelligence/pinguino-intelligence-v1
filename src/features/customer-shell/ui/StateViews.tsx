import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { color, radius, type } from './tokens';

interface StateViewProps {
  title: string;
  body?: string;
  /** Optional action(s) — typically a TouchButton. */
  action?: ReactNode;
  className?: string;
}

/** Shared centred frame for empty / error states. */
function CenteredState({
  glyph,
  title,
  body,
  action,
  tone,
  live,
  className,
}: StateViewProps & { glyph: ReactNode; tone: string; live?: 'polite' | 'assertive' }) {
  return (
    <div
      role={live ? 'alert' : undefined}
      aria-live={live}
      className={cn(
        'flex flex-col items-center justify-center px-6 py-14 text-center',
        'border border-ink/10',
        radius.card,
        className,
      )}
    >
      <span className={cn('grid h-12 w-12 place-items-center rounded-full', tone)}>{glyph}</span>
      <h3 className={cn('mt-4', type.heading, color.textPrimary)}>{title}</h3>
      {body ? (
        <p className={cn('mt-2 max-w-xs', type.secondary, color.textSecondary)}>{body}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/** Nothing here yet — calm, not alarming. */
export function EmptyStateView({ title, body, action, className }: StateViewProps) {
  return (
    <CenteredState
      title={title}
      body={body}
      action={action}
      className={className}
      tone="bg-stone-100 text-stone-400"
      glyph={
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 7h16v13H4zM4 7l2-3h12l2 3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      }
    />
  );
}

/** Something went wrong — recoverable, with a retry affordance. */
export function ErrorStateView({ title, body, action, className }: StateViewProps) {
  return (
    <CenteredState
      title={title}
      body={body}
      action={action}
      className={className}
      live="assertive"
      tone="bg-status-error/10 text-status-error"
      glyph={
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 8v5M12 16.5h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      }
    />
  );
}

/** Full-panel loading indicator with an accessible label. */
export function LoadingStateView({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14 text-center', className)}
    >
      <span
        aria-hidden
        className="h-7 w-7 rounded-full border-2 border-ink/15 border-t-ink motion-safe:animate-spin"
      />
      <span className={cn(type.secondary, color.textMuted)}>{label}</span>
    </div>
  );
}
