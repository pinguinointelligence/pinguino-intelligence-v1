import { cn } from '@/lib/cn';
import { elevation, radius, type } from './tokens';

export type ToastTone = 'neutral' | 'success' | 'error';

const TONES: Record<ToastTone, { frame: string; glyph: string; icon: 'check' | 'alert' | 'info' }> = {
  neutral: { frame: 'bg-ink text-paper border-ink', glyph: 'text-paper/70', icon: 'info' },
  success: { frame: 'bg-ink text-paper border-ink', glyph: 'text-status-ideal', icon: 'check' },
  error: { frame: 'bg-ink text-paper border-ink', glyph: 'text-status-error', icon: 'alert' },
};

interface ToastProps {
  message: string;
  tone?: ToastTone;
  /** Optional single inline action (e.g. "Undo"). */
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Transient confirmation. High-contrast dark pill on the light surface, with an
 * accented status glyph (never colour alone). Announced politely. Positioning +
 * auto-dismiss timing are the caller's concern (presentational only).
 */
export function Toast({ message, tone = 'neutral', actionLabel, onAction, onDismiss, className }: ToastProps) {
  const t = TONES[tone];
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex w-full max-w-[520px] items-center gap-3 border px-4 py-3',
        radius.control,
        elevation.raised,
        t.frame,
        className,
      )}
    >
      <span aria-hidden className={cn('shrink-0', t.glyph)}>
        <ToastGlyph icon={t.icon} />
      </span>
      <p className={cn('min-w-0 flex-1', type.secondary)}>{message}</p>
      {actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          className={cn('shrink-0 rounded-md px-2 py-1 font-medium underline-offset-2 hover:underline', type.secondary)}
        >
          {actionLabel}
        </button>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-paper/70 hover:bg-paper/10"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

function ToastGlyph({ icon }: { icon: 'check' | 'alert' | 'info' }) {
  if (icon === 'check') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M4.5 10.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (icon === 'alert') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M10 6v5M10 14h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 9v5M10 6h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
