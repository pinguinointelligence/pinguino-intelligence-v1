import { cn } from '@/lib/cn';
import { color, type } from './tokens';

interface LockedGramProps {
  /** Optional short reason shown to assistive tech, e.g. "Upgrade to see exact grams". */
  hint?: string;
  className?: string;
}

/**
 * Stand-in for an exact gram value that the current plan may not see. Renders a
 * 🔒 with a muted dashed readout — decorative only, it never carries the real
 * number (redact-at-source). Pair with an upgrade affordance elsewhere.
 */
export function LockedGram({ hint = 'Locked', className }: LockedGramProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-ink/10 bg-ink/[0.03] px-2 py-0.5',
        type.numeric,
        color.textMuted,
        className,
      )}
      title={hint}
    >
      <span aria-hidden>🔒</span>
      <span aria-hidden>— — —</span>
      <span className="sr-only">{hint}</span>
    </span>
  );
}
