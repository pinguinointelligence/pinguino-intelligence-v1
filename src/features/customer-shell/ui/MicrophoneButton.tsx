import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { focusRing, motion, radius, touch } from './tokens';

export type MicState = 'idle' | 'listening' | 'unavailable' | 'permission-denied';

const HINT: Record<MicState, string> = {
  idle: 'Tap to speak',
  listening: 'Listening…',
  unavailable: 'Voice input unavailable',
  'permission-denied': 'Microphone access blocked',
};

const SURFACE: Record<MicState, string> = {
  idle: 'bg-paper border border-ink/15 text-ink hover:border-ink/40',
  listening: 'bg-ink border border-ink text-paper',
  unavailable: 'bg-stone-100 border border-ink/10 text-stone-400',
  'permission-denied': 'bg-status-error/10 border border-status-error/40 text-status-error',
};

interface MicrophoneButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  state?: MicState;
  /** Override the accessible label; defaults to a state-appropriate description. */
  label?: string;
}

/**
 * Voice-input affordance — VISUAL STATES ONLY (no capture logic here). Renders a
 * round 56px target. `listening` pulses a calm ring; `unavailable` and
 * `permission-denied` are non-actionable and communicate why. The state is
 * conveyed by label + icon (not colour alone).
 */
export function MicrophoneButton({
  state = 'idle',
  label,
  className,
  disabled,
  ...rest
}: MicrophoneButtonProps) {
  const nonInteractive = state === 'unavailable' || state === 'permission-denied';
  const isDisabled = disabled ?? nonInteractive;
  const accessibleLabel = label ?? HINT[state];

  return (
    <button
      type="button"
      aria-label={accessibleLabel}
      aria-pressed={state === 'listening' || undefined}
      disabled={isDisabled}
      className={cn(
        'relative inline-flex items-center justify-center',
        touch.iconTarget,
        'h-14 w-14',
        radius.pill,
        SURFACE[state],
        motion.base,
        focusRing,
        !isDisabled && 'active:scale-[0.96]',
        isDisabled && 'cursor-not-allowed',
        className,
      )}
      {...rest}
    >
      {state === 'listening' ? (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full ring-2 ring-ink/25 motion-safe:animate-ping"
        />
      ) : null}
      <MicGlyph muted={state === 'unavailable' || state === 'permission-denied'} />
      <span className="sr-only">{accessibleLabel}</span>
    </button>
  );
}

function MicGlyph({ muted }: { muted: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M6 11a6 6 0 0 0 12 0M12 17v3.5M9 20.5h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {muted ? (
        <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}
