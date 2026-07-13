import { cn } from '@/lib/cn';
import { color, type } from './tokens';

interface LockedGramProps {
  /** Short label shown next to the lock, e.g. "Ilość w Home i Pro". */
  label?: string;
  /** Optional longer reason for assistive tech (defaults to `label`). */
  hint?: string;
  className?: string;
}

/**
 * Compact stand-in for an exact gram value the current plan may not see. Renders a
 * small lock glyph + a short label (e.g. "Ilość w Home i Pro") — NOT a dashed
 * "— — —" readout that could be mistaken for a loading/error state. It never
 * carries the real number (redact-at-source). Pair with an upgrade affordance.
 */
export function LockedGram({ label = 'Home i Pro', hint, className }: LockedGramProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-ink/12 bg-ink/[0.04] px-2.5 py-1',
        type.caption,
        color.textMuted,
        className,
      )}
      title={hint ?? label}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span>{label}</span>
      {hint && hint !== label ? <span className="sr-only">{hint}</span> : null}
    </span>
  );
}
